import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">404</p>
      <h1 className="text-2xl font-semibold">This tour isn&apos;t available</h1>
      <p className="max-w-sm text-sm text-white/65">It may have been unpublished, or the link is mistyped.</p>
      <Link href="/" className="mt-3 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-200">
        Browse tours
      </Link>
    </main>
  );
}
