-- Parts become the whole (David, 22 November 2026). Recipes ask for a part of something,
-- the household buys the whole: "8 Zehen Knoblauch" is "1 Knolle Knoblauch", "12 Zweige
-- Thymian" are "2 Bund Thymian", the zest of a lemon is a lemon, from organic farming. The
-- yields are estimates; see docs/SHOPPING.md, "Lines and amounts".

alter table public.ingredient
  -- The unit a whole of this ingredient is bought in: Knolle for garlic in Zehen.
  add column whole_unit public.unit,
  -- Bought as another ingredient, in its default unit: the lemon for its zest.
  add column whole_ingredient_id uuid,
  -- How many of a unit one whole gives: {"Zehe": 10}, {"TL": 3, "Stück": 1}.
  add column per_whole jsonb not null default '{}',
  add constraint ingredient_whole_fkey foreign key (household_id, whole_ingredient_id)
    references public.ingredient (household_id, id) on delete set null (whole_ingredient_id);

-- Every household's ingredients, found by their name or another name. A whole that is the
-- ingredient's own unit only where its parts can add up in that unit.
with whole (names, default_unit, whole_unit, per_whole) as (
  values
    (array['knoblauch'], 'Zehe', 'Knolle', '{"Zehe": 10}'),
    (
      array[
        'thymian', 'rosmarin', 'petersilie', 'basilikum', 'minze', 'salbei', 'koriander',
        'dill', 'majoran', 'oregano', 'estragon', 'kerbel'
      ],
      'Bund', 'Bund', '{"Zweig": 10, "Stängel": 10}'
    ),
    (array['frühlingszwiebeln', 'frühlingszwiebel', 'lauchzwiebeln'], 'Bund', 'Bund', '{"Stück": 7}'),
    (array['radieschen'], 'Bund', 'Bund', '{"Stück": 12}')
)
update public.ingredient i
set whole_unit = whole.whole_unit::public.unit, per_whole = whole.per_whole::jsonb
from whole
where i.default_unit = whole.default_unit::public.unit
  and exists (
    select 1 from unnest(array[i.name] || i.synonyms) as n (word) where lower(word) = any (whole.names)
  );

-- Zest is bought as the household's fruit of the same kind. "Schale von 1 Zitrone" and the
-- other names the import made are the zest of one fruit each.
with part (zests, fruits, per_whole) as (
  values
    (
      array[
        'zitronenschale', 'bio-zitronenschale', 'zitronenabrieb', 'schale von 1 zitrone',
        'schalenabrieb einer zitrone', 'schale einer bio-zitrone'
      ],
      array['zitronen', 'zitrone'],
      '{"TL": 3, "Stück": 1}'
    ),
    (array['limettenschale', 'bio-limettenschale', 'limettenabrieb'], array['limetten', 'limette'], '{"TL": 2, "Stück": 1}'),
    (array['orangenschale', 'bio-orangenschale', 'orangenabrieb'], array['orangen', 'orange'], '{"EL": 1, "Stück": 1}')
),
pair as (
  select distinct on (zest.id) zest.id as zest_id, fruit.id as fruit_id, part.per_whole
  from part
  join public.ingredient zest
    on exists (
      select 1 from unnest(array[zest.name] || zest.synonyms) as n (word) where lower(word) = any (part.zests)
    )
  join public.ingredient fruit
    on fruit.household_id = zest.household_id
    and fruit.status = 'active'
    and fruit.default_unit = 'Stück'
    and exists (
      select 1 from unnest(array[fruit.name] || fruit.synonyms) as n (word) where lower(word) = any (part.fruits)
    )
  order by zest.id, lower(fruit.name) = part.fruits[1] desc, fruit.created_at
)
update public.ingredient i
set whole_ingredient_id = pair.fruit_id, per_whole = pair.per_whole::jsonb
from pair
where i.id = pair.zest_id;

-- The household uses bottled lemon and lime juice it has at home: under "Haben wir schon",
-- not bought. Orange juice stays a juice that is bought.
update public.ingredient i
set is_pantry_staple = true
where exists (
  select 1 from unnest(array[i.name] || i.synonyms) as n (word)
  where lower(word) in ('zitronensaft', 'limettensaft')
);
