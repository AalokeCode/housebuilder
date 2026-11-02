/**
 * Usage: pnpm house:preview <slug> [--port 3000]
 * Validates, then starts `next dev` and prints preview + photo-match URLs.
 */
import { spawn } from "node:child_process";
import { HouseService } from "../src/server/house-service";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--port");
  const portIdx = args.indexOf("--port");
  const port = portIdx >= 0 ? args[portIdx + 1] : "3000";
  if (!slug) {
    console.error("usage: pnpm house:preview <slug> [--port 3000]");
    process.exit(2);
  }
  const { house, issues } = await new HouseService().get(slug);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    for (const e of errors) console.log(`✖ [${e.code}] ${e.where}: ${e.msg}`);
    console.log("\nFix errors first (pnpm house:validate).");
    process.exit(1);
  }
  const base = `http://localhost:${port}/preview/${slug}`;
  console.log(`\nTour:      ${base}`);
  console.log(`Dollhouse: ${base}?mode=dollhouse`);
  for (const c of house!.photoCams) console.log(`Photo ${c.photo.padEnd(6)} ${base}?cam=${c.photo}`);
  console.log("");
  spawn("pnpm", ["exec", "next", "dev", "-p", port], { stdio: "inherit" });
}

main();
