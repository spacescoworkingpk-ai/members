import assert from "node:assert/strict";
import test from "node:test";
import {
  createApp, createServerModule, deferred, element, emulateSelectOptions, fakeSession, jsonResponse, ledgerRow
} from "./helpers/app-harness.mjs";

function signedIn(options) {
  const app = createApp(options);
  app.signIn();
  return app;
}

function expenseForm(overrides = {}) {
  return element({ formValues: {
    entryDate: "2026-09-13", category: "Office Supplies", amount: "1200",
    paymentMethod: "petty_cash", paymentSource: "spaces_account", notes: "Test only",
    ...overrides
  } });
}

test("receipt retries preserve both receipt number and original service validity", () => {
  const app = signedIn();
  const form = element();
  const first = app.call("receiptAttempt", form, { amount: 1500 }, "SP", { validTill: "2026-09-13" });
  const retry = app.call("receiptAttempt", form, { amount: 1500 }, "SP", { validTill: "2026-09-14" });
  assert.equal(retry, first);
  assert.equal(retry.validity.validTill, "2026-09-13");
  assert.notEqual(app.call("receiptAttempt", form, { amount: 2000 }, "SP"), first);
});

test("quick receipt retry after an unreadable confirmation uses identical RPC parameters", async () => {
  let attempts = 0;
  const app = signedIn({ fetch: ({body}) => ++attempts === 1
    ? new Response("{broken", { status: 200 })
    : jsonResponse([{ receipt_id: "quick-id", receipt_number: body.p_receipt_number }]) });
  app.nodes.get("#quickInvoiceForm").formValues = {
    service: "day-pass", quantity: "1", rate: "1500", total: "1500",
    name: "Test guest", phone: "03001234567", paymentMode: "spaces_account"
  };
  app.run("openInvoice = () => {}");
  await assert.rejects(app.call("generateQuickInvoice"), /check|confirmation/i);
  await app.call("generateQuickInvoice");
  assert.deepEqual(app.calls[1].body, app.calls[0].body);
});

test("financial form validation rejects values that overflow database integers", () => {
  const app = signedIn();
  assert.throws(() => app.call("positiveWholeMoney", 2147483648, "Amount"), /rupee/);
  assert.throws(() => app.call("nonNegativeWholeMoney", 2147483648, "Amount"), /rupee/);
});

for (const returned of [{ invoice_id: "wrong-contract" }, { receipt_id: "saved", receipt_number: "another-receipt" }]) {
  test(`quick receipt rejects mismatched confirmation ${JSON.stringify(returned)}`, async () => {
    const app = signedIn({ fetch: () => jsonResponse([returned]) });
    app.nodes.get("#quickInvoiceForm").formValues = {
      service: "day-pass", quantity: "1", rate: "1500", total: "1500",
      name: "Test guest", phone: "03001234567", paymentMode: "spaces_account"
    };
    app.run("openInvoice = () => { throw new Error('Must not preview an unconfirmed receipt'); }");
    await assert.rejects(app.call("generateQuickInvoice"), /confirmation was incomplete/i);
  });
}

test("gateway failure keeps the same idempotency key for an expense retry", async () => {
  let attempts = 0;
  const app = signedIn({ fetch: () => ++attempts === 1
    ? new Response("Gateway timeout", {status:504})
    : jsonResponse([{entry_id:'cash-confirmed'}]) });
  const params = { p_amount: 1500 };
  await assert.rejects(app.call("callWriteRpc", "create_cash_ledger_entry", params), /Gateway/);
  await app.call("callWriteRpc", "create_cash_ledger_entry", params);
  assert.equal(app.calls[0].body.p_request_id, app.calls[1].body.p_request_id);
});

test("refreshing ledger summaries preserves other unsaved sheet rows", () => {
  const app = signedIn();
  app.run("cashLedgerReady = ownerLedgerReady = true");
  for (const selector of ["#cashSheet", "#ownerSheet"]) {
    const sheet = app.nodes.get(selector);
    sheet.innerHTML = "unsaved row input";
    sheet.setQuery("tr.dirty", ledgerRow({ amount: 999 }));
  }
  app.call("renderCashAccounting");
  app.call("renderOwnerLedger");
  assert.equal(app.nodes.get("#cashSheet").innerHTML, "unsaved row input");
  assert.equal(app.nodes.get("#ownerSheet").innerHTML, "unsaved row input");
});

