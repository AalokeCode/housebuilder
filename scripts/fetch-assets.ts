/**
 * Downloads free 3D models into public/models/<id>/ and writes public/models/LICENSES.md.
 * Usage: pnpm assets:fetch                      (all)
 *        pnpm assets:fetch models|textures|hdri|<id> ...
 *
 * Sources: Poly Haven (CC0) via its public API, plus direct GLB URLs with explicit licenses.
 * After fetching, reference the model from src/assets/catalog.json → "model": "/models/<id>/<file>".
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import path from "node:path";

type Asset =
  | { id: string; kind: "polyhaven"; res?: "1k" | "2k"; use: string }
  | { id: string; kind: "url"; url: string; file: string; license: string; author: string; page: string; use: string };

export const ASSETS: Asset[] = [
  { id: "coffee_table_round_01", kind: "polyhaven", use: "coffee-table.round.glass-black" },
  { id: "outdoor_table_chair_set_01", kind: "polyhaven", use: "outdoor.bistro-set" },
  { id: "pachira_aquatica_01", kind: "polyhaven", use: "plant.potted.medium" },
  { id: "ceramic_vase_01", kind: "polyhaven", use: "decor.orchid (TV unit)" },
  { id: "ceramic_vase_02", kind: "polyhaven", use: "decor.orchid.bowl (dining table)" },
];

/** PBR detail textures (1k). Furniture keeps its photo color; these add grain/weave/roughness. */
export const TEXTURES: { id: string; maps: ("Diffuse" | "nor_gl" | "Rough")[]; use: string }[] = [
  { id: "american_walnut_veneer", maps: ["Diffuse", "nor_gl", "Rough"], use: "wood" },
  { id: "rough_linen", maps: ["nor_gl", "Rough"], use: "fabric (bedding, chairs)" },
  { id: "poly_wool_herringbone", maps: ["nor_gl", "Rough"], use: "upholstery (sofa, headboard)" },
];

/** Skybox: 1k HDR for lighting + tonemapped JPG backgrounds (4k mobile / 8k desktop). */
export const HDRI = { id: "sunset_jhbcentral", use: "skyline skybox + environment light" };

const OUT = path.join(process.cwd(), "public", "models");
const PUB = path.join(process.cwd(), "public");

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function fetchPolyHaven(a: Extract<Asset, { kind: "polyhaven" }>) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${a.id}`)).json();
  const g = files.gltf?.[a.res ?? "1k"]?.gltf;
  if (!g) throw new Error(`no gltf for ${a.id}`);
  const dir = path.join(OUT, a.id);
  const main = path.basename(new URL(g.url).pathname);
  await download(g.url, path.join(dir, main));
  for (const [rel, inc] of Object.entries(g.include as Record<string, { url: string }>)) await download(inc.url, path.join(dir, rel));
  return { model: `/models/${a.id}/${main}`, license: "CC0", author: "Poly Haven", page: `https://polyhaven.com/a/${a.id}` };
}

async function fetchTextures(rows: string[]) {
  for (const t of TEXTURES) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${t.id}`)).json();
    for (const m of t.maps) {
      const url = files[m]["1k"].jpg.url as string;
      await download(url, path.join(PUB, "textures", t.id, path.basename(new URL(url).pathname)));
    }
    rows.push(`| ${t.id} | ${t.use} | CC0 | Poly Haven | https://polyhaven.com/a/${t.id} |`);
    console.log(`✓ texture ${t.id}`);
  }
}

async function fetchHdri(rows: string[]) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${HDRI.id}`)).json();
  const dir = path.join(PUB, "env");
  await download(files.hdri["1k"].hdr.url, path.join(dir, `${HDRI.id}_1k.hdr`));
  const big = Buffer.from(await (await fetch(files.tonemapped.url)).arrayBuffer());
  // tiered backgrounds: phones 4k (safe GPU texture limit), desktop 8k
  for (const [w, tag] of [[4096, "4k"], [8192, "8k"]] as const) {
    await sharp(big, { limitInputPixels: false }).resize(w, w / 2).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, `${HDRI.id}_bg_${tag}.jpg`));
  }
  rows.push(`| ${HDRI.id} | ${HDRI.use} | CC0 | Poly Haven | https://polyhaven.com/a/${HDRI.id} |`);
  console.log(`✓ hdri ${HDRI.id}`);
}

/** Always lists every manifest entry, so partial fetches never drop attributions. */
function licenseTable() {
  const ph = (id: string, use: string) => `| ${id} | ${use} | CC0 | Poly Haven | https://polyhaven.com/a/${id} |`;
  const lines = [
    ...ASSETS.map((a) => (a.kind === "polyhaven" ? ph(a.id, a.use) : `| ${a.id} | ${a.use} | ${a.license} | ${a.author} | ${a.page} |`)),
    ...TEXTURES.map((t) => ph(t.id, t.use)),
    ph(HDRI.id, HDRI.use),
  ];
  return `# Third-party assets (models, textures, HDRI)\n\n| id | use | license | author | source |\n|---|---|---|---|---|\n${lines.join("\n")}\n`;
}

async function main() {
  const only = process.argv.slice(2);
  const rows: string[] = [];
  if (!only.length || only.includes("textures")) await fetchTextures(rows);
  if (!only.length || only.includes("hdri")) await fetchHdri(rows);
  for (const a of ASSETS.filter((x) => !only.length || only.includes(x.id) || only.includes("models"))) {
    try {
      const r =
        a.kind === "polyhaven"
          ? await fetchPolyHaven(a)
          : (await download(a.url, path.join(OUT, a.id, a.file)), { model: `/models/${a.id}/${a.file}`, license: a.license, author: a.author, page: a.page });
      rows.push(`| ${a.id} | ${a.use} | ${r.license} | ${r.author} | ${r.page} |`);
      console.log(`✓ ${a.id} → ${r.model}`);
    } catch (e) {
      console.error(`✖ ${a.id}: ${(e as Error).message}`);
    }
  }
  void rows;
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "LICENSES.md"), licenseTable());
}

main();
