import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pathClear, walkBlocked } from "@/domain/collision";
import { HouseCompiler } from "@/domain/compiler";
import { guidedStops, photoRoom, roomInfos, speechSeconds, tourFacts, yawTowards } from "@/domain/tour-model";
import { FileHouseRepository } from "@/server/house-repository";
import { HouseService } from "@/server/house-service";

const service = new HouseService();
const SAMPLE = "dubai-1br-sample";

describe("sample house", async () => {
  const { house, issues } = await service.get(SAMPLE);

  it("compiles with zero validation errors", () => {
    expect(house).not.toBeNull();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("is published and has a revision", async () => {
    const pub = await service.published(SAMPLE);
    expect(pub?.house.meta.status).toBe("published");
    expect(pub?.revision).toMatch(/^[0-9a-f]{10}$/);
    expect(pub?.photos.length).toBeGreaterThan(0);
    expect(pub?.photos[0].src).toMatch(/\?v=[0-9a-f]{8}$/);
  });

  it("derives buyer facts", () => {
    const f = tourFacts(house!);
    expect(f.bedrooms).toBe(1);
    expect(f.bathrooms).toBe(1);
    expect(f.interiorArea).toBeGreaterThan(40);
    expect(f.estimated).toBe(true);
  });

  it("builds one guided stop per tour entry, standing in a walkable spot", () => {
    const stops = guidedStops(house!);
    expect(stops.map((s) => s.room)).toEqual(["hall", "bathroom", "bedroom", "balcony", "living", "kitchen"]);
    for (const s of stops) {
      expect(walkBlocked(house!, s.pos)).toBe(false);
      expect(s.seconds).toBeGreaterThanOrEqual(4);
    }
  });

  it("maps photos to the room they show; the bathroom is not photographed", () => {
    expect(photoRoom(house!, "01b")).toBe("bedroom");
    expect(photoRoom(house!, "01a")).toBe("living");
    expect(roomInfos(house!).find((r) => r.id === "bathroom")?.photos).toEqual([]);
  });

  it("blocks walking through furniture and walls", () => {
    expect(house!.obstacles.length).toBeGreaterThan(5);
    const bed = house!.items.find((i) => i.builder === "bed")!;
    expect(walkBlocked(house!, [bed.pos[0], bed.pos[2]])).toBe(true);
    expect(walkBlocked(house!, [-1, -1])).toBe(true);
    // hall → bathroom passes a wall: never a straight clear path
    expect(pathClear(house!, [0.8, 3.5], [0.8, 1.0])).toBe(false);
  });
});

describe("tour model helpers", () => {
  it("yaw 0 faces −z (north on plan)", () => {
    expect(yawTowards([0, 0], [0, -1])).toBeCloseTo(0);
    expect(yawTowards([0, 0], [-1, 0])).toBeCloseTo(Math.PI / 2);
  });
  it("estimates speech time with a floor", () => {
    expect(speechSeconds("")).toBe(4);
    expect(speechSeconds("word ".repeat(26))).toBeGreaterThan(10);
  });
});

describe("repository hardening", () => {
  const repo = new FileHouseRepository();

  it("rejects path-like and malformed slugs", async () => {
    expect(await repo.load("../package")).toBeNull();
    expect(await repo.load("a/b")).toBeNull();
    expect(await repo.load("UPPER")).toBeNull();
    expect(await repo.load("does-not-exist")).toBeNull();
  });

  it("turns malformed JSON into issues instead of throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "houses-"));
    await mkdir(path.join(root, "broken"));
    await writeFile(path.join(root, "broken", "house.json"), "{ not json");
    const res = await new FileHouseRepository(root).load("broken");
    expect(res?.spec).toBeNull();
    expect(res?.issues[0].msg).toMatch(/invalid JSON/);
  });

  it("an unpublished or broken house is never served publicly", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "houses-"));
    await mkdir(path.join(root, "broken"));
    await writeFile(path.join(root, "broken", "house.json"), "{}");
    const svc = new HouseService(new FileHouseRepository(root));
    expect(await svc.published("broken")).toBeNull();
    expect(await svc.listPublished()).toEqual([]);
  });
});

describe("compiler", () => {
  it("defaults the guided tour to the first hotspot of each room", () => {
    const { house } = new HouseCompiler().compile({
      spec: "housespec/1",
      slug: "box",
      meta: { title: "Box", kind: "apartment", ceiling: 2.6, sources: ["photos"], status: "draft" },
      rooms: [
        { id: "a", type: "living", name: "A", poly: [[0, 0], [3, 0], [3, 3], [0, 3]], floor: { color: "#cccccc" }, walls: { color: "#eeeeee" } },
        { id: "b", type: "bedroom", name: "B", poly: [[3, 0], [6, 0], [6, 3], [3, 3]], floor: { color: "#cccccc" }, walls: { color: "#eeeeee" } },
      ],
      openings: [],
      fixtures: [],
      items: "work/rooms/*.items.json",
      lights: [],
      hotspots: [
        { id: "h1", room: "a", pos: [1, 1] },
        { id: "h2", room: "a", pos: [2, 2] },
        { id: "h3", room: "b", pos: [4, 1] },
      ],
      photoCams: [],
      narration: {},
    });
    expect(house.tour).toEqual(["h1", "h3"]);
  });
});
