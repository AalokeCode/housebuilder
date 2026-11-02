import type { MetadataRoute } from "next";
import { publicOrigin } from "@/server/public-origin";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/preview/"] }], sitemap: `${publicOrigin()}/sitemap.xml` };
}
