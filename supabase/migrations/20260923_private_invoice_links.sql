-- Requires 20260906_reliable_write_paths.sql. Safe to re-run.
-- No payments, ledgers, member rates, or balances are changed.
begin;

alter table public.invoices add column if not exists membership_from date;

-- Always anchor to the ORIGINAL joining day, not a previously clamped date.
create or replace function public.membership_month_anchor(p_joining date, p_month date)
returns date language sql immutable strict set search_path = public, pg_temp
as $$
  select date_trunc('month', p_month)::date
    + least(extract(day from p_joining)::integer,
      extract(day from date_trunc('month', p_month) + interval '1 month - 1 day')::integer) - 1;
$$;
revoke all on function public.membership_month_anchor(date, date) from public, anon, authenticated;

create or replace function public.canonical_membership_from(p_joining date, p_valid_till date)
returns date language sql immutable strict set search_path = public, pg_temp
as $$
  select case when p_valid_till = public.membership_month_anchor(p_joining, p_valid_till)
    and public.membership_month_anchor(p_joining, (p_valid_till - interval '1 month')::date) >= p_joining
    then public.membership_month_anchor(p_joining, (p_valid_till - interval '1 month')::date) end;
$$;
revoke all on function public.canonical_membership_from(date, date) from public, anon, authenticated;

-- issue_date on paid rows is a collection date. Only backfill cycles that can
-- be established from joining_date + valid_till; leave irregular history NULL.
update public.invoices i
set membership_from = public.canonical_membership_from(m.joining_date, i.valid_till)
from public.members m
where m.id = i.member_id and i.invoice_type in ('membership', 'edited')
  and i.membership_from is null
  and public.canonical_membership_from(m.joining_date, i.valid_till) is not null;

create or replace function public.preserve_invoice_membership_from()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.membership_from is null and new.invoice_type in ('membership', 'edited') then
    select public.canonical_membership_from(m.joining_date, new.valid_till)
      into new.membership_from from public.members m where m.id = new.member_id;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_invoice_membership_from() from public, anon, authenticated;
drop trigger if exists invoices_preserve_membership_from on public.invoices;
create trigger invoices_preserve_membership_from
before insert or update of issue_date on public.invoices
for each row execute function public.preserve_invoice_membership_from();

create or replace function public.generate_membership_invoice(p_member_id uuid, p_valid_till date)
returns table(invoice_id uuid, invoice_number text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_invoice public.invoices%rowtype;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_from date;
  v_until date;
  v_paid integer;
  v_sent integer;
  v_edited integer;
  v_count integer;
  v_standard integer;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_member_id is null or p_valid_till is null or not isfinite(p_valid_till) then
    raise exception 'Member and valid membership expiry date are required';
  end if;
  -- Same key and lock order as record_membership_payment. save_member_bundle
  -- and save_edited_invoice also serialize on this member row.
  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));
  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception 'Member not found'; end if;
  perform i.id from public.invoices i where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type in ('membership', 'edited') order by i.id for update;

  v_from := public.membership_month_anchor(v_member.joining_date, v_today);
  if v_from > v_today then
    v_from := public.membership_month_anchor(v_member.joining_date, (v_today - interval '1 month')::date);
  end if;
  v_from := greatest(v_from, v_member.joining_date);
  v_until := public.membership_month_anchor(v_member.joining_date, (date_trunc('month', v_from) + interval '1 month')::date);

  select count(*) filter (where i.status = 'paid'), count(*) filter (where i.status = 'sent'),
    count(*) filter (where i.status = 'sent' and i.invoice_type = 'edited')
  into v_paid, v_sent, v_edited from public.invoices i
  where i.member_id = p_member_id and i.valid_till = p_valid_till and i.invoice_type in ('membership', 'edited');
  if v_paid > 1 or v_edited > 1 or v_sent - v_edited > 1
    or (v_paid > 0 and v_sent > 0) then
    raise exception 'Ambiguous invoices for this membership period; reconcile before retrying';
  end if;
  if p_valid_till <> v_until and v_sent = 0 then
    raise exception 'Only the current membership period or an existing unpaid invoice period is allowed';
  end if;
  select i.* into v_invoice from public.invoices i
  where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type in ('membership', 'edited') and i.status in ('sent', 'paid')
  order by (i.status = 'paid') desc, (i.invoice_type = 'edited') desc, i.id limit 1;
  if found then
    -- Saved invoice content is authoritative, even after the member is edited.
    return query select v_invoice.id, v_invoice.invoice_number;
    return;
  end if;
  if v_member.status <> 'active' then
    raise exception 'Archived or paused members cannot receive new membership invoices';
  end if;
  if exists (select 1 from public.invoices i where i.member_id = p_member_id
    and i.valid_till = p_valid_till and i.invoice_type in ('membership', 'edited') and i.status = 'draft') then
    raise exception 'Existing draft invoice requires reconciliation before generation';
  end if;
  if exists (select 1 from public.payments p join public.invoices i on i.id = p.invoice_id
    where i.member_id = p_member_id and i.valid_till = p_valid_till and i.invoice_type in ('membership', 'edited')) then
    raise exception 'Existing payment requires reconciliation before generation';
  end if;
  if v_member.offered_monthly_rate <= 0 then raise exception 'Agreed membership rate must be greater than zero'; end if;
  v_standard := greatest(v_member.standard_monthly_rate, v_member.offered_monthly_rate);
  insert into public.invoices (invoice_number, member_id, invoice_type, issue_date, membership_from, valid_till,
    standard_amount, discount_amount, subtotal_amount, tax_amount, total_amount, status)
  values ('SC-' || to_char(v_from, 'YYYY') || '-' || upper(replace(gen_random_uuid()::text, '-', '')),
    p_member_id, 'membership', v_from, v_from, p_valid_till, v_standard,
    v_standard - v_member.offered_monthly_rate, v_member.offered_monthly_rate, 0, v_member.offered_monthly_rate, 'sent')
  returning * into v_invoice;
  -- Bundle rates are line totals, not per-seat rates. Match the accounting
  -- RPC's cumulative allocation so every rupee is retained.
  with lines as (
    select mpi.*, sum(offered_monthly_rate) over () as total,
      sum(offered_monthly_rate) over (order by sort_order, created_at, id) as running
    from public.member_plan_items mpi where mpi.member_id = p_member_id
  ), allocated as (
    select *, (floor(v_member.offered_monthly_rate::numeric * running / nullif(total, 0))
      - floor(v_member.offered_monthly_rate::numeric * (running - offered_monthly_rate) / nullif(total, 0)))::integer as line_amount
    from lines where total > 0
  )
  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
    select v_invoice.id, plan_name, seats, round(line_amount::numeric / seats)::integer, line_amount
    from allocated order by sort_order, created_at, id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
    values (v_invoice.id, v_member.plan_name, 1, v_member.offered_monthly_rate, v_member.offered_monthly_rate);
  end if;
  insert into public.transaction_audit (action, table_name, record_id, details, created_by)
  values ('generate_membership_invoice', 'invoices', v_invoice.id::text,
    jsonb_build_object('membership_from', v_from, 'valid_till', p_valid_till, 'amount', v_invoice.total_amount), auth.uid());
  return query select v_invoice.id, v_invoice.invoice_number;
