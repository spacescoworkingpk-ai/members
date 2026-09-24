import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { database, resolveInvoiceToken, tokenHash, savedInvoiceDocument } from "../lib/invoice-access.js";
import invoiceLink from "../api/invoice-link.js";
import sharedInvoice from "../api/shared-invoice.js";
import { createApp, deferred, jsonResponse } from "./helpers/app-harness.mjs";

const id = "12345678-1234-1234-1234-123456789abc";
const invoice = {
  id, invoice_number: "SC-TEST", invoice_type: "membership", status: "sent", issue_date: "2026-09-07",
  membership_from: "2026-09-07", valid_till: "2026-10-07", standard_amount: 17500,
  discount_amount: 2500, subtotal_amount: 15000, tax_amount: 0, total_amount: 15000,
  members: { full_name: "Test Member", phone: "923001234567" },
  invoice_items: [{ id, description: "Dedicated Desk", quantity: 1, unit_price: 15000, amount: 15000, created_at: "2026-09-07" }]
};
function responseRecorder() {
  return { headers: {}, code: null, payload: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; }
  };
}
async function withDatabase(run, overrides = {}) {
  const originalFetch = globalThis.fetch;
  const previous = { ...process.env };
  process.env.SUPABASE_URL = "https://test.supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "test-public";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-private";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ url, path, options, body: options.body && JSON.parse(options.body) });
    if (overrides.fetch) return overrides.fetch(url, options);
    if (path === "/auth/v1/user") return jsonResponse({ id: "staff-id" });
    if (path === "/rest/v1/staff_profiles") return jsonResponse(overrides.inactive ? [] : [{ user_id: "staff-id" }]);
    if (path === "/rest/v1/invoices") return jsonResponse([overrides.invoice || invoice]);
    if (path === "/rest/v1/invoice_share_links") return jsonResponse(overrides.links ?? [{ invoice_id: id, expires_at: "2099-01-01", revoked_at: null }]);
    if (path === "/rest/v1/rpc/create_invoice_share_link") return jsonResponse([{ id, expires_at: "2099-01-01" }]);
    if (path === "/rest/v1/rpc/revoke_invoice_share_links") return jsonResponse(null);
    throw new Error(`Unexpected test path ${path}`);
  };
  try { await run(calls); }
  finally {
    globalThis.fetch = originalFetch;
    for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
}

test("issuing a private link stores only a hash and does not accept posted PDF amounts", async () => {
  await withDatabase(async (calls) => {
    const response = responseRecorder();
    await invoiceLink({ method: "POST", headers: { authorization: "Bearer staff-token" },
      body: { invoiceId: id, action: "create", amount: 1, phone: "attacker", receipt: { total: 1 } } }, response);
    assert.equal(response.code, 200);
    const capability = response.payload.path.slice(3);
    assert.match(capability, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(capability, "base64url").length, 32);
    const stored = calls.find((call) => call.path.endsWith("create_invoice_share_link"));
    assert.deepEqual(stored.body, { p_invoice_id: id, p_token_hash: tokenHash(capability) });
    assert.equal(JSON.stringify(stored).includes(capability), false);
    assert.equal(response.payload.receipt.total, 15000);
    assert.equal(response.payload.receipt.phone, invoice.members.phone);
    assert.equal(calls.some((call) => /payments|ledger|record_membership/.test(call.path)), false);
    assert.match(response.headers["Cache-Control"], /no-store/);
  });
});

test("sharing endpoints require real active-staff authentication", async () => {
  await withDatabase(async (calls) => {
    const response = responseRecorder();
    await invoiceLink({ method: "POST", headers: {}, body: { invoiceId: id, action: "create" } }, response);
    assert.equal(response.code, 401);
    assert.equal(calls.length, 0);
  });
  await withDatabase(async (calls) => {
    const response = responseRecorder();
    await invoiceLink({ method: "POST", headers: { authorization: "Bearer inactive" }, body: { invoiceId: id, action: "create" } }, response);
    assert.equal(response.code, 403);
    assert.equal(calls.length, 2);
  }, { inactive: true });
});

test("numeric, malformed and array tokens fail before any database access", async () => {
  await withDatabase(async (calls) => {
    for (const token of ["1", id, "a".repeat(42), "a".repeat(44), ["a".repeat(43)], "x/".repeat(22)]) {
      await assert.rejects(resolveInvoiceToken(token), { status: 404 });
    }
    assert.equal(calls.length, 0);
  });
});

