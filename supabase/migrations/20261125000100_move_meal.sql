-- A meal moves to another place of its week, or swaps places with the meal there (decided
-- on 25 November 2026: plans change). Its row moves, not what it holds: recipes, persons,
-- foods, extra portions and a typed text are the row's or point to it, and leftovers keep
-- pointing to the meal they are from. One call is one transaction, so a swap is never half
-- done. Additive: the app before this keeps working.
--
-- A place is unique in its week (`unique (week_plan_id, date, meal)`), and Postgres checks
-- that row by row: two meals cannot exchange their places in one update. The moving meal
-- waits on a date no meal has while the other takes its place. Runs with the caller's
-- rights: row level security decides whose meals it may move. Returns the meal it swapped
-- with, or null.
create function public.move_plan_slot(slot_id uuid, to_date date, to_meal public.meal)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moving public.plan_slot;
  first_day date;
  other_id uuid;
begin
  select * into moving from public.plan_slot where id = slot_id for update;
  if moving.id is null then
    raise exception 'meal not found';
  end if;
  select w.week_start into first_day from public.week_plan w where w.id = moving.week_plan_id;
  if to_date < first_day or to_date > first_day + 6 then
    raise exception 'a meal moves within its week';
  end if;
  if moving.date = to_date and moving.meal = to_meal then
    return null;
  end if;
  select s.id into other_id
  from public.plan_slot s
  where s.week_plan_id = moving.week_plan_id and s.date = to_date and s.meal = to_meal
  for update;
  if other_id is not null then
    update public.plan_slot set date = '-infinity' where id = slot_id;
    update public.plan_slot set date = moving.date, meal = moving.meal where id = other_id;
  end if;
  update public.plan_slot set date = to_date, meal = to_meal where id = slot_id;
  return other_id;
end;
$$;

revoke all on function public.move_plan_slot(uuid, date, public.meal) from public, anon;
grant execute on function public.move_plan_slot(uuid, date, public.meal) to authenticated, service_role;
