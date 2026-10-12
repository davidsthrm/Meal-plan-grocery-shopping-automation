-- What the household aims for in a week: how many meals of each kind at least and at most,
-- {"vegetarian": {"min": 3, "max": null}, ...}. Null until someone has chosen; the app asks
-- on the first visit and uses its own defaults until then.
alter table public.household add column balance_targets jsonb;
