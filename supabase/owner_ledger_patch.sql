create extension if not exists pgcrypto;

alter table public.payments
add column if not exists payment_source text not null default 'spaces_account'
check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

alter table public.cash_ledger
add column if not exists payment_source text
check (payment_source is null or payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

alter table public.cash_ledger
add column if not exists linked_owner_ledger_id uuid;

alter table public.cash_ledger
add column if not exists transfer_group_id uuid;

alter table public.cash_ledger
add column if not exists is_internal_transfer boolean not null default false;

drop policy if exists "Authenticated staff can manage payments" on public.payments;
drop policy if exists "Staff can read payments" on public.payments;
drop policy if exists "Owner can read payments" on public.payments;
create policy "Owner can read payments"
on public.payments for select
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Staff can insert payments" on public.payments;
create policy "Staff can insert payments"
on public.payments for insert
to authenticated
with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
));

drop policy if exists "Staff can update payments" on public.payments;
create policy "Staff can update payments"
on public.payments for update
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
))
with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
));

drop policy if exists "Staff can delete payments" on public.payments;
create policy "Staff can delete payments"
on public.payments for delete
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
));

create table if not exists public.sales_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  customer_name text not null,
  phone text,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_rate integer not null default 0 check (unit_rate >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  payment_source text not null default 'staff' check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner')),
  receipt_date date not null default current_date,
  valid_till date not null default current_date,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('expense', 'receiving')),
  category text,
  source text,
  payment_source text not null default 'abrar_owner' check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner')),
  amount integer not null check (amount >= 0),
  notes text,
  attachment_note text,
  linked_cash_ledger_id uuid references public.cash_ledger(id) on delete set null,
  transfer_group_id uuid,
  is_internal_transfer boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entry_type = 'expense' and category is not null and source is null)
    or
    (entry_type = 'receiving' and source is not null and category is null)
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_ledger_linked_owner_ledger_id_fkey'
  ) then
    alter table public.cash_ledger
    add constraint cash_ledger_linked_owner_ledger_id_fkey
    foreign key (linked_owner_ledger_id) references public.owner_ledger(id) on delete set null;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_ledger_set_updated_at on public.owner_ledger;
create trigger owner_ledger_set_updated_at
before update on public.owner_ledger
for each row execute function public.set_updated_at();

drop trigger if exists sales_receipts_set_updated_at on public.sales_receipts;
create trigger sales_receipts_set_updated_at
before update on public.sales_receipts
for each row execute function public.set_updated_at();

alter table public.sales_receipts enable row level security;
alter table public.owner_ledger enable row level security;

drop policy if exists "Staff can read sales receipts" on public.sales_receipts;
create policy "Staff can read sales receipts"
on public.sales_receipts for select
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
));

drop policy if exists "Staff can insert sales receipts" on public.sales_receipts;
create policy "Staff can insert sales receipts"
on public.sales_receipts for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  )
);

drop policy if exists "Staff can update recent own sales receipts" on public.sales_receipts;
create policy "Staff can update recent own sales receipts"
on public.sales_receipts for update
to authenticated
using (
  exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
      and role in ('owner', 'manager')
  )
  or (
    created_by = auth.uid()
    and created_at >= now() - interval '3 days'
    and exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active = true
    )
  )
)
with check (
  exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
      and role in ('owner', 'manager')
  )
  or (
    created_by = auth.uid()
    and created_at >= now() - interval '3 days'
    and exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active = true
    )
  )
);

drop policy if exists "Owner can read owner ledger" on public.owner_ledger;
create policy "Owner can read owner ledger"
on public.owner_ledger for select
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Owner can insert owner ledger" on public.owner_ledger;
create policy "Owner can insert owner ledger"
on public.owner_ledger for insert
to authenticated
with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Owner can update owner ledger" on public.owner_ledger;
create policy "Owner can update owner ledger"
on public.owner_ledger for update
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
))
with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Owner can delete owner ledger" on public.owner_ledger;
create policy "Owner can delete owner ledger"
on public.owner_ledger for delete
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));
