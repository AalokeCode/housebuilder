"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { TourPhoto } from "@/domain/tour-model";

/** Full-screen listing-photo viewer. Photos are always labelled as actual photos. */
export function Gallery({ photos, index, roomName, onIndex, onClose }: { photos: TourPhoto[]; index: number | null; roomName: (id: string | null) => string | null; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const n = photos.length;
  const step = useCallback((d: number) => index !== null && onIndex((index + d + n) % n), [index, n, onIndex]);
  useEffect(() => {
    if (index === null) return;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, onClose, step]);
  if (index === null || !photos[index]) return null;
  const p = photos[index];
  const room = roomName(p.room);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Listing photos"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white outline-none"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm">
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Actual photo</span>
          <span className="ml-2 text-white/80">{room ?? "Listing photo"}</span>
          <span className="ml-2 tabular-nums text-white/50">
            {index + 1} / {n}
          </span>
        </p>
        <button type="button" onClick={onClose} aria-label="Close photos" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp from house:publish */}
        <img src={p.src} width={p.w} height={p.h} alt={room ? `Listing photo of the ${room.toLowerCase()}` : "Listing photo"} className="max-h-full max-w-full object-contain" />
        {n > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>
      <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {photos.map((ph, i) => (
          <button key={ph.id} type="button" onClick={() => onIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index} className={`shrink-0 overflow-hidden rounded-lg ring-2 transition-opacity ${i === index ? "ring-amber-300" : "opacity-60 ring-transparent hover:opacity-100"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.thumb} alt="" width={96} height={72} className="h-12 w-16 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