test("audit sheet renders stored database before and after snapshots", () => {
  const app = signedIn();
  app.set("auditLogs", [{ action: "update", created_at: "2026-09-13", before_data: { amount: 100 }, after_data: { amount: 200 } }]);
  app.call("renderAuditLog");
  assert.match(app.nodes.get("#auditLogSheet").innerHTML, /100/);
  assert.match(app.nodes.get("#auditLogSheet").innerHTML, /200/);
});

test("reload restores a valid persisted login before any network request completes", () => {
  const app = createApp({ storedSession: fakeSession, fetch: () => new Promise(() => {}) });
  assert.equal(app.get("session")?.access_token, fakeSession.access_token);
  assert.equal(app.nodes.get("#appShell").hidden, false);
});

for (const operation of ["insertRow", "patchRow"]) {
  test(`${operation} rejects a successful REST response with zero affected rows`, async () => {
    const app = signedIn({ fetch: () => jsonResponse([]) });
    const args = operation === "insertRow" ? ["cash_ledger", { amount: 1200 }]
      : ["cash_ledger", "hidden-by-rls", { amount: 1200 }];
    await assert.rejects(app.call(operation, ...args), /row|permission|save|return|record|confirm/i);
    assert.equal(app.calls.length, 1);
  });

  test(`${operation} accepts exactly one returned row`, async () => {
    const app = signedIn({ fetch: () => jsonResponse([{ id: "cash-1", amount: 1200 }]) });
    const args = operation === "insertRow" ? ["cash_ledger", { amount: 1200 }]
      : ["cash_ledger", "cash-1", { amount: 1200 }];
    assert.equal((await app.call(operation, ...args)).amount, 1200);
  });
}

test("malformed error JSON preserves HTTP status and does not retry a write", async () => {
  const app = signedIn({ fetch: () => new Response("<html>upstream unavailable</html>", { status: 502 }) });
  await assert.rejects(app.call("patchRow", "cash_ledger", "cash-1", { amount: 1200 }), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /upstream unavailable|502/);
    return true;
  });
  assert.equal(app.calls.length, 1);
});

test("malformed success JSON on a payment never claims nothing was charged or safe retry", async () => {
  const app = signedIn({ fetch: () => new Response('{"committed":', { status: 200 }) });
  let failure;
  try { await app.call("callRpc", "record_quick_receipt", { p_total_amount: 1200 }); }
  catch (error) { failure = error; }
  assert.ok(failure, "malformed JSON must reject");
  assert.equal(app.calls.length, 1, "an ambiguous write must not be retried automatically");
  const message = app.call("describeWriteFailure", failure, "receipt");
  assert.doesNotMatch(message, /nothing was charged|safe to retry|nothing was saved/i);
  assert.match(message, /verify|check|confirm|unknown|uncertain/i);
});

test("post-save reload does not reuse a pre-save in-flight snapshot", async () => {
  const pending = deferred();
  const readStarted = deferred();
  let databaseCash = [{ id: "cash-1", entry_type: "expense", amount: 100, entry_date: "2026-09-13" }];
  let cashReads = 0;
  const app = signedIn({ fetch: ({ url, options, body }) => {
    const table = new URL(url).pathname.split("/").at(-1);
    if (table === "staff_profiles") return jsonResponse([{ user_id: "test-user", role: "owner" }]);
    if (table === "cash_ledger" && options.method === "PATCH") {
      databaseCash = [{ ...databaseCash[0], ...body }];
      return jsonResponse(databaseCash);
    }
    if (table === "cash_ledger") {
      cashReads += 1;
      if (cashReads === 1) {
        const snapshot = structuredClone(databaseCash);
        readStarted.resolve();
        return pending.promise.then(() => jsonResponse(snapshot));
      }
      return jsonResponse(databaseCash);
    }
    return jsonResponse([]);
  } });
  // Render-only hooks are replaced; loadData, loadDataNow, REST and state
  // assignment execute production code. The deferred response fixes ordering.
  app.run("renderPlans = setDefaultDates = syncPlanFields = syncQuickInvoiceFields = render = () => {}");
  const refresh = app.call("loadData");
  await readStarted.promise;
  await app.call("patchRow", "cash_ledger", "cash-1", { amount: 250 });
  const afterSave = app.call("refreshAfterWrite");
  pending.resolve();
  await Promise.all([refresh, afterSave]);
  assert.equal(app.get("cashEntries")[0].amount, 250, "completed save must be reflected after reload");
  assert.ok(cashReads >= 2, "post-write refresh needs a fresh database snapshot");
});

