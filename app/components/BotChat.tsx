"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./ChatPanel";

export default function BotChat({
messages, onSend, onClose,
}: {
messages: ChatMessage[];
onSend: (text: string) => void;
onClose: () => void;
}) {
const [draft, setDraft] = useState("");
const endRef = useRef<HTMLDivElement>(null);
useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
}

return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-white/10 bg-void/95 text-foreground backdrop-blur-xl">
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
        <p className="font-semibold">🤖 Pulse AI</p>
        <p className="text-xs text-muted">AI companion · powered by Gemini</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">Close</button>
    </header>

    <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
        <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-cyan text-navy" : "bg-white/10 text-foreground"}`}>
            {m.text}
            </span>
        </div>
        ))}
        <div ref={endRef} />
    </div>

    <p className="px-4 pb-1 text-[10px] leading-snug text-muted/70">
        AI chat is processed by Google Gemini — not private peer-to-peer like human chats.
    </p>
    <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-3">
        <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Message Pulse AI…"
        className="flex-1 rounded-full bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-cyan"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded-full bg-gradient-to-r from-cyan to-magenta px-4 py-2 text-sm font-semibold text-navy disabled:opacity-40">
        Send
        </button>
    </form>
    </div>
);
}

