import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { FamilySizeField } from "@/components/family-size-field";
import { ShoppingDaysFields } from "@/components/shopping-days-fields";
import { SubmitButton } from "@/components/submit-button";
import { TargetsFields } from "@/components/targets-fields";
import { requireHousehold } from "@/server/auth";
import { keepTargets, saveTargets } from "../actions";

export const metadata: Metadata = { title: "Ziele der Woche" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * What the household wants a week to contain. Shown once on every device before the plan,
 * and reachable from the plan afterwards.
 */
export default async function TargetsPage(props: PageProps<"/woche/ziele">) {
  const params = await props.searchParams;
  const first = one(params.start) === "1";
  const household = await requireHousehold();

  return (
    <div className="mx-auto max-w-xl">
      {!first && <BackLink href="/woche">Wochenplan</BackLink>}
      <p className="eyebrow mt-3">{first ? "Bevor es losgeht" : "Wochenplan"}</p>
      <h1 className="title mt-1">Ziele der Woche</h1>
      <p className="mt-2 text-muted">
        Wie oft soll es in einer Woche was geben? Die Vorschläge im Wochenplan richten sich danach,
        und die Zeile über dem Plan zählt mit.
      </p>
      {one(params.fehler) === "1" && (
        <p role="alert" className="mt-4 rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">
          Das passt nicht zusammen: „mindestens“ darf nicht größer sein als „höchstens“.
        </p>
      )}
      {one(params.fehler) === "tage" && (
        <p role="alert" className="mt-4 rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">
          Es braucht mindestens einen Einkaufstag im Supermarkt.
        </p>
      )}

      <form action={saveTargets} className="mt-6">
        {/* A household that opens the app for the first time also says for how many it cooks. */}
        {first && (
          <section className="mb-8" aria-labelledby="personen">
            <h2 id="personen" className="text-xl font-bold tracking-tight">
              Für wie viele kocht ihr?
            </h2>
            <p className="mt-1 mb-3 text-muted">
              So viele Portionen plant jede Mahlzeit, außer ein Rezept zählt etwas anderes, wie ein
              Blech oder eine Springform. Das lässt sich später in den Einstellungen ändern.
            </p>
            <FamilySizeField size={household.defaultServings} />
          </section>
        )}
        <TargetsFields targets={household.targets} />

        {/* A household that opens the app for the first time also says when it shops. */}
        {first && (
          <section className="mt-8" aria-labelledby="einkaufstage">
            <h2 id="einkaufstage" className="text-xl font-bold tracking-tight">
              Einkaufstage
            </h2>
            <p className="mt-1 mb-3 text-muted">
              Wann kauft ihr wo ein? Jeder Einkauf bekommt seinen eigenen Zettel. Das lässt sich
              später in den Einstellungen ändern.
            </p>
            <input type="hidden" name="mit-einkaufstagen" value="1" />
            <ShoppingDaysFields days={household.shoppingDays} />
          </section>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <SubmitButton className="btn btn-primary">Speichern</SubmitButton>
          {first && (
            <button formAction={keepTargets} className="btn">
              So lassen
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
