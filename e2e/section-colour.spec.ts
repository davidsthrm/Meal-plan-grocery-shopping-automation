import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// David (24 November 2026): the sections' colours at the top "fade" when a tab is tapped,
// instead of changing at once.
test("a section's colour fades over to the next one's when its tab is tapped", async ({ page }) => {
  await signIn(page);
  await page.goto("/woche");
  const tint = () =>
    page.evaluate(() =>
      getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue("--section-tint"),
    );
  await expect.poll(tint).toBe("rgb(219, 241, 227)");

  // Tapped in the page itself, so that the colour is read a moment later, mid-way.
  const midway = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const tab = document.querySelector<HTMLAnchorElement>(
          'nav[aria-label="Hauptbereiche"] a[href="/einkauf"]',
        )!;
        // The section is the current one as the finger lands (`AppNav`).
        tab.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        tab.click();
        setTimeout(
          () =>
            resolve(
              getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue(
                "--section-tint",
              ),
            ),
          120,
        );
      }),
  );
  expect(midway).not.toBe("rgb(219, 241, 227)");
  expect(midway).not.toBe("rgb(218, 236, 250)");
  await expect.poll(tint).toBe("rgb(218, 236, 250)");
});