for (const [label, field] of [
  ["negative amount", { amount: "-25" }],
  ["zero amount", { amount: "0" }],
  ["fractional amount", { amount: "12.75" }],
  ["nonnumeric amount", { amount: "not-money" }],
  ["blank date", { entryDate: "" }],
  ["impossible date", { entryDate: "2026-02-31" }],
  ["blank category", { category: "  " }]
]) {
  for (const method of ["createCashEntryFromForm", "createOwnerEntryFromForm"]) {
    test(`${method} rejects ${label} before making any request`, async () => {
      const app = signedIn({ fetch: ({ body }) => jsonResponse([{ id: "entry-1", ...body }]) });
      await assert.rejects(app.call(method, expenseForm(field), "expense"));
      assert.equal(app.calls.length, 0, "invalid input must not reach a database write");
    });
  }
}

test("valid card expense preserves amount and payment method", async () => {
  const app = signedIn({ fetch: ({ body }) => jsonResponse([{ id: "cash-1", entry_id: "cash-1", ...body }]) });
  await app.call("createCashEntryFromForm", expenseForm({ paymentMethod: "business_card" }), "expense");
  const body = app.calls[0].body;
  assert.equal(body.p_amount ?? body.amount, 1200);
  assert.equal(body.p_payment_method ?? body.payment_method, "business_card");
});

test("legacy zero-row cash edit fails instead of reporting a successful save", async () => {
  const app = signedIn({ fetch: ({ url }) => url.includes("/rpc/")
    ? jsonResponse({ code: "PGRST202", message: "Could not find the function" }, 404)
    : jsonResponse([]) });
  app.set("cashEntries", [{ id: "cash-1", entry_type: "expense", amount: 100, category: "Office Supplies", origin: "manual" }]);
  app.nodes.get("#cashSheet").setQuery('tr[data-cash-id="cash-1"]', ledgerRow({
    entryDate: "2026-09-13", entryType: "expense", categorySource: "Office Supplies",
    amount: "250", paymentMethod: "petty_cash", personName: "", notes: ""
  }));
  await assert.rejects(app.call("saveCashRow", "cash-1"));
});

test("linked transfer edit refuses non-atomic legacy REST fallback", async () => {
  const owner = { id: "owner-1", entry_type: "receiving", source: "Received From Staff", amount: 500,
    entry_date: "2026-09-13", is_internal_transfer: true, linked_cash_ledger_id: "cash-1" };
  const cash = { id: "cash-1", entry_type: "expense", category: "Returned to Owner", amount: 500,
    entry_date: "2026-09-13", is_internal_transfer: true, linked_owner_ledger_id: "owner-1", payment_method: "petty_cash" };
  const app = signedIn({ fetch: ({ url }) => {
    assert.ok(url.includes("/rpc/"), "linked transfer must not mutate either REST table");
    return jsonResponse({ code: "PGRST202", message: "Could not find the function" }, 404);
  } });
  app.set("cashEntries", [cash]);
  app.set("ownerEntries", [owner]);
  app.nodes.get("#cashSheet").setQuery('tr[data-cash-id="cash-1"]', ledgerRow({
    entryDate: "2026-09-13", entryType: "expense", categorySource: "Returned to Owner",
    amount: "500", paymentMethod: "business_card", personName: "Abrar", notes: ""
  }));
  await assert.rejects(app.call("saveCashRow", "cash-1"), /transfer|cash|payment|method|database save function/i);
  const summary = app.call("financialSummary");
  assert.equal(summary.ownerBalance + summary.staffBalance, 0, "internal movement cannot create company funds");
  assert.equal(summary.companyExpenses, 0);
});

test("successful empty ledger RPC confirmation is not reported as a saved expense", async () => {
  const app = signedIn({ fetch: () => jsonResponse([]) });
  await assert.rejects(app.call("createCashEntryFromForm", expenseForm(), "expense"));
  assert.equal(app.calls.length, 1);
});

