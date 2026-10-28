import Link from "next/link";
import { HelpHeading } from "@/components/help-heading";
import { ArrowIcon, LockIcon, StarIcon, TickIcon } from "@/components/icons";
import { ShopLogo } from "@/components/shop-logo";
import { SubmitButton } from "@/components/submit-button";
import type { AisleGroup, Ingredient, Shop } from "@/domain/catalog";
import { kindsText, offeredSupermarkets } from "@/domain/shopping-list/supermarkets";
import {
  addSupermarket,
  markSupermarket,
  savePostalCode,
  saveSupermarketDetails,
  searchAgain,
} from "./actions";
import { AddressField } from "./address-field";
import { SearchPending } from "./search-pending";
import { SupermarketMap } from "./supermarket-map";

/** What went wrong the last time, as the card says it. */
const PROBLEM: Record<string, string> = {
  plz: "Diese Postleitzahl gibt es nicht. Eine deutsche Postleitzahl hat fünf Ziffern.",
  suche:
    "Die Suche nach Supermärkten hat gerade nicht geklappt. Die Postleitzahl ist gespeichert, „Neu suchen“ versucht es noch einmal.",
  supermarkt: "Das ist kein Supermarkt: Metzger, Bäcker und Markt haben eigene Zettel.",
};

/**
 * The household's supermarkets, found near its postal code: on a small map, and as tiles
 * with their logos, five at first and the others under "Weitere anzeigen". One is the main
 * market, where everything for the supermarket is bought; the others marked are gone to now
 * and then, and a line moved to one of them for a week stands in a section of its own on
 * the note. Each of the household's markets can be given its street and the kinds of
 * grocery bought there. Without a postal code nothing can be chosen.
 */
export function SupermarketsCard({
  postalCode,
  placeName,
  found,
  chosen,
  problem,
  reason,
  aisleGroups,
  saved,
}: {
  postalCode: string | null;
  placeName: string | null;
  /** The supermarkets found near the postal code. */
  found: Shop[];
  /** The household's supermarkets, the main one first. */
  chosen: Shop[];
  /** What went wrong the last time, if anything (`PROBLEM`). */
  problem: string | null;
  /** Why the search failed, as the services said it: "overpass-api.de: 504". */
  reason?: string | null;
  /** The household's kinds of grocery, to say what is bought at a market. */
  aisleGroups: readonly AisleGroup[];
  /** The market whose details were just saved. */
  saved?: string | null;
}) {
  // The chosen ones first, then the best-known chains, so that a market is easy to find.
  const { shown, more } = offeredSupermarkets(found, chosen);
  const tiles = [...shown, ...more];
  const roleOf = (shop: Shop) =>
    chosen[0]?.id === shop.id
      ? "main"
      : chosen.some((each) => each.id === shop.id)
        ? "more"
        : "none";
  const tile = (shop: Shop) => (
    <SupermarketTile
      key={shop.id}
      shop={shop}
      role={roleOf(shop)}
      aisleGroups={aisleGroups}
      saved={saved === shop.id}
    />
  );
  return (
    <section className="card scroll-mt-4 p-4" aria-labelledby="supermaerkte">
      <HelpHeading id="supermaerkte" title="Supermärkte" level={2}>
        Alles für den Supermarkt steht unter dem Hauptmarkt. Was ihr bei einem weiteren Markt kauft
        (unter „Angaben“, etwa Tiefkühl bei Aldi), bekommt dort einen eigenen Abschnitt, und eine
        einzelne Zeile lässt sich auf dem Zettel hinschieben.
      </HelpHeading>

      <form action={savePostalCode} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="label">Postleitzahl</span>
          <input
            name="plz"
            defaultValue={postalCode ?? ""}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={7}
            className="field"
            placeholder="z. B. 10115"
          />
        </label>
        <SubmitButton>{postalCode ? "Ändern" : "Suchen"}</SubmitButton>
        <SearchPending />
      </form>
      {problem && PROBLEM[problem] && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          {PROBLEM[problem]}
          {problem === "suche" && reason && (
            <span className="mt-1 block text-sm opacity-80">Grund: {reason}</span>
          )}
        </p>
      )}

      {!postalCode ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-line p-4 text-muted">
          <LockIcon />
          <p className="text-sm">
            Mit eurer Postleitzahl sucht die App die Supermärkte in eurer Nähe. Bis dahin lässt sich
            kein Markt auswählen.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="font-semibold">
              {placeName ? `In ${placeName}` : `Rund um ${postalCode}`}
            </h3>
            <form action={searchAgain} className="flex flex-wrap items-center justify-end gap-2">
              <SubmitButton className="link min-h-11 text-sm">Neu suchen</SubmitButton>
              <SearchPending />
            </form>
          </div>
          <p className="text-sm text-muted">
            Tippe die Märkte an, in denen ihr einkauft. Der mit dem Stern ist der Hauptmarkt.
          </p>
          {tiles.length === 0 ? (
            <p className="mt-2 text-muted">
              Keine Supermärkte gefunden. „Neu suchen“ versucht es noch einmal, oder unten von Hand
              eintragen.
            </p>
          ) : (
            <>
              <SupermarketMap
                shops={[...found, ...chosen.filter((shop) => !found.includes(shop))]}
                chosen={chosen}
                aisleGroups={aisleGroups}
              />
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Supermärkte">
                {shown.map(tile)}
              </ul>
              {more.length > 0 && (
                <details className="mt-2">
                  <summary className="link inline-flex min-h-11 items-center text-sm">
                    Weitere anzeigen ({more.length})
                  </summary>
                  <ul
                    className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2"
                    aria-label="Weitere Supermärkte"
                  >
                    {more.map(tile)}
                  </ul>
                </details>
              )}
            </>
          )}
          <details className="mt-3">
            <summary className="link inline-flex min-h-11 items-center text-sm">
              Ein Markt fehlt?
            </summary>
            <form action={addSupermarket} className="mt-1 flex gap-2">
              <label className="flex-1">
                <span className="sr-only">Supermarkt von Hand eintragen</span>
                <input
                  name="name"
                  required
                  maxLength={40}
                  autoComplete="off"
                  className="field"
                  placeholder="Name, z. B. Rewe"
                />
              </label>
              <SubmitButton>Eintragen</SubmitButton>
            </form>
          </details>
        </>
      )}
    </section>
  );
}

