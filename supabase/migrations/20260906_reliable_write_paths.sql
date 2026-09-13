-- Spaces Coworking: reliable write paths
--
-- Run this entire file once in Supabase SQL Editor. It is safe to re-run.
-- The functions below make member bundles, staff expenses, and linked owner /
-- staff transfers atomic: either every row is saved or none of the rows are.
-- Requires the base schema and production catch-up (20260721) for receipts.
-- No financial backfill is performed. Ambiguous historical payments/transfers
-- fail closed and require reconciliation instead of manufacturing new money.

begin;

create extension if not exists pgcrypto;

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
    where user_id = auth.uid()
      and active = true
      and role in ('owner', 'manager')
  );
$$;

create or replace function public.is_spaces_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
      and active = true
      and role = 'owner'
  );
$$;

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

alter table public.member_plan_items
  add column if not exists plan_id uuid references public.plans(id),
  add column if not exists category text,
  add column if not exists seats integer not null default 1,
  add column if not exists standard_monthly_rate integer not null default 0,
  add column if not exists offered_monthly_rate integer not null default 0,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.cash_ledger
  add column if not exists payment_method text,
  add column if not exists payment_source text,
  add column if not exists is_internal_transfer boolean not null default false,
  add column if not exists linked_owner_ledger_id uuid,
  add column if not exists transfer_group_id uuid,
  add column if not exists origin text not null default 'manual',
  add column if not exists created_by uuid;

alter table public.cash_ledger
  drop constraint if exists cash_ledger_payment_method_check,
  drop constraint if exists cash_ledger_payment_source_check;

alter table public.cash_ledger
  add constraint cash_ledger_payment_method_check
  check (payment_method is null or payment_method in (
    'petty_cash', 'business_card', 'business_bank_transfer', 'owner_personal', 'cash', 'card'
  )),
  add constraint cash_ledger_payment_source_check
  check (payment_source is null or payment_source in (
    'spaces_account', 'raza_manager', 'staff', 'abrar_owner'
  ));

create table if not exists public.owner_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('expense', 'receiving')),
  category text,
  source text,
  payment_source text not null default 'abrar_owner',
  amount integer not null check (amount >= 0),
  notes text,
  attachment_note text,
  linked_cash_ledger_id uuid references public.cash_ledger(id) on delete set null,
  transfer_group_id uuid,
  is_internal_transfer boolean not null default false,
  origin text not null default 'manual',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entry_type = 'expense' and category is not null and source is null)
    or
    (entry_type = 'receiving' and source is not null and category is null)
  )
);

alter table public.owner_ledger
  add column if not exists linked_cash_ledger_id uuid,
  add column if not exists transfer_group_id uuid,
  add column if not exists is_internal_transfer boolean not null default false,
  add column if not exists origin text not null default 'manual',
  add column if not exists created_by uuid;

alter table public.owner_ledger
  drop constraint if exists owner_ledger_payment_source_check;

alter table public.owner_ledger
  add constraint owner_ledger_payment_source_check
  check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

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

-- The original audit patch used a UUID record_id and lacked snapshots.
alter table public.transaction_audit
  alter column record_id type text using record_id::text,
  add column if not exists before_data jsonb,
  add column if not exists after_data jsonb;

alter table public.cash_ledger
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;
alter table public.owner_ledger
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;

alter table public.owner_ledger enable row level security;
alter table public.transaction_audit enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_ledger_linked_owner_ledger_id_fkey'
      and conrelid = 'public.cash_ledger'::regclass
  ) then
    alter table public.cash_ledger
      add constraint cash_ledger_linked_owner_ledger_id_fkey
      foreign key (linked_owner_ledger_id)
      references public.owner_ledger(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'owner_ledger_linked_cash_ledger_id_fkey'
      and conrelid = 'public.owner_ledger'::regclass
  ) then
    alter table public.owner_ledger
      add constraint owner_ledger_linked_cash_ledger_id_fkey
      foreign key (linked_cash_ledger_id) references public.cash_ledger(id) on delete set null;
  end if;
end $$;

drop trigger if exists member_plan_items_set_updated_at on public.member_plan_items;
create trigger member_plan_items_set_updated_at
before update on public.member_plan_items
for each row execute function public.set_updated_at();

drop trigger if exists cash_ledger_set_updated_at on public.cash_ledger;
create trigger cash_ledger_set_updated_at
before update on public.cash_ledger
for each row execute function public.set_updated_at();

drop trigger if exists owner_ledger_set_updated_at on public.owner_ledger;
create trigger owner_ledger_set_updated_at
before update on public.owner_ledger
for each row execute function public.set_updated_at();

alter table public.member_plan_items enable row level security;

drop policy if exists "Staff can read member plan items" on public.member_plan_items;
create policy "Staff can read member plan items"
on public.member_plan_items for select to authenticated
using (public.is_active_staff());

-- Save the member row and every plan line in one transaction. Staff can add a
-- standard-rate membership and update contact details; only the owner may set
-- negotiated rates, deposits, discounts, or alter an existing plan bundle.
-- Optional request IDs are generated ONCE by the client and reused after a
-- timeout. Omitting one preserves compatibility but cannot deduplicate creates.
create table if not exists public.reliable_write_requests (
  created_by uuid not null references auth.users(id),
  operation text not null,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (created_by, operation, request_id)
);
alter table public.reliable_write_requests enable row level security;
revoke all on public.reliable_write_requests from public, anon, authenticated;

