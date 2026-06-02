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

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
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
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Staff can read their own profile" on public.staff_profiles;
create policy "Staff can read their own profile"
on public.staff_profiles for select
to authenticated
using (user_id = auth.uid());

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
create policy "Staff can read payments"
on public.payments for select
to authenticated
using (public.is_active_staff());

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
