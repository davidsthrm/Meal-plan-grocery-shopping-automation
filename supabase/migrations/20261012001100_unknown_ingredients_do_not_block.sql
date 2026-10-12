-- An ingredient the catalog does not know is no longer a reason to review a recipe: the recipe
-- was read correctly, only the catalog is behind. Unknown ingredients are decided in one
-- place, as proposals. Recipes that waited for nothing else are approved here.

with freed as (
  update public.import_job j
  set status = 'approved', issues = '[]'::jsonb, finished_at = coalesce(j.finished_at, now())
  where j.status = 'needs_review'
    and j.recipe_id is not null
    and jsonb_array_length(j.issues) > 0
    and not exists (
      select 1 from jsonb_array_elements(j.issues) issue where issue->>'code' <> 'unmapped_ingredient'
    )
    and exists (
      select 1 from public.recipe r where r.id = j.recipe_id and r.servings_min is not null
    )
  returning j.recipe_id
)
update public.recipe r set status = 'approved'
from freed
where r.id = freed.recipe_id;

-- Recipes that wait for another reason keep waiting, without the entries that no longer count.
update public.import_job j
set issues = (
  select coalesce(jsonb_agg(issue), '[]'::jsonb)
  from jsonb_array_elements(j.issues) issue
  where issue->>'code' <> 'unmapped_ingredient'
)
where j.status = 'needs_review'
  and exists (
    select 1 from jsonb_array_elements(j.issues) issue where issue->>'code' = 'unmapped_ingredient'
  );
