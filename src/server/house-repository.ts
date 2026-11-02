import { promises as fs } from "node:fs";
import path from "node:path";
import { HouseSpec, RoomItemsFile } from "@/domain/house-spec";
import type { Issue } from "@/domain/compiled";

export interface HouseSource {
  spec: HouseSpec;
  itemFiles: RoomItemsFile[];
  /** reference photo ids (file stem) in refs/, collages excluded */
  photos: string[];
  issues: Issue[];
}

const PHOTO = /\.(jpe?g|png|webp)$/i;

/** Reads houses/<slug>/ from disk. */
export class FileHouseRepository {
  constructor(private readonly root: string = path.join(process.cwd(), "houses")) {}

  async listSlugs(): Promise<string[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    const slugs: string[] = [];
    for (const e of entries) {
      if (e.isDirectory() && (await this.exists(path.join(this.root, e.name, "house.json")))) slugs.push(e.name);
    }
    return slugs.sort();
  }

  async load(slug: string): Promise<HouseSource | null> {
    const dir = path.join(this.root, slug);
    const specPath = path.join(dir, "house.json");
    if (!(await this.exists(specPath))) return null;
    const issues: Issue[] = [];

    const parsed = HouseSpec.safeParse(JSON.parse(await fs.readFile(specPath, "utf8")));
    if (!parsed.success) {
      for (const e of parsed.error.issues) issues.push({ level: "error", code: "schema", where: `house.json:${e.path.join(".")}`, msg: e.message });
      return { spec: null as unknown as HouseSpec, itemFiles: [], photos: [], issues };
    }
    const spec = parsed.data;

    const itemDir = path.join(dir, path.dirname(spec.items));
    const suffix = path.basename(spec.items).replace("*", "");
    const files = (await fs.readdir(itemDir).catch(() => [])).filter((f) => f.endsWith(suffix)).sort();
    const itemFiles: RoomItemsFile[] = [];
    for (const f of files) {
      const res = RoomItemsFile.safeParse(JSON.parse(await fs.readFile(path.join(itemDir, f), "utf8")));
      if (res.success) itemFiles.push(res.data);
      else for (const e of res.error.issues) issues.push({ level: "error", code: "schema", where: `${f}:${e.path.join(".")}`, msg: e.message });
    }

    const refs = await fs.readdir(path.join(dir, "refs")).catch(() => []);
    const photos = refs
      .filter((f) => PHOTO.test(f) && !/collage|^plan\./i.test(f))
      .map((f) => f.replace(PHOTO, ""))
      .sort();

    return { spec, itemFiles, photos, issues };
  }

  private async exists(p: string) {
    return fs.access(p).then(
      () => true,
      () => false,
    );
  }
}