create or replace function public.claim_reliable_write(p_operation text, p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_request public.reliable_write_requests%rowtype;
begin
  if p_request_id is null then return null; end if;
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  insert into public.reliable_write_requests (created_by, operation, request_id, payload)
    values (auth.uid(), p_operation, p_request_id, p_payload)
    on conflict do nothing;
  select * into strict v_request from public.reliable_write_requests r
    where r.created_by = auth.uid() and r.operation = p_operation and r.request_id = p_request_id
    for update;
  if v_request.payload is distinct from p_payload then
    raise exception 'Request ID was already used with different data';
  end if;
  return v_request.result;
end;
$$;
revoke all on function public.claim_reliable_write(text, uuid, jsonb) from public, anon, authenticated;

drop function if exists public.save_member_bundle(uuid, text, text, text, text, date, date, text, integer, text, text, jsonb);
create or replace function public.save_member_bundle(
  p_member_id uuid,
  p_full_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_joining_date date,
  p_renewal_date date,
  p_status text,
  p_deposit_amount integer,
  p_discount_reason text,
  p_notes text,
  p_plan_items jsonb,
  p_request_id uuid default null
)
returns table(member_id uuid, full_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_owner boolean := public.is_spaces_owner();
  v_phone text;
  v_existing_name text;
  v_plan_id uuid;
  v_plan_name text;
  v_plan_category text;
  v_plan_rate integer;
  v_line_name text;
  v_line_category text;
  v_line_seats integer;
  v_line_standard integer;
  v_line_offered integer;
  v_total_seats integer := 0;
  v_total_standard integer := 0;
  v_total_offered integer := 0;
  v_primary jsonb;
  v_index integer := 0;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'active');
  v_result jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'Active staff login required';
  end if;
  v_result := public.claim_reliable_write('member', p_request_id, jsonb_build_array(
    p_member_id, p_full_name, p_company, p_phone, p_email, p_joining_date,
    p_renewal_date, p_status, p_deposit_amount, p_discount_reason, p_notes, p_plan_items));
  if v_result is not null then
    return query select (v_result ->> 'member_id')::uuid, v_result ->> 'full_name';
    return;
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Member name is required';
  end if;
  if p_joining_date is null or p_renewal_date is null then
    raise exception 'Joining date and renewal date are required';
  end if;
  if p_renewal_date <= p_joining_date then
    raise exception 'Renewal date must be after joining date';
  end if;
  if v_status not in ('active', 'paused', 'cancelled') then
    raise exception 'Invalid member status';
  end if;
  if v_owner and coalesce(p_deposit_amount, 0) < 0 then
    raise exception 'Deposit must not be negative';
  end if;

  -- Lock before touching plan lines. Payment RPCs take this same member lock.
  if p_member_id is not null then
    select * into v_member from public.members where id = p_member_id for update;
    if not found then raise exception 'Member not found'; end if;
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone ~ '^0[0-9]{10}$' then
    v_phone := '92' || substr(v_phone, 2);
  elsif v_phone ~ '^3[0-9]{9}$' then
    v_phone := '92' || v_phone;
  end if;
  if length(v_phone) < 10 then
    raise exception 'Enter a valid phone number';
  end if;
  perform pg_advisory_xact_lock(hashtext('member-phone:' || v_phone));
  select m.full_name into v_existing_name
  from public.members m
  where m.status <> 'cancelled'
    and m.id is distinct from p_member_id
    and case
      when regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') ~ '^0[0-9]{10}$'
        then '92' || substr(regexp_replace(m.phone, '[^0-9]', '', 'g'), 2)
      when regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') ~ '^3[0-9]{9}$'
        then '92' || regexp_replace(m.phone, '[^0-9]', '', 'g')
      else regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
    end = v_phone
  limit 1;
  if found and v_status <> 'cancelled' then
    raise exception '% already has this phone number. Update that member instead.', v_existing_name;
  end if;

  if p_member_id is not null and not v_owner then
    update public.members
    set full_name = btrim(p_full_name),
        company = nullif(btrim(p_company), ''),
        phone = btrim(p_phone),
        email = nullif(btrim(p_email), ''),
        joining_date = p_joining_date,
        renewal_date = p_renewal_date,
        status = v_status,
        notes = nullif(btrim(p_notes), '')
    where id = p_member_id
    returning * into v_member;
    if not found then raise exception 'Member not found'; end if;

    insert into public.transaction_audit (action, table_name, record_id, after_data, details)
    values (
      'update_member_record', 'members', v_member.id::text,
      jsonb_build_object('name', v_member.full_name, 'status', v_member.status),
      jsonb_build_object('mode', 'staff_contact_update')
    );
    update public.reliable_write_requests r
      set result = jsonb_build_object('member_id', v_member.id, 'full_name', v_member.full_name)
      where r.created_by = auth.uid() and r.operation = 'member' and r.request_id = p_request_id;
    return query select v_member.id, v_member.full_name;
    return;
  end if;

  if jsonb_typeof(p_plan_items) is distinct from 'array' then
    raise exception 'Membership plans must be a JSON array';
  end if;
  if jsonb_array_length(p_plan_items) = 0 then
    raise exception 'At least one membership plan is required';
  end if;

  for v_line in select value from jsonb_array_elements(p_plan_items) loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'Each membership plan must be an object';
    end if;
    v_line_name := nullif(btrim(v_line ->> 'plan_name'), '');
    v_plan_id := nullif(v_line ->> 'plan_id', '')::uuid;
    if v_line_name is null and v_plan_id is null then
      raise exception 'Each membership plan must be selected';
    end if;

    select p.id, p.name, p.category, p.standard_monthly_rate
      into v_plan_id, v_plan_name, v_plan_category, v_plan_rate
    from public.plans p
    where (p.active = true or (v_owner and exists (
      select 1 from public.member_plan_items mpi
      where mpi.member_id = p_member_id and mpi.plan_id = p.id
    )) or (v_owner and v_member.plan_id = p.id))
      and (p.id = v_plan_id or (v_plan_id is null and lower(p.name) = lower(v_line_name)))
    order by case when p.id = v_plan_id then 0 else 1 end
    limit 1;
    if not found then
      raise exception 'The selected plan is no longer available';
    end if;

    if coalesce(v_line ->> 'seats', '') !~ '^[0-9]+$' or (v_line ->> 'seats')::integer < 1 then
      raise exception 'Each plan must have at least one seat';
    end if;
    v_line_seats := (v_line ->> 'seats')::integer;

    if v_owner then
      if coalesce(v_line ->> 'standard_monthly_rate', '') !~ '^[0-9]+$'
        or coalesce(v_line ->> 'offered_monthly_rate', '') !~ '^[0-9]+$' then
        raise exception 'Plan rates must be whole rupee amounts';
      end if;
      v_line_standard := (v_line ->> 'standard_monthly_rate')::integer;
      v_line_offered := (v_line ->> 'offered_monthly_rate')::integer;
    else
      v_line_standard := v_plan_rate;
      v_line_offered := v_plan_rate;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'plan_id', v_plan_id,
      'plan_name', v_plan_name,
      'category', v_plan_category,
      'seats', v_line_seats,
      'standard_monthly_rate', v_line_standard,
      'offered_monthly_rate', v_line_offered,
      'sort_order', v_index
    ));
    v_total_seats := v_total_seats + v_line_seats;
    v_total_standard := v_total_standard + v_line_standard;
    v_total_offered := v_total_offered + v_line_offered;
    v_index := v_index + 1;
  end loop;

  v_primary := v_lines -> 0;
  if p_member_id is null then
    insert into public.members (
      full_name, company, phone, email, plan_id, plan_name, seats, joining_date,
      renewal_date, standard_monthly_rate, offered_monthly_rate, deposit_amount,
      discount_reason, notes, status
    ) values (
      btrim(p_full_name), nullif(btrim(p_company), ''), btrim(p_phone), nullif(btrim(p_email), ''),
      (v_primary ->> 'plan_id')::uuid, v_primary ->> 'plan_name', v_total_seats,
      p_joining_date, p_renewal_date, v_total_standard, v_total_offered,
      case when v_owner then greatest(coalesce(p_deposit_amount, 0), 0) else 0 end,
      case when v_owner then nullif(btrim(p_discount_reason), '') else null end,
      nullif(btrim(p_notes), ''), v_status
    ) returning * into v_member;
  else
    update public.members
    set full_name = btrim(p_full_name),
        company = nullif(btrim(p_company), ''),
        phone = btrim(p_phone),
        email = nullif(btrim(p_email), ''),
        plan_id = (v_primary ->> 'plan_id')::uuid,
        plan_name = v_primary ->> 'plan_name',
        seats = v_total_seats,
        joining_date = p_joining_date,
        renewal_date = p_renewal_date,
        standard_monthly_rate = v_total_standard,
        offered_monthly_rate = v_total_offered,
        deposit_amount = greatest(coalesce(p_deposit_amount, 0), 0),
        discount_reason = nullif(btrim(p_discount_reason), ''),
        notes = nullif(btrim(p_notes), ''),
        status = v_status
    where id = p_member_id
    returning * into v_member;
    if not found then raise exception 'Member not found'; end if;
    delete from public.member_plan_items mpi where mpi.member_id = v_member.id;
  end if;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    insert into public.member_plan_items (
      member_id, plan_id, plan_name, category, seats,
      standard_monthly_rate, offered_monthly_rate, sort_order
    ) values (
      v_member.id, (v_line ->> 'plan_id')::uuid, v_line ->> 'plan_name',
      v_line ->> 'category', (v_line ->> 'seats')::integer,
      (v_line ->> 'standard_monthly_rate')::integer,
      (v_line ->> 'offered_monthly_rate')::integer,
      (v_line ->> 'sort_order')::integer
    );
  end loop;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values (
    case when p_member_id is null then 'create_member' else 'update_member_record' end,
    'members', v_member.id::text,
    jsonb_build_object('name', v_member.full_name, 'status', v_member.status),
    jsonb_build_object(
      'monthly_fee', v_total_offered,
      'plan_lines', v_lines,
      'mode', case when v_owner then 'owner' else 'staff_standard_rate' end
    )
  );

  update public.reliable_write_requests r
    set result = jsonb_build_object('member_id', v_member.id, 'full_name', v_member.full_name)
    where r.created_by = auth.uid() and r.operation = 'member' and r.request_id = p_request_id;
  return query select v_member.id, v_member.full_name;
