## Phase 1 — Make it run

**Bug 1 — Stale dots never disappeared** (`app/api/poll/route.ts`)
- Broken: the heartbeat used `updateMany({ where: {} })`, refreshing *every* user's `lastSeen` on each poll, so the staleness reaper never fired and dots lingered after people left.
- Found by: closing a tab and watching the dot persist on the other window.
- Fixed by: scoping the heartbeat to `where: { id }` — a poll only refreshes its own row.

**Bug 2 — Users could connect once, then became unreachable** (`app/api/signal/route.ts`)
- Broken: `busy` was cleared on `decline` but not on `end`, so after any connection ended both peers stayed `busy: true` forever — dimmed and auto-declined on every future request.
- Found by: connecting two windows, hitting End, then seeing reconnection get auto-declined (a reload fixed it → stuck flag).
- Fixed by: handling `end` alongside `decline` so both peers are freed.

**Bug 3 — Stuck on "Connecting…" forever** (`lib/webrtc.ts`)
- Broken: `flushPendingCandidates()` ran *before* `setRemoteDescription()`, so queued ICE candidates were added while `remoteDescription` was null → `InvalidStateError`, swallowed by an empty catch, candidates lost. ICE never completed.
- Found by: accepting a connection that never reached "Connected"; logging `pc.connectionState` showed it stalling at "connecting".
- Fixed by: `setRemoteDescription()` first, then `flushPendingCandidates()`.

**Bug 4 — Chat was one-way** (`lib/webrtc.ts`)
- Broken: `sendChat` tagged messages `t: "msg"` but the receiver only handled `t: "chat"`, so every incoming message was silently dropped (senders saw their own, masking it).
- Found by: two windows — each side rendered only its own messages.
- Fixed by: aligning the wire tag — `sendChat` sends `t: "chat"`.

**Bug 5 — `busy` could drift permanently stuck** (`app/api/poll/route.ts`, `lib/api.ts`, `app/page.tsx`)
- Broken: `busy` was driven only by signals (accept/end). Any *missed* `end` (tab close, crash, dev-server restart) left it stuck `true` with nothing to reconcile it.
- Found by: a persistent dimmed dot; a DB query showed a live, actively-polling row stuck `busy: true` while its client was idle.
- Fixed by: poll self-heals — the client reports its true call state (`inCall`) and the server clears `busy` whenever the client isn't in a call (clear-only, so it can't race the accept flow).

**Bug 6 — A dropped user silently vanished and never came back** (`app/api/poll/route.ts`, `lib/types.ts`, `app/page.tsx`)
- Broken: the heartbeat only *updated* an existing row, never recreated one. If a row was reaped during an interruption (sleep/blip/restart > `STALE_MS`), the client kept polling but matched 0 rows — gone from everyone's map until manual reload.
- Found by: after a dev-server restart, a still-open tab no longer appeared to the other window; a DB query showed its row gone.
- Fixed by: poll returns `present` (row exists); the client re-joins itself when reaped, so a transient drop self-recovers within ~1.5s.

**Bug 7 (UI) — "End video" button vanished mid-call** (`app/components/VideoPanel.tsx`)
- Broken: the video area used `flex-1` without `min-h-0`. A flex child defaults to `min-height: auto`, so once a stream attached and `<video>` reported its intrinsic resolution, the area grew past its slot and pushed the button below the viewport, where `overflow-hidden` clipped it.
- Found by: button visible before the call, gone once video started; DevTools showed it in the DOM but below the viewport.
- Fixed by: `min-h-0 overflow-hidden` on the video flex child so it crops the video instead of overflowing.

---

## Phase 2 — Make it good (Aurora / Cosmic)

**Idea:** The product *is* "a living globe of anonymous strangers," so the design takes it literally — a real 3D globe under a deep navy-violet sky, each person a soft point of light. Keep the globe the hero, push chrome into frosted glass, cyan+magenta as the only accents, motion to feel alive.

- **Design foundation** (`app/globals.css`): cosmic palette as `@theme` tokens (void/navy/violet/cyan/magenta/surface) + ambient aurora background. Also fixed a hard-coded Arial fallback that was silently overriding the loaded Geist font.
- **The globe** (`app/components/WorldMap.tsx`): `projection: "globe"` + `setFog` (violet space/atmosphere/stars) + a smooth rAF idle auto-spin that only runs when zoomed out and pauses on interaction.
- **Constellation dots** (`globals.css`, `WorldMap.tsx`, `page.tsx`): glowing twinkling peer dots, a radar "you are here" beacon (replaced the 📍 emoji), and a grayed-out busy state shown everywhere — including your own beacon when you're connected.
- **Entry-gate hero** (`GlobePreview.tsx` new, `EntryGate.tsx`, `globals.css`): the landing is a live rotating globe lit by the people online right now (real peers as "city lights", read-only poll). When someone joins, an **arrival meteor** streaks from a random edge to the Enter Pulse button, then arcs to that user's live globe location.
- **Skin selector** (`WorldMap.tsx`): a frosted dropdown that swaps the Mapbox style via `setStyle`; fog/projection are re-applied on `style.load` (setStyle resets them) and DOM markers/spin persist.

---

## Phase 3 — Make it secure

