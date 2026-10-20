import { expect, test, type Page } from "@playwright/test";
import { resetHousehold, resetLibrary, signIn } from "./fixtures";

// The notes of the running week are what a phone keeps for the shop, so this test works on
// the running week, whatever day it is, and on lines it writes itself.
//
// It needs a production build: `npm run e2e:offline`. The dev server's own scripts wait for
// their connection to it before a page comes to life, so offline nothing could be ticked.
// Under `npm run e2e` it is skipped.

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
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

test("a note works in the shop without a connection, and its ticks arrive later", async ({
  page,
  context,
}) => {
  await page.goto("/einkauf");
  test.skip(
    (await page.content()).includes("hmr-client"),
    "Offline needs a production build: npm run e2e:offline",
  );
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page
    .getByRole("list", { name: "Zettel" })
    .getByRole("link", { name: /^Supermarkt, / })
    .first()
    .click();
  const write = page.getByLabel("Auf den Zettel schreiben");
  for (const text of ["Milch", "Brot"]) {
    await write.fill(text);
    await write.press("Enter");
    await expect(page.getByRole("button", { name: `${text}: erledigt` })).toBeVisible();
  }
  // The page is kept again a moment after it changed. (Every note names all ingredients for
  // typing: what counts is the line's own box.)
  await expect.poll(() => keptWith(page, "Brot: erledigt"), { timeout: 20_000 }).toBe(true);

  // In the shop: no connection. The note opens all the same.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Offline:" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Brot: erledigt" })).toBeVisible();

  // The view for the shop: the whole row is the button, and the tick waits on the phone.
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen: / });
  await expect(shop).toContainText("0 von 2");
  await shop.getByRole("button", { name: "Milch", exact: true }).click();
  await expect(shop.getByRole("button", { name: "Milch", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(shop).toContainText("1 von 2");
  await expect(shop).toContainText("Offline – 1 Häkchen wartet");
  await shop.getByRole("button", { name: "Fertig" }).click();
  await expect(shop).toBeHidden();

  // Anything else needs the server: it is not sent, and the bar says why.
  await write.fill("Butter");
  await write.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Offline:" })).toContainText(
    "Das geht erst wieder mit Verbindung.",
  );

  // The app closed and opened again in the shop: the tick is still there.
  await page.reload();
  await expect(page.getByRole("button", { name: "Milch: wieder offen" })).toBeVisible();
  await expect(page.getByText("Offline – 1 Häkchen wartet")).toBeVisible();

  // A page that is not kept says that it needs a connection.
  await page.goto("/einstellungen");
  await expect(page.getByRole("heading", { name: "Keine Verbindung" })).toBeVisible();
  await expect(page.getByText("Die Einstellungen werden auf dem Server gespeichert")).toBeVisible();
  await page.goBack();

  // Back online, the tick is sent by itself, and the server has it.
  await context.setOffline(false);
  await expect(page.getByText("Häkchen wartet")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^Supermarkt, / })).toContainText(
    "1 offen, 1 erledigt",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Milch: wieder offen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Brot: erledigt" })).toBeVisible();
});
