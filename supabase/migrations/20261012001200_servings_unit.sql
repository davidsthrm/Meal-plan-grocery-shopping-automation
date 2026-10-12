-- What a recipe's amounts are for when that is not persons: one "Springform (Ø 26 cm)",
-- twelve "Muffins", one "Blech". Null means persons, as before.
--
-- Scaled to the persons of a household, a recipe for one cake tin would bake four cakes.
-- A recipe with a unit is planned as written instead.
alter table public.recipe add column servings_unit text;

alter table public.recipe add constraint recipe_servings_unit_valid
  check (
    servings_unit is null
    or (servings_min is not null and btrim(servings_unit) <> '' and char_length(servings_unit) <= 60)
  );
