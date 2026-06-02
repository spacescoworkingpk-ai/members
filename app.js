const supabaseConfig = {
  url: "https://hsnkcrxowajnadwtzdlk.supabase.co",
  anonKey: "sb_publishable_swOIHdgfBNI_shshMi7nUw_z8OUy8k-"
};

const business = {
  name: "Spaces Coworking",
  phone: "+92 317 3337756",
  landline: "(021)-33393881",
  email: "spaces.net.pk@gmail.com",
  address: "Mezzanine Floor, C-10 Block 4, Federal B Area, Karachi",
  shortAddress: "Spaces, C-10, mezzanine floor<br>Block 4 fb Area, Karachi",
  website: "spacespk.com"
};

const deskCapacities = {
  flexible: 14,
  dedicated: 8,
  personal: 2
};

let plans = [];
let members = [];
let memberRecords = [];
let invoices = [];
let payments = [];
let session = loadSession();

const sessionKey = "spaces-coworking-staff-session";
const fmt = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0
});

const els = {
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authMessage: document.querySelector("#authMessage"),
  appShell: document.querySelector("#appShell"),
  logoutButton: document.querySelector("#logoutButton"),
  syncStatus: document.querySelector("#syncStatus"),
  metricRevenue: document.querySelector("#metricRevenue"),
  metricCollected: document.querySelector("#metricCollected"),
  metricMembers: document.querySelector("#metricMembers"),
  metricSeats: document.querySelector("#metricSeats"),
  metricDue: document.querySelector("#metricDue"),
  metricPending: document.querySelector("#metricPending"),
  metricOutstanding: document.querySelector("#metricOutstanding"),
  membersTable: document.querySelector("#membersTable"),
  receiptQueue: document.querySelector("#receiptQueue"),
  ledger: document.querySelector("#ledger"),
  planList: document.querySelector("#planList"),
  planBars: document.querySelector("#planBars"),
  memberSearch: document.querySelector("#memberSearch"),
  sheetSearch: document.querySelector("#sheetSearch"),
  memberSheet: document.querySelector("#memberSheet"),
  sheetMessage: document.querySelector("#sheetMessage"),
  refreshMembers: document.querySelector("#refreshMembers"),
  saveAllSheetRows: document.querySelector("#saveAllSheetRows"),
  memberForm: document.querySelector("#memberForm"),
  resetMemberForm: document.querySelector("#resetMemberForm"),
  planSelect: document.querySelector("#planSelect"),
  rateSummary: document.querySelector("#rateSummary"),
  editInvoiceDialog: document.querySelector("#editInvoiceDialog"),
  editInvoiceForm: document.querySelector("#editInvoiceForm"),
  receiptDialog: document.querySelector("#receiptDialog"),
  receiptPreview: document.querySelector("#receiptPreview"),
  whatsappReceipt: document.querySelector("#whatsappReceipt"),
  closeReceipt: document.querySelector("#closeReceipt"),
  printReceipt: document.querySelector("#printReceipt"),
  exportCsv: document.querySelector("#exportCsv")
};

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey));
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  if (nextSession) {
    localStorage.setItem(sessionKey, JSON.stringify(nextSession));
  } else {
    localStorage.removeItem(sessionKey);
  }
}

function showAuth(message = "") {
  els.authScreen.hidden = false;
  els.appShell.hidden = true;
  els.authMessage.textContent = message;
}

function showApp() {
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
}

async function login(email, password) {
  const response = await fetch(`${supabaseConfig.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || "Login failed");
  }
  saveSession(payload);
}

async function supabaseRequest(path, options = {}) {
  if (!session?.access_token) {
    throw new Error("Staff login required");
  }
  const headers = {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const response = await fetch(`${supabaseConfig.url}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (response.status === 401) {
    saveSession(null);
    showAuth("Session expired. Please sign in again.");
    throw new Error("Session expired");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function selectRows(table, query = "select=*") {
  return supabaseRequest(`/rest/v1/${table}?${query}`, { method: "GET" });
}

async function insertRow(table, row) {
  const rows = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row
  });
  return rows[0];
}

async function patchRow(table, id, row) {
  const rows = await supabaseRequest(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: row
  });
  return rows[0];
}

