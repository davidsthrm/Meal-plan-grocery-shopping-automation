-- What became of a line in the shop, beside what the plan asked for. A line is bought, bought
-- in part, removed ("nicht kaufen"), or moved to another day or shop. Nothing is deleted:
-- a removed line keeps its row, and what was planned is kept next to what was bought, so
-- that a substitute or a smaller amount stays traceable when the plan changes later.
--
-- Every decision about a line, a tick included, is made at a moment and the one made last
-- wins (`decide_shopping_line`), whichever device sends it first. Additive: the app before
-- this keeps working, and its ticks keep the status in step (`tick_shopping_line` below).

alter table public.shopping_line_state
  -- Null: open, as far as a decision goes. Whether it is ticked is still `checked_at`.
  add column if not exists status text
    check (status in ('bought', 'partially_bought', 'removed', 'moved')),
  -- What was bought where it differs from the plan: another product, another amount.
  add column if not exists bought_name text
    check (bought_name is null or char_length(bought_name) between 1 and 80),
  add column if not exists bought_quantity numeric check (bought_quantity > 0),
  add column if not exists bought_unit text
    check (bought_unit is null or char_length(bought_unit) between 1 and 12),
  add column if not exists substituted boolean not null default false,
  -- What happened to the rest of a line bought in part.
  add column if not exists remainder text check (remainder in ('moved', 'discarded')),
  add column if not exists removed_reason text
    check (removed_reason is null or char_length(removed_reason) between 1 and 80),
  -- The line as the plan had it at the first decision that departed from it: name,
  -- quantity, unit, shop, day and place.
  add column if not exists planned jsonb,
  -- Who made the decision that stands, whatever it was.
  add column if not exists decided_by uuid references auth.users on delete set null,
  -- The shop a line was moved to, where one was chosen.
  add column if not exists moved_shop_id uuid,
  -- The note a move was made on. The rows a move changed name it, so that taking the move
  -- back finds them all, also those of parts that had come to that note from another.
  add column if not exists moved_with uuid;

alter table public.shopping_line_state
  add constraint shopping_line_state_bought_amount
    check ((bought_quantity is null) = (bought_unit is null)),
  add constraint shopping_line_state_partial
    check ((status = 'partially_bought') = (remainder is not null)),
  add constraint shopping_line_state_moved_shop
    foreign key (household_id, moved_shop_id) references public.shop (household_id, id);

-- The rest of a line bought in part, written onto the note it is bought on instead. It names
-- the catalog ingredient and the amount, not only a text, and the line it is the rest of.
alter table public.shopping_manual_entry
  add column if not exists ingredient_id uuid,
  add column if not exists carried_quantity numeric check (carried_quantity > 0),
  add column if not exists carried_unit text
    check (carried_unit is null or char_length(carried_unit) between 1 and 12),
  add column if not exists carried_from_list_id uuid,
  add column if not exists carried_from_key text
    check (carried_from_key is null or char_length(carried_from_key) between 1 and 200);

alter table public.shopping_manual_entry
  add constraint shopping_manual_entry_ingredient
    foreign key (household_id, ingredient_id) references public.ingredient (household_id, id),
  add constraint shopping_manual_entry_carried_from
    foreign key (household_id, carried_from_list_id)
    references public.shopping_list (household_id, id) on delete cascade,
  add constraint shopping_manual_entry_carried_amount
    check ((carried_quantity is null) = (carried_unit is null)),
  add constraint shopping_manual_entry_carried_whole
    check ((carried_from_list_id is null) = (carried_from_key is null));

-- Where the household bought something, or chose to: "Brezeln" at the Metzger once. The
-- shop is offered first for that thing next time. An item is a catalog ingredient's id or
-- a typed text, normalised; a choice is a shop's id or a place without a shop ("market").
create table public.shop_item_history (
  household_id uuid not null references public.household on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 200),
  choice text not null check (char_length(choice) between 1 and 64),
  times integer not null default 1 check (times > 0),
  last_at timestamptz not null default now(),
  primary key (household_id, item_key, choice)
);

alter table public.shop_item_history enable row level security;

create policy shop_item_history_all on public.shop_item_history for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.shop_item_history from anon, authenticated, service_role;
grant select, insert, update, delete on public.shop_item_history to authenticated, service_role;

-- Counts one more purchase or choice of a shop for an item. Runs with the caller's rights.
create or replace function public.remember_shop_choice(
  home uuid,
  item text,
  chosen text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.shop_item_history (household_id, item_key, choice)
  values (home, item, chosen)
  on conflict (household_id, item_key, choice) do update
  set times = public.shop_item_history.times + 1, last_at = now();
$$;

revoke all on function public.remember_shop_choice(uuid, text, text) from public, anon;
grant execute on function public.remember_shop_choice(uuid, text, text) to authenticated, service_role;

-- Decides what became of a line: bought (maybe another product or amount), bought in part
-- with the rest moved or discarded, removed, moved, or open again. The decision made last
-- wins, by the moment it was made; a time in the future counts as now. Runs with the
-- caller's rights. Answers 'applied', 'same' (this very decision is stored already: sent
-- twice) or 'older' (a later one is stored, and this one changes nothing).
create or replace function public.decide_shopping_line(
  list_id uuid,
  decided_key text,
  decision jsonb,
  decided_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner uuid;
  decided timestamptz := least(decided_at, now());
  what text := decision ->> 'kind';
  stored timestamptz;
  bought boolean;
  name text;
begin
  select household_id into owner from public.shopping_list where id = list_id;
  if owner is null then
    raise exception 'shopping list not found';
  end if;
  if what is null or what not in ('bought', 'open', 'removed', 'partial', 'moved') then
    raise exception 'unknown decision %', coalesce(what, 'null');
  end if;
  select checked_changed_at into stored
  from public.shopping_line_state
  where shopping_list_id = list_id and line_key = decided_key
  for update;
  if stored is not null and stored > decided then
    return 'older';
  end if;
  if stored is not null and stored = decided then
    return 'same';
  end if;
  bought := what in ('bought', 'partial');
  name := case when bought then nullif(btrim(decision ->> 'name'), '') end;
  insert into public.shopping_line_state as state (
    household_id, shopping_list_id, line_key, status, checked_at, checked_by,
    checked_changed_at, decided_by, bought_name, bought_quantity, bought_unit, substituted,
    remainder, removed_reason, planned, moved_shop_id, updated_at
  )
  values (
    owner,
    list_id,
    decided_key,
    case what
      when 'bought' then 'bought'
      when 'partial' then 'partially_bought'
      when 'removed' then 'removed'
      when 'moved' then 'moved'
    end,
    case when bought then decided end,
    case when bought then auth.uid() end,
    decided,
    auth.uid(),
    name,
    case when bought then (decision ->> 'quantity')::numeric end,
    case when bought and decision ? 'quantity' then decision ->> 'unit' end,
    name is not null,
    case when what = 'partial' then decision ->> 'remainder' end,
    case when what = 'removed' then nullif(btrim(decision ->> 'reason'), '') end,
    case when what <> 'open' then decision -> 'planned' end,
    case when what = 'moved' then (decision ->> 'shop_id')::uuid end,
    now()
  )
  on conflict (shopping_list_id, line_key) do update
  set
    status = excluded.status,
    checked_at = excluded.checked_at,
    checked_by = excluded.checked_by,
    checked_changed_at = excluded.checked_changed_at,
    decided_by = excluded.decided_by,
    bought_name = excluded.bought_name,
    bought_quantity = excluded.bought_quantity,
    bought_unit = excluded.bought_unit,
    substituted = excluded.substituted,
    remainder = excluded.remainder,
    removed_reason = excluded.removed_reason,
    -- The plan as it stood at the first departure from it stays.
    planned = coalesce(state.planned, excluded.planned),
    moved_shop_id = excluded.moved_shop_id,
    updated_at = excluded.updated_at;
  return 'applied';
end;
$$;

revoke all on function public.decide_shopping_line(uuid, text, jsonb, timestamptz) from public, anon;
grant execute on function public.decide_shopping_line(uuid, text, jsonb, timestamptz) to authenticated, service_role;

-- A tick of the app before this one keeps the status in step: ticked is bought, opened
-- again is open. What else it decided goes, as with any later decision.
create or replace function public.tick_shopping_line(
  list_id uuid,
  tick_key text,
  tick_checked boolean,
  ticked_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner uuid;
  decided timestamptz := least(ticked_at, now());
begin
  select household_id into owner from public.shopping_list where id = list_id;
  if owner is null then
    raise exception 'shopping list not found';
  end if;
  insert into public.shopping_line_state as state (
    household_id, shopping_list_id, line_key, status, checked_at, checked_by,
    checked_changed_at, decided_by, updated_at
  )
  values (
    owner,
    list_id,
    tick_key,
    case when tick_checked then 'bought' end,
    case when tick_checked then decided end,
    case when tick_checked then auth.uid() end,
    decided,
    auth.uid(),
    now()
  )
  on conflict (shopping_list_id, line_key) do update
  set
    status = excluded.status,
    checked_at = excluded.checked_at,
    checked_by = excluded.checked_by,
    checked_changed_at = excluded.checked_changed_at,
    decided_by = excluded.decided_by,
    bought_name = null,
    bought_quantity = null,
    bought_unit = null,
    substituted = false,
    remainder = null,
    removed_reason = null,
    moved_shop_id = null,
    updated_at = excluded.updated_at
  where state.checked_changed_at is null or state.checked_changed_at < excluded.checked_changed_at;
  return found;
end;
$$;

revoke all on function public.tick_shopping_line(uuid, text, boolean, timestamptz) from public, anon;
grant execute on function public.tick_shopping_line(uuid, text, boolean, timestamptz) to authenticated, service_role;
