import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink } from "@/components/copy-link";
import { FamilySizeField } from "@/components/family-size-field";
import { ArrowIcon } from "@/components/icons";
import { DrugstoreDayField, ShoppingDaysFields } from "@/components/shopping-days-fields";
import { SubmitButton } from "@/components/submit-button";
import { canLeave, canRemove, INVITE_DAYS } from "@/domain/family";
import { BALANCE_GROUPS } from "@/domain/recommend/balance";
import { favouriteSupermarkets } from "@/domain/shopping-list/supermarkets";
import { PLACE_NAME } from "@/lib/list-text";
import { GROUP_NAME, targetText } from "@/lib/plan-text";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { loadInvites, loadMembers } from "@/server/family";
import { requestOrigin } from "@/server/request-origin";
import { createSessionClient } from "@/server/supabase/server";
import { signOut } from "../../login/actions";
import {
  inviteMember,
  leaveFamily,
  removeFamilyMember,
  saveFamilySize,
  saveFreshPlaces,
  saveHouseholdName,
  saveName,
  saveShoppingDays,
  withdrawInvitation,
} from "./actions";
import { PasswordForm } from "./password-form";
import { PantryTile, SupermarketsCard } from "./shop-settings";

export const metadata: Metadata = { title: "Einstellungen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const until = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });

/**
 * The three parts of the page, what is changed most first, to jump to on a phone, where the
 * page is long.
 */
const PARTS = [
  { id: "einkaufen", name: "Einkaufen" },
  { id: "wochenplan", name: "Wochenplan" },
  { id: "haushalt", name: "Familie & Konto" },
] as const;

function Saved({ when }: { when: boolean }) {
  return when ? (
    <span role="status" className="text-sm text-accent">
      Gespeichert
    </span>
  ) : null;
}

/**
 * What a household sets once and that then holds for every week, in three parts, what is
 * changed most first: when it shops, what is usually at home, what comes from where, and its
 * supermarkets; what a week should contain and for how many; who belongs to it and the
 * signed-in member's own account.
 */
export default async function SettingsPage(props: PageProps<"/einstellungen">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [members, invites, origin, index] = await Promise.all([
    loadMembers(db, household),
    loadInvites(db),
    requestOrigin(),
    loadCatalogIndex(db),
  ]);
  const supermarkets = favouriteSupermarkets(index.catalog.shops);
  const { ingredients, aisleGroups } = index.catalog;
  const aisles = [...aisleGroups].sort((a, b) => a.sortOrder - b.sortOrder);
  const said = one(params.ok);
  const token = one(params.einladung);
  const self = members.find((member) => member.isSelf);
  const role = self?.role ?? "member";
  // Asked before it is done: whom to remove, or whether to leave.
  const removing = members.find(
    (member) => member.userId === one(params.entfernen) && canRemove(role, member),
  );
  const leaving = one(params.verlassen) === "1" && canLeave(role);
  const fresh = (place: "market" | "butcher" | "bakery") =>
    aisles
      .filter((group) => group.freshPlace === place)
      .map((group) => group.name)
      .join(", ") || "nichts";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="title">Einstellungen</h1>
      <p className="mt-1 text-muted">Haushalt „{household.name}“</p>
      <nav aria-label="Teile der Einstellungen" className="mt-4 flex flex-wrap gap-2 lg:hidden">
        {PARTS.map((part) => (
          <a key={part.id} href={`#${part.id}`} className="chip">
            {part.name}
          </a>
        ))}
      </nav>

      {/* Einkaufen, what the household changes most: when it shops, what is at home and what
          comes from where on the left, the supermarkets and their map on the right. */}
      <section aria-labelledby="einkaufen" className="mt-8 scroll-mt-4">
        <h2 id="einkaufen" className="eyebrow">
          Einkaufen
        </h2>
        <div className="mt-2 grid items-start gap-4 lg:grid-cols-2">
          <div className="grid gap-4">
            <section className="card scroll-mt-4 p-4" aria-labelledby="einkaufstage">
              <h3 id="einkaufstage" className="text-lg font-bold tracking-tight">
                Einkaufstage
              </h3>
              <p className="mt-1 mb-3 text-sm text-muted">
                Jeder Einkauf bekommt seinen eigenen Zettel. Zum Metzger geht es an seinen Tagen,
                und nur wenn ein Essen Fleisch braucht. Der Bäcker hat keinen festen Tag: was eine
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
                  <Saved when={said === "tage"} />
                </div>
              </form>
            </section>

            <PantryTile
              staples={ingredients
                .filter((ingredient) => ingredient.isPantryStaple)
                .sort((a, b) => a.name.localeCompare(b.name, "de"))}
            />

            <section className="card scroll-mt-4 p-4" aria-labelledby="frisch">
              <h3 id="frisch" className="text-lg font-bold tracking-tight">
                Frisch vom Markt, vom Metzger und vom Bäcker
              </h3>
              <p className="mt-1 text-muted">
                Markt: {fresh("market")}
                <br />
                Metzger: {fresh("butcher")}
                <br />
                Bäcker: {fresh("bakery")}
              </p>
              <Saved when={said === "frisch"} />
              <details className="mt-2" open={said === "frisch"}>
                <summary className="link inline-flex min-h-11 items-center">Ändern</summary>
                <p className="text-sm text-muted">
                  Was hier dem Markt gehört, kommt auf seinen Zettel, wenn der Markttag höchstens
                  drei Tage vor der Mahlzeit liegt und es sich so lange hält. Was dem Metzger
                  gehört, kommt auf seinen Zettel am Metzgertag vor der Mahlzeit. Was dem Bäcker
                  gehört, bekommt einen Zettel für den Tag der Mahlzeit, für den Sonntag am Samstag;
                  was sich länger als fünf Tage hält, wie Toast oder Knäckebrot, bleibt im
                  Supermarkt. Alles andere kommt aus dem Supermarkt.
                </p>
                <form action={saveFreshPlaces} className="mt-3">
                  <ul className="divide-y divide-line">
                    {aisles.map((group) => (
                      <li key={group.id} className="flex items-center justify-between gap-3 py-1.5">
                        <label htmlFor={`frisch-${group.id}`}>{group.name}</label>
                        <select
                          id={`frisch-${group.id}`}
                          name={`frisch-${group.id}`}
                          defaultValue={group.freshPlace ?? ""}
                          className="field w-40"
                        >
                          <option value="">{PLACE_NAME.supermarket}</option>
                          <option value="market">{PLACE_NAME.market}</option>
                          <option value="butcher">{PLACE_NAME.butcher}</option>
                          <option value="bakery">{PLACE_NAME.bakery}</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                  <SubmitButton className="btn btn-primary mt-3">Speichern</SubmitButton>
                </form>
              </details>
            </section>
          </div>

          <SupermarketsCard
            postalCode={household.postalCode}
            placeName={household.placeName}
            found={index.catalog.shops.filter(
              (shop) => household.postalCode !== null && shop.foundNear === household.postalCode,
            )}
            chosen={supermarkets}
            problem={one(params.fehler) ?? null}
            reason={one(params.grund)?.slice(0, 300) ?? null}
            aisleGroups={aisles}
            saved={said?.startsWith("markt-") ? said.slice("markt-".length) : null}
          />
        </div>
      </section>

      {/* Wochenplan: what a week should contain, and for how many it is cooked. */}
      <section aria-labelledby="wochenplan" className="mt-10 scroll-mt-4">
        <h2 id="wochenplan" className="eyebrow">
          Wochenplan
        </h2>
        <div className="mt-2 grid items-start gap-4 sm:grid-cols-2">
          <Link
            id="ziele"
            href="/woche/ziele"
            className="card lift flex scroll-mt-4 items-center justify-between gap-4 p-4"
            aria-label="Ziele der Woche ansehen und ändern"
          >
            <span className="min-w-0">
              <span className="block text-lg font-bold tracking-tight">Ziele der Woche</span>
              <span className="mt-1 block text-sm text-muted">
                {BALANCE_GROUPS.map((group) => {
                  const aim = targetText({ group, count: 0, ...household.targets[group] });
                  return `${GROUP_NAME[group]}: ${aim === "" ? "egal" : aim}`;
                }).join(" · ")}
              </span>
            </span>
            <span className="text-accent">
              <ArrowIcon />
            </span>
          </Link>
          <section className="card scroll-mt-4 p-4" aria-labelledby="personen">
            <h3 id="personen" className="text-lg font-bold tracking-tight">
              Personen
            </h3>
            <form action={saveFamilySize} className="mt-3 flex items-end gap-2">
              <FamilySizeField size={household.defaultServings} />
              <SubmitButton>Speichern</SubmitButton>
            </form>
            <p className="mt-1 text-sm text-muted">
              Jede Mahlzeit wird für {household.defaultServings}{" "}
              {household.defaultServings === 1 ? "Person" : "Personen"} geplant, außer ein Rezept
              zählt etwas anderes. <Saved when={said === "personen"} />
            </p>
          </section>
        </div>
      </section>

      {/* Familie & Konto, set once and seldom changed: the household on the left, the
          member's own account on the right. */}
      <section aria-labelledby="haushalt" className="mt-10 scroll-mt-4">
        <h2 id="haushalt" className="eyebrow">
          Familie & Konto
        </h2>
        <div className="mt-2 grid items-start gap-4 lg:grid-cols-2">
          <section className="card scroll-mt-4 p-4" aria-labelledby="familie">
            <h3 id="familie" className="text-lg font-bold tracking-tight">
              Familie
            </h3>
            <div className="mt-3">
              <form action={saveHouseholdName}>
                <label htmlFor="haushalt-name" className="label">
                  Name des Haushalts
                </label>
                <div className="flex gap-2">
                  <input
                    id="haushalt-name"
                    name="household"
                    defaultValue={household.name}
                    maxLength={40}
                    required
                    className="field min-w-0 flex-1"
                    placeholder="z. B. Stührmann"
                  />
                  <SubmitButton>Speichern</SubmitButton>
                </div>
              </form>
            </div>

            <h4 className="mt-5 font-semibold">Wer dazugehört</h4>
            <p className="text-sm text-muted">
              Alle sehen denselben Plan, dieselben Zettel und Favoriten, jeder mit eigenem Konto.
            </p>
            <ul className="mt-2 divide-y divide-line">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">{member.name ?? "Ohne Namen"}</span>
                    <span className="block text-sm text-muted">
                      {[
                        member.isSelf ? "das bist du" : null,
                        member.role === "admin" ? "verwaltet den Haushalt" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {canRemove(role, member) && (
                    <Link
                      href={`/einstellungen?entfernen=${member.userId}#familie`}
                      className="link inline-flex min-h-11 items-center text-sm"
                    >
                      Entfernen
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {removing && (
              <div role="alertdialog" className="mt-2 rounded-lg bg-warn-soft p-3">
                <p className="font-semibold text-warn">
                  {removing.name ?? "Dieses Mitglied"} aus dem Haushalt entfernen?
                </p>
                <p className="mt-1 text-sm">
                  Das Konto bleibt bestehen, sieht aber nichts mehr von Plan, Zetteln und Rezepten.
                  Mit einer neuen Einladung kommt es wieder dazu.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <form action={removeFamilyMember}>
                    <input type="hidden" name="id" value={removing.userId} />
                    <SubmitButton className="btn btn-danger">Entfernen</SubmitButton>
                  </form>
                  <Link href="/einstellungen#familie" className="link">
                    Abbrechen
                  </Link>
                </div>
              </div>
            )}

            <h4 className="mt-5 font-semibold">Jemanden einladen</h4>
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
                      <SubmitButton className="link min-h-11">Zurückziehen</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card scroll-mt-4 p-4" aria-labelledby="konto">
            <h3 id="konto" className="text-lg font-bold tracking-tight">
              Dein Konto
            </h3>
            <form action={saveName} className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="label">Dein Name</span>
                <input
                  name="name"
                  defaultValue={self?.name ?? ""}
                  maxLength={40}
                  className="field"
                  placeholder="Dein Name"
                />
              </label>
              <SubmitButton>Speichern</SubmitButton>
            </form>

            <h4 className="mt-5 font-semibold">Passwort ändern</h4>
            <PasswordForm />

            <form action={signOut} data-sign-out className="mt-5">
              <button className="btn min-h-11">Abmelden</button>
            </form>

            {canLeave(role) && !leaving && (
              <Link href="/einstellungen?verlassen=1#konto" className="link mt-5 inline-block">
                Haushalt verlassen
              </Link>
            )}
            {leaving && (
              <div role="alertdialog" className="mt-5 rounded-lg bg-warn-soft p-3">
                <p className="font-semibold text-warn">Den Haushalt verlassen?</p>
                <p className="mt-1 text-sm">
                  Du siehst danach nichts mehr von Plan, Zetteln und Rezepten und wirst abgemeldet.
                  Mit einer neuen Einladung kommst du wieder dazu.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <form action={leaveFamily} data-sign-out>
                    <SubmitButton className="btn btn-danger">Verlassen</SubmitButton>
                  </form>
                  <Link href="/einstellungen#konto" className="link">
                    Abbrechen
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
