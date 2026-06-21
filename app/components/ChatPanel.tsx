"use client";

import { useEffect, useRef, useState } from "react";



export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
  activities,
  activity,
  onInvite,
  onAcceptActivity,
  onDeclineActivity,
  onEndActivity,
  
}: {
  activities: { id: string; name: string; emoji: string; desc: string }[];
  activity:
    | { kind: "none" }
    | { kind: "inviting"; id: string }
    | { kind: "incoming"; id: string }
    | { kind: "active"; id: string };
  onInvite: (id: string) => void;
  onAcceptActivity: () => void;
  onDeclineActivity: () => void;
  onEndActivity: () => void;
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const actName = (id: string) => activities.find((a) => a.id === id)?.name ?? "activity";
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="font-semibold">Stranger</p>
          <p className="text-xs text-zinc-500">
            {connected ? "Connected" : "Connecting…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-40"
          >
            Video
          </button>
          <button
            onClick={onEnd}
            className="rounded-full bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-400"
          >
            End
          </button>
        </div>
      </header>
{/* ── Activities ───────────────────────────── */}
          {connected && activity.kind === "incoming" && (
            <div className="border-b border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <p className="mb-2 text-zinc-200">
                Stranger invites you to <b>{actName(activity.id)}</b>
              </p>
              <div className="flex gap-2">
                <button onClick={onAcceptActivity} className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-medium text-zinc-950">Join</button>
                <button onClick={onDeclineActivity} className="rounded-full bg-zinc-700 px-3 py-1 text-xs">Decline</button>
              </div>
            </div>
          )}

          {connected && activity.kind === "inviting" && (
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
              <span>Waiting for stranger to join <b>{actName(activity.id)}</b>…</span>
              <button onClick={onEndActivity} className="rounded-full bg-zinc-700 px-3 py-1 text-xs">Cancel</button>
            </div>
          )}

          {connected && activity.kind === "active" && (
            <div className="border-b border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-emerald-300">🎮 In {actName(activity.id)}</span>
                <button onClick={onEndActivity} className="rounded-full bg-red-500 px-3 py-1 text-xs text-white">End</button>
              </div>
              
            </div>
          )}

          {connected && activity.kind === "none" && (
            <div className="border-b border-zinc-800 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Do something together</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activities.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onInvite(a.id)}
                    className="flex shrink-0 flex-col items-start rounded-xl border border-zinc-700 px-3 py-2 text-left transition hover:border-emerald-400/60"
                  >
                    <span className="text-lg">{a.emoji}</span>
                    <span className="text-sm text-zinc-100">{a.name}</span>
                    <span className="text-[10px] text-zinc-500">{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-500">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.mine
                  ? "bg-emerald-400 text-zinc-950"
                  : "bg-zinc-800 text-zinc-100"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-zinc-800 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="flex-1 rounded-full bg-zinc-900 px-4 py-2 text-sm outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
