-- "Nicht jetzt" in the recipe stack of Entdecken: when it was said. The recipe stays out of
-- the stack for four weeks, on every device of the household. Null for a recipe nobody put
-- aside. Additive: the app before this keeps working.
alter table public.recipe add column if not exists skipped_at timestamptz;
