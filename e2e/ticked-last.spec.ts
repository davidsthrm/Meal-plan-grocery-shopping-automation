import { expect, test, type Locator, type Page } from "@playwright/test";
import { planAsExtra, resetHousehold, resetLibrary, signIn } from "./fixtures";
import { sheet } from "./helpers";

// A week far enough ahead that every errand of it is still to come.
const WEEK = "2027-03-01";
const MONDAY = "Supermarkt, Montag, 1. März";

test.beforeEach(async ({ page }) => {
  await resetHousehold();
  await resetLibrary();
  await signIn(page);
  // Cakes for an invitation: eggs, butter and lemons on Monday's note, and grapes written on.
  await planAsExtra("Zitronen-Mohn-Kuchen", WEEK);
  await page.goto(`/einkauf?w=${WEEK}&zettel=${WEEK}.supermarket`);
  const write = page.getByLabel("Auf den Zettel schreiben");
  await write.fill("Weintrauben");
  await write.press("Enter");
  await expect(sheet(page, MONDAY)).toContainText("Weintrauben");
});

const region = (within: Locator, name: string) => within.getByRole("region", { name, exact: true });
const rows = (within: Locator, text: string) =>
  within.getByRole("listitem").filter({ hasText: text });

async function openShop(page: Page): Promise<Locator> {
  await page.getByRole("link", { name: "Jetzt einkaufen" }).click();
  const shop = page.getByRole("dialog", { name: /^Einkaufen/ });
  await expect(shop).toBeVisible();
  return shop;
}

test("in the shop a tick puts a line under Gekauft, in its kind, and a tap brings it back", async ({
  page,
}) => {
  const shop = await openShop(page);
  const fruit = region(shop, "Obst & Gemüse");
  const bought = region(shop, "Gekauft");

  await shop.getByRole("button", { name: "Weintrauben", exact: true }).click();
  await expect(rows(region(bought, "Obst & Gemüse, gekauft"), "Weintrauben")).toHaveCount(1);
  await expect(rows(fruit, "Weintrauben")).toHaveCount(0);
  await expect(bought.getByRole("heading", { name: "Gekauft 1" })).toBeVisible();
  await expect(shop.getByText("Weintrauben: unter Gekauft")).toBeAttached();
  // Last of all, under what is still open.
  const eggs = region(shop, "Eier");
  expect((await bought.boundingBox())!.y).toBeGreaterThan((await eggs.boundingBox())!.y);

  // Tapped again, it is back in its kind at once.
  await bought.getByRole("button", { name: "Weintrauben", exact: true }).click();
  await expect(rows(fruit, "Weintrauben")).toHaveCount(1);
  await expect(bought).toHaveCount(0);

  // Ticked from the keyboard, the focus goes on to the next open line.
  await shop.getByRole("button", { name: "Weintrauben", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(rows(bought, "Weintrauben")).toHaveCount(1);
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("aria-pressed", "false");
  await expect(focused).not.toHaveText("Weintrauben");
});

test("two quick ticks go together, and neither the server nor a reload moves them again", async ({
  page,
}) => {
  const shop = await openShop(page);
  const bought = region(shop, "Gekauft");
  // Every time a row of the two is put into the view.
  await page.evaluate(`(() => {
    window.__put = { Weintrauben: 0, Eier: 0 };
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) {
          if (!(node instanceof Element)) continue;
          for (const row of [node, ...node.querySelectorAll("li[data-line]")])
            if (row.matches("li[data-line]"))
              for (const name of Object.keys(window.__put))
                if (row.textContent.includes(name)) window.__put[name]++;
        }
    }).observe(document.querySelector("dialog.store-view"), { childList: true, subtree: true });
  })()`);
  // The page read again from the server once it has the ticks (`TickRefresh`).
  const readAgain = page.waitForResponse((response) => response.request().headers()["rsc"] === "1");

  await shop.getByRole("button", { name: "Weintrauben", exact: true }).click();
  await shop.getByRole("button", { name: /Eier$/ }).click();
  await expect(bought.getByRole("heading", { name: "Gekauft 2" })).toBeVisible();
  await expect(rows(bought, "Weintrauben")).toHaveCount(1);
  await expect(rows(bought, "Eier")).toHaveCount(1);

  await readAgain;
  await page.waitForTimeout(1500);
  const put = await page.evaluate("window.__put");
  expect(put).toEqual({ Weintrauben: 1, Eier: 1 });
  const order = await bought.innerText();

  // Read again from the server, the view opens with them under "Gekauft" at once.
  await page.reload();
  const again = await openShop(page);
  await expect(region(again, "Gekauft")).toBeVisible();
  expect(await region(again, "Gekauft").innerText()).toBe(order);
});

test("on the note ticked lines go to its very end, and an opened one stays until closed", async ({
  page,
}) => {
  const note = sheet(page, MONDAY);
  const bought = region(note, "Gekauft");

  await note.getByRole("button", { name: "Weintrauben: erledigt" }).click();
  await expect(rows(region(bought, "Obst & Gemüse, gekauft"), "Weintrauben")).toHaveCount(1);
  // After everything else: writing on the note stays next to what is still open.
  const otherDay = note.getByText("An einem anderen Tag einkaufen");
  expect((await bought.boundingBox())!.y).toBeGreaterThan((await otherDay.boundingBox())!.y);
  expect((await note.getByLabel("Auf den Zettel schreiben").boundingBox())!.y).toBeLessThan(
    (await bought.boundingBox())!.y,
  );

  // Opened to see what it is for, the eggs stay where they are while ticked, until closed.
  const eggs = rows(note, "Eier");
  await eggs.locator("summary").click();
  await eggs.getByRole("button", { name: /Eier: erledigt$/ }).click();
  await page.waitForTimeout(1200);
  await expect(rows(bought, "Eier")).toHaveCount(0);
  await expect(eggs.locator("details[open]")).toHaveCount(1);
  await eggs.locator("summary").click();
  await expect(rows(bought, "Eier")).toHaveCount(1);
  await expect(bought.getByRole("heading", { name: "Gekauft 2" })).toBeVisible();

  // Opened again under "Gekauft", the grapes come back to their kind.
  await bought.getByRole("button", { name: "Weintrauben: wieder offen" }).click();
  await expect(rows(region(note, "Obst & Gemüse"), "Weintrauben")).toHaveCount(1);
  await expect(rows(bought, "Weintrauben")).toHaveCount(0);

  // Read again, the eggs are there at once.
  await page.reload();
  await expect(rows(region(sheet(page, MONDAY), "Gekauft"), "Eier")).toHaveCount(1);
});
