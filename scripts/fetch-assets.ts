/**
 * Downloads free 3D models into public/models/<id>/ and writes public/models/LICENSES.md.
 * Usage: pnpm assets:fetch                      (all)
 *        pnpm assets:fetch models|textures|hdri|<id> ...
 *
 * Sources: Poly Haven (CC0) via its public API, plus direct GLB URLs with explicit licenses.
 * Models are then packed into meshopt + WebP GLBs (scripts/optimize-models.ts) and the asset manifest is rebuilt.
 * Reference a model from src/assets/catalog.json → "model": "/models/<id>/<id>.glb".
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Model sources, in order of preference (all free; check the licence column before adding):
 *  - polyhaven   CC0, no key, highest quality realistic props (api.polyhaven.com)
 *  - url         direct .glb/.gltf link with explicit licence (Smithsonian 3D = CC0, Khronos samples, etc.)
 *  - zip         archive + path of the model inside it (Kenney / Quaternius = CC0 packs, ambientCG models)
 *  - sketchfab   CC0 / CC-BY downloadable models; needs SKETCHFAB_TOKEN passed inline (never written to a file)
 * Every model is then packed to one meshopt + WebP GLB by scripts/optimize-models.ts.
 */
type Credit = { license: string; author: string; page: string; use: string };
type Asset =
  | { id: string; kind: "polyhaven"; res?: "1k" | "2k"; use: string }
  | ({ id: string; kind: "url"; url: string; file: string } & Credit)
  | ({ id: string; kind: "zip"; url: string; entry: string } & Credit)
  | ({ id: string; kind: "sketchfab"; uid: string } & Credit);

export const ASSETS: Asset[] = [
  { id: "outdoor_table_chair_set_01", kind: "polyhaven", use: "outdoor.bistro-set" },
  { id: "pachira_aquatica_01", kind: "polyhaven", use: "plant.potted.medium" },
  { id: "ceramic_vase_01", kind: "polyhaven", use: "decor.orchid (TV unit)" },
  { id: "ceramic_vase_02", kind: "polyhaven", use: "decor.orchid.bowl (dining table)" },
];

/**
 * PBR detail textures (1k). Furniture keeps its photo color; these add grain/weave/roughness.
 * source "polyhaven" (default) or "ambientcg" (CC0, ambientcg.com) — both saved as <id>_{diff,nor_gl,rough}_1k.jpg.
 */
export const TEXTURES: { id: string; maps: ("Diffuse" | "nor_gl" | "Rough")[]; use: string; source?: "polyhaven" | "ambientcg" }[] = [
  { id: "american_walnut_veneer", maps: ["Diffuse", "nor_gl", "Rough"], use: "wood" },
  { id: "rough_linen", maps: ["nor_gl", "Rough"], use: "fabric (bedding, chairs)" },
  { id: "poly_wool_herringbone", maps: ["nor_gl", "Rough"], use: "upholstery (sofa, headboard)" },
  { id: "Fabric032", maps: ["nor_gl", "Rough"], use: "boucle (pouf, lounge chair)", source: "ambientcg" },
];

/** Skybox: 1k HDR for lighting + tonemapped JPG backgrounds (4k mobile / 8k desktop). */
export const HDRI = { id: "sunset_jhbcentral", use: "environment light (warm interior grade)" };
/** Background skybox source (tonemapped JPG, rebuilt by scripts/skybox/build-skyline.py). */
export const SKYBOX = { id: "shanghai_bund", use: "window view: river skyline skybox (promenade + people removed)" };

const OUT = path.join(process.cwd(), "public", "models");
const PUB = path.join(process.cwd(), "public");

async function download(url: string, dest: string, tries = 3) {
  let res = await fetch(url);
  // CDNs hiccup (5xx): back off and retry
  for (let i = 1; i < tries && res.status >= 500; i++) {
    await new Promise((r) => setTimeout(r, 1500 * i));
    res = await fetch(url);
  }
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

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: "pipe" });

/** Archive packs (Kenney, Quaternius, ambientCG …): download, unzip to a temp dir, copy the model folder. */
async function fetchZip(a: Extract<Asset, { kind: "zip" }>) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), `asset-${a.id}-`));
  await download(a.url, path.join(tmp, "a.zip"));
  run("unzip", ["-q", "-o", path.join(tmp, "a.zip"), "-d", path.join(tmp, "x")]);
  const src = path.join(tmp, "x", a.entry);
  const dir = path.join(OUT, a.id);
  await mkdir(dir, { recursive: true });
  await cp(path.dirname(src), dir, { recursive: true });
  return { model: `/models/${a.id}/${path.basename(a.entry)}`, license: a.license, author: a.author, page: a.page };
}

