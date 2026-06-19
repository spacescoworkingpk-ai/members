create extension if not exists pgcrypto;

alter table public.payments
add column if not exists payment_source text not null default 'spaces_account'
check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

alter table public.cash_ledger
add column if not exists payment_source text
check (payment_source is null or payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

alter table public.cash_ledger
add column if not exists payment_method text
check (payment_method is null or payment_method in ('petty_cash', 'business_card', 'business_bank_transfer', 'owner_personal', 'cash', 'card'));

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

create table if not exists public.transaction_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text not null,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  details jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.transaction_audit
alter column record_id type text using record_id::text;

alter table public.transaction_audit
add column if not exists before_data jsonb;

alter table public.transaction_audit
add column if not exists after_data jsonb;

drop function if exists public.record_membership_payment(uuid, integer, text, date, date, text);
create or replace function public.record_membership_payment(
  p_member_id uuid,
  p_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_note text default null
)
returns table(invoice_id uuid, invoice_number text, payment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_payment_id uuid;
  v_standard integer;
  v_discount integer;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  ) then
    raise exception 'Active staff login required';
  end if;

  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  select * into v_member
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'Member not found';
  end if;

  v_standard := greatest(coalesce(v_member.standard_monthly_rate, p_amount), p_amount);
  v_discount := greatest(v_standard - p_amount, 0);
  v_invoice_number := 'SC-' || to_char(coalesce(p_receipt_date, current_date), 'YYYY') || '-' ||
    upper(substr(replace(p_member_id::text, '-', ''), 1, 6)) || '-' ||
    to_char(clock_timestamp(), 'HH24MISSMS');

  insert into public.invoices (
    invoice_number,
    member_id,
    invoice_type,
    issue_date,
    valid_till,
    standard_amount,
    discount_amount,
    subtotal_amount,
    tax_amount,
    total_amount,
    status,
    edit_note
  )
  values (
    v_invoice_number,
    p_member_id,
    'membership',
    coalesce(p_receipt_date, current_date),
    p_valid_till,
    v_standard,
    v_discount,
    p_amount,
    0,
    p_amount,
    'paid',
    p_note
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    amount
  )
  values (
    v_invoice_id,
    coalesce(v_member.plan_name, p_note, 'Membership receipt'),
    greatest(coalesce(v_member.seats, 1), 1),
    case
      when greatest(coalesce(v_member.seats, 1), 1) > 0 then floor(p_amount / greatest(coalesce(v_member.seats, 1), 1))::integer
      else p_amount
    end,
    p_amount
  );

  insert into public.payments (
    invoice_id,
    member_id,
    amount,
    payment_method,
    payment_source,
    reference,
    notes
  )
  values (
    v_invoice_id,
    p_member_id,
    p_amount,
    'cash',
    p_payment_source,
    v_invoice_number,
    p_note
  )
  returning id into v_payment_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (
      entry_date,
      entry_type,
      category,
      source,
      person_name,
      amount,
      notes,
      payment_source,
      is_internal_transfer,
      created_by
    )
    values (
      coalesce(p_receipt_date, current_date),
      'receiving',
      null,
      'Membership receipt',
      v_member.full_name,
      p_amount,
      v_invoice_number || ' | ' || coalesce(v_member.plan_name, ''),
      p_payment_source,
      false,
      auth.uid()
    );
  else
    insert into public.owner_ledger (
      entry_date,
      entry_type,
      category,
      source,
      payment_source,
      amount,
      notes,
      is_internal_transfer,
      created_by
    )
    values (
      coalesce(p_receipt_date, current_date),
      'receiving',
      null,
      'Membership receipt',
      p_payment_source,
      p_amount,
      v_invoice_number || ' | ' || coalesce(v_member.plan_name, ''),
      false,
      auth.uid()
    );
  end if;

  insert into public.transaction_audit (
    action,
    table_name,
    record_id,
    details,
    created_by
  )
  values (
    'record_membership_payment',
    'payments',
    v_payment_id,
    jsonb_build_object(
      'member_id', p_member_id,
      'member_name', v_member.full_name,
      'invoice_number', v_invoice_number,
      'amount', p_amount,
      'payment_source', p_payment_source
    ),
    auth.uid()
  );

  return query select v_invoice_id, v_invoice_number, v_payment_id;
end;
$$;

create or replace function public.record_quick_receipt(
  p_receipt_number text,
  p_customer_name text,
  p_phone text,
  p_service_name text,
  p_quantity integer,
  p_unit_rate integer,
  p_total_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_notes text default null
)
returns table(receipt_id uuid, receipt_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt_id uuid;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  ) then
    raise exception 'Active staff login required';
  end if;

  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  insert into public.sales_receipts (
    receipt_number,
    customer_name,
    phone,
    service_name,
    quantity,
    unit_rate,
    total_amount,
    payment_source,
    receipt_date,
    valid_till,
    notes,
    created_by
  )
  values (
    p_receipt_number,
    p_customer_name,
    p_phone,
    p_service_name,
    greatest(p_quantity, 1),
    p_unit_rate,
    p_total_amount,
    p_payment_source,
    coalesce(p_receipt_date, current_date),
    coalesce(p_valid_till, coalesce(p_receipt_date, current_date)),
    p_notes,
    auth.uid()
  )
  returning id into v_receipt_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (
      entry_date,
      entry_type,
      category,
      source,
      person_name,
      amount,
      notes,
      payment_source,
      is_internal_transfer,
      created_by
    )
    values (
      coalesce(p_receipt_date, current_date),
      'receiving',
      null,
      p_service_name,
      p_customer_name,
      p_total_amount,
      concat_ws(' | ', p_receipt_number, p_phone, p_notes),
      p_payment_source,
      false,
      auth.uid()
    );
  else
    insert into public.owner_ledger (
      entry_date,
      entry_type,
      category,
      source,
      payment_source,
      amount,
      notes,
      is_internal_transfer,
      created_by
    )
    values (
      coalesce(p_receipt_date, current_date),
      'receiving',
      null,
      p_service_name,
      p_payment_source,
      p_total_amount,
      concat_ws(' | ', p_receipt_number, p_phone, p_notes),
      false,
      auth.uid()
    );
  end if;

  insert into public.transaction_audit (
    action,
    table_name,
    record_id,
    details,
    created_by
  )
  values (
    'record_quick_receipt',
    'sales_receipts',
    v_receipt_id,
    jsonb_build_object(
      'receipt_number', p_receipt_number,
      'customer_name', p_customer_name,
      'service', p_service_name,
      'quantity', p_quantity,
      'amount', p_total_amount,
      'payment_source', p_payment_source
    ),
    auth.uid()
  );

  return query select v_receipt_id, p_receipt_number;
end;
$$;

grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;

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

drop function if exists public.record_membership_payment(uuid, integer, text, date, date, text);
create or replace function public.record_membership_payment(
  p_member_id uuid,
  p_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_note text default null
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_standard_amount integer;
  v_discount_amount integer;
  v_item_count integer;
begin
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));

  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;

  select i.id, i.invoice_number
  into v_invoice_id, v_invoice_number
  from public.invoices i
  where i.member_id = p_member_id
    and i.valid_till = p_valid_till
    and i.invoice_type = 'membership'
    and i.status = 'paid'
  order by i.created_at desc
  limit 1;

  if v_invoice_id is not null then
    insert into public.transaction_audit (action, table_name, record_id, details)
    values ('membership_payment_duplicate_blocked', 'invoices', v_invoice_id::text, jsonb_build_object('member_id', p_member_id, 'valid_till', p_valid_till, 'payment_source', p_payment_source));
    return query select v_invoice_id, v_invoice_number;
    return;
  end if;

  v_standard_amount := greatest(coalesce(v_member.standard_monthly_rate, 0), coalesce(p_amount, 0));
  v_discount_amount := greatest(0, v_standard_amount - coalesce(p_amount, 0));
  v_invoice_number := 'SC-' || extract(year from current_date)::text || '-' || to_char(clock_timestamp(), 'MMDDHH24MISSMS');

  insert into public.invoices (
    invoice_number, member_id, invoice_type, issue_date, valid_till,
    standard_amount, discount_amount, subtotal_amount, tax_amount, total_amount,
    status, edit_note
  )
  values (
    v_invoice_number, p_member_id, 'membership', p_receipt_date, p_valid_till,
    v_standard_amount, v_discount_amount, p_amount, 0, p_amount,
    'paid', p_note
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select v_invoice_id, mpi.plan_name, mpi.seats,
    round(mpi.offered_monthly_rate::numeric / greatest(mpi.seats, 1))::integer,
    mpi.offered_monthly_rate
  from public.member_plan_items mpi
  where mpi.member_id = p_member_id
  order by mpi.sort_order, mpi.created_at;

  get diagnostics v_item_count = row_count;

  if v_item_count = 0 then
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
    values (v_invoice_id, v_member.plan_name, greatest(v_member.seats, 1), round(p_amount::numeric / greatest(v_member.seats, 1))::integer, p_amount);
  end if;

  insert into public.payments (invoice_id, member_id, amount, payment_method, payment_source, reference, notes)
  values (v_invoice_id, p_member_id, p_amount, 'cash', p_payment_source, v_invoice_number, p_note);

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (entry_date, entry_type, category, source, person_name, amount, notes, payment_source, is_internal_transfer)
    values (p_receipt_date, 'receiving', null, 'Membership receipt', v_member.full_name, p_amount, v_invoice_number || coalesce(' | ' || p_note, ''), p_payment_source, false);
  else
    insert into public.owner_ledger (entry_date, entry_type, category, source, payment_source, amount, notes, is_internal_transfer)
    values (p_receipt_date, 'receiving', null, 'Membership receipt', p_payment_source, p_amount, v_invoice_number || ' | ' || v_member.full_name || coalesce(' | ' || p_note, ''), false);
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values ('record_membership_payment', 'invoices', v_invoice_id::text, jsonb_build_object('invoice_number', v_invoice_number, 'member_id', p_member_id, 'amount', p_amount, 'payment_source', p_payment_source), jsonb_build_object('member_name', v_member.full_name, 'valid_till', p_valid_till));

  return query select v_invoice_id, v_invoice_number;
end;
$$;

create or replace function public.record_quick_receipt(
  p_receipt_number text,
  p_customer_name text,
  p_phone text,
  p_service_name text,
  p_quantity integer,
  p_unit_rate integer,
  p_total_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_notes text default null
)
returns table(receipt_id uuid, receipt_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt_id uuid;
begin
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  insert into public.sales_receipts (
    receipt_number, customer_name, phone, service_name, quantity, unit_rate,
    total_amount, payment_source, receipt_date, valid_till, notes
  )
  values (
    p_receipt_number, p_customer_name, p_phone, p_service_name, p_quantity, p_unit_rate,
    p_total_amount, p_payment_source, p_receipt_date, p_valid_till, p_notes
  )
  returning id into v_receipt_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (entry_date, entry_type, category, source, person_name, amount, notes, payment_source, is_internal_transfer)
    values (p_receipt_date, 'receiving', null, p_service_name, p_customer_name, p_total_amount, p_receipt_number || coalesce(' | ' || p_notes, ''), p_payment_source, false);
  else
    insert into public.owner_ledger (entry_date, entry_type, category, source, payment_source, amount, notes, is_internal_transfer)
    values (p_receipt_date, 'receiving', null, p_service_name, p_payment_source, p_total_amount, p_receipt_number || ' | ' || p_customer_name || coalesce(' | ' || p_notes, ''), false);
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values ('record_quick_receipt', 'sales_receipts', v_receipt_id::text, jsonb_build_object('receipt_number', p_receipt_number, 'customer_name', p_customer_name, 'amount', p_total_amount, 'payment_source', p_payment_source), jsonb_build_object('service_name', p_service_name, 'quantity', p_quantity));

  return query select v_receipt_id, p_receipt_number;
end;
$$;

alter table public.sales_receipts enable row level security;
alter table public.owner_ledger enable row level security;
alter table public.transaction_audit enable row level security;
alter table public.transaction_audit enable row level security;

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

drop policy if exists "Owner can read transaction audit" on public.transaction_audit;
create policy "Owner can read transaction audit"
on public.transaction_audit for select
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Staff can insert transaction audit" on public.transaction_audit;
create policy "Staff can insert transaction audit"
on public.transaction_audit for insert
to authenticated
with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
));

grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;

drop policy if exists "Owner can read transaction audit" on public.transaction_audit;
create policy "Owner can read transaction audit"
on public.transaction_audit for select
to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid()
    and active = true
    and role = 'owner'
));

drop policy if exists "Staff can insert transaction audit" on public.transaction_audit;
create policy "Staff can insert transaction audit"
on public.transaction_audit for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  )
);

drop function if exists public.record_membership_payment(uuid, integer, text, date, date, text);
create or replace function public.record_membership_payment(
  p_member_id uuid,
  p_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_note text default null
)
returns table(invoice_id uuid, invoice_number text, payment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_payment_id uuid;
  v_standard integer;
  v_discount integer;
  v_item_count integer;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  ) then
    raise exception 'Active staff login required';
  end if;

  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));

  select * into v_member
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'Member not found';
  end if;

  select i.id, i.invoice_number, p.id
  into v_invoice_id, v_invoice_number, v_payment_id
  from public.invoices i
  left join public.payments p on p.invoice_id = i.id
  where i.member_id = p_member_id
    and i.valid_till = p_valid_till
    and i.invoice_type = 'membership'
    and i.status = 'paid'
  order by i.created_at desc
  limit 1;

  if v_invoice_id is not null then
    insert into public.transaction_audit (action, table_name, record_id, details, created_by)
    values (
      'membership_payment_duplicate_blocked',
      'invoices',
      v_invoice_id::text,
      jsonb_build_object('member_id', p_member_id, 'valid_till', p_valid_till, 'payment_source', p_payment_source),
      auth.uid()
    );
    return query select v_invoice_id, v_invoice_number, v_payment_id;
    return;
  end if;

  v_standard := greatest(coalesce(v_member.standard_monthly_rate, p_amount), p_amount);
  v_discount := greatest(v_standard - p_amount, 0);
  v_invoice_number := 'SC-' || to_char(coalesce(p_receipt_date, current_date), 'YYYY') || '-' ||
    upper(substr(replace(p_member_id::text, '-', ''), 1, 6)) || '-' ||
    to_char(clock_timestamp(), 'HH24MISSMS');

  insert into public.invoices (
    invoice_number,
    member_id,
    invoice_type,
    issue_date,
    valid_till,
    standard_amount,
    discount_amount,
    subtotal_amount,
    tax_amount,
    total_amount,
    status,
    edit_note
  )
  values (
    v_invoice_number,
    p_member_id,
    'membership',
    coalesce(p_receipt_date, current_date),
    p_valid_till,
    v_standard,
    v_discount,
    p_amount,
    0,
    p_amount,
    'paid',
    p_note
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select v_invoice_id,
    mpi.plan_name,
    greatest(mpi.seats, 1),
    round(mpi.offered_monthly_rate::numeric / greatest(mpi.seats, 1))::integer,
    mpi.offered_monthly_rate
  from public.member_plan_items mpi
  where mpi.member_id = p_member_id
  order by mpi.sort_order, mpi.created_at;

  get diagnostics v_item_count = row_count;

  if v_item_count = 0 then
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
    values (
      v_invoice_id,
      coalesce(v_member.plan_name, p_note, 'Membership receipt'),
      greatest(coalesce(v_member.seats, 1), 1),
      round(p_amount::numeric / greatest(coalesce(v_member.seats, 1), 1))::integer,
      p_amount
    );
  end if;

  insert into public.payments (
    invoice_id,
    member_id,
    amount,
    payment_method,
    payment_source,
    reference,
    notes
  )
  values (
    v_invoice_id,
    p_member_id,
    p_amount,
    'cash',
    p_payment_source,
    v_invoice_number,
    p_note
  )
  returning id into v_payment_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (entry_date, entry_type, category, source, person_name, amount, notes, payment_source, is_internal_transfer, created_by)
    values (coalesce(p_receipt_date, current_date), 'receiving', null, 'Membership receipt', v_member.full_name, p_amount, v_invoice_number || ' | ' || coalesce(v_member.plan_name, ''), p_payment_source, false, auth.uid());
  else
    insert into public.owner_ledger (entry_date, entry_type, category, source, payment_source, amount, notes, is_internal_transfer, created_by)
    values (coalesce(p_receipt_date, current_date), 'receiving', null, 'Membership receipt', p_payment_source, p_amount, v_invoice_number || ' | ' || coalesce(v_member.plan_name, ''), false, auth.uid());
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details, created_by)
  values (
    'record_membership_payment',
    'payments',
    v_payment_id::text,
    jsonb_build_object('invoice_number', v_invoice_number, 'member_id', p_member_id, 'amount', p_amount, 'payment_source', p_payment_source),
    jsonb_build_object('member_name', v_member.full_name, 'valid_till', p_valid_till),
    auth.uid()
  );

  return query select v_invoice_id, v_invoice_number, v_payment_id;