test("unknown, expired, revoked, void and draft links have identical public failures", async () => {
  const cases = [
    { links: [] },
    { links: [{ invoice_id: id, expires_at: "2020-01-01" }] },
    { links: [{ invoice_id: id, expires_at: "2099-01-01", revoked_at: "2026-01-01" }] },
    { invoice: { ...invoice, status: "void" } },
    { invoice: { ...invoice, status: "draft" } }
  ];
  const messages = [];
  for (const fixture of cases) await withDatabase(async () => {
    const response = responseRecorder();
    await sharedInvoice({ method: "GET", query: { token: randomBytes(32).toString("base64url") } }, response);
    assert.equal(response.code, 404);
    assert.match(response.headers["Cache-Control"], /no-store/);
    assert.equal(response.headers["Referrer-Policy"], "no-referrer");
    messages.push(response.payload);
  }, fixture);
  assert.equal(new Set(messages).size, 1);
});

test("saved invoice lines and periods survive later member changes and paid issue dates", async () => {
  await withDatabase(async () => {
    const result = await savedInvoiceDocument(id, "staff-token");
    assert.equal(result.issuedDate, "2026-09-07");
    assert.equal(result.total, 15000);
    assert.equal(result.lines[0].unitPrice, 15000);
    assert.equal(result.documentStatus, "PAID");
    assert.equal(result.discount, 0, "an agreed rate is not displayed as an edited discount");
  }, { invoice: { ...invoice, status: "paid", issue_date: "2026-09-23" } });
});

test("revoking a link uses the authenticated RPC and does not touch payments", async () => {
  await withDatabase(async (calls) => {
    const response = responseRecorder();
    await invoiceLink({ method: "POST", headers: { authorization: "Bearer staff-token" }, body: { invoiceId: id, action: "revoke" } }, response);
    assert.equal(response.code, 200);
    assert.deepEqual(calls.at(-1).body, { p_invoice_id: id });
    assert.equal(calls.at(-1).path, "/rest/v1/rpc/revoke_invoice_share_links");
  });
});

test("public PDF is a real PDF with private headers and no invoice identifier in filename", async () => {
  await withDatabase(async () => {
    const response = responseRecorder();
    await sharedInvoice({ method: "GET", query: { token: randomBytes(32).toString("base64url") } }, response);
    assert.equal(response.code, 200);
    assert.equal(response.payload.subarray(0, 5).toString(), "%PDF-");
    assert.equal(response.headers["Content-Disposition"], 'inline; filename="spaces-invoice.pdf"');
    assert.match(response.headers["X-Robots-Tag"], /noindex/);
  });
});

test("upstream failures do not expose database errors or service keys", async () => {
  await withDatabase(async () => {
    await assert.rejects(database("/rest/v1/invoices", null, {}, true), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.message.includes("secret"), false);
      return true;
    });
  }, { fetch: () => jsonResponse({ message: "secret database contents" }, 500) });
});

test("month-end membership cycles stay anchored and future joins do not start early", () => {
  const app = createApp();
  assert.deepEqual(JSON.parse(JSON.stringify(app.call("membershipCycle", { joiningDate: "2026-01-31" }, new Date("2026-02-28T12:00:00")))),
    { from: "2026-02-28", validTill: "2026-03-31" });
  assert.deepEqual(JSON.parse(JSON.stringify(app.call("membershipCycle", { joiningDate: "2027-01-31" }, new Date("2026-09-23T12:00:00")))),
    { from: "2027-01-31", validTill: "2027-02-28" });
});

test("generating an invoice calls no payment or ledger RPC and prepares a targeted chat", async () => {
  const app = createApp({ fetch: ({ url, body }) => {
    if (url.endsWith("/rpc/generate_membership_invoice")) return jsonResponse([{ invoice_id: id, invoice_number: "SC-TEST" }]);
    if (url === "/api/invoice-link") return jsonResponse({ receipt: {
      invoiceId: "SC-TEST", customerName: "Test Member", phone: "923001234567", description: "Dedicated Desk",
      quantity: 1, lines: [{ description: "Dedicated Desk", quantity: 1, unitPrice: 15000, amount: 15000 }],
      issuedDate: "2026-09-07", validTill: "2026-10-07", standardPrice: 15000, unitPrice: 15000,
      discount: 0, amount: 15000, tax: 0, total: 15000, documentStatus: "UNPAID"
    }, ...(body.action === "create" ? { path: `/i/${"a".repeat(43)}`, expiresAt: "2026-12-23" } : {}) });
    throw new Error("Unexpected request");
  } });
  app.signIn();
  app.run('window.location.origin = "https://spaces.example"; refreshAfterWrite = async () => true; prefetchReceiptPdf = () => {}');
  await app.call("generateMemberInvoice", { id: "test-member", name: "Test Member", validTill: "2026-10-07" });
  assert.equal(app.calls.length, 3);
  assert.match(app.get("currentReceiptShare").whatsappUrl, /^https:\/\/wa.me\/923001234567\?text=/);
  assert.equal(app.get("currentReceiptShare").receipt.documentStatus, "UNPAID");
  assert.equal(app.calls.some((call) => /payment|ledger/.test(call.url)), false);
  assert.match(decodeURIComponent(app.get("currentReceiptShare").whatsappUrl), /View or download your PDF/);
});

