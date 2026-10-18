-- Every photo of a household lies in its own folder of the bucket: "<household id>/...".
-- The server signs view links for, downloads and removes whatever path a row names, with
-- the secret key. A member can write these rows directly, so a row naming a path in
-- another household's folder would hand out that household's photo. It must not exist.

create function private.in_household_folder(path text, household uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select path is null or (path like household::text || '/%' and position('..' in path) = 0);
$$;

create function private.all_in_household_folder(paths text[], household uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(private.in_household_folder(path, household)), true)
  from unnest(paths) as path;
$$;

-- A check runs with the rights of whoever writes the row, the server included.
grant usage on schema private to service_role;
grant execute on function private.in_household_folder(text, uuid) to authenticated, service_role;
grant execute on function private.all_in_household_folder(text[], uuid) to authenticated, service_role;

alter table public.recipe_photo
  add constraint recipe_photo_in_household_folder check (
    private.in_household_folder(storage_path, household_id)
    and private.in_household_folder(crop_path, household_id)
  );

alter table public.import_page
  add constraint import_page_in_household_folder check (
    private.in_household_folder(original_path, household_id)
    and private.in_household_folder(photo_path, household_id)
    and private.in_household_folder(full_path, household_id)
  );

alter table public.import_job
  add constraint import_job_in_household_folder check (
    private.all_in_household_folder(photo_paths, household_id)
  );
