## PHASE I - Make it run

  > BUG 1 - stale dots

  - Broken: Stale dots: /api/poll heartbeat used where: {}, refreshing every user's lastSeen on each poll, so the staleness reaper never fired and dots lingered after users left. 
  - Found by: closing a tab and watching the dot persist. 
  - Fixed by: scoping the update to where: { id }.(@app\api\signal\route.ts) //I restricted the update so it only affects the row matching this id, instead of affecting everything.

  > BUG 2 - stuck busy flag

  - Broken: /api/signal cleared the busy flag on "decline" but not on "end", so after any accepted connection ended, both peers stayed busy "true" forever. Dots stayed
    dimmed and every future request was auto declined by the busy guard, making them permanently unreachable.
  - Found by: connecting two windows, hitting End, then seeing reconnection get auto-declined (a reload fixed it -> stuck busy flag).
  - Fixed by: handling "end" alongside "decline" (@app/api/signal/route.ts) // so both peers are freed (busy: false) on end.

  > BUG 3 - stuck connecting after accepting

  - Broken: in PeerSession.handleSignal, flushPendingCandidates() ran BEFORE setRemoteDescription(), so queued ICE candidates were added while remoteDescription was still null.
    they threw InvalidStateError, got swallowed by an empty catch, and were lost. Early host candidates (the ones that matter on localhost) were dropped, so ICE never completed and the call stayed stuck on "Connecting…".
  - Found by: accepting a connection and watching it never reach "Connected". logging pc.connectionState showed it stalling at "connecting" and never firing the data channel's
    onopen.
  - Fixed by: reordering to setRemoteDescription() first, then flushPendingCandidates() (@lib/webrtc.ts), so queued candidates are only added after the remote description exists.

  > BUG 4 - chat is one-way
      
  - Broken: chat rode the WebRTC data channel, but sendChat tagged messages t: "msg" while the receiver only handled t: "chat" so every incoming message was silently dropped.
    Senders saw their own messages (rendered in page.tsx), which masked the bug.
  - Found by: connecting two windows and seeing each side render only its own messages, with nothing arriving from the peer.
  - Fixed by: aligning the wire tag — sendChat now sends t: "chat" to match the receiver (@lib/webrtc.ts).

  > BUG 5 - Ghost busy dots when server is killed

  - Broken: busy was driven only by signals (accept/end). Any missed end — tab close,
    crash, dev-server restart — left busy stuck true with nothing to reconcile it, so the user stayed dimmed/unreachable.
  - Found by: a persistent dimmed dot surviving across sessions; a DB query showed a
    live, actively-polling row stuck busy: true while its client was idle.
  - Fixed by: making poll self-heal — the client reports its true call state and the
    server clears busy whenever the client is not in a call (clear-only, so it can't race the accept flow). Stuck busy now auto-corrects within one poll (~1.5s).
    (@app/api/poll/route.ts, @lib/api.ts, @app/page.tsx)

  > BUG 6 — Users stayed permanently busy after an interrupted disconnect 

    `Note: complements BUG 2 that fix made end,free both peers, but busy could still drift stuck from any missed signal (tab close, crash, server restart BUG 6 is the general safety net that reconciles it on every poll.`

  - Broken: busy was driven only by signals (accept/end). Any missed end — tab close,
    crash, dev-server restart — left busy stuck true with nothing to reconcile it, so the user stayed dimmed/unreachable.
  - Found by: a persistent dimmed dot surviving across sessions; a DB query showed a
    live, actively-polling row stuck busy: true while its client was idle.
  - Fixed by: making poll self-heal — the client reports its true call state and the
    server clears busy whenever the client is not in a call (clear-only, so it can't race,the accept flow). Stuck busy now auto-corrects within one poll (~1.5s).
    (@app/api/poll/route.ts, @lib/api.ts, @app/page.tsx)
      - - app/api/poll/route.ts — Clear busy in the heartbeat when the client reports it's not in a call; why: makes the poll the place stale busy flags self-correct, so no missed end can leave a row stuck.
      - - lib/api.ts — Add an inCall arg to poll() that appends &inCall=1; why: the client needs a way to tell the server its true connection state each poll.
      - - app/page.tsx — Compute inCall from connRef in the poll tick and pass it through; why: the page is the source of truth for whether the user is actually in a connection.

  > BUG 7 - A dropped user silently vanished and never came back

  `Note: pairs with BUG 6 together they close out the post-restart gremlins (BUG 6 = stuck busy; BUG 7 = vanished session). Re-join re-randomizes the privacy offset slightly`

  - Broken: the poll heartbeat only updated an existing row, never recreated one. If arrow was reaped during an interruption (sleep, network blip, server restart >
    STALE_MS), the client kept polling but its heartbeat matched 0 rows — so it disappeared from everyone's map with no way back until manual reload.
  - Found by: after a dev-server restart, a still-open tab no longer appeared to the other window even though it was actively polling; a DB query showed its Presence row gone.
  - Fixed by: poll now returns `present` (heartbeat row count > 0); the client re-joins itself when reaped, so a transient drop self-recovers within ~1.5s. (@app/api/poll/route.ts, @lib/types.ts, @app/page.tsx)
      - - app/api/poll/route.ts — capture the heartbeat updateMany count and return present; why: the heartbeat is the only place that knows whether the caller's row still exists.
      - - lib/types.ts — add present: boolean to PollResponse; why: the client needs that fact in the typed response to react to it.
      - - app/page.tsx — re-join when !data.present; why: the page holds the user's coordinates and is the only place that can re-assert presence.
  




  > UI BUG 1 - flex item with media has no min-h-0" bug

  - Broken: in VideoPanel, the video area used `flex-1` without `min-h-0`. A flex child defaults to min-height: auto, so once a MediaStream attached and the <video> reported its intrinsic resolution, the area grew taller than its slot and pushed the "End video" button below the viewport, where the parent's overflow-hidden clipped it — the button
    "disappeared" mid-call.
  - Found by: noticing the button was visible before the call connected but vanished once video started; DevTools showed the button still in the DOM but positioned below the visible viewport.
  - Fixed by: adding `min-h-0 overflow-hidden` to the flex-1 video container (@app/components/VideoPanel.tsx) so it shrinks to its allotted height and crops the video instead of overflowing.





## PHASE II - Make Pulse genuinely *beautiful*



  > Changes I:
    - Idea: `Aurora / Cosmic`. The product *is* "a living globe of anonymous strangers," so the design leans into that literally a real 3D globe under a deep navy-violet sky, with each person a soft-glowing point of light, like a constellation of humanity. Anonymous strangers feel less like data and more like distant stars worth reaching.
    - Principles: keep the map/globe the hero, push chrome into frosted glass so it never competes with it, use cyan + magenta glow as the only accents, and let motion (pulses, ripples, gentle drift) make the app feel alive rather than static.
    - Design foundation: introduced a cosmic palette as design tokens (void / navy / violet / cyan / magenta / frosted surface) so styling is consistent and themeable; added an ambient aurora background (twin color blooms over a navy→void gradient). Also fixed the loaded Geist font, which a hard-coded Arial. (`app/globals.css`)


  > Changes II:
    - Idea:  The product is literally "a living globe of strangers," so the map shouldn't be a flat plane — it should be an actual planet. A real globe under a glowing atmosphere makes distant strangers feel like points of light across the world, and a slow idle rotation makes it feel alive rather than static.

    - Design Structure: `app/components/WorldMap.tsx`:

      ▎Set projection: "globe" on the Mapbox Map constructor and tuned the initial camera (centered on the user at zoom 2.8).

      ▎Added atmosphere via map.setFog() on the load event — color/high-color for the navy→violet air glow, space-color for the void, and star-intensity for the starfield.
    
      ▎Implemented idle auto-rotation with a requestAnimationFrame loop that advances map.getCenter().lng by a time-based delta (DEG_PER_SEC * dt) and applies it with setCenter each frame for smooth, frame-rate-independent motion.

      ▎Gated the spin to zoom < 2.5 and paused it on user input (mousedown, touchstart, wheel,dragstart, zoomstart, rotatestart, pitchstart) with a 1.2s idle auto-resume, while deliberately ignoring move/zoom events fired by the loop's own setCenter.

      ▎Cleaned up the rAF handle on unmount and swapped the map container background to the --color-void token to avoid a flash around the globe.+

  > Changes III:

  - Idea: Availability should be readable at a glance: anyone in a conversation including you should visibly recede so the only "bright" dots are people you can actually reach.

  - Design Structure:

    ▎app/globals.css: .pulse-dot.is-busy now applies filter: grayscale(1) + reduced opacity and animation: none (was a plain dim), and hides the pulse ring; added .pulse-me.is-busy to gray the user's own radar beacon and stop its ring.

    ▎app/page.tsx: pass meBusy={conn.kind === "connecting" || conn.kind === "connected"} to WorldMap, matching the server's busy semantics.

    ▎app/components/WorldMap.tsx: accept the meBusy prop and toggle the is-busy class on the beacon element via an effect keyed on [meBusy, me, ready].

  > Changes IV:

  - Idea: The landing should prove the app is alive — not a decorative CSS orb, but the real planet slowly turning, lit by the people online right now (like city lights from orbit). A dark cosmic-violet globe with a glowing atmosphere highlight, the wordmark floating over it, makes you want to step on.

  - Changes:
    ▎app/components/GlobePreview.tsx (new): ambient, non-interactive Mapbox globe (projection: "globe") as the entry backdrop. Atmosphere via setFog (cosmic-violet space-color, violet high-color highlight, dark near-surface color for a dark planet); labels stripped by hiding all symbol layers; continuous rotation via a requestAnimationFrame loop (setCenter per frame). Polls /api/poll with a throwaway id (read-only, never joins) every 4s and renders live peers as reconciled city-light markers. Container fix: the map container is h-full w-full inside a fixed inset-0 wrapper, because Mapbox's stylesheet sets position: relative on .mapboxgl-map, which collapses a fixed-only element to the default 400×300; a ResizeObserver also waits for a non-zero container size before init to avoid a blank map on first paint.

    ▎app/components/EntryGate.tsx: replaced the CSS orb/starfield with <GlobePreview/> as a full-bleed backdrop; root set to min-h-dvh (a min-h-full chain resolved to 0 and collapsed the layout); added a full-screen space-darkness veil (fixed inset-0 radial) and a soft dark "pulse" mask behind the text to hide globe tile-load flicker and anchor the copy; gradient bg-clip-text wordmark, glowing CTA, and a shielded privacy line.

    ▎app/globals.css: added .city-light (small glowing, twinkling dot) and the optional .gate-pulse breathing animation; removed the now-unused gate orb/starfield rules.



  > Changes V:
    - Idea: Let people make the globe theirs, a quick skin selector to swap the planet between dark, satellite, neon, terrain, etc., without losing the cosmic atmosphere or live dots.
    
    - Changes:

    ▎app/components/WorldMap.tsx: added a SKINS list and a skinId state; a skin-change effect calls map.setStyle(). Since setStyle resets fog/projection, moved atmosphere into a reusable applyGlobeAtmosphere() re-run on every map.on("style.load") (projection + violet fog), with setReady left on the one-time load. Added a frosted <details> skin-selector overlay (top-left); DOM markers and the rAF spin persist across style swaps.

  > Changes VI:
    - Idea: An arrival should be felt no matter where the globe is facing. When someone comes online, a meteor strikes the always-visible "Enter Pulse" button (so you never miss a join), then a comet arcs off the button and travels to that person's actual spot on the planet delivering a new soul to Earth.
    
    - Changes:

      ▎app/components/GlobePreview.tsx: detects a genuinely-new peer in the poll loop (skips the initial batch via a firstTick flag) and fires an onArrival(lng, lat) callback (kept fresh via a ref). Exposes a live projectRef — (lng, lat) => map.project(...) — so the arc can re-project the moving target every frame as the globe spins.
      
      ▎app/components/EntryGate.tsx: handleArrival runs the two acts. Phase 1 (CSS): spawns a meteor in meteors state that streaks from a random screen edge into the button (--mx/--my/--tail vars) with a double-ring impact flash. Phase 2 (JS): after the strike (~2.5s), startArc runs a requestAnimationFrame loop that flies a comet from the button along a parabola (-sin(t·π)·ARC lift) to the live-projected user location — re-projecting each frame so it tracks the spinning globe instead of a stale point. Comets are appended to a dedicated meteorLayerRef overlay.

      ▎app/globals.css: .meteor-streak (glowing head + gradient tail, meteor-fall keyframe driven by --mx/--my/--tail, duration via --dur), .meteor-flash (meteor-impact double ring), and .meteor-arc-comet (the JS-driven arc dot).

        `Note: CSS keyframes can't follow a moving target, so the arc is JS-driven on rAF that's what makes it hug the live location and render a true arc.`





### Phase 3 — Make it secure


> Security I:
    - Idea: The whole API trusted client-asserted identity  fromId/id were taken on faith, and every online id is public (returned in the peer list). That single flaw enabled impersonation, mailbox theft, busy-griefing, and kicking people offline. Fix the root cause: prove you own the session you're acting as, while staying anonymous and stateless (no accounts).

    
    - Changes:
      ▎ - prisma/schema.prisma: added a secret field to Presence (stores a hashed session secret). It's ephemeral deleted with the row on leave/stale so it stays within the "no accounts / server holds nothing after a session ends" rules.

      ▎ - lib/session.ts (new): newSecret (256-bit random), hashSecret (SHA-256), verifySecret (constant-time compare). Uses Node crypto no external service.

      ▎ - app/api/join/route.ts: issues a secret on join, stores its hash, returns the plaintext once to the client. Re-join rotates it.

      ▎ - app/api/signal/route.ts: verifies the caller owns fromId → 403 otherwise. Stops impersonation and busy-griefing.

      ▎ - app/api/poll/route.ts: peers stay public (the map needs them), but heartbeat + mailbox drain only run with a valid secret → closes the mailbox IDOR / SDP-ICE 
      eavesdropping. Gate globe still works (its secret-less poll just gets the public peer list).

      ▎ - app/api/leave/route.ts: verifies ownership before removing a session → can't kick others offline.

      ▎ - lib/api.ts: holds the secret in a module variable and attaches it automatically (header on poll, body on signal/leave) — so page.tsx needed zero changes; it even rides along on the BUG-7 re-join.
    
`Verified by:  legitimate connect/chat/video still work (secret flows automatically); from the console, spoofed signal/leave return 403 and a secret-less poll of another id returns present:false with an empty mailbox where before the fix they'd have succeeded.`










## PHASE IV - Build something **new** that makes Pulse feel more **alive** and/or **safe**


  > Feature I:
    - Idea:  Make exploring the globe a joy, not just a pan/zoom. Toggle into a spaceship and fly the planet yourself a cinematic low-angle orbital view with the curved horizon, thrust-and-steer controls, altitude, a banking ship, and a glowing thruster trail. Turns the map into something you pilot.
    
    - Changes:

      ▎app/components/WorldMap.tsx:

        - Toggle + view: a shipMode state (synced to shipModeRef) with a "🚀 Fly the globe / Exit flight" button. Entering eases the camera into a cinematic horizon view (easeTo({ pitch: 72, zoom: 4.2 })); exiting eases back to top-down (pitch: 0, bearing: 0).

        - Flight model: disables Mapbox's built-in keyboard nav, then a requestAnimationFrame loop reads held keys — ↑/↓ panBy thrust forward/back (screen-relative, so it follows the heading toward the horizon), ←/→ setBearing to turn, W/S setZoom for ascend/descend (clamped). Ignores keys while typing in the chat input; pauses the idle auto-rotate while flying.

        - Ship sprite: a gradient SVG ship fixed at screen center, laid onto the tilted ground plane via perspective(500px) rotateX(58deg), banking left/right on turns. A thruster flame ( ship-flame) flickers constantly and flares ~1.7× on thrust via a --thrust CSS var set in the loop.

      ▎app/globals.css

        - app/globals.css: .ship-flame (driven by --thrust, scaled from the tail with transform-box: fill-box) + a ship-flicker opacity keyframe.


> Feature II:

    - Idea: A connection shouldn't be just chat + video. Give strangers a reason to stay: an in-chat "Activities" section where you can invite the other person to do something together (games, icebreakers). This isthe platform — the invite/accept handshake and UI that individual activities plug into.
    
    - Changes:

      ▎- lib/webrtc.ts: extended the peer-to-peer data channel with an activity message type — added an ActivityAction union (invite | accept | decline | end), an onActivity callback, a sendActivity(action, activity) sender, and an onmessage branch that routes t: "activity" messages. Rides the same data channel as chat/control, so it's still fully P2P (never touches the server).

      ▎- app/page.tsx: added an ACTIVITIES catalog and an activity state machine (none → inviting/incoming → active) tracked via a ref (so the WebRTC callback reads live state). Handlers mirror the video flow invite/accept/decline/end wired through startPeer's onActivity, and reset on teardown.

      ▎ - app/components/ChatPanel.tsx: an in-chat Activities section between header and messages — a "do something together" card strip when idle, plus inline banners for the incoming invite (Join/Decline), the pending invite (Cancel), and the active state (a placeholder slot + End).

  > Feature II-i`Game1`:

      - Idea: The first real activity on the platform, a live Tic-Tac-Toe two strangers play together, rendered as a card over the globe (not crammed in the chat) so it feels like a shared space. Also sets the reusable pattern every future game follows.

      Added/changes:

      ▎lib/webrtc.ts: added a generic t: "game" data-channel message (sendGame / onGame) so any game can sync arbitrary move data peer-to-peer (never touches the server).

      ▎app/components/Games/TicTacToe.tsx (new): self-contained game — board/turn state, win/draw detection, cosmic card centered over the map. Syncs by broadcasting the whole board + turn each move (idempotent → can't desync), namespaced under ttt so it ignores other games' messages. Props: { send, incoming, myMark, onClose }.

      ▎app/page.tsx: routes onGame into gameMsg state, assigns marks (inviter = X, accepter = O), and renders <TicTacToe> over the map when the active activity is ttt.

      ▎pp/components/ChatPanel.tsx: the active-activity banner now shows just the "🎮 In Tic-Tac-Toe · End" status (placeholder slot removed, since the game lives over the map).

  > Feature II-ii`Game2-Highlighted`:

      - Idea: A second activity that fuses the platform with the spaceship: both strangers get the same random country, drop into locked flight, and the first to fly their ship into that country's beacon wins. It turns the globe + ship into the game board and it's promoted as the featured "latest game" so people notice it.

      Added/changes:

      ▎app/page.tsx: added a COUNTRIES catalog + quest state (targetCountry, questResult). The host (inviter) rolls a random country and broadcasts it over the game channel so both share the same target; onGame dispatches country / countryWin. First to reach sends countryWin; the other shows "lost". Renders <CountryQuest> and feeds target / onReachTarget to WorldMap. Also tagged the quest featured in the activity catalog.

      ▎app/components/Games/CountryQuest.tsx (new): the quest HUD — a "Fly to: X" banner plus the win/lose result with host-only "Play again".

      ▎app/components/WorldMap.tsx: when a target is set it forces ship mode, locks zoom (fixed altitude; scroll-zoom + W/S disabled) and hides the exit toggle, committing you to flight until you reach it. Renders a beacon (light beam) at the country that's hidden until you're within range (great-circle distance), and wins when the ship (screen center) touches the beacon (projected screen distance < ~40 px) — reliable because the beacon only projects while on the near side.

      ▎app/components/ChatPanel.tsx: activities section now splits on a featured flag — featured games render as a prominent gradient card with a glowing border + "New" badge above the regular strip.

      ▎app/globals.css: .quest-beacon (glowing base + pulsing light beam) and its keyframe.