test("an earlier unpaid invoice settles its own saved amount and period after renewal", async () => {
  const app = createApp({ fetch: ({ url }) => {
    assert.match(url, /record_membership_payment$/);
    return jsonResponse([{ invoice_number: "SC-OLD" }]);
  } });
  app.signIn();
  const member = { id: "member-old", name: "Member", phone: "923001234567", plan: "Dedicated Desk",
    seats: 1, monthlyFee: 17500, paid: true, membershipFrom: "2026-10-07", validTill: "2026-11-07" };
  app.set("members", [member]);
  app.set("memberRecords", [member]);
  app.set("invoices", [{ id, member_id: member.id, status: "sent", invoice_type: "membership",
    membership_from: "2026-09-07", valid_till: "2026-10-07", total_amount: 15000 }]);
  app.run('promptPaymentSource = async () => "spaces_account"; refreshAfterWrite = async () => true; prefetchReceiptPdf = () => {}');
  await app.call("markPaid", member.id, null, id);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.p_amount, 15000);
  assert.equal(app.calls[0].body.p_valid_till, "2026-10-07");
  assert.equal(app.get("currentReceiptShare").receipt.validTill, "2026-10-07");
});

test("the collection queue puts older unpaid invoices ahead of the current period", () => {
  const app = createApp();
  const member = { id: "member-old", name: "Member", plan: "Desk", phone: "923001234567", status: "active",
    seats: 1, monthlyFee: 17500, paid: false, membershipFrom: "2026-10-07", validTill: "2026-11-07" };
  app.set("members", [member]); app.set("memberRecords", [member]);
  app.set("invoices", [{ id, member_id: member.id, status: "sent", invoice_type: "membership",
    membership_from: "2026-09-07", valid_till: "2026-10-07", total_amount: 15000 }]);
  app.call("renderCollections");
  const html = app.nodes.get("#collectionList").innerHTML;
  assert.ok(html.indexOf('data-invoice-id="'+id+'"') < html.indexOf('data-invoice-id=""'));
  assert.match(html, /Earlier unpaid period/);
});

test("double-clicking generate invoice submits only once", async () => {
  const pending = deferred();
  const app = createApp({ fetch: () => pending.promise });
  app.signIn();
  app.run('refreshAfterWrite = async () => true; openSavedInvoice = async () => ({}); preparePrivateInvoiceLink = async () => {}');
  const member = { id: "one", name: "Test", validTill: "2026-10-07" };
  const first = app.call("generateMemberInvoice", member);
  const second = app.call("generateMemberInvoice", member);
  pending.resolve(jsonResponse([{ invoice_id: id, invoice_number: "SC-TEST" }]));
  await first; await second;
  assert.equal(app.calls.length, 1);
});

test("a missing server key cannot produce a broken customer link", async () => {
  await withDatabase(async (calls) => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = responseRecorder();
    await invoiceLink({ method: "POST", headers: { authorization: "Bearer staff-token" }, body: { invoiceId: id, action: "create" } }, response);
    assert.equal(response.code, 503);
    assert.equal(response.payload.path, undefined);
    assert.equal(calls.some((call) => call.path.endsWith("create_invoice_share_link")), false);
  });
});

test("a saved invoice with a failed sharing step does not show a conflicting success toast", async () => {
  const app = createApp({ fetch: () => jsonResponse([{ invoice_id: id, invoice_number: "SC-TEST" }]) });
  app.signIn();
  app.run('globalThis.testToasts = []; showToast = (...args) => testToasts.push(args); refreshAfterWrite = async () => true; openSavedInvoice = async () => { throw new Error("Please retry sharing"); }');
  const result = await app.call("generateMemberInvoice", { id: "one", validTill: "2026-10-07" });
  assert.equal(result, false);
  assert.equal(app.get("testToasts").length, 1);
  assert.equal(app.get("testToasts")[0][0], "Invoice saved; no payment recorded");
  assert.equal(app.calls.length, 1);
});
