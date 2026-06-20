## PHASE I

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


> UI BUG 1 - flex item with media has no min-h-0" bug

 - Broken: in VideoPanel, the video area used `flex-1` without `min-h-0`. A flex child defaults to min-height: auto, so once a MediaStream attached and the <video> reported its intrinsic resolution, the area grew taller than its slot and pushed the "End video" button below the viewport, where the parent's overflow-hidden clipped it — the button
  "disappeared" mid-call.
 - Found by: noticing the button was visible before the call connected but vanished once video started; DevTools showed the button still in the DOM but positioned below the visible viewport.
 - Fixed by: adding `min-h-0 overflow-hidden` to the flex-1 video container (@app/components/VideoPanel.tsx) so it shrinks to its allotted height and crops the video instead of overflowing.