"use client";
import GlobePreview from "./GlobePreview";



import { useRef, useState, type CSSProperties } from "react";

  export default function EntryGate({
    onReady,
  }: {
    onReady: (lat: number, lng: number) => void;
  }) {
    
    const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
    const [error, setError] = useState<string>("");
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [meteors, setMeteors] = useState<
      { id: number; tx: number; ty: number; mx: number; my: number; tail: number }[]
    >([]);
    const meteorId = useRef(0);
    const projectRef = useRef<((lng: number, lat: number) => { x: number; y: number }) |
  null>(null);
    const meteorLayerRef = useRef<HTMLDivElement>(null);

    const startArc = (bx: number, by: number, lng: number, lat: number) => {
      const layer = meteorLayerRef.current;
      const project = projectRef.current;
      if (!layer || !project) return;
      const comet = document.createElement("div");
      comet.className = "meteor-arc-comet";
      layer.appendChild(comet);
      const DURATION = 2200; // extend the arc here
      const ARC = 220;       // arc height here
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / DURATION);
        const end = project(lng, lat); // LIVE location, re-projected each frame
        const x = bx + (end.x - bx) * t;
        const y = by + (end.y - by) * t - Math.sin(t * Math.PI) * ARC; // upward arc
        comet.style.transform = `translate(${x}px, ${y}px)`;
        comet.style.opacity =
          t < 0.12 ? String(t / 0.12) : t > 0.88 ? String((1 - t) / 0.12) : "1";
        if (t < 1) requestAnimationFrame(step);
        else comet.remove();
      };
      requestAnimationFrame(step);
    };

    const handleArrival = (lng: number, lat: number) => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const bx = r.left + r.width / 2;
      const by = r.top + r.height / 2;
      // Phase 1: CSS meteor from a random edge to the button
      const angle = Math.random() * Math.PI * 2;
      const dist = 600 + Math.random() * 400;
      const id = meteorId.current++;
      setMeteors((m) => [
        ...m,
        { id, tx: bx, ty: by, mx: Math.cos(angle) * dist, my: Math.sin(angle) * dist, tail: (angle
  * 180) / Math.PI },
      ]);
      setTimeout(() => setMeteors((m) => m.filter((x) => x.id !== id)), 3000);
      // Phase 2: JS arc from button to the LIVE location, after phase 1 lands (~2.5s)
      window.setTimeout(() => startArc(bx, by, lng, lat), 2500);
    };
    function enter() {
      if (!("geolocation" in navigator)) {
        setStatus("error");
        setError("Your browser doesn't support location access.");
        return;
      }
      setStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => onReady(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          setStatus("error");
          setError(
            err.code === err.PERMISSION_DENIED
              ? "Location permission is required to place you on the map."
              : "Couldn't get your location. Please try again.",
          );
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    }

    return (
        <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center">
          {/* Live, rotating globe of people online right now */}
          <GlobePreview onArrival={handleArrival} projectRef={projectRef} />

        {/* Scrim so text stays legible over the globe */
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(5,6,15,0.62) 20%, rgba(5,6,15,0.42) 55%,rgba(11, 5, 15, 0.55) 100%)",
          }}
        />
        
}
        
        {/* Content (wordmark / tagline / button / footer — unchanged) */}
        <div className="gate-enter relative z-10 flex flex-col items-center gap-7">
          <h1 className="bg-gradient-to-r from-cyan via-foreground to-magenta bg-clip-text text-9xl
  font-semibold tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(79,227,255,0.35)]">
            Pulse
          </h1>

          <p className="max-w-sm text-balance text-lg text-muted">
            A living globe of anonymous strangers. One tap, and you&rsquo;re
            talking to someone, somewhere.
          </p>

          <button
              ref={buttonRef}
              onClick={enter}
            disabled={status === "locating"}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan
  to-magenta px-20 py-5 font-semibold text-navy shadow-[0_0_30px_-4px_rgba(79,227,255,0.55)]
  transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_45px_-2px_rgba(79,227,255,0.7)]
  disabled:translate-y-0 disabled:opacity-60"
          >
            {status === "locating" ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy/30
  border-t-navy" />
                Locating…
              </>
            ) : (
              "Enter Pulse"
            )}
          </button>

          {status === "error" && (
            <p className="max-w-sm text-sm text-red-300">{error}</p>
          )}

          <p className="mt-4 flex max-w-xs items-start gap-2 text-left text-xs leading-relaxed text-muted/70">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.96 11.96
  0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62
  0-1.31-.21-2.57-.6-3.75h-.15c-3.2 0-6.1-1.25-8.25-3.29Z" />
              </svg>
               
              <span>No sign-up. Your dot is placed 1–3&nbsp;km from your real location. Nothing is stored — closing
  the tab ends everything.</span>
            </p>
        </div>
        {meteors.map((m) => (
            <div
              key={m.id}
              aria-hidden
              className="pointer-events-none fixed z-30"
              style={{
                left: m.tx, top: m.ty,
                "--mx": `${m.mx}px`, "--my": `${m.my}px`, "--tail": `${m.tail}deg`,
              } as CSSProperties}
            >
              <span className="meteor-streak" />
              <span className="meteor-flash" />
            </div>
          ))}
          {/* JS-driven arc comets render here */}
          <div ref={meteorLayerRef} aria-hidden className="pointer-events-none fixed inset-0 z-30"
  />
      </div>
    );
  }
  