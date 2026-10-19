-- Receipts, prepared for phase 2 (docs/receipts.md): nothing writes these tables yet. A
-- photo of a receipt is read by a model into its lines; each line is matched against the
-- shopping notes of its day, and the household confirms or corrects every match: the model
-- suggests, it never decides. What every model request cost is kept in one ledger, for
-- receipts and recipe imports alike, so that a household's spending on models can be shown
-- and held to a budget. Additive: the app before this keeps working.

create table public.receipt (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- The photo as uploaded and the clean copy read from it, in the household's folder.
  original_path text,
  photo_path text,
  -- The shop as read, and the household's shop it was matched to.
  shop_name_read text check (shop_name_read is null or char_length(shop_name_read) <= 120),
  shop_id uuid,
  purchased_at timestamptz,
  -- The note of that errand, where the receipt was matched to one.
  shopping_list_id uuid,
  total_cents integer check (total_cents is null or total_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- uploaded: waiting to be read; read: waiting for the household; reviewed: every line
  -- confirmed or corrected; failed: could not be read, with the reason.
  status text not null default 'uploaded'
    check (status in ('uploaded', 'read', 'reviewed', 'failed')),
  failure text check (failure is null or char_length(failure) <= 500),
  -- Doubts of the reading, in German, as for recipes: a total that does not add up.
  doubts jsonb not null default '[]',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, shop_id) references public.shop (household_id, id),
  foreign key (household_id, shopping_list_id)
    references public.shopping_list (household_id, id) on delete set null (shopping_list_id),
  constraint receipt_in_household_folder check (
    private.in_household_folder(original_path, household_id)
    and private.in_household_folder(photo_path, household_id)
  )
);

create index receipt_by_day on public.receipt (household_id, purchased_at);

-- One printed line of a receipt: a product, a deposit, a discount.
create table public.receipt_line (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  receipt_id uuid not null,
  position integer not null check (position >= 0),
  -- As printed: "ENSINGER SPORT 0,75L".
  text_read text not null check (char_length(text_read) between 1 and 200),
  -- As the household corrected it, where it did.
  text text check (text is null or char_length(text) between 1 and 200),
  quantity numeric check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(unit) between 1 and 12),
  unit_price_cents integer,
  -- Negative for a discount or a deposit returned.
  price_cents integer not null,
  kind text not null default 'product' check (kind in ('product', 'deposit', 'discount')),
  -- The catalog ingredient it is, for the price trend of one thing over time.
  ingredient_id uuid,
  unique (receipt_id, position),
  unique (household_id, id),
  foreign key (household_id, receipt_id) references public.receipt (household_id, id)
    on delete cascade,
  foreign key (household_id, ingredient_id) references public.ingredient (household_id, id)
);

-- A line of a receipt matched to a line of a shopping note. Suggested by the matching,
-- confirmed or rejected by the household. A receipt line that matches no note line was not
-- planned: it has no confirmed match.
create table public.receipt_match (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  receipt_line_id uuid not null,
  shopping_list_id uuid not null,
  line_key text not null check (char_length(line_key) between 1 and 200),
  -- How sure the matching was, from 0 to 1.
  score numeric not null check (score between 0 and 1),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  unique (receipt_line_id, shopping_list_id, line_key),
  foreign key (household_id, receipt_line_id) references public.receipt_line (household_id, id)
    on delete cascade,
  foreign key (household_id, shopping_list_id) references public.shopping_list (household_id, id)
    on delete cascade
);

-- At most one confirmed match per receipt line.
create unique index receipt_match_one_confirmed on public.receipt_match (receipt_line_id)
  where status = 'confirmed';

-- Every request to a model and what it cost, whatever it was for. Cost in millionths of a
-- cent, so that a request of 0.21 cents is a whole number.
create table public.model_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  purpose text not null check (
    purpose in ('recipe_read', 'recipe_verify', 'steps', 'frame', 'tags', 'text', 'receipt')
  ),
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_microcents bigint not null check (cost_microcents >= 0),
  receipt_id uuid,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  foreign key (household_id, receipt_id) references public.receipt (household_id, id)
    on delete set null (receipt_id),
  foreign key (household_id, import_batch_id) references public.import_batch (household_id, id)
    on delete set null (import_batch_id)
);

create index model_usage_by_month on public.model_usage (household_id, created_at);

-- What a household may spend on models in a month, in cents. Null: no limit.
alter table public.household
  add column if not exists model_budget_cents integer check (model_budget_cents >= 0);

alter table public.receipt enable row level security;
alter table public.receipt_line enable row level security;
alter table public.receipt_match enable row level security;
alter table public.model_usage enable row level security;

create policy receipt_all on public.receipt for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy receipt_line_all on public.receipt_line for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy receipt_match_all on public.receipt_match for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
-- The ledger is read by members and written by the server, which knows what a request cost.
create policy model_usage_read on public.model_usage for select to authenticated
  using (private.is_household_member(household_id));

revoke all on public.receipt, public.receipt_line, public.receipt_match, public.model_usage
  from anon, authenticated, service_role;
grant select, insert, update, delete on public.receipt, public.receipt_line, public.receipt_match
  to authenticated, service_role;
grant select on public.model_usage to authenticated;
grant select, insert, update, delete on public.model_usage to service_role;
