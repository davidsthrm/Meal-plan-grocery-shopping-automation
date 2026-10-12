-- Photos that show several recipes at once (a double page with four recipes) have small print.
-- They are read from enlarged parts of the photo, which needs the photo at full size.

-- A clean full-size copy of the photo, kept only until the recipes on it are read.
alter table public.import_page add column full_path text;

-- Which recipe of a shared photo a job is about: the n-th of how many, in reading order.
-- A title alone cannot say that when the recipe's title is not on the photo.
alter table public.import_job add column focus_position smallint;
alter table public.import_job add column focus_count smallint;
