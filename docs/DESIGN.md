# Design

How Essensplan looks and moves, and why: the household's decisions, with the incidents behind
them, and how to work on the look. UI text is German; this document is English.

## Principles

- Calm and structured: warm paper, dark ink, one green accent, generous spacing, no pictures
  needed. One sans-serif family for everything. No serif typeface: the household does not
  want the look of an AI product (twice: the user asked for no serif font on 2026-10-12, and
  the system typeface was left out of the proposals taken over on 19 October 2026).
- No headings in capitals with wide letter spacing: the household reads them as machine-made.
  A small label (`.eyebrow`) is written as it is spelled.
- Words on the screen say something concrete or are left out. No filler such as "for
  variety" or "just for you"; a suggestion without a reason shows none. (The incident: page
  and recipe titles were set in a system serif, and "Zur Abwechslung" was shown under every
  suggestion that had no specific reason. The user wrote: "please dont use the serif claude
  font. use anouther modern one instead. also please no generic statements from ai!")
- Keep the palette pastel: the household asked for that.
- What the household wants: clean, easy to use, structured, not too fancy but still premium.

## Paper and notes

A few things are borrowed from the handwritten notes the app replaces, and only these:

- The week plan and every shopping list are a sheet of a pad (`.sheet`: holes along the top,
  two more sheets underneath).
- A list has ruled lines and a margin (`.ruled`) with a tick made by a pen (`.tickbox`).
- What ran out at home is written on a yellow note stuck on with tape (`.note`).
- A meal without a recipe carries a small yellow slip.
- Today is marked with a highlighter (`.marked`), "Heute" beside it in the green, far enough
  away for the mark to reach past the name.
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
  A link to `#merkzettel` pulls it down too.
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
- An action written as a link is a pill too, its words in the green on the green's pastel:
  the way back (`BackLink`, "← Wochenplan") and every standalone link the size of a finger
  (`.link.min-h-11`, "Alle Wochen").
- Buttons that belong together stand in one row, also on a phone: where words would break it,
  the lesser ones are a sign with their words as label and title (the plan's Pinnwand and
  Leeren, the statistics, the week's arrows), and "Plan speichern" is "Speichern"
  (October 2026).
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
  (`.watermark`) and small on its pastel in front of a name (`.badge`). It is drawn sharp:
  the household did not want it out of focus. Never a photo.
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

## Glass tab bar and header

- On a phone the five sections are a round bar of liquid glass that floats above the bottom
  of the screen (`.tabbar`, `GlassSurface` from `src/components/ui/glass.tsx`: blur, a white
  tint, a sheen and a bright rim; Safari cannot bend the page through it as Chrome can and
  keeps it frosted), the page visible under it, with a sign above each name and the open
  section on the green's pastel.
- It has a layer of its own (`translateZ(0)`), and every entrance of a page lets go of its
  transform when it ends (`backwards`, not `both`): on the iPhone, content left on a layer by
  its animation was drawn over the glass (October 2026).
- That entrance (`page-in`) is never switched off or renamed, only where it starts
  (`--page-in-*`): switched off while a page moved, it started again the moment the move
  ended, and the page flickered once after every tap on a section (October 2026).
- A tapped section is the current one the moment the finger lands, before its page has come
  (`AppNav`).
- The header stays at the top of every page on a strip of frosted paper as wide as the screen
  (`.app-header`), so that the Merkzettel and the settings are one tap away halfway down a
  long list; anchors land below it (`scroll-padding-top`), and `body` clips sideways so that
  the strip does not widen the page. Asked for less transparency, both are solid.
- The bar keeps clear of the iPhone's own home bar (`viewport-fit=cover` and
  `env(safe-area-inset-bottom)`): right at the edge, a tap on a section brought up the
  phone's gestures. It reaches half a rem into that inset: above the whole of it, the bar
  floated too high (October 2026).
- Next to the Merkzettel stands the first letter of whoever is signed in on the green
  (`.account`, `initialOf`), the way to the settings, on every screen size.
- Between a phone and a large screen (`sm` to `lg`, an iPad upright) the header holds the
  sections too: the logo stands without its name there. With the logo's name and a sign-out
  button in the header the page was 983 pixels wide on an 810 pixel iPad, which zoomed it out
  and pushed fixed bars off the screen. "Abmelden" is only in the settings, under "Dein
  Konto": the family wanted it off every main section (October 2026).

## Section colours

- Each section has a pastel of its own at the top of its pages, fading into the paper
  (`.app-shell`, `--section-tint`): Woche sage, Einkauf a misty blue, Rezepte peach, Favoriten
  blush, Import lavender; no yellow. It is read in CSS from the section the bar marks as
  current, so it is there from the first paint and changes with the tap.

## Colours of kinds

- Every kind of meal has a pastel of its own (vegetarian, fish, poultry, meat: `--color-veg`
  and so on). Cakes and desserts have one too (`kind-sweet`), so a cake is not shown as a
  vegetarian meal. A parent with the class `kind-<group>` sets it; `.tag` and `.dot` inside
  use it. The same colour marks the kind on a recipe card, next to a planned meal, in the
  week's count and in the goals.

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
  `app-tabbar`), shown at once in their new state, frosted paper instead of glass for that
  moment. Only then: a named element is a backdrop root, and named for good, the bar saw
  nothing behind it to blur and stood clear as glass (October 2026).
- The pastel of a section is not faded: a change of an inherited value recalculated every
  element of the page in every frame while the tap loaded the next page.
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
- The bars of the week's balance grow when a meal is planned (`scaleX`, not the width).
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
  - Headless browsers do not draw `backdrop-filter`: text crisp behind the glass bar is not a
    layering bug. Check whether the bar's icons are on top instead.
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
- Pastel palette, the paper metaphors above and the pill controls stay as they are.
- Controls are at least 44px and text in a field at least 16px; "reduced motion" means
  fading without travel here, as described under "Motion".
- Skills that propose a broad redesign (`prototype`, `emil-design-eng`) are used the way
  "How we work on design" says: previews first, the household picks, then build.
- Motion advice from `mobile-native` and `animation-performance` is checked in WebKit as
  well (see "How we work on design").
