"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { CompiledSite } from "@/domain/site-compiler";

const SiteViewer = dynamic(() => import("@/site/SiteViewer").then((m) => m.SiteViewer), { ssr: false });

export function SiteClient({ site }: { site: CompiledSite }) {
  return (
    <Suspense>
      <SiteViewer site={site} />
    </Suspense>
  );
}
