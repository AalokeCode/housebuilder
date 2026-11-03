/**
 * Usage: pnpm house:validate <slug> [--shell] [--room <roomId>] [--json]
 * Exit 0 = no errors (warnings allowed). Exit 1 = errors.
 */
import { isOutdoor } from "../src/domain/house-spec";
import { HouseService } from "../src/server/house-service";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--room");
  if (!slug) {
    console.error("usage: pnpm house:validate <slug> [--shell] [--room <roomId>] [--json]");
    process.exit(2);
  }
  const roomIdx = args.indexOf("--room");
  const opts = { shell: args.includes("--shell"), room: roomIdx >= 0 ? args[roomIdx + 1] : undefined };

  const { house, issues } = await new HouseService().get(slug, opts);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  if (args.includes("--json")) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors, warns }, null, 2));
  } else {
    for (const i of issues) console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.code}] ${i.where}: ${i.msg}`);
    if (house) {
      const area = house.rooms.filter((r) => !isOutdoor(r.type)).reduce((s, r) => s + r.area, 0);
      console.log(
        `\n${slug}: ${house.rooms.length} rooms (${area.toFixed(1)} m² interior) · ${house.walls.length} walls · ` +
          `${house.walls.reduce((s, w) => s + w.openings.length, 0)} openings · ${house.items.length} items ` +
          `(${house.items.filter((i) => i.placeholder).length} placeholders) · ${house.hotspots.length} hotspots`,
      );
    }
    console.log(errors.length ? `\nFAIL — ${errors.length} error(s), ${warns.length} warning(s)` : `\nOK — 0 errors, ${warns.length} warning(s)`);
  }
  process.exit(errors.length ? 1 : 0);
}

main();
