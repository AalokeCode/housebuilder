import raw from "@/assets/catalog.json";
import type { MaterialRef, Vec3 } from "./house-spec";

export type Mount = "floor" | "wall" | "ceiling";

export interface CatalogItem {
  builder: string;
  mount: Mount;
  size: Vec3;
  colors: Record<string, string>;
  license: string;
  /** optional GLB path under /public; procedural builder is the fallback */
  model?: string;
  source?: string;
}

export interface MaterialDef {
  color: string;
  rough: number;
  metal?: number;
  opacity?: number;
  texture?: "tile-60x120" | "tile-60x60" | "speckle";
  /** photo-sourced surface (under /public), tiled with mirrored repeat. Surfaces have world-metre UVs. */
  image?: string;
  /** real-world size [u, v] in metres one copy of `image` covers (u = along the wall / plan x, v = up / plan z) */
  tile?: [number, number];
}

interface CatalogFile {
  items: Record<string, CatalogItem>;
  materials: Record<string, MaterialDef>;
}

/** Read-only lookup over src/assets/catalog.json. */
export class Catalog {
  private readonly data: CatalogFile;

  constructor(data: unknown = raw) {
    this.data = data as CatalogFile;
  }

  item(id: string): CatalogItem | undefined {
    return this.data.items[id];
  }

  hasItem(id: string): boolean {
    return id.startsWith("placeholder.") || id in this.data.items;
  }

  material(ref: MaterialRef): MaterialDef {
    if (typeof ref !== "string") return { color: ref.color, rough: ref.rough ?? 0.8 };
    return this.data.materials[ref] ?? { color: "#ff00ff", rough: 0.8 };
  }

  hasMaterial(ref: MaterialRef): boolean {
    return typeof ref !== "string" || ref in this.data.materials;
  }
}

export const catalog = new Catalog();