end;
$$;

-- Staff expenses and cash receipts are single-row writes, but the validation
-- belongs in the database so mobile retries cannot create malformed entries.
drop function if exists public.create_cash_ledger_entry(date, text, text, text, text, integer, text, text, text);
create or replace function public.create_cash_ledger_entry(
  p_entry_date date,
  p_entry_type text,
  p_category text,
  p_source text,
  p_person_name text,
  p_amount integer,
  p_notes text,
  p_payment_method text,
  p_payment_source text,
  p_request_id uuid default null
)
returns table(entry_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.cash_ledger%rowtype;
  v_category text := nullif(btrim(p_category), '');
  v_source text := nullif(btrim(p_source), '');
  v_method text;
  v_payment_source text;
  v_result jsonb;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  v_result := public.claim_reliable_write('cash', p_request_id, jsonb_build_array(
    p_entry_date, p_entry_type, p_category, p_source, p_person_name, p_amount,
    p_notes, p_payment_method, p_payment_source));
  if v_result is not null then
    return query select (v_result ->> 'entry_id')::uuid;
    return;
  end if;
  if p_entry_date is null then raise exception 'Entry date is required'; end if;
  if p_entry_type is null or p_entry_type not in ('expense', 'receiving') then raise exception 'Invalid staff ledger entry type'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Amount must be greater than zero'; end if;

  if p_entry_type = 'expense' then
    if v_category is null then raise exception 'Expense category is required'; end if;
    if lower(v_category) = 'returned to owner' then
      raise exception 'Create internal transfers from the Business Ledger so both sides remain linked';
    end if;
    v_method := coalesce(nullif(p_payment_method, ''), 'petty_cash');
    if v_method = 'cash' then v_method := 'petty_cash'; end if;
    if v_method = 'card' then v_method := 'business_card'; end if;
    if v_method not in ('petty_cash', 'business_card') then raise exception 'Choose cash or business debit card'; end if;
    v_source := null;
    v_payment_source := null;
  else
    if v_source is null then raise exception 'Receiving source is required'; end if;
    if lower(v_source) like '%owner transfer%'
      or lower(v_source) like '%top-up%'
      or lower(v_source) like '%received from owner%' then
      raise exception 'Record owner-to-staff transfers in the Business Ledger so both balances stay linked';
    end if;
    v_category := null;
    v_method := null;
    v_payment_source := coalesce(nullif(p_payment_source, ''), 'staff');
    if v_payment_source not in ('raza_manager', 'staff') then
      raise exception 'Staff cash receipts must be collected by staff';
    end if;
  end if;

  insert into public.cash_ledger (
    entry_date, entry_type, category, source, person_name, amount, notes,
    payment_method, payment_source, is_internal_transfer, origin, created_by
  ) values (
    p_entry_date, p_entry_type, v_category, v_source, nullif(btrim(p_person_name), ''),
    p_amount, nullif(btrim(p_notes), ''), v_method, v_payment_source,
    false, 'manual', auth.uid()
  ) returning * into v_entry;

  insert into public.transaction_audit (action, table_name, record_id, after_data, details)
  values (
    'create_staff_' || p_entry_type, 'cash_ledger', v_entry.id::text,
    jsonb_build_object('amount', v_entry.amount, 'category_or_source', coalesce(v_entry.category, v_entry.source)),
    jsonb_build_object('payment_method', v_entry.payment_method, 'payment_source', v_entry.payment_source)
  );
  update public.reliable_write_requests r
    set result = jsonb_build_object('entry_id', v_entry.id)
    where r.created_by = auth.uid() and r.operation = 'cash' and r.request_id = p_request_id;
  return query select v_entry.id;
end;
$$;

create or replace function public.update_cash_ledger_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_entry_type text,
  p_category text,
  p_source text,
  p_person_name text,
  p_amount integer,
  p_notes text,
  p_payment_method text
)
returns table(entry_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.cash_ledger%rowtype;
  v_entry public.cash_ledger%rowtype;
  v_category text := nullif(btrim(p_category), '');
  v_source text := nullif(btrim(p_source), '');
  v_method text;
  v_internal boolean := false;
  v_link public.owner_ledger%rowtype;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  -- Both transfer editors acquire this lock BEFORE either ledger row. Transfers
  -- are infrequent; one shared transaction lock avoids opposite-order deadlocks.
  perform pg_advisory_xact_lock(20260906, 1);
  select * into v_existing from public.cash_ledger where id = p_entry_id for update;
  if not found then raise exception 'Staff ledger entry not found'; end if;
  if coalesce(v_existing.origin, 'manual') <> 'manual'
    or v_existing.invoice_id is not null or v_existing.sales_receipt_id is not null
    or v_existing.source in ('Membership receipt', 'Day Pass', 'Weekly Pass', 'Conference Room') then
    raise exception 'Receipt-generated ledger rows are locked';
  end if;
  if (public.is_spaces_owner() or (v_existing.created_by = auth.uid() and v_existing.created_at >= now() - interval '3 days')) is not true then
    raise exception 'This staff entry can only be edited by its creator for three days';
  end if;
  if p_entry_date is null or p_entry_type is null or p_entry_type not in ('expense', 'receiving') or coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter a valid date, type, and amount greater than zero';
  end if;

  if p_entry_type = 'expense' then
    if v_category is null then raise exception 'Expense category is required'; end if;
    v_method := coalesce(nullif(p_payment_method, ''), 'petty_cash');
    if v_method = 'cash' then v_method := 'petty_cash'; end if;
    if v_method = 'card' then v_method := 'business_card'; end if;
    if v_method not in ('petty_cash', 'business_card') then raise exception 'Choose cash or business debit card'; end if;
    v_source := null;
  else
    if v_source is null then raise exception 'Receiving source is required'; end if;
    v_category := null;
    v_method := null;
  end if;

  v_internal := coalesce(v_existing.is_internal_transfer, false)
    or v_existing.linked_owner_ledger_id is not null or v_existing.transfer_group_id is not null
    or lower(coalesce(v_existing.category, '')) = 'returned to owner'
    or lower(coalesce(v_existing.source, '')) ~ '(owner transfer|top-up|received from owner)';
  if v_internal and not public.is_spaces_owner() then
    raise exception 'Only the owner can edit a linked transfer';
  end if;
  if not v_internal and (
    lower(coalesce(v_category, '')) = 'returned to owner'
    or lower(coalesce(v_source, '')) like '%owner transfer%'
    or lower(coalesce(v_source, '')) like '%top-up%'
    or lower(coalesce(v_source, '')) like '%received from owner%'
  ) then
    raise exception 'Create internal transfers from the Business Ledger so both sides remain linked';
  end if;

  if v_internal and v_existing.linked_owner_ledger_id is null then
    raise exception 'This legacy transfer cannot be edited safely. Add a correcting entry instead.';
  end if;
  if v_internal and not (
    (p_entry_type = 'receiving' and lower(coalesce(v_source, '')) in ('petty cash top-up - abrar', 'received from owner', 'owner transfer - abrar'))
    or (p_entry_type = 'expense' and lower(coalesce(v_category, '')) = 'returned to owner')
  ) then
    raise exception 'Linked transfer rows must remain transfers. Add a correcting entry instead.';
  end if;

  if v_internal then
    select * into v_link from public.owner_ledger
      where id = v_existing.linked_owner_ledger_id for update;
    if not found or v_link.linked_cash_ledger_id is distinct from v_existing.id
      or v_link.transfer_group_id is distinct from v_existing.transfer_group_id
      or v_link.origin is distinct from 'manual'
      or v_link.invoice_id is not null or v_link.sales_receipt_id is not null
      or not v_link.is_internal_transfer then
      raise exception 'Broken transfer link; reconcile before editing';
    end if;
    if p_entry_type = 'expense' and v_method <> 'petty_cash' then
      raise exception 'Returned cash must use petty_cash, not a business card';
    end if;
  elsif p_entry_type = 'receiving' and coalesce(v_existing.payment_source, 'staff') not in ('staff', 'raza_manager') then
    raise exception 'This receipt is not staff cash; reconcile before editing';
  end if;

  update public.cash_ledger
  set entry_date = p_entry_date,
      entry_type = p_entry_type,
      category = v_category,
      source = v_source,
      person_name = nullif(btrim(p_person_name), ''),
      amount = p_amount,
      notes = nullif(btrim(p_notes), ''),
      payment_method = v_method,
      payment_source = case when v_internal then 'staff'
        when p_entry_type = 'receiving' then coalesce(v_existing.payment_source, 'staff') else null end,
      is_internal_transfer = v_internal
  where id = p_entry_id
  returning * into v_entry;

  if v_internal and p_entry_type = 'receiving' then
    update public.owner_ledger
    set entry_date = p_entry_date,
        entry_type = 'expense',
        category = 'Petty Cash Top-Up',
        source = null,
        amount = p_amount,
        notes = nullif(btrim(p_notes), ''),
        is_internal_transfer = true
    where id = v_existing.linked_owner_ledger_id;
  elsif v_internal and p_entry_type = 'expense' then
    update public.owner_ledger
    set entry_date = p_entry_date,
        entry_type = 'receiving',
        category = null,
        source = 'Received From Staff',
        amount = p_amount,
        notes = nullif(btrim(p_notes), ''),
        is_internal_transfer = true
    where id = v_existing.linked_owner_ledger_id;
  end if;

  insert into public.transaction_audit (action, table_name, record_id, before_data, after_data)
  values (
    'update_staff_cash_row', 'cash_ledger', v_entry.id::text,
    to_jsonb(v_existing), to_jsonb(v_entry)
  );
  return query select v_entry.id;
end;
$$;

-- Owner entries and their linked petty-cash movement are saved together.
drop function if exists public.save_owner_ledger_entry(uuid, date, text, text, text, text, integer, text, text);
create or replace function public.save_owner_ledger_entry(
  p_owner_entry_id uuid,
  p_entry_date date,
  p_entry_type text,
  p_category text,
  p_source text,
  p_payment_source text,
  p_amount integer,
  p_notes text,
  p_attachment_note text,
  p_request_id uuid default null
)
returns table(owner_entry_id uuid, cash_entry_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.owner_ledger%rowtype;
  v_owner public.owner_ledger%rowtype;
  v_cash public.cash_ledger%rowtype;
  v_category text := nullif(btrim(p_category), '');
  v_source text := nullif(btrim(p_source), '');
  v_transfer_id uuid;
  v_internal boolean := false;
  v_is_new boolean := p_owner_entry_id is null;
  v_result jsonb;
begin
  if not public.is_spaces_owner() then raise exception 'Owner access required'; end if;
  v_result := public.claim_reliable_write('owner', p_request_id, jsonb_build_array(
    p_owner_entry_id, p_entry_date, p_entry_type, p_category, p_source,
    p_payment_source, p_amount, p_notes, p_attachment_note));
  if v_result is not null then
    return query select (v_result ->> 'owner_entry_id')::uuid, (v_result ->> 'cash_entry_id')::uuid;
    return;
  end if;
  perform pg_advisory_xact_lock(20260906, 1);
  if p_entry_date is null or p_entry_type is null or p_entry_type not in ('expense', 'receiving') or coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter a valid date, type, and amount greater than zero';
  end if;
  if p_payment_source is null or p_payment_source not in ('spaces_account', 'abrar_owner') then
    raise exception 'Business ledger entries must use an owner or business account';
  end if;
  if p_entry_type = 'expense' then
    if v_category is null then raise exception 'Owner expense category is required'; end if;
    v_source := null;
  else
    if v_source is null then raise exception 'Owner receiving source is required'; end if;
    v_category := null;
  end if;
  v_internal := (p_entry_type = 'expense' and v_category in ('Transfer to Staff', 'Petty Cash Top-Up'))
    or (p_entry_type = 'receiving' and v_source = 'Received From Staff');

  if v_is_new then
    v_transfer_id := case when v_internal then gen_random_uuid() else null end;
    insert into public.owner_ledger (
      entry_date, entry_type, category, source, payment_source, amount, notes,
      attachment_note, is_internal_transfer, transfer_group_id, origin, created_by
    ) values (
      p_entry_date, p_entry_type, v_category, v_source, p_payment_source, p_amount,
      nullif(btrim(p_notes), ''), nullif(btrim(p_attachment_note), ''),
      v_internal, v_transfer_id, 'manual', auth.uid()
    ) returning * into v_owner;
  else
    select * into v_existing from public.owner_ledger where id = p_owner_entry_id for update;
    if not found then raise exception 'Business ledger entry not found'; end if;
    if coalesce(v_existing.origin, 'manual') <> 'manual'
      or v_existing.invoice_id is not null or v_existing.sales_receipt_id is not null
      or v_existing.source in ('Membership receipt', 'Day Pass', 'Weekly Pass', 'Conference Room') then
      raise exception 'Receipt-generated ledger rows are locked';
    end if;
    if v_existing.linked_cash_ledger_id is null and (
      v_existing.is_internal_transfer or v_existing.transfer_group_id is not null
      or v_existing.category in ('Transfer to Staff', 'Petty Cash Top-Up')
      or v_existing.source = 'Received From Staff'
    ) then
      raise exception 'This legacy transfer cannot be edited safely. Add a correcting entry instead.';
    end if;
    if v_existing.linked_cash_ledger_id is not null and not v_internal then
      raise exception 'Linked transfer rows must remain transfers. Add a correcting entry instead.';
    end if;
    if v_existing.linked_cash_ledger_id is null and v_internal then
      v_transfer_id := gen_random_uuid();
    else
      v_transfer_id := v_existing.transfer_group_id;
    end if;
    update public.owner_ledger
    set entry_date = p_entry_date,
        entry_type = p_entry_type,
        category = v_category,
        source = v_source,
        payment_source = p_payment_source,
        amount = p_amount,
        notes = nullif(btrim(p_notes), ''),
        attachment_note = nullif(btrim(p_attachment_note), ''),
        is_internal_transfer = v_internal,
        transfer_group_id = v_transfer_id
    where id = p_owner_entry_id
    returning * into v_owner;
  end if;

  if v_internal and v_owner.linked_cash_ledger_id is null then
    if v_owner.entry_type = 'expense' then
      insert into public.cash_ledger (
        entry_date, entry_type, category, source, person_name, amount, notes,
        payment_method, payment_source, is_internal_transfer, transfer_group_id,
        linked_owner_ledger_id, origin, created_by
      ) values (
        v_owner.entry_date, 'receiving', null, 'Petty Cash Top-Up - Abrar', 'Abrar',
        v_owner.amount, v_owner.notes, null, 'staff', true, v_owner.transfer_group_id,
        v_owner.id, 'manual', auth.uid()
      ) returning * into v_cash;
    else
      insert into public.cash_ledger (
        entry_date, entry_type, category, source, person_name, amount, notes,
        payment_method, payment_source, is_internal_transfer, transfer_group_id,
        linked_owner_ledger_id, origin, created_by
      ) values (
        v_owner.entry_date, 'expense', 'Returned to Owner', null, 'Abrar',
        v_owner.amount, v_owner.notes, 'petty_cash', 'staff', true, v_owner.transfer_group_id,
        v_owner.id, 'manual', auth.uid()
      ) returning * into v_cash;
    end if;
    update public.owner_ledger
    set linked_cash_ledger_id = v_cash.id
    where id = v_owner.id
    returning * into v_owner;
  elsif v_internal then
    select * into v_cash from public.cash_ledger where id = v_owner.linked_cash_ledger_id for update;
    if not found or v_cash.linked_owner_ledger_id is distinct from v_owner.id
      or v_cash.transfer_group_id is distinct from v_owner.transfer_group_id
      or v_cash.origin is distinct from 'manual'
      or v_cash.invoice_id is not null or v_cash.sales_receipt_id is not null
      or not v_cash.is_internal_transfer then
      raise exception 'Broken transfer link; reconcile before editing';
    end if;
    if v_owner.entry_type = 'expense' then
      update public.cash_ledger
      set entry_date = v_owner.entry_date,
          entry_type = 'receiving',
          category = null,
          source = 'Petty Cash Top-Up - Abrar',
          person_name = 'Abrar',
          amount = v_owner.amount,
          notes = v_owner.notes,
          payment_method = null,
          payment_source = 'staff',
          is_internal_transfer = true
      where id = v_cash.id
      returning * into v_cash;
    else
      update public.cash_ledger
      set entry_date = v_owner.entry_date,
          entry_type = 'expense',
          category = 'Returned to Owner',
          source = null,
          person_name = 'Abrar',
          amount = v_owner.amount,
          notes = v_owner.notes,
          payment_method = 'petty_cash',
          payment_source = 'staff',
          is_internal_transfer = true
      where id = v_cash.id
      returning * into v_cash;
    end if;
  end if;

  insert into public.transaction_audit (action, table_name, record_id, before_data, after_data, details)
  values (
    case when v_is_new then 'create_owner_' || p_entry_type else 'update_owner_ledger_row' end,
    'owner_ledger', v_owner.id::text,
    case when v_is_new then null else to_jsonb(v_existing) end,
    to_jsonb(v_owner),
    jsonb_build_object('linked_cash_ledger_id', v_owner.linked_cash_ledger_id, 'internal_transfer', v_internal)
  );
  update public.reliable_write_requests r
    set result = jsonb_build_object('owner_entry_id', v_owner.id, 'cash_entry_id', v_owner.linked_cash_ledger_id)
    where r.created_by = auth.uid() and r.operation = 'owner' and r.request_id = p_request_id;
  return query select v_owner.id, v_owner.linked_cash_ledger_id;
end;
$$;

revoke all on function public.save_member_bundle(uuid, text, text, text, text, date, date, text, integer, text, text, jsonb, uuid) from public, anon;
grant execute on function public.save_member_bundle(uuid, text, text, text, text, date, date, text, integer, text, text, jsonb, uuid) to authenticated;
revoke all on function public.create_cash_ledger_entry(date, text, text, text, text, integer, text, text, text, uuid) from public, anon;
grant execute on function public.create_cash_ledger_entry(date, text, text, text, text, integer, text, text, text, uuid) to authenticated;
revoke all on function public.update_cash_ledger_entry(uuid, date, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.update_cash_ledger_entry(uuid, date, text, text, text, text, integer, text, text) to authenticated;
revoke all on function public.save_owner_ledger_entry(uuid, date, text, text, text, text, integer, text, text, uuid) from public, anon;
grant execute on function public.save_owner_ledger_entry(uuid, date, text, text, text, text, integer, text, text, uuid) to authenticated;

-- Validate both books before reusing a historical payment. Never pick an
-- arbitrary row from a duplicate/mismatched ledger. Called only under the
-- membership-cycle or receipt-number transaction lock.
create or replace function public.ensure_reliable_receipt_ledger(
  p_invoice uuid, p_receipt uuid, p_number text, p_amount integer,
  p_source text, p_date date, p_label text, p_person text, p_notes text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row record;
  v_staff boolean := p_source in ('staff', 'raza_manager');
  v_origin text := case when p_invoice is not null then 'membership_payment' else 'quick_receipt' end;
begin
  select count(*) into v_count from (
    select id from public.cash_ledger c where c.invoice_id = p_invoice or c.sales_receipt_id = p_receipt
      or (c.source = p_label and btrim(split_part(c.notes, '|', 1)) = p_number)
    union all
    select id from public.owner_ledger o where o.invoice_id = p_invoice or o.sales_receipt_id = p_receipt
      or (o.source = p_label and btrim(split_part(o.notes, '|', 1)) = p_number)
  ) matching;
  if v_count > 1 then raise exception 'Multiple ledger rows for receipt %; reconcile before retrying', p_number; end if;
  if v_count = 1 then
    select * into v_row from (
      select true as staff_book, c.id, c.entry_type, c.amount, c.payment_source, c.entry_date,
        c.invoice_id, c.sales_receipt_id, c.is_internal_transfer, c.linked_owner_ledger_id as linked_id
      from public.cash_ledger c where c.invoice_id = p_invoice or c.sales_receipt_id = p_receipt
        or (c.source = p_label and btrim(split_part(c.notes, '|', 1)) = p_number)
      union all
      select false, o.id, o.entry_type, o.amount, o.payment_source, o.entry_date,
        o.invoice_id, o.sales_receipt_id, o.is_internal_transfer, o.linked_cash_ledger_id
      from public.owner_ledger o where o.invoice_id = p_invoice or o.sales_receipt_id = p_receipt
        or (o.source = p_label and btrim(split_part(o.notes, '|', 1)) = p_number)
    ) matching;
    if v_row.staff_book is distinct from v_staff or v_row.entry_type is distinct from 'receiving'
      or v_row.amount is distinct from p_amount or v_row.payment_source is distinct from p_source
      or v_row.entry_date is distinct from p_date or v_row.is_internal_transfer
      or v_row.linked_id is not null
      or (v_row.invoice_id is not null and v_row.invoice_id is distinct from p_invoice)
      or (v_row.sales_receipt_id is not null and v_row.sales_receipt_id is distinct from p_receipt) then
      raise exception 'Ledger does not match receipt %; reconcile before retrying', p_number;
    end if;
    if v_staff then
      update public.cash_ledger set origin = v_origin, invoice_id = p_invoice, sales_receipt_id = p_receipt
        where id = v_row.id and (origin is distinct from v_origin
          or invoice_id is distinct from p_invoice or sales_receipt_id is distinct from p_receipt);
    else
      update public.owner_ledger set origin = v_origin, invoice_id = p_invoice, sales_receipt_id = p_receipt
        where id = v_row.id and (origin is distinct from v_origin
          or invoice_id is distinct from p_invoice or sales_receipt_id is distinct from p_receipt);
    end if;
    return;
  end if;
  if v_staff then
    insert into public.cash_ledger (entry_date, entry_type, source, person_name, amount, notes,
      payment_source, is_internal_transfer, origin, invoice_id, sales_receipt_id, created_by)
    values (p_date, 'receiving', p_label, p_person, p_amount, p_number || coalesce(' | ' || p_notes, ''),
      p_source, false, v_origin, p_invoice, p_receipt, auth.uid());
  else
    insert into public.owner_ledger (entry_date, entry_type, source, amount, notes,
      payment_source, is_internal_transfer, origin, invoice_id, sales_receipt_id, created_by)
    values (p_date, 'receiving', p_label, p_amount,
      p_number || ' | ' || p_person || coalesce(' | ' || p_notes, ''),
      p_source, false, v_origin, p_invoice, p_receipt, auth.uid());
  end if;
  insert into public.transaction_audit (action, table_name, record_id, details, created_by)
    values ('ensure_receipt_ledger', case when p_invoice is not null then 'invoices' else 'sales_receipts' end,
      coalesce(p_invoice, p_receipt)::text,
      jsonb_build_object('amount', p_amount, 'payment_source', p_source, 'collection_date', p_date), auth.uid());
end;
$$;
revoke all on function public.ensure_reliable_receipt_ledger(uuid, uuid, text, integer, text, date, text, text, text)
  from public, anon, authenticated;

-- The older standalone patch returned an extra payment_id. Latest production
-- migrations and the app use the two-column result below; DROP handles either.
drop function if exists public.record_membership_payment(uuid, integer, text, date, date, text);
create function public.record_membership_payment(
  p_member_id uuid, p_amount integer, p_payment_source text,
  p_receipt_date date, p_valid_till date, p_note text default null
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_count integer;
  v_standard integer;
  v_recovered boolean := false;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_payment_source is null or p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_receipt_date is null or p_valid_till is null then
    raise exception 'Valid collection and expiry dates are required';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));
  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception 'Member not found'; end if;
  perform i.id from public.invoices i where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type in ('membership', 'edited') order by i.id for update;

  select count(*) into v_count from public.invoices i
    where i.member_id = p_member_id and i.valid_till = p_valid_till
      and i.invoice_type in ('membership', 'edited') and i.status = 'paid';
  if v_count > 1 then raise exception 'Multiple paid invoices for this cycle; reconcile before retrying'; end if;
  select i.* into v_invoice from public.invoices i
    where i.member_id = p_member_id and i.valid_till = p_valid_till
      and i.invoice_type in ('membership', 'edited') and i.status = 'paid';

  -- Historical partial writes are recoverable only with one exact payment.
  select count(*) into v_count from public.payments p join public.invoices i on i.id = p.invoice_id
    where i.member_id = p_member_id and i.valid_till = p_valid_till and i.invoice_type in ('membership', 'edited');
  if v_count > 1 then raise exception 'Multiple payments for this cycle; reconcile before retrying'; end if;
  if v_count = 1 then
    select p.* into v_payment from public.payments p join public.invoices i on i.id = p.invoice_id
      where i.member_id = p_member_id and i.valid_till = p_valid_till
        and i.invoice_type in ('membership', 'edited') for update of p;
    if v_invoice.id is not null and v_invoice.id <> v_payment.invoice_id then
      raise exception 'Payment belongs to a different invoice; reconcile before retrying';
    end if;
    select i.* into v_invoice from public.invoices i where i.id = v_payment.invoice_id;
    if v_invoice.status not in ('sent', 'paid')
      or v_payment.member_id is distinct from p_member_id
      or v_payment.amount is distinct from p_amount
      or v_payment.payment_source is distinct from p_payment_source
      or (v_payment.paid_at at time zone 'Asia/Karachi')::date is distinct from p_receipt_date
      or v_invoice.total_amount is distinct from p_amount then
      raise exception 'Existing payment does not match this request; reconcile before retrying';
    end if;
    perform public.ensure_reliable_receipt_ledger(v_invoice.id, null, v_invoice.invoice_number,
      p_amount, p_payment_source, p_receipt_date, 'Membership receipt', v_member.full_name, v_payment.notes);
    if v_invoice.status = 'paid' then
      return query select v_invoice.id, v_invoice.invoice_number;
      return;
    end if;
    v_recovered := true;
  elsif v_invoice.id is not null then
    raise exception 'Paid invoice has no payment; reconcile before retrying';
  else
    select i.* into v_invoice from public.invoices i
      where i.member_id = p_member_id and i.valid_till = p_valid_till
        and i.invoice_type in ('membership', 'edited') and i.status = 'sent'
      order by (i.invoice_type = 'edited') desc, i.created_at desc, i.id limit 1;
    if v_invoice.id is not null then
      if v_invoice.total_amount <> p_amount then
        raise exception 'Payment must match the agreed invoice total (%)', v_invoice.total_amount;
      end if;
    else
      if not public.is_spaces_owner() and p_amount <> v_member.offered_monthly_rate then
        raise exception 'Payment must match the agreed membership rate';
      end if;
      v_standard := greatest(v_member.standard_monthly_rate, p_amount);
      insert into public.invoices (invoice_number, member_id, invoice_type, issue_date, valid_till,
        standard_amount, discount_amount, subtotal_amount, tax_amount, total_amount, status, edit_note)
      values ('SC-' || to_char(p_receipt_date, 'YYYY') || '-' || upper(replace(gen_random_uuid()::text, '-', '')),
        p_member_id, 'membership', p_receipt_date, p_valid_till,
        v_standard, v_standard - p_amount, p_amount, 0, p_amount, 'sent', p_note)
      returning * into v_invoice;
      -- Line rates are bundle totals, not per-seat rates. Cumulative allocation
      -- preserves all rupees when the owner collects a negotiated amount.
      with lines as (
        select mpi.*, sum(offered_monthly_rate) over () as total,
          sum(offered_monthly_rate) over (order by sort_order, created_at, id) as running
        from public.member_plan_items mpi where mpi.member_id = p_member_id
      ), allocated as (
        select *, (floor(p_amount::numeric * running / nullif(total, 0))
          - floor(p_amount::numeric * (running - offered_monthly_rate) / nullif(total, 0)))::integer as line_amount
        from lines where total > 0
      )
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
        select v_invoice.id, plan_name, seats, round(line_amount::numeric / seats)::integer, line_amount
        from allocated order by sort_order, created_at, id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
          values (v_invoice.id, v_member.plan_name, 1, p_amount, p_amount);
      end if;
    end if;
    if exists (select 1 from public.cash_ledger c where c.invoice_id = v_invoice.id
      or (c.source = 'Membership receipt' and btrim(split_part(c.notes, '|', 1)) = v_invoice.invoice_number))
      or exists (select 1 from public.owner_ledger o where o.invoice_id = v_invoice.id
      or (o.source = 'Membership receipt' and btrim(split_part(o.notes, '|', 1)) = v_invoice.invoice_number)) then
      raise exception 'Invoice already has a ledger receipt but no payment; reconcile before retrying';
    end if;
    insert into public.payments (invoice_id, member_id, paid_at, amount, payment_method, payment_source, reference, notes)
      values (v_invoice.id, p_member_id, p_receipt_date::timestamp at time zone 'Asia/Karachi',
        p_amount, 'cash', p_payment_source, v_invoice.invoice_number, p_note);
    perform public.ensure_reliable_receipt_ledger(v_invoice.id, null, v_invoice.invoice_number,
      p_amount, p_payment_source, p_receipt_date, 'Membership receipt', v_member.full_name, p_note);
  end if;
  update public.invoices set status = 'paid', issue_date = p_receipt_date, updated_at = now() where id = v_invoice.id;
  update public.invoices i set status = 'void', updated_at = now()
    where i.member_id = p_member_id and i.valid_till = p_valid_till and i.id <> v_invoice.id
      and i.invoice_type in ('membership', 'edited') and i.status in ('draft', 'sent');
  insert into public.transaction_audit (action, table_name, record_id, details, created_by)
    values (case when v_recovered then 'reconcile_partial_membership_payment' else 'record_membership_payment' end,
      'invoices', v_invoice.id::text, jsonb_build_object('amount', p_amount,
        'payment_source', p_payment_source, 'collection_date', p_receipt_date, 'valid_till', p_valid_till), auth.uid());
  return query select v_invoice.id, v_invoice.invoice_number;
end;
$$;

create or replace function public.record_quick_receipt(
  p_receipt_number text, p_customer_name text, p_phone text, p_service_name text,
  p_quantity integer, p_unit_rate integer, p_total_amount integer, p_payment_source text,
  p_receipt_date date, p_valid_till date, p_notes text default null
)
returns table(receipt_id uuid, receipt_number text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_receipt public.sales_receipts%rowtype;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_payment_source is null or p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;
  if nullif(btrim(p_receipt_number), '') is null or nullif(btrim(p_customer_name), '') is null
    or nullif(btrim(p_service_name), '') is null then raise exception 'Receipt number, customer and service are required'; end if;
  if coalesce(p_quantity, 0) <= 0 or coalesce(p_unit_rate, 0) < 0 or coalesce(p_total_amount, 0) <= 0 then
    raise exception 'Receipt total and quantity must be greater than zero';
  end if;
  if p_receipt_date is null or p_valid_till is null or p_valid_till < p_receipt_date then
    raise exception 'Valid collection and expiry dates are required';
  end if;
  perform pg_advisory_xact_lock(hashtext('quick:' || btrim(p_receipt_number)));
  select r.* into v_receipt from public.sales_receipts r where r.receipt_number = btrim(p_receipt_number) for update;
  if found then
    if v_receipt.customer_name is distinct from btrim(p_customer_name)
      or nullif(btrim(v_receipt.phone), '') is distinct from nullif(btrim(p_phone), '')
      or v_receipt.service_name is distinct from btrim(p_service_name)
      or v_receipt.quantity is distinct from p_quantity or v_receipt.unit_rate is distinct from p_unit_rate
      or v_receipt.total_amount is distinct from p_total_amount or v_receipt.payment_source is distinct from p_payment_source
      or v_receipt.receipt_date is distinct from p_receipt_date or v_receipt.valid_till is distinct from p_valid_till
      or nullif(btrim(v_receipt.notes), '') is distinct from nullif(btrim(p_notes), '') then
      raise exception 'Receipt number was already used with different data';
    end if;
  else
    insert into public.sales_receipts (receipt_number, customer_name, phone, service_name, quantity, unit_rate,
      total_amount, payment_source, receipt_date, valid_till, notes, created_by)
    values (btrim(p_receipt_number), btrim(p_customer_name), nullif(btrim(p_phone), ''), btrim(p_service_name),
      p_quantity, p_unit_rate, p_total_amount, p_payment_source, p_receipt_date, p_valid_till, nullif(btrim(p_notes), ''), auth.uid())
    returning * into v_receipt;
    insert into public.transaction_audit (action, table_name, record_id, details, created_by)
      values ('record_quick_receipt', 'sales_receipts', v_receipt.id::text,
        jsonb_build_object('amount', p_total_amount, 'payment_source', p_payment_source), auth.uid());
  end if;
  perform public.ensure_reliable_receipt_ledger(null, v_receipt.id, v_receipt.receipt_number,
    p_total_amount, p_payment_source, p_receipt_date, v_receipt.service_name, v_receipt.customer_name, v_receipt.notes);
  return query select v_receipt.id, v_receipt.receipt_number;
end;
$$;

revoke all on function public.record_membership_payment(uuid, integer, text, date, date, text) from public, anon;
grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
revoke all on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) from public, anon;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;

create or replace function public.save_edited_invoice(
  p_member_id uuid, p_invoice_number text, p_issue_date date, p_valid_till date,
  p_amount integer, p_standard_amount integer, p_note text, p_items jsonb
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_member public.members%rowtype; v_invoice public.invoices%rowtype; v_line jsonb; v_sum bigint := 0;
begin
  if not public.is_spaces_owner() then raise exception 'Owner access required'; end if;
  if nullif(btrim(p_invoice_number),'') is null or p_issue_date is null or p_valid_till is null
    or p_valid_till < p_issue_date or coalesce(p_amount,0) <= 0
    or coalesce(p_standard_amount,-1) < 0 then raise exception 'Enter a valid invoice number, dates and amount'; end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found then raise exception 'Member not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invoice lines are required'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Invoice lines are required'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    if nullif(btrim(v_line->>'description'),'') is null or coalesce((v_line->>'quantity')::integer,0)<1
      or coalesce((v_line->>'unit_price')::integer,-1)<0 or coalesce((v_line->>'amount')::integer,-1)<0 then
      raise exception 'Invalid invoice line';
    end if;
    v_sum := v_sum + (v_line->>'amount')::integer;
  end loop;
  if v_sum <> p_amount then raise exception 'Invoice lines do not match the total'; end if;
  select i.* into v_invoice from public.invoices i where i.invoice_number=p_invoice_number;
  if found then
    if v_invoice.member_id is distinct from p_member_id or v_invoice.subtotal_amount is distinct from p_amount
      or v_invoice.valid_till is distinct from p_valid_till or v_invoice.issue_date is distinct from p_issue_date
      or v_invoice.standard_amount is distinct from greatest(p_standard_amount,p_amount)
      or v_invoice.edit_note is distinct from p_note then raise exception 'Invoice number already used'; end if;
    return query select v_invoice.id,v_invoice.invoice_number; return;
  end if;
  if exists(select 1 from public.invoices i where i.member_id=p_member_id and i.valid_till=p_valid_till and i.status='paid') then
    raise exception 'This membership period is already paid';
  end if;
  insert into public.invoices(invoice_number,member_id,invoice_type,issue_date,valid_till,
    standard_amount,discount_amount,subtotal_amount,tax_amount,total_amount,status,edit_note)
  values(p_invoice_number,p_member_id,'edited',p_issue_date,p_valid_till,greatest(p_standard_amount,p_amount),
    greatest(p_standard_amount-p_amount,0),p_amount,0,p_amount,'sent',p_note) returning * into v_invoice;
  insert into public.invoice_items(invoice_id,description,quantity,unit_price,amount)
    select v_invoice.id,value->>'description',(value->>'quantity')::integer,
      (value->>'unit_price')::integer,(value->>'amount')::integer from jsonb_array_elements(p_items);
  update public.invoices i set status='void' where i.member_id=p_member_id and i.valid_till=p_valid_till
    and i.id<>v_invoice.id and i.status in ('sent','draft') and i.invoice_type in ('membership','edited');
  insert into public.transaction_audit(action,table_name,record_id,after_data)
    values('create_edited_invoice','invoices',v_invoice.id::text,to_jsonb(v_invoice));
  return query select v_invoice.id,v_invoice.invoice_number;
end;
$$;
revoke all on function public.save_edited_invoice(uuid,text,date,date,integer,integer,text,jsonb) from public,anon;
grant execute on function public.save_edited_invoice(uuid,text,date,date,integer,integer,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