async function loadData() {
  setSyncStatus("Syncing", "busy");
  const [planRows, memberRows, invoiceRows, paymentRows] = await Promise.all([
    selectRows("plans", "select=*&active=eq.true&order=name.asc"),
    selectRows("members", "select=*&order=created_at.desc"),
    selectRows("invoices", "select=*&order=created_at.desc"),
    selectRows("payments", "select=*&order=paid_at.desc")
  ]);
  plans = planRows.map(mapPlan);
  invoices = invoiceRows;
  payments = paymentRows;
  memberRecords = memberRows.map(mapMember);
  members = memberRecords.filter((member) => member.status === "active");
  renderPlans();
  setDefaultDates();
  syncPlanFields();
  render();
  setSyncStatus("Live", "ok");
}

function mapPlan(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    type: row.category === "room" ? "Room" : "Individual",
    seats: row.default_seats,
    price: row.standard_monthly_rate
  };
}

function mapMember(row) {
  const plan = plans.find((item) => item.id === row.plan_id || item.name === row.plan_name);
  const memberInvoices = invoices.filter((invoice) => invoice.member_id === row.id);
  const paidInvoice = memberInvoices.find((invoice) => invoice.status === "paid");
  const paidPayment = paidInvoice
    ? payments.find((payment) => payment.invoice_id === paidInvoice.id)
    : null;
  return {
    id: row.id,
    name: row.full_name,
    company: row.company,
    phone: row.phone,
    email: row.email,
    planId: row.plan_id,
    plan: row.plan_name,
    planCategory: plan?.category || inferPlanCategory(row.plan_name),
    seats: row.seats,
    joiningDate: row.joining_date,
    renewalDate: row.renewal_date,
    basePlanPrice: row.standard_monthly_rate,
    monthlyFee: row.offered_monthly_rate,
    deposit: row.deposit_amount,
    discountReason: row.discount_reason,
    notes: row.notes,
    status: row.status,
    paid: Boolean(paidInvoice),
    paidAt: paidPayment?.paid_at?.slice(0, 10) || paidInvoice?.issue_date || null
  };
}

