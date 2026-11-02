import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteRepository } from "@/site/server/site-repository";
import { SiteClient } from "./site-client";

async function Site({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // always read the latest site.json (agents edit it while previewing)
  const { slug } = await params;
  const res = await new SiteRepository().load(slug);
  if (!res) notFound();
  const errors = res.issues.filter((i) => i.level === "error");
  if (errors.length || !res.site) {
    return (
      <main className="mx-auto max-w-2xl p-6 font-mono text-sm">
        <h1 className="mb-4 text-lg font-semibold">
          {slug}: {errors.length} validation error(s)
        </h1>
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
  return <SiteClient site={res.site} />;
}

export default function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-neutral-500">Loading site…</div>}>
      <Site params={params} />
    </Suspense>
  );
}
