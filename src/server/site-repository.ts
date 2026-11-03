import { promises as fs } from "node:fs";
import path from "node:path";
import { compileSite, type CompiledSite, type SiteIssue } from "@/domain/site-compiler";
import { BUILDINGS_DIR } from "./paths";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Reads models/buildings/<slug>/site.json from disk and compiles it. */
export class SiteRepository {
  constructor(private readonly root: string = BUILDINGS_DIR) {}

  async listSlugs(): Promise<string[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    return entries.filter((e) => e.isDirectory() && SLUG.test(e.name)).map((e) => e.name).sort();
  }

  async load(slug: string): Promise<{ site: CompiledSite | null; issues: SiteIssue[] } | null> {
    if (!SLUG.test(slug)) return null;
    const file = path.join(this.root, slug, "site.json");
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return { site: null, issues: [{ level: "error", code: "json", where: "site.json", msg: (e as Error).message }] };
    }
    return compileSite(json as never, slug);
  }
}
