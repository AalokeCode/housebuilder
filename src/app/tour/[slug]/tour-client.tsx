"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { CompiledHouse } from "@/domain/compiled";

const Viewer = dynamic(() => import("@/viewer/Viewer").then((m) => m.Viewer), { ssr: false });

export function TourClient({ house }: { house: CompiledHouse }) {
  return (
    <Suspense>
      <Viewer house={house} />
    </Suspense>
  );
}
