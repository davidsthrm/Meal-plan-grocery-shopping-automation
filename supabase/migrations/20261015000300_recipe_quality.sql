-- Checking what the import assigned, and merging recipes that are the same dish twice.

-- The fields of a recipe a person confirmed or set since the import: its kind ("protein"),
-- its category, its time and its servings. The check of the library leaves them alone.
alter table public.recipe add column if not exists checked_fields text[] not null default '{}'
  check (checked_fields <@ array['protein', 'category', 'time', 'servings']::text[]);

-- Two recipes that look like duplicates and are not: the household decided to keep both.
-- Stored with the smaller id first, so that a pair has one row.
create table public.recipe_pair_kept (
  household_id uuid not null references public.household on delete cascade,
  recipe_a uuid not null,
  recipe_b uuid not null,
  created_at timestamptz not null default now(),
  primary key (recipe_a, recipe_b),
  constraint recipe_pair_kept_order check (recipe_a < recipe_b),
  foreign key (household_id, recipe_a) references public.recipe (household_id, id) on delete cascade,
  foreign key (household_id, recipe_b) references public.recipe (household_id, id) on delete cascade
);

alter table public.recipe_pair_kept enable row level security;

create policy recipe_pair_kept_all on public.recipe_pair_kept for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.recipe_pair_kept from anon, authenticated, service_role;
grant select, insert, update, delete on public.recipe_pair_kept to authenticated, service_role;

-- Merges a duplicate into the recipe that is kept, in one transaction, and deletes the
-- duplicate. Nothing the household did with the duplicate is lost:
-- - every meal it was planned for, past and future, now has the kept recipe, so its history
--   and the shopping lists stay as they were;
-- - an extra of a week moves too; where both were extras of one week, the servings add up;
-- - a favourite or a wish to cook it carries over;
-- - the household's own tags, and its category where the kept recipe has none, carry over;
-- - a pasted text or steps the kept recipe lacks carry over.
-- The import job that read the duplicate is marked as discarded: its recipe is gone.
-- Runs with the caller's rights, so row level security decides whose recipes these can be.
create function public.merge_recipes(keep_id uuid, drop_id uuid)
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
