begin;

alter table public.cash_ledger add column if not exists origin text not null default 'manual';
alter table public.cash_ledger add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.cash_ledger add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;
alter table public.owner_ledger add column if not exists origin text not null default 'manual';
alter table public.owner_ledger add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.owner_ledger add column if not exists sales_receipt_id uuid references public.sales_receipts(id) on delete set null;
alter table public.payments add column if not exists payment_source text not null default 'spaces_account';

update public.cash_ledger set origin = 'membership_payment' where source = 'Membership receipt' and origin = 'manual';
update public.owner_ledger set origin = 'membership_payment' where source = 'Membership receipt' and origin = 'manual';
update public.cash_ledger set origin = 'quick_receipt' where source in ('Day Pass', 'Weekly Pass', 'Conference Room') and origin = 'manual';
update public.owner_ledger set origin = 'quick_receipt' where source in ('Day Pass', 'Weekly Pass', 'Conference Room') and origin = 'manual';

update public.cash_ledger ledger set invoice_id = invoice.id
from public.invoices invoice
where ledger.origin = 'membership_payment' and ledger.invoice_id is null
  and position(invoice.invoice_number in coalesce(ledger.notes, '')) = 1;
update public.owner_ledger ledger set invoice_id = invoice.id
from public.invoices invoice
where ledger.origin = 'membership_payment' and ledger.invoice_id is null
  and position(invoice.invoice_number in coalesce(ledger.notes, '')) = 1;
update public.cash_ledger ledger set sales_receipt_id = receipt.id
from public.sales_receipts receipt
where ledger.origin = 'quick_receipt' and ledger.sales_receipt_id is null
  and position(receipt.receipt_number in coalesce(ledger.notes, '')) = 1;
update public.owner_ledger ledger set sales_receipt_id = receipt.id
from public.sales_receipts receipt
where ledger.origin = 'quick_receipt' and ledger.sales_receipt_id is null
  and position(receipt.receipt_number in coalesce(ledger.notes, '')) = 1;

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
  v_existing_payment public.payments%rowtype;
begin
  if not public.is_active_staff() then raise exception 'Active staff login required'; end if;
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then raise exception 'Invalid payment source'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text || ':' || p_valid_till::text || ':membership'));
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;

  select i.id, i.invoice_number into v_invoice_id, v_invoice_number
  from public.invoices i
  where i.member_id = p_member_id and i.valid_till = p_valid_till
    and i.invoice_type in ('membership', 'edited') and i.status = 'paid'
  order by i.created_at desc limit 1;
  if v_invoice_id is not null then
    return query select v_invoice_id, v_invoice_number;
    return;
  end if;

  select payment.* into v_existing_payment
  from public.payments payment
  join public.invoices invoice on invoice.id = payment.invoice_id
  where invoice.member_id = p_member_id and invoice.valid_till = p_valid_till
    and invoice.invoice_type = 'membership' and invoice.status = 'sent'
  order by payment.created_at desc limit 1;

  if v_existing_payment.id is not null then
    if v_existing_payment.amount <> p_amount then
      raise exception 'Existing partial payment amount (%) does not match requested amount (%). Reconcile invoice % before retrying.',
        v_existing_payment.amount, p_amount, v_existing_payment.invoice_id;
    end if;
    select invoice.id, invoice.invoice_number into v_invoice_id, v_invoice_number
    from public.invoices invoice where invoice.id = v_existing_payment.invoice_id;
    update public.invoices set status = 'paid', issue_date = p_receipt_date, updated_at = now()
    where id = v_invoice_id;
    update public.invoices set status = 'void', updated_at = now()
    where member_id = p_member_id and valid_till = p_valid_till and id <> v_invoice_id
      and invoice_type in ('membership', 'edited') and status in ('draft', 'sent');

    update public.cash_ledger set
      origin = 'membership_payment', invoice_id = v_invoice_id,
      entry_date = (v_existing_payment.paid_at at time zone 'Asia/Karachi')::date
    where invoice_id = v_invoice_id
      or (source = 'Membership receipt' and position(v_invoice_number in coalesce(notes, '')) = 1);
    update public.owner_ledger set
      origin = 'membership_payment', invoice_id = v_invoice_id,
      entry_date = (v_existing_payment.paid_at at time zone 'Asia/Karachi')::date
    where invoice_id = v_invoice_id
      or (source = 'Membership receipt' and position(v_invoice_number in coalesce(notes, '')) = 1);

    if not exists (select 1 from public.cash_ledger where invoice_id = v_invoice_id)
      and not exists (select 1 from public.owner_ledger where invoice_id = v_invoice_id) then
      if v_existing_payment.payment_source in ('raza_manager', 'staff') then
        insert into public.cash_ledger (
          entry_date, entry_type, category, source, person_name, amount, notes,
          payment_source, is_internal_transfer, origin, invoice_id
        ) values (
          (v_existing_payment.paid_at at time zone 'Asia/Karachi')::date, 'receiving', null,
          'Membership receipt', v_member.full_name, p_amount, v_invoice_number || ' | recovered partial payment',
          v_existing_payment.payment_source, false, 'membership_payment', v_invoice_id
        );
      else
        insert into public.owner_ledger (
          entry_date, entry_type, category, source, payment_source, amount, notes,
          is_internal_transfer, origin, invoice_id
        ) values (
          (v_existing_payment.paid_at at time zone 'Asia/Karachi')::date, 'receiving', null,
          'Membership receipt', v_existing_payment.payment_source, p_amount,
          v_invoice_number || ' | ' || v_member.full_name || ' | recovered partial payment',
          false, 'membership_payment', v_invoice_id
        );
      end if;
    end if;

    insert into public.transaction_audit (action, table_name, record_id, after_data, details)
    values ('reconcile_partial_membership_payment', 'invoices', v_invoice_id::text,
      jsonb_build_object('invoice_number', v_invoice_number, 'amount', p_amount, 'payment_source', v_existing_payment.payment_source),
      jsonb_build_object('member_id', p_member_id, 'valid_till', p_valid_till));
    return query select v_invoice_id, v_invoice_number;
    return;
  end if;

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
    v_invoice_number := 'SC-' || extract(year from p_receipt_date)::text || '-' || to_char(clock_timestamp(), 'MMDDHH24MISSMS');
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
    jsonb_build_object('invoice_number', v_invoice_number, 'member_id', p_member_id, 'amount', p_amount, 'payment_source', p_payment_source),
    jsonb_build_object('member_name', v_member.full_name, 'valid_till', p_valid_till, 'collection_date', p_receipt_date, 'settled_edited_invoice', v_reused_edited));

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
  if p_payment_source not in ('spaces_account', 'raza_manager', 'staff', 'abrar_owner') then raise exception 'Invalid payment source'; end if;
  if coalesce(p_quantity, 0) <= 0 or coalesce(p_unit_rate, 0) <= 0 or coalesce(p_total_amount, 0) <= 0 then raise exception 'Receipt amount must be greater than zero'; end if;
  perform pg_advisory_xact_lock(hashtext('quick:' || p_receipt_number));

  select id into v_receipt_id from public.sales_receipts where receipt_number = p_receipt_number;
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
    jsonb_build_object('receipt_number', p_receipt_number, 'customer_name', p_customer_name, 'amount', p_total_amount, 'payment_source', p_payment_source),
    jsonb_build_object('service_name', p_service_name, 'quantity', p_quantity));
  return query select v_receipt_id, p_receipt_number;
