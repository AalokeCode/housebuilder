import type { NextConfig } from "next";

const ASSETS = "/:dir(models|textures|env|houses)/:path*";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // no partialPrefetching: unknown slugs must render (and 404) instead of getting the shared App Shell with 200
  partialPrefetching: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // content-hashed (?v=…) 3D assets and photos never change → cache forever
      { source: ASSETS, has: [{ type: "query", key: "v" }], headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // unversioned (e.g. og.jpg, manifest): short cache, background refresh
      { source: ASSETS, missing: [{ type: "query", key: "v" }], headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
