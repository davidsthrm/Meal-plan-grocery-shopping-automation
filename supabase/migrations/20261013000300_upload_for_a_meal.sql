-- An upload started from a meal of the week plan: "Lasagne" is planned as text, the page of
-- the cookbook is photographed, and the recipe read from it takes the place of the text.
-- The batch remembers the meal until the recipe is on it.
alter table public.import_batch add column for_date date;
alter table public.import_batch add column for_meal public.meal;
alter table public.import_batch
  add constraint import_batch_for_a_meal check ((for_date is null) = (for_meal is null));
