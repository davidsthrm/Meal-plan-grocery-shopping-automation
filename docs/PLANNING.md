# Planning

The household and its family, the week plan (meals, foods, extras, saved plans, how a week looks
and how it is left), the suggestions that help fill it, and the statistics that look back at it.
Shopping rules that follow from the plan, including the household's shopping days and places,
are in [SHOPPING.md](SHOPPING.md).

## Household and family

- Default servings: 4.
- How many the household cooks for (`household.default_servings`, 1 to 12) is asked on the
  first visit next to the goals and set under "Wochenplan" in the settings.
- A family shares one household, everyone with an account of their own
  (`household_member`, with the name the household calls them by). A member makes an
  invitation on `/einstellungen` (`household_invite`): a link that works once and for seven
  days, of which only a hash is stored. Whoever opens it is greeted ("Hallo!", "Einladung
  von David", "Du wurdest zur Essensplanung der Stührmanns eingeladen") and gives a name, an
  e-mail and a password on a sheet of the pad, gets an account and belongs to the household
  (`acceptInvite`). Then `/willkommen` shows what the household has set, persons, goals,
  shopping days and supermarkets, "Diese Einstellungen hat David festgelegt", the admin's
  first name: "So lassen" or "Speichern", and the plan opens. An account
  belongs to one household; someone who has one cannot use an invitation, unless the
  account belongs to none any more: it then joins with its own password.
- Whoever made a household is its admin (`household_member.role`). The admin removes a
  member, any other member can leave, both after being asked (`?entfernen=<id>`,
  `?verlassen=1`; `remove_household_member`, `leave_household`, which check who asks; the
  admin cannot leave). Only the membership goes: the account stays and sees nothing
  (`/kein-haushalt`). Leaving signs out and forgets what the device kept for the shop.
- The settings put first what is changed most (October 2026): "Einkaufen" (shopping days,
  Vorrat, fresh places, supermarkets), then "Wochenplan" (goals, persons), and last
  "Familie & Konto", which is set once.
- The household's name (`household.name`, "Stührmann", set in the family card of
  `/einstellungen`) is spoken of as the family in two places, read from the data: the empty
  shopping notes ("Bei den Stührmanns …") and the invitation ("Die Stührmanns laden dich
  ein"), through `familyName`, which says nothing for a name that is no single family name
  ("Zuhause"). The week plan greets whoever opens it by the first word of their own name
  as a large title, the way an app's first screen does: the day small above it, "Guten
  Morgen, David" by the time of day (`salutation`, `firstName`; `.greeting`, the name in the
  accent green), and "Wochenplan · 12.–18. Oktober" below as the page's heading. A sentence
  under the greeting saying what there is to eat today was taken out again: the card of
  today says it. Without a name, the plain label and the week as the title. Nowhere else.
- A new household for another family is not made in the app: it needs its own catalog,
  tags and categories, as `npm run e2e:setup` makes them for the test household.
