import * as THREE from "three";
import { catalog } from "@/domain/catalog";
import type { MaterialRef } from "@/domain/house-spec";

/** Shared material cache — one THREE material per ref, so the GPU sees few programs/draw states. */
type Weave = "wood" | "fabric" | "weave";

const TEX: Record<Weave, { dir: string; id: string; diff: boolean; repeat: number; normal: number }> = {
  wood: { dir: "american_walnut_veneer", id: "american_walnut_veneer", diff: true, repeat: 1.5, normal: 0.5 },
  fabric: { dir: "rough_linen", id: "rough_linen", diff: false, repeat: 5, normal: 0.9 },
  weave: { dir: "poly_wool_herringbone", id: "poly_wool_herringbone", diff: false, repeat: 4, normal: 0.8 },
};

class MaterialFactory {
  private cache = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();
  private loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
  /** set by the canvas so texture loads trigger a redraw in frameloop="demand" */
  onLoad: () => void = () => {};

  private image(url: string, srgb: boolean, repeat: number): THREE.Texture {
    const hit = this.textures.get(url);
    if (hit) return hit;
    const t = this.loader!.load(url, () => this.onLoad());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(url, t);
    return t;
  }

  /** PBR material with CC0 detail maps (public/textures). Color stays the photo-sampled hex. */
  textured(hex: string, kind: Weave): THREE.MeshStandardMaterial {
    const key = `t:${kind}:${hex}`;
    let m = this.cache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (m) return m;
    const d = TEX[kind];
    const base = `/textures/${d.dir}/${d.id}`;
    const color = new THREE.Color(hex);
    if (d.diff) {
      // keep the photo hue, lift lightness so it multiplies cleanly with the walnut albedo
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      color.setHSL(hsl.h, Math.min(1, hsl.s * 1.1), 0.62);
    }
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      map: d.diff ? this.image(`${base}_diff_1k.jpg`, true, d.repeat) : null,
      normalMap: this.image(`${base}_nor_gl_1k.jpg`, false, d.repeat),
      roughnessMap: this.image(`${base}_rough_1k.jpg`, false, d.repeat),
      normalScale: new THREE.Vector2(d.normal, d.normal),
    });
    this.cache.set(key, m);
    return m;
  }

  /** Image texture from /public (e.g. artwork cropped from reference photos). */
  picture(url: string): THREE.Texture {
    const t = this.image(url, true, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  surface(ref: MaterialRef): THREE.Material {
    const key = typeof ref === "string" ? ref : JSON.stringify(ref);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = catalog.material(ref);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.rough,
      metalness: def.metal ?? 0,
      transparent: def.opacity !== undefined,
      opacity: def.opacity ?? 1,
      depthWrite: def.opacity === undefined,
      side: def.opacity !== undefined ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (def.texture) mat.map = this.texture(def.texture, def.color);
    this.cache.set(key, mat);
    return mat;
  }

  color(hex: string, rough = 0.7, metal = 0): THREE.MeshStandardMaterial {
    const key = `c:${hex}:${rough}:${metal}`;
    let m = this.cache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
      this.cache.set(key, m);
    }
    return m;
  }

  emissive(hex: string, intensity = 1.5): THREE.MeshStandardMaterial {
    const key = `e:${hex}:${intensity}`;
    let m = this.cache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 1 });
      this.cache.set(key, m);
    }
    return m;
  }

  glass(): THREE.Material {
    return this.surface("glass.clear");
  }

  /** Procedural canvas textures (no network, tiny). UVs are world meters on floors. */
  texture(kind: string, base: string): THREE.Texture {
    const key = `${kind}:${base}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, size, size);
    // subtle noise
    for (let i = 0; i < 2200; i++) {
      const v = 235 + Math.random() * 20;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    let repeat: [number, number] = [1, 1];
    if (kind.startsWith("tile")) {
      g.strokeStyle = "rgba(150,150,150,0.55)";
      g.lineWidth = 2;
      g.strokeRect(1, 1, size - 2, size - 2);
      repeat = kind === "tile-60x120" ? [1 / 1.2, 1 / 0.6] : [1 / 0.6, 1 / 0.6];
    }
    if (kind === "speckle") {
      for (let i = 0; i < 1800; i++) {
        const v = 120 + Math.random() * 110;
        g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},0.6)`;
        g.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      repeat = [2, 2];
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.set(key, tex);
    void base;
    return tex;
  }

  /** Artwork canvases for framed prints. */
  art(pattern: string): THREE.Texture {
    const key = `art:${pattern}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const w = 256;
    const h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const rnd = mulberry(pattern.length * 7919);
    g.fillStyle = pattern === "lines-beige" ? "#efe9df" : "#f4f3f0";
    g.fillRect(0, 0, w, h);
    if (pattern === "strokes-blue") {
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(${40 + rnd() * 30},${70 + rnd() * 40},${150 + rnd() * 60},${0.55 + rnd() * 0.4})`;
        const x = 12 + i * 9 + rnd() * 4;
        for (let y = 20; y < h - 30; y += 6) g.fillRect(x + Math.sin(y * 0.1 + i) * 2, y, 4 + rnd() * 3, 5);
      }
    } else if (pattern === "lines-beige") {
      g.strokeStyle = "rgba(120,95,70,0.7)";
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        for (let y = 10; y < h - 10; y += 4) g.lineTo(20 + i * 12 + Math.sin(y * 0.15 + i) * 2.5, y);
        g.stroke();
      }
    } else {
      const dark = pattern === "abstract-dark";
      g.fillStyle = dark ? "#2a2c30" : "#e8e7e3";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const v = dark ? 60 + rnd() * 120 : 60 + rnd() * 150;
        g.fillStyle = `rgba(${v},${v},${v + 8},${0.25 + rnd() * 0.5})`;
        g.beginPath();
        g.ellipse(rnd() * w, h * 0.35 + rnd() * h * 0.35, 10 + rnd() * 50, 3 + rnd() * 14, rnd(), 0, Math.PI * 2);
        g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const materials = new MaterialFactory();
