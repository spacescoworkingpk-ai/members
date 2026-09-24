# Invoice Sharing

## Staff Workflow

1. Open Members > Payments. Unpaid periods are ordered oldest first.
2. Generate invoice saves an unpaid invoice. Repeating it reuses the saved invoice.
3. Open WhatsApp opens the member's number with a message and private PDF link.
   The manager reviews and presses Send inside WhatsApp. The app does not claim delivery.
4. Mark paid is a separate action requiring the collection source. It settles the
   displayed membership period and saved amount through the existing atomic payment RPC.
5. A paid receipt can also be shared. Existing valid links reflect its paid status.

One-off quick receipts retain their existing explicitly paid workflow and PDF
attachment sharing. They do not use the new membership invoice-link flow.

## Security

- Links contain 32 cryptographically random bytes, not customer or invoice IDs.
- Only SHA-256 token hashes are stored in `invoice_share_links`.
- Links expire after 90 days. Revoke shared links disables all links for that invoice.
- Voiding an invoice permanently revokes its links, even if the invoice is restored.
- The resolver checks expiry, revocation, and current invoice status on every request.
- Invoice amounts and line items come from the saved invoice, not current member rates.
- PDF responses are private/no-store, noindex, no-referrer, and not frameable.
- The PDF contains only invoice details and customer name/phone, not internal notes.
- A valid link is a bearer credential: anyone it is forwarded to can open it until
  revoked or expired. Do not paste full links into analytics or support logs.
- Expiry/revocation cannot recall an already downloaded PDF.

## Deployment

Run `supabase/migrations/20260923_private_invoice_links.sql` after the September 6
reliable-write migration. It is safe to re-run. It adds invoice-period metadata and
sharing tables/functions; it does not change amounts, payments, or ledger balances.

Vercel server-side environment:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` use the existing Spaces project defaults
  unless explicitly configured.
- `SUPABASE_SERVICE_ROLE_KEY` is required by the PDF resolver only. Keep it in
  Vercel's protected environment, never frontend JavaScript or Git.

No Meta app, WhatsApp access token, or registered sender number is required for
this manual click-to-chat flow. The signed-in WhatsApp app/account sends the message.

Endpoints: authenticated `POST /api/invoice-link`; private bearer `GET /i/<token>`.
Both the custom domain and Vercel domain must route to this deployment.

## Verification

- `npm test`: application regression and endpoint access-control tests.
- `scripts/test-database.mjs`: isolated empty local PostgreSQL database only;
  exercises permissions, invoice reuse, settlement, ledger conservation and revocation.
- Never create sample payments or invoices in production for testing.

If a share action fails after generation, the unpaid invoice remains saved. Reopen
it and retry sharing. If sharing fails after payment, the payment remains saved;
never re-enter the payment to fix a sharing failure.
