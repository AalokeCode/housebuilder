"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { SiteRepository } from "@/server/site-repository";
import { HouseService, type TourBundle } from "./house-service";

/**
 * Cached read model for the public routes. Published content is file-backed and changes only on deploy
 * (or `revalidateTag("tours")`), so it is prerendered and served from the cache.
 * Authoring routes (/preview) bypass this module and read files fresh.
 */

export async function publishedTour(slug: string): Promise<TourBundle | null> {
  cacheLife("max");
  cacheTag("tours", `tour:${slug}`);
  return new HouseService().published(slug);
}

export async function publishedTours(): Promise<TourBundle[]> {
  cacheLife("max");
  cacheTag("tours");
  return new HouseService().listPublished();
}

export async function publishedSite(slug: string) {
  cacheLife("max");
  cacheTag("sites", `site:${slug}`);
  const res = await new SiteRepository().load(slug);
  if (!res?.site || res.issues.some((i) => i.level === "error")) return null;
  return res.site;
}

export async function publishedSites() {
  cacheLife("max");
  cacheTag("sites");
  const repo = new SiteRepository();
  const settled = await Promise.allSettled((await repo.listSlugs()).map((s) => publishedSite(s)));
  return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}
