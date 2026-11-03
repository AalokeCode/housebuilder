import { expect, test, type Page } from "@playwright/test";

const SLUG = "dubai-1br-sample";

/** Collect console errors (warnings from three.js deprecations are ignored). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const ready = (page: Page) => expect(page.locator('[data-tour-ready="true"]')).toBeVisible({ timeout: 75_000 });

test("home lists published tours and showcases", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /1BR Apartment/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Residences/ })).toBeVisible();
});

test("unknown tour returns HTTP 404", async ({ page }) => {
  const res = await page.goto("/tour/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This tour isn't available")).toBeVisible();
  expect((await page.goto("/site/nope"))?.status()).toBe(404);
});

test("cover → explore in 3D → rooms, modes, photo compare, back", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/tour/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: /1BR Apartment/ })).toBeVisible();
  await page.getByRole("button", { name: "Explore in 3D" }).click();
  await ready(page);

  const tips = page.getByRole("button", { name: "Got it" });
  if (await tips.isVisible()) await tips.click();

  // rooms are reached from the map (bottom-left corner; collapsed on small screens)
  const showPlan = page.getByRole("button", { name: "Show floor plan" });
  if (await showPlan.isVisible()) await showPlan.click();
  await page.getByRole("button", { name: "Go to Bedroom" }).first().click(); // first = the in-tour map (the details page plan sits under the full-screen viewer)
  await expect(page.locator("header p span", { hasText: /^Bedroom$/ })).toBeVisible(); // the title chip's room status

  await page.getByRole("button", { name: "Dollhouse" }).click();
  await expect(page.getByText("Dollhouse overview")).toBeVisible();

  await page.getByRole("button", { name: "Compare photos" }).click();
  await page.getByRole("radio", { name: "Actual photo" }).click();
  await expect(page.getByAltText("Original listing photo")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Back to property details" }).click();
  await expect(page.getByRole("button", { name: "Explore in 3D" })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("guided tour plays, pauses and exits", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/tour/${SLUG}?tour=guided`);
  await ready(page);
  await expect(page.getByRole("button", { name: "Pause guided tour" })).toBeVisible();
  await page.getByRole("button", { name: "Next room" }).click();
  await page.getByRole("button", { name: "Pause guided tour" }).click();
  await expect(page.getByRole("button", { name: "Resume guided tour" })).toBeVisible();
  await page.getByRole("button", { name: "Exit" }).click();
  await expect(page.getByRole("button", { name: /Guided ·/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("stale camera deep link falls back to walk mode", async ({ page }) => {
  await page.goto(`/tour/${SLUG}?cam=zzz`);
  await ready(page);
  await expect(page.getByRole("button", { name: "Walk" })).toHaveAttribute("aria-pressed", "true");
});

test("photos gallery works without 3D", async ({ page }) => {
  await page.goto(`/tour/${SLUG}`);
  await page.getByRole("button", { name: /Photos \(/ }).click();
  await expect(page.getByRole("dialog", { name: "Listing photos" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Listing photos" })).toBeHidden();
});

test("drone showcase starts", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/site/bay-residences-sample");
  await page.getByRole("button", { name: /Start tour/ }).click();
  await expect(page.getByRole("button", { name: "Pause tour" })).toBeVisible();
  expect(errors).toEqual([]);
});
