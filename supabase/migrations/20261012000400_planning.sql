-- Week plans: seven days, lunch and dinner. Past week plans are the history.

create type public.meal as enum ('lunch', 'dinner');

-- recipes:   one or more recipes with servings (a main dish and its sides)
-- free_text: a meal without a recipe, e.g. "Vesper"
-- leftovers: leftovers, optionally of a named earlier meal
-- away:      eaten elsewhere or replaced by an activity, e.g. "bei Oma", "Handball + Yoga"
-- skipped:   deliberately left empty
-- A slot that is not planned yet has no row.
create type public.slot_kind as enum ('recipes', 'free_text', 'leftovers', 'away', 'skipped');

create table public.week_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- Always a Monday.
  week_start date not null check (extract(isodow from week_start) = 1),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, week_start)
);

create table public.plan_slot (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  week_plan_id uuid not null,
  date date not null,
  meal public.meal not null,
  kind public.slot_kind not null,
  label text,
  -- May point into an earlier week: Monday's leftovers come from Sunday.
  leftovers_of_slot_id uuid references public.plan_slot on delete set null,
  unique (household_id, id),
  unique (week_plan_id, date, meal),
  foreign key (household_id, week_plan_id) references public.week_plan (household_id, id) on delete cascade,
  constraint plan_slot_label_required check (kind not in ('free_text', 'away') or nullif(trim(label), '') is not null),
  constraint plan_slot_leftovers_only check (leftovers_of_slot_id is null or kind = 'leftovers')
);

-- The recipes of a 'recipes' slot. The app keeps other slot kinds free of items.
create table public.plan_slot_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  plan_slot_id uuid not null,
  recipe_id uuid not null,
  servings integer not null check (servings > 0),
  position integer not null default 0,
  unique (plan_slot_id, position),
  foreign key (household_id, plan_slot_id) references public.plan_slot (household_id, id) on delete cascade,
  foreign key (household_id, recipe_id) references public.recipe (household_id, id)
);

create index plan_slot_item_recipe_idx on public.plan_slot_item (recipe_id);

-- Things bought regularly without a recipe: milk, bread, toilet paper.
create table public.recurring_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  ingredient_id uuid,
  -- Free text for things that are not in the catalog.
  label text,
  default_quantity numeric check (default_quantity > 0),
  default_unit public.unit,
  -- Whether a new week starts with this item switched on.
  is_on_by_default boolean not null default true,
  sort_order integer not null default 0,
  unique (household_id, id),
  foreign key (household_id, ingredient_id) references public.ingredient (household_id, id),
  constraint recurring_item_target check (ingredient_id is not null or nullif(trim(label), '') is not null),
  constraint recurring_item_quantity_with_unit check ((default_quantity is null) = (default_unit is null))
);

-- The per-week switch for a recurring item.
create table public.week_recurring_item (
  household_id uuid not null references public.household on delete cascade,
  week_plan_id uuid not null,
  recurring_item_id uuid not null,
  is_on boolean not null,
  quantity numeric check (quantity > 0),
  primary key (week_plan_id, recurring_item_id),
  foreign key (household_id, week_plan_id) references public.week_plan (household_id, id) on delete cascade,
  foreign key (household_id, recurring_item_id) references public.recurring_item (household_id, id) on delete cascade
);

alter table public.week_plan enable row level security;
alter table public.plan_slot enable row level security;
alter table public.plan_slot_item enable row level security;
alter table public.recurring_item enable row level security;
alter table public.week_recurring_item enable row level security;

create policy week_plan_all on public.week_plan for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy plan_slot_all on public.plan_slot for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy plan_slot_item_all on public.plan_slot_item for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy recurring_item_all on public.recurring_item for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy week_recurring_item_all on public.week_recurring_item for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.week_plan, public.plan_slot, public.plan_slot_item, public.recurring_item, public.week_recurring_item from anon, authenticated, service_role;
grant select, insert, update, delete on public.week_plan, public.plan_slot, public.plan_slot_item, public.recurring_item, public.week_recurring_item to authenticated, service_role;
