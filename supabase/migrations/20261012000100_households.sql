-- Households and membership. Every other table hangs off a household and is only visible to
-- its members.

create schema if not exists private;

create table public.household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_servings integer not null default 4 check (default_servings > 0),
  -- ISO weekday of the main shopping trip: 1 = Monday.
  shopping_weekday smallint not null default 1 check (shopping_weekday between 1 and 7),
  created_at timestamptz not null default now()
);

create type public.household_role as enum ('admin', 'member');

-- Accounts exist by invite only. An admin adds the row here; nothing joins a household by itself.
create table public.household_member (
  household_id uuid not null references public.household on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.household_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_member_user_idx on public.household_member (user_id);

-- Security definer, so that policies can ask about membership without running into
-- household_member's own policy.
create function private.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_member m
    where m.household_id = target_household
      and m.user_id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_household_member(uuid) from public, anon;
grant execute on function private.is_household_member(uuid) to authenticated;

alter table public.household enable row level security;
alter table public.household_member enable row level security;

-- Members may read and adjust their household. Creating households and managing members is
-- done with the service role only.
create policy household_select on public.household
  for select to authenticated
  using (private.is_household_member(id));

create policy household_update on public.household
  for update to authenticated
  using (private.is_household_member(id))
  with check (private.is_household_member(id));

create policy household_member_select on public.household_member
  for select to authenticated
  using (private.is_household_member(household_id));

revoke all on public.household, public.household_member from anon, authenticated;
grant select, update on public.household to authenticated;
grant select on public.household_member to authenticated;
