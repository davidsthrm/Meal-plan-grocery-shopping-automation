-- Shops, aisle groups and the canonical ingredient catalog.

create type public.unit as enum (
  'g', 'kg', 'ml', 'l', 'TL', 'EL',
  'Stück', 'Zehe', 'Bund', 'Stängel', 'Zweig', 'Blatt', 'Scheibe', 'Dose', 'Glas', 'Becher',
  'Packung', 'Beutel', 'Würfel', 'Kopf', 'Knolle', 'Stange', 'Prise', 'Msp'
);

-- How an ingredient is bought, which decides what the list shows:
-- a number of pieces, a weight, packs, or just the name.
create type public.buying_mode as enum ('count', 'weight', 'pack', 'none');

-- 'proposed' rows come from the recipe import and wait for confirmation.
create type public.ingredient_status as enum ('active', 'proposed');

create table public.shop (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  name text not null,
  -- How the household writes it on the list, e.g. "EC".
  short_label text not null,
  sort_order integer not null default 0,
  -- Lines without a catalog ingredient go to this shop.
  is_default boolean not null default false,
  unique (household_id, id),
  unique (household_id, name)
);

create unique index shop_one_default_idx on public.shop (household_id) where is_default;

create table public.aisle_group (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  -- Lines without a catalog ingredient go to this group.
  is_fallback boolean not null default false,
  unique (household_id, id),
  unique (household_id, name)
);

create unique index aisle_group_one_fallback_idx on public.aisle_group (household_id) where is_fallback;

-- An aisle group that sits somewhere else in one shop than the default order says.
create table public.shop_aisle_order (
  household_id uuid not null references public.household on delete cascade,
  shop_id uuid not null,
  aisle_group_id uuid not null,
  sort_order integer not null,
  primary key (shop_id, aisle_group_id),
  foreign key (household_id, shop_id) references public.shop (household_id, id) on delete cascade,
  foreign key (household_id, aisle_group_id) references public.aisle_group (household_id, id) on delete cascade
);

create table public.ingredient (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- The household's word. This is what the list shows.
  name text not null,
  -- Other names, spellings and abbreviations for the same product.
  synonyms text[] not null default '{}',
  aisle_group_id uuid not null,
  preferred_shop_id uuid not null,
  preferred_brand text,
  -- The unit amounts of this ingredient are summed in.
  default_unit public.unit not null,
  buying_mode public.buying_mode not null default 'none',
  -- Size of one pack in default_unit.
  pack_size numeric check (pack_size > 0),
  -- Purchase quantities are rounded up to a multiple of this, in default_unit.
  rounding_step numeric check (rounding_step > 0),
  -- Grams per counted unit, or per ml (density): {"Stück": 100, "ml": 1.03}.
  grams_per jsonb not null default '{}',
  -- Usually at home. Pre-ticked in the "Haben wir schon?" step.
  is_pantry_staple boolean not null default false,
  -- Days it stays good after buying. Null keeps for any planned week.
  shelf_life_days integer check (shelf_life_days >= 0),
  status public.ingredient_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, aisle_group_id) references public.aisle_group (household_id, id),
  foreign key (household_id, preferred_shop_id) references public.shop (household_id, id),
  constraint ingredient_pack_needs_size check (buying_mode <> 'pack' or pack_size is not null)
);

create unique index ingredient_name_idx on public.ingredient (household_id, lower(name));

alter table public.shop enable row level security;
alter table public.aisle_group enable row level security;
alter table public.shop_aisle_order enable row level security;
alter table public.ingredient enable row level security;

create policy shop_all on public.shop for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy aisle_group_all on public.aisle_group for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy shop_aisle_order_all on public.shop_aisle_order for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy ingredient_all on public.ingredient for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.shop, public.aisle_group, public.shop_aisle_order, public.ingredient from anon, authenticated;
grant select, insert, update, delete on public.shop, public.aisle_group, public.shop_aisle_order, public.ingredient to authenticated;
