/**
 * Packs every model under public/models/<id>/ into one web-ready GLB:
 * meshopt geometry compression + WebP textures (≤ 1024 px). Sources (.gltf/.bin/textures) are removed
 * afterwards — `pnpm assets:fetch` re-downloads them.
 *
 * Usage: pnpm assets:optimize [<id> ...]
 * Then point the catalog at /models/<id>/<id>.glb (already done for the fetched set).
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public", "models");

async function size(p: string): Promise<number> {
  const s = await stat(p);
  if (!s.isDirectory()) return s.size;
  let n = 0;
  for (const f of await readdir(p)) n += await size(path.join(p, f));
  return n;
}

async function optimize(id: string, io: NodeIO) {
  const dir = path.join(ROOT, id);
  const files = await readdir(dir);
  const src = files.find((f) => f.endsWith(".gltf")) ?? files.find((f) => f.endsWith(".glb"));
  if (!src) return console.log(`· ${id}: no model`);
  const out = path.join(dir, `${id}.glb`);
  if (src === `${id}.glb` && files.length === 1) {
    const doc = await io.read(out);
    if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression")) return console.log(`· ${id}: already optimized`);
  }
  const before = await size(dir);
  const doc = await io.read(path.join(dir, src));
  await doc.transform(
    dedup(),
    prune(),
    resample(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const glb = await io.writeBinary(doc);
  for (const f of files) await rm(path.join(dir, f), { recursive: true, force: true });
  await (await import("node:fs/promises")).writeFile(out, glb);
  console.log(`✓ ${id}: ${(before / 1e6).toFixed(2)} MB → ${(glb.byteLength / 1e6).toFixed(2)} MB  (/models/${id}/${id}.glb)`);
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const want = process.argv.slice(2);
  const ids = (await readdir(ROOT, { withFileTypes: true })).filter((e) => e.isDirectory() && (!want.length || want.includes(e.name))).map((e) => e.name);
  for (const id of ids) await optimize(id, io);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
