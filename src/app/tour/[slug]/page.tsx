import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tourSummary } from "@/domain/tour-model";
import { publishedTour, publishedTours } from "@/server/tour-catalog";
import { TourApp } from "@/tour-ui/TourApp";

/** Blocking on purpose: the slug is resolved before streaming so unknown slugs get a real HTTP 404.
 *  Published data is cached ("use cache") and every known slug is prerendered, so this costs nothing. */
export const instant = false;

type Params = { params: Promise<{ slug: string }> };

/** Prerender every published tour; unknown slugs render on request and 404. */
export async function generateStaticParams() {
  const tours = await publishedTours();
  // Cache Components needs ≥ 1 param; the sentinel resolves to a 404
  return tours.length ? tours.map((t) => ({ slug: t.house.slug })) : [{ slug: "none" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const tour = await publishedTour(slug);
  if (!tour) return { title: "Tour not found", robots: { index: false } };
  const description = tourSummary(tour.house);
  const og = tour.cover ? `/houses/${slug}/photos/og.jpg` : undefined;
  return {
    title: `${tour.house.title} · 3D tour`,
    description,
    alternates: { canonical: `/tour/${slug}` },
    openGraph: { title: tour.house.title, description, type: "website", url: `/tour/${slug}`, images: og ? [{ url: og, width: 1200, height: 630, alt: tour.house.title }] : undefined },
    twitter: { card: og ? "summary_large_image" : "summary", title: tour.house.title, description, images: og ? [og] : undefined },
  };
}

export default async function TourPage({ params }: Params) {
  const { slug } = await params;
  const tour = await publishedTour(slug);
  if (!tour) notFound(); // before any Suspense → real HTTP 404
  return <TourApp house={tour.house} photos={tour.photos} cover={tour.cover} revision={tour.revision} />;
}
