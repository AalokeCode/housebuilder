import path from "node:path";

/**
 * Where authored models live on disk (read at build time — ship `models/` with the build).
 *   models/houses/<slug>/     house.json, refs/, work/, shots/, report.md   → /tour/<slug>, /preview/<slug>
 *   models/buildings/<slug>/  site.json (drone showcase)                     → /site/<slug>
 * Public assets keep their URL paths: public/houses/<slug>/ (crops, listing photos, og.jpg).
 */
export const MODELS_DIR = path.join(process.cwd(), "models");
export const HOUSES_DIR = path.join(MODELS_DIR, "houses");
export const BUILDINGS_DIR = path.join(MODELS_DIR, "buildings");
export const PUBLIC_HOUSES_DIR = path.join(process.cwd(), "public", "houses");

export const houseDir = (slug: string) => path.join(HOUSES_DIR, slug);
export const buildingDir = (slug: string) => path.join(BUILDINGS_DIR, slug);
