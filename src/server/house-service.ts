import { asset } from "@/assets/asset-url";
import { HouseCompiler } from "@/domain/compiler";
import type { CompiledHouse, Issue } from "@/domain/compiled";
import { photoRoom, type TourPhoto } from "@/domain/tour-model";
import { HouseValidator, type ValidateOptions } from "@/domain/validator";
import { FileHouseRepository } from "./house-repository";

export interface HouseResult {
  house: CompiledHouse | null;
  issues: Issue[];
  revision: string;
}

/** Everything the public tour needs — plain data, safe to cache and serialise to the client. */
export interface TourBundle {
  house: CompiledHouse;
  photos: TourPhoto[];
  cover: TourPhoto | null;
  revision: string;
}

/** Application service: load → compile → validate → (publish gate). */
export class HouseService {
  constructor(
    private readonly repo = new FileHouseRepository(),
    private readonly compiler = new HouseCompiler(),
    private readonly validator = new HouseValidator(),
  ) {}

  listSlugs() {
    return this.repo.listSlugs();
  }

  async get(slug: string, opts: ValidateOptions = {}): Promise<HouseResult> {
    const src = await this.repo.load(slug);
    if (!src) return { house: null, revision: "none", issues: [{ level: "error", code: "not-found", where: slug, msg: "models/houses/<slug>/house.json not found" }] };
    if (!src.spec) return { house: null, revision: src.revision, issues: src.issues };

    const { house, issues } = this.compiler.compile(src.spec, src.itemFiles);
    const all = this.validator.validate(src.spec, src.itemFiles, house, [...src.issues, ...issues], { photos: src.photos, ...opts });
    return { house, issues: all, revision: src.revision };
  }

  /** Draft or published bundle, regardless of validation (preview / authoring). */
  async bundle(slug: string): Promise<(HouseResult & { photos: TourPhoto[]; cover: TourPhoto | null }) | null> {
    const res = await this.get(slug);
    if (!res.house) return res.issues[0]?.code === "not-found" ? null : { ...res, photos: [], cover: null };
    const { photos, cover } = await this.photos(res.house);
    return { ...res, photos, cover };
  }

  /** Public gate: only published houses with zero validation errors. */
  async published(slug: string): Promise<TourBundle | null> {
    const res = await this.bundle(slug);
    if (!res?.house || res.house.meta.status !== "published") return null;
    const errors = res.issues.filter((i) => i.level === "error");
    if (errors.length) {
      // keep the public page unavailable rather than serving a broken model; details stay in /preview
      console.error(`[tour] ${slug}@${res.revision} has ${errors.length} validation error(s); not served publicly`);
      return null;
    }
    return { house: res.house, photos: res.photos, cover: res.cover, revision: res.revision };
  }

  async listPublished(): Promise<TourBundle[]> {
    const settled = await Promise.allSettled((await this.listSlugs()).map((s) => this.published(s)));
    return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  }

  private async photos(house: CompiledHouse): Promise<{ photos: TourPhoto[]; cover: TourPhoto | null }> {
    const manifest = await this.repo.photoManifest(house.slug);
    if (!manifest) return { photos: [], cover: null };
    const base = `/houses/${house.slug}/photos`;
    const photos = manifest.photos.map((p) => ({ id: p.id, w: p.w, h: p.h, src: asset(`${base}/${p.id}.webp`), thumb: asset(`${base}/${p.id}-thumb.webp`), room: photoRoom(house, p.id) }));
    return { photos, cover: photos.find((p) => p.id === manifest.cover) ?? photos[0] ?? null };
  }
}
