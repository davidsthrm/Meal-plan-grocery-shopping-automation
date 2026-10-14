-- The drugstore (dm) is a place of its own with a note every week. The meal plan puts nothing
-- on it: the household writes on it what it needs, how many, and for whom.

alter table public.shopping_list drop constraint if exists shopping_list_place_check;
alter table public.shopping_list add constraint shopping_list_place_check
  check (place in ('supermarket', 'market', 'butcher', 'bakery', 'drugstore'));

alter table public.shopping_line_state drop constraint if exists shopping_line_state_moved_place_check;
alter table public.shopping_line_state add constraint shopping_line_state_moved_place_check
  check (moved_place in ('supermarket', 'market', 'butcher', 'bakery', 'drugstore'));

-- How many of a line written by hand, and for whom: "2 Duschgel für Lena". Null when not said.
alter table public.shopping_manual_entry add column if not exists quantity integer
  check (quantity between 1 and 99);
alter table public.shopping_manual_entry add column if not exists for_whom text
  check (for_whom is null or char_length(for_whom) between 1 and 40);

-- The weekday the household goes to the drugstore, 1 for Monday. Null: the app's own,
-- Saturday. Kept apart from shopping_days, which versions before this one read strictly.
alter table public.household add column if not exists drugstore_weekday smallint
  check (drugstore_weekday between 1 and 7);
