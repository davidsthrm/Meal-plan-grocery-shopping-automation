-- Where the household lives, as far as finding its supermarkets needs it: a German postal
-- code and the place it belongs to ("88471", "Laupheim"). Null until a member enters it;
-- until then the household's supermarkets cannot be chosen.
alter table public.household add column if not exists postal_code text
  check (postal_code ~ '^[0-9]{5}$');
alter table public.household add column if not exists place_name text
  check (place_name is null or char_length(place_name) between 1 and 80);

-- A supermarket found near the household's postal code (OpenStreetMap): its logo
-- (Wikimedia Commons), its street, and the postal code it was found for. Null for the
-- shops of the starting catalog and for ones typed in by hand.
alter table public.shop add column if not exists logo_url text
  check (logo_url is null or logo_url like 'https://%');
alter table public.shop add column if not exists address text
  check (address is null or char_length(address) <= 120);
alter table public.shop add column if not exists found_near text
  check (found_near is null or found_near ~ '^[0-9]{5}$');
