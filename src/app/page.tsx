import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { HouseService } from "@/server/house-service";
import { SiteRepository } from "@/site/server/site-repository";

async function HouseList() {
  await connection();
  const service = new HouseService();
  const slugs = await service.listSlugs();
  const houses = await Promise.all(slugs.map(async (s) => ({ slug: s, ...(await service.get(s)) })));
  if (!houses.length) return <p className="text-sm text-neutral-500">No houses yet. Run /convert-house to add one.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {houses.map(({ slug, house, issues }) => {
        const errors = issues.filter((i) => i.level === "error").length;
        return (
          <li key={slug}>
            <Link href={`/tour/${slug}`} className="block rounded-2xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-400">
              <p className="font-medium text-neutral-900">{house?.title ?? slug}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {house ? `${house.rooms.length} rooms · ${house.items.length} items · ${house.sources.join(", ")}` : "failed to load"}
              </p>
              {errors > 0 && <p className="mt-2 text-xs font-medium text-red-600">{errors} validation error(s)</p>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function SiteList() {
  await connection();
  const repo = new SiteRepository();
  const sites = (await Promise.all((await repo.listSlugs()).map(async (slug) => ({ slug, res: await repo.load(slug) })))).filter((x) => x.res?.site);
  if (!sites.length) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Drone showcases</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sites.map(({ slug, res }) => (
          <li key={slug}>
            <Link href={`/site/${slug}`} className="block rounded-2xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-400">
              <p className="font-medium text-neutral-900">{res!.site!.meta.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {res!.site!.towers.length} towers · {res!.site!.chapters.length} chapters · voice-over + subtitles
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">3D House Tours</h1>
      <p className="mb-8 mt-1 text-sm text-neutral-500">Photo-referenced, editable 3D walkthroughs.</p>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <HouseList />
      </Suspense>
      <Suspense fallback={null}>
        <SiteList />
      </Suspense>
    </main>
  );
}
