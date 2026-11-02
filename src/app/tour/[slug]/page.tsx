import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HouseService } from "@/server/house-service";
import { TourClient } from "./tour-client";

async function House({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // always read fresh house files (agents edit them while previewing)
  const { slug } = await params;
  const { house, issues } = await new HouseService().get(slug);
  if (!house) notFound();
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    return (
      <main className="mx-auto max-w-2xl p-6 font-mono text-sm">
        <h1 className="mb-4 text-lg font-semibold">{slug}: {errors.length} validation error(s)</h1>
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={i}>
              ✖ [{e.code}] {e.where}: {e.msg}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  return <TourClient house={house} />;
}

export default function TourPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-neutral-500">Loading tour…</div>}>
      <House params={params} />
    </Suspense>
  );
}
