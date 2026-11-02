/**
 * Usage: pnpm exec tsx scripts/site-validate.ts <slug> [--json]
 * Exit 0 = no errors (warnings allowed). Exit 1 = errors. Exit 2 = usage / not found.
 */
import { SiteRepository } from "../src/server/site-repository";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error("usage: pnpm exec tsx scripts/site-validate.ts <slug> [--json]");
    process.exit(2);
  }
  const res = await new SiteRepository().load(slug);
  if (!res) {
    console.error(`sites/${slug}/site.json not found`);
    process.exit(2);
  }
  const { site, issues } = res;
  if (site && site.chapters.length === 0) issues.push({ level: "error", code: "no-chapters", where: "chapters", msg: "at least one chapter is required" });
  if (site) {
    site.chapters.forEach((c) => {
      if (!c.words.length) issues.push({ level: "error", code: "empty-narration", where: `chapters.${c.id}`, msg: "narration is empty" });
      const cam = c.camera;
      const ys = cam.kind === "orbit" ? [cam.h0, cam.h1] : [cam.from[1], cam.to[1]];
      if (ys.some((y) => y < 1.5)) issues.push({ level: "warn", code: "camera-low", where: `chapters.${c.id}`, msg: "camera dips below 1.5 m" });
    });
  }
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  if (args.includes("--json")) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors, warns }, null, 2));
  } else {
    for (const i of issues) console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.code}] ${i.where}: ${i.msg}`);
    if (site) {
      const total = site.chapters.reduce((s, c) => s + c.duration, 0);
      console.log(
        `\n${slug}: ${site.towers.length} towers (${site.towers.map((t) => t.floors).join("/")} floors) · ${site.context.length} context blocks · ` +
          `${site.filler.length} filler · ${site.landscape.palms.length} palms · ${site.elements.length} elements · ` +
          `${site.chapters.length} chapters (~${total.toFixed(0)} s)`,
      );
    }
    console.log(errors.length ? `\nFAIL — ${errors.length} error(s), ${warns.length} warning(s)` : `\nOK — 0 errors, ${warns.length} warning(s)`);
  }
  process.exit(errors.length ? 1 : 0);
}

main();
