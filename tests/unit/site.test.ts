import { describe, expect, it } from "vitest";
import { compileSite } from "@/domain/site-compiler";
import { SiteRepository } from "@/server/site-repository";

describe("drone showcase", () => {
  it("sample site compiles without errors", async () => {
    const res = await new SiteRepository().load("bay-residences-sample");
    expect(res?.site).not.toBeNull();
    expect(res?.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(res!.site!.chapters.length).toBeGreaterThan(3);
  });
  it("rejects bad slugs and empty specs", async () => {
    expect(await new SiteRepository().load("../x")).toBeNull();
    expect(compileSite({} as never).site).toBeNull();
  });
});