test("401 refresh followed by a business validation error preserves the new login and original error", async () => {
  let writes = 0;
  const freshSession = { ...fakeSession, access_token: "test-renewed-token" };
  const app = signedIn({ fetch: ({ url, options }) => {
    if (url.includes("/auth/v1/token")) return jsonResponse(freshSession);
    writes += 1;
    if (writes === 1) return jsonResponse({ message: "expired JWT" }, 401);
    assert.equal(options.headers.Authorization, "Bearer test-renewed-token");
    return jsonResponse({ code: "23514", message: "Amount must be positive" }, 400);
  } });
  await assert.rejects(app.call("patchRow", "cash_ledger", "cash-1", { amount: -1 }), (error) => {
    assert.equal(error.code, "23514");
    assert.equal(error.status, 400);
    assert.match(error.message, /Amount must be positive/);
    return true;
  });
  assert.equal(app.get("session").access_token, "test-renewed-token");
  assert.equal(app.calls.length, 3);
});

test("concurrent expiring-session writes share one refresh request", async () => {
  const tokenGate = deferred();
  let refreshes = 0;
  const app = signedIn({ fetch: async ({ url, options }) => {
    if (url.includes("/auth/v1/token")) {
      refreshes += 1;
      await tokenGate.promise;
      return jsonResponse({ ...fakeSession, access_token: "test-renewed-token" });
    }
    assert.equal(options.headers.Authorization, "Bearer test-renewed-token");
    return jsonResponse([{ id: "cash-1", amount: 1200 }]);
  } });
  app.set("session", { ...fakeSession, expires_at: 1 });
  const first = app.call("patchRow", "cash_ledger", "cash-1", { amount: 1200 });
  const second = app.call("patchRow", "cash_ledger", "cash-2", { amount: 1200 });
  tokenGate.resolve();
  await Promise.all([first, second]);
  assert.equal(refreshes, 1);
});

test("empty 201 response for return=minimal insert is accepted without parsing failure", async () => {
  const app = signedIn({ fetch: () => new Response(null, { status: 201 }) });
  const result = await app.call("supabaseRequest", "/rest/v1/invoice_items", {
    method: "POST", headers: { Prefer: "return=minimal" }, body: [{ invoice_id: "test" }]
  });
  assert.equal(result, null);
  assert.equal(app.calls.length, 1);
});

test("lost write response is marked uncertain and never retried automatically", async () => {
  const app = signedIn({ fetch: () => { throw new TypeError("connection reset after commit"); } });
  await assert.rejects(app.call("callRpc", "record_quick_receipt", {}), (error) => {
    assert.equal(error.uncertain, true);
    assert.doesNotMatch(app.call("describeWriteFailure", error, "receipt"), /nothing was charged|safe to retry/i);
    return true;
  });
  assert.equal(app.calls.length, 1);
});

test("reading a committed response body failure is also marked uncertain", async () => {
  const app = signedIn({ fetch: () => ({
    ok: true, status: 200,
    text: async () => { throw new TypeError("body stream interrupted after commit"); }
  }) });
  await assert.rejects(app.call("callRpc", "record_quick_receipt", {}), (error) => {
    assert.equal(error.uncertain, true);
    assert.doesNotMatch(app.call("describeWriteFailure", error, "receipt"), /nothing was charged|safe to retry/i);
    return true;
  });
});

test("post-commit refresh failure reports saved state instead of a failed expense", async () => {
  let commits = 0;
  const app = signedIn({ fetch: ({ options }) => {
    if (options.method === "POST") {
      commits += 1;
      return jsonResponse([{ id: "cash-1", entry_id: "cash-1", amount: 1200 }]);
    }
    return jsonResponse({ message: "Read service unavailable" }, 503);
  } });
  const form = app.nodes.get("#expenseForm");
  form.formValues = expenseForm().formValues;
  app.run(`
    const realWithControlLock = withControlLock;
    withControlLock = (...args) => {
      globalThis.writeCompletion = realWithControlLock(...args);
      return globalThis.writeCompletion;
    };
  `);
  const event = { preventDefault() {}, submitter: element() };
  for (const handler of form.listeners.get("submit")) await handler(event);
  assert.ok(app.get("writeCompletion"), "the real form submit handler must execute its write");
  await app.get("writeCompletion");
  assert.equal(commits, 1);
  const toasts = app.nodes.get("#toastStack").children.map((child) => child.innerHTML).join("\n");
  assert.match(toasts, /saved.*refresh|stored/i);
  assert.doesNotMatch(toasts, /Could not save expense/);
  assert.match(app.nodes.get("#syncStatus").textContent, /saved/i);
});

