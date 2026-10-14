import { test } from "@playwright/test";
import { resetLibrary } from "./fixtures";

// Not a test of behaviour: walks through the screens and saves pictures of them, to look at
// what was built. Run with `npm run e2e:look`.
test("screens @look", async ({ page }, info) => {
  const shot = async (name: string) =>
    page.screenshot({ path: `test-results/look/${info.project.name}-${name}.png`, fullPage: true });

  // Something to look at: the made-up cookbook of the tests. It is removed after the run.
  await resetLibrary();
  // Pages come in with a short fade. A picture taken in the middle of it would be pale.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Not a first visit: the page about the goals of a week would stand in front of the plan.
  await page.context().addCookies([
    {
      name: "ziele-gesehen",
      value: "1",
      url: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
    },
  ]);
  await page.goto("/");
  await shot("1-login");
  await page.getByLabel("E-Mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/woche");
  await page.waitForLoadState("networkidle");
  await shot("2-woche");
  // A week that is still to come: ideas show, and a suggestion can be asked for.
  await page.goto("/woche?w=2027-03-01");
  await page.waitForLoadState("networkidle");
  await shot("2-woche-leer");
  const ask = page.getByRole("link", { name: /Hast du einen Vorschlag/ }).first();
  if (await ask.count()) {
    await ask.click();
    // A library with nothing left to suggest answers with nothing: then there is no picture.
    const answer = page.getByText("Vorschlag", { exact: true });
    const answered = await answer.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    );
    if (answered) await shot("2-woche-vorschlag");
  }
  await page.goto("/woche/verlauf");
  await page.waitForLoadState("networkidle");
  await shot("2-wochen");
  // A planned week has a list for every shopping day, and the note has something on it.
  // One meal is typed in and has no recipe yet.
  await page.goto("/woche?w=2027-03-01");
  const typed = page.getByRole("link", { name: "Donnerstag Abend planen" });
  if (await typed.count()) {
    await typed.click();
    await page.getByLabel("Eigener Eintrag").fill("Lasagne nach Oma");
    await page.getByRole("button", { name: "Eintragen" }).click();
    await page.getByRole("link", { name: "← Wochenplan" }).click();
    await page.getByText("Noch kein Rezept dazu").first().waitFor();
  }
  const complete = page.getByRole("button", { name: "Plan vervollständigen" });
  if (await complete.count()) {
    await complete.click();
    await page.getByRole("link", { name: "Montag Mittag ändern" }).waitFor();
  }
  await shot("2-woche-geplant");
  // The note is pulled down over the page that is open.
  await page.getByRole("link", { name: /^Merkzettel/ }).click();
  const note = page.getByRole("dialog", { name: "Merkzettel" });
  for (const text of ["Mehl", "Spülmittel", "Karotten"]) {
    if (await note.getByRole("button", { name: `${text} streichen` }).count()) continue;
    await note.getByLabel("Auf den Merkzettel schreiben").fill(text);
    await note.getByRole("button", { name: "Notieren" }).click();
    await note.getByRole("button", { name: `${text} auf den Einkaufszettel` }).waitFor();
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test-results/look/${info.project.name}-2-merkzettel.png` });
  await note.getByRole("button", { name: "Zurückstecken" }).click();
  // The notes of the week next to each other, and one picked up.
  await page.goto("/einkauf?w=2027-03-01");
  await page.waitForLoadState("networkidle");
  await shot("2-einkauf");
  const first = page
    .getByRole("list", { name: "Zettel" })
    .getByRole("link", { name: /^Supermarkt, Montag/ });
  if (await first.count()) {
    await first.click();
    await page.getByRole("link", { name: "← Alle Zettel" }).waitFor();
    await page.waitForTimeout(500);
    await shot("2-einkauf-zettel");
  }
  // A saved plan, as the family reads it during the week.
  await page.goto("/woche?w=2027-03-01");
  const save = page.getByRole("button", { name: "Plan speichern" });
  if (await save.count()) {
    await save.click();
    await page.getByText("Gespeichert.").waitFor();
  }
  await shot("2-woche-gespeichert");
  const edit = page.getByRole("button", { name: "Plan bearbeiten" });
  if (await edit.count()) await edit.click();
  await page.goto("/einstellungen");
  await page.waitForLoadState("networkidle");
  await shot("2-einstellungen");
  await page.goto("/favoriten");
  await page.waitForLoadState("networkidle");
  await shot("2-favoriten");
  await page.goto("/rezepte");
  await page.waitForLoadState("networkidle");
  await shot("2-entdecken");
  await page.getByPlaceholder("Titel oder Zutat").pressSequentially("la");
  await page
    .getByRole("region", { name: "Treffer beim Tippen" })
    .getByRole("listitem")
    .first()
    .waitFor();
  await shot("2-suche");
  await page.getByPlaceholder("Titel oder Zutat").fill("");
  // The first recipe on the page, and its photographed page opened if it has one.
  const recipe = page.locator('main a[href^="/rezepte/"]:not([href$="/neu"])').first();
  if (await recipe.count()) {
    await recipe.click();
    await page.waitForURL(/\/rezepte\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await shot("2-rezept");
    const edit = page.getByRole("link", { name: "Rezept ändern" });
    if (await edit.count()) {
      const recipeUrl = page.url();
      await edit.click();
      await page.getByRole("heading", { name: "Rezept ändern" }).waitFor();
      await shot("2-rezept-aendern");
      await page.goto(recipeUrl);
      await page.waitForLoadState("networkidle");
    }
    const photo = page.getByText("Originalfoto");
    if (await photo.count()) {
      await photo.click();
      // The picture is only fetched once it is shown.
      await page
        .locator("details img")
        .first()
        .evaluate((image: HTMLImageElement) => image.decode());
      await shot("2-rezept-foto");
    }
  }

  await page.goto("/rezepte/neu?art=text");
  await page.waitForLoadState("networkidle");
  await shot("2-rezept-text");

  await page.goto("/import");
  await shot("3-import");
  const batch = page
    .locator('a[href^="/import/"]:not([href*="pruefen"]):not([href*="vorschlaege"])')
    .first();
  if (await batch.count()) {
    await batch.click();
    await page.waitForLoadState("networkidle");
    await shot("4-stapel");
  }
  await page.goto("/import/pruefen");
  await page.waitForLoadState("networkidle");
  await shot("5-pruefen");
  await page.goto("/import/vorschlaege");
  await shot("6-vorschlaege");
});
