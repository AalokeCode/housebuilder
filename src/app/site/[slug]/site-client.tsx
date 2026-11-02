"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, Suspense, useState, type ReactNode } from "react";
import type { CompiledSite } from "@/domain/site-compiler";

const SiteViewer = dynamic(() => import("@/site/SiteViewer").then((m) => m.SiteViewer), {
  ssr: false,
  loading: () => <div className="h-dvh bg-[#cdd5dc]" />,
});

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error("[site] viewer crashed", e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SiteClient({ site }: { site: CompiledSite }) {
  const [attempt, setAttempt] = useState(0);
  const fallback = (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-white">
      <TriangleAlert className="size-8 text-amber-300" />
      <h1 className="text-2xl font-semibold">{site.meta.title}</h1>
      <p className="max-w-sm text-sm text-white/70">The 3D showcase couldn&apos;t start on this device. Here is the story it tells:</p>
      <ol className="max-w-lg space-y-3 text-left text-sm text-white/80">
        {site.chapters.map((c) => (
          <li key={c.id}>
            <p className="font-semibold text-white">{c.title}</p>
            <p>{c.words.join(" ")}</p>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-amber-200">
          <RotateCcw className="size-4" /> Try again
        </button>
        <Link href="/" className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/15">
          All tours
        </Link>
      </div>
    </main>
  );
  return (
    <Boundary key={attempt} fallback={fallback}>
      <Suspense>
        <SiteViewer site={site} />
      </Suspense>
    </Boundary>
  );
}
