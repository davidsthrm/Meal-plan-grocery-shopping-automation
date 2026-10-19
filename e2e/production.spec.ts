import { expect, test, type Page } from "@playwright/test";
import { otherHouseholds, resetHousehold, resetLibrary, signIn } from "./fixtures";

// The smoke test of a deployment, as the test household: `npm run e2e:production`. It signs
// in, plans a meal, ticks a line without a connection and sees the tick arrive, and checks
// that no other household changed meanwhile. Under `npm run e2e` it is left out.

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";

test.beforeEach(async () => {
  await resetHousehold();
  await resetLibrary();
});

/** Whether the service worker has kept the page shown, with `text` on it. */
async function keptWith(page: Page, text: string): Promise<boolean> {
  const url = new URL(page.url());
  return page.evaluate(
    async ({ key, text }) => {
      const kept = await caches.match(key);
      return kept ? (await kept.text()).includes(text) : false;
    },
    { key: url.origin + url.pathname + url.search, text },
  );
}

async function plan(page: Page, meal: string, recipe: string) {
  await page.getByRole("link", { name: `${meal} planen` }).click();
  await page.getByPlaceholder("Titel oder Zutat").fill(recipe);
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("button", { name: `${recipe} einplanen` })
    .click();
  await page.getByRole("link", { name: "← Wochenplan" }).click();
  await expect(page.getByRole("region", { name: meal, exact: true })).toContainText(recipe);
}

test("@production sign in, plan a meal, tick offline, and the family's data stays as it was", async ({
  page,
  context,
}) => {
  const before = await otherHouseholds();
  await signIn(page);
  // A deployment is reached over HTTPS only; a local build for a dry run is not.
  const address = new URL(page.url());
  if (address.hostname !== "localhost") expect(address.protocol).toBe("https:");

  // Installable: the manifest and the service worker are served over HTTPS.
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  const headers = (await page.request.get("/login")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");

  // A meal planned shows on the shopping note of its errand.
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  await expect(page.getByRole("region", { name: "Supermarkt, Montag, 1. März" })).toContainText(
    "200 ml Sahne",
  );

  // The running week's note, kept for the shop: ticked without a connection, sent later.
  await page.goto("/einkauf");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page
    .getByRole("list", { name: "Zettel" })
    .getByRole("link", { name: /^Supermarkt, / })
    .first()
    .click();
  const write = page.getByLabel("Auf den Zettel schreiben");
  await write.fill("Milch");
  await write.press("Enter");
  await expect(page.getByRole("button", { name: "Milch: erledigt" })).toBeVisible();
  await expect.poll(() => keptWith(page, "Milch: erledigt"), { timeout: 20_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Offline:" })).toBeVisible();
  await page.getByRole("button", { name: "Milch: erledigt" }).click();
  await expect(page.getByText("Offline – 1 Häkchen wartet")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Häkchen wartet")).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Milch: wieder offen" })).toBeVisible();

  // Nothing of any other household changed.
  expect(await otherHouseholds()).toEqual(before);
});
