import Link from "next/link";
import { ArrowIcon, LockIcon } from "@/components/icons";
import { ShopLogo } from "@/components/shop-logo";
import { SubmitButton } from "@/components/submit-button";
import type { Ingredient, Shop } from "@/domain/catalog";
import { addSupermarket, markSupermarket, savePostalCode, searchAgain } from "./actions";

/** What went wrong the last time, as the card says it. */
const PROBLEM: Record<string, string> = {
  plz: "Diese Postleitzahl gibt es nicht. Eine deutsche Postleitzahl hat fünf Ziffern.",
  suche:
    "Die Suche nach Supermärkten hat gerade nicht geklappt. Die Postleitzahl ist gespeichert, „Neu suchen“ versucht es noch einmal.",
  supermarkt: "Das ist kein Supermarkt: Metzger, Bäcker und Markt haben eigene Zettel.",
};

/**
 * The household's supermarkets, found near its postal code: five to choose from, with their
 * logos. One is the main market, where everything for the supermarket is bought; the others
 * marked are gone to now and then, and a line moved to one of them for a week stands in a
 * section of its own on the note. Without a postal code nothing can be chosen.
 */
export function SupermarketsCard({
  postalCode,
  placeName,
  found,
  chosen,
  problem,
}: {
  postalCode: string | null;
  placeName: string | null;
  /** The supermarkets found near the postal code. */
  found: Shop[];
  /** The household's supermarkets, the main one first. */
  chosen: Shop[];
  /** What went wrong the last time, if anything (`PROBLEM`). */
  problem: string | null;
}) {
  // The chosen ones first, then the rest of what was found near the postal code.
  const tiles = [...chosen, ...found.filter((shop) => !chosen.some((each) => each.id === shop.id))];
  return (
    <section className="card scroll-mt-4 p-4" aria-labelledby="supermaerkte">
      <h2 id="supermaerkte" className="text-lg font-bold tracking-tight">
        Supermärkte
      </h2>
      <p className="mt-1 text-sm text-muted">
        Alles für den Supermarkt steht unter dem Hauptmarkt. Eine Zeile lässt sich auf dem Zettel zu
        einem weiteren Markt schieben, der dann einen eigenen Abschnitt bekommt.
      </p>

      <form action={savePostalCode} className="mt-3 flex items-end gap-2">
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
      </form>
      {problem && PROBLEM[problem] && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          {PROBLEM[problem]}
        </p>
      )}

      {!postalCode ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-line p-4 text-muted">
          <LockIcon />
          <p className="text-sm">
            Mit eurer Postleitzahl sucht die App fünf Supermärkte in eurer Nähe. Bis dahin lässt
            sich kein Markt auswählen.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="font-semibold">
              {placeName ? `In ${placeName}` : `Rund um ${postalCode}`}
            </h3>
            <form action={searchAgain}>
              <SubmitButton className="link min-h-10 text-sm">Neu suchen</SubmitButton>
            </form>
          </div>
          {tiles.length === 0 ? (
            <p className="mt-2 text-muted">
              Keine Supermärkte gefunden. „Neu suchen“ versucht es noch einmal, oder unten von Hand
              eintragen.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label="Supermärkte">
              {tiles.map((shop) => (
                <SupermarketTile
                  key={shop.id}
                  shop={shop}
                  role={
                    chosen[0]?.id === shop.id
                      ? "main"
                      : chosen.some((each) => each.id === shop.id)
                        ? "more"
                        : "none"
                  }
                />
              ))}
            </ul>
          )}
          <details className="mt-3">
            <summary className="link inline-flex min-h-10 items-center text-sm">
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

/** One supermarket: its logo and name, what it is to the household, and how to change that. */
function SupermarketTile({ shop, role }: { shop: Shop; role: "main" | "more" | "none" }) {
  const mark = (as: "main" | "more" | "none", text: string, label: string, className: string) => (
    <form action={markSupermarket}>
      <input type="hidden" name="id" value={shop.id} />
      <input type="hidden" name="as" value={as} />
      <SubmitButton className={className} label={label}>
        {text}
      </SubmitButton>
    </form>
  );
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        role === "main"
          ? "border-accent bg-accent-soft/60"
          : role === "more"
            ? "border-accent/40"
            : "border-line"
      }`}
    >
      <span className="flex items-center gap-3">
        <ShopLogo shop={shop} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{shop.name}</span>
          <span className="block truncate text-sm text-muted">
            {role === "main" ? "Hauptmarkt" : role === "more" ? "Weiterer Markt" : shop.address}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        {role !== "main" &&
          mark("main", "Hauptmarkt", `${shop.name} als Hauptmarkt`, "chip min-h-9 text-sm")}
        {role === "none" &&
          mark("more", "Weiterer Markt", `${shop.name} als weiteren Markt`, "chip min-h-9 text-sm")}
        {role !== "none" &&
          mark(
            "none",
            "Entfernen",
            `${shop.name} entfernen`,
            "min-h-9 px-1 text-sm font-semibold text-muted hover:text-danger",
          )}
      </span>
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