- Shopping days, butcher days, the bakery and the drugstore's weekday: see
  [SHOPPING.md](SHOPPING.md#shopping-days-and-places).
- Login, passwords and how an account is made: see [ARCHITECTURE.md](ARCHITECTURE.md#login-accounts-and-security).

## The week

- A week runs from Monday to Sunday and has two meals a day. A meal is one or more recipes
  (a main dish and its side), or something without a recipe: free text such as "Vesper",
  leftovers, away, or skipped. A meal that is not planned has no row.
- Sunday has a third meal, "Kaffee & Kuchen" (`meal` value `coffee`, `mealsOf`). It is
  optional: nothing is suggested on the plan, and choosing for it suggests cakes and desserts.
  Cakes and desserts are never suggested for lunch or dinner.
- A recipe for persons is planned for the household's servings, a recipe with a servings
  unit as written.
- The planner opens on the running week, and from Saturday on the coming one: the household
  plans on the weekend. From Thursday on it opens on the coming week already when nothing is
  planned for the rest of the running one (`openingWeek`); earlier an empty week is still the
  one to plan.
- In the running week the sheet starts with today, then the rest of the week, and the days
  that are over stand at its foot under "Vorbei", their names grey (`daysFromToday`): on a
  Tuesday Monday is no longer the first thing to read (October 2026). Any other week keeps
  its order from Monday. The note for the pinboard and the week beside the recipe chooser
  keep it too.
- A household starts with the app in a week of its own (`household.first_week`, the
  family's is 19 October 2026, the week it went live). The plan, the shopping notes and
  "Alle Wochen" go back no further (`weekShown`, `hasWeekBefore`): an older week in the
  address shows the first one, and the arrow back is off. Null is no limit, as for the
  test household.
- "Außerdem" holds recipes a week needs outside its meals (`plan_extra`): two cakes for an
  invitation. They count for the shopping list, not for the balance. Each can name the day
  of the week it is needed (`plan_extra.needed_on`, `PlanExtra.date`): it is then bought
  for that day exactly like a meal on it. Without a day it is bought on the week's first
  supermarket day, or on the next one when it was added after that errand was done.
- Every recipe and food on a meal remembers the day it was planned (`planned_on`,
  `SlotItem.plannedOn`) and the moment (`planned_at`, `plannedAt`; an extra its
  `created_at`). A meal written again with other servings or another side keeps the day and
  the moment of what was there (`plannedWhen`). Null for what was planned before each was
  recorded.
- "Alle Wochen" (`/woche/verlauf`) lists every week with a plan, month by month and newest
  first, with its calendar week, its meals day by day and its count per kind. A week counts
  for the month most of its days are in. The week being planned is always listed.

### The week's balance

- A week is counted by the heaviest protein of each cooked meal: red meat, poultry, fish,
  vegetarian (vegan counts as vegetarian). Only recipes that are a meal by themselves count
  (main dish, soup, salad, cold supper, or no category), so a cake is no vegetarian dinner.
- What the household aims for per week (`DEFAULT_TARGETS`): at least 3 vegetarian meals and
  1 fish meal, at most 2 with poultry and 2 with red meat. The household sets its own on
  `/woche/ziele` (`household.balance_targets`, read with `readTargets`). Every device is shown
  that page once before the plan, remembered in the cookie `ziele-gesehen`: each person
  should see the goals and be able to change them, but they belong to the household. The
  admin is asked on `/woche/ziele?start=1`; every other member is welcomed on `/willkommen`.
- The week's count stands above it as four tiles in the kinds' pastels, each with its number,
  its goal ("mind. 3", "max. 2", "geschafft" once reached; a limit alone is never reached,
  `targetText`). The tiles are the way to the goals: "Ziele ändern" below them took a row of
  its own and a bar that fills towards the goal, in the warning colour
  once there are too many (`progress`: towards the most where there is one, else the
  least). Two by two on a phone narrower than an iPhone 14, where "Vegetarisch" no longer
  fits a quarter of the width.

## Meals and foods

- A typed meal whose text is the title of a recipe is planned as that recipe. Any other typed
  meal stays text and says "Noch kein Rezept dazu". "Hochladen" opens the upload for that
  meal: the batch remembers it (`import_batch.for_date`, `for_meal`), and once every photo is
  read and the recipe approved, by itself or after review, the recipe stands on the meal
  instead of the text (`placeForMeal`). One recipe read is the one; of several on a page it
  is the one named like the meal (`recipeForMeal`), and if that does not decide it, nothing
  is planned. A meal that was emptied or planned otherwise meanwhile is left alone.
  "Eintippen" opens the recipe form with the title filled in and puts the saved recipe on
  that meal. The household plans with the cookbook next to it.
- Some meals never have a recipe and are one tap away (`MEALS_WITHOUT_RECIPE`): Vesper,
  Reste, Auswärts, Oma Heidrun, Keiner daheim. Typed in, such a name is that meal (`namedMeal`),
  and no upload is offered for it. "Braucht keins" on any other typed meal makes it a meal
  away from the kitchen that keeps its name ("Pizza bestellen").
- A meal without a recipe can carry foods to buy (`plan_slot_food`): bread, cold cuts and a
  cucumber for a "Vesper". A food is a name, and an amount only where one was said: a number
  typed in front ("8 Brötchen", `readFood`) or a tap on a side that is one of something
  (`plan_slot_food.quantity`; "1 Dinkelbaguette", "1x Dinkelbaguette" on the note). Such a
  side stored before foods had a number counts as one too (`asSide`, when a week is read). It may name where it is bought
  for that meal (`VESPER_FOODS`: bread from the Bäcker, cold cuts from the Metzger), whatever
  the catalog says for cooking. Foods are copied with the meal to the next week.
- A meal with recipes can carry foods too, what goes with it and has no recipe: a spelt
  baguette with Sunday's soup (`PlanSlot.foods` on a "recipes" meal, the same
  `plan_slot_food`). The recipe chooser offers them under "Dazu, ohne Rezept" once the meal
  has a recipe (`SIDE_FOODS`, bread from the Bäcker), and "Etwas anderes" opens the meal's
  page of foods for anything typed. The meal shows "Dazu: 1 Dinkelbaguette", the note for the
  pinboard "Kürbissuppe + Dinkelbaguette", and on the shopping notes the line names the
  recipe it goes with. A meal's recipes written again (a side, a person more) keep its foods
  (`writeSlot`, `foods` left out); a meal planned as something else loses them.
- The page that plans one meal (`/woche/auswahl`) is a stop of its own: what is picked there
  is planned and the page stays, saying what the meal is now ("Geplant: …"). "Nächste
  Mahlzeit" leads to the next lunch or dinner that has nothing planned yet, into the next
  week too (`nextOpenMeal`); coffee on Sunday is passed over. "← Wochenplan" leads back.
  Picked anywhere else (a suggestion, a recipe being placed), the week is shown again. On an
  iPad the week stands beside it (`WeekStrip`, `weekStrip`): every lunch and dinner with
  what it holds, Sunday's coffee when planned or being chosen for, the meal being chosen for
  marked, each a link to choose for it instead. It stays while the meal's page is torn off
  and scrolls on its own, so that a week is planned with the library open.

## Saved plans

- A plan the household is done with is saved (`week_plan.saved_at`, "Plan speichern"). A
  saved plan is read: the meals stand there without the controls for planning, without
  suggestions, and each with a small pen that opens that one meal (`?stift=<date>.<meal>`).
  "Plan bearbeiten" opens the whole plan again. Saving is a decision, not a date: a week
  that has begun is not locked by itself.
- "Woche leeren" empties a week after asking: every meal and the extras (`resetWeek`).
  The rubber makes the sheet invisible with a class that `ResetWeek` takes off again as
  soon as the empty week is drawn; left on, the page stayed blank. Playwright calls an
  element with opacity 0 visible, so the test asks for the opacity.

## Suggestions

- A suggestion has points and reasons (`scoreRecipe`): +8 when someone wants to cook it, +3
  when its group is still below the least the week should have, -4 when its group is used
  up, +2 when it fits the season of the month the week counts for ("Passt zur Saison:
  Kürbis, Lauch", `seasonFit` with `monthOfWeek`), -3 when it needs something of a short
  season outside it ("Außerhalb der Saison: Erdbeeren"), +2 for a favourite, -3 when it was
  on a plan in the last 4 weeks, +1 when it was last cooked 8 weeks ago or longer or never
  ("Noch nie gekocht"), and -2 for each main ingredient or kind of dish the week has already
  ("Schon Hackfleisch diese Woche": the tags of "Hauptzutat" and "Gericht", `varietyTags`,
  `tagsOfWeek`; a cuisine may come twice). A suggestion names its two strongest reasons,
  what speaks for it first (`whyText`); more made a box of small print. Favourites are no
  more than a third of any list of suggestions (`mixFavorites`, `FAVORITE_SHARE`): with +2
  they won every tie, and the household was offered its favourites over and over. A
  favourite someone wants to cook counts as a wish. Equal recipes are ordered by a seed (week, meal), so the
  order is stable between two looks. The best one is found in one pass, not by sorting the
  library, and a recipe's dish and effort are read once per recipe: a week's suggestions
  took 190 ms of the server for the family's 1,146 recipes on every look at the plan, and
  take 60 (October 2026). The suggestions themselves are the same.
- The plan does not fill itself. An open meal has "Planen" and "Was könnten wir kochen?".
  Asked, the meal shows one suggestion with its reasons, "Gute Idee!" to take it and "Lieber
  was anderes" for the next best; after twelve they come round again. The household found
  a plan that arrives full of suggestions too pushy.
- Up to five open meals offer a suggestion without being asked: those with the most to say
  for them (a wish, a favourite, a gap in the week, the season; `HINT_SCORE`; "never
  cooked" alone is not enough), at most two of them favourites (`hintedMeals`), spread
  over the week. It
  is the same box as an answer to "Was könnten wir kochen?", with a dashed edge and
  "Vorschlag" on it, so that it does not read as planned: "Gute Idee!" takes it, "Lieber was
  anderes" shows the next best. More wishes and favourites mean more such meals, up to
  five. The household took the pale ideas shown before for planned meals.
- "Plan vervollständigen" plans every open meal that is still to come at once. Those
  suggestions are chosen one after the other as if the earlier ones were accepted
  (`suggestWeek`), so that the completed week meets the targets. Nothing is suggested twice
  in a week. A wish goes to the first meal it suits. A meal that could run out, with fewer
  suitable recipes left than meals still open, is chosen for before the others: filled from
  Monday on, the lunches took the salad and the fish of a small cookbook, and Thursday
  evening, which takes only what is light and quick, got a third meat dish. With the
  household's library no meal is that tight, and the week is filled in its order.
  Favourites fill no more than a third of the week, those on the plan already counted, and
  a favourite only where nothing else suits a meal past that; each pick's main ingredient
  and kind of dish count as the week's for the next. What a pick says for itself is said of
  the week as planned, not of the order it was chosen in.
- Suggested are main dishes and soups, in the evening also salads and cold suppers: lunch is
  the cooked meal in this household. Anything can still be planned by hand for any meal.
- The evening is light, on any day (`suitsDay`): nothing heavy is suggested for it, that is
  pasta, rice, potatoes or a casserole (`dishOf`: category, then the "Gericht" tag, then any
  dish word of the title, a side included), so a pasta salad is a salad and a steak with
  Spätzle is heavy, though its pictogram is the steak. A soup, a wrap or
  toast from the oven is fine. The household had Avocado Spaghetti suggested for a dinner.
- From Monday to Friday nobody cooks for hours (`suitsDay`): lunch is suggested from what
  is quick or fits a normal day, the evening only from what is quick or cold. A recipe whose
  effort is not known is kept for the weekend. The household had many warm main dishes
  suggested for workday evenings that it could never cook then.

## Wishes

- "Möchte ich kochen" marks a recipe someone wants to cook soon (`recipe.wanted_at`). It is
  suggested before everything else, shown below the plan to be placed with one tap, and the
  mark goes as soon as the recipe is on a plan (`fulfilWishes`), as a meal or as an extra.
  There can be dozens, so they are grouped by kind in the kind's pastel (`groupRecipes`
  with `BY_KIND`), eight per kind until "weitere" shows all (`?wuensche=alle`). "Nach"
  above them sorts them by Aufwand, Gericht, Küche or Saison instead (`?wuensche-nach=`,
  `wishGrouping`: the effort as the week goes by it, `BY_EFFORT`; a group of tags by the
  first of a recipe's tags in it, `byTag`), each without a colour of its own.

## Leftovers ("Mehr kochen")

- "Mehr kochen" on a planned meal cooks extra portions for leftovers. They are the meal's own
  number (`plan_slot.extra_servings`, `PlanSlot.extra`), apart from its persons: the meal
  shows "4 Personen" and below "2 Extra-Portionen" with minus and plus, so a third person at
  the leftovers makes it 3; zero cooks the meal as planned again. The list buys them with
  every recipe of the meal that is cooked for persons (`cookedServings`); a cake for one tin
  is not baked twice. The later meal picked for the leftovers, an open lunch or dinner of the
  next three days (`openMealsAfter`, `LEFTOVER_DAYS`), becomes "Reste" with the meal it is
  from (`plan_slot.leftovers_of_slot_id`), and the extra portions say for which meal they
  are. A meal planned meanwhile is left alone. A meal written again keeps its id
  (`writeSlot` updates in place), so the link holds.

## The plan on screen

- Above the sheet stands one row: the views "Mahlzeiten" and "Außerdem" as a segmented
  control on the left, what is done with the whole plan on the right ("Plan vervollständigen",
  "Woche leeren", "Plan speichern" last). On a phone the control is as wide as the screen and
  the actions wrap below it. The week is changed with one capsule (back, "Aktuelle",
  forward) and "Alle Wochen" next to it.
- Above the plan of the running week stands what there is to eat today and what the weekend
  holds (`Today`), also while the page already shows the coming week. Once something is
  planned for those days, it stands next to the greeting like a widget on a large screen,
  and under it on a phone; otherwise the header is the greeting alone. Today's lunch and
  dinner stand side by side, and Saturday and Sunday are two small cards, each meal on a
  line of its own with its pictogram: the weekend was one grey sentence (October 2026).
- Every planned meal on the plan carries the kind of its first dish as a coloured edge, a
  stronger shade of the kind's pastel (`.meal-cell`), and a grey one where its dish has no
  kind or it has no recipe. A meal without a recipe has a picture where it has one
  (`slotPictogram`): the bread of a "Vesper", the pot of leftovers, a pin with a plate for
  a meal away ("Auswärts", "Oma Heidrun"), on grey. An open meal has no edge and says
  "noch offen".
- A planned meal is two lines: its dish with the persons as a small stepper beside it ("− 4
  +", a person's sign and the number, "4 Personen" for a screen reader; a recipe with a unit
  of its own shows that below the dish), and its actions as signs in one row, each with its
  words as label and title: a pen to change it, a plus for a side, a bin to empty it;
  "Mehr kochen" is the one word among them, a quiet grey word (`.link-quiet`: as a green
  pill it outshone the meal) that opens its form under the row
  (`?mehr=<date>.<meal>`, "Übernehmen" or "Abbrechen"), the way a suggestion is asked for.
  The household found the row of words, and "Mehr kochen" on a line of its own, took too
  much room in the plan; folded open inside the row it stood beside the signs in Safari.
  With the persons on a line of their own, a planned week was 3,800 points tall on a phone.
- A week ahead planned to its last lunch and dinner (`weekPlanned`) is celebrated once per
  device (`WeekDone`): a stamp, "Woche steht!", is pressed onto the screen and the colours
  of the kinds of meals fly off it, 1.8 seconds, meant to be seen. Only a week the device
  saw still open: weeks planned before are not celebrated out of the blue. It is put into
  the body, as the page's transform would pin a fixed overlay to the page.

## Pinboard note

- "Für die Pinnwand" (in the row of the plan's actions, once anything is planned) opens the
  week as a PDF the size of a postcard (A6) to pin up (`planNote` in `src/lib/plan-note.ts`,
  `planNotePdf`): every day a row with its lunch and dinner, Sunday's coffee only when
  planned, leftovers as "Reste vom Di", a meal with several recipes joined by "+", at most
  two lines a meal, an open meal a faint line to write on, and the extras at the foot.
  Black on white like the shopping notes. It opens in the browser (`inline`), to print.

## Ways back from a recipe

- A recipe opened from the week plan or from the favourites leads back there
  (`lib/origin.ts`: the link carries `?von=woche&w=<week>` or `?von=favoriten`), and so does
  one opened from any other list of recipes: the open book of the Regal
  (`?von=regal&buch=`), a category's tab (`?von=entdecken&art=`), "Alle Rezepte"
  (`?von=alle`), the stack, the fridge and the roulette. The household landed on Entdecken
  from the Regal (October 2026). From anywhere else it leads to "Entdecken". Nothing but a
  week, its day, a book, an edition and a category is taken from the
  address. Opened from a list or the week plan, the link back is a step back in the history
  (`BackToList`, `canStepBack`), so the filter and the place on the page are kept, and each
  shelf is scrolled sideways as it was (`ListMemory`, `cameBack`). The link opened the list
  afresh before, unfiltered and at the top, and the week at Monday while the household was
  planning Sunday. Where it cannot step back, the link from the week carries the day
  (`&tag=<date>`) and lands on it (`#tag-<date>`); `ListMemory` goes to the anchor itself,
  as the router looked for it while `loading.tsx` was shown.

## Statistics

- "Statistik" (`/woche/statistik`) stands next to "Alle Wochen" on the week plan and on that
  page, not in the bar of the sections: the phone's bar holds five, and looking back is part
  of the week. Two views as a segmented control, "Essen" and "Einkauf", and a week, a month
  (the default) or a year with the capsule to go back and forward.
- A month and a year are whole weeks, each counted for the month most of its days are in, as
  "Alle Wochen" counts them (`src/domain/stats/period.ts`): the weekly goals stay whole weeks.
  Nothing before the household's first week, or without one before its first plan or note
  (`countingFrom`), and nothing after today.
- A meal planned for a day that has come counts as cooked: nothing records whether it was.
  The counting is pure (`mealStats`, `shoppingStats` in `src/domain/stats/`); the server
  reads every plan from the first week on and the period's notes (`src/server/stats.ts`).
- Essen: meals cooked and entered, different dishes, days without meat and their longest run,
  meals without a recipe; the weekly goals per kind, with a dot per week to open it (a week
  still running counts once it is decided); the kinds over time as stacked columns, each a
  link to its week or month; most cooked, first cooked, "Mal wieder kochen?" (eight weeks
  without, favourites first), cookbooks with how much of each was ever cooked, main
  ingredients, cuisines, effort on working days and at the weekend, the season, leftovers,
  coffee and cake, recipes added.
- Einkauf counts what was done in the app (`shopping_line_state`, `shopping_manual_entry`):
  an errand is a note with something bought on it, and whoever made its last tick finished
  it. A calendar of the days shopped, errands over time and per weekday, per place and per
  supermarket (the kind of grocery decides, as on the note), what was bought on most errands,
  what was left out or bought otherwise, who shops, lines written by hand, dm. An errand done
  from the paper note leaves nothing to count, and the page says so.
- A statistic with too little behind it says what it needs (`Stat`: have and need) instead
  of drawing an empty chart: a trend two weeks or months, a ranking a dish cooked twice,
  "Zum ersten Mal" four weeks of plans before the period, "Mal wieder" eight weeks of plans.
- Charts are HTML drawn on the server in the kinds' pastels (`stats-charts.tsx`), the
  supermarket a warm grey beside the market's green. Nothing grows or counts up: the
  figures are read. A new period or view fades in where the old one stood (`.stats-in`).
  Not counted yet: wishes fulfilled (the mark goes when a recipe is planned), amounts bought,
  spending, and what ran out at home.
- "Entdeckt", as wide as the large cards (`discoveryStats`, `src/domain/stats/discovery.ts`):
  dishes cooked for the first time in the period, how much of the library was ever cooked,
  the cuisines cooked of those the library has, and five badges for trying something new,
  each saying how far it is (five new dishes in a calendar month, every cuisine once, four
  weeks in a row each with something new, fifty different dishes, half of a cookbook of at
  least ten recipes). It belongs to looking back, not to Entdecken (October 2026).
