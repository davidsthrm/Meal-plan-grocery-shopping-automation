-- Bread comes from the bakery. The bakery could be chosen for a kind of grocery since
-- 20261018000400, but "Brot & Backwaren" was left at the supermarket, so bread never got a
-- note for the bakery. A household that has not said where its bread comes from gets the
-- bakery; packed bread that keeps longer than five days stays at the supermarket
-- (`BAKERY_FRESH_DAYS`). The settings change it back.
update public.aisle_group
set fresh_place = 'bakery'
where name = 'Brot & Backwaren' and fresh_place is null;
