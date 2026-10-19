-- Where a supermarket stands, for the small map on the settings page, and what the
-- household buys there: kinds of grocery such as "Eier" or "Obst & Gemüse". Both are
-- information for the household; which note a line goes on does not depend on them.
-- Additive: the app before this keeps working.

alter table public.shop
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lon double precision check (lon between -180 and 180),
  -- The kinds of grocery (aisle_group ids) the household buys at this shop. Ids of a kind
  -- that was deleted since are ignored when read.
  add column if not exists aisle_group_ids uuid[] not null default '{}';

alter table public.shop
  add constraint shop_position_whole check ((lat is null) = (lon is null));
