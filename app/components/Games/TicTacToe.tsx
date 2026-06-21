 "use client";

  import { useEffect, useState } from "react";

  type Cell = "X" | "O" | null;

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  function getWinner(b: Cell[]): Cell | "draw" | null {
    for (const [a, c, d] of LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return b.every(Boolean) ? "draw" : null;
  }

  export default function TicTacToe({
    send,
    incoming,
    myMark,
    onClose,
  }: {
    send: (data: unknown) => void;
    incoming: unknown;
    myMark: "X" | "O";
    onClose: () => void;
  }) {
    const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
    const [turn, setTurn] = useState<"X" | "O">("X");

    // Apply the peer's synced state
    useEffect(() => {
      const m = incoming as { ttt?: { board: Cell[]; turn: "X" | "O" } } | null;
      if (m && m.ttt) {
        setBoard(m.ttt.board);
        setTurn(m.ttt.turn);
      }
    }, [incoming]);

    const win = getWinner(board);
    const myTurn = !win && turn === myMark;

    const play = (i: number) => {
      if (!myTurn || board[i]) return;
      const next = board.slice();
      next[i] = myMark;
      const nextTurn: "X" | "O" = myMark === "X" ? "O" : "X";
      setBoard(next);
      setTurn(nextTurn);
      send({ ttt: { board: next, turn: nextTurn } });
    };

    const reset = () => {
      const empty: Cell[] = Array(9).fill(null);
      setBoard(empty);
      setTurn("X");
      send({ ttt: { board: empty, turn: "X" } });
    };

    const status = win
      ? win === "draw" ? "It's a draw" : win === myMark ? "You win! 🎉" : "You lost"
      : myTurn ? "Your turn" : "Their turn…";

    return (
      <div className="absolute left-1/2 top-1/2 z-20 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-surface p-5 text-center backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Tic-Tac-Toe</span>
          <button onClick={onClose} className="text-xs text-muted hover:text-foreground">✕</button>
        </div>
        <p className="mb-3 text-xs text-muted">
          You are <b className="text-cyan">{myMark}</b> · {status}
        </p>

        <div className="mx-auto grid w-fit grid-cols-3 gap-2">
          {board.map((cell, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={!myTurn || !!cell}
              className="flex h-20 w-20 items-center justify-center rounded-xl border border-white/10 bg-void/60 text-3xl font-bold transition enabled:hover:border-cyan/50 disabled:cursor-default"
            >
              <span className={cell === "X" ? "text-cyan" : "text-magenta"}>{cell}</span>
            </button>
          ))}
        </div>

        <button
          onClick={reset}
          className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-foreground hover:border-cyan/50"
        >
          Reset
        </button>
      </div>
    );
  }