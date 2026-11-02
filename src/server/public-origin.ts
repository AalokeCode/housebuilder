/** Canonical origin for metadata / sitemap. Set NEXT_PUBLIC_SITE_URL in production. */
export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3210")).replace(/\/$/, "");
}
