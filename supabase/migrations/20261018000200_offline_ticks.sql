-- Ticks made in the shop without a connection arrive later, maybe after someone else ticked
-- or opened the same line again. Each line keeps the tick made last, by the time it was
-- made, not by the time it arrived. Additive: the app before this keeps working.

-- When the tick of a line was last decided, ticked or opened again. Null for lines never
-- ticked since this column exists (and taken from checked_at below where there is one).
alter table public.shopping_line_state add column if not exists checked_changed_at timestamptz;

update public.shopping_line_state
set checked_changed_at = checked_at
where checked_at is not null and checked_changed_at is null;

-- Ticks a line, or opens it again, unless a tick made later is stored already. Sent twice,
-- it changes nothing the second time. A time in the future (a device whose clock is ahead)
-- counts as now, or that device's ticks would win over everything for a while. Runs with
-- the caller's rights: row level security decides whose lists it may touch. Returns
-- whether it changed the line.
create or replace function public.tick_shopping_line(
  list_id uuid,
  tick_key text,
  tick_checked boolean,
  ticked_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner uuid;
  decided timestamptz := least(ticked_at, now());
begin
  select household_id into owner from public.shopping_list where id = list_id;
  if owner is null then
    raise exception 'shopping list not found';
  end if;
  insert into public.shopping_line_state as state (
    household_id, shopping_list_id, line_key, checked_at, checked_by, checked_changed_at, updated_at
  )
  values (
    owner,
    list_id,
    tick_key,
    case when tick_checked then decided end,
    case when tick_checked then auth.uid() end,
    decided,
    now()
  )
  on conflict (shopping_list_id, line_key) do update
  set
    checked_at = excluded.checked_at,
    checked_by = excluded.checked_by,
    checked_changed_at = excluded.checked_changed_at,
    updated_at = excluded.updated_at
  where state.checked_changed_at is null or state.checked_changed_at < excluded.checked_changed_at;
  return found;
end;
$$;

revoke all on function public.tick_shopping_line(uuid, text, boolean, timestamptz) from public, anon;
grant execute on function public.tick_shopping_line(uuid, text, boolean, timestamptz) to authenticated, service_role;
