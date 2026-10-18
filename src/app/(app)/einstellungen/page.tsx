import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CopyLink } from "@/components/copy-link";
import { DrugstoreDayField, ShoppingDaysFields } from "@/components/shopping-days-fields";
import { SubmitButton } from "@/components/submit-button";
import { INVITE_DAYS } from "@/domain/family";
import { BALANCE_GROUPS } from "@/domain/recommend/balance";
import { PLACE_NAME } from "@/lib/list-text";
import { GROUP_NAME, targetText } from "@/lib/plan-text";
import { favouriteSupermarkets } from "@/domain/shopping-list/supermarkets";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex, must } from "@/server/catalog";
import { loadInvites, loadMembers } from "@/server/family";
import { createSessionClient } from "@/server/supabase/server";
import {
  inviteMember,
  saveFreshPlaces,
  saveHouseholdName,
  saveName,
  saveShoppingDays,
  withdrawInvitation,
} from "./actions";
import { PantryTile, SupermarketsCard } from "./shop-settings";

export const metadata: Metadata = { title: "Einstellungen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const until = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });

/**
 * What a household sets once and that then holds for every week: what a week should
 * contain, when it shops and where, what is usually at home, and who belongs to it.
 */
export default async function SettingsPage(props: PageProps<"/einstellungen">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [groups, members, invites, address, index] = await Promise.all([
    db.from("aisle_group").select("id, name, fresh_place").order("sort_order"),
    loadMembers(db, household),
    loadInvites(db),
    headers(),
    loadCatalogIndex(db),
  ]);
  const supermarkets = favouriteSupermarkets(index.catalog.shops);
  const { ingredients } = index.catalog;
  const aisles = must(groups, "load aisle groups");
  const said = one(params.ok);
  const token = one(params.einladung);
  const host = address.get("x-forwarded-host") ?? address.get("host");
  const origin = `${address.get("x-forwarded-proto") ?? "http"}://${host}`;
  const self = members.find((member) => member.isSelf);
  const fresh = (place: "market" | "butcher") =>
    aisles
      .filter((group) => group.fresh_place === place)
      .map((group) => group.name)
      .join(", ") || "nichts";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="title">Einstellungen</h1>
      <p className="mt-1 text-muted">Haushalt „{household.name}“</p>

      {/* One column on a phone; on a large screen the week and the shops on the left, the
          family on the right. */}
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <section className="card p-4" aria-labelledby="ziele">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="ziele" className="text-lg font-bold tracking-tight">
                Ziele der Woche
              </h2>
              <Link href="/woche/ziele" className="link">
                Ändern
              </Link>
            </div>
            <ul className="mt-1 text-muted">
              {BALANCE_GROUPS.map((group) => {
                const aim = targetText({ group, count: 0, ...household.targets[group] });
                return (
                  <li key={group}>
                    {GROUP_NAME[group]}: {aim === "" ? "egal" : aim}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card scroll-mt-4 p-4" aria-labelledby="einkaufstage">
            <h2 id="einkaufstage" className="text-lg font-bold tracking-tight">
              Einkaufstage
            </h2>
            <p className="mt-1 mb-3 text-sm text-muted">
              Jeder Einkauf bekommt seinen eigenen Zettel. Zum Metzger geht es an seinen Tagen, und
              nur wenn ein Essen Fleisch braucht. Der Bäcker hat keinen festen Tag: was eine
              Mahlzeit von dort braucht, steht auf einem Zettel für den Tag dieser Mahlzeit, für
              einen Sonntag auf dem vom Samstag. Der Zettel für dm liegt jede Woche an seinem Tag
              bereit und wird von Hand geschrieben.
            </p>
            {one(params.fehler) === "tage" && (
              <p role="alert" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-warn">
                Es braucht mindestens einen Tag im Supermarkt: dort gibt es alles, was Markt und
                Metzger nicht haben.
              </p>
            )}
            <form action={saveShoppingDays}>
              <ShoppingDaysFields days={household.shoppingDays} />
              <div className="mt-3">
                <DrugstoreDayField days={household.shoppingDays} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <SubmitButton className="btn btn-primary">Speichern</SubmitButton>
                {said === "tage" && (
                  <span role="status" className="text-sm text-accent">
                    Gespeichert
                  </span>
                )}
              </div>
            </form>
          </section>

          <SupermarketsCard
            postalCode={household.postalCode}
            placeName={household.placeName}
            found={index.catalog.shops.filter(
              (shop) => household.postalCode !== null && shop.foundNear === household.postalCode,
            )}
            chosen={supermarkets}
            problem={one(params.fehler) ?? null}
            reason={one(params.grund)?.slice(0, 300) ?? null}
          />
        </div>

        <div className="grid gap-4">
          <section className="card scroll-mt-4 p-4" aria-labelledby="familie">
            <h2 id="familie" className="text-lg font-bold tracking-tight">
              Familie
            </h2>
            <form action={saveHouseholdName} className="mt-3">
              <label htmlFor="haushalt" className="label">
                Name des Haushalts
              </label>
              <div className="flex gap-2">
                <input
                  id="haushalt"
                  name="household"
                  defaultValue={household.name}
                  maxLength={40}
                  required
                  className="field flex-1"
                  placeholder="z. B. Stührmann"
                />
                <SubmitButton>Speichern</SubmitButton>
              </div>
            </form>
            <p className="mt-1 text-sm text-muted">
              Alle sehen denselben Plan, dieselben Zettel und Favoriten, jeder mit eigenem Konto.
            </p>
            <ul className="mt-3 divide-y divide-line">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-semibold">{member.name ?? "Ohne Namen"}</span>
                  {member.isSelf && <span className="text-sm text-muted">das bist du</span>}
                </li>
              ))}
            </ul>
            <form action={saveName} className="mt-2 flex items-end gap-2">
              <label className="flex-1">
                <span className="label">Dein Name</span>
                <input
                  name="name"
                  defaultValue={self?.name ?? ""}
                  maxLength={40}
                  className="field"
                  placeholder="Dein Name"
                />
              </label>
              <SubmitButton>Name speichern</SubmitButton>
            </form>

            <h3 className="mt-5 font-semibold">Jemanden einladen</h3>
            <p className="text-sm text-muted">
              Ein Link, der einmal gilt und {INVITE_DAYS} Tage lang. Wer ihn öffnet, legt sich ein
              Konto an und gehört dazu.
            </p>
            {token && (
              <div role="status" className="mt-3 rounded-lg bg-accent-soft p-3">
                <p className="mb-2 text-sm font-semibold">
                  Der Link wird nur jetzt gezeigt. Schick ihn der Person, die du einlädst.
                </p>
                <CopyLink link={`${origin}/einladung/${token}`} what="Einladung zu Essensplan" />
              </div>
            )}
            <form action={inviteMember} className="mt-3">
              <SubmitButton>Einladung erstellen</SubmitButton>
            </form>
            {invites.length > 0 && (
              <ul className="mt-3 divide-y divide-line text-sm">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3 py-1">
                    <span className="text-muted">
                      Offene Einladung, gilt bis {until.format(new Date(invite.expiresAt))}
                    </span>
                    <form action={withdrawInvitation}>
                      <input type="hidden" name="id" value={invite.id} />
                      <SubmitButton className="link min-h-10">Zurückziehen</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card scroll-mt-4 p-4" aria-labelledby="frisch">
            <h2 id="frisch" className="text-lg font-bold tracking-tight">
              Frisch vom Markt und vom Metzger
            </h2>
            <p className="mt-1 text-muted">
              Markt: {fresh("market")}
              <br />
              Metzger: {fresh("butcher")}
            </p>
            {said === "frisch" && (
              <p role="status" className="mt-1 text-sm text-accent">
                Gespeichert
              </p>
            )}
            <details className="mt-2" open={said === "frisch"}>
              <summary className="link inline-flex min-h-10 items-center">Ändern</summary>
              <p className="text-sm text-muted">
                Was hier dem Markt gehört, kommt auf seinen Zettel, wenn der Markttag höchstens drei
                Tage vor der Mahlzeit liegt und es sich so lange hält. Was dem Metzger gehört,
                bekommt einen Zettel für den Tag der Mahlzeit. Alles andere kommt aus dem
                Supermarkt.
              </p>
              <form action={saveFreshPlaces} className="mt-3">
                <ul className="divide-y divide-line">
                  {aisles.map((group) => (
                    <li key={group.id} className="flex items-center justify-between gap-3 py-1.5">
                      <label htmlFor={`frisch-${group.id}`}>{group.name}</label>
                      <select
                        id={`frisch-${group.id}`}
                        name={`frisch-${group.id}`}
                        defaultValue={group.fresh_place ?? ""}
                        className="field w-40"
                      >
                        <option value="">{PLACE_NAME.supermarket}</option>
                        <option value="market">{PLACE_NAME.market}</option>
                        <option value="butcher">{PLACE_NAME.butcher}</option>
                      </select>
                    </li>
                  ))}
                </ul>
                <SubmitButton className="btn btn-primary mt-3">Speichern</SubmitButton>
              </form>
            </details>
          </section>

          <PantryTile
            staples={ingredients
              .filter((ingredient) => ingredient.isPantryStaple)
              .sort((a, b) => a.name.localeCompare(b.name, "de"))}
          />
        </div>
      </div>
    </div>
  );
}
