import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// David (24 November 2026): "when changing tabs fast it reloads the whole page sometimes".
// After a whole page has loaded, the phone shows it before its scripts have run, and a tab
// tapped in that moment was followed by the browser itself: the whole page loaded again,
// and each quick tap after it did the same. The scripts are held back here until the taps
// are done, so that the moment lasts long enough on any machine.

// The service worker would hand out the scripts itself, past the hold.
test.use({ serviceWorkers: "block" });

test("tabs tapped fast before the page has started do not load the whole page again", async ({
  page,
}) => {
  await signIn(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/chunks\/[^?]*\.js/, async (route) => {
    await held;
    await route.continue().catch(() => {});
  });

  await page.goto("/woche", { waitUntil: "commit" });
  // The page as the phone shows it then: with its styles, which are not held back.
  await page.locator("nav").first().waitFor({ state: "attached" });
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
      (link) => link.sheet,
    ),
  );
  const tab = (name: string) =>
    page.getByRole("navigation", { name: "Hauptbereiche" }).getByRole("link", { name });
  await expect(tab("Einkauf")).toBeVisible();
  // Whatever loads the whole page again forgets this.
  await page.evaluate(() => Object.assign(window, { stillHere: true }));
  const loads: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      loads.push(request.url());
    }
  });

  for (const name of ["Einkauf", "Rezepte", "Favoriten"]) {
    await tab(name).click();
    await page.waitForTimeout(150);
  }
  release();

  // The last tap counts, once the page has started.
  await expect(page).toHaveURL(/\/favoriten$/);
  await expect(tab("Favoriten")).toHaveAttribute("aria-current", "page");
  expect(loads).toEqual([]);
  expect(await page.evaluate(() => "stillHere" in window)).toBe(true);
});
