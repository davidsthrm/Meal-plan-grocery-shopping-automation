-- Recipe categories. A category is a tag of the group "Kategorie"; every recipe has at most
-- one. The import assigns it, so the kinds of dishes a cookbook contains must all exist:
-- snacks, desserts, breakfast, drinks and basics were missing.

-- A stable name for tags the app itself refers to. Tags may be renamed by the household;
-- the key stays. Tags the household creates have none.
alter table public.tag add column key text;
create unique index tag_key_idx on public.tag (household_id, key) where key is not null;

update public.tag as t set key = known.key
from (values
  ('Hauptgericht', 'hauptgericht'),
  ('Suppe & Eintopf', 'suppe-eintopf'),
  ('Salat', 'salat'),
  ('Vesper', 'vesper'),
  ('Kuchen & Süßes', 'kuchen'),
  ('Pasta', 'pasta'),
  ('Auflauf', 'auflauf'),
  ('Fleisch', 'fleisch'),
  ('Fisch', 'fisch'),
  ('vegetarisch', 'vegetarisch'),
  ('vegan', 'vegan'),
  ('Hülsenfrüchte', 'huelsenfruechte'),
  ('schnell', 'schnell'),
  ('für Gäste', 'fuer-gaeste')
) as known(name, key)
where t.name = known.name and t.key is null;

-- Desserts get their own category, so this one is about baking only.
update public.tag set name = 'Kuchen & Gebäck' where key = 'kuchen';
update public.tag set group_name = 'Kategorie' where group_name = 'Mahlzeit';

insert into public.tag (household_id, name, group_name, key)
select h.id, added.name, 'Kategorie', added.key
from public.household h
cross join (values
  ('Beilage', 'beilage'),
  ('Snack & Fingerfood', 'snack'),
  ('Dessert & Süßspeise', 'dessert'),
  ('Frühstück', 'fruehstueck'),
  ('Getränk', 'getraenk'),
  ('Soße, Dip & Grundrezept', 'grundrezept')
) as added(name, key)
on conflict do nothing;

-- The order categories are listed in.
update public.tag as t set sort_order = ordered.position
from (values
  ('hauptgericht', 10), ('suppe-eintopf', 20), ('salat', 30), ('beilage', 40), ('vesper', 50),
  ('snack', 60), ('dessert', 70), ('kuchen', 80), ('fruehstueck', 90), ('getraenk', 100),
  ('grundrezept', 110)
) as ordered(key, position)
where t.key = ordered.key;
