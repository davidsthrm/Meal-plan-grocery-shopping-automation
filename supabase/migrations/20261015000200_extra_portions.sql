-- "Mehr kochen": portions a meal is cooked with beyond its recipes' servings, for leftovers
-- on a later meal. They are bought with the meal and counted apart from the persons eating
-- it, so that "4 Personen" stays 4 and "2 Extra-Portionen" can become 3.
alter table public.plan_slot add column if not exists extra_servings smallint not null default 0
  check (extra_servings between 0 and 20);
