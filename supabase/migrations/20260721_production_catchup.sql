-- Spaces Coworking — production catch-up migration
--
-- WHY THIS EXISTS
-- A live-database probe on 2026-07-21 showed production was still at the
-- original base schema: it had members, plans, invoices, invoice_items,
-- payments, cash_ledger, member_plan_items and whatsapp_messages, but was
-- missing every later addition. That is why "Mark paid" and "Generate
-- receipt" failed with PGRST202 (the RPCs did not exist) and why the
-- Business Ledger, audit log and website analytics pages stayed empty.
--
-- WHAT IT DOES
-- Brings any partially-migrated database up to the state the app expects.
-- Every statement is idempotent (if not exists / create or replace / drop
-- policy if exists), so it is safe to run once or repeatedly, and it never
-- drops or rewrites existing financial rows.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Take a backup first (Database -> Backups) as standard practice.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers

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
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true
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
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true and role in ('owner', 'manager')
  );
$$;

-- --------------------------------------------- columns on existing tables

alter table public.payments
  add column if not exists payment_source text not null default 'spaces_account';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_payment_source_check'
  ) then
    alter table public.payments
      add constraint payments_payment_source_check
      check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));
  end if;
end $$;

alter table public.cash_ledger
  add column if not exists payment_method text,
  add column if not exists payment_source text,
  add column if not exists is_internal_transfer boolean not null default false,
  add column if not exists linked_owner_ledger_id uuid,
  add column if not exists transfer_group_id uuid,
  add column if not exists origin text not null default 'manual',
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_ledger_payment_method_check'
  ) then
    alter table public.cash_ledger
      add constraint cash_ledger_payment_method_check
      check (payment_method is null or payment_method in
        ('petty_cash', 'business_card', 'business_bank_transfer', 'owner_personal', 'cash', 'card'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cash_ledger_payment_source_check'
  ) then
    alter table public.cash_ledger
      add constraint cash_ledger_payment_source_check
      check (payment_source is null or payment_source in
        ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));
  end if;
end $$;

-- --------------------------------------------------------- missing tables

create table if not exists public.sales_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  customer_name text not null,
  phone text,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_rate integer not null default 0 check (unit_rate >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  payment_source text not null default 'staff'
    check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner')),
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
  payment_source text not null default 'abrar_owner'
    check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner')),
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

alter table public.owner_ledger
  add column if not exists origin text not null default 'manual',
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;

alter table public.cash_ledger
  add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;

-- cash_ledger <-> owner_ledger is circular, so link it once both exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_ledger_linked_owner_ledger_id_fkey'
  ) then
    alter table public.cash_ledger
      add constraint cash_ledger_linked_owner_ledger_id_fkey
      foreign key (linked_owner_ledger_id) references public.owner_ledger(id) on delete set null;
  end if;
end $$;

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

