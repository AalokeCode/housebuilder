/**
 * Content-hashes every static 3D / photo asset so URLs can be cached forever.
 * Writes src/assets/asset-manifest.json  { "/models/x/x.glb": "a1b2c3d4", … }.
 * `asset(url)` (src/assets/asset-url.ts) appends `?v=<hash>`; next.config serves `?v=` URLs as immutable.
 * Runs automatically before `pnpm build` and after `assets:fetch` / `house:publish`.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC = path.join(process.cwd(), "public");
const DIRS = ["models", "textures", "env", "houses"];
const EXT = /\.(glb|gltf|bin|hdr|jpe?g|png|webp|avif|ktx2)$/i;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  const manifest: Record<string, string> = {};
  for (const d of DIRS) {
    for (const file of (await walk(path.join(PUBLIC, d))).sort()) {
      const url = "/" + path.relative(PUBLIC, file).split(path.sep).join("/");
      manifest[url] = createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 8);
    }
  }
  const out = path.join(process.cwd(), "src", "assets", "asset-manifest.json");
  await writeFile(out, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`✓ asset manifest: ${Object.keys(manifest).length} files → src/assets/asset-manifest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
