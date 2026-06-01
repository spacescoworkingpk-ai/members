create extension if not exists pgcrypto;

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
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  ('Flexible Desk', 'individual', 1, 18000),
  ('Dedicated Desk', 'individual', 1, 25000),
  ('Dedicated Desk Plus', 'individual', 1, 32000),
  ('Personal Desk', 'individual', 1, 38000),
  ('Cubicle', 'room', 4, 85000),
  ('Room 5', 'room', 5, 120000),
  ('Room 7', 'room', 7, 160000),
  ('Room 7 Plus', 'room', 7, 175000),
  ('Room 11', 'room', 11, 240000),
  ('Executive / Manager Room', 'room', 1, 210000)
on conflict (name) do update set
  category = excluded.category,
  default_seats = excluded.default_seats,
  standard_monthly_rate = excluded.standard_monthly_rate,
  active = true,
  updated_at = now();

alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Authenticated staff can manage plans" on public.plans;
create policy "Authenticated staff can manage plans"
on public.plans for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can manage members" on public.members;
create policy "Authenticated staff can manage members"
on public.members for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can manage invoices" on public.invoices;
create policy "Authenticated staff can manage invoices"
on public.invoices for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can manage invoice items" on public.invoice_items;
create policy "Authenticated staff can manage invoice items"
on public.invoice_items for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can manage payments" on public.payments;
create policy "Authenticated staff can manage payments"
on public.payments for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can manage expenses" on public.expenses;
create policy "Authenticated staff can manage expenses"
on public.expenses for all
to authenticated
using (true)
with check (true);

