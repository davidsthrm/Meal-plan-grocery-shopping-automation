-- Where the household shops: a supermarket, the market, the butcher, the bakery. A shopping
-- day names the places it goes to, and every place on a day has a note of its own.

-- What kind of place a shop is. A food bought "beim Bäcker" goes on the bakery's note.
alter table public.shop add column kind text not null default 'supermarket'
  check (kind in ('supermarket', 'market', 'butcher', 'bakery'));
update public.shop set kind = 'butcher' where name = 'Metzger';
update public.shop set kind = 'bakery' where name = 'Bäcker';

-- Where a kind of grocery is bought fresh when a shopping day goes there. Null: at the
-- supermarket. This replaces the yes or no of is_market, which no released version read.
alter table public.aisle_group add column fresh_place text
  check (fresh_place in ('market', 'butcher'));
update public.aisle_group
set fresh_place = case when name = 'Fleisch & Wurst' then 'butcher' else 'market' end
where is_market;
alter table public.aisle_group drop column is_market;

-- A list belongs to a place on a day. The bakery has no day: its note belongs to a week and
-- is stored under that week's Monday.
alter table public.shopping_list add column place text not null default 'supermarket'
  check (place in ('supermarket', 'market', 'butcher', 'bakery'));
update public.shopping_list set place = 'market' where extract(isodow from shopping_date) = 6;
alter table public.shopping_list drop constraint shopping_list_one_per_day;
alter table public.shopping_list
  add constraint shopping_list_one_per_note unique (household_id, shopping_date, place);

-- A line the household decided to buy on another errand: the note it was moved to. The row
-- belongs to the note the line would be on by itself.
alter table public.shopping_line_state add column moved_date date;
alter table public.shopping_line_state add column moved_place text
  check (moved_place in ('supermarket', 'market', 'butcher', 'bakery'));
alter table public.shopping_line_state
  add constraint shopping_line_state_moved check ((moved_date is null) = (moved_place is null));

-- The weekdays the household shops on, and where: [{"weekday": 1, "places": ["supermarket"]}].
-- Null: the app's own.
alter table public.household add column shopping_days jsonb;

-- Where an entry of the note for what ran out is bought fresh, looked up when it is written.
alter table public.restock_item add column fresh_place text
  check (fresh_place in ('market', 'butcher'));