create table if not exists public.website_events (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null,
  event_name text not null,
  path text not null default '/',
  section text,
  referrer_host text,
  device_type text not null default 'desktop',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists website_events_created_at_idx on public.website_events (created_at desc);
create index if not exists website_events_session_idx on public.website_events (session_id, created_at);

-- ------------------------------------------------------------- triggers

drop trigger if exists sales_receipts_set_updated_at on public.sales_receipts;
create trigger sales_receipts_set_updated_at
before update on public.sales_receipts
for each row execute function public.set_updated_at();

drop trigger if exists owner_ledger_set_updated_at on public.owner_ledger;
create trigger owner_ledger_set_updated_at
before update on public.owner_ledger
for each row execute function public.set_updated_at();

drop trigger if exists cash_ledger_set_updated_at on public.cash_ledger;
create trigger cash_ledger_set_updated_at
before update on public.cash_ledger
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- backfills

update public.cash_ledger
  set origin = 'membership_payment'
  where origin = 'manual' and source = 'Membership receipt';

update public.cash_ledger
  set origin = 'quick_receipt'
  where origin = 'manual' and source in ('Day Pass', 'Weekly Pass', 'Conference Room');

-- Older rows predate payment_source; treat them as staff-collected cash so
-- the petty-cash balance keeps reconciling.
update public.cash_ledger
  set payment_source = 'staff'
  where payment_source is null and entry_type = 'receiving';

-- ----------------------------------------------------------------- RPCs

drop function if exists public.record_membership_payment(uuid, integer, text, date, date, text);
create function public.record_membership_payment(
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
  v_reused_edited boolean := false;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;

  -- Already settled for this cycle: return the existing receipt, do not double charge.
  select i.id, i.invoice_number into v_invoice_id, v_invoice_number
  from public.invoices i
  where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type in ('membership', 'edited') and i.status = 'paid'
  order by i.created_at desc limit 1;
  if v_invoice_id is not null then
    return query select v_invoice_id, v_invoice_number;
    return;
  end if;

  -- Settle an agreed edited/discounted invoice for the same cycle if one exists.
  select i.id, i.invoice_number, i.standard_amount
  into v_invoice_id, v_invoice_number, v_standard_amount
  from public.invoices i
  where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type = 'edited' and i.status = 'sent'
  order by i.created_at desc limit 1;

  if v_invoice_id is not null then
    v_reused_edited := true;
    v_standard_amount := greatest(coalesce(v_standard_amount, 0), p_amount);
    v_discount_amount := greatest(0, v_standard_amount - p_amount);
    update public.invoices set
      issue_date = p_receipt_date,
      standard_amount = v_standard_amount,
      discount_amount = v_discount_amount,
      subtotal_amount = p_amount,
      tax_amount = 0,
      total_amount = p_amount,
      status = 'paid',
      updated_at = now()
    where id = v_invoice_id;
  else
    v_standard_amount := greatest(coalesce(v_member.standard_monthly_rate, 0), p_amount);
    v_discount_amount := greatest(0, v_standard_amount - p_amount);
    v_invoice_number := 'SC-' || extract(year from p_receipt_date)::text || '-' ||
      to_char(clock_timestamp(), 'MMDDHH24MISSMS');

    insert into public.invoices (
      invoice_number, member_id, invoice_type, issue_date, valid_till, standard_amount,
      discount_amount, subtotal_amount, tax_amount, total_amount, status, edit_note
    ) values (
      v_invoice_number, p_member_id, 'membership', p_receipt_date, p_valid_till,
      v_standard_amount, v_discount_amount, p_amount, 0, p_amount, 'paid', p_note
    ) returning id into v_invoice_id;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
    select v_invoice_id, mpi.plan_name, mpi.seats,
      round(mpi.offered_monthly_rate::numeric / greatest(mpi.seats, 1))::integer,
      mpi.offered_monthly_rate
    from public.member_plan_items mpi where mpi.member_id = p_member_id
    order by mpi.sort_order, mpi.created_at;
    get diagnostics v_item_count = row_count;

    if v_item_count = 0 then
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
      values (v_invoice_id, v_member.plan_name, greatest(v_member.seats, 1),
        round(p_amount::numeric / greatest(v_member.seats, 1))::integer, p_amount);
    end if;
  end if;

  -- Retire any competing draft/sent invoice for the same cycle.
  update public.invoices set status = 'void', updated_at = now()
  where member_id = p_member_id and valid_till = p_valid_till and id <> v_invoice_id
    and invoice_type in ('membership', 'edited') and status in ('draft', 'sent');

  insert into public.payments (invoice_id, member_id, amount, payment_method, payment_source, reference, notes)
  values (v_invoice_id, p_member_id, p_amount, 'cash', p_payment_source, v_invoice_number, p_note);

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (
      entry_date, entry_type, category, source, person_name, amount, notes,
      payment_source, is_internal_transfer, origin, invoice_id
    ) values (
      p_receipt_date, 'receiving', null, 'Membership receipt', v_member.full_name,
      p_amount, v_invoice_number || coalesce(' | ' || p_note, ''), p_payment_source,
      false, 'membership_payment', v_invoice_id
    );
  else
    insert into public.owner_ledger (
      entry_date, entry_type, category, source, payment_source, amount, notes,
      is_internal_transfer, origin, invoice_id
    ) values (
      p_receipt_date, 'receiving', null, 'Membership receipt', p_payment_source,
      p_amount, v_invoice_number || ' | ' || v_member.full_name || coalesce(' | ' || p_note, ''),
      false, 'membership_payment', v_invoice_id
    );
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values ('record_membership_payment', 'invoices', v_invoice_id::text,
    jsonb_build_object('invoice_number', v_invoice_number, 'member_id', p_member_id,
      'amount', p_amount, 'payment_source', p_payment_source),
    jsonb_build_object('member_name', v_member.full_name, 'valid_till', p_valid_till,
      'collection_date', p_receipt_date, 'settled_edited_invoice', v_reused_edited));

  return query select v_invoice_id, v_invoice_number;
end;
$$;

create or replace function public.record_quick_receipt(
  p_receipt_number text, p_customer_name text, p_phone text, p_service_name text,
  p_quantity integer, p_unit_rate integer, p_total_amount integer, p_payment_source text,
  p_receipt_date date, p_valid_till date, p_notes text default null
)
returns table(receipt_id uuid, receipt_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_receipt_id uuid;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;
  if coalesce(p_quantity, 0) <= 0 or coalesce(p_unit_rate, 0) <= 0 or coalesce(p_total_amount, 0) <= 0 then
    raise exception 'Receipt amount must be greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext('quick:' || p_receipt_number));

  select id into v_receipt_id from public.sales_receipts where sales_receipts.receipt_number = p_receipt_number;
  if v_receipt_id is not null then return query select v_receipt_id, p_receipt_number; return; end if;

  insert into public.sales_receipts (
    receipt_number, customer_name, phone, service_name, quantity, unit_rate,
    total_amount, payment_source, receipt_date, valid_till, notes
  ) values (
    p_receipt_number, p_customer_name, p_phone, p_service_name, p_quantity, p_unit_rate,
    p_total_amount, p_payment_source, p_receipt_date, p_valid_till, p_notes
  ) returning id into v_receipt_id;

  if p_payment_source in ('raza_manager', 'staff') then
    insert into public.cash_ledger (
      entry_date, entry_type, category, source, person_name, amount, notes,
      payment_source, is_internal_transfer, origin, sales_receipt_id
    ) values (
      p_receipt_date, 'receiving', null, p_service_name, p_customer_name, p_total_amount,
      p_receipt_number || coalesce(' | ' || p_notes, ''), p_payment_source, false,
      'quick_receipt', v_receipt_id
    );
  else
    insert into public.owner_ledger (
      entry_date, entry_type, category, source, payment_source, amount, notes,
      is_internal_transfer, origin, sales_receipt_id
    ) values (
      p_receipt_date, 'receiving', null, p_service_name, p_payment_source, p_total_amount,
      p_receipt_number || ' | ' || p_customer_name || coalesce(' | ' || p_notes, ''),
      false, 'quick_receipt', v_receipt_id
    );
  end if;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values ('record_quick_receipt', 'sales_receipts', v_receipt_id::text,
    jsonb_build_object('receipt_number', p_receipt_number, 'customer_name', p_customer_name,
      'amount', p_total_amount, 'payment_source', p_payment_source),
    jsonb_build_object('service_name', p_service_name, 'quantity', p_quantity));

  return query select v_receipt_id, p_receipt_number;
end;
$$;

revoke all on function public.record_membership_payment(uuid, integer, text, date, date, text) from public;
grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
revoke all on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) from public;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.sales_receipts enable row level security;
alter table public.owner_ledger enable row level security;
alter table public.transaction_audit enable row level security;
alter table public.website_events enable row level security;

drop policy if exists "Staff can read sales receipts" on public.sales_receipts;
create policy "Staff can read sales receipts" on public.sales_receipts
for select to authenticated using (public.is_active_staff());

drop policy if exists "Staff can insert sales receipts" on public.sales_receipts;
create policy "Staff can insert sales receipts" on public.sales_receipts
for insert to authenticated with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "Staff can update recent own sales receipts" on public.sales_receipts;
create policy "Staff can update recent own sales receipts" on public.sales_receipts
for update to authenticated
using (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
)
with check (
  public.is_staff_admin()
  or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
);

drop policy if exists "Owner can read owner ledger" on public.owner_ledger;
create policy "Owner can read owner ledger" on public.owner_ledger
for select to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Owner can insert owner ledger" on public.owner_ledger;
create policy "Owner can insert owner ledger" on public.owner_ledger
for insert to authenticated with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Owner can update manual owner ledger" on public.owner_ledger;
create policy "Owner can update manual owner ledger" on public.owner_ledger
for update to authenticated
using (origin = 'manual' and exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
))
with check (origin = 'manual' and exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Owner can delete manual owner ledger" on public.owner_ledger;
create policy "Owner can delete manual owner ledger" on public.owner_ledger
for delete to authenticated
using (origin = 'manual' and exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Owner can read transaction audit" on public.transaction_audit;
create policy "Owner can read transaction audit" on public.transaction_audit
for select to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Staff can insert transaction audit" on public.transaction_audit;
create policy "Staff can insert transaction audit" on public.transaction_audit
for insert to authenticated with check (public.is_active_staff());

drop policy if exists "Owners can view website analytics" on public.website_events;
create policy "Owners can view website analytics" on public.website_events
for select to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

revoke insert, update, delete on public.website_events from anon, authenticated;
grant select on public.website_events to authenticated;

-- Staff-cash ledger: only hand-entered rows stay editable; receipt-generated
-- rows are locked so the books cannot drift from the invoices.
drop policy if exists "Staff can update recent own cash ledger" on public.cash_ledger;
drop policy if exists "Staff can update recent manual cash ledger" on public.cash_ledger;
create policy "Staff can update recent manual cash ledger" on public.cash_ledger
for update to authenticated
using (
  origin = 'manual'
  and (
    public.is_staff_admin()
    or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
  )
)
with check (
  origin = 'manual'
  and (
    public.is_staff_admin()
    or (public.is_active_staff() and created_by = auth.uid() and created_at >= now() - interval '3 days')
  )
);

drop policy if exists "Staff admins can delete cash ledger" on public.cash_ledger;
drop policy if exists "Staff admins can delete manual cash ledger" on public.cash_ledger;
create policy "Staff admins can delete manual cash ledger" on public.cash_ledger
for delete to authenticated using (origin = 'manual' and public.is_staff_admin());

-- Payment history is owner-only; paid invoices cannot be deleted by anyone.
drop policy if exists "Authenticated staff can manage payments" on public.payments;
drop policy if exists "Staff can read payments" on public.payments;
drop policy if exists "Owner can read payments" on public.payments;
create policy "Owner can read payments" on public.payments
for select to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Staff can insert payments" on public.payments;
create policy "Staff can insert payments" on public.payments
for insert to authenticated with check (public.is_active_staff());

drop policy if exists "Staff can update payments" on public.payments;
drop policy if exists "Owner can update payments" on public.payments;
create policy "Owner can update payments" on public.payments
for update to authenticated
using (exists (select 1 from public.staff_profiles where user_id = auth.uid() and active = true and role = 'owner'))
with check (exists (select 1 from public.staff_profiles where user_id = auth.uid() and active = true and role = 'owner'));

drop policy if exists "Staff can delete payments" on public.payments;
drop policy if exists "Owner can delete payments" on public.payments;
create policy "Owner can delete payments" on public.payments
for delete to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Staff can delete invoices" on public.invoices;
drop policy if exists "Owner can delete unpaid invoices" on public.invoices;
create policy "Owner can delete unpaid invoices" on public.invoices
for delete to authenticated
using (status <> 'paid' and exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

notify pgrst, 'reload schema';

commit;

-- Verify after running:
--   select proname from pg_proc
--   where proname in ('record_membership_payment', 'record_quick_receipt');
--   -- expect 2 rows
