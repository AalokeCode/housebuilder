import manifest from "./asset-manifest.json";

const HASHES: Record<string, string> = manifest;

/** Versioned URL for a file under /public (`?v=<content hash>`), so it can be cached immutably. */
export function asset(url: string): string {
  const v = HASHES[url];
  return v ? `${url}?v=${v}` : url;
}
