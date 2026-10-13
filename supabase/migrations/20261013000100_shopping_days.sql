-- Several shopping days a week: the supermarket on some, the market and the butcher on
-- another. Every shopping day has a list of its own.

-- What the market and the butcher sell fresh. It is bought there when a market day reaches
-- the meal, and at the supermarket otherwise.
alter table public.aisle_group add column is_market boolean not null default false;

update public.aisle_group
set is_market = true
where name in ('Obst & Gemüse', 'Fleisch & Wurst', 'Fisch & Meeresfrüchte');

-- The day a recipe or a food was put on a meal. A shopping day before that cannot have
-- bought for it. Null for what was planned before this was recorded: no such limit.
alter table public.plan_slot_item add column planned_on date;
alter table public.plan_slot_food add column planned_on date;

-- A list belongs to a shopping day, no longer to a week: Saturday's market buys for the
-- weekend of one week and the start of the next. The lists there are keep their week and
-- their day, which was the week's one shopping day.
alter table public.shopping_list alter column week_plan_id drop not null;
alter table public.shopping_list
  add constraint shopping_list_one_per_day unique (household_id, shopping_date);
