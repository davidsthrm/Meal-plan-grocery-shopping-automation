-- Recipe import: batches of uploaded photos, one job per recipe, and proposals for
-- ingredients the catalog does not know yet.

-- uploaded:     photos are in storage, nothing has run yet
-- processing:   the import is running
-- approved:     nothing came up; the recipe is in the library
-- needs_review: something came up; a person decides
-- failed:       the photos could not be read at all
create type public.import_status as enum ('uploaded', 'processing', 'approved', 'needs_review', 'failed');

create type public.proposal_status as enum ('open', 'accepted', 'rejected');

-- One upload session. The cookbook is entered once for the whole batch.
create table public.import_batch (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  source_book text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

-- One recipe of a batch, from its photos to the decision.
create table public.import_job (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  batch_id uuid not null,
  position integer not null default 0,
  status public.import_status not null default 'uploaded',
  -- The stored photos in page order: upright JPEGs without metadata, in the private bucket.
  photo_paths text[] not null default '{}',
  -- What the household entered because the photo does not show it.
  provided_title text,
  provided_page integer,
  -- What the first pass read and what the second pass found, kept for the review screen.
  extraction jsonb,
  verification jsonb,
  -- Why the recipe needs a person. Empty for an approved recipe.
  issues jsonb not null default '[]',
  -- The model's observations that need no decision.
  notes jsonb not null default '[]',
  recipe_id uuid,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, batch_id) references public.import_batch (household_id, id) on delete cascade,
  foreign key (household_id, recipe_id) references public.recipe (household_id, id) on delete set null (recipe_id)
);

create index import_job_batch_idx on public.import_job (batch_id, position);
create index import_job_review_idx on public.import_job (household_id) where status = 'needs_review';

-- An ingredient a recipe uses and the catalog does not have. Never created silently: the
-- household confirms proposals in one go. A proposal is either another name for an existing
-- ingredient (same_as_ingredient_id) or a new one with a suggested place in the catalog.
create table public.ingredient_proposal (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- The name as read from the recipe.
  name text not null,
  same_as_ingredient_id uuid,
  aisle_group_id uuid not null,
  preferred_shop_id uuid not null,
  default_unit public.unit not null,
  buying_mode public.buying_mode not null default 'none',
  pack_size numeric check (pack_size > 0),
  is_pantry_staple boolean not null default false,
  shelf_life_days integer check (shelf_life_days >= 0),
  status public.proposal_status not null default 'open',
  -- What it became: a new catalog ingredient, or the existing one it was another name for.
  resolved_ingredient_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, same_as_ingredient_id) references public.ingredient (household_id, id) on delete set null (same_as_ingredient_id),
  foreign key (household_id, resolved_ingredient_id) references public.ingredient (household_id, id) on delete set null (resolved_ingredient_id),
  foreign key (household_id, aisle_group_id) references public.aisle_group (household_id, id),
  foreign key (household_id, preferred_shop_id) references public.shop (household_id, id),
  constraint ingredient_proposal_pack_needs_size check (buying_mode <> 'pack' or pack_size is not null)
);

-- The same unknown ingredient in ten recipes is one open proposal, not ten.
create unique index ingredient_proposal_open_name_idx
  on public.ingredient_proposal (household_id, lower(name)) where status = 'open';

-- A recipe line that waits for a proposal. Accepting the proposal fills in ingredient_id.
alter table public.recipe_ingredient add column proposal_id uuid;
alter table public.recipe_ingredient
  add constraint recipe_ingredient_proposal_fk
  foreign key (household_id, proposal_id)
  references public.ingredient_proposal (household_id, id) on delete set null (proposal_id);
create index recipe_ingredient_proposal_idx on public.recipe_ingredient (proposal_id) where proposal_id is not null;

alter table public.import_batch enable row level security;
alter table public.import_job enable row level security;
alter table public.ingredient_proposal enable row level security;

create policy import_batch_all on public.import_batch for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy import_job_all on public.import_job for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy ingredient_proposal_all on public.ingredient_proposal for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.import_batch, public.import_job, public.ingredient_proposal from anon, authenticated, service_role;
grant select, insert, update, delete on public.import_batch, public.import_job, public.ingredient_proposal to authenticated, service_role;