end;
$$;

create or replace function public.record_quick_receipt(
  p_receipt_number text,
  p_customer_name text,
  p_phone text,
  p_service_name text,
  p_quantity integer,
  p_unit_rate integer,
  p_total_amount integer,
  p_payment_source text,
  p_receipt_date date,
  p_valid_till date,
  p_notes text default null
)
returns table(receipt_id uuid, receipt_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt_id uuid;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  ) then
    raise exception 'Active staff login required';
  end if;

  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  insert into public.sales_receipts (
    receipt_number,
    customer_name,
    phone,
    service_name,
    quantity,
    unit_rate,
    total_amount,
    payment_source,
    receipt_date,
    valid_till,
    notes,
    created_by
  )
  values (
    p_receipt_number,
    p_customer_name,
    p_phone,
    p_service_name,
    greatest(p_quantity, 1),
    p_unit_rate,
    p_total_amount,
    p_payment_source,
    coalesce(p_receipt_date, current_date),
    coalesce(p_valid_till, coalesce(p_receipt_date, current_date)),
    p_notes,
    auth.uid()
  )
  returning id into v_receipt_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (entry_date, entry_type, category, source, person_name, amount, notes, payment_source, is_internal_transfer, created_by)
    values (coalesce(p_receipt_date, current_date), 'receiving', null, p_service_name, p_customer_name, p_total_amount, concat_ws(' | ', p_receipt_number, p_phone, p_notes), p_payment_source, false, auth.uid());
  else
    insert into public.owner_ledger (entry_date, entry_type, category, source, payment_source, amount, notes, is_internal_transfer, created_by)
    values (coalesce(p_receipt_date, current_date), 'receiving', null, p_service_name, p_payment_source, p_total_amount, concat_ws(' | ', p_receipt_number, p_phone, p_notes), false, auth.uid());
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details, created_by)
  values (
    'record_quick_receipt',
    'sales_receipts',
    v_receipt_id::text,
    jsonb_build_object('receipt_number', p_receipt_number, 'customer_name', p_customer_name, 'amount', p_total_amount, 'payment_source', p_payment_source),
    jsonb_build_object('service_name', p_service_name, 'quantity', p_quantity),
    auth.uid()
  );

  return query select v_receipt_id, p_receipt_number;
end;
$$;

grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;
