// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

let sessionSecret: string | null = null;

  export async function join(id: string, lat: number, lng: number): Promise<void> {
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, lat, lng }),
    });
    try { const data = await res.json(); if (data?.secret) sessionSecret = data.secret; } catch {}
  }

  export async function poll(id: string, inCall = false): Promise<PollResponse> {
    const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}${inCall ? "&inCall=1" : ""}`, {
      cache: "no-store",
      headers: sessionSecret ? { "x-pulse-secret": sessionSecret } : undefined,
    });
    if (!res.ok) throw new Error(`poll failed: ${res.status}`);
    return res.json();
  }

  export async function sendSignal(fromId: string, toId: string, type: SignalType, payload?: string): Promise<void> {
    await fetch("/api/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId, toId, type, payload, secret: sessionSecret }),
    });
  }

  export function leave(id: string): void {
    const body = JSON.stringify({ id, secret: sessionSecret });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/leave", body);
    } else {
      void fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  }

  // ── Bot throttle: queue requests, space ~12.5/min, back off on 429 ──
  const BOT_MIN_INTERVAL = 4800; // ms between calls → ~12.5 req/min (headroom under the 15 free-tier cap)
  const BOT_MAX_RETRIES = 3;
  let botLastCall = 0;
  let botQueue: Promise<unknown> = Promise.resolve();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function callBot(
    messages: { role: "user" | "model"; text: string }[],
    location?: { lat: number; lng: number },
  ): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      // pace: ensure at least BOT_MIN_INTERVAL since the last call
      const wait = BOT_MIN_INTERVAL - (Date.now() - botLastCall);
      if (wait > 0) await sleep(wait);
      botLastCall = Date.now();

      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, location }),
      });

      if (res.status === 429 && attempt < BOT_MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt); // exponential backoff: 1s, 2s, 4s
        continue;
      }
      if (!res.ok) throw new Error(`bot ${res.status}`);
      const data = await res.json();
      return (data?.reply as string) ?? "…";
    }
  }

  export function askBot(
    messages: { role: "user" | "model"; text: string }[],
    location?: { lat: number; lng: number },
  ): Promise<string> {
    // Serialize: one request at a time, in order — never a parallel burst
    const result = botQueue.then(() => callBot(messages, location));
    botQueue = result.then(() => {}, () => {}); // keep the chain alive after success or failure
    return result;
  }