-- A kind of grocery can be bought at the bakery as well as at the market or the butcher:
-- bread then goes on a note for the bakery on the day of its meal. Widens the check only;
-- older versions read the value as a place gone to on demand, which the bakery is.
alter table public.aisle_group drop constraint if exists aisle_group_fresh_place_check;
alter table public.aisle_group add constraint aisle_group_fresh_place_check
  check (fresh_place in ('market', 'butcher', 'bakery'));

alter table public.restock_item drop constraint if exists restock_item_fresh_place_check;
alter table public.restock_item add constraint restock_item_fresh_place_check
  check (fresh_place in ('market', 'butcher', 'bakery'));