end;
$$;

revoke all on function public.record_membership_payment(uuid, integer, text, date, date, text) from public;
grant execute on function public.record_membership_payment(uuid, integer, text, date, date, text) to authenticated;
revoke all on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) from public;
grant execute on function public.record_quick_receipt(text, text, text, text, integer, integer, integer, text, date, date, text) to authenticated;

drop policy if exists "Authenticated staff can manage payments" on public.payments;
drop policy if exists "Owner can read payments" on public.payments;
drop policy if exists "Staff can read payments" on public.payments;
create policy "Owner can read payments" on public.payments for select to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));
drop policy if exists "Staff can update payments" on public.payments;
drop policy if exists "Owner can update payments" on public.payments;
create policy "Owner can update payments" on public.payments for update to authenticated
using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
)) with check (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));
drop policy if exists "Staff can delete payments" on public.payments;
drop policy if exists "Owner can delete payments" on public.payments;
create policy "Owner can delete payments" on public.payments for delete to authenticated using (exists (
  select 1 from public.staff_profiles
  where user_id = auth.uid() and active = true and role = 'owner'
));

drop policy if exists "Authenticated staff can manage invoices" on public.invoices;
drop policy if exists "Staff can update invoices" on public.invoices;
drop policy if exists "Staff can update unpaid invoices" on public.invoices;
create policy "Staff can update unpaid invoices" on public.invoices for update to authenticated
using (
  public.is_active_staff()
  and (
    status <> 'paid'
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid() and active = true and role = 'owner'
    )
  )
)
with check (
  public.is_active_staff()
  and (
    status <> 'paid'
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid() and active = true and role = 'owner'
    )
  )
);
drop policy if exists "Staff can delete invoices" on public.invoices;
drop policy if exists "Owner can delete unpaid invoices" on public.invoices;
create policy "Owner can delete unpaid invoices" on public.invoices for delete to authenticated
using (
  status <> 'paid'
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true and role = 'owner'
  )
);

drop policy if exists "Staff can update recent own cash ledger" on public.cash_ledger;
drop policy if exists "Staff can update recent manual cash ledger" on public.cash_ledger;
create policy "Staff can update recent manual cash ledger" on public.cash_ledger for update to authenticated
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
create policy "Staff admins can delete manual cash ledger" on public.cash_ledger for delete to authenticated
using (origin = 'manual' and public.is_staff_admin());

drop policy if exists "Owner can update owner ledger" on public.owner_ledger;
drop policy if exists "Owner can update manual owner ledger" on public.owner_ledger;
create policy "Owner can update manual owner ledger" on public.owner_ledger for update to authenticated
using (
  origin = 'manual'
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true and role = 'owner'
  )
)
with check (
  origin = 'manual'
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true and role = 'owner'
  )
);
drop policy if exists "Owner can delete owner ledger" on public.owner_ledger;
drop policy if exists "Owner can delete manual owner ledger" on public.owner_ledger;
create policy "Owner can delete manual owner ledger" on public.owner_ledger for delete to authenticated
using (
  origin = 'manual'
  and exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and active = true and role = 'owner'
  )
);

notify pgrst, 'reload schema';
commit;
