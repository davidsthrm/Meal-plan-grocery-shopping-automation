-- The moment a recipe or a food was put on a meal, besides its day: an errand that was done
-- on that day before it was planned has not bought for it, and its note stays done. Null for
-- what was planned before this was recorded: no such limit. Extras have it in created_at.
-- The default is set after the column is added, so that the rows there are keep null.
alter table public.plan_slot_item add column if not exists planned_at timestamptz;
alter table public.plan_slot_item alter column planned_at set default now();
alter table public.plan_slot_food add column if not exists planned_at timestamptz;
alter table public.plan_slot_food alter column planned_at set default now();
