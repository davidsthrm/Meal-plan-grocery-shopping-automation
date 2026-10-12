-- The things a cold supper usually needs that the catalog did not have. Without an entry
-- they would be listed under "Sonstiges" instead of with the meat or the dairy.
insert into public.ingredient
  (household_id, name, synonyms, aisle_group_id, preferred_shop_id, default_unit, buying_mode, shelf_life_days)
select h.id, food.name, food.synonyms, aisle.id, shop.id, 'g', 'none', food.shelf_life_days
from public.household h
cross join (values
  ('Frischwurst', array['Aufschnitt', 'Wurstaufschnitt'], 'Fleisch & Wurst', 'Metzger', 4),
  ('Fleischsalat', array[]::text[], 'Fleisch & Wurst', 'Metzger', 4),
  ('Käse', array['Schnittkäse'], 'Molkerei & Kühlregal', null, 14)
) as food (name, synonyms, aisle, shop, shelf_life_days)
join public.aisle_group aisle on aisle.household_id = h.id and aisle.name = food.aisle
join lateral (
  -- The named shop if the household has it, otherwise where it shops by default.
  select s.id
  from public.shop s
  where s.household_id = h.id
  order by (s.name = food.shop) desc nulls last, s.is_default desc, s.sort_order
  limit 1
) shop on true
on conflict (household_id, lower(name)) do nothing;
