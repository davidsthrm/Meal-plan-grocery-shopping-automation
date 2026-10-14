-- The amount the household wrote on a line itself: six apples where the plan needs four.
-- It counts in the unit the line shows. amount_instead is what the line showed when it was
-- written (null for a line without an amount): once the plan needs something else, the
-- household's number no longer says anything about it and the line shows the plan's again.
--
-- Applied to the hosted project from other work before it was in this repository, and kept
-- here as it was applied so that the migration history matches. The app does not read these
-- columns: an amount written by hand is shopping_line_state.quantity and unit
-- (20261014190000_amounts_and_supermarkets).
alter table public.shopping_line_state add column if not exists amount numeric check (amount > 0);
alter table public.shopping_line_state add column if not exists amount_instead numeric;
