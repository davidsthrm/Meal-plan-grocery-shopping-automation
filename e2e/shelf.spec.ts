import { expect, test, type Page } from "@playwright/test";
import { planAsExtra, resetLibrary, signIn } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await resetLibrary();
  await signIn(page);
});

/** Opens the bar for the ticked recipes. */
async function openSelection(page: Page, count: string) {
  const bar = page.locator(".selection-bar");
  await expect(bar.getByRole("status")).toHaveText(count);
  await bar.locator("summary").click();
  return bar;
}

test("the Regal lists every recipe and changes the ticked ones together", async ({ page }) => {
  await page.goto("/rezepte");
  await page
    .getByRole("navigation", { name: "Ansicht" })
    .getByRole("link", { name: "Regal" })
    .click();
  await expect(page.getByRole("heading", { name: "Regal" })).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("20 Rezepte");
  // Nothing ticked: the bar is out of sight.
  await expect(page.locator(".selection-bar")).toBeHidden();

  await page.getByLabel("Lachs mit Currysahne auswählen").check();
  await page.getByLabel("Pilzrisotto auswählen").check();
  let bar = await openSelection(page, "2 Rezepte ausgewählt");
  await bar.getByLabel("Stichwort hinzufügen").fill("Omas Rezept");
  await expect(bar.getByText("Neu unter „Eigene“.")).toBeVisible();
  await bar.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("„Omas Rezept“ steht jetzt bei 2 Rezepten.")).toBeVisible();

  // A name a letter away is the tag there is: no second "Omas Rezept".
  await page.getByLabel("Käsespätzle auswählen").check();
  bar = await openSelection(page, "1 Rezept ausgewählt");
  await bar.getByLabel("Stichwort hinzufügen").fill("Oma Rezept");
  await expect(bar.getByText("Wird zu „Omas Rezept“.")).toBeVisible();
  await bar.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("„Omas Rezept“ steht jetzt bei 1 Rezept.")).toBeVisible();

  // An effort for every recipe of the page, and the list narrowed to what still lacks one.
  await page.goto("/rezepte/regal?ohne=aufwand");
  const before = await page.getByRole("status").first().innerText();
  expect(before).not.toBe("0 Rezepte");
  await page.getByText("Alle auf dieser Seite").click();
  const count = Number(before.split(" ")[0]);
  bar = await openSelection(
    page,
    count === 1 ? "1 Rezept ausgewählt" : `${count} Rezepte ausgewählt`,
  );
  await bar.getByLabel("Aufwand").selectOption({ label: "Alltagsküche" });
  await bar.getByRole("button", { name: "Setzen" }).last().click();
  await expect(page.getByText("Aufwand „Alltagsküche“.")).toBeVisible();
  await expect(page.getByText("Kein Rezept passt dazu.")).toBeVisible();

  // The tags' own page counts the recipes behind each.
  await page.goto("/rezepte/stichworte");
  const own = page.getByRole("region", { name: "Eigene" });
  await expect(own.getByRole("listitem").filter({ hasText: "Omas Rezept" })).toContainText(
    "3 Rezepte",
  );
});

test("a sorted column and a page of the Regal live in its address", async ({ page }) => {
  await page.goto("/rezepte/regal?sortierung=titel&richtung=ab");
  const titles = page.locator("tbody tr td:nth-child(2) a");
  await expect(titles.first()).toHaveText("Zitronenhähnchen");
  await page.goto("/rezepte/regal?sortierung=titel");
  await expect(titles.first()).toHaveText("Forelle Müllerin");
});

test("a recipe is deleted after asking, one on a plan stays", async ({ page }) => {
  await planAsExtra("Pfeffersteak", "2026-10-12");
  await page.goto("/rezepte/regal");

  // The way to delete is a sign on a wide screen and under "Mehr" on a phone; both lead here.
  const ask = async (title: string) => {
    const href = await page.locator(`a[aria-label="Löschen: ${title}"]`).getAttribute("href");
    await page.goto(href!);
  };

  await ask("Pfeffersteak");
  const refused = page.locator("#loeschen");
  await expect(refused).toContainText("„Pfeffersteak“ steht im Plan und bleibt deshalb.");
  await expect(refused).toContainText("Außerdem in der Woche vom 12. Oktober 2026");
  await expect(refused.getByRole("button", { name: "Löschen" })).toHaveCount(0);

  await ask("Wurstsalat");
  await expect(page.getByText("„Wurstsalat“ löschen?")).toBeVisible();
  await page.locator("#loeschen").getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("Das Rezept ist gelöscht.")).toBeVisible();
  await expect(page.getByRole("status").nth(1)).toHaveText("19 Rezepte");
  await expect(page.getByRole("link", { name: "Wurstsalat", exact: true })).toHaveCount(0);
});

test("tags are changed in place on a recipe's page and merged on their own page", async ({
  page,
}) => {
  await page.goto("/rezepte/regal");
  await page.getByRole("link", { name: "Kürbisgnocchi", exact: true }).click();
  await page.waitForURL(/\/rezepte\/[0-9a-f-]{36}\?von=regal$/);
  await page.getByRole("link", { name: /Stichworte (ändern|vergeben)/ }).click();
  const editor = page.getByRole("form", { name: "Stichworte ändern" });
  await editor.getByText("Braucht Zeit", { exact: true }).click();
  await editor.getByLabel("Neues Stichwort").fill("Kindergeburtstag");
  await editor.getByRole("button", { name: "Stichworte speichern" }).click();
  const tags = page.getByRole("list", { name: "Stichworte" });
  await expect(tags).toContainText("Braucht Zeit");
  await expect(tags).toContainText("Kindergeburtstag");

  // Typing offers the tag there is; picking it ticks its chip.
  await page.getByRole("link", { name: "Stichworte ändern" }).click();
  await editor.getByLabel("Neues Stichwort").fill("kinder");
  await editor.getByRole("button", { name: /Kindergeburtstag/ }).click();
  await expect(editor.getByLabel("Neues Stichwort")).toHaveValue("");

  // A second tag of the household's own goes into the first.
  await page.goto("/rezepte/regal");
  await page.getByLabel("Pilzrisotto auswählen").check();
  const bar = await openSelection(page, "1 Rezept ausgewählt");
  await bar.getByLabel("Stichwort hinzufügen").fill("Party");
  await bar.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("„Party“ steht jetzt bei 1 Rezept.")).toBeVisible();

  await page.goto("/rezepte/stichworte");
  const party = page.getByRole("region", { name: "Eigene" }).getByRole("listitem").filter({
    hasText: "Party",
  });
  await party.getByRole("link", { name: "Bearbeiten: Party" }).click();
  await party.getByLabel("Zusammenführen mit").selectOption({ label: "Kindergeburtstag" });
  await party.getByRole("button", { name: "Zusammenführen" }).click();
  await expect(page.getByText("Zusammengeführt in „Kindergeburtstag“.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Eigene" }).getByRole("listitem").filter({
      hasText: "Kindergeburtstag",
    }),
  ).toContainText("2 Rezepte");
  await expect(page.getByText("Party", { exact: true })).toHaveCount(0);

  // One of the app's tags is renamed only.
  const quick = page.getByRole("region", { name: "Aufwand" }).getByRole("listitem").filter({
    hasText: "Schnell",
  });
  await quick.getByRole("link", { name: "Bearbeiten: Schnell" }).click();
  await expect(quick.getByRole("button", { name: "Umbenennen" })).toBeVisible();
  await expect(quick.getByRole("button", { name: "Zusammenführen" })).toHaveCount(0);
  await expect(quick.getByRole("link", { name: "Löschen" })).toHaveCount(0);
});
