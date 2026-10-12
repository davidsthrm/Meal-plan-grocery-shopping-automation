-- What to buy for a meal without a recipe: bread, cold cuts and a cucumber for a "Vesper".
-- A food is a name, as on the handwritten list. It may be bought somewhere else than the
-- catalog says for cooking: bread for a cold supper comes from the bakery.
create table public.plan_slot_food (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household on delete cascade,
  plan_slot_id uuid not null,
  label text not null check (nullif(trim(label), '') is not null and char_length(label) <= 60),
  -- The catalog ingredient the label names, if it names one.
  ingredient_id uuid,
  -- Where it is bought for this meal. Null means where the catalog says.
  shop_id uuid,
  position integer not null default 0,
  foreign key (household_id, plan_slot_id) references public.plan_slot (household_id, id) on delete cascade,
  foreign key (household_id, ingredient_id) references public.ingredient (household_id, id),
  foreign key (household_id, shop_id) references public.shop (household_id, id)
);

create unique index plan_slot_food_once_idx on public.plan_slot_food (plan_slot_id, lower(label));

alter table public.plan_slot_food enable row level security;

create policy plan_slot_food_all on public.plan_slot_food for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke all on public.plan_slot_food from anon, authenticated, service_role;
grant select, insert, update, delete on public.plan_slot_food to authenticated, service_role;

-- The butcher and the bakery, for every household that does not have them yet.
insert into public.shop (household_id, name, short_label, sort_order)
select h.id, s.name, s.name, s.sort_order
from public.household h
cross join (values ('Metzger', 3), ('Bäcker', 4)) as s (name, sort_order)
on conflict (household_id, name) do nothing;
