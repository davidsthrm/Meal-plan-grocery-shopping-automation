import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { dayAndMonth, isIsoDate, mondayOf, weekdayLong } from "@/domain/dates";
import { VESPER_FOODS } from "@/domain/vesper";
import { MEAL_NAME } from "@/lib/plan-text";
import { loadIngredientNames, must } from "@/server/catalog";
import { loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { addSlotFood, removeSlotFood } from "../actions";

export const metadata: Metadata = { title: "Lebensmittel" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** What to buy for a meal without a recipe: bread, cold cuts and a cucumber for a "Vesper". */
export default async function FoodsPage(props: PageProps<"/woche/lebensmittel">) {
  const params = await props.searchParams;
  const week = one(params.w) ?? "";
  const date = one(params.d) ?? "";
  const meal = one(params.m);
  if (!isIsoDate(week) || !isIsoDate(date) || mondayOf(date) !== week) notFound();
  if (meal !== "lunch" && meal !== "dinner" && meal !== "coffee") notFound();

  const db = await createSessionClient();
  const [slots, shopRows, ingredientRows] = await Promise.all([
    loadWeek(db, week),
    db.from("shop").select("id, name").order("sort_order"),
    loadIngredientNames(db),
  ]);
  const slot = slots.find((entry) => entry.date === date && entry.meal === meal);
  if (slot?.kind !== "free_text") notFound();
  const shops = must(shopRows, "load shops");
  const shopName = new Map(shops.map((shop) => [shop.id, shop.name]));
  const foods = slot.foods ?? [];
  const chosen = new Set(foods.map((food) => food.label.toLowerCase()));

  const where = (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
    </>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/woche?w=${week}#tag-${date}`} className="link text-sm">
        ← Wochenplan
      </Link>
      <p className="eyebrow mt-3">
        {weekdayLong(date)}, {dayAndMonth(date)} · {MEAL_NAME[meal]}
      </p>
      <h1 className="title mt-1">Lebensmittel für {slot.label}</h1>

      <section className="mt-5" aria-label="Ausgewählt">
        {foods.length === 0 ? (
          <p className="text-muted">Noch nichts ausgewählt.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {foods.map((food) => (
              <li key={food.label} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-semibold">{food.label}</span>
                  {food.shopId && (
                    <span className="text-muted"> · {shopName.get(food.shopId)}</span>
                  )}
                </span>
                <form action={removeSlotFood}>
                  {where}
                  <input type="hidden" name="label" value={food.label} />
                  <SubmitButton
                    className="min-h-10 text-sm font-semibold text-muted hover:text-danger"
                    label={`${food.label} entfernen`}
                  >
                    Entfernen
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-label="Lebensmittel hinzufügen">
        <h2 className="eyebrow">Lebensmittel hinzufügen</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {VESPER_FOODS.filter((option) => !chosen.has(option.label.toLowerCase())).map(
            (option) => (
              <form key={option.label} action={addSlotFood}>
                {where}
                <input type="hidden" name="label" value={option.label} />
                {option.shop && <input type="hidden" name="shop" value={option.shop} />}
                <SubmitButton className="chip" label={`${option.label} hinzufügen`}>
                  {option.label}
                  {option.shop && <span className="font-normal text-muted">{option.shop}</span>}
                </SubmitButton>
              </form>
            ),
          )}
        </div>

        <form action={addSlotFood} className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
          {where}
          <label>
            <span className="sr-only">Anderes Lebensmittel</span>
            <input
              name="label"
              maxLength={60}
              list="lebensmittel"
              autoComplete="off"
              className="field"
              placeholder="Etwas anderes, z. B. Obatzter"
            />
          </label>
          <datalist id="lebensmittel">
            {ingredientRows.map((ingredient) => (
              <option key={ingredient.name} value={ingredient.name} />
            ))}
          </datalist>
          <label>
            <span className="sr-only">Wo wird es gekauft?</span>
            <select name="shop" className="field" defaultValue="">
              <option value="">Wo üblich</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.name}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>Hinzufügen</SubmitButton>
        </form>
      </section>

      <Link href={`/woche?w=${week}#tag-${date}`} className="btn btn-primary mt-6">
        Fertig
      </Link>
    </div>
  );
}
