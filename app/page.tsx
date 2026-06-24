"use client";
import TicTacToe from "./components/Games/TicTacToe";
import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal, askBot } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";
import type { ActivityAction } from "@/lib/webrtc";
import BotChat from "./components/BotChat";
import CountryQuest from "./components/Games/CountryQuest";
import { applyPrivacyOffset } from "@/lib/geo";

  const ACTIVITIES = [
    { id: "country", name: "Find the Country", emoji: "🌍", desc: "Race to fly there", featured: true },
    { id: "ttt",    name: "Tic-Tac-Toe",      emoji: "⭕", desc: "Quick game" },
    { id: "wyr",    name: "Would You Rather", emoji: "🤔", desc: "Icebreaker",     soon: true },
    { id: "20q",    name: "20 Questions",     emoji: "❓", desc: "Guessing game",  soon: true },
    { id: "doodle", name: "Doodle Together",  emoji: "🎨", desc: "Shared canvas",  soon: true },
  ];

type Activity =
  | { kind: "none" }
  | { kind: "inviting"; id: string }
  | { kind: "incoming"; id: string }
  | { kind: "active"; id: string };



type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [botPos, setBotPos] = useState<{ lat: number; lng: number } | null>(null);
  const BOT_ENABLED = process.env.NEXT_PUBLIC_BOT_ENABLED === "true";
  const [gameMsg, setGameMsg] = useState<unknown>(null);
  const [myMark, setMyMark] = useState<"X" | "O">("X");
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const COUNTRIES = [
  { name: "Japan", lat: 36, lng: 138 }, { name: "Brazil", lat: -10, lng: -55 },
  { name: "Egypt", lat: 26, lng: 30 }, { name: "Australia", lat: -25, lng: 133 },
  { name: "Canada", lat: 56, lng: -106 }, { name: "India", lat: 22, lng: 79 },
  { name: "France", lat: 46, lng: 2 }, { name: "USA", lat: 39, lng: -98 },
  { name: "Nigeria", lat: 9, lng: 8 }, { name: "Argentina", lat: -38, lng: -63 },
  { name: "China", lat: 35, lng: 103 }, { name: "Italy", lat: 42, lng: 12 },
  { name: "Norway", lat: 62, lng: 10 }, { name: "Indonesia", lat: -2, lng: 118 },
  { name: "South Africa", lat: -30, lng: 25 }, { name: "Mexico", lat: 23, lng: -102 },
    ];
  const [targetCountry, setTargetCountry] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [questResult, setQuestResult] = useState<"won" | "lost" | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null,);

  const [activity, _setActivity] = useState<Activity>({ kind: "none" });
  const activityRef = useRef<Activity>(activity);
  const setActivity = (a: Activity) => { activityRef.current = a; _setActivity(a); };

  const [botOpen, setBotOpen] = useState(false);
  const [botMessages, setBotMessages] = useState<ChatMessage[]>([]);
  const botMsgId = useRef(0);

 function openBot() {
      setBotOpen(true);
      if (botMessages.length === 0) {
        setBotMessages([{ id: botMsgId.current++, mine: false, text: "Hey! I'm Pulse AI 👋 The globe's quiet right now — want to chat?" }]);
      }
    }
     async function sendToBot(text: string) {
        const userMsg = { id: botMsgId.current++, mine: true, text };
        const history = [...botMessages, userMsg];
        setBotMessages(history);
        try {
          const reply = await askBot(
            history.map((m) => ({ role: m.mine ? ("user" as const) : ("model" as const), text: m.text })),
            botPos ?? undefined,
          );
          setBotMessages((prev) => [...prev, { id: botMsgId.current++, mine: false, text: reply }]); 
        } catch {
          setBotMessages((prev) => [...prev, { id: botMsgId.current++, mine: false, text: "(Pulse AI is offline right now.)" }]);
        }
      }

  function handleActivity(action: ActivityAction, id: string) {
      switch (action) {
        case "invite":
          if (activityRef.current.kind === "none") setActivity({ kind: "incoming", id });
          else peerRef.current?.sendActivity("decline", id);
          break;
        case "accept":
          if (activityRef.current.kind === "inviting" && activityRef.current.id === id)
            setActivity({ kind: "active", id });
          break;
        case "decline":
          if (activityRef.current.kind === "inviting") { setActivity({ kind: "none" }); showNotice("Activity declined."); }
          break;
        case "end":
          if (activityRef.current.kind !== "none") setActivity({ kind: "none" });
          break;
      }
    }
    function inviteActivity(id: string) {
      setMyMark("X");
      if (activityRef.current.kind !== "none" || !peerRef.current) return;
      setActivity({ kind: "inviting", id });
      peerRef.current.sendActivity("invite", id);
    }
    function acceptActivity() {
      setMyMark("O");
      const a = activityRef.current;
      if (a.kind !== "incoming" || !peerRef.current) return;
      peerRef.current.sendActivity("accept", a.id);
      setActivity({ kind: "active", id: a.id });
    }
    function declineActivity() {
      const a = activityRef.current;
      if (a.kind !== "incoming") return;
      peerRef.current?.sendActivity("decline", a.id);
      setActivity({ kind: "none" });
    }
    function endActivity() { // also used to cancel an invite
      const a = activityRef.current;
      if (a.kind === "none") return;
      peerRef.current?.sendActivity("end", a.id);
      setActivity({ kind: "none" });
      setGameMsg(null);
      setTargetCountry(null);
      setQuestResult(null);
    }


  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActivity({ kind: "none" });
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
    setGameMsg(null);
    setTargetCountry(null);
    setQuestResult(null);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onGame: (data) => {
          setGameMsg(data);
          const d = data as { country?: { name: string; lat: number; lng: number }; countryWin?: boolean };
          if (d?.country) { setTargetCountry(d.country); setQuestResult(null); }
          else if (d?.countryWin) setQuestResult((r) => r ?? "lost");
        },
      onActivity: (action, id) => handleActivity(action, id),
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const c = connRef.current;
        const inCall = c.kind === "connecting" || c.kind === "connected";
        const data = await poll(sessionId, inCall);
        if (!active) return;
        // Self-heal: if our row was reaped during an interruption, re-join so
        // we reappear to others instead of silently dropping off the map.
        if (!data.present && myLocation) {
            await join(sessionId, myLocation.lat, myLocation.lng);
          }
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId, myLocation]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

   useEffect(() => {
      if (activity.kind === "active" && activity.id === "country" && myMark === "X" && !targetCountry) {
        const c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
        setTargetCountry(c);
        setQuestResult(null);
        peerRef.current?.sendGame({ country: c });
      }
    }, [activity, myMark, targetCountry]);

  function handleReachTarget() {
      if (questResult) return;
      setQuestResult("won");
      peerRef.current?.sendGame({ countryWin: true });
    }
  function newCountry() {
    const c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    setTargetCountry(c);
    setQuestResult(null);
    peerRef.current?.sendGame({ country: c });
  }

  async function handleReady(lat: number, lng: number) {
    setMyLocation({ lat, lng });
    setBotPos(applyPrivacyOffset(lat, lng));
    await join(sessionId, lat, lng);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  return (
    <main className="fixed inset-0 overflow-hidden">
      {botOpen && (
          <BotChat messages={botMessages} onSend={sendToBot} onClose={() => setBotOpen(false)} />
        )}
      {activity.kind === "active" && activity.id === "ttt" && (
          <TicTacToe
            send={(d) => peerRef.current?.sendGame(d)}
            incoming={gameMsg}
            myMark={myMark}
            onClose={endActivity}
          />
        )}
        {activity.kind === "active" && activity.id === "country" && (
          <CountryQuest
            country={targetCountry}
            result={questResult}
            isHost={myMark === "X"}
            onPlayAgain={newCountry}
            onClose={endActivity}
          />
        )}
      <WorldMap
        showBot={BOT_ENABLED && conn.kind === "idle" && !botOpen}
        onBotClick={openBot}
        botPos={botPos}
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
        meBusy={conn.kind === "connecting" || conn.kind === "connected"}
        target={activity.kind === "active" && activity.id === "country" ? targetCountry : null}
          onReachTarget={handleReachTarget}
      />

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          <span>Requesting connection…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          activities={ACTIVITIES}
          activity={activity}
          onInvite={inviteActivity}
          onAcceptActivity={acceptActivity}
          onDeclineActivity={declineActivity}
          onEndActivity={endActivity}
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
