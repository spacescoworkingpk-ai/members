create extension if not exists pgcrypto;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('individual', 'room')),
  default_seats integer not null default 1 check (default_seats > 0),
  standard_monthly_rate integer not null default 0 check (standard_monthly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  phone text not null,
  email text,
  plan_id uuid references public.plans(id),
  plan_name text not null,
  seats integer not null default 1 check (seats > 0),
  joining_date date not null,
  renewal_date date not null,
  standard_monthly_rate integer not null default 0 check (standard_monthly_rate >= 0),
  offered_monthly_rate integer not null default 0 check (offered_monthly_rate >= 0),
  deposit_amount integer not null default 0 check (deposit_amount >= 0),
  discount_reason text,
  notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  member_id uuid not null references public.members(id) on delete cascade,
  invoice_type text not null default 'membership' check (invoice_type in ('membership', 'edited', 'deposit', 'adjustment')),
  issue_date date not null default current_date,
  valid_till date not null,
  standard_amount integer not null default 0 check (standard_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  subtotal_amount integer not null default 0 check (subtotal_amount >= 0),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  edit_note text,
  whatsapp_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price integer not null default 0 check (unit_price >= 0),
  amount integer not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  paid_at timestamptz not null default now(),
  amount integer not null check (amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank_transfer', 'card', 'easypaisa', 'jazzcash', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

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

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  vendor text,
  amount integer not null check (amount >= 0),
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('expense', 'receiving')),
  category text,
  source text,
  person_name text,
  amount integer not null check (amount >= 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entry_type = 'expense' and category is not null and source is null)
    or
    (entry_type = 'receiving' and source is not null and category is null)
  )
);

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

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = auth.uid()
      and active = true
      and role in ('owner', 'manager')
  );
$$;

drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists member_plan_items_set_updated_at on public.member_plan_items;
create trigger member_plan_items_set_updated_at
before update on public.member_plan_items
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists sales_receipts_set_updated_at on public.sales_receipts;
create trigger sales_receipts_set_updated_at
before update on public.sales_receipts
for each row execute function public.set_updated_at();

drop trigger if exists cash_ledger_set_updated_at on public.cash_ledger;
create trigger cash_ledger_set_updated_at
before update on public.cash_ledger
for each row execute function public.set_updated_at();

drop trigger if exists owner_ledger_set_updated_at on public.owner_ledger;
create trigger owner_ledger_set_updated_at
before update on public.owner_ledger
for each row execute function public.set_updated_at();

insert into public.plans (name, category, default_seats, standard_monthly_rate)
values
  ('Flexible Desk', 'individual', 1, 15500),
  ('Dedicated Desk', 'individual', 1, 17500),
  ('Dedicated Desk Plus', 'individual', 1, 32000),
  ('Personal Desk', 'individual', 1, 20000),
  ('Room 01 - 05 persons', 'room', 5, 92500),
  ('Room 02 - 11 persons', 'room', 11, 203500),
  ('Room 03 - 7 persons', 'room', 7, 129500),
  ('Room 04 - 7 persons', 'room', 7, 129500),
  ('Cubicle - 4 persons', 'room', 4, 74000),
  ('Executive Room', 'room', 1, 18500)
on conflict (name) do update set
  category = excluded.category,
  default_seats = excluded.default_seats,
  standard_monthly_rate = excluded.standard_monthly_rate,
  active = true,
  updated_at = now();

update public.plans
set active = false,
    updated_at = now()
where name in ('Cubicle', 'Room 5', 'Room 7', 'Room 7 Plus', 'Room 11', 'Executive / Manager Room');

alter table public.staff_profiles enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.member_plan_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.sales_receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.owner_ledger enable row level security;

drop policy if exists "Staff can read their own profile" on public.staff_profiles;
create policy "Staff can read their own profile"
on public.staff_profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Staff admins can read staff profiles" on public.staff_profiles;
create policy "Staff admins can read staff profiles"
on public.staff_profiles for select
to authenticated
using (public.is_staff_admin());

drop policy if exists "Staff admins can insert staff profiles" on public.staff_profiles;
create policy "Staff admins can insert staff profiles"
on public.staff_profiles for insert
to authenticated
with check (public.is_staff_admin());

drop policy if exists "Staff admins can update staff profiles" on public.staff_profiles;
create policy "Staff admins can update staff profiles"
on public.staff_profiles for update
to authenticated
using (public.is_staff_admin())
with check (public.is_staff_admin());

