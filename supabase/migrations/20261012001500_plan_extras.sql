-- Recipes a week needs that belong to none of its meals: two cakes for an invitation on
-- Saturday, biscuits for the school fair. They count for the shopping list like any meal.
create table public.plan_extra (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  week_plan_id uuid not null,
  recipe_id uuid not null,
  -- Persons, or how many of what the recipe makes: 2 of "Springform (Ø 26 cm)".
  servings integer not null check (servings > 0),
  -- What it is for: "Einladung am Samstag".
  note text,
  created_at timestamptz not null default now(),
  unique (week_plan_id, recipe_id),
  foreign key (household_id, week_plan_id) references public.week_plan (household_id, id) on delete cascade,
  foreign key (household_id, recipe_id) references public.recipe (household_id, id)
);

alter table public.plan_extra enable row level security;

create policy plan_extra_all on public.plan_extra for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.plan_extra from anon, authenticated, service_role;
grant select, insert, update, delete on public.plan_extra to authenticated, service_role;
