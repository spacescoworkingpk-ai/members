import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20260715_accounting_integrity.sql", import.meta.url),
  "utf8"
);
const whatsapp = await readFile(new URL("../lib/whatsapp.js", import.meta.url), "utf8");

test("generated ledger rows retain their current values and cannot be edited", () => {
  assert.match(app, /if \(selected && !options\.includes\(selected\)\) options\.unshift\(selected\)/);
  assert.match(app, /if \(isSystemLedgerEntry\(entry\)\) return false/);
  assert.match(app, /if \(isSystemLedgerEntry\(existing\)\) throw new Error\("Receipt ledger rows are locked/);
});

test("membership collection settles the edited same-cycle amount on the actual date", () => {
  assert.match(app, /member\.editedInvoice\?\.total_amount \?\? member\.monthlyFee/);
  assert.match(app, /p_receipt_date: isoToday\(\)/);
  assert.match(migration, /i\.invoice_type = 'edited' and i\.status = 'sent'/);
  assert.match(migration, /status = 'paid'/);
});

test("payment and quick receipt writes require atomic RPCs", () => {
  assert.doesNotMatch(app, /await recordMembershipPaymentFallback\(/);
  assert.doesNotMatch(app, /await recordQuickReceiptFallback\(/);
  assert.match(app, /could not be saved atomically/g);
});

test("canonical RPCs require active staff and structural ledger references", () => {
  const staffChecks = migration.match(/if not public\.is_active_staff\(\)/g) || [];
  assert.equal(staffChecks.length, 2);
  assert.match(migration, /origin, invoice_id/);
  assert.match(migration, /origin, sales_receipt_id/);
  assert.match(migration, /'membership_payment'/);
  assert.match(migration, /'quick_receipt'/);
  assert.match(migration, /reconcile_partial_membership_payment/);
  assert.match(migration, /Existing partial payment amount/);
});

test("financial history mutations are owner-only and paid invoices cannot be deleted", () => {
  assert.match(migration, /role = 'owner'/);
  assert.match(migration, /Owner can read payments/);
  assert.match(migration, /Owner can update payments/);
  assert.match(migration, /Owner can delete payments/);
  assert.match(migration, /status <> 'paid'/);
  assert.match(migration, /origin = 'manual'/);
});

test("unpaid receipt PDFs are visibly marked", () => {
  assert.match(app, /DRAFT \/ UNPAID/);
  assert.match(whatsapp, /UNPAID/);
});