**Review:** the whole API trusted client-asserted identity (`fromId`/`id` taken on faith), and every online id is **public** (returned in the peer list). That one flaw enabled most attacks.

**Issues found (ranked):**
1. **Identity spoofing** — anyone could send signals as any user, or `POST /api/leave` to kick anyone offline.
2. **Mailbox IDOR / eavesdropping** — `GET /api/poll?id=<victim>` read *and deleted* another user's signals (their WebRTC SDP/ICE).
3. **Busy-griefing** — a spoofed `accept` could mark any two users `busy`, locking them out.
4. **No rate limiting** — unauthenticated + unthrottled → fake-dot flooding / DB-exhaustion DoS.
5. **Raw coordinates reach the server** — the client sends exact GPS; the offset is applied server-side (privacy gap).
6. **SDP/ICE contain IPs** — stored transiently in the mailbox (PII).

**Fixed — ephemeral session-secret auth** (closes #1–#3 + the leave-kick):
- `prisma/schema.prisma`: a `secret` field on `Presence` (hashed). Ephemeral — deleted with the row, so it stays within the no-accounts / stateless rules.
- `lib/session.ts` (new): `newSecret` (256-bit), `hashSecret` (SHA-256), `verifySecret` (constant-time). Node `crypto`, no external service.
- `app/api/join`: issues the secret, stores its hash, returns it once (re-join rotates it).
- `app/api/signal`: verifies the caller owns `fromId` → 403 otherwise (stops impersonation + busy-griefing).
- `app/api/poll`: peers stay public (the map needs them), but heartbeat + mailbox drain run only with a valid secret → closes the IDOR.
- `app/api/leave`: verifies ownership before removing a session.
- `lib/api.ts`: holds the secret in a module variable and attaches it automatically (header on poll, body on signal/leave) — `page.tsx` needed no changes.
- **Verified:** legitimate connect/chat/video still work; from the console, spoofed `signal`/`leave` return **403** and a secret-less `poll` of another id returns `present:false` with an empty mailbox.

**Documented, not fixed (trade-offs):**
- **Rate limiting (#4):** robust serverless rate limiting needs a shared store (e.g. Redis), which the "no external services" rule precludes — would relax that constraint in production.
- **SDP/ICE IPs (#6):** unavoidable for WebRTC signaling over HTTP polling; mitigated by drain-on-read, the `SIGNAL_TTL_MS` expiry, and the new mailbox auth.
- **Client-side offset (#5):** would move `applyPrivacyOffset` to the client so raw coords never leave the device (identified, not yet done).

---

## Phase 4 — Make it better

**Spaceship flight mode** (`app/components/WorldMap.tsx`, `globals.css`)
- Idea: make exploring the globe something you *pilot*, not just pan/zoom.
- A toggle eases the camera into a cinematic low-angle horizon view; a rAF loop reads held keys — ↑/↓ thrust (screen-relative `panBy`), ←/→ turn (`setBearing`), W/S altitude (`setZoom`). The SVG ship is laid onto the tilted ground plane (`perspective` + `rotateX`), banks on turns, and has a thruster flame that flares on thrust. Ignores keys while typing; pauses idle spin while flying.

**Activities platform** (`lib/webrtc.ts`, `app/page.tsx`, `app/components/ChatPanel.tsx`)
- Idea: give strangers a reason to stay — invite each other to do something together.
- Extended the data channel with an `activity` message (`sendActivity`/`onActivity`, invite/accept/decline/end). A state machine in `page.tsx` (none → inviting/incoming → active) mirrors the video flow. In-chat "do something together" strip, with a featured "latest game" card.

**Tic-Tac-Toe** (`app/components/Games/TicTacToe.tsx` new, `lib/webrtc.ts`, `app/page.tsx`)
- A generic `game` data-channel message (`sendGame`/`onGame`) lets any game sync moves P2P. TTT renders as a card over the globe and syncs the whole board+turn each move (idempotent → can't desync). Inviter = X, accepter = O.

**Find the Country** (featured) (`app/components/Games/CountryQuest.tsx` new, `app/components/WorldMap.tsx`, `app/page.tsx`, `globals.css`)
- A race: the host broadcasts a random country; both are forced into ship mode (zoom locked, exit hidden); a beacon appears once you're within range (great-circle distance), and the first to fly their ship onto it (screen-center within ~40px of the beacon) wins.

**Pulse AI companion** (`app/api/bot/route.ts` new, `lib/api.ts`, `app/components/BotChat.tsx` new, `app/components/WorldMap.tsx`, `app/page.tsx`, `globals.css`)
- Idea: the globe is often empty — an optional AI companion 1–3 km away (like a real peer) so there's always someone to talk to, and it's location-aware for local flavor.
- Server-side Gemini proxy (key stays server-only; builds a location-aware prompt; strips leading non-user turns; degrades gracefully if no key). `askBot` throttles client-side (serial queue, ~12.5/min, exponential backoff on 429). A distinct 🤖 dot at a 1–3 km offset; the chat panel clearly labels it as AI (server-mediated, not P2P) and notes the blurred area is shared.
- **Trade-offs:** optional external dependency that degrades gracefully (keeps "no external services *required*"); the one server-mediated, non-P2P chat (transparent, unstored); throttling is client-side for now.
