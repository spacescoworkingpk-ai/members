create table if not exists public.member_plan_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  plan_id uuid references public.plans(id),
  plan_name text not null,
  category text not null check (category in ('individual', 'room')),
  seats integer not null default 1 check (seats > 0),
  standard_monthly_rate integer not null default 0 check (standard_monthly_rate >= 0),
  offered_monthly_rate integer not null default 0 check (offered_monthly_rate >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists member_plan_items_set_updated_at on public.member_plan_items;
create trigger member_plan_items_set_updated_at
before update on public.member_plan_items
for each row execute function public.set_updated_at();

alter table public.member_plan_items enable row level security;

drop policy if exists "Staff can read member plan items" on public.member_plan_items;
create policy "Staff can read member plan items"
on public.member_plan_items for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert member plan items" on public.member_plan_items;
create policy "Staff can insert member plan items"
on public.member_plan_items for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update member plan items" on public.member_plan_items;
create policy "Staff can update member plan items"
on public.member_plan_items for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete member plan items" on public.member_plan_items;
create policy "Staff can delete member plan items"
on public.member_plan_items for delete
to authenticated
using (public.is_active_staff());

with target_members as (
  select
    id,
    case
      when lower(full_name) like '%waleed%' then 'waleed'
      when lower(full_name) like '%naveed%' then 'naveed'
    end as key_name
  from public.members
  where lower(full_name) like '%waleed%'
     or lower(full_name) like '%naveed%'
),
deleted as (
  delete from public.member_plan_items mpi
  using target_members tm
  where mpi.member_id = tm.id
),
line_data as (
  select tm.id as member_id, p.id as plan_id, 'Dedicated Desk'::text as plan_name, 'individual'::text as category, 1 as seats,
         17500 as standard_monthly_rate,
         case when tm.key_name = 'waleed' then 16500 else 15000 end as offered_monthly_rate,
         0 as sort_order
  from target_members tm
  left join public.plans p on lower(p.name) = lower('Dedicated Desk')
  union all
  select tm.id as member_id, p.id as plan_id, 'Flexible Desk'::text as plan_name, 'individual'::text as category, 1 as seats,
         15500 as standard_monthly_rate,
         case when tm.key_name = 'waleed' then 15000 else 13000 end as offered_monthly_rate,
         1 as sort_order
  from target_members tm
  left join public.plans p on lower(p.name) = lower('Flexible Desk')
)
insert into public.member_plan_items (
  member_id,
  plan_id,
  plan_name,
  category,
  seats,
  standard_monthly_rate,
  offered_monthly_rate,
  sort_order
)
select
  member_id,
  plan_id,
  plan_name,
  category,
  seats,
  standard_monthly_rate,
  offered_monthly_rate,
  sort_order
from line_data;

update public.members m
set
  plan_id = p.id,
  plan_name = 'Dedicated Desk',
  seats = 2,
  standard_monthly_rate = 33000,
  offered_monthly_rate = case
    when lower(m.full_name) like '%waleed%' then 31500
    when lower(m.full_name) like '%naveed%' then 28000
    else offered_monthly_rate
  end,
  discount_reason = coalesce(discount_reason, 'Bundled dedicated + flexible desk rate')
from public.plans p
where lower(p.name) = lower('Dedicated Desk')
  and (lower(m.full_name) like '%waleed%' or lower(m.full_name) like '%naveed%');
