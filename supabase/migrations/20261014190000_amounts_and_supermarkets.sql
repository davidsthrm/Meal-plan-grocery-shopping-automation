-- An amount the household wrote over the one the plan works out, for one line of one note:
-- "5x Karotten" where the recipes need two. Null: the plan's.
alter table public.shopping_line_state add column if not exists quantity numeric
  check (quantity > 0 and quantity < 100000);
alter table public.shopping_line_state add column if not exists unit public.unit;
alter table public.shopping_line_state drop constraint if exists shopping_line_state_amount;
alter table public.shopping_line_state add constraint shopping_line_state_amount
  check ((quantity is null) = (unit is null));

-- The household's supermarkets in the order it likes them: 1 is the main one, where every
-- supermarket line is bought unless the household moves it to another one for a week
-- (shopping_line_state.shop_id). Null: not one of them.
alter table public.shop add column if not exists supermarket_rank smallint
  check (supermarket_rank >= 1);
alter table public.shop drop constraint if exists shop_supermarket_rank_kind;
alter table public.shop add constraint shop_supermarket_rank_kind
  check (supermarket_rank is null or kind = 'supermarket');
