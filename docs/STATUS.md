# Status

Update this file in the same pull request that changes what it says.

## Where the app stands

The app is live at https://familyessensplan.vercel.app for the family since 19 October 2026. The latest feature work is phase 18 (Entdecken with tabs, the Regal as a shelf, the recipe stack, "Was ist noch da?", the roulette, "Alle Rezepte", discoveries in the statistics); see [HISTORY.md](HISTORY.md). A repo tidy-up followed in November 2026. A code audit on 10 November 2026 added several items below. On 11 and 12 November 2026 the slow pages were measured and made faster: the database's household check runs once per query, the server keeps the library between requests, a tap on the plan answers at once and writes in fewer round trips, and a line moved to another note waits for fewer; what is still open stands under "Questions for David".

## Known bugs and risks

- Editing a recipe on `/rezepte/[id]/bearbeiten` does not mark its fields as checked.
- The tags of a batch are suggested at its end, while its page is open. A batch that was left earlier keeps recipes without tags; `npm run import:tag-recipes` catches up. A recipe typed in by hand gets no suggested tags, and its tags can only be set under "Ändern".
- New imports get no "Hauptzutat" tags: `mainIngredients()` is only called by `npm run library:main-ingredients` (see Next steps).
- A printed time often counts only the work at the stove. The tag suggestion knows that; the rule for recipes without a tag (`effortOf`) does not.
- The check of steps let a paragraph pass that the reading had split in two (one run of five). The text was complete, so nothing is lost for the cook.
- The reading sometimes writes a word the way it is usually spelled rather than as printed. Asked in the instructions to copy the letters, it did no better and split a step instead.
- A recipe whose steps run on to a page that was not photographed has the steps up to there and a doubt; the rest can be typed on `/rezepte/[id]/bearbeiten`.
- A recipe's own view of its page can miss the end of its steps where the text runs on in the next column: one of 24 views looked at. The whole page is linked below the view.
- Cheese and antipasti come from the market in this household, but the catalog keeps cheese with the dairy and antipasti with the jars. The settings choose per kind of grocery, not per ingredient, so they stay on the supermarket's notes unless each line is moved.
- Markets close together lie on top of each other on the map until it is zoomed in.
- An errand counts as done from its last tick. Ticks are made on the device's clock and planning on the server's, so a meal planned within a minute or two of the last tick may be counted to either side.
- An upload started from a meal plans nothing when its page holds several recipes and none is named like the meal. The recipes are in the library and are planned by hand then.
- A recipe that is on a week plan cannot be deleted (foreign key). Deleting a batch whose recipes are planned therefore fails with an error instead of an explanation.
- The week's balance does not count legumes, although the brief asks for it: the import does not mark them, only two seed recipes carry the tag.
- A baking recipe without a printed servings line got whatever was entered in review, mostly "4 Portionen". "Ändern" on the recipe page sets its unit.
- A book that prints no servings with its recipes sends every one of them to review for that alone (106 recipes of "Freude am Kochen"). The upload form has no "servings unless printed" field yet.
- `npm run import:servings-units -- "Stührmann"` would still change three recipes of "Einfach Hausgemacht" (Knuspermüsli, Tomaten-Blechkuchen, Lauch-Tarte) to units that look like misread cover text ("1 Backblech À ca. 25 X 40 cm"). Fix them by hand, do not apply. The script also leaves 7 "FÜR EINE 26ER SPRINGFORM" lines it cannot parse.
- `supabase/config.toml` says `minimum_password_length = 10`, the app enforces 8. Harmless unless `supabase config push` is run. Align it to 8.
- The old column `recipe.steps` is still referenced by `merge_recipes` (`supabase/migrations/20261018000100_preparation_steps.sql`); dropping it needs a non-additive migration.

## Next steps

- Recipes still to come from the household: Tomate Mozzarella, Pestonudeln, Leberkässalat, Garnelen-Salat mit Feldsalat, Schafskäseauflauf, Hawaiitoast, Apfelkuchen, and homemade Spätzle as a side. "Reste" and "Vesper" never have a recipe.
- Three seed recipes have no cookbook name yet: the steak (a magazine page) and the two from the book with pages 82 and 84. The two from "Speed Cooking" have their title from the household, because the printed title was not photographed.
- Not built yet in the import: retrying a failed page or recipe from the screen.
- Wire `mainIngredients()` into the end of a batch, so that new imports get their "Hauptzutat" tags.
- The shopping list does not show yet what changed since it was last looked at. `src/domain/shopping-list/diff.ts` ("what changed since last look") exists with tests but is not used by the app yet. Also not yet: without a connection only ticking works (typing a line, moving it or changing its amount needs one); only a supermarket line can be bought at another shop for a week; the "Haben wir schon?" step is a plain section of each list for now.
- "Passwort vergessen" sends its e-mail through Supabase, whose own mail server writes only to the project's team and twice an hour. The family needs a mail server of its own set in the dashboard (SMTP). The link of Supabase's default template works only in the browser that asked for it; with the template set to `token_hash` it works on any device.

## Ideas

