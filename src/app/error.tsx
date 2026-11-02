"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Public error page: friendly copy + a reference id for support; details stay in server logs. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("[tour] page error", error.digest ?? error.message), [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center text-white">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-white/65">The tour couldn&apos;t load. Please try again.</p>
      {error.digest && <p className="font-mono text-xs text-white/40">ref {error.digest}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={reset} className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-amber-200">
          Try again
        </button>
        <Link href="/" className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/15">
          All tours
        </Link>
      </div>
    </main>
  );
}