drop policy if exists "Authenticated staff can manage plans" on public.plans;
drop policy if exists "Staff can read plans" on public.plans;
create policy "Staff can read plans"
on public.plans for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert plans" on public.plans;
create policy "Staff can insert plans"
on public.plans for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update plans" on public.plans;
create policy "Staff can update plans"
on public.plans for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete plans" on public.plans;
create policy "Staff can delete plans"
on public.plans for delete
to authenticated
using (public.is_active_staff());

drop policy if exists "Authenticated staff can manage members" on public.members;
drop policy if exists "Staff can read members" on public.members;
create policy "Staff can read members"
on public.members for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert members" on public.members;
create policy "Staff can insert members"
on public.members for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update members" on public.members;
create policy "Staff can update members"
on public.members for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete members" on public.members;
create policy "Staff can delete members"
on public.members for delete
to authenticated
using (public.is_active_staff());

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

drop policy if exists "Authenticated staff can manage invoices" on public.invoices;
drop policy if exists "Staff can read invoices" on public.invoices;
create policy "Staff can read invoices"
on public.invoices for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert invoices" on public.invoices;
create policy "Staff can insert invoices"
on public.invoices for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update invoices" on public.invoices;
create policy "Staff can update invoices"
on public.invoices for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete invoices" on public.invoices;
create policy "Staff can delete invoices"
on public.invoices for delete
to authenticated
using (public.is_active_staff());

drop policy if exists "Authenticated staff can manage invoice items" on public.invoice_items;
drop policy if exists "Staff can read invoice items" on public.invoice_items;
create policy "Staff can read invoice items"
on public.invoice_items for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert invoice items" on public.invoice_items;
create policy "Staff can insert invoice items"
on public.invoice_items for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update invoice items" on public.invoice_items;
create policy "Staff can update invoice items"
on public.invoice_items for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete invoice items" on public.invoice_items;
create policy "Staff can delete invoice items"
on public.invoice_items for delete
to authenticated
using (public.is_active_staff());

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
with check (public.is_active_staff());

drop policy if exists "Staff can update payments" on public.payments;
create policy "Staff can update payments"
on public.payments for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete payments" on public.payments;
create policy "Staff can delete payments"
on public.payments for delete
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can read sales receipts" on public.sales_receipts;
create policy "Staff can read sales receipts"
on public.sales_receipts for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert sales receipts" on public.sales_receipts;
create policy "Staff can insert sales receipts"
on public.sales_receipts for insert
to authenticated
with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "Staff can update recent own sales receipts" on public.sales_receipts;
create policy "Staff can update recent own sales receipts"
on public.sales_receipts for update
to authenticated
using (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
)
with check (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
);

drop policy if exists "Authenticated staff can manage expenses" on public.expenses;
drop policy if exists "Staff can read expenses" on public.expenses;
create policy "Staff can read expenses"
on public.expenses for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert expenses" on public.expenses;
create policy "Staff can insert expenses"
on public.expenses for insert
to authenticated
with check (public.is_active_staff());

drop policy if exists "Staff can update expenses" on public.expenses;
create policy "Staff can update expenses"
on public.expenses for update
to authenticated
using (public.is_active_staff())
with check (public.is_active_staff());

drop policy if exists "Staff can delete expenses" on public.expenses;
create policy "Staff can delete expenses"
on public.expenses for delete
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can read cash ledger" on public.cash_ledger;
create policy "Staff can read cash ledger"
on public.cash_ledger for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can insert cash ledger" on public.cash_ledger;
create policy "Staff can insert cash ledger"
on public.cash_ledger for insert
to authenticated
with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "Staff can update recent own cash ledger" on public.cash_ledger;
create policy "Staff can update recent own cash ledger"
on public.cash_ledger for update
to authenticated
using (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
)
with check (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
);

drop policy if exists "Staff admins can delete cash ledger" on public.cash_ledger;
create policy "Staff admins can delete cash ledger"
on public.cash_ledger for delete
to authenticated
using (public.is_staff_admin());

drop policy if exists "Owner can read owner ledger" on public.owner_ledger;
create policy "Owner can read owner ledger"
on public.owner_ledger for select
to authenticated
using (public.is_staff_admin() and exists (
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
