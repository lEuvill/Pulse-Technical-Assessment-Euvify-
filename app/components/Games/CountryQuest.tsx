"use client";

  export default function CountryQuest({
    country, result, isHost, onPlayAgain, onClose,
  }: {
    country: { name: string } | null;
    result: "won" | "lost" | null;
    isHost: boolean;
    onPlayAgain: () => void;
    onClose: () => void;
  }) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 text-center">
        {!result && country && (
          <div className="rounded-2xl border border-white/10 bg-surface px-6 py-3 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wide text-muted">Fly to</p>
            <p className="text-2xl font-bold text-foreground">🌍 {country.name}</p>
            <p className="text-xs text-muted">Reach the ring before your rival</p>
          </div>
        )}
        {result && (
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-surface px-8 py-6 backdrop-blur-md">
            <p className="text-2xl font-bold text-foreground">
              {result === "won" ? "You reached it first! 🏆" : "Rival got there first"}
            </p>
            {country && <p className="mt-1 text-sm text-muted">It was {country.name}</p>}
            <div className="mt-4 flex justify-center gap-2">
              {isHost && (
                <button onClick={onPlayAgain} className="rounded-full bg-gradient-to-r from-cyan to-magenta px-5 py-2 text-sm font-semibold text-navy">
                  Play again
                </button>
              )}
              <button onClick={onClose} className="rounded-full border border-white/10 px-5 py-2 text-sm text-foreground">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }