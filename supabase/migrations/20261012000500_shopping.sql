-- The shopping list of a week.
--
-- Three kinds of rows, kept apart on purpose:
--   shopping_manual_entry  what the household typed in by hand (input)
--   shopping_line          what the plan, the recipes and the manual entries add up to (derived)
--   shopping_line_state    what the household changed on a line (kept across regeneration)
--
-- When the plan changes, shopping_line is rebuilt. shopping_line_state is keyed by the stable
-- line_key, so notes, shop overrides, at-home marks and check-offs stay with their line.

-- 'main' is bought on the shopping day, 'later' shortly before it is needed.
create type public.trip as enum ('main', 'later');

create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  week_plan_id uuid not null,
  -- Day of the main shopping trip. Decides what has to be bought fresh later.
  shopping_date date not null,
  generated_at timestamptz,
  unique (household_id, id),
  unique (week_plan_id),
  foreign key (household_id, week_plan_id) references public.week_plan (household_id, id) on delete cascade
);

create table public.shopping_manual_entry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  shopping_list_id uuid not null,
  -- As typed: "Milch WS 1.29", "Geschenkpapier".
  text text not null check (nullif(trim(text), '') is not null),
  -- Only used when the text matches no catalog ingredient.
  shop_id uuid,
  aisle_group_id uuid,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, shopping_list_id) references public.shopping_list (household_id, id) on delete cascade,
  foreign key (household_id, shop_id) references public.shop (household_id, id),
  foreign key (household_id, aisle_group_id) references public.aisle_group (household_id, id)
);

create table public.shopping_line (
  household_id uuid not null references public.household on delete cascade,
  shopping_list_id uuid not null,
  -- "<ingredient>@<trip>", with "#<unit>" for amounts that could not be merged, or
  -- "manual:<entry>" for free text.
  line_key text not null,
  ingredient_id uuid,
  label text not null,
  trip public.trip not null default 'main',
  -- For 'later' lines: the first day the ingredient is needed.
  needed_by date,
  shop_id uuid not null,
  aisle_group_id uuid not null,
  -- What the list shows before the name. Null means the name alone is enough.
  purchase_quantity numeric,
  purchase_unit public.unit,
  -- Exact sums and the meals they come from, shown on tap.
  amounts jsonb not null default '[]',
  contributions jsonb not null default '[]',
  has_unquantified boolean not null default false,
  note text,
  default_at_home boolean not null default false,
  is_optional boolean not null default false,
  primary key (shopping_list_id, line_key),
  foreign key (household_id, shopping_list_id) references public.shopping_list (household_id, id) on delete cascade,
  foreign key (household_id, ingredient_id) references public.ingredient (household_id, id),
  foreign key (household_id, shop_id) references public.shop (household_id, id),
  foreign key (household_id, aisle_group_id) references public.aisle_group (household_id, id),
  constraint shopping_line_purchase check ((purchase_quantity is null) = (purchase_unit is null))
);

create table public.shopping_line_state (
  household_id uuid not null references public.household on delete cascade,
  shopping_list_id uuid not null,
  line_key text not null,
  -- Null means: use the line's default (pantry staples start as at home).
  at_home boolean,
  -- Shop for this week only.
  shop_id uuid,
  -- Null means: use the line's own note. An empty string means: no note.
  note text,
  checked_at timestamptz,
  checked_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (shopping_list_id, line_key),
  foreign key (household_id, shopping_list_id) references public.shopping_list (household_id, id) on delete cascade,
  foreign key (household_id, shop_id) references public.shop (household_id, id)
);

alter table public.shopping_list enable row level security;
alter table public.shopping_manual_entry enable row level security;
alter table public.shopping_line enable row level security;
alter table public.shopping_line_state enable row level security;

create policy shopping_list_all on public.shopping_list for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy shopping_manual_entry_all on public.shopping_manual_entry for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy shopping_line_all on public.shopping_line for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy shopping_line_state_all on public.shopping_line_state for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.shopping_list, public.shopping_manual_entry, public.shopping_line, public.shopping_line_state from anon, authenticated;
grant select, insert, update, delete on public.shopping_list, public.shopping_manual_entry, public.shopping_line, public.shopping_line_state to authenticated;