test("refresh preserves manually selected form dates and report months", () => {
  const app = signedIn();
  for (const name of ["#expenseForm", "#receivingForm", "#ownerExpenseForm", "#ownerReceivingForm"]) {
    app.nodes.get(name).elements.entryDate.value = "2026-08-17";
  }
  app.nodes.get("#memberForm").elements.joiningDate.value = "2026-01-02";
  app.nodes.get("#memberForm").elements.renewalDate.value = "2026-02-02";
  app.nodes.get("#cashMonth").value = "2026-07";
  app.nodes.get("#ownerMonth").value = "2026-07";
  app.call("setDefaultDates");
  for (const name of ["#expenseForm", "#receivingForm", "#ownerExpenseForm", "#ownerReceivingForm"]) {
    assert.equal(app.nodes.get(name).elements.entryDate.value, "2026-08-17");
  }
  assert.equal(app.nodes.get("#memberForm").elements.joiningDate.value, "2026-01-02");
  assert.equal(app.nodes.get("#memberForm").elements.renewalDate.value, "2026-02-02");
  assert.equal(app.nodes.get("#cashMonth").value, "2026-07");
  assert.equal(app.nodes.get("#ownerMonth").value, "2026-07");
});

test("rerendering plan and ledger options preserves staff form selections", () => {
  const app = signedIn();
  app.set("plans", [
    { id: "p-1", name: "Flexible Desk", seats: 1, price: 10000, type: "Monthly" },
    { id: "p-2", name: "Dedicated Desk", seats: 1, price: 18500, type: "Monthly" }
  ]);
  const selected = {
    "#planSelect": "Dedicated Desk",
    "#expenseCategory": "Electricity",
    "#expensePaymentMethod": "business_card",
    "#ownerExpenseCategory": "Office Supplies",
    "#ownerExpenseSource": "spaces_account",
    "#ownerReceivingPaymentSource": "spaces_account",
    "#receivingPaymentSource": "raza_manager"
  };
  for (const [selector, value] of Object.entries(selected)) {
    const select = app.nodes.get(selector);
    emulateSelectOptions(select);
    select.value = value;
  }
  app.call("renderPlans");
  for (const [selector, value] of Object.entries(selected)) {
    assert.equal(app.nodes.get(selector).value, value, `${selector} changed while staff were editing`);
  }
});

test("data refresh preserves an edited multi-plan bundle and quick receipt total", async () => {
  const app = signedIn({ fetch: ({ url }) => new URL(url).pathname.endsWith("/staff_profiles")
    ? jsonResponse([{ user_id: "test-user", role: "owner" }]) : jsonResponse([]) });
  const lines = [{ planId: "p-1", seats: 3, standardRate: 30000, offeredRate: 27000 }];
  app.set("memberFormPlanLines", lines);
  app.nodes.get("#quickRate").value = "1200";
  app.nodes.get("#quickTotal").value = "2400";
  app.run(`
    renderPlans = render = () => {};
    syncPlanFields = () => { memberFormPlanLines = []; };
    syncQuickInvoiceFields = () => { els.quickTotal.value = "1500"; };
  `);
  await app.call("loadData");
  assert.equal(app.get("memberFormPlanLines")[0]?.offeredRate, 27000);
  assert.equal(app.nodes.get("#quickTotal").value, "2400");
});

function receiptMember(overrides = {}) {
  return {
    id: "member-test", name: "Test Member", phone: "", plan: "Dedicated Desk", seats: 1,
    monthlyFee: 10000, basePlanPrice: 10000, paid: false,
    membershipFrom: "2026-09-01", validTill: "2026-09-30", renewalDate: "2026-10-01",
    planItems: [{ planName: "Dedicated Desk", seats: 1, standardRate: 10000, offeredRate: 10000 }],
    ...overrides
  };
}

test("edited membership settlement renders the actual paid amount and consistent receipt lines", async () => {
  const app = signedIn({ fetch: () => jsonResponse([{ invoice_number: "SC-TEST", invoice_id: "invoice-test" }]) });
  app.set("members", [receiptMember({ editedInvoice: { total_amount: 8000 } })]);
  app.run(`
    promptPaymentSource = async () => "spaces_account";
    loadData = refreshAfterWrite = async () => true;
    prefetchReceiptPdf = () => {};
  `);
  await app.call("markPaid", "member-test");
  assert.equal(app.calls[0].body.p_amount, 8000, "the edited price must be settled");
  const receipt = app.get("currentReceiptShare").receipt;
  assert.ok(receipt, "successful settlement opens a receipt");
  assert.equal(receipt.total, 8000, "the PAID receipt must match the payment RPC amount");
  assert.equal(receipt.lines.reduce((sum, line) => sum + line.amount, 0), receipt.amount);
});

