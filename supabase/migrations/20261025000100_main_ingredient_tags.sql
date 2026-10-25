-- What a dish is made of, as a group of tags of its own: "Hauptzutat". Read from the
-- ingredients and the title (`mainIngredients`), so that the library can be narrowed down
-- by mince, chicken, salmon or lentils. Added to every household, after the kind of dish.

-- Legumes were a tag of "Ernährung", which the library does not show. They join the group.
update public.tag set group_name = 'Hauptzutat', sort_order = 70
where key = 'huelsenfruechte';

-- A tag the household made itself under one of these names becomes that tag, with its
-- recipes: the names are unique per household, so it could not be added beside it.
update public.tag t
set key = added.key, group_name = 'Hauptzutat', sort_order = added.sort_order
from (values
  ('Hackfleisch', 'hackfleisch', 10),
  ('Hähnchen & Pute', 'haehnchen', 20),
  ('Rind & Kalb', 'rind', 30),
  ('Schwein', 'schwein', 40),
  ('Lachs & Forelle', 'lachs', 50),
  ('Garnelen & Meeresfrüchte', 'garnelen', 60),
  ('Tofu & Tempeh', 'tofu', 80),
  ('Pilze', 'pilze', 90),
  ('Eier', 'eier', 100),
  ('Käse', 'kaese', 110)
) as added(name, key, sort_order)
where t.key is null
  and lower(t.name) = lower(added.name)
  and not exists (
    select 1 from public.tag other where other.household_id = t.household_id and other.key = added.key
  );

insert into public.tag (household_id, name, group_name, key, sort_order)
select h.id, added.name, 'Hauptzutat', added.key, added.sort_order
from public.household h
cross join (values
  ('Hackfleisch', 'hackfleisch', 10),
  ('Hähnchen & Pute', 'haehnchen', 20),
  ('Rind & Kalb', 'rind', 30),
  ('Schwein', 'schwein', 40),
  ('Lachs & Forelle', 'lachs', 50),
  ('Garnelen & Meeresfrüchte', 'garnelen', 60),
  ('Hülsenfrüchte', 'huelsenfruechte', 70),
  ('Tofu & Tempeh', 'tofu', 80),
  ('Pilze', 'pilze', 90),
  ('Eier', 'eier', 100),
  ('Käse', 'kaese', 110)
) as added(name, key, sort_order)
where not exists (
  select 1 from public.tag other where other.household_id = h.id and other.key = added.key
)
on conflict do nothing;
