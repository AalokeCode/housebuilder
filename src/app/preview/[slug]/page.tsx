import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HouseService } from "@/server/house-service";
import { TourApp } from "@/tour-ui/TourApp";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * Authoring preview: drafts included, files read fresh on every request, full diagnostics.
 * Protected by PREVIEW_TOKEN in production (src/proxy.ts). Supports ?cam=, ?mode=dollhouse, ?room=, ?tour=guided, ?clean=1.
 */
async function Preview({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const res = await new HouseService().bundle(slug);
  if (!res) notFound();
  if (!res.house) {
    return (
      <main className="mx-auto max-w-2xl p-6 font-mono text-sm">
        <h1 className="mb-4 text-lg font-semibold">
          {slug}: {res.issues.length} issue(s)
        </h1>
        <ul className="space-y-1">
          {res.issues.map((e, i) => (
            <li key={i}>
              ✖ [{e.code}] {e.where}: {e.msg}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  return <TourApp house={res.house} photos={res.photos} cover={res.cover} revision={res.revision} issues={res.issues} />;
}

export default function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-neutral-950 text-sm text-white/60">Loading preview…</div>}>
      <Preview params={params} />
    </Suspense>
  );
}