end;
$$;
revoke all on function public.generate_membership_invoice(uuid, date) from public, anon;
grant execute on function public.generate_membership_invoice(uuid, date) to authenticated;

create table if not exists public.invoice_share_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
create index if not exists invoice_share_links_invoice_id_idx on public.invoice_share_links(invoice_id);
alter table public.invoice_share_links enable row level security;
revoke all on public.invoice_share_links from public, anon, authenticated;
-- The endpoint must join current invoices/items and reject void invoices,
-- expired links and revoked links on EVERY request, including PDF requests.
comment on table public.invoice_share_links is
  'Private SHA-256 hashes only. Service endpoint must enforce expires_at, revoked_at and invoice.status <> void; render live saved invoice rows.';
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.invoice_share_links to service_role;
  end if;
end $$;

create or replace function public.create_invoice_share_link(p_invoice_id uuid, p_token_hash text)
returns table(id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_invoice public.invoices%rowtype; v_link public.invoice_share_links%rowtype;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A lowercase SHA-256 token hash is required';
  end if;
  select * into v_invoice from public.invoices where invoices.id = p_invoice_id for update;
  if not found or v_invoice.status not in ('sent', 'paid') then raise exception 'Sent or paid invoice required'; end if;
  insert into public.invoice_share_links (invoice_id, token_hash, created_by)
    values (p_invoice_id, p_token_hash, auth.uid()) returning * into v_link;
  insert into public.transaction_audit (action, table_name, record_id, details, created_by)
    values ('create_invoice_share_link', 'invoice_share_links', v_link.id::text,
      jsonb_build_object('invoice_id', p_invoice_id, 'expires_at', v_link.expires_at), auth.uid());
  return query select v_link.id, v_link.expires_at;
end;
$$;

create or replace function public.revoke_invoice_share_links(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_invoice public.invoices%rowtype; v_count integer;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  update public.invoice_share_links set revoked_at = now()
    where invoice_id = p_invoice_id and revoked_at is null;
  get diagnostics v_count = row_count;
  insert into public.transaction_audit (action, table_name, record_id, details, created_by)
    values ('revoke_invoice_share_links', 'invoices', p_invoice_id::text,
      jsonb_build_object('revoked_count', v_count), auth.uid());
end;
$$;
revoke all on function public.create_invoice_share_link(uuid, text) from public, anon;
revoke all on function public.revoke_invoice_share_links(uuid) from public, anon;
grant execute on function public.create_invoice_share_link(uuid, text) to authenticated;
grant execute on function public.revoke_invoice_share_links(uuid) to authenticated;

-- Voiding invalidates existing capabilities permanently, even if an invoice
-- is later restored. Lock order remains invoice first, then share-link rows.
create or replace function public.revoke_void_invoice_share_links()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    update public.invoice_share_links set revoked_at = now()
      where invoice_id = new.id and revoked_at is null;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      insert into public.transaction_audit (action, table_name, record_id, details, created_by)
        values ('revoke_invoice_share_links', 'invoices', new.id::text,
          jsonb_build_object('revoked_count', v_count, 'reason', 'invoice_void'), auth.uid());
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_void_invoice_share_links() from public, anon, authenticated;
drop trigger if exists invoices_revoke_void_share_links on public.invoices;
create trigger invoices_revoke_void_share_links after update of status on public.invoices
for each row execute function public.revoke_void_invoice_share_links();

notify pgrst, 'reload schema';
commit;
