# Spaces WhatsApp Receipt Setup

The app is ready to send a PDF receipt automatically after `Mark paid`.
Complete these external setup steps before enabling it for staff.

## 1. Supabase

Run `supabase/whatsapp_receipts_patch.sql` in the Supabase SQL Editor.

Set a WhatsApp copy number for each staff login:

```sql
update public.staff_profiles
set whatsapp_phone = '923001234567'
where user_id = (
  select id from auth.users where email = 'staff@example.com'
);
```

Use international format without `+`. Each logged-in staff member can have a
different copy number.

## 2. Meta WhatsApp Manager

Register the official Spaces WhatsApp number and create a Utility template:

- Template name: `spaces_payment_receipt`
- Language: English (`en_US`)
- Header: Document
- Body:

```text
Hello {{1}}, your payment of {{2}} for {{3}} has been received by Spaces Coworking.
Your membership/service is valid until {{4}}. Receipt number: {{5}}.
The PDF receipt is attached. Thank you.
```

Submit the template for approval. The parameter order must remain exactly as
shown because the app supplies:

1. Customer name
2. Amount
3. Plan or service
4. Validity date
5. Receipt number

Create a permanent system-user token with WhatsApp messaging permissions.

## 3. Vercel Environment Variables

Add these to the Production environment:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_API_VERSION
WHATSAPP_RECEIPT_TEMPLATE=spaces_payment_receipt
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_VERIFY_TOKEN
META_APP_SECRET
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`WHATSAPP_COPY_NUMBER` is an optional fallback when a staff profile does not
have its own `whatsapp_phone`.

Redeploy after saving the variables.

## 4. Meta Webhook

Configure this callback URL in the Meta app:

```text
https://members-ivory.vercel.app/api/whatsapp-webhook
```

Use the same value stored in `WHATSAPP_VERIFY_TOKEN`, then subscribe to the
WhatsApp `messages` webhook field. Delivery, read, and failure updates will be
written to `public.whatsapp_messages`.

## Runtime Behavior

- Payment recording completes before messaging starts.
- A messaging failure never reverses or duplicates the payment.
- Successful receipt sends are idempotent for the same receipt and recipient.
- The receipt dialog shows delivery setup/errors and offers manual WhatsApp
  sharing as a fallback.
