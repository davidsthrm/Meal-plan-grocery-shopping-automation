-- A family shares one household: everyone has an account of their own and sees the same
-- plan, lists and favourites. A member invites the others with a link.

-- How a member is called in the household. The account's e-mail is nobody else's business.
alter table public.household_member add column display_name text
  check (display_name is null or char_length(display_name) between 1 and 40);

-- An invitation to join a household. The link carries a secret; only its hash is stored,
-- so reading this table does not let anyone join. It works once and for a few days.
create table public.household_invite (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users on delete set null
);

alter table public.household_invite enable row level security;

-- Members see, make and withdraw the invitations of their household. Using one is done by
-- the server with the secret key, for someone who is no member yet.
create policy household_invite_select on public.household_invite for select to authenticated
  using (private.is_household_member(household_id));
create policy household_invite_insert on public.household_invite for insert to authenticated
  with check (private.is_household_member(household_id));
create policy household_invite_delete on public.household_invite for delete to authenticated
  using (private.is_household_member(household_id));

revoke all on public.household_invite from anon, authenticated, service_role;
grant select, insert, delete on public.household_invite to authenticated;
grant select, insert, update, delete on public.household_invite to service_role;