test("reopened paid receipt uses stored payment amount after member rate changes", async () => {
  const app = signedIn({ fetch: () => jsonResponse({ receipt: {
    invoiceId: "SC-SAVED", customerName: "Member", phone: "923001234567", description: "Saved plan",
    documentStatus: "PAID", issuedDate: "2026-09-01", validTill: "2026-10-01",
    lines: [{ description: "Saved plan", quantity: 1, unitPrice: 8000, amount: 8000 }],
    quantity: 1, standardPrice: 8000, unitPrice: 8000, discount: 0, amount: 8000, tax: 0, total: 8000
  } }) });
  app.run("prefetchReceiptPdf = () => {}");
  const member = receiptMember({ paid: true, paidAmount: 8000 });
  app.set("invoices", [{ id: "stored-id", member_id: member.id, valid_till: member.validTill, status: "paid" }]);
  await app.call("openReceipt", member);
  const receipt = app.get("currentReceiptShare").receipt;
  assert.equal(receipt.total, 8000, "historical receipt must not be repriced to the current plan fee");
});

test("normal linked transfers and card expenses conserve balances without double counting", () => {
  const app = signedIn();
  app.set("payments", [{ amount: 10000, payment_source: "spaces_account", paid_at: "2026-09-13T10:00:00Z" }]);
  app.set("ownerEntries", [
    { entry_type: "expense", category: "Petty Cash Top-Up", amount: 3000, is_internal_transfer: true },
    { entry_type: "receiving", source: "Received From Staff", amount: 500, is_internal_transfer: true }
  ]);
  app.set("cashEntries", [
    { entry_type: "receiving", source: "Petty Cash Top-Up - Abrar", amount: 3000, is_internal_transfer: true },
    { entry_type: "expense", category: "Returned to Owner", amount: 500, is_internal_transfer: true },
    { entry_type: "expense", category: "Office Supplies", amount: 200, payment_method: "business_card" },
    { entry_type: "expense", category: "Office Supplies", amount: 100, payment_method: "petty_cash" }
  ]);
  const summary = app.call("financialSummary");
  assert.equal(summary.totalRevenue, 10000);
  assert.equal(summary.companyExpenses, 300);
  assert.equal(summary.staffBalance, 2400);
  assert.equal(summary.ownerBalance, 7300);
  assert.equal(summary.ownerBalance + summary.staffBalance, summary.netProfit);
});

test("concurrent WhatsApp sends do not both send after the same queued-log unique conflict", async () => {
  const bothLookups = deferred();
  let lookups = 0;
  let inserts = 0;
  let sends = 0;
  const queued = { id: "log-1", status: "queued", created_at: new Date().toISOString() };
  const server = createServerModule("api/send-receipt.js", {
    fetch: async (_url, options = {}) => {
      if (options.method === "POST") {
        inserts += 1;
        if (inserts === 1) return jsonResponse([queued]);
        return jsonResponse({ message: "duplicate key violates whatsapp_messages_active_recipient_key" }, 409);
      }
      if (options.method === "PATCH") return jsonResponse(null, 204);
      lookups += 1;
      if (lookups <= 2) {
        if (lookups === 2) bothLookups.resolve();
        await bothLookups.promise;
        return jsonResponse([]);
      }
      return jsonResponse([queued]);
    },
    sendReceiptTemplate: async () => { sends += 1; return { messages: [{ id: `meta-${sends}` }] }; }
  });
  const args = { token: "test", recipientType: "customer", recipientPhone: "923000000000",
    invoiceNumber: "TEST-1", receipt: {}, mediaId: "test-media", fileName: "test.pdf", whatsapp: {} };
  const results = await Promise.all([server.call("sendToRecipient", args), server.call("sendToRecipient", args)]);
  assert.equal(sends, 1, "only the invocation that created the queued log owns the send");
  assert.equal(results.filter((result) => result.duplicate).length, 1);
});
