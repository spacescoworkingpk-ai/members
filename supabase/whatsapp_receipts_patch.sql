alter table public.staff_profiles
add column if not exists whatsapp_phone text;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  member_id uuid references public.members(id) on delete set null,
  recipient_type text not null check (recipient_type in ('customer', 'staff_copy')),
  recipient_phone text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  meta_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_meta_message_id_key
on public.whatsapp_messages (meta_message_id)
where meta_message_id is not null;

create index if not exists whatsapp_messages_invoice_number_idx
on public.whatsapp_messages (invoice_number, created_at desc);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "Staff can read WhatsApp messages" on public.whatsapp_messages;
create policy "Staff can read WhatsApp messages"
on public.whatsapp_messages for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Staff can create WhatsApp messages" on public.whatsapp_messages;
create policy "Staff can create WhatsApp messages"
on public.whatsapp_messages for insert
to authenticated
with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "Staff can update own WhatsApp messages" on public.whatsapp_messages;
create policy "Staff can update own WhatsApp messages"
on public.whatsapp_messages for update
to authenticated
using (public.is_active_staff() and created_by = auth.uid())
with check (public.is_active_staff() and created_by = auth.uid());

drop trigger if exists whatsapp_messages_set_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_set_updated_at
before update on public.whatsapp_messages
for each row execute function public.set_updated_at();

grant select, insert, update on public.whatsapp_messages to authenticated;

-- Set the copy number for each staff login. Use international format without "+".
-- update public.staff_profiles
-- set whatsapp_phone = '923001234567'
-- where user_id = (select id from auth.users where email = 'staff@example.com');
