-- Recipes, their ingredient lines, photos and tags.

create type public.recipe_kind as enum ('cookbook', 'quick_meal');
create type public.recipe_status as enum ('needs_review', 'approved');
create type public.protein_type as enum ('red_meat', 'poultry', 'fish', 'vegetarian', 'vegan', 'none');
create type public.measure_scope as enum ('total', 'perPiece');

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- What the household calls it. May differ from the printed title.
  title text not null,
  -- Title as printed. Null when it was not on the photographed page.
  source_title text,
  kind public.recipe_kind not null default 'cookbook',
  source_book text,
  source_page integer,
  -- Base servings as printed. A range such as "4-6 Portionen" has min 4 and max 6.
  servings_min integer not null check (servings_min > 0),
  servings_max integer not null,
  prep_minutes integer check (prep_minutes > 0),
  protein_type public.protein_type,
  is_favorite boolean not null default false,
  steps text,
  status public.recipe_status not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  constraint recipe_servings_range check (servings_max >= servings_min)
);

create table public.recipe_photo (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  recipe_id uuid not null,
  -- Path inside the private storage bucket. Photos are only served through signed URLs.
  storage_path text not null,
  sort_order integer not null default 0,
  foreign key (household_id, recipe_id) references public.recipe (household_id, id) on delete cascade
);

create table public.tag (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  name text not null,
  -- Tags are browsed by group: Mahlzeit, Art, Ernährung, Aufwand.
  group_name text not null,
  sort_order integer not null default 0,
  unique (household_id, id),
  unique (household_id, name)
);

create table public.recipe_tag (
  household_id uuid not null references public.household on delete cascade,
  recipe_id uuid not null,
  tag_id uuid not null,
  primary key (recipe_id, tag_id),
  foreign key (household_id, recipe_id) references public.recipe (household_id, id) on delete cascade,
  foreign key (household_id, tag_id) references public.tag (household_id, id) on delete cascade
);

create table public.recipe_ingredient (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  recipe_id uuid not null,
  position integer not null,
  -- Null while the line is not mapped to the catalog yet.
  ingredient_id uuid,
  quantity numeric check (quantity > 0),
  -- Upper bound of a printed range such as "2-3".
  quantity_max numeric,
  unit public.unit,
  -- Printed with "etwa" or "ca.".
  is_approximate boolean not null default false,
  is_optional boolean not null default false,
  -- A second printed measure for the same line: "(etwa 200 g)", "à 150 g".
  -- The scope is null when the print does not say whether it is the total or per piece.
  secondary_quantity numeric check (secondary_quantity > 0),
  secondary_unit public.unit,
  secondary_scope public.measure_scope,
  -- The line this one may replace ("oder Petersilie"). Such lines never reach the list.
  alternative_to uuid references public.recipe_ingredient on delete cascade,
  -- The line as printed. Never changed by the household's edits.
  original_text text not null,
  note text,
  unique (recipe_id, position),
  foreign key (household_id, recipe_id) references public.recipe (household_id, id) on delete cascade,
  foreign key (household_id, ingredient_id) references public.ingredient (household_id, id),
  constraint recipe_ingredient_quantity_with_unit check ((quantity is null) = (unit is null)),
  constraint recipe_ingredient_range check (quantity_max is null or quantity_max > quantity),
  constraint recipe_ingredient_secondary check ((secondary_quantity is null) = (secondary_unit is null))
);

create index recipe_ingredient_ingredient_idx on public.recipe_ingredient (ingredient_id);

alter table public.recipe enable row level security;
alter table public.recipe_photo enable row level security;
alter table public.tag enable row level security;
alter table public.recipe_tag enable row level security;
alter table public.recipe_ingredient enable row level security;

create policy recipe_all on public.recipe for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy recipe_photo_all on public.recipe_photo for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy tag_all on public.tag for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy recipe_tag_all on public.recipe_tag for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy recipe_ingredient_all on public.recipe_ingredient for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.recipe, public.recipe_photo, public.tag, public.recipe_tag, public.recipe_ingredient from anon, authenticated, service_role;
grant select, insert, update, delete on public.recipe, public.recipe_photo, public.tag, public.recipe_tag, public.recipe_ingredient to authenticated, service_role;
