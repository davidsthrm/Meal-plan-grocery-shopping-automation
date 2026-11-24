import { expect, test, type Page } from "@playwright/test";
import { resetHousehold, resetLibrary, signIn } from "./fixtures";
import { plan } from "./helpers";

// David on his iPhone (24 November 2026): in the app on the home screen, the plan's PDF and a
// note's opened in a view without a share button, to be neither printed nor saved.

// A week far enough ahead that every meal of it is still to come.
const WEEK = "2027-03-01";
// The steak of Tuesday's dinner is bought at the butcher's on Monday.
const BUTCHER = `/einkauf?w=${WEEK}&zettel=${WEEK}.butcher`;

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
});

interface Shared {
  title: string;
  files: { name: string; type: string; head: string }[];
}

/**
 * The app as opened from the home screen, on a device that shares files. Its share sheet is a
 * spy that keeps what it was handed; it fails with the errors named, one call after the
 * other, as Safari does.
 */
async function installed(page: Page, failures: string[] = []) {
  await page.addInitScript((failures: string[]) => {
    const media = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query === "(display-mode: standalone)"
        ? ({ matches: true, media: query } as MediaQueryList)
        : media(query);
    const shared: unknown[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "canShare", {
      value: (data: ShareData) => (data.files?.length ?? 0) > 0,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        const failure = failures.shift();
        if (failure) throw new DOMException(failure, failure);
        const files = await Promise.all(
          (data.files ?? []).map(async (file) => ({
            name: file.name,
            type: file.type,
            head: await file.slice(0, 5).text(),
          })),
        );
        shared.push({ title: data.title, files });
      },
    });
  }, failures);
}

const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { shared: Shared[] }).shared);

/** What a share sheet was handed: one PDF with the name given. */
const pdf = (name: string): Shared => ({
  title: name,
  files: [{ name: `${name}.pdf`, type: "application/pdf", head: "%PDF-" }],
});

test("in the installed app the PDFs go to the share sheet, to print or keep", async ({ page }) => {
  await installed(page);
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  await page.getByRole("link", { name: "Drucken" }).click();
  await expect.poll(() => shared(page)).toEqual([pdf("Wochenplan 1.–7. März")]);
  // Nothing opened inside the app.
  expect(page.context().pages()).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/woche\\?w=${WEEK}`));

  // A note picked up, and all of them at the end of the notes.
  await page.goto(BUTCHER);
  await page.getByRole("link", { name: "Als PDF", exact: true }).click();
  await expect
    .poll(async () => (await shared(page)).at(-1))
    .toEqual(pdf("Einkaufszettel Mo 1. Metzger"));
  await page.goto(`/einkauf?w=${WEEK}`);
  await page.getByRole("link", { name: "Alle Zettel als PDF" }).click();
  await expect
    .poll(async () => (await shared(page)).at(-1))
    .toEqual(pdf("Einkaufszettel 1.–7. März"));
  await expect(page).toHaveURL(`/einkauf?w=${WEEK}`);

  // Without a connection there is no PDF, and the bar at the foot says so.
  await page.goto(BUTCHER);
  await page.context().setOffline(true);
  await page.getByRole("link", { name: "Als PDF", exact: true }).click();
  await expect(page.getByText("Offline: Das geht erst wieder mit Verbindung.")).toBeVisible();
  expect(await shared(page)).toEqual([]);
  await expect(page).toHaveURL(BUTCHER);
  await page.context().setOffline(false);
});

test("a PDF that came too late for its tap is shared by the next one", async ({ page }) => {
  // Safari refuses a share once the tap's moment has run out; closing the sheet is no error.
  await installed(page, ["NotAllowedError", "", "AbortError"]);
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  let asked = 0;
  page.on("request", (request) => {
    if (request.url().includes("/woche/pdf")) asked += 1;
  });

  const print = page.getByRole("link", { name: "Drucken" });
  await print.click();
  const ready = page.getByRole("link", { name: "PDF teilen" });
  await expect(ready).toBeVisible();
  expect(await shared(page)).toEqual([]);
  // The next tap shares the PDF already here, at once.
  await ready.click();
  await expect.poll(() => shared(page)).toEqual([pdf("Wochenplan 1.–7. März")]);
  await expect(print).toBeVisible();
  expect(asked).toBe(1);

  // The sheet closed without anything chosen: the plan's button is as it was.
  await print.click();
  await expect.poll(() => asked).toBe(2);
  await expect(print).toBeVisible();
  await expect(ready).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("in a browser the PDFs open as before", async ({ page }) => {
  await page.goto(`/woche?w=${WEEK}`);
  await plan(page, "Dienstag Abend", "Pfeffersteak");
  // The plan in a tab of its own, where the browser prints and keeps it.
  const tab = page.context().waitForEvent("page");
  const opened = page
    .context()
    .waitForEvent("request", (request) => request.url().endsWith(`/woche/pdf?w=${WEEK}`));
  await page.getByRole("link", { name: "Drucken" }).click();
  expect((await opened).isNavigationRequest()).toBe(true);
  expect(await tab).not.toBe(page);

  // A note, and all of them, as a file.
  await page.goto(BUTCHER);
  let file = page.waitForEvent("download");
  await page.getByRole("link", { name: "Als PDF", exact: true }).click();
  expect((await file).suggestedFilename()).toBe(`Einkaufszettel-${WEEK}.butcher.pdf`);
  await page.goto(`/einkauf?w=${WEEK}`);
  file = page.waitForEvent("download");
  await page.getByRole("link", { name: "Alle Zettel als PDF" }).click();
  expect((await file).suggestedFilename()).toBe(`Einkaufszettel-${WEEK}.pdf`);
});
