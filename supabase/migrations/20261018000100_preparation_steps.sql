-- The preparation steps of a recipe, so that the app can replace the cookbook at the stove.
-- Additive: the old column `steps text` from the first schema was never written and stays
-- unused.

-- One entry per printed step, in printed order. Null while nobody has read them yet (recipes
-- imported before this existed); empty when the photos show no steps.
alter table public.recipe add column if not exists prep_steps text[];

-- What could not be read with certainty when the steps of an approved recipe were filled in
-- later, in German. Shown with the steps until a person saves them by hand.
alter table public.recipe add column if not exists prep_steps_doubts text[] not null default '{}';

-- A merge keeps the steps of the kept recipe, or takes the duplicate's where it has none.
create or replace function public.merge_recipes(keep_id uuid, drop_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  kept public.recipe;
  dropped public.recipe;
begin
  if keep_id = drop_id then
    raise exception 'a recipe cannot be merged into itself';
  end if;
  select * into kept from public.recipe where id = keep_id for update;
  select * into dropped from public.recipe where id = drop_id for update;
  if kept.id is null or dropped.id is null then
    raise exception 'recipe not found';
  end if;
  if kept.household_id <> dropped.household_id then
    raise exception 'recipes of different households';
  end if;

  update public.plan_slot_item set recipe_id = keep_id where recipe_id = drop_id;

  update public.plan_extra as k set servings = k.servings + d.servings
  from public.plan_extra as d
  where k.recipe_id = keep_id and d.recipe_id = drop_id and d.week_plan_id = k.week_plan_id;
  delete from public.plan_extra as d
  where d.recipe_id = drop_id
    and exists (
      select 1 from public.plan_extra as k
      where k.week_plan_id = d.week_plan_id and k.recipe_id = keep_id
    );
  update public.plan_extra set recipe_id = keep_id where recipe_id = drop_id;

  update public.recipe set
    is_favorite = kept.is_favorite or dropped.is_favorite,
    -- least() passes over a null: the earlier wish, or the only one.
    wanted_at = least(kept.wanted_at, dropped.wanted_at),
    source_text = coalesce(kept.source_text, dropped.source_text),
    steps = coalesce(kept.steps, dropped.steps),
    -- Steps that were read count, even an empty list; the doubts go with the steps.
    prep_steps = coalesce(kept.prep_steps, dropped.prep_steps),
    prep_steps_doubts = case
      when kept.prep_steps is null and dropped.prep_steps is not null
        then dropped.prep_steps_doubts
      else kept.prep_steps_doubts
    end,
    updated_at = now()
  where id = keep_id;

  insert into public.recipe_tag (household_id, recipe_id, tag_id)
  select link.household_id, keep_id, link.tag_id
  from public.recipe_tag as link
  join public.tag as t on t.id = link.tag_id
  where link.recipe_id = drop_id
    and (
      t.group_name = 'Eigene'
      or (
        t.group_name = 'Kategorie'
        and not exists (
          select 1 from public.recipe_tag as own
          join public.tag as category on category.id = own.tag_id
          where own.recipe_id = keep_id and category.group_name = 'Kategorie'
        )
      )
    )
  on conflict do nothing;

  update public.import_job set status = 'discarded', issues = '[]'
  where recipe_id = drop_id;

  delete from public.recipe where id = drop_id;
end;
$$;

revoke all on function public.merge_recipes(uuid, uuid) from public, anon;
grant execute on function public.merge_recipes(uuid, uuid) to authenticated, service_role;
