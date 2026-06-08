begin;

delete from public.cash_ledger;

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
select *
from (
  values
    ('2026-06-01'::date, 'receiving', null, 'Owner transfer - Abrar', 'Abrar', 20000, 'Amount received - Abrar'),
    ('2026-06-02'::date, 'receiving', null, 'Day Pass', null, 2000, 'Daily pass'),
    ('2026-06-08'::date, 'receiving', null, 'Balance', 'Abrar', 500, 'Balance adjustment to bring staff cash in hand to Rs5,200'),
    ('2026-06-01'::date, 'expense', 'Generator petrol', null, null, 3500, 'petrol'),
    ('2026-06-01'::date, 'expense', 'Cleaning', null, null, 1500, 'washing stuffs'),
    ('2026-06-02'::date, 'expense', 'Office Supplies', null, null, 9500, 'tea and coffee'),
    ('2026-06-03'::date, 'expense', 'Cleaning', null, null, 1500, 'kingtox, air freshner, scoth brite, soaps, phenyl'),
    ('2026-06-04'::date, 'expense', 'Maintenance building', null, null, 300, 'LED bulb'),
    ('2026-06-04'::date, 'expense', 'Maintenance building', null, null, 1000, 'muslim showers')
) as rows(entry_date, entry_type, category, source, person_name, amount, notes)
cross join actor;

commit;

select
  sum(case when entry_type = 'receiving' then amount else -amount end) as staff_cash_balance
from public.cash_ledger;