function setSyncStatus(text, state = "") {
  els.syncStatus.textContent = text;
  els.syncStatus.dataset.state = state;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function paymentState(member) {
  if (member.paid) return "paid";
  const days = daysUntil(member.renewalDate);
  if (days <= 7) return "due";
  return "unpaid";
}

function inferPlanCategory(planName) {
  return /room|cubicle|executive/i.test(planName || "") ? "room" : "individual";
}

function isRoomMember(member) {
  return member.planCategory === "room" || inferPlanCategory(member.plan) === "room";
}

function memberCategory(member) {
  const planName = member.plan || "";
  if (isRoomMember(member)) return { key: "rooms", label: "Rooms" };
  if (/flexible/i.test(planName)) return { key: "flexible", label: "Flexible Desk" };
  if (/dedicated/i.test(planName)) return { key: "dedicated", label: "Dedicated Desk" };
  if (/personal/i.test(planName)) return { key: "personal", label: "Personal Desk" };
  return { key: "other", label: "Other" };
}

function roomCapacity() {
  return plans
    .filter((plan) => plan.category === "room")
    .reduce((sum, plan) => sum + Number(plan.seats || 0), 0);
}

function capacityForCategory(key) {
  if (key === "rooms") return roomCapacity();
  return deskCapacities[key] || 0;
}

function percentOf(value, total) {
  return total ? Math.round((Number(value) / Number(total)) * 100) : 0;
}

function categorySummaries() {
  const categories = [
    { key: "rooms", label: "Rooms", capacity: capacityForCategory("rooms") },
    { key: "flexible", label: "Flexible Desk", capacity: capacityForCategory("flexible") },
    { key: "dedicated", label: "Dedicated Desk", capacity: capacityForCategory("dedicated") },
    { key: "personal", label: "Personal Desk", capacity: capacityForCategory("personal") }
  ];

  return categories.map((category) => {
    const categoryMembers = members.filter((member) => memberCategory(member).key === category.key);
    const occupied = categoryMembers.reduce((sum, member) => sum + Number(member.seats || 0), 0);
    const revenue = categoryMembers.reduce((sum, member) => sum + Number(member.monthlyFee || 0), 0);
    return {
      ...category,
      members: categoryMembers,
      occupied,
      revenue,
      utilization: percentOf(occupied, category.capacity)
    };
  });
}

function render() {
  renderMetrics();
  renderMembers();
  renderSheetEditor();
  renderReceipts();
  renderLedger();
  renderBars();
}

function renderMetrics() {
  const total = members.reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const collected = members.filter((member) => member.paid).reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const pending = total - collected;
  const dueSoon = members.filter((member) => !member.paid && daysUntil(member.renewalDate) <= 7).length;
  const seats = members.reduce((sum, member) => sum + Number(member.seats), 0);
  const capacity = capacityForCategory("rooms") + deskCapacities.flexible + deskCapacities.dedicated + deskCapacities.personal;
  const percentage = total ? Math.round((collected / total) * 100) : 0;

  els.metricRevenue.textContent = fmt.format(total);
  els.metricCollected.textContent = `${percentage}% collected`;
  els.metricMembers.textContent = members.length;
  els.metricSeats.textContent = `${seats}/${capacity} seats utilized (${percentOf(seats, capacity)}%)`;
  els.metricDue.textContent = dueSoon;
  els.metricPending.textContent = members.filter((member) => !member.paid).length;
  els.metricOutstanding.textContent = `${fmt.format(pending)} outstanding`;
}

function renderMembers() {
  const query = els.memberSearch.value.trim().toLowerCase();
  const filtered = members.filter((member) => {
    const haystack = `${member.name} ${member.company || ""} ${member.phone} ${member.plan}`.toLowerCase();
    return haystack.includes(query);
  });

  els.membersTable.innerHTML = filtered.length ? filtered.map((member) => {
    const state = paymentState(member);
    const category = memberCategory(member);
    return `
      <tr>
        <td><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.company || "Individual")} | ${escapeHtml(member.phone)}</span></td>
        <td><span class="category-label">${escapeHtml(category.label)}</span></td>
        <td><strong>${escapeHtml(member.plan)}</strong><span>${member.seats} seat${Number(member.seats) === 1 ? "" : "s"}</span></td>
        <td>${formatDate(member.joiningDate)}</td>
        <td>${formatDate(member.renewalDate)}</td>
        <td>${rateLabel(member)}</td>
        <td><span class="status ${state}">${stateLabel(state)}</span></td>
        <td>
          <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Receipt</button>
          <button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edit invoice</button>
          ${member.paid ? "" : `<button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>`}
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">No members found.</td></tr>`;
}

function renderSheetEditor() {
  const query = els.sheetSearch.value.trim().toLowerCase();
  const filtered = memberRecords.filter((member) => {
    const haystack = [
      member.name,
      member.company,
      member.phone,
      member.email,
      member.plan,
      member.discountReason,
      member.notes,
      member.status
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  els.memberSheet.innerHTML = filtered.length ? filtered.map((member) => `
    <tr data-member-id="${member.id}">
      <td><input required data-field="name" value="${escapeAttr(member.name)}"></td>
      <td><input data-field="company" value="${escapeAttr(member.company)}"></td>
      <td><input required data-field="phone" value="${escapeAttr(member.phone)}"></td>
      <td><input data-field="email" type="email" value="${escapeAttr(member.email)}"></td>
      <td>
        <select required data-field="planId">
          ${plans.map((plan) => `
            <option value="${plan.id}" data-name="${escapeAttr(plan.name)}" data-seats="${plan.seats}" data-price="${plan.price}" ${plan.id === member.planId ? "selected" : ""}>${escapeHtml(plan.name)}</option>
          `).join("")}
        </select>
      </td>
      <td><input required data-field="seats" type="number" min="1" value="${Number(member.seats || 1)}"></td>
      <td><input required data-field="joiningDate" type="date" value="${escapeAttr(member.joiningDate)}"></td>
      <td><input required data-field="renewalDate" type="date" value="${escapeAttr(member.renewalDate)}"></td>
      <td><input required data-field="basePlanPrice" type="number" min="0" step="500" value="${Number(member.basePlanPrice || 0)}"></td>
      <td><input required data-field="monthlyFee" type="number" min="0" step="500" value="${Number(member.monthlyFee || 0)}"></td>
      <td><input data-field="deposit" type="number" min="0" step="500" value="${Number(member.deposit || 0)}"></td>
      <td><input data-field="discountReason" value="${escapeAttr(member.discountReason)}"></td>
      <td><textarea data-field="notes" rows="1">${escapeHtml(member.notes)}</textarea></td>
      <td>
        <select data-field="status">
          <option value="active" ${member.status === "active" ? "selected" : ""}>Active</option>
          <option value="inactive" ${member.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </td>
      <td><button class="tiny-button" data-action="save-member-row" data-id="${member.id}" type="button">Save</button></td>
    </tr>
  `).join("") : `<tr><td colspan="15">No records found.</td></tr>`;
  updateSheetMessage();
}

function markSheetRowDirty(row) {
  row.classList.add("dirty");
  updateSheetMessage();
}

function updateSheetMessage(message) {
  if (message) {
    els.sheetMessage.textContent = message;
    return;
  }
  const dirtyCount = els.memberSheet.querySelectorAll("tr.dirty").length;
  els.sheetMessage.textContent = dirtyCount
    ? `${dirtyCount} unsaved row${dirtyCount === 1 ? "" : "s"}`
    : "No pending edits";
}

async function saveSheetRow(id) {
  const row = els.memberSheet.querySelector(`tr[data-member-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const planSelect = row.querySelector('[data-field="planId"]');
  const selectedPlan = plans.find((plan) => plan.id === planSelect.value);
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();

  await patchRow("members", id, {
    full_name: value("name"),
    company: value("company") || null,
    phone: value("phone"),
    email: value("email") || null,
    plan_id: selectedPlan?.id || null,
    plan_name: selectedPlan?.name || planSelect.selectedOptions[0]?.dataset.name || value("plan"),
    seats: Number(value("seats") || 1),
    joining_date: value("joiningDate"),
    renewal_date: value("renewalDate"),
    standard_monthly_rate: Number(value("basePlanPrice") || 0),
    offered_monthly_rate: Number(value("monthlyFee") || 0),
    deposit_amount: Number(value("deposit") || 0),
    discount_reason: value("discountReason") || null,
    notes: value("notes") || null,
    status: value("status") || "active"
  });
}

async function saveChangedSheetRows() {
  const changedRows = [...els.memberSheet.querySelectorAll("tr.dirty")];
  if (!changedRows.length) {
    updateSheetMessage("No changes to save");
    return;
  }
  try {
    setSyncStatus("Saving", "busy");
    updateSheetMessage(`Saving ${changedRows.length} row${changedRows.length === 1 ? "" : "s"}...`);
    for (const row of changedRows) {
      await saveSheetRow(row.dataset.memberId);
    }
    await loadData();
    updateSheetMessage("Saved");
  } catch (error) {
    alert(`Could not save sheet changes: ${error.message}`);
    setSyncStatus("Error", "error");
    updateSheetMessage("Save failed");
  }
}

async function saveChangedSheetRowsFor(id) {
  try {
    setSyncStatus("Saving", "busy");
    updateSheetMessage("Saving row...");
    await saveSheetRow(id);
    await loadData();
    updateSheetMessage("Saved");
  } catch (error) {
    alert(`Could not save member row: ${error.message}`);
    setSyncStatus("Error", "error");
    updateSheetMessage("Save failed");
  }
}

function renderReceipts() {
  const queue = members.filter((member) => !member.paid);
  els.receiptQueue.innerHTML = queue.length ? queue.map((member) => `
    <article class="queue-item">
      <header>
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.plan)} | Renewal ${formatDate(member.renewalDate)}</span>
        </div>
        <strong>${fmt.format(Number(member.monthlyFee))}</strong>
      </header>
      <div class="queue-actions">
        <button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>
        <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Preview receipt</button>
        <button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edited invoice</button>
      </div>
    </article>
  `).join("") : `<p class="empty">All visible invoices are paid.</p>`;
}

function renderLedger() {
  const summaries = categorySummaries();
  const roomSummary = summaries.find((summary) => summary.key === "rooms");
  const deskSummaries = summaries.filter((summary) => summary.key !== "rooms");
  const collected = members.filter((member) => member.paid);
  const outstanding = members.filter((member) => !member.paid);
  const groups = [
    ["Total room sales", `${roomSummary.occupied}/${roomSummary.capacity} capacity used (${roomSummary.utilization}%)`, roomSummary.revenue],
    ["Individual desk sales", `${deskSummaries.reduce((sum, summary) => sum + summary.occupied, 0)}/${deskSummaries.reduce((sum, summary) => sum + summary.capacity, 0)} desk capacity used`, deskSummaries.reduce((sum, summary) => sum + summary.revenue, 0)],
    ["Collected", `${collected.length} paid record${collected.length === 1 ? "" : "s"}`, collected.reduce((sum, member) => sum + Number(member.monthlyFee), 0)],
    ["Outstanding", `${outstanding.length} pending record${outstanding.length === 1 ? "" : "s"}`, outstanding.reduce((sum, member) => sum + Number(member.monthlyFee), 0)],
    ["Deposits held", `${members.length} active record${members.length === 1 ? "" : "s"}`, members.reduce((sum, member) => sum + Number(member.deposit || 0), 0)]
  ];

  els.ledger.innerHTML = groups.map(([label, detail, amount]) => `
    <div class="ledger-row">
      <div>
        <strong>${label}</strong>
        <span>${detail}</span>
      </div>
      <strong>${fmt.format(amount)}</strong>
    </div>
  `).join("");
}

function renderPlans() {
  els.planList.innerHTML = plans.length ? plans.map((plan) => `
    <article class="plan-card">
      <header>
        <div>
          <strong>${plan.name}</strong>
          <span>${plan.type} | ${plan.seats} person${plan.seats === 1 ? "" : "s"}</span>
        </div>
        <strong>${fmt.format(plan.price)}</strong>
      </header>
    </article>
  `).join("") : `<p class="empty">Run the Supabase schema to load membership plans.</p>`;

  els.planSelect.innerHTML = plans.map((plan) => `
    <option value="${plan.name}" data-id="${plan.id}" data-seats="${plan.seats}" data-price="${plan.price}">${plan.name}</option>
  `).join("");
}

function renderBars() {
  const summaries = categorySummaries();

  els.planBars.innerHTML = summaries.map((row) => `
    <div class="bar-row">
      <div class="bar-label">
        <span>${row.label}</span>
        <strong>${row.occupied}/${row.capacity} | ${fmt.format(row.revenue)}</strong>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width: ${Math.min(100, Math.max(row.occupied ? 8 : 0, row.utilization))}%"></div></div>
      <div class="bar-meta">${row.utilization}% utilization</div>
    </div>
  `).join("");
}

function stateLabel(state) {
  if (state === "paid") return "Paid";
  if (state === "due") return "Due soon";
  return "Unpaid";
}

function rateLabel(member) {
  const basePrice = Number(member.basePlanPrice || member.monthlyFee);
  const monthlyFee = Number(member.monthlyFee);
  const discount = Math.max(0, basePrice - monthlyFee);
  if (!discount) return fmt.format(monthlyFee);
  return `${fmt.format(monthlyFee)}<span class="rate-note">Standard ${fmt.format(basePrice)} | Discount ${fmt.format(discount)}</span>`;
}

async function markPaid(id) {
  const member = members.find((item) => item.id === id);
  if (!member) return;
  try {
    setSyncStatus("Saving", "busy");
    const invoice = await createInvoice(member, {
      mode: "receipt",
      status: "paid",
      amount: member.monthlyFee,
      standardPrice: member.basePlanPrice,
      validTill: member.renewalDate
    });
    await insertRow("payments", {
      invoice_id: invoice.id,
      member_id: member.id,
      amount: Number(member.monthlyFee),
      payment_method: "cash",
      reference: invoice.invoice_number
    });
    await loadData();
    const updatedMember = members.find((item) => item.id === id) || member;
    openInvoice(updatedMember, { mode: "receipt", invoiceId: invoice.invoice_number });
  } catch (error) {
    alert(`Could not mark paid: ${error.message}`);
    setSyncStatus("Error", "error");
  }
}

async function createInvoice(member, override = {}) {
  const standardPrice = Number(override.standardPrice ?? member.basePlanPrice ?? member.monthlyFee);
  const amount = Number(override.amount ?? member.monthlyFee);
  const tax = Number(override.tax ?? 0);
  const discount = Math.max(0, standardPrice - amount);
  const invoiceNumber = override.invoiceId || `${override.mode === "edited" ? "INV" : "SC"}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const invoice = await insertRow("invoices", {
    invoice_number: invoiceNumber,
    member_id: member.id,
    invoice_type: override.mode === "edited" ? "edited" : "membership",
    issue_date: isoToday(),
    valid_till: override.validTill || member.renewalDate,
    standard_amount: standardPrice,
    discount_amount: discount,
    subtotal_amount: amount,
    tax_amount: tax,
    total_amount: amount + tax,
    status: override.status || "sent",
    edit_note: override.note || null
  });
  await insertRow("invoice_items", {
    invoice_id: invoice.id,
    description: member.plan,
    quantity: Number(override.seats ?? member.seats),
    unit_price: standardPrice,
    amount
  });
  return invoice;
}

function openInvoice(member, override = {}) {
  const invoiceId = override.invoiceId || `${override.mode === "edited" ? "INV" : "SC"}-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`;
  const standardPrice = Number(override.standardPrice ?? member.basePlanPrice ?? member.monthlyFee);
  const amount = Number(override.amount ?? member.monthlyFee);
  const tax = Number(override.tax ?? 0);
  const total = amount + tax;
  const discount = Math.max(0, standardPrice - amount);
  const invoiceTitle = override.mode === "edited" ? "Spaces Membership Invoice" : "Spaces Membership";
  const invoiceLabel = override.mode === "edited" ? "Invoice No." : "Receipt No.";
  const statusLine = override.mode === "edited" ? "Edited invoice" : "Receipt";
  const validTill = override.validTill || member.renewalDate;
  const issuedDate = member.paidAt || isoToday();
  const message = [
    `Spaces Coworking ${statusLine.toLowerCase()} ${invoiceId}`,
    `Member: ${member.name}`,
    `Plan: ${member.plan}`,
    discount ? `Standard rate: ${fmt.format(standardPrice)}` : "",
    discount ? `Discount: ${fmt.format(discount)}` : "",
    `Amount: ${fmt.format(total)}`,
    `Valid till: ${formatDate(validTill)}`,
    override.note ? `Note: ${override.note}` : "",
    "Thank you."
  ].filter(Boolean).join("\n");

  const noteRows = [
    member.company || "Membership",
    discount ? `Discount: ${fmt.format(discount)}${override.note ? ` - ${override.note}` : ""}` : "",
    `Valid till: ${formatDate(validTill)}`
  ].filter(Boolean);

  const amountCell = amount.toLocaleString("en-PK");
  const standardCell = standardPrice.toLocaleString("en-PK");

  els.receiptPreview.innerHTML = `
    <div class="receipt-box">
      <div class="receipt-brand-row">
        <div>
          <img class="receipt-logo" src="assets/spaces-logo.svg" alt="Spaces logo">
          <div class="receipt-title">
            <h2>${invoiceTitle}</h2>
            <div class="receipt-meta">
              <span>This ${override.mode === "edited" ? "invoice" : "receipt"} is addressed to:</span>
              <span><strong>Name:</strong> ${escapeHtml(member.name)}</span>
              <span><strong>Contact:</strong> ${escapeHtml(member.phone)}</span>
              <span><strong>Date:</strong> ${formatDate(issuedDate)}</span>
            </div>
          </div>
        </div>
        <div class="receipt-contact">
          <strong>${business.phone}</strong><br>
          ${business.email}<br>
          ${business.address}
          <span class="receipt-id">
            ${invoiceLabel}
            <strong>${invoiceId}</strong>
          </span>
        </div>
      </div>

      <table class="receipt-table">
        <thead>
          <tr>
            <th>DESCRIPTION</th>
            <th>QTY.</th>
            <th>PRICE ( PKR )</th>
            <th>AMOUNT ( PKR )</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(member.plan)}</td>
            <td>${String(override.seats ?? member.seats).padStart(2, "0")}</td>
            <td>${standardCell}</td>
            <td>${amountCell}</td>
          </tr>
          ${noteRows.map((row) => `
            <tr>
              <td>${escapeHtml(row)}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="receipt-total-block">
        ${discount ? `
          <div class="receipt-total-line muted-total">
            <span>Standard Rate</span>
            <strong>${standardCell}</strong>
          </div>
          <div class="receipt-total-line muted-total">
            <span>Discount</span>
            <strong>- ${discount.toLocaleString("en-PK")}</strong>
          </div>
        ` : ""}
        <div class="receipt-total-line">
          <span>Subtotal</span>
          <strong>${amount.toLocaleString("en-PK")}</strong>
        </div>
        <div class="receipt-total-line">
          <span>Tax</span>
          <strong>${tax.toLocaleString("en-PK")}</strong>
        </div>
        <div class="receipt-total-line grand">
          <span>Total</span>
          <strong>${total.toLocaleString("en-PK")}</strong>
        </div>
      </div>

      <footer class="receipt-footer">
        <div>
          <div class="signature-line">Valid Till ${formatDate(validTill)}</div>
          <div class="representative">Spaces Representative</div>
        </div>
        <div class="receipt-thanks">
          <strong>Thank you!</strong>
          <span>${business.shortAddress}</span>
          <span>${business.landline}</span>
          <div class="receipt-site">${business.website}</div>
        </div>
      </footer>
    </div>
  `;
  els.whatsappReceipt.href = `https://wa.me/${cleanPhone(member.phone)}?text=${encodeURIComponent(message)}`;
  els.receiptDialog.showModal();
}

function openReceipt(member) {
  openInvoice(member, { mode: "receipt" });
}

function openEditedInvoiceForm(member) {
  els.editInvoiceForm.reset();
  els.editInvoiceForm.elements.memberId.value = member.id;
  els.editInvoiceForm.elements.memberName.value = member.name;
  els.editInvoiceForm.elements.plan.value = member.plan;
  els.editInvoiceForm.elements.seats.value = member.seats;
  els.editInvoiceForm.elements.standardPrice.value = member.basePlanPrice || member.monthlyFee;
  els.editInvoiceForm.elements.invoiceAmount.value = member.monthlyFee;
  els.editInvoiceForm.elements.validTill.value = member.renewalDate;
  els.editInvoiceDialog.showModal();
}

function cleanPhone(phone) {
  return String(phone).replace(/[^\d]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function exportCsv() {
  const headers = ["Name", "Company", "Phone", "Email", "Category", "Plan", "Seats", "Joining", "Renewal", "Standard Rate", "Offered Monthly Fee", "Discount", "Discount Reason", "Deposit", "Paid"];
  const rows = members.map((member) => [
    member.name,
    member.company,
    member.phone,
    member.email,
    memberCategory(member).label,
    member.plan,
    member.seats,
    member.joiningDate,
    member.renewalDate,
    member.basePlanPrice || member.monthlyFee,
    member.monthlyFee,
    Math.max(0, Number(member.basePlanPrice || member.monthlyFee) - Number(member.monthlyFee)),
    member.discountReason,
    member.deposit,
    member.paid ? "Yes" : "No"
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "spaces-coworking-members.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function setDefaultDates() {
  const today = new Date();
  const renewal = new Date(today);
  renewal.setMonth(renewal.getMonth() + 1);
  els.memberForm.elements.joiningDate.value = today.toISOString().slice(0, 10);
  els.memberForm.elements.renewalDate.value = renewal.toISOString().slice(0, 10);
}

function syncPlanFields() {
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  if (!selected) {
    els.rateSummary.innerHTML = `<strong>Plans unavailable:</strong> Run the Supabase schema and refresh.`;
    return;
  }
  els.memberForm.elements.seats.value = selected.dataset.seats;
  els.memberForm.elements.basePlanPrice.value = selected.dataset.price;
  els.memberForm.elements.monthlyFee.value = selected.dataset.price;
  renderRateSummary();
}

function renderRateSummary() {
  const basePrice = Number(els.memberForm.elements.basePlanPrice.value || 0);
  const offeredPrice = Number(els.memberForm.elements.monthlyFee.value || 0);
  const discount = Math.max(0, basePrice - offeredPrice);
  els.rateSummary.innerHTML = discount
    ? `<strong>Discounted signup:</strong> ${fmt.format(offeredPrice)} offered instead of ${fmt.format(basePrice)}. Monthly discount ${fmt.format(discount)}.`
    : `<strong>Standard signup:</strong> Offered rate matches the selected plan.`;
}

async function createMemberFromForm() {
  const data = new FormData(els.memberForm);
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  const row = await insertRow("members", {
    full_name: data.get("name"),
    company: data.get("company") || null,
    phone: data.get("phone"),
    email: data.get("email") || null,
    plan_id: selected?.dataset.id || null,
    plan_name: data.get("plan"),
    seats: Number(data.get("seats")),
    joining_date: data.get("joiningDate"),
    renewal_date: data.get("renewalDate"),
    standard_monthly_rate: Number(data.get("basePlanPrice")),
    offered_monthly_rate: Number(data.get("monthlyFee")),
    deposit_amount: Number(data.get("deposit") || 0),
    discount_reason: data.get("discountReason") || null,
    notes: data.get("notes") || null
  });
  return row;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "save-member-row") {
    saveChangedSheetRowsFor(button.dataset.id);
    return;
  }
  const member = members.find((item) => item.id === button.dataset.id);
  if (!member) return;
  if (button.dataset.action === "paid") markPaid(member.id);
  if (button.dataset.action === "receipt") openReceipt(member);
  if (button.dataset.action === "edit-invoice") openEditedInvoiceForm(member);
});

els.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.authMessage.textContent = "Signing in...";
  try {
    await login(els.authEmail.value, els.authPassword.value);
    showApp();
    await loadData();
  } catch (error) {
    els.authMessage.textContent = error.message;
  }
});

els.logoutButton.addEventListener("click", () => {
  saveSession(null);
  showAuth("Signed out.");
});

els.planSelect.addEventListener("change", syncPlanFields);
els.memberForm.elements.monthlyFee.addEventListener("input", renderRateSummary);
els.memberSearch.addEventListener("input", renderMembers);
els.sheetSearch.addEventListener("input", renderSheetEditor);
els.memberSheet.addEventListener("input", (event) => {
  const row = event.target.closest("tr[data-member-id]");
  if (row) markSheetRowDirty(row);
});
els.memberSheet.addEventListener("change", (event) => {
  const row = event.target.closest("tr[data-member-id]");
  if (!row) return;
  if (event.target.dataset.field === "planId") {
    const selected = event.target.selectedOptions[0];
    row.querySelector('[data-field="seats"]').value = selected.dataset.seats;
    row.querySelector('[data-field="basePlanPrice"]').value = selected.dataset.price;
    row.querySelector('[data-field="monthlyFee"]').value = selected.dataset.price;
  }
  markSheetRowDirty(row);
});
els.saveAllSheetRows.addEventListener("click", saveChangedSheetRows);
els.refreshMembers.addEventListener("click", () => loadData().catch((error) => {
  alert(`Could not refresh members: ${error.message}`);
  setSyncStatus("Error", "error");
}));
els.exportCsv.addEventListener("click", exportCsv);
els.printReceipt.addEventListener("click", () => window.print());
els.closeReceipt.addEventListener("click", () => els.receiptDialog.close());
els.resetMemberForm.addEventListener("click", () => {
  window.setTimeout(() => {
    setDefaultDates();
    syncPlanFields();
  }, 0);
});

els.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setSyncStatus("Saving", "busy");
    await createMemberFromForm();
    els.memberForm.reset();
    await loadData();
    setDefaultDates();
    syncPlanFields();
  } catch (error) {
    alert(`Could not save member: ${error.message}`);
    setSyncStatus("Error", "error");
  }
});

els.editInvoiceForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const data = new FormData(els.editInvoiceForm);
  const member = members.find((item) => item.id === data.get("memberId"));
  if (!member) return;
  const override = {
    mode: "edited",
    invoiceId: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    seats: Number(data.get("seats")),
    standardPrice: Number(data.get("standardPrice")),
    amount: Number(data.get("invoiceAmount")),
    validTill: data.get("validTill"),
    note: data.get("editNote")
  };
  try {
    setSyncStatus("Saving", "busy");
    await createInvoice(member, override);
    await loadData();
    els.editInvoiceDialog.close();
    openInvoice(member, override);
  } catch (error) {
    alert(`Could not create edited invoice: ${error.message}`);
    setSyncStatus("Error", "error");
  }
});

if (session?.access_token) {
  showApp();
  loadData().catch((error) => {
    console.error(error);
    showAuth("Please sign in again.");
  });
} else {
  showAuth();
}
