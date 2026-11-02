import { HouseCompiler } from "@/domain/compiler";
import type { CompiledHouse, Issue } from "@/domain/compiled";
import { HouseValidator, type ValidateOptions } from "@/domain/validator";
import { FileHouseRepository } from "./house-repository";

export interface HouseResult {
  house: CompiledHouse | null;
  issues: Issue[];
}

/** Application service: load → compile → validate. */
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
    if (!src) return { house: null, issues: [{ level: "error", code: "not-found", where: slug, msg: "houses/<slug>/house.json not found" }] };
    if (src.issues.some((i) => i.level === "error") && !src.spec) return { house: null, issues: src.issues };

    const { house, issues } = this.compiler.compile(src.spec, src.itemFiles);
    const all = this.validator.validate(src.spec, src.itemFiles, house, [...src.issues, ...issues], { photos: src.photos, ...opts });
    return { house, issues: all };
  }
}
