-- The kinds of grocery a household buys at one of its supermarkets (shop.aisle_group_ids)
-- now decide the section of a supermarket note a line stands in: Tiefkühl ticked at Aldi
-- puts frozen raspberries under Aldi. An entry of the Merkzettel keeps its kind of grocery,
-- looked up once when it is written like fresh_place, so that the header of every page can
-- name the supermarket without reading the catalog. No foreign key, as with
-- shop.aisle_group_ids: a kind deleted since is ignored when read. Additive: the app before
-- this keeps working.

alter table public.restock_item
  add column if not exists aisle_group_id uuid;
