-- A plan the household is done with is saved: it is shown to read, without the controls for
-- planning. Null while the week is still being planned.
alter table public.week_plan add column saved_at timestamptz;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'week_plan'
    )
  then
    alter publication supabase_realtime add table public.week_plan;
  end if;
end $$;
