-- What a recipe is like beyond its category: how much work it is, what kind of dish it is,
-- its cuisine, season and occasion. These tags are suggestions; the household changes them
-- per recipe. The week plan goes by "Aufwand" to keep long cooking out of workdays.

-- A recipe someone wants to cook soon. It is suggested first and the mark goes once the
-- recipe is on a plan.
alter table public.recipe add column wanted_at timestamptz;
-- The text a recipe was pasted from, kept as it was.
alter table public.recipe add column source_text text;

-- Tidy what the first seed brought along.
update public.tag set name = 'Schnell', sort_order = 10 where key = 'schnell';
update public.tag set name = 'Für Gäste', group_name = 'Anlass', sort_order = 10
where key = 'fuer-gaeste';
update public.tag set name = 'Pasta & Nudeln', group_name = 'Gericht', sort_order = 10
where key = 'pasta';
update public.tag set name = 'Auflauf & Gratin', group_name = 'Gericht', sort_order = 40
where key = 'auflauf';
-- These two say what the recipe's protein says already.
update public.tag set group_name = 'Ernährung' where key in ('fleisch', 'fisch');

insert into public.tag (household_id, name, group_name, key, sort_order)
select h.id, added.name, added.group_name, added.key, added.sort_order
from public.household h
cross join (values
  ('Schnell', 'Aufwand', 'schnell', 10),
  ('Alltagsküche', 'Aufwand', 'alltag', 20),
  ('Braucht Zeit', 'Aufwand', 'aufwendig', 30),
  ('Pasta & Nudeln', 'Gericht', 'pasta', 10),
  ('Reis & Getreide', 'Gericht', 'reis', 20),
  ('Kartoffelgericht', 'Gericht', 'kartoffeln', 30),
  ('Auflauf & Gratin', 'Gericht', 'auflauf', 40),
  ('Pizza, Quiche & Flammkuchen', 'Gericht', 'pizza', 50),
  ('Pfannengericht', 'Gericht', 'pfanne', 60),
  ('Aus dem Ofen', 'Gericht', 'ofen', 70),
  ('Burger, Wraps & Sandwiches', 'Gericht', 'burger', 80),
  ('Deutsch & Schwäbisch', 'Küche', 'deutsch', 10),
  ('Italienisch', 'Küche', 'italienisch', 20),
  ('Mediterran', 'Küche', 'mediterran', 30),
  ('Asiatisch', 'Küche', 'asiatisch', 40),
  ('Orientalisch', 'Küche', 'orientalisch', 50),
  ('Amerikanisch & Tex-Mex', 'Küche', 'amerikanisch', 60),
  ('Frühling', 'Saison', 'fruehling', 10),
  ('Sommer', 'Saison', 'sommer', 20),
  ('Herbst', 'Saison', 'herbst', 30),
  ('Winter', 'Saison', 'winter', 40),
  ('Für Gäste', 'Anlass', 'fuer-gaeste', 10),
  ('Sonntag & Feiertag', 'Anlass', 'fest', 20),
  ('Grillen', 'Anlass', 'grillen', 30),
  ('Zum Mitnehmen', 'Anlass', 'mitnehmen', 40),
  ('Weihnachten', 'Anlass', 'weihnachten', 50)
) as added(name, group_name, key, sort_order)
on conflict do nothing;