/**
 * One supermarket: a tap on it makes it one of the household's or no longer one; the star
 * next to a chosen one makes it the main market. The first one chosen is the main one by
 * itself. Two buttons per market were one too many to choose five. A chosen one says what
 * is bought there, and "Angaben" below takes its street and those kinds of grocery.
 */
function SupermarketTile({
  shop,
  role,
  aisleGroups,
  saved,
}: {
  shop: Shop;
  role: "main" | "more" | "none";
  aisleGroups: readonly AisleGroup[];
  saved: boolean;
}) {
  const chosen = role !== "none";
  const kinds = kindsText(shop, aisleGroups);
  return (
    <li
      className={`rounded-lg border ${
        role === "main"
          ? "border-accent bg-accent-soft/70"
          : chosen
            ? "border-accent/50 bg-accent-soft/30"
            : "border-line"
      }`}
    >
      <div className="flex items-center gap-1 pr-1">
        <form action={markSupermarket} className="min-w-0 flex-1">
          <input type="hidden" name="id" value={shop.id} />
          <input type="hidden" name="as" value={chosen ? "none" : "more"} />
          <SubmitButton
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left"
            label={chosen ? `${shop.name} abwählen` : `${shop.name} auswählen`}
            on={chosen}
          >
            <ShopLogo shop={shop} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{shop.name}</span>
              <span className="block truncate text-sm text-muted">
                {[
                  role === "main" ? "Hauptmarkt" : role === "more" ? "Weiterer Markt" : null,
                  shop.address,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {chosen && kinds && (
                <span className="block truncate text-sm text-accent">{kinds}</span>
              )}
            </span>
            <span
              aria-hidden
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                chosen ? "border-accent bg-accent text-white" : "border-line bg-white"
              }`}
            >
              {chosen && <TickIcon />}
            </span>
          </SubmitButton>
        </form>
        {chosen &&
          (role === "main" ? (
            <span
              className="flex size-11 items-center justify-center text-accent"
              title="Hauptmarkt"
              aria-label={`${shop.name} ist der Hauptmarkt`}
            >
              <StarIcon filled />
            </span>
          ) : (
            <form action={markSupermarket}>
              <input type="hidden" name="id" value={shop.id} />
              <input type="hidden" name="as" value="main" />
              <SubmitButton
                className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent"
                label={`${shop.name} zum Hauptmarkt machen`}
              >
                <StarIcon />
              </SubmitButton>
            </form>
          ))}
      </div>
      {chosen && (
        <details className="border-t border-line/70 px-3 pb-2">
          <summary className="link inline-flex min-h-11 items-center text-sm">
            Angaben
            {saved && (
              <span role="status" className="ml-2 text-accent no-underline">
                Gespeichert
              </span>
            )}
          </summary>
          <form action={saveSupermarketDetails} className="grid gap-3 pb-1">
            <input type="hidden" name="id" value={shop.id} />
            <AddressField defaultValue={shop.address ?? ""} />
            <fieldset>
              <legend className="label">Was ihr dort kauft</legend>
              <p className="mb-2 text-sm text-muted">
                Steht auf dem Supermarktzettel unter diesem Markt. Was auf dem Markt, beim Metzger
                oder Bäcker gekauft wird, bleibt auf deren Zetteln.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {aisleGroups.map((group) => (
                  <label key={group.id} className="chip cursor-pointer">
                    <input
                      type="checkbox"
                      name="kinds"
                      value={group.id}
                      defaultChecked={shop.aisleGroupIds?.includes(group.id)}
                      className="sr-only"
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <SubmitButton>Speichern</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </li>
  );
}

/**
 * What is usually at home, as a tile: how many things and the first of them. The list
 * itself, by kind of grocery and to search and change, is a page of its own.
 */
export function PantryTile({ staples }: { staples: Ingredient[] }) {
  return (
    <Link
      href="/einstellungen/vorrat"
      className="card lift flex items-center justify-between gap-4 p-4"
      aria-label={`Vorrat: ${staples.length} Zutaten, ansehen und ändern`}
    >
      <span className="min-w-0">
        <span className="block text-lg font-bold tracking-tight">Vorrat</span>
        <span className="mt-1 block text-sm text-muted">
          {staples.length === 0
            ? "Noch nichts. Was meistens da ist, steht unter „Haben wir schon“ statt auf einem Zettel."
            : `${staples.length} Zutaten, die meistens da sind: ${staples
                .slice(0, 5)
                .map((ingredient) => ingredient.name)
                .join(", ")}${staples.length > 5 ? " …" : ""}`}
        </span>
      </span>
      <span className="text-accent">
        <ArrowIcon />
      </span>
    </Link>
  );
}
