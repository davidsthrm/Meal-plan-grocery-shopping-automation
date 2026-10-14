-- The day a recipe outside the meals is needed: the cakes for Saturday's invitation. Its
-- ingredients are then bought for that day like a meal's. Null for no day: bought on the
-- week's first supermarket day, as before.
alter table public.plan_extra add column needed_on date;

-- The day it was added, as for a recipe on a meal: a shopping day before that cannot have
-- bought for it. Null for extras added before this was recorded.
alter table public.plan_extra add column planned_on date;
