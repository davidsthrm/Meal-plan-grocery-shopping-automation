-- The edition of a magazine a recipe comes from. `source_book` names the magazine, the
-- stack all its editions are in ("Einfach Hausgemacht"); `source_edition` the edition
-- ("06/2020", "Jahresheft 2021"). Null for a cookbook. Additive: older versions read
-- `source_book` alone and see the magazine.
alter table public.recipe add column if not exists source_edition text;

-- A batch of photos from one edition: its folder's name, as the upload found it.
alter table public.import_batch add column if not exists source_edition text;
