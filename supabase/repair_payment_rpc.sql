alter table public.payments
add column if not exists payment_source text not null default 'spaces_account'
check (payment_source in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner'));

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
  if not exists (
    select 1
    from public.staff_profiles
    where user_id = auth.uid()
      and active = true
  ) then
    raise exception 'Active staff login required';
  end if;

  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then
    raise exception 'Invalid payment source';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));

  select *
  into v_member
  from public.members
  where id = p_member_id;

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
    begin
      insert into public.transaction_audit (action, table_name, record_id, details)
      values (
        'membership_payment_duplicate_blocked',
        'invoices',
        v_invoice_id::text,
        jsonb_build_object('member_id', p_member_id, 'valid_till', p_valid_till, 'payment_source', p_payment_source)
      );
    exception when undefined_table or undefined_column then
      null;
    end;
    return query select v_invoice_id, v_invoice_number;
    return;
  end if;

  v_standard_amount := greatest(coalesce(v_member.standard_monthly_rate, 0), coalesce(p_amount, 0));
  v_discount_amount := greatest(0, v_standard_amount - coalesce(p_amount, 0));
  v_invoice_number := 'SC-' || extract(year from current_date)::text || '-' || to_char(clock_timestamp(), 'MMDDHH24MISSMS');

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
    p_receipt_date,
    p_valid_till,
    v_standard_amount,
    v_discount_amount,
    p_amount,
    0,
    p_amount,
    'paid',
    p_note
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select
    v_invoice_id,
    mpi.plan_name,
    mpi.seats,
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
      v_member.plan_name,
      greatest(v_member.seats, 1),
      round(p_amount::numeric / greatest(v_member.seats, 1))::integer,
      p_amount
    );
  end if;

  insert into public.payments (invoice_id, member_id, amount, payment_method, payment_source, reference, notes)
  values (v_invoice_id, p_member_id, p_amount, 'cash', p_payment_source, v_invoice_number, p_note);

  begin
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
        is_internal_transfer
      )
      values (
        p_receipt_date,
        'receiving',
        null,
        'Membership receipt',
        v_member.full_name,
        p_amount,
        v_invoice_number || coalesce(' | ' || p_note, ''),
        p_payment_source,
        false
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
        is_internal_transfer
      )
      values (
        p_receipt_date,
        'receiving',
        null,
        'Membership receipt',
        p_payment_source,
        p_amount,
        v_invoice_number || ' | ' || v_member.full_name || coalesce(' | ' || p_note, ''),
        false
      );
    end if;
  exception when undefined_table or undefined_column then
    null;
  end;

  begin
    insert into public.transaction_audit (action, table_name, record_id, after_data, details)
    values (
      'record_membership_payment',
      'invoices',
      v_invoice_id::text,
      jsonb_build_object('invoice_number', v_invoice_number, 'member_id', p_member_id, 'amount', p_amount, 'payment_source', p_payment_source),
      jsonb_build_object('member_name', v_member.full_name, 'valid_till', p_valid_till)
    );
  exception when undefined_table or undefined_column then
    null;
  end;

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
notify pgrst, 'reload schema';
