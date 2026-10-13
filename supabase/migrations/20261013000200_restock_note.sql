-- The note for what ran out at home: flour, dishwasher tabs. Anyone in the household writes
-- on it at any time. An entry leaves the note when it is put on a shopping list, where it
-- becomes a typed line.
create table public.restock_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  -- As written: "Mehl", "Spülmittel", "Milch WS 1.29".
  text text not null check (nullif(trim(text), '') is not null and char_length(text) <= 120),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

-- Written twice, it is still needed once.
create unique index restock_item_once_idx on public.restock_item (household_id, lower(text));

alter table public.restock_item enable row level security;

create policy restock_item_all on public.restock_item for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.restock_item from anon, authenticated, service_role;
grant select, insert, update, delete on public.restock_item to authenticated, service_role;
