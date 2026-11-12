-- The library was read whole for every render: the week plan, the chooser of a meal,
-- Entdecken and the favourites each took about 32 requests and 1.7 MB with the household's
-- 1,427 recipes (measured 11 November 2026), and so did every button on the plan and every
-- page fetched ahead. The library changes rarely: a favourite, an import. So the server keeps
-- it per household (src/server/kept.ts) and reads it again only when this counter has risen.
--
-- The counter rises in the same transaction as the change, so it is never seen without it.
-- The household's read of it (requireHousehold) comes before any read of the library in a
-- request: what is kept under a counter is never older than that counter.
--
-- Not in the publication supabase_realtime: the counter must not make open pages read
-- themselves again; the tables it counts tell them already.

create table public.library_version (
  household_id uuid primary key references public.household (id) on delete cascade,
  version bigint not null default 0
);

alter table public.library_version enable row level security;

-- Members read their counter. Only the triggers below write it.
create policy library_version_select on public.library_version
  for select to authenticated
  using (household_id = any ((select private.my_household_ids())::uuid[]));

revoke all on public.library_version from anon, authenticated, service_role;
grant select on public.library_version to authenticated;
grant select, insert, update, delete on public.library_version to service_role;

insert into public.library_version (household_id) select id from public.household;

-- Security definer: members may not write the counter themselves.
create function private.add_library_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.library_version (household_id) values (new.id);
  return null;
end;
$$;

-- Finding no row is fine: when a household is deleted, its rows go by cascade and its
-- counter may be gone already.
create function private.raise_library_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.library_version
  set version = version + 1
  where household_id = (case when tg_op = 'DELETE' then old.household_id else new.household_id end);
  return null;
end;
$$;

revoke all on function private.add_library_version() from public, anon, authenticated;
revoke all on function private.raise_library_version() from public, anon, authenticated;

create trigger library_version_add after insert on public.household
  for each row execute function private.add_library_version();

-- What the kept library, catalog and search index are read from.
create trigger library_version_raise after insert or update or delete on public.recipe
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.recipe_tag
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.tag
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.recipe_ingredient
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.ingredient
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.shop
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.shop_aisle_order
  for each row execute function private.raise_library_version();
create trigger library_version_raise after insert or update or delete on public.aisle_group
  for each row execute function private.raise_library_version();
