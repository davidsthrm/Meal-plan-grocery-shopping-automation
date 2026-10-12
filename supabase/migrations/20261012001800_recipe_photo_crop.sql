-- A recipe's own view of its page: the part of the page photo that shows this recipe, as a
-- file of its own. Null means the whole page is the recipe's view. framed_at says that the
-- page has been looked at for this: turned upright if it lay on its side, and cut where it
-- shows more than one recipe.
alter table public.recipe_photo add column crop_path text;
alter table public.recipe_photo add column framed_at timestamptz;

create index recipe_photo_unframed_idx on public.recipe_photo (household_id) where framed_at is null;
