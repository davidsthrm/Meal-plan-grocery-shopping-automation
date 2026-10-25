-- An errand done on another day ("An einem anderen Tag einkaufen"): the note of its own day
-- says on which day it happens instead. The week is then worked out with the errand on that
-- day, so what keeps from Tuesday is bought on Tuesday, and the note of Monday is gone.
-- Null for an errand on its own day. Additive: the app before this keeps working.
alter table public.shopping_list add column if not exists moved_to date;
alter table public.shopping_list drop constraint if exists shopping_list_moved_to_other_day;
alter table public.shopping_list add constraint shopping_list_moved_to_other_day
  check (moved_to is null or moved_to <> shopping_date);
