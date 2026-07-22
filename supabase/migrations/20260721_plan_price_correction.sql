-- Spaces Coworking — plan catalogue price correction
--
-- Dedicated Desk Plus (the both-shifts desk) is sold at Rs 24,000/month,
-- not the Rs 32,000 that was seeded. Confirmed by the owner on 2026-07-21
-- against the current sales deck.
--
-- This changes the CATALOGUE only, which is the price offered to new
-- signups. Existing members keep the rate they agreed: their figures live
-- on members.standard_monthly_rate / offered_monthly_rate and on their
-- member_plan_items rows, none of which this touches. No invoice, payment
-- or ledger row is affected.
--
-- Safe to run more than once.

begin;

update public.plans
set standard_monthly_rate = 24000,
    updated_at = now()
where name = 'Dedicated Desk Plus'
  and standard_monthly_rate <> 24000;

commit;

-- Verify:
--   select name, standard_monthly_rate from public.plans order by standard_monthly_rate;
--   -- Flexible Desk 15500, Dedicated Desk 17500, Personal Desk 20000,
--   -- Dedicated Desk Plus 24000
