import { Box, Plane } from "lucide-react";
import Link from "next/link";
import { tourFacts } from "@/domain/tour-model";
import { publishedSites, publishedTours } from "@/server/tour-catalog";
import { FactsRow } from "@/tour-ui/TourDetails";

export default async function Home() {
  const [tours, sites] = await Promise.all([publishedTours(), publishedSites()]);
  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">3D tours</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Walk through before you visit</h1>
        <p className="mt-2 max-w-xl text-sm text-white/65">Interactive 3D reconstructions made from listing photos. Estimated details are always labelled.</p>

        <section className="mt-10" aria-labelledby="homes">
          <h2 id="homes" className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
            <Box className="size-4" /> Homes
          </h2>
          {tours.length === 0 ? (
            <p className="rounded-2xl bg-white/5 p-6 text-sm text-white/60 ring-1 ring-white/10">No published tours yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {tours.map(({ house, cover }) => (
                <li key={house.slug}>
                  <Link href={`/tour/${house.slug}`} className="group block overflow-hidden rounded-3xl bg-white/5 ring-1 ring-white/10 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                    <div className="relative aspect-[16/9] overflow-hidden bg-neutral-900">
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover.thumb} alt="" width={480} height={270} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-neutral-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur">
                        {tourFacts(house).estimated ? "3D · estimated layout" : "3D tour"}
                      </span>
                    </div>
                    <div className="p-4">
                      {house.meta.locality && <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">{house.meta.locality}</p>}
                      <p className="mt-0.5 font-semibold">{house.title}</p>
                      <FactsRow house={house} className="mt-1 text-white/60" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sites.length > 0 && (
          <section className="mt-12" aria-labelledby="sites">
            <h2 id="sites" className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
              <Plane className="size-4" /> Drone showcases
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {sites.map((s) => (
                <li key={s.slug}>
                  <Link href={`/site/${s.slug}`} className="block rounded-3xl bg-white/5 p-5 ring-1 ring-white/10 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                    <p className="font-semibold">{s.meta.title}</p>
                    <p className="mt-1 text-sm text-white/60">
                      {s.meta.location ? `${s.meta.location} · ` : ""}
                      {s.chapters.length} narrated chapters
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
