-- Importing a cookbook page by page: every photo of a batch is a page, pages are grouped into
-- recipes, and each recipe is one import job.

-- uploaded:   the photo as it came from the phone is in storage
-- processing: being turned into a stored photo and looked at
-- read:       stored and looked at; it belongs to a recipe or waits to be grouped
-- ignored:    no recipe on it (cover, contents, a title without a recipe)
-- failed:     could not be read at all
create type public.import_page_status as enum ('uploaded', 'processing', 'read', 'ignored', 'failed');

create table public.import_page (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  batch_id uuid not null,
  -- Order in which the pages were photographed.
  position integer not null,
  file_name text not null,
  -- The upload as it came from the phone. Deleted once the stored photo exists, because it
  -- carries the phone's metadata.
  original_path text,
  -- Upright JPEG without metadata, in the private bucket.
  photo_path text,
  status public.import_page_status not null default 'uploaded',
  -- Page number printed on the page, if any.
  printed_page integer,
  -- What the first look at the page found: which recipes start or continue on it.
  survey jsonb,
  error text,
  -- Set while a request works on the page, so an abandoned one can be picked up again.
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (batch_id, position),
  foreign key (household_id, batch_id) references public.import_batch (household_id, id) on delete cascade
);

-- Set once the pages of a batch have been grouped into recipes.
alter table public.import_batch add column grouped_at timestamptz;

-- The pages a recipe is read from, in reading order.
alter table public.import_job add column page_ids uuid[] not null default '{}';
-- Which recipe to read when a page shows more than one.
alter table public.import_job add column focus_title text;
alter table public.import_job add column claimed_at timestamptz;

-- The household decided that this is not a recipe.
alter type public.import_status add value 'discarded';

-- A recipe that waits for review may still lack its servings. An approved one may not.
alter table public.recipe alter column servings_min drop not null;
alter table public.recipe alter column servings_max drop not null;
alter table public.recipe drop constraint recipe_servings_range;
alter table public.recipe add constraint recipe_servings_range
  check ((servings_min is null) = (servings_max is null) and (servings_min is null or servings_max >= servings_min));
alter table public.recipe add constraint recipe_approved_has_servings
  check (status <> 'approved' or servings_min is not null);

alter table public.import_page enable row level security;

create policy import_page_all on public.import_page for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.import_page from anon, authenticated, service_role;
grant select, insert, update, delete on public.import_page to authenticated, service_role;