/** Sketchfab download API (downloadable CC0 / CC-BY models only). Token comes from the environment. */
async function fetchSketchfab(a: Extract<Asset, { kind: "sketchfab" }>) {
  const token = process.env.SKETCHFAB_TOKEN;
  if (!token) throw new Error("SKETCHFAB_TOKEN not set (pass it inline: SKETCHFAB_TOKEN=… pnpm assets:fetch <id>)");
  const res = await fetch(`https://api.sketchfab.com/v3/models/${a.uid}/download`, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`sketchfab ${res.status} — is the model downloadable?`);
  const links = (await res.json()) as { glb?: { url: string } };
  if (!links.glb) throw new Error("no glb download offered");
  await download(links.glb.url, path.join(OUT, a.id, `${a.id}.glb`));
  return { model: `/models/${a.id}/${a.id}.glb`, license: a.license, author: a.author, page: a.page };
}

async function fetchAmbientCg(t: (typeof TEXTURES)[number]) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), `tex-${t.id}-`));
  await download(`https://ambientcg.com/get?file=${t.id}_1K-JPG.zip`, path.join(tmp, "t.zip"));
  run("unzip", ["-q", "-o", path.join(tmp, "t.zip"), "-d", tmp]);
  const map = { Diffuse: ["Color", "diff"], nor_gl: ["NormalGL", "nor_gl"], Rough: ["Roughness", "rough"] } as const;
  for (const m of t.maps) {
    const [src, dst] = map[m];
    await cp(path.join(tmp, `${t.id}_1K-JPG_${src}.jpg`), path.join(PUB, "textures", t.id, `${t.id}_${dst}_1k.jpg`));
  }
}

async function fetchTextures(rows: string[], only: string[]) {
  for (const t of TEXTURES.filter((x) => !only.length || only.includes("textures") || only.includes(x.id))) {
    if (t.source === "ambientcg") {
      await fetchAmbientCg(t);
      rows.push(`| ${t.id} | ${t.use} | CC0 | ambientCG | https://ambientcg.com/view?id=${t.id} |`);
      console.log(`✓ texture ${t.id} (ambientCG)`);
      continue;
    }
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
  rows.push(`| ${HDRI.id} | ${HDRI.use} | CC0 | Poly Haven | https://polyhaven.com/a/${HDRI.id} |`);
  console.log(`✓ hdri ${HDRI.id}`);
  // background skybox: river skyline, people/promenade removed, horizon at eye level (needs python3 + Pillow)
  const sky = await (await fetch(`https://api.polyhaven.com/files/${SKYBOX.id}`)).json();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skybox-"));
  await download(sky.tonemapped.url, path.join(tmp, "src.jpg"));
  execFileSync("python3", ["scripts/skybox/build-skyline.py", path.join(tmp, "src.jpg"), dir], { stdio: "inherit" });
  console.log(`✓ skybox ${SKYBOX.id} → env/skyline_bg_{4k,8k}.jpg`);
}

/** Assets generated (not downloaded) — committed directly, listed for provenance. */
export const GENERATED: { id: string; use: string; license: string; author: string; page: string }[] = [
  // e.g. { id: "bed_trellis", use: "...", license: "generated with TRELLIS (MIT) from listing photo 01b", author: "this project", page: "public/models/<id>/<id>.glb" }
];

/** Always lists every manifest entry, so partial fetches never drop attributions. */
function licenseTable() {
  const ph = (id: string, use: string) => `| ${id} | ${use} | CC0 | Poly Haven | https://polyhaven.com/a/${id} |`;
  const lines = [
    ...ASSETS.map((a) => (a.kind === "polyhaven" ? ph(a.id, a.use) : `| ${a.id} | ${a.use} | ${a.license} | ${a.author} | ${a.page} |`)),
    ...TEXTURES.map((t) => (t.source === "ambientcg" ? `| ${t.id} | ${t.use} | CC0 | ambientCG | https://ambientcg.com/view?id=${t.id} |` : ph(t.id, t.use))),
    ph(HDRI.id, HDRI.use),
    ph(SKYBOX.id, SKYBOX.use),
    ...GENERATED.map((g) => `| ${g.id} | ${g.use} | ${g.license} | ${g.author} | ${g.page} |`),
  ];
  return `# Third-party assets (models, textures, HDRI)\n\n| id | use | license | author | source |\n|---|---|---|---|---|\n${lines.join("\n")}\n`;
}

async function main() {
  const only = process.argv.slice(2);
  const rows: string[] = [];
  if (!only.length || only.includes("textures") || TEXTURES.some((t) => only.includes(t.id))) await fetchTextures(rows, only);
  if (!only.length || only.includes("hdri")) await fetchHdri(rows);
  for (const a of ASSETS.filter((x) => !only.length || only.includes(x.id) || only.includes("models"))) {
    try {
      const r =
        a.kind === "polyhaven"
          ? await fetchPolyHaven(a)
          : a.kind === "zip"
            ? await fetchZip(a)
            : a.kind === "sketchfab"
              ? await fetchSketchfab(a)
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
  execFileSync("pnpm", ["exec", "tsx", "scripts/optimize-models.ts"], { stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "scripts/asset-manifest.ts"], { stdio: "inherit" });
}

main();
