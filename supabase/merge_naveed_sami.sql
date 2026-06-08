do $$
declare
  keep_id uuid;
  duplicate_id uuid;
begin
  select id
  into keep_id
  from public.members
  where lower(full_name) like '%naveed sami%'
  order by created_at asc
  limit 1;

  select id
  into duplicate_id
  from public.members
  where lower(full_name) like '%naveed%'
    and id is distinct from keep_id
  order by
    case when lower(full_name) = 'naveed' then 0 else 1 end,
    created_at asc
  limit 1;

  if keep_id is null or duplicate_id is null then
    raise notice 'No Naveed/Naveed Sami duplicate pair found.';
    return;
  end if;

  update public.invoices
  set member_id = keep_id
  where member_id = duplicate_id;

  update public.payments
  set member_id = keep_id
  where member_id = duplicate_id;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'member_plan_items'
  ) then
    execute 'update public.member_plan_items set member_id = $1 where member_id = $2'
    using keep_id, duplicate_id;
  end if;

  delete from public.members
  where id = duplicate_id;

  raise notice 'Merged duplicate Naveed member % into Naveed Sami %.', duplicate_id, keep_id;
end $$;
