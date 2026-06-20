"use client";
import GlobePreview from "./GlobePreview";



  import { useState } from "react";

  export default function EntryGate({
    onReady,
  }: {
    onReady: (lat: number, lng: number) => void;
  }) {
    const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
    const [error, setError] = useState<string>("");

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
          <GlobePreview />

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
      </div>
    );
  }