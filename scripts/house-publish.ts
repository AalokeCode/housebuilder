/**
 * Publish gate for a house.
 * Usage: pnpm house:publish <slug> [--cover <photoId>] [--draft]
 *
 * 1. validates (exit 1 on any error — nothing is published)
 * 2. exports listing photos from houses/<slug>/refs/ to public/houses/<slug>/photos/
 *    (<id>.webp ≤ 1800 px, <id>-thumb.webp 480 px, og.jpg 1200×630, manifest.json)
 * 3. sets meta.status = "published" and meta.reviewed = today (or "draft" with --draft)
 * 4. rebuilds the asset manifest (versioned, immutable URLs)
 *
 * Only run after the human approved the model AND the listing photos may be public.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SLUG } from "../src/server/house-repository";
import { HouseService } from "../src/server/house-service";
import { houseDir, PUBLIC_HOUSES_DIR } from "../src/server/paths";

const PHOTO = /\.(jpe?g|png|webp)$/i;

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--cover");
  if (!slug || !SLUG.test(slug)) {
    console.error("usage: pnpm house:publish <slug> [--cover <photoId>] [--draft]");
    process.exit(2);
  }
  const draft = args.includes("--draft");
  const coverArg = args.includes("--cover") ? args[args.indexOf("--cover") + 1] : undefined;

  const { house, issues } = await new HouseService().get(slug);
  const errors = issues.filter((i) => i.level === "error");
  if (!house || errors.length) {
    for (const e of errors) console.error(`✖ [${e.code}] ${e.where}: ${e.msg}`);
    console.error(`\nNOT PUBLISHED — fix ${errors.length} error(s) first (pnpm house:validate ${slug}).`);
    process.exit(1);
  }

  const refs = path.join(houseDir(slug), "refs");
  const out = path.join(PUBLIC_HOUSES_DIR, slug, "photos");
  await mkdir(out, { recursive: true });
  const files = (await readdir(refs)).filter((f) => PHOTO.test(f) && !/collage|^plan\./i.test(f)).sort();
  const photos: { id: string; w: number; h: number }[] = [];
  for (const f of files) {
    const id = f.replace(PHOTO, "");
    const img = sharp(path.join(refs, f)).rotate();
    const full = await img.clone().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(out, `${id}.webp`));
    await img.clone().resize({ width: 480, height: 360, fit: "cover" }).webp({ quality: 70 }).toFile(path.join(out, `${id}-thumb.webp`));
    photos.push({ id, w: full.width, h: full.height });
    console.log(`✓ photo ${id} ${full.width}×${full.height}`);
  }
  const cover = coverArg ?? house.photoCams[0]?.photo ?? photos[0]?.id;
  if (cover && files.length) {
    const src = files.find((f) => f.replace(PHOTO, "") === cover) ?? files[0];
    await sharp(path.join(refs, src)).rotate().resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, "og.jpg"));
  }
  await writeFile(path.join(out, "manifest.json"), JSON.stringify({ photos, cover }, null, 2) + "\n");

  const specPath = path.join(houseDir(slug), "house.json");
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  spec.meta.status = draft ? "draft" : "published";
  if (!draft) spec.meta.reviewed = new Date().toISOString().slice(0, 10);
  await writeFile(specPath, JSON.stringify(spec, null, 2) + "\n");

  execFileSync("pnpm", ["exec", "tsx", "scripts/asset-manifest.ts"], { stdio: "inherit" });
  console.log(`\n${draft ? "DRAFT" : "PUBLISHED"} — ${slug}: ${photos.length} photo(s), cover ${cover ?? "none"}. Deploy (or revalidateTag("tours")) to go live at /tour/${slug}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
