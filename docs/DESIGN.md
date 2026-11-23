# Design

How Essensplan looks and moves, and why: the household's decisions, with the incidents behind
them, and how to work on the look. UI text is German; this document is English.

## Principles

- Calm and structured: warm paper, dark ink, one green accent, generous spacing, no pictures
  needed. One sans-serif family for everything. No serif typeface: the household does not
  want the look of an AI product (twice: the user asked for no serif font on 2026-10-12, and
  the system typeface was left out of the proposals taken over on 19 October 2026).
- The typeface is Figtree, served by the app itself (`next/font/google` in the root layout,
  `--font-sans`), in two weights: 500 for the text, 700 for what stands out (Tailwind's
  `font-normal` is the 500, `font-semibold` the 700). The household picked it on 22 November
  2026: the app should not "look like any other app", and the system's own typeface, or
  Avenir Next before it, is what every other app has. The service worker keeps its files
  for the shop with the scripts and styles (`/_next/static/`).
- Five sizes and no others (`--text-*` in `@theme`): 26px a title and the greeting, set a
  little tight (`-0.015em`); 19px the name of a dish or a note; 16px the text (at 500);
  15px what is said beside it; 13px a small label. Tailwind's sizes in use fall onto them
  (`text-xl` is 19, `text-2xl` and `text-3xl` are 26), and `tracking-tight` is a hair
  (`-0.01em`): tight tracking on every heading reads as machine-made. A dish's name on the
  week is 16px on a phone and 19px from `sm` on: beside the stepper, at 19px it broke into
  syllables ("Cur-rysahne"). Text in a field stays 16px at least (see "Controls and sizes").
  The only sizes outside the scale are the greeting on the week plan, 30px (`.greeting`:
  at 26px it did not read easily on the phone or the iPad, 23 November 2026; the day above
  it went from 15 to 16px and the week's range below it from 16 to 19px), what is drawn
  inside a chart (the donut's figure, in the units of its SVG) and the root of 17px that the
  spacing is measured in.
- No headings in capitals with wide letter spacing: the household reads them as machine-made.
  A small label (`.eyebrow`) is written as it is spelled.
- Words on the screen say something concrete or are left out. No filler such as "for
  variety" or "just for you"; a suggestion without a reason shows none. (The incident: page
  and recipe titles were set in a system serif, and "Zur Abwechslung" was shown under every
  suggestion that had no specific reason. The user wrote: "please dont use the serif claude
  font. use anouther modern one instead. also please no generic statements from ai!")
- Keep the palette pastel: the household asked for that. The page is the paper, and the
  colours of the kinds are small marks on it (see "Section colours" and "Colours of kinds").
- What the household wants: clean, easy to use, structured, not too fancy but still premium.

## Paper and notes

A few things are borrowed from the handwritten notes the app replaces, and only these:

- The week plan and every shopping list are a sheet of a pad (`.sheet`: holes along the top,
  two more sheets underneath).
- A list has ruled lines and a margin (`.ruled`) with a tick made by a pen (`.tickbox`).
- What ran out at home is written on a yellow note stuck on with tape (`.note`), as narrow
  as a real sticky note (`RestockNote`, 18rem, about 300px). "+" writes on it; each entry
  is one line: its name, where it will go in small muted words, the sign of the shopping
  notes (the Einkauf tab's) for "Auf den Einkaufszettel" and the cross, each sign 44px. One
  link at its foot, "Alle auf den Einkaufszettel". Chosen on 22 November 2026: with a pill
  under every entry, a caption and a green button, the note was a page of buttons.
- A meal without a recipe carries a small yellow slip.
- Today is marked with a highlighter (`.marked`), "Heute" beside it in the green, far enough
  away for the mark to reach past the name. The same stroke marks the open section in the
  strip of the sections.
- No handwriting typeface. On real paper only a note's ruled lines are printed, faint, as in
  its PDF.

The shopping notes of a week:

- They lie next to each other as small notes, a little askew (`.tiles`), each with the
  pictogram of its place on that place's pastel (`PLACE_LOOK`). One is picked up to work
  through it and comes closer (`.zoom-in`). The household found one long page of lists
  unstructured.
- Each tile is turned as one layer (`will-change`), at rest as under the finger, and the
  holes of a sheet are elements (`SheetHoles`), not a repeated background: either way round,
  the holes lay askew to the note and jumped when it was lifted.
- A note is as tall as what is on it, and one with nothing on it is a slim strip with its
  place, its day and "Nichts zu kaufen": a full sheet for every note, empty or with one line,
  made the shopping page twice as long as it needed to be (October 2026). Such a strip is
  shown only where it is to be written on (dm, a note opened by hand) or in a week with
  nothing on any note (`arrangeNotes`).
- In the view for the shop the tick sits inside its box (`.tickbox-large`); on the note it
  runs past the box like a pen's. The view shows the supermarkets' logos as the note does,
  and the service worker keeps them for the shop: its own Content-Security-Policy (in
  `next.config.ts`) allows `https://*.wikimedia.org` and nothing else from outside.

The paper metaphors in motion:

- The Merkzettel does not open a page: it is pulled down over the open one on a string
  (`NoteDrawer`, a `<dialog>` that holds the note only while it is down), and pushed back up.
  A link to `#merkzettel` pulls it down too. "Zurückstecken" under it is a button of paper
  (`.note-drawer-close`): as white words floating over the dimmed page it did not read as
  something to tap (22 November 2026).
- Emptying a week sends a rubber over the sheet first (`ResetWeek`, `.erasing`).
- Going on to the next meal tears the meal's page off like a sheet of a pad (a React
  `<ViewTransition>` keyed by the meal, `.note-off` and `.note-on`, started only by that
  link's `transitionTypes`).
- All of it is off for whoever asked for less motion.

## Controls and sizes

- The shared classes (`.btn`, `.field`, `.card`, `.chip`, `.title`, `.eyebrow`) are in the
  `components` layer of `src/app/globals.css`, so a utility class on the same element wins.
- A button or a chip is a soft tint of the ink over whatever it lies on, not a white box with
  an edge, and a pill; only `.btn-primary` is solid, so the one green button on a screen is
  what stands out.
- Pills are for buttons and filter chips only. A way back (`BackLink`, "← Wochenplan") or to
  another page, and every standalone link the size of a finger (`.link.min-h-11`, "Zum
  Wochenplan"), is a plain link: its words in the green, underlined, still 44px tall; the
  arrow of the way back stands without the line. In October 2026 these links became pills on
  the green's pastel so that they read as tappable; on 22 November 2026 the household found
  that with every way somewhere a pill, nothing on a screen said which was a button. A word
  inside a row of signs ("Mehr kochen") stays a word without a line (`.link-quiet`).
- Buttons that belong together stand in one row, also on a phone: where words would break it,
  the lesser ones are a sign with their words as label and title (the plan's Pinnwand and
  Leeren, the statistics, the week's arrows, all weeks as a month's calendar), and "Plan
  speichern" is "Speichern" (October 2026). The week's row of arrows is one line on every
  week at 375px too: "Alle Wochen" in words broke it (22 November 2026). The plan's actions
  too: "Vervollständigen", the pin, the rubber and "Speichern" while planning, the pin and
  "Plan bearbeiten" once saved. The signs are round and 2.6rem wide, the words hug theirs
  closer on a phone, and no line stands between them: the household saw them stacked on
  23 November 2026. `e2e/week-saved.spec.ts` checks it at 375px. A suggestion's two
  buttons share a row the same way: "Gute Idee!" and "Was anderes", which as "Lieber was
  anderes" took a second row.
- Every control gives a little the moment a finger lands on it (`:active`, a scale of 0.96),
  not only when it lifts, also for whoever asked for less motion: nothing travels. Hover is
  for a mouse or trackpad only, and a press answers on every screen (`:active`).
- While its form is on its way to the server (`SubmitButton`, `data-pending`), a button stays
  pressed and after 150ms shows a small ring instead of its words, and the line of a note it
  belongs to pales: the household tapped again when nothing showed (October 2026).
- The household took over these from previews based on Apple's guidance (October 2026), with
  the parts below:
  - `.capsule`: back, the current one and forward as one control (the week on the plan and on
    the shopping notes, with the next step a word beside it).
  - `.segmented` and `.segment`: two views of one page, the open one raised on the track
    (Mahlzeiten and Außerdem, Entdecken and Regal, Eintippen and Text einfügen).
  - `.stepper`: a meal's persons and its extra portions, "− 4 +".
- Every control is at least 44px both ways (`min-h-11`, `size-11`, `2.6rem` at the root of
  17px; `min-h-10` is 42.5px). A small pill such as a tag keeps its size inside a link that
  is 44px tall. The seven weekdays of the shopping days share a row and reach into the card's
  edge on a phone, so that each is still 44px wide.
- Text in a field is never under 16px, or Safari zooms into it.
- A tap shows no grey flash, waits for no second tap (`touch-action: manipulation`), and
  holding a control does not select its words.
- A card that explains itself does so behind a round "?" beside its heading (`HelpHeading`):
  the settings explained every card at length and their controls stood a screen further down
  (October 2026).
- The week plan answers a tap before the server does: a tap showed only a busy button until
  the whole page came back, and planning felt slow (November 2026). A form says what it
  does (`data-does`: `plan`, `clear`, `place`, `add`), its button carries `data-pending`
  while it is on its way (`SubmitButton`), and styles alone show the result: a suggestion
  taken reads as planned, a meal emptied pales and is struck out and nothing else in it can
  be tapped, a recipe placed stands where its button was. Nothing is stored in the browser,
  and it ends by itself when the form is answered, also when the server refuses. The
  servings stepper (`ServingsStepper`) shows the number of the tap on its way. Nothing
  travels, so less motion changes nothing.
- What is done with the recipes ticked in "Alle Rezepte" is a bar at the foot of the screen
  that opens upwards (`.selection-bar`, `SelectionBar`), out of sight while nothing is
  ticked. It is put directly into the body: every page comes in with a transform (`page-in`),
  and inside a transformed element "fixed" is fixed to that element, not to the screen.

## Layout and screens

- One layout for all sizes: a single column on a phone, more columns from `sm` on. The iPad
  is for planning, the iPhone for shopping and cooking (October 2026).
- What a screen can do is asked of the screen, never read from the name of the device:
  widths, and `(hover: hover) and (pointer: fine)` for hover. Nothing may depend on hover or
  a mouse.
- The `tablet` variant (`@custom-variant` in `globals.css`) is at least 46rem wide and 30rem
  tall: an iPad either way and an iPad mini upright, not a phone held across. On it the
  recipe chooser has the week beside it, a recipe's ingredients and steps stand side by side,
  and the cooking view puts its ingredients beside the steps.
- The week plan stands each day above its lunch and dinner from `sm` to `lg` (an iPad
  upright) and beside them from `lg` on; in a third of the width a long dish ran into its
  stepper.
- The sections in the bar are Woche, Einkauf, Rezepte, Favoriten and Import. "Rezepte" has
  two views at its top, as the week has (`RecipeViews`, a segmented control): "Entdecken" to
  find something to cook and "Regal" to leaf through the cookbooks. Looking after the library
  ("Alle Rezepte") is under Import, beside bringing recipes in, where the earlier batches
  were; those are folded below it.

## Pictograms and logo

- A recipe has a pictogram (`pictogramFor`: pasta, soup, fish, cake, 21 in all, drawn as
  lines in `pictogram-paths.ts`). It stands large and pale behind a card's text
  (`.watermark`) and small on its pastel on a recipe card (`.badge`). It is drawn sharp:
  the household did not want it out of focus. Never a photo.
- Pictograms on a tinted square are for the recipe cards and the tiles of the shopping notes.
  On the week (its meals, today, a suggestion, the week beside the meal chooser) a dish's
  kind is a small dot in its colour in front of its name (`.dot`, `.dot-first` on the
  middle of the name's first line), grey for a meal without a recipe, a ring for an open
  meal in the chooser's week. Chosen on 22 November 2026: with a square in front of every
  meal, every row of the week was a row of tiles. Elsewhere the squares are still to go
  (see [STATUS.md](STATUS.md)).
- Which picture a recipe gets: the kind of dish decides before what is in it (a salmon pasta
  is pasta). The dish a title names first decides before its sides ("Steak mit
  Pfefferrahmsoße, Pilzen und Spätzle" is meat). A meatless dish named after a vegetable with
  a picture of its own shows that one ("Pilze in Knoblauchsauce" a mushroom), and only the
  rest the carrot.
- Every way to narrow the library down has a pictogram too (`pictogramForFilter`, 24 more):
  each category, effort, kind of dish, cuisine, season, occasion, diet, and a book for a
  cookbook. A tag the household made itself is a label. They show on the tiles under
  "Stöbern" and on the filter chips. A new tag with a key needs an entry in `TAG_PICTURE`, or
  it is shown as a label. To look at a new drawing, render the paths with sharp: at the size
  of a badge a line is about a pixel wide.
- The logo is a plate with its cutlery on the app's green, and "Essensplan" with the plan in
  green (`logo.tsx`, `app/icon.svg`).

## Strip of the sections and header

- On a phone the five sections are a strip of paper across the foot of the screen
  (`.tabbar`): the surface's white, a hairline above it, no blur, no float, no shadow. A
  sign stands above each name in the muted ink, the names at 13px; the open section has its
  name under the highlighter of today (`.marked`) and its sign in the green. Every tab is
  at least 44px. Chosen on 22 November 2026: the household wanted the app not to "look like
  any other app", and the round bar of liquid glass that floated above the screen's foot
  (October 2026, `GlassSurface`) is what every app has now.
- It has a layer of its own (`translateZ(0)`), and every entrance of a page lets go of its
  transform when it ends (`backwards`, not `both`): on the iPhone, content left on a layer by
  its animation was drawn over the bar (October 2026).
- That entrance (`page-in`) is never switched off or renamed, only where it starts
  (`--page-in-*`): switched off while a page moved, it started again the moment the move
  ended, and the page flickered once after every tap on a section (October 2026).
- A tapped section is the current one the moment the finger lands, before its page has come
  (`AppNav`).
- Every page ends above the strip: its foot leaves the strip's height free
  (`--tabbar-height`), so that nothing lies under it at the end of a scroll, and what stands
  at the foot of the screen (the offline bar, the bar of ticked recipes, "Fertig" of a
  photographed recipe) stands on it. The Rezept-Stapel's deck takes what the screen has left
  above its three buttons: at its old height they lay under the bar on a 375px phone
  (November 2026). `e2e/small-phone.spec.ts` checks both.
- The header stays at the top of every page on a strip of the page's paper as wide as the
  screen (`.app-header`), solid, fading out at its foot instead of ending in a line, so that
  the Merkzettel and the settings are one tap away halfway down a long list; anchors land
  below it (`scroll-padding-top`), and `body` clips sideways so that the strip does not
  widen the page. It was frosted glass until 22 November 2026.
- The strip's signs keep clear of the iPhone's own home bar (`viewport-fit=cover` and
  `env(safe-area-inset-bottom)`): right at the edge, a tap on a section brought up the
  phone's gestures. They reach half a rem into that inset: above the whole of it, the bar
  stood too high (October 2026).
- Next to the Merkzettel stands the first letter of whoever is signed in on the green
  (`.account`, `initialOf`), the way to the settings, on every screen size.
- Between a phone and a large screen (`sm` to `lg`, an iPad upright) the header holds the
  sections too: the logo stands without its name there. With the logo's name and a sign-out
  button in the header the page was 983 pixels wide on an 810 pixel iPad, which zoomed it out
  and pushed fixed bars off the screen. "Abmelden" is only in the settings, under "Dein
  Konto": the family wanted it off every main section (October 2026).

## Section colours

- No section has a colour of its own: every page lies on the paper, and nothing tints the
  top of a page or the header. From October 2026 each section had a pastel at the top of its
  pages (`--section-tint`: Woche sage, Einkauf a misty blue, Rezepte peach, Favoriten blush,
  Import lavender) and a breath of green lay behind the header; on 22 November 2026 the
  household chose today's colours cleaned up, the paper alone (palette C1).

## Colours of kinds

- Every kind of meal has a pastel of its own (vegetarian, fish, poultry, meat: `--color-veg`
  and so on). Cakes and desserts have one too (`kind-sweet`), so a cake is not shown as a
  vegetarian meal. A parent with the class `kind-<group>` sets it; `.tag` and `.dot` inside
  use it. The same colour marks the kind on a recipe card, next to a planned meal, in the
  week's count and in the goals.
- The colours of the kinds are small marks only: a dot, a tag, the edge of a planned meal,
  the square behind a recipe card's pictogram, a part of a chart. No card or tile is filled
  with one (22 November 2026): the week's count is one row of numbers, each with a dot, its
  name and its goal in small words, a count over its goal in the warning colour
  (`.balance-row`); it was four pastel tiles with bars, the loudest thing on the page. The
  recipe of the day, the tiles beside it and the Rezept-Stapel's cards are paper with the
  pictogram on its pastel.

## App feel and loading

- It behaves like an installed app (`AppFeel`, root layout): no zoom (the viewport says so,
  and Safari's pinch is stopped by its gesture events; the map of the supermarkets still
  zooms), no bounce past the header or the foot (`overscroll-behavior: none` on `html` and
  `body`), and upright on a phone: the manifest and `screen.orientation.lock` hold Android
  upright; an iPhone cannot be held, so a phone held across (low, touched: `TurnUpright`)
  sees only "Bitte das Handy hochkant halten." until it is upright again. An iPad turns.
- Every main section has a `loading.tsx` (`PageLoading`: its name and the pale shape of a
  sheet or of cards, there at once and breathing after 250ms: after a delay of 150ms
  nothing answered a tap, and the household tapped again; a shape that stood still read as
  an empty page). So do the pages opened most from inside one: a recipe, the Regal, the
  meal chooser, all weeks and the settings. Without one a dynamic route is not prefetched,
  and a tap on a tab waited half a second for the whole page with nothing to show for it.
  A change of the search part of the address and the redirect after a form do not show
  it; a full load streams it first, so it carries no status role.
- A loading shape shows only once the browser has fetched it ahead, which Safari does for
  the links on the screen a moment after they appear: a recipe tapped right after
  scrolling showed an empty page for half a second (October 2026). So every tap on a link
  of the app also starts a thin green line at the top (`NavigationProgress`,
  `data-navigating` on `html`), from 60ms on until the address is the link's and the page
  shows something other than its loading shape; ten seconds at most.

Prefetching, `staleTimes` and what is read when: see [ARCHITECTURE.md](ARCHITECTURE.md#speed).

## Page transitions

- A page follows the one before it as its link says (`transitionTypes`,
  `src/lib/transitions.ts`, the `<ViewTransition>` around the page in the layout): from the
  right going in, to a section further right or to the next week; from the left going back;
  cross-faded for another view of the same page (Mahlzeiten and Außerdem, Entdecken and
  Regal).
- Going in or back takes 240ms; another section of the bar, changed dozens of times a day,
  200ms over a shorter way. A blur at the start stuttered on the iPhone and was taken out.
- The old page is not drawn at all: Safari draws the picture of an old page over everything,
  the bar of the sections included, whatever its z-index, and one picture less is what the
  iPhone needed to move smoothly.
- While a page moves, the header and the bar are views of their own above it (`app-header`,
  `app-tabbar`), shown at once in their new state. Only then: a named element is a backdrop
  root, and named for good, the glass bar of October 2026 saw nothing behind it to blur and
  stood clear as glass. The paper strip kept it so; it costs nothing.
- A value that many elements inherit is never faded: the section pastels of October 2026,
  faded, recalculated every element of the page in every frame while the tap loaded the
  next page.
- The raised pill of a segmented control is an element of its own (`SegmentPill`, named per
  control) that slides to the other view, under the words; a pill whose page goes without one
  on the next goes with it (`:only-child`).
- Only a link that names one moves the page: a live refresh and the answer to a form change
  it in place, or every tick in the shop would make the note flicker. A step back in the
  history (`BackToList`) names none and marks the page (`data-going`) instead.
- Asked for less motion, pages only fade.

## Motion

- What moves, moves a little: a card lifts under the finger (`.lift`), a page comes in
  softly, and both are off for whoever asked for less motion. Nothing depends on it.
- Every animation takes one of three curves (`--ease-out`, `--ease-in-out`, `--ease-drawer`
  in `@theme`) and stays under 300ms, except the Merkzettel's swing, the rubber and the way
  from the welcome into the app, which are meant to be seen.
- The welcome lifts off on the tap (`.welcome-leaving`: React runs no exit transition for a
  page Next.js leaves), and the app comes in under it in three parts 60ms apart, header, page
  and the bar of the sections (the transition type `willkommen`,
  `:active-view-transition-type`).
- A tick on a note is drawn like a pen stroke in 200ms and goes at once when taken back (a
  transition on `stroke-dashoffset`, the path's length 1).
- What a fold holds comes out with a short fade and drop (`unfold`).
- A line ticked off folds out of its place 450ms after the last tick, as a removed line does
  (`data-gone`, 160ms), and comes out under "Gekauft" at the end with `unfold`
  (`data-arrived`), so that quick ticks go together and nothing moves under the thumb. What
  is bought lies paler there. Asked for less motion, it simply moves.
- The views for the shop and for cooking rise like a sheet (`sheet-up`) and go back down the
  way they came (`leaveSheet`, `sheet-down`, 200ms, as the Merkzettel goes up on its string).
- The bar of "Alle Rezepte" for ticked recipes rises from the foot and goes back down
  (`@starting-style` and `display` with `allow-discrete`).
- The offline bar comes up a little and goes at once.
- A heart swells while the favourite is saved.
- The stamp of an errand finished moments ago is pressed on (`justFinished`: its last tick
  less than two minutes ago), and simply there on every later visit.
- A market's card on the map comes up from its lower edge.
- A note picked up comes from 95%, not from 80%.
- Asked for less motion, what comes and goes still fades but does not travel, and nothing is
  drawn.

## Tailwind and checking the look

- Tailwind runs as a PostCSS plugin (the `postcss` key in `package.json`),
  as the Next.js guide sets it up. The Turbopack loader `@tailwindcss/turbopack` used before
  never picked up a change to `globals.css` in a running dev server: the household saw a
  day's worth of new pages without their styles.
- After a change of the look, check it in the running app itself (fetch the stylesheet or
  take a screenshot); passing tests do not show a missing style.

## How we work on design

- Check the look in the running app (2026-10-12). The user sent screenshots of new pages and
  wrote: "that looks cheap. you can do better ... seems random placed, no structure, no clear
  design. very poor". The pages were missing their stylesheet: his dev server had been running
  since the morning and, with the Tailwind Turbopack loader, never picked up changes to
  `globals.css`. All browser tests had passed, and the one check ("title font is
  sans-serif") passed trivially without the new rules. A stale stylesheet seen once in the
  test server had been written off as a cache hiccup.
  - Tests assert text and behaviour, not styling. He judges the app by what he sees in his
    browser.
  - After switching his project folder to new UI code, fetch the stylesheet from
    `localhost:3000` and grep for a class added in that change, or take screenshots from port
    3000 with the test household (`E2E_PORT=3000`) and look at them.
  - An odd rendering seen once is a finding to chase, not to wave through.
  - Tailwind now runs through PostCSS, which does pick up stylesheet changes; the check still
    applies.
- Broad look-and-feel changes go as previews first. For work like "improve the whole design"
  the user wants previews and picks what to take over; only the picked proposals get built.
  On 19 October 2026 he took over five of six proposals (the system typeface was left out);
  building everything first would have wasted work. Inject each proposal's CSS/JS into the
  real app with a throwaway Playwright spec (`page.addStyleTag`, `page.evaluate`) against the
  test household, photograph before and after on phone and desktop, and publish a comparison
  page with a tick per proposal. Remove the spec afterwards.
- Interaction and UI work follows the `apple-design` skill (gestures, sheets, menus, motion,
  feedback). The user asked for it in the shopping deviations task (October 2026) and checked
  afterwards whether it had been followed; he wants the app to feel native and calm. Respond
  on press, track drags 1:1, decide a release by projected momentum, keep origins and exits
  symmetric, keep controls quiet. Say in the summary which principles were applied, and name
  where the house rules deviate (see "Skills to use"). Check the result in screenshots.
- Reproduce iPhone motion and layering bugs in WebKit. The e2e projects run Chromium only;
  iPhone bugs need WebKit (`~/Library/Caches/ms-playwright/webkit-*` is installed).
  - Build for production (`npx next build && npx next start --port 3100`): dev timing
    differs.
  - Probe scripts use `webkit` + `devices["iPhone 14"]`, kept in `node_modules/.probe/` (the
    build type-checks `scripts/`). Use `npx tsx --env-file=.env.local` when importing
    `e2e/fixtures`. Use string `page.evaluate` (tsx injects `__name` into functions).
  - Slow view transitions to see them: inject
    `::view-transition-old(*), ::view-transition-new(*) { animation-duration: 3s !important }`,
    screenshot about 700ms after the tap, compare WebKit and Chromium side by side.
  - Headless browsers do not draw `backdrop-filter`: text crisp behind a frosted surface (the
    cooking view's foot, a row's menu) is not a layering bug. Check whether its icons are on
    top instead.
  - Check every new layout trick in WebKit too, not only Chromium: on 2026-10-28 the user
    found the Regal's spine names upside down and overlapping on the iPad, while every
    Chromium screenshot looked right (`-webkit-line-clamp` is not drawn in vertical writing in
    WebKit). `node_modules/.probe/shot-region-webkit.mts` screenshots one element.
  - Found this way (October 2026): Safari draws `::view-transition-old` of the page over
    everything regardless of z-index; prefetch of off-screen links is late, so `loading.tsx`
    may not show.
- UI copy rule applies to chat too: keep status updates concrete and skip boilerplate.

## Skills to use

Skills are committed under `.claude/skills/`. Load the one that fits the task:

- Building a new animation or transition: `animate`
- Reviewing existing motion code or a diff: `review-animations`
- Auditing the whole codebase's motion and planning fixes: `improve-animations`
- Finding places that should animate but do not: `find-animation-opportunities`
- Janky or choppy animation, choosing which property to animate, `will-change`:
  `animation-performance`
- Naming an effect described vaguely ("the bouncy thing when a popover opens"):
  `animation-vocabulary`
- Gestures, springs, drag/swipe/sheets, translucent materials, typography, reduced motion,
  interruptible transitions: `apple-design`
- UI polish, component design, the invisible details: `emil-design-eng`
- Phone feel, PWA, tap highlights, `100vh`, notch, touch interactions: `mobile-native`
- Stress-testing a screen with worst-case data: `break-ui`
- Several genuinely different versions of a UI piece behind a picker (explicit invocation
  only): `prototype`
- Choosing a frontend library (explicit invocation only): `pick-ui-library`

Where this project's rules override a skill:

- `/apple-design` is to be followed for UI interactions, but where this document is stricter,
  follow this document and name the deviation: the three house curves (`--ease-out`,
  `--ease-in-out`, `--ease-drawer`) under 300ms instead of springs (exceptions listed under
  "Motion"), and no haptics on iPhone.
- No serif typeface and no filler copy, whatever a skill suggests as typography or wording.
  `/apple-design` would start from the system's typeface: here it is Figtree on the scale
  under "Principles" (22 November 2026).
- `/apple-design` builds bars of translucent material with the page scrolling under them:
  here the strip of the sections and the header are solid paper (22 November 2026).
- Pastel marks on the paper, the paper metaphors above, and pills for buttons and filter
  chips (only) stay as they are.
- Controls are at least 44px and text in a field at least 16px; "reduced motion" means
  fading without travel here, as described under "Motion".
- Skills that propose a broad redesign (`prototype`, `emil-design-eng`) are used the way
  "How we work on design" says: previews first, the household picks, then build.
- Motion advice from `mobile-native` and `animation-performance` is checked in WebKit as
  well (see "How we work on design").
