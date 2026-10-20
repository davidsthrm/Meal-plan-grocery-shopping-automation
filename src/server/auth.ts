import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isIsoDate, type IsoDate } from "@/domain/dates";
import { DEFAULT_TARGETS, readTargets, type BalanceTargets } from "@/domain/recommend/balance";
import {
  DEFAULT_DRUGSTORE_WEEKDAY,
  DEFAULT_SHOPPING_DAYS,
  readShoppingDays,
  readWeekday,
  withDrugstore,
  type ShoppingDay,
} from "@/domain/shopping-list/trips";
import { createSessionClient } from "./supabase/server";

export interface Household {
  id: string;
  name: string;
  defaultServings: number;
  /**
   * The weekdays the household shops on, and where, the drugstore's day among them. The
   * app's own until it has chosen.
   */
  shoppingDays: readonly ShoppingDay[];
  /** What a week should contain. The app's own defaults until the household has chosen. */
  targets: BalanceTargets;
  /**
   * Where the household lives, for finding its supermarkets: "88471", "Laupheim". Null
   * until a member enters it.
   */
  postalCode: string | null;
  placeName: string | null;
  /**
   * The week the household started with the app (a Monday): the plan, the shopping notes and
   * the list of all weeks go back no further. Null for no limit.
   */
  firstWeek: IsoDate | null;
  userId: string;
}

/**
 * The household of the signed-in user, for pages and actions that need one. Redirects to the
 * login page without a session. A signed-in user without a household sees nothing, by design:
 * accounts are created by invite and added to the household by hand.
 *
 * Read once per request: the layout and the page both ask, and each asking cost a check of
 * the session and a request.
 */
export const requireHousehold = cache(async function requireHousehold(): Promise<Household> {
  const supabase = await createSessionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase
    .from("household")
    .select(
      "id, name, default_servings, balance_targets, shopping_days, drugstore_weekday, postal_code, place_name, first_week",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`could not load the household: ${error.message}`);
  if (!data) redirect("/kein-haushalt");
  return {
    id: data.id,
    name: data.name,
    defaultServings: data.default_servings,
    shoppingDays: withDrugstore(
      readShoppingDays(data.shopping_days) ?? DEFAULT_SHOPPING_DAYS,
      readWeekday(data.drugstore_weekday) ?? DEFAULT_DRUGSTORE_WEEKDAY,
    ),
    targets: readTargets(data.balance_targets) ?? DEFAULT_TARGETS,
    postalCode: data.postal_code,
    placeName: data.place_name,
    firstWeek: data.first_week && isIsoDate(data.first_week) ? data.first_week : null,
    userId,
  };
});

/**
 * The signed-in member: the name they gave themselves and whether they made the household.
 * Read once per request: the header and the week plan both show the name.
 */
export const loadSelf = cache(async function loadSelf(): Promise<{
  name: string | null;
  role: string | null;
}> {
  const household = await requireHousehold();
  const db = await createSessionClient();
  const { data } = await db
    .from("household_member")
    .select("display_name, role")
    .eq("user_id", household.userId)
    .maybeSingle();
  return { name: data?.display_name ?? null, role: data?.role ?? null };
});
