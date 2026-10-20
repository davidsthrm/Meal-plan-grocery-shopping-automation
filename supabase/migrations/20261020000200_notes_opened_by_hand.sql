-- A shopping note someone opened by hand for a place on a day of their choice: a note for dm
-- on a Wednesday, or for the bakery on a Thursday. It lies among the notes of its week while
-- it is empty, to be written on. Null for every other note, which comes from the household's
-- shopping days and the plan. Additive: the app before this keeps working.
alter table public.shopping_list add column if not exists opened_at timestamptz;
