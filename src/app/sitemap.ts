import type { MetadataRoute } from "next";
import { publishedSites, publishedTours } from "@/server/tour-catalog";
import { publicOrigin } from "@/server/public-origin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicOrigin();
  const [tours, sites] = await Promise.all([publishedTours(), publishedSites()]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 0.6 },
    ...tours.map((t) => ({ url: `${base}/tour/${t.house.slug}`, lastModified: t.house.meta.reviewed, changeFrequency: "monthly" as const, priority: 1 })),
    ...sites.map((s) => ({ url: `${base}/site/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
