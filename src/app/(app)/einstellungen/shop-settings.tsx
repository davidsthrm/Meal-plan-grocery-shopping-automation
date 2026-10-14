import { SubmitButton } from "@/components/submit-button";
import type { Ingredient, Shop } from "@/domain/catalog";
import {
  addStaple,
  addSupermarket,
  makeMainSupermarket,
  removeStaple,
  removeSupermarket,
} from "./actions";

/**
 * The household's supermarkets: the main one, where everything for the supermarket is
 * bought, and others it goes to now and then. A line moved to one of them for a week
 * stands in a section of its own on the note.
 */
export function SupermarketsCard({
  supermarkets,
  others,
  failed,
}: {
  /** The household's supermarkets, the main one first. */
  supermarkets: Shop[];
  /** Supermarkets the catalog knows that are none of them: offered while typing. */
  others: Shop[];
  /** A name was given that belongs to a place that is no supermarket. */
  failed: boolean;
}) {
  return (
    <section className="card scroll-mt-4 p-4" aria-labelledby="supermaerkte">
      <h2 id="supermaerkte" className="text-lg font-bold tracking-tight">
        Supermärkte
      </h2>
      <p className="mt-1 text-sm text-muted">
        Alles für den Supermarkt steht unter dem Hauptsupermarkt. Eine Zeile lässt sich auf dem
        Zettel zu einem anderen Supermarkt schieben, der dann einen eigenen Abschnitt bekommt.
      </p>
      {failed && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          Das ist kein Supermarkt: Metzger, Bäcker und Markt haben eigene Zettel.
        </p>
      )}
      {supermarkets.length > 0 ? (
        <ol className="mt-3 divide-y divide-line">
          {supermarkets.map((shop, at) => (
            <li key={shop.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{shop.name}</span>
                {at === 0 && <span className="ml-2 chip min-h-0 py-0.5 text-sm">Haupt</span>}
              </span>
              <span className="flex flex-wrap items-center gap-x-3">
                {at > 0 && (
                  <form action={makeMainSupermarket}>
                    <input type="hidden" name="id" value={shop.id} />
                    <SubmitButton
                      className="link min-h-10 text-sm"
                      label={`${shop.name} zum Hauptsupermarkt machen`}
                    >
                      Zum Hauptsupermarkt
                    </SubmitButton>
                  </form>
                )}
                <form action={removeSupermarket}>
                  <input type="hidden" name="id" value={shop.id} />
                  <SubmitButton
                    className="min-h-10 text-sm font-semibold text-muted hover:text-danger"
                    label={`${shop.name} entfernen`}
                  >
                    Entfernen
                  </SubmitButton>
                </form>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-muted">
          Noch keiner. Der erste, der hier steht, ist der Hauptsupermarkt.
        </p>
      )}
      <form action={addSupermarket} className="mt-3 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Supermarkt hinzufügen</span>
          <input
            name="name"
            required
            maxLength={40}
            list="supermarkt-namen"
            autoComplete="off"
            className="field"
            placeholder={supermarkets.length === 0 ? "z. B. Aldi" : "z. B. Rewe"}
          />
        </label>
        <SubmitButton>Hinzufügen</SubmitButton>
      </form>
      <datalist id="supermarkt-namen">
        {others.map((shop) => (
          <option key={shop.id} value={shop.name} />
        ))}
      </datalist>
    </section>
  );
}

/**
 * What is usually at home: salt, oil, flour. What a recipe needs of it goes under
 * "Haben wir schon" instead of on a note, and is bought after all with one tap there.
 */
export function PantryCard({
  staples,
  ingredients,
  unknown,
}: {
  staples: Ingredient[];
  /** Every ingredient of the catalog, offered while typing. */
  ingredients: Ingredient[];
  /** A name that was given and that the catalog does not know. */
  unknown: string | null;
}) {
  return (
    <section className="card scroll-mt-4 p-4" aria-labelledby="vorrat">
      <h2 id="vorrat" className="text-lg font-bold tracking-tight">
        Vorrat
      </h2>
      <p className="mt-1 text-sm text-muted">
        Was meistens da ist. Brauchen Rezepte es, steht es unter „Haben wir schon“ statt auf einem
        Zettel.
      </p>
      {unknown && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          „{unknown}“ kennt der Katalog nicht.
        </p>
      )}
      {staples.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Im Vorrat">
          {staples.map((ingredient) => (
            <li key={ingredient.id}>
              <form action={removeStaple}>
                <input type="hidden" name="id" value={ingredient.id} />
                <SubmitButton className="chip gap-1.5" label={`${ingredient.name} entfernen`}>
                  {ingredient.name}
                  <span aria-hidden className="text-muted">
                    ×
                  </span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-muted">Noch nichts.</p>
      )}
      <form action={addStaple} className="mt-3 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Zum Vorrat hinzufügen</span>
          <input
            name="name"
            required
            maxLength={80}
            list="vorrat-zutaten"
            autoComplete="off"
            className="field"
            placeholder="z. B. Mehl"
          />
        </label>
        <SubmitButton>Hinzufügen</SubmitButton>
      </form>
      <datalist id="vorrat-zutaten">
        {ingredients
          .filter((ingredient) => !ingredient.isPantryStaple)
          .map((ingredient) => (
            <option key={ingredient.id} value={ingredient.name} />
          ))}
      </datalist>
    </section>
  );
}
