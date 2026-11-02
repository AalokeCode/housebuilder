"use client";

import { Camera, ChevronRight, Share2 } from "lucide-react";
import type { CompiledHouse } from "@/domain/compiled";
import { roomInfos, tourFacts, type TourPhoto } from "@/domain/tour-model";

export function FactsRow({ house, className = "" }: { house: CompiledHouse; className?: string }) {
  const f = tourFacts(house);
  const items = [
    f.bedrooms ? `${f.bedrooms} bed${f.bedrooms > 1 ? "s" : ""}` : "Studio",
    f.bathrooms ? `${f.bathrooms} bath${f.bathrooms > 1 ? "s" : ""}` : null,
    `≈ ${Math.round(f.interiorArea)} m² inside`,
    f.outdoorArea ? `≈ ${Math.round(f.outdoorArea)} m² balcony` : null,
  ].filter(Boolean);
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 text-sm ${className}`}>
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden className="size-1 rounded-full bg-current opacity-40" />}
          {t}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  house: CompiledHouse;
  photos: TourPhoto[];
  current?: string | null;
  onRoom?: (id: string) => void;
  onPhoto?: (index: number) => void;
  onShare?: () => void;
  onAllDetails?: () => void;
  revision?: string;
}

/** Rooms with evidence labels, model provenance and the narration transcript. Dark surface. */
export function TourDetails({ house, photos, current, onRoom, onPhoto, onShare, onAllDetails, revision }: Props) {
  const rooms = roomInfos(house);
  const f = tourFacts(house);
  const lines = rooms.filter((r) => house.narration[r.id]);
  return (
    <div className="space-y-7 text-white">
      <section aria-labelledby="rooms-h">
        <h3 id="rooms-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Rooms
        </h3>
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
          {rooms.map((r) => {
            const photo = photos.find((p) => p.id === r.photos[0]);
            const body = (
              <>
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-white/10">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.thumb} alt="" width={96} height={96} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[10px] text-white/40">no photo</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                    ≈ {r.area} m²
                    {r.photos.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold text-emerald-300">
                        <Camera className="size-3" /> Photographed
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-300/15 px-1.5 py-px text-[10px] font-semibold text-amber-200">Not photographed</span>
                    )}
                    {r.est && <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-medium text-white/70">Size estimated</span>}
                  </span>
                </span>
                {onRoom && r.hotspot && <ChevronRight className="size-4 shrink-0 text-white/40" />}
              </>
            );
            return (
              <li key={r.id}>
                {onRoom && r.hotspot ? (
                  <button
                    type="button"
                    onClick={() => onRoom(r.id)}
                    aria-current={r.id === current}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none ${r.id === current ? "bg-white/10" : ""}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {onPhoto && photos.length > 0 && (
        <section aria-labelledby="photos-h">
          <h3 id="photos-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
            Actual photos
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onPhoto(i)} className="overflow-hidden rounded-xl ring-1 ring-white/10 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label={`Open photo ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" width={240} height={180} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="about-h">
        <h3 id="about-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          About this 3D model
        </h3>
        <div className="space-y-2 text-sm leading-relaxed text-white/75">
          <p>
            A <strong className="font-semibold text-white">3D reconstruction</strong> made from {house.sources.join(" + ")} — not a measured survey. Furniture is staged to match the listing
            photos.
          </p>
          {f.estimated && <p>Room sizes are estimated from the photos; areas shown are approximate. Rooms marked “Not photographed” are inferred and may differ in reality.</p>}
          <p className="text-xs text-white/50">
            {house.meta.reviewed ? `Reviewed ${house.meta.reviewed}` : "Not yet reviewed"}
            {revision ? ` · revision ${revision}` : ""}
          </p>
        </div>
      </section>

      {lines.length > 0 && (
        <section aria-labelledby="script-h">
          <h3 id="script-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
            Voice-over transcript
          </h3>
          <dl className="space-y-3 text-sm">
            {house.narration._intro && <dd className="text-white/75">{house.narration._intro}</dd>}
            {lines.map((r) => (
              <div key={r.id}>
                <dt className="font-medium">{r.name}</dt>
                <dd className="text-white/75">{house.narration[r.id]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(onShare || onAllDetails) && (
        <div className="flex gap-2">
          {onShare && (
            <button type="button" onClick={onShare} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              <Share2 className="size-4" /> Share
            </button>
          )}
          {onAllDetails && (
            <button type="button" onClick={onAllDetails} className="inline-flex flex-1 items-center justify-center rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              Property page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
