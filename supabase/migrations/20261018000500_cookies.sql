-- Biscuits and cookies are a category of their own, beside cakes: Plätzchen are baked by the
-- piece, by the tray, and come out at Christmas. Added to every household, after the cakes.
insert into public.tag (household_id, name, group_name, key, sort_order)
select h.id, 'Plätzchen & Kekse', 'Kategorie', 'plaetzchen', 85
from public.household h
on conflict do nothing;
