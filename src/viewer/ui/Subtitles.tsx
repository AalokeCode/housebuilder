"use client";

import { useEffect, useMemo, useState } from "react";
import { narrator, type Caption } from "../voice/narrator";

const MAX_LINE = 42;

/** Break narration into short caption lines (≤ MAX_LINE chars, never across sentences). */
export function captionLines(text: string): [number, number][] {
  const words = [...text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
  const lines: [number, number][] = [];
  let start = -1;
  let end = 0;
  for (const [a, b] of words) {
    if (start < 0) start = a;
    else if (b - start > MAX_LINE) {
      lines.push([start, end]);
      start = a;
    }
    end = b;
    if (/[.!?]["')]?$/.test(text.slice(a, b))) {
      lines.push([start, end]);
      start = -1;
    }
  }
  if (start >= 0) lines.push([start, end]);
  return lines;
}

/** One caption line at a time, current word emphasised. */
export function Subtitles() {
  const [cap, setCap] = useState<Caption | null>(null);
  useEffect(() => narrator.subscribe(setCap), []);
  const lines = useMemo(() => (cap ? captionLines(cap.text) : []), [cap?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cap || !lines.length) return null;

  const at = cap.word?.[0] ?? 0;
  const [ls, le] = lines.find(([s, e]) => at >= s && at < e + 1) ?? lines[0];
  const [a, b] = cap.word ?? [-1, -1];
  const inLine = a >= ls && b <= le;

  return (
    <div className="pointer-events-none flex justify-center px-2" aria-live="polite">
      <p className="rounded-xl bg-black/70 px-4 py-2 text-center text-sm font-medium text-white/80 backdrop-blur sm:text-base">
        {inLine ? (
          <>
            {cap.text.slice(ls, a)}
            <span className="text-white underline decoration-amber-300/80 decoration-2 underline-offset-4">{cap.text.slice(a, b)}</span>
            {cap.text.slice(b, le)}
          </>
        ) : (
          cap.text.slice(ls, le)
        )}
      </p>
    </div>
  );
}
