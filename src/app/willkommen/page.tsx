import type { Metadata } from "next";
import { FamilySizeField } from "@/components/family-size-field";
import { LogoMark } from "@/components/logo";
import { ShopLogo } from "@/components/shop-logo";
import { DrugstoreDayField, ShoppingDaysFields } from "@/components/shopping-days-fields";
import { TargetsFields } from "@/components/targets-fields";
import { familyName, firstName } from "@/domain/family";
import { namesText } from "@/domain/shopping-list/supermarkets";
import { requireHousehold } from "@/server/auth";
import { loadSupermarkets } from "@/server/catalog";
import { loadMembers } from "@/server/family";
import { createSessionClient } from "@/server/supabase/server";
import { finishWelcome } from "../(app)/woche/actions";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Willkommen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The first page after joining a household by invitation, and the first visit of a member
 * on any other device: a greeting, and what the household has set for every week, to keep
 * as it is or to change. Then the app comes in.
 */
export default async function WelcomePage(props: PageProps<"/willkommen">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [members, supermarkets] = await Promise.all([
    loadMembers(db, household),
    loadSupermarkets(db),
  ]);
  const self = members.find((member) => member.isSelf);
  const admin = members.find((member) => member.role === "admin");
  const setBy = admin?.isSelf ? null : firstName(admin?.name);
  const family = familyName(household.name);
  const error = one(params.fehler);

  return (
    <main className="mx-auto max-w-xl px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <WelcomeForm
        key={error ?? ""}
        action={finishWelcome}
        intro={
          <>
            <LogoMark className="h-11 w-11" />
            <p className="eyebrow mt-6">
              {family ? `Willkommen bei den ${family}` : `Willkommen bei ${household.name}`}
            </p>
            <h1 className="greeting mt-1">
              Hallo
              {firstName(self?.name) && (
                <>
                  {" "}
                  <span className="text-accent">{firstName(self?.name)}</span>
                </>
              )}
              !
            </h1>
            <p className="mt-3 text-lg leading-snug">
              {setBy
                ? `Diese Einstellungen hat ${setBy} festgelegt. Möchtest du etwas ändern?`
                : "Diese Einstellungen gelten für euren Haushalt. Möchtest du etwas ändern?"}
            </p>
            <p className="mt-1 text-muted">
              Sie gelten für alle in der Familie. Später findest du sie unter dem Buchstaben oben
              rechts.
            </p>

            {error === "1" && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
              >
                Das passt nicht zusammen: „mindestens“ darf nicht größer sein als „höchstens“.
              </p>
            )}
            {error === "tage" && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
              >
                Es braucht mindestens einen Einkaufstag im Supermarkt.
              </p>
            )}
          </>
        }
      >
        <section className="mt-8" aria-labelledby="personen">
          <h2 id="personen" className="text-xl font-bold tracking-tight">
            Für wie viele wird gekocht?
          </h2>
          <p className="mt-1 mb-3 text-muted">So viele Portionen plant jede Mahlzeit.</p>
          <FamilySizeField size={household.defaultServings} />
        </section>

        <section className="mt-8" aria-labelledby="ziele">
          <h2 id="ziele" className="text-xl font-bold tracking-tight">
            Ziele der Woche
          </h2>
          <p className="mt-1 mb-3 text-muted">
            Wie oft es in einer Woche was geben soll. Die Vorschläge richten sich danach.
          </p>
          <TargetsFields targets={household.targets} />
        </section>

        <section className="mt-8" aria-labelledby="einkaufstage">
          <h2 id="einkaufstage" className="text-xl font-bold tracking-tight">
            Einkaufstage
          </h2>
          <p className="mt-1 mb-3 text-muted">Jeder Einkauf bekommt seinen eigenen Zettel.</p>
          <div className="card p-4">
            <ShoppingDaysFields days={household.shoppingDays} />
            <div className="mt-3">
              <DrugstoreDayField days={household.shoppingDays} />
            </div>
            {supermarkets.length > 0 && (
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <span className="flex -space-x-2">
                  {supermarkets.slice(0, 3).map((shop) => (
                    <ShopLogo key={shop.id} shop={shop} size={36} />
                  ))}
                </span>
                <p className="text-sm">
                  Supermarkt:{" "}
                  <span className="font-semibold">
                    {namesText(supermarkets.map((shop) => shop.name))}
                  </span>
                </p>
              </div>
            )}
          </div>
        </section>
      </WelcomeForm>
    </main>
  );
}
