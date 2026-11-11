-- Every page was slow. Each policy called private.is_household_member(household_id) once per
-- row scanned: a security definer function Postgres cannot inline, and wrapping it as
-- (select private.is_household_member(household_id)) does not help, because it takes a column
-- and stays a per-row subplan. Measured on the hosted database on 11 November 2026 as a
-- signed-in member: the last page of recipe_ingredient (15,982 rows scanned) took 249 ms, and
-- 247 ms wrapped; with the member's household ids looked up once per query
-- (household_id = any (array(select ...)), an InitPlan) it took 11 ms. The library pages
-- read tens of thousands of rows per render.
--
-- So the policies now compare the column with the ids of the member's households, looked up
-- once per query: (select ...) is a scalar subquery, which runs once (an InitPlan). The cast
-- is needed: without it, any ((select ...)) reads as "any row of this subquery" and compares
-- a uuid with a uuid[]. is_household_member stays for the functions that ask about one
-- household.

-- Security definer for the same reason as is_household_member: it reads household_member
-- without running into that table's own policy. Never null: no household, no ids.
create function private.my_household_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.household_id), '{}')
  from public.household_member m
  where m.user_id = (select auth.uid());
$$;

revoke all on function private.my_household_ids() from public, anon;
grant execute on function private.my_household_ids() to authenticated;

-- Households and membership
alter policy household_select on public.household
  using (id = any ((select private.my_household_ids())::uuid[]));
alter policy household_update on public.household
  using (id = any ((select private.my_household_ids())::uuid[]))
  with check (id = any ((select private.my_household_ids())::uuid[]));
alter policy household_member_select on public.household_member
  using (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy household_invite_select on public.household_invite
  using (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy household_invite_insert on public.household_invite
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy household_invite_delete on public.household_invite
  using (household_id = any ((select private.my_household_ids())::uuid[]));

-- Catalog
alter policy shop_all on public.shop
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy aisle_group_all on public.aisle_group
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy shop_aisle_order_all on public.shop_aisle_order
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy ingredient_all on public.ingredient
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));

-- Recipes
alter policy recipe_all on public.recipe
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy recipe_photo_all on public.recipe_photo
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy tag_all on public.tag
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy recipe_tag_all on public.recipe_tag
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy recipe_ingredient_all on public.recipe_ingredient
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy recipe_pair_kept_all on public.recipe_pair_kept
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));

-- Planning
alter policy week_plan_all on public.week_plan
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy plan_slot_all on public.plan_slot
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy plan_slot_item_all on public.plan_slot_item
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy plan_slot_food_all on public.plan_slot_food
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy plan_extra_all on public.plan_extra
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy recurring_item_all on public.recurring_item
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy week_recurring_item_all on public.week_recurring_item
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));

-- Shopping
alter policy shopping_list_all on public.shopping_list
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy shopping_manual_entry_all on public.shopping_manual_entry
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy shopping_line_all on public.shopping_line
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy shopping_line_state_all on public.shopping_line_state
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy restock_item_all on public.restock_item
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy shop_item_history_all on public.shop_item_history
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));

-- Import
alter policy import_batch_all on public.import_batch
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy import_job_all on public.import_job
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy import_page_all on public.import_page
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy ingredient_proposal_all on public.ingredient_proposal
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));

-- Receipts
alter policy receipt_all on public.receipt
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy receipt_line_all on public.receipt_line
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy receipt_match_all on public.receipt_match
  using (household_id = any ((select private.my_household_ids())::uuid[]))
  with check (household_id = any ((select private.my_household_ids())::uuid[]));
alter policy model_usage_read on public.model_usage
  using (household_id = any ((select private.my_household_ids())::uuid[]));
