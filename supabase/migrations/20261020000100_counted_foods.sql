-- How many of a food a meal needs, where that was said: "1 Dinkelbaguette" next to Sunday's
-- soup. Null is a name without an amount, as foods were before ("Brot, Gurke" for a cold
-- supper). Additive: the app before this keeps working.
alter table public.plan_slot_food
  add column if not exists quantity integer check (quantity is null or quantity between 1 and 99);
