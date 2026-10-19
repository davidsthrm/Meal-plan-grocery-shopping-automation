-- Everything the family shares tells an open page that it changed, not only the plan and
-- the notes: the recipes of a meal, tags, the catalog, the kinds of grocery, the shops, and
-- who belongs to the household. Row level security decides who is told about inserts and
-- updates; of a deleted row only its key is sent, and the page takes nothing else from it.
--
-- The publication exists on Supabase. An embedded Postgres for tests has none.
do $$
declare
  name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach name in array array[
    'plan_slot_item', 'recipe_tag', 'tag', 'ingredient', 'aisle_group', 'shop',
    'household_member', 'household_invite'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', name);
    end if;
  end loop;
end $$;
