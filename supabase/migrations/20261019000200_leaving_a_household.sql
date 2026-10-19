-- A member can leave the household, and its admin can remove a member. Only the membership
-- goes: the account stays and sees nothing until it belongs somewhere again. What the member
-- ticked or wrote keeps their id.
--
-- Members may not write the member table themselves, so both are functions that check who
-- is asking. Additive: the app before this keeps working.

-- Whoever made a household is its admin. A household made before this rule without one
-- gets its first member as admin.
update public.household_member m
set role = 'admin'
where not exists (
    select 1 from public.household_member a
    where a.household_id = m.household_id and a.role = 'admin'
  )
  and m.created_at = (
    select min(f.created_at) from public.household_member f where f.household_id = m.household_id
  );

-- The caller leaves their household. The admin cannot: the household would be left with
-- nobody who can remove a member.
create function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  own public.household_role;
begin
  select role into own from public.household_member where user_id = caller;
  if own is null then
    raise exception 'not a member';
  end if;
  if own = 'admin' then
    raise exception 'the admin cannot leave';
  end if;
  delete from public.household_member where user_id = caller;
end;
$$;

-- The admin of a household removes one of its other members.
create function public.remove_household_member(member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
begin
  if member = caller then
    raise exception 'use leave_household to leave';
  end if;
  select m.household_id into target_household
  from public.household_member m
  where m.user_id = member
    and exists (
      select 1 from public.household_member a
      where a.household_id = m.household_id and a.user_id = caller and a.role = 'admin'
    );
  if target_household is null then
    raise exception 'member not found';
  end if;
  delete from public.household_member where household_id = target_household and user_id = member;
end;
$$;

revoke all on function public.leave_household() from public, anon;
revoke all on function public.remove_household_member(uuid) from public, anon;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
