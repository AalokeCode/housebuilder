import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publishedSite, publishedSites } from "@/server/tour-catalog";
import { SiteClient } from "./site-client";

/** Blocking on purpose: the slug is resolved before streaming so unknown slugs get a real HTTP 404.
 *  Published data is cached ("use cache") and every known slug is prerendered, so this costs nothing. */
export const instant = false;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const sites = await publishedSites();
  return sites.length ? sites.map((s) => ({ slug: s.slug })) : [{ slug: "none" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const site = await publishedSite(slug);
  if (!site) return { title: "Showcase not found", robots: { index: false } };
  const description = `Aerial drone showcase of ${site.meta.title}${site.meta.location ? `, ${site.meta.location}` : ""} — ${site.chapters.length} narrated chapters.`;
  return { title: `${site.meta.title} · Drone showcase`, description, alternates: { canonical: `/site/${slug}` }, openGraph: { title: site.meta.title, description, url: `/site/${slug}` } };
}

export default async function SitePage({ params }: Params) {
  const { slug } = await params;
  const site = await publishedSite(slug);
  if (!site) notFound(); // real 404; diagnostics: pnpm exec tsx scripts/site-validate.ts <slug>
  return <SiteClient site={site} />;
}
