with actor as (
  select user_id
  from public.staff_profiles
  where active = true
  order by
    case role
      when 'owner' then 0
      when 'manager' then 1
      else 2
    end,
    created_at asc
  limit 1
)
insert into public.cash_ledger (
  entry_date,
  entry_type,
  category,
  source,
  person_name,
  amount,
  notes,
  created_by
)
select
  '2026-06-08'::date,
  'receiving',
  null,
  'Balance',
  'Abrar',
  500,
  'Balance adjustment to bring staff cash in hand to Rs5,200',
  user_id
from actor;

select
  sum(case when entry_type = 'receiving' then amount else -amount end) as staff_cash_balance
from public.cash_ledger;