- Other families: a household of its own cannot be opened from the app yet. Before that, decide who pays for reading recipes, since every household's imports use the same API key.
- Supermarket offers for planning: no reliable and allowed source exists for EDEKA/REWE (EDEKA, REWE, Netto and Aldi's main site answer 403 at the edge; Marktguru and kaufDA/Bonial forbid automatic reading without written consent). Aldi Süd (official flyer viewer with PDF), Lidl and Kaufland (Schwarz leaflet platform) would be fine. Shelved in October 2026 unless Bonial or Marktguru give written consent; the family wants no uploads. Never scrape behind a bot wall.
- A typed entry that is already on the note asks first ("Trotzdem dazuschreiben", `alreadyListed`). From an abandoned branch (October 2026), never built.
- "Keiner daheim" skips a whole day with one tap (`nobodyHome`) instead of meal by meal. From the same abandoned branch, never built.

## Questions for David

Conventions and anything where two topics disagree are decided by David. A question that
has to wait stands here, with a recommendation; once answered, the answer goes into the doc
it belongs to and the question goes.

- None open.

## Open questions and things to check by hand

- `shownChecked` (`src/domain/shopping-list/ticks.ts`) is only used by its test. The docs say the device shows its own tick over a page drawn before the server took it, so that may not happen in the app. Check.
- Grouping title and ingredient pages has only been tested with made-up page descriptions. The sample photos contain no recipe that spans two photos. Check it on the first real batch.
- The checks of assigned fields and the duplicate rules were tried on made-up recipes and the seed only, not on the household's 880 recipes. Watch for false alarms (a word list decides what is meat or fish) and tune the lists in `quality.ts`.
- The steps of the 875 recipes with a photo were filled in on 18 October 2026: 810 read without doubt, 57 with doubts to check (46 of them from the handwritten "bunter Ordner"), 7 without steps on the photo, 1 not read.
- Picking photos on an iPhone from the batch form did not get as far as the upload for the household (October 2026), which could not be reproduced in WebKit. The folder button is off on touch screens now (`pointer-coarse`), and one recipe is added through `/rezepte/hinzufuegen`. Check a batch from an iPhone once more.
- The live search loads the whole library into the browser, 1,427 recipes on 11 November 2026 (about 880 in October). Watch how long that takes as the library grows.
- Speed on the phones once this is merged (the migrations `household_check_once` and `library_version` were applied on 12 November 2026): open the app cold, switch between Woche, Rezepte and Einkauf, tap "Gute Idee!", step the servings three times quickly, empty a meal, mark a favourite and see it on the next page, type the first letter into the search, move a line to another note. With two phones: what one plans shows on the other, also right after the other's own tap (a change within three seconds of a device's own tap is taken for its own). None of it was measured in production.
- The looks of a tap on the plan were checked in Chromium only. Check on an iPhone: "Gute Idee!", "Leeren", "Hier einplanen", and three quick taps on "+".
- The cookbooks were framed with the first way of asking, and only their turned pages and an overview of all pages were checked by eye. A page that still lies wrongly is framed again with `npm run import:frame-photos -- "<name>" --path <page> --again`.
- The season calendar's months come from general German calendars, not from the region around Laupheim, and were not checked against the household's market.
- The offline flow was tested in Chromium (Playwright). On an iPhone, check once by hand: installed from Safari, open a note, airplane mode, tick, reopen the app, back online.
- Handwritten recipes have never been measured. Expect more review for the household's own folders and try a few pages first.
- The measurements cover five clean, well-lit pages. Watch the review rate and spot-check the first real cookbook batch.
- Shelf life, pack sizes and default shops in the catalog are estimates. The household corrects them in the app once the settings UI exists.

## Limits we accept

- The Anthropic API is billed separately from a Claude Pro subscription. The measurement scripts and the import itself need `ANTHROPIC_API_KEY` in `.env.local`.
- Which days count as workdays is fixed: Monday to Friday. A holiday is planned by hand.
- The shopping days are the same every week. For a holiday on a shopping day the errand is moved to another day by hand ("An einem anderen Tag einkaufen").
- The map tiles of the settings are fetched from tile.openstreetmap.org by the browser, as a visitor of OpenStreetMap: they show the household's area, nothing of its data. The address suggestions go through the server to Photon, a free service of Komoot without a key and with fair use; without it the field is a plain field.
- The servings on the plan change with the tap, the rest of the meal with the server's answer: for that moment the link to the recipe still opens it with the amount before the tap.
- Turning off zoom takes it from whoever needs larger writing; the household asked for it (October 2026). An iPhone home screen app made before October 2026 starts at "/": the proxy sends it on quickly, adding it to the home screen again starts at the plan directly.
- Inviting someone needs no e-mail to be sent: the link is passed on by hand. Supabase's own mail server only writes to the project's team, so mail from the app would need another one.
- What one device changes shows on the others while they are online. A phone without a connection in the shop sees the notes as they were when it last had one, with its own ticks; the counts on the tiles among the notes do not include ticks that still wait.
- A note is kept for the shop only once the device has opened the shopping notes of the running week online. The week plan, recipes and every other page are not kept.
- The test household "E2E-Test (automatisch)" and its login exist in the hosted project. `npm run e2e:teardown` removes them.
