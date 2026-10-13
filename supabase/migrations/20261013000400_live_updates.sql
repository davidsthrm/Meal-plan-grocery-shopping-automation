-- What the household changes on one device shows on the others without reloading: the plan,
-- the shopping lists, the note, favourites and wishes. The browser is told that a row
-- changed and reads the page again. Row level security decides who is told about inserts
-- and updates; of a deleted row only its key is sent.
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
    'plan_slot', 'plan_slot_food', 'plan_extra', 'shopping_manual_entry',
    'shopping_line_state', 'restock_item', 'recipe', 'household'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', name);
    end if;
  end loop;
end $$;
