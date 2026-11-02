import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Issue } from "@/domain/compiled";
import { HouseSpec, RoomItemsFile } from "@/domain/house-spec";

export interface HouseSource {
  spec: HouseSpec | null;
  itemFiles: RoomItemsFile[];
  /** reference photo ids (file stem) in refs/, collages excluded */
  photos: string[];
  /** content hash of house.json + item files — identifies a published revision */
  revision: string;
  issues: Issue[];
}

/** Public listing photo manifest written by `pnpm house:publish`. */
export const PhotoManifest = z.object({
  photos: z.array(z.object({ id: z.string(), w: z.number(), h: z.number() })),
  cover: z.string().optional(),
});
export type PhotoManifest = z.infer<typeof PhotoManifest>;

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PHOTO = /\.(jpe?g|png|webp)$/i;
const ITEMS_GLOB = /^[\w./-]*\*[\w.-]*$/;

/** Reads houses/<slug>/ from disk. Never throws for bad content — returns issues instead. */
export class FileHouseRepository {
  constructor(
    private readonly root: string = path.join(process.cwd(), "houses"),
    private readonly publicRoot: string = path.join(process.cwd(), "public", "houses"),
  ) {}

  async listSlugs(): Promise<string[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    const slugs: string[] = [];
    for (const e of entries) {
      if (e.isDirectory() && SLUG.test(e.name) && (await this.exists(path.join(this.root, e.name, "house.json")))) slugs.push(e.name);
    }
    return slugs.sort();
  }

  async load(slug: string): Promise<HouseSource | null> {
    if (!SLUG.test(slug)) return null;
    const dir = this.inside(this.root, slug);
    const specPath = path.join(dir, "house.json");
    if (!(await this.exists(specPath))) return null;
    const issues: Issue[] = [];
    const hash = createHash("sha256");
    const fail = (where: string, msg: string): HouseSource => ({
      spec: null,
      itemFiles: [],
      photos: [],
      revision: "invalid",
      issues: [...issues, { level: "error", code: "schema", where, msg }],
    });

    const raw = await fs.readFile(specPath, "utf8");
    hash.update(raw);
    const json = this.parse(raw);
    if (!json.ok) return fail("house.json", json.error);
    const parsed = HouseSpec.safeParse(json.value);
    if (!parsed.success) {
      for (const e of parsed.error.issues) issues.push({ level: "error", code: "schema", where: `house.json:${e.path.join(".")}`, msg: e.message });
      return { spec: null, itemFiles: [], photos: [], revision: "invalid", issues };
    }
    const spec = parsed.data;
    if (spec.slug !== slug) issues.push({ level: "error", code: "slug-mismatch", where: "house.json:slug", msg: `slug "${spec.slug}" ≠ folder "${slug}"` });
    if (!ITEMS_GLOB.test(spec.items) || spec.items.includes("..")) return fail("house.json:items", "items must be a relative glob like work/rooms/*.items.json");

    const itemDir = this.inside(dir, path.dirname(spec.items));
    const suffix = path.basename(spec.items).replace("*", "");
    const files = (await fs.readdir(itemDir).catch(() => [])).filter((f) => f.endsWith(suffix)).sort();
    const itemFiles: RoomItemsFile[] = [];
    for (const f of files) {
      const text = await fs.readFile(path.join(itemDir, f), "utf8");
      hash.update(f).update(text);
      const j = this.parse(text);
      if (!j.ok) {
        issues.push({ level: "error", code: "json", where: f, msg: j.error });
        continue;
      }
      const res = RoomItemsFile.safeParse(j.value);
      if (res.success) itemFiles.push(res.data);
      else for (const e of res.error.issues) issues.push({ level: "error", code: "schema", where: `${f}:${e.path.join(".")}`, msg: e.message });
    }

    const refs = await fs.readdir(path.join(dir, "refs")).catch(() => []);
    const photos = refs
      .filter((f) => PHOTO.test(f) && !/collage|^plan\./i.test(f))
      .map((f) => f.replace(PHOTO, ""))
      .sort();

    return { spec, itemFiles, photos, revision: hash.digest("hex").slice(0, 10), issues };
  }

  /** Published listing photos (public/houses/<slug>/photos/manifest.json), or null. */
  async photoManifest(slug: string): Promise<PhotoManifest | null> {
    if (!SLUG.test(slug)) return null;
    const file = path.join(this.inside(this.publicRoot, slug), "photos", "manifest.json");
    const text = await fs.readFile(file, "utf8").catch(() => null);
    if (!text) return null;
    const j = this.parse(text);
    const res = j.ok ? PhotoManifest.safeParse(j.value) : null;
    return res?.success ? res.data : null;
  }

  private parse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
    }
  }

  /** Resolve `rel` under `base`; refuses paths that escape it. */
  private inside(base: string, rel: string): string {
    const p = path.resolve(base, rel);
    if (p !== base && !p.startsWith(base + path.sep)) throw new Error(`path escapes content root: ${rel}`);
    return p;
  }

  private async exists(p: string) {
    return fs.access(p).then(
      () => true,
      () => false,
    );
  }
}
