"use client";

  import { useState } from "react";

  function dotColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return `hsl(${180 + (Math.abs(h) % 140)}, 85%, 66%)`; // matches the map dot colors
  }

  export default function RequestInbox({
    requests, onAccept, onDecline,
  }: {
    requests: string[];
    onAccept: (id: string) => void;
    onDecline: (id: string) => void;
  }) {
    const [open, setOpen] = useState(true);
    if (requests.length === 0) return null;

    return (
      <div className="absolute right-4 top-4 z-30 w-64">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-full border border-white/10 bg-surface px-4 py-2 text-sm text-foreground backdrop-blur-md"
        >
          <span>📨 Requests</span>
          <span className="rounded-full bg-gradient-to-r from-cyan to-magenta px-2 py-0.5 text-xs font-bold text-navy">
            {requests.length}
          </span>
        </button>

        {open && (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-white/10 bg-surface p-2 backdrop-blur-md">
            {requests.map((id) => (
              <div key={id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dotColor(id) }} />
                <span className="flex-1 text-xs text-muted">A stranger wants to connect</span>
                <button onClick={() => onAccept(id)} className="rounded-full bg-emerald-400 px-2.5 py-1 text-xs font-medium text-zinc-950">
                  Accept
                </button>
                <button onClick={() => onDecline(id)} className="rounded-full bg-white/10 px-2.5 py-1 text-xs" aria-label="Decline">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }