-- The week a household started to plan with the app: the plan, the shopping notes and the
-- list of all weeks reach no further back. Null for no limit, as for the test household.
alter table public.household add column first_week date
  check (first_week is null or extract(isodow from first_week) = 1);
