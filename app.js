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

const roomSeatRate = 18500;

const quickServices = {
  "day-pass": {
    label: "Day Pass",
    unitLabel: "No. of people",
    unitName: "people",
    rate: 1500,
    validity: "day"
  },
  "weekly-pass": {
    label: "Weekly Pass",
    unitLabel: "No. of people",
    unitName: "people",
    rate: 5000,
    validity: "week"
  },
  "conference-room": {
    label: "Conference Room",
    unitLabel: "No. of hours",
    unitName: "hours",
    rate: 1500,
    validity: "hours"
  }
};

const expenseCategories = [
  "Food supplies",
  "Office Supplies",
  "Internet bills",
  "Electricity",
  "Rent",
  "Cleaning",
  "Maintenance site",
  "Water / utilities",
  "Maintenance building",
  "Salary",
  "Miscellaneous",
  "Office furniture/equipment",
  "Marketing",
  "Office small equipment",
  "Generator petrol",
  "Security deposit return"
];

let plans = [];
let members = [];
let memberRecords = [];
let invoices = [];
let payments = [];
let cashEntries = [];
let cashLedgerReady = true;
let staffProfile = null;
let session = loadSession();
let lastAutoRefreshAt = 0;

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
  metricCollectedMonth: document.querySelector("#metricCollectedMonth"),
  metricPendingMonth: document.querySelector("#metricPendingMonth"),
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
  planBarsTitle: document.querySelector("#planBarsTitle"),
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
  quickInvoiceForm: document.querySelector("#quickInvoiceForm"),
  quickService: document.querySelector("#quickService"),
  quickQuantity: document.querySelector("#quickQuantity"),
  quickQuantityLabel: document.querySelector("#quickQuantityLabel"),
  quickRate: document.querySelector("#quickRate"),
  quickTotal: document.querySelector("#quickTotal"),
  quickInvoiceSummary: document.querySelector("#quickInvoiceSummary"),
  resetQuickInvoice: document.querySelector("#resetQuickInvoice"),
  cashBalance: document.querySelector("#cashBalance"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseCategory: document.querySelector("#expenseCategory"),
  receivingForm: document.querySelector("#receivingForm"),
  receivingSource: document.querySelector("#receivingSource"),
  cashSearch: document.querySelector("#cashSearch"),
  cashMessage: document.querySelector("#cashMessage"),
  cashSheet: document.querySelector("#cashSheet"),
  editInvoiceDialog: document.querySelector("#editInvoiceDialog"),
  editInvoiceForm: document.querySelector("#editInvoiceForm"),
  receiptDialog: document.querySelector("#receiptDialog"),
  receiptPreview: document.querySelector("#receiptPreview"),
  whatsappReceipt: document.querySelector("#whatsappReceipt"),
  closeReceipt: document.querySelector("#closeReceipt"),
  printReceipt: document.querySelector("#printReceipt"),
  downloadReceipt: document.querySelector("#downloadReceipt"),
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

async function loadStaffProfile() {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Staff login required");
  const rows = await selectRows("staff_profiles", `select=*&user_id=eq.${encodeURIComponent(userId)}&active=eq.true`);
  if (!rows.length) {
    throw new Error("This login exists, but it has not been added to the Spaces staff list yet.");
  }
  return rows[0];
}

async function loadData() {
  setSyncStatus("Syncing", "busy");
  staffProfile = await loadStaffProfile();
  const [planRows, memberRows, invoiceRows, paymentRows] = await Promise.all([
    selectRows("plans", "select=*&active=eq.true&order=name.asc"),
    selectRows("members", "select=*&order=created_at.desc"),
    selectRows("invoices", "select=*&order=created_at.desc"),
    selectRows("payments", "select=*&order=paid_at.desc")
  ]);
  try {
    cashEntries = await selectRows("cash_ledger", "select=*&order=entry_date.desc,created_at.desc");
    cashLedgerReady = true;
  } catch (error) {
    cashEntries = [];
    cashLedgerReady = false;
    console.warn("cash_ledger unavailable", error);
  }
  plans = planRows.map(mapPlan);
  invoices = invoiceRows;
  payments = paymentRows;
  memberRecords = memberRows.map(mapMember);
  members = memberRecords.filter((member) => member.status === "active");
  renderPlans();
  setDefaultDates();
  syncPlanFields();
  syncQuickInvoiceFields();
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
  const cycle = membershipCycle(row);
  const memberInvoices = invoices.filter((invoice) => invoice.member_id === row.id);
  const paidInvoice = memberInvoices.find((invoice) => invoice.status === "paid" && invoice.valid_till === cycle.validTill);
  const paidPayment = paidInvoice
    ? payments.find((payment) => payment.invoice_id === paidInvoice.id)
    : null;
  const previousUnpaidInvoices = memberInvoices.filter((invoice) => invoice.status !== "paid" && invoice.valid_till < cycle.validTill);
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
    membershipFrom: cycle.from,
    validTill: cycle.validTill,
    basePlanPrice: row.standard_monthly_rate,
    monthlyFee: row.offered_monthly_rate,
    deposit: row.deposit_amount,
    discountReason: row.discount_reason,
    notes: row.notes,
    status: row.status,
    paid: Boolean(paidInvoice),
    paidAt: paidPayment?.paid_at?.slice(0, 10) || paidInvoice?.issue_date || null,
    previousUnpaidAmount: previousUnpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    previousUnpaidCount: previousUnpaidInvoices.length
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
  return isoDate(new Date());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function addMonthsClamped(date, months) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function dateInMonthByJoiningDay(year, monthIndex, joiningDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(joiningDay, lastDay));
}

function membershipCycle(memberOrRow, referenceDate = new Date()) {
  const joiningDate = memberOrRow.joiningDate || memberOrRow.joining_date;
  if (!joiningDate) {
    const today = isoDate(referenceDate);
    return { from: today, validTill: today };
  }
  const joining = new Date(`${joiningDate}T00:00:00`);
  const fromDate = dateInMonthByJoiningDay(referenceDate.getFullYear(), referenceDate.getMonth(), joining.getDate());
  const validTillDate = addMonthsClamped(fromDate, 1);
  return {
    from: isoDate(fromDate),
    validTill: isoDate(validTillDate)
  };
}

function paymentState(member) {
  if (member.paid) return "paid";
  const days = daysUntil(member.validTill);
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

function canSeeRevenue() {
  return staffProfile?.role === "owner" || staffProfile?.role === "manager";
}

function moneyOrRestricted(amount) {
  return canSeeRevenue() ? fmt.format(amount) : "Restricted";
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
  renderCashAccounting();
}

function renderMetrics() {
  const total = members.reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const collected = members.filter((member) => member.paid).reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const previousUnpaid = members.reduce((sum, member) => sum + Number(member.previousUnpaidAmount || 0), 0);
  const pending = total - collected + previousUnpaid;
  const dueSoon = members.filter((member) => !member.paid && daysUntil(member.validTill) <= 7).length;
  const seats = members.reduce((sum, member) => sum + Number(member.seats), 0);
  const capacity = capacityForCategory("rooms") + deskCapacities.flexible + deskCapacities.dedicated + deskCapacities.personal;
  const percentage = total ? Math.round((collected / total) * 100) : 0;
  const pendingThisMonth = total - collected;

  els.metricRevenue.textContent = moneyOrRestricted(total);
  els.metricCollected.textContent = canSeeRevenue() ? `${percentage}% collected` : "Owner / manager only";
  els.metricCollectedMonth.textContent = moneyOrRestricted(collected);
  els.metricPendingMonth.textContent = moneyOrRestricted(pendingThisMonth);
  els.metricMembers.textContent = members.length;
  els.metricSeats.textContent = `${seats}/${capacity} seats utilized (${percentOf(seats, capacity)}%)`;
  els.metricDue.textContent = dueSoon;
  els.metricPending.textContent = members.filter((member) => !member.paid).length + members.reduce((sum, member) => sum + Number(member.previousUnpaidCount || 0), 0);
  els.metricOutstanding.textContent = canSeeRevenue() ? `${fmt.format(pending)} outstanding` : "Amount restricted";
}

function renderMembers() {
  const query = els.memberSearch.value.trim().toLowerCase();
  const filtered = members.filter((member) => {
    const haystack = `${member.name} ${member.company || ""} ${member.phone} ${member.plan}`.toLowerCase();
    return haystack.includes(query);
  });

  const groups = [
    { key: "rooms", label: "Rooms", detail: "Private rooms, cubicle, executive room" },
    { key: "flexible", label: "Desks - Flexible Desk", detail: "Flexible desk members" },
    { key: "dedicated", label: "Desks - Dedicated Desk", detail: "Dedicated desk members" },
    { key: "personal", label: "Desks - Personal Desk", detail: "Personal desk members" }
  ];

  const rows = groups.map((group) => {
    const groupMembers = filtered
      .filter((member) => memberCategory(member).key === group.key)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!groupMembers.length) return "";
    const occupied = groupMembers.reduce((sum, member) => sum + Number(member.seats || 0), 0);
    const revenue = groupMembers.reduce((sum, member) => sum + Number(member.monthlyFee || 0), 0);
    return `
      <tr class="member-group-row">
        <td colspan="8">
          <strong>${escapeHtml(group.label)}</strong>
          <span>${groupMembers.length} member${groupMembers.length === 1 ? "" : "s"} | ${occupied} seat${occupied === 1 ? "" : "s"}${canSeeRevenue() ? ` | ${fmt.format(revenue)}` : ""}</span>
        </td>
      </tr>
      ${groupMembers.map((member) => {
        const state = paymentState(member);
        const category = memberCategory(member);
        return `
      <tr>
        <td><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.company || "Individual")} | ${escapeHtml(member.phone)}</span></td>
        <td><span class="category-label">${escapeHtml(category.label)}</span></td>
        <td><strong>${escapeHtml(member.plan)}</strong><span>${member.seats} seat${Number(member.seats) === 1 ? "" : "s"}</span></td>
        <td>${formatDate(member.joiningDate)}</td>
        <td>${formatDate(member.validTill)}</td>
        <td>${canSeeRevenue() ? rateLabel(member) : "Restricted"}</td>
        <td><span class="status ${state}">${stateLabel(state)}</span></td>
        <td>
          <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Receipt</button>
          <button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edit invoice</button>
          ${member.paid ? "" : `<button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>`}
        </td>
      </tr>
    `;
      }).join("")}
    `;
  }).join("");

  els.membersTable.innerHTML = rows || `<tr><td colspan="8">No members found.</td></tr>`;
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

function hasUnsavedSheetChanges() {
  return Boolean(els.memberSheet?.querySelector("tr.dirty"));
}

async function maybeRefreshData(reason = "auto") {
  if (!session?.access_token || els.appShell.hidden || hasUnsavedSheetChanges()) return;
  const now = Date.now();
  if (reason !== "manual" && now - lastAutoRefreshAt < 60000) return;
  lastAutoRefreshAt = now;
  try {
    await loadData();
  } catch (error) {
    console.error(error);
    setSyncStatus("Refresh failed", "error");
  }
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

async function createCashEntryFromForm(form, entryType) {
  const data = new FormData(form);
  const categoryOrSource = entryType === "expense" ? data.get("category") : data.get("source");
  await insertRow("cash_ledger", {
    entry_date: data.get("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categoryOrSource : null,
    source: entryType === "receiving" ? categoryOrSource : null,
    person_name: data.get("personName") || null,
    amount: Number(data.get("amount") || 0),
    notes: data.get("notes") || null
  });
}

async function saveCashRow(id) {
  const row = els.cashSheet.querySelector(`tr[data-cash-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();
  const entryType = value("entryType");
  const categorySource = value("categorySource");
  await patchRow("cash_ledger", id, {
    entry_date: value("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categorySource : null,
    source: entryType === "receiving" ? categorySource : null,
    person_name: value("personName") || null,
    amount: Number(value("amount") || 0),
    notes: value("notes") || null
  });
}

function renderReceipts() {
  const queue = members
    .filter((member) => !member.paid)
    .sort((a, b) => daysUntil(a.validTill) - daysUntil(b.validTill) || a.name.localeCompare(b.name));
  const groups = [
    { label: "Overdue", members: queue.filter((member) => daysUntil(member.validTill) < 0) },
    { label: "Due soon", members: queue.filter((member) => daysUntil(member.validTill) >= 0 && daysUntil(member.validTill) <= 7) },
    { label: "Upcoming", members: queue.filter((member) => daysUntil(member.validTill) > 7) }
  ].filter((group) => group.members.length);

  els.receiptQueue.innerHTML = groups.length ? groups.map((group) => `
    <div class="queue-group">
      <div class="queue-group-title">${group.label}</div>
      ${group.members.map((member) => {
        const days = daysUntil(member.validTill);
        const dueLabel = days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : `${days} day${days === 1 ? "" : "s"} left`;
        return `
    <article class="queue-item">
      <header>
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.plan)} | Valid till ${formatDate(member.validTill)}</span>
        </div>
        <div class="queue-amount">
          <strong>${moneyOrRestricted(Number(member.monthlyFee))}</strong>
          <span>${dueLabel}</span>
        </div>
      </header>
      <div class="queue-actions">
        <button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>
        <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Preview receipt</button>
        <button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edited invoice</button>
      </div>
    </article>
        `;
      }).join("")}
    </div>
  `).join("") : `<p class="empty">All visible invoices are paid.</p>`;
}

function renderLedger() {
  const summaries = categorySummaries();
  const roomSummary = summaries.find((summary) => summary.key === "rooms");
  const deskSummaries = summaries.filter((summary) => summary.key !== "rooms");
  const collected = members.filter((member) => member.paid);
  const outstanding = members.filter((member) => !member.paid);
  const previousUnpaidAmount = members.reduce((sum, member) => sum + Number(member.previousUnpaidAmount || 0), 0);
  const previousUnpaidCount = members.reduce((sum, member) => sum + Number(member.previousUnpaidCount || 0), 0);
  const groups = [
    ["Total room sales", `${roomSummary.occupied}/${roomSummary.capacity} capacity used (${roomSummary.utilization}%)`, roomSummary.revenue],
    ["Individual desk sales", `${deskSummaries.reduce((sum, summary) => sum + summary.occupied, 0)}/${deskSummaries.reduce((sum, summary) => sum + summary.capacity, 0)} desk capacity used`, deskSummaries.reduce((sum, summary) => sum + summary.revenue, 0)],
    ["Collected", `${collected.length} paid record${collected.length === 1 ? "" : "s"}`, collected.reduce((sum, member) => sum + Number(member.monthlyFee), 0)],
    ["Outstanding", `${outstanding.length} pending record${outstanding.length === 1 ? "" : "s"}`, outstanding.reduce((sum, member) => sum + Number(member.monthlyFee), 0)],
    ["Previous unpaid", `${previousUnpaidCount} older invoice${previousUnpaidCount === 1 ? "" : "s"} unpaid`, previousUnpaidAmount],
    ["Deposits held", `${members.length} active record${members.length === 1 ? "" : "s"}`, members.reduce((sum, member) => sum + Number(member.deposit || 0), 0)]
  ];

  els.ledger.innerHTML = groups.map(([label, detail, amount]) => `
    <div class="ledger-row">
      <div>
        <strong>${label}</strong>
        <span>${detail}</span>
      </div>
      <strong>${moneyOrRestricted(amount)}</strong>
    </div>
  `).join("");
}

function cashAmount(entry) {
  const amount = Number(entry.amount || 0);
  return entry.entry_type === "expense" ? -amount : amount;
}

function canEditCashEntry(entry) {
  if (canSeeRevenue()) return true;
  if (entry.created_by && entry.created_by !== session?.user?.id) return false;
  const createdAt = new Date(entry.created_at || entry.entry_date);
  return Date.now() - createdAt.getTime() <= 3 * 86400000;
}

function cashEntryOptions(type, selected) {
  const options = type === "expense"
    ? expenseCategories
    : ["Owner transfer - Abrar", ...plans.map((plan) => plan.name), "Day Pass", "Weekly Pass", "Conference Room", "Miscellaneous"];
  return options.map((option) => `
    <option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>
  `).join("");
}

function renderCashAccounting() {
  if (!cashLedgerReady) {
    els.cashBalance.textContent = "Setup needed";
    els.cashMessage.textContent = "Run the cash ledger SQL in Supabase to enable this section.";
    els.cashSheet.innerHTML = `<tr><td colspan="7">Cash ledger table is not enabled yet.</td></tr>`;
    return;
  }
  const query = els.cashSearch.value.trim().toLowerCase();
  const balance = cashEntries.reduce((sum, entry) => sum + cashAmount(entry), 0);
  els.cashBalance.textContent = fmt.format(balance);

  const filtered = cashEntries.filter((entry) => {
    const haystack = [
      entry.entry_type,
      entry.category,
      entry.source,
      entry.person_name,
      entry.notes
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  els.cashSheet.innerHTML = filtered.length ? filtered.map((entry) => {
    const editable = canEditCashEntry(entry);
    const typeLabel = entry.entry_type === "expense" ? "Expense" : "Receiving";
    const categoryValue = entry.entry_type === "expense" ? entry.category : entry.source;
    return `
      <tr data-cash-id="${entry.id}" class="${editable ? "" : "locked"}">
        <td><input data-field="entryDate" type="date" value="${escapeAttr(entry.entry_date)}" ${editable ? "" : "disabled"}></td>
        <td>
          <select data-field="entryType" ${editable ? "" : "disabled"}>
            <option value="expense" ${entry.entry_type === "expense" ? "selected" : ""}>Expense</option>
            <option value="receiving" ${entry.entry_type === "receiving" ? "selected" : ""}>Receiving</option>
          </select>
        </td>
        <td><select data-field="categorySource" ${editable ? "" : "disabled"}>${cashEntryOptions(entry.entry_type, categoryValue)}</select></td>
        <td><input data-field="personName" value="${escapeAttr(entry.person_name)}" ${editable ? "" : "disabled"}></td>
        <td><input data-field="amount" type="number" min="0" step="100" value="${Number(entry.amount || 0)}" ${editable ? "" : "disabled"}></td>
        <td><textarea data-field="notes" rows="1" ${editable ? "" : "disabled"}>${escapeHtml(entry.notes)}</textarea></td>
        <td>${editable ? `<button class="tiny-button" data-action="save-cash-row" data-id="${entry.id}" type="button">Save</button>` : `<span class="locked-note">Locked</span>`}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7">No cash entries found. Run the cash ledger SQL if this section has not been enabled yet.</td></tr>`;

  els.cashMessage.textContent = filtered.length
    ? `${filtered.length} row${filtered.length === 1 ? "" : "s"} | Staff can edit own rows for 3 days`
    : "No cash entries";
}

function renderPlans() {
  els.planList.innerHTML = plans.length ? plans.map((plan) => `
    <article class="plan-card">
      <header>
        <div>
          <strong>${plan.name}</strong>
          <span>${plan.type} | ${plan.seats} person${plan.seats === 1 ? "" : "s"}</span>
        </div>
        <strong>${moneyOrRestricted(plan.price)}</strong>
      </header>
    </article>
  `).join("") : `<p class="empty">Run the Supabase schema to load membership plans.</p>`;

  els.planSelect.innerHTML = plans.map((plan) => `
    <option value="${plan.name}" data-id="${plan.id}" data-seats="${plan.seats}" data-price="${plan.price}">${plan.name}</option>
  `).join("");

  els.expenseCategory.innerHTML = expenseCategories.map((category) => `
    <option value="${escapeAttr(category)}">${escapeHtml(category)}</option>
  `).join("");

  const receivingSources = [
    "Owner transfer - Abrar",
    ...plans.map((plan) => plan.name),
    "Day Pass",
    "Weekly Pass",
    "Conference Room",
    "Miscellaneous"
  ];
  els.receivingSource.innerHTML = receivingSources.map((source) => `
    <option value="${escapeAttr(source)}">${escapeHtml(source)}</option>
  `).join("");
}

function renderBars() {
  const summaries = categorySummaries();
  els.planBarsTitle.textContent = canSeeRevenue() ? "Occupancy and revenue mix" : "Occupancy mix";

  els.planBars.innerHTML = summaries.map((row) => `
    <div class="bar-row">
      <div class="bar-label">
        <span>${row.label}</span>
        <strong>${row.occupied}/${row.capacity}${canSeeRevenue() ? ` | ${fmt.format(row.revenue)}` : ""}</strong>
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

function billingStandardForMember(member) {
  if (isRoomMember(member)) return Number(member.seats || 0) * roomSeatRate;
  return Number(member.basePlanPrice || member.monthlyFee || 0);
}

function shouldShowDiscount(override = {}) {
  return override.mode === "edited" || Boolean(override.showDiscount);
}

function invoicePricing(member, override = {}) {
  const amount = Number(override.amount ?? member.monthlyFee);
  const tax = Number(override.tax ?? 0);
  const showDiscount = shouldShowDiscount(override);
  const standardPrice = showDiscount
    ? Number(override.standardPrice ?? billingStandardForMember(member) ?? amount)
    : amount;
  const discount = showDiscount ? Math.max(0, standardPrice - amount) : 0;
  return { amount, tax, total: amount + tax, standardPrice, discount };
}

function receiptDateFor(member, override = {}) {
  if (override.receiptDate) return override.receiptDate;
  if (override.mode === "quick") return isoToday();
  if (member.membershipFrom) return member.membershipFrom;
  return member.paidAt || isoToday();
}

function validityLabel(member, override = {}) {
  if (override.validityText) return override.validityText;
  const validTill = override.validTill || member.validTill || member.renewalDate;
  if (override.mode === "quick") return `Service Valid Till ${formatDate(validTill)}`;
  return `Membership Valid Till ${formatDate(validTill)}`;
}

function rateLabel(member) {
  const basePrice = billingStandardForMember(member);
  const monthlyFee = Number(member.monthlyFee);
  const discount = Math.max(0, basePrice - monthlyFee);
  if (!discount || !member.discountReason) return fmt.format(monthlyFee);
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
      receiptDate: member.membershipFrom,
      validTill: member.validTill
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
  const { amount, tax, total, standardPrice, discount } = invoicePricing(member, override);
  const invoiceNumber = override.invoiceId || `${override.mode === "edited" ? "INV" : "SC"}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const invoice = await insertRow("invoices", {
    invoice_number: invoiceNumber,
    member_id: member.id,
    invoice_type: override.mode === "edited" ? "edited" : "membership",
    issue_date: override.receiptDate || isoToday(),
    valid_till: override.validTill || member.validTill || member.renewalDate,
    standard_amount: standardPrice,
    discount_amount: discount,
    subtotal_amount: amount,
    tax_amount: tax,
    total_amount: total,
    status: override.status || "sent",
    edit_note: override.note || null
  });
  await insertRow("invoice_items", {
    invoice_id: invoice.id,
    description: override.description || member.plan,
    quantity: Number(override.seats ?? member.seats),
    unit_price: standardPrice,
    amount
  });
  return invoice;
}

function openInvoice(member, override = {}) {
  const invoiceId = override.invoiceId || `${override.mode === "edited" ? "INV" : "SC"}-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`;
  const { amount, tax, total, standardPrice, discount } = invoicePricing(member, override);
  const invoiceTitle = override.title || (override.mode === "edited" ? "Spaces Membership Invoice" : "Spaces Membership");
  const invoiceLabel = override.mode === "edited" ? "Invoice No." : "Receipt No.";
  const statusLine = override.mode === "edited" ? "Edited invoice" : "Receipt";
  const issuedDate = receiptDateFor(member, override);
  const validText = validityLabel(member, override);
  const description = override.description || member.plan;
  const quantity = Number(override.seats ?? member.seats);
  const message = [
    `Spaces Coworking ${statusLine.toLowerCase()} ${invoiceId}`,
    `${override.mode === "quick" ? "Customer" : "Member"}: ${member.name}`,
    `Service: ${description}`,
    discount ? `Standard rate: ${fmt.format(standardPrice)}` : "",
    discount ? `Discount: ${fmt.format(discount)}` : "",
    `Amount: ${fmt.format(total)}`,
    validText,
    override.note ? `Note: ${override.note}` : "",
    "Thank you."
  ].filter(Boolean).join("\n");

  const noteRows = [
    override.note && !discount ? override.note : "",
    discount ? `Discount: ${fmt.format(discount)}${override.note ? ` - ${override.note}` : ""}` : ""
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
              <span><strong>${override.mode === "quick" ? "Receipt Date" : "Membership From"}:</strong> ${formatDate(issuedDate)}</span>
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
            <td>${escapeHtml(description)}</td>
            <td>${String(quantity).padStart(2, "0")}</td>
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
          <div class="signature-line">${escapeHtml(validText)}</div>
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
  els.editInvoiceForm.elements.standardPrice.value = billingStandardForMember(member) || member.monthlyFee;
  els.editInvoiceForm.elements.invoiceAmount.value = member.monthlyFee;
  els.editInvoiceForm.elements.validTill.value = member.validTill || member.renewalDate;
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
    billingStandardForMember(member) || member.monthlyFee,
    member.monthlyFee,
    member.discountReason ? Math.max(0, billingStandardForMember(member) - Number(member.monthlyFee)) : 0,
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
  els.expenseForm.elements.entryDate.value = isoToday();
  els.receivingForm.elements.entryDate.value = isoToday();
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

function syncQuickInvoiceFields() {
  const service = quickServices[els.quickService.value];
  const quantity = Math.max(1, Number(els.quickQuantity.value || 1));
  const total = service.rate * quantity;
  els.quickQuantityLabel.textContent = service.unitLabel;
  els.quickRate.value = service.rate;
  els.quickTotal.value = total;
  els.quickInvoiceSummary.innerHTML = `<strong>${service.label}:</strong> ${quantity} ${service.unitName} x ${fmt.format(service.rate)} = ${fmt.format(total)}.`;
}

function quickValidity(service, quantity) {
  const now = new Date();
  if (service.validity === "week") {
    const validTill = addDays(now, 7);
    return {
      receiptDate: isoDate(now),
      validTill: isoDate(validTill),
      validityText: `Service Valid Till ${formatDate(isoDate(validTill))}`
    };
  }
  if (service.validity === "hours") {
    const validUntil = addHours(now, quantity);
    return {
      receiptDate: isoDate(now),
      validTill: isoDate(validUntil),
      validityText: `Service Valid Until ${formatDateTime(validUntil)}`
    };
  }
  return {
    receiptDate: isoDate(now),
    validTill: isoDate(now),
    validityText: `Service Valid Till ${formatDate(isoDate(now))}`
  };
}

function generateQuickInvoice() {
  const data = new FormData(els.quickInvoiceForm);
  const service = quickServices[data.get("service")];
  const quantity = Math.max(1, Number(data.get("quantity") || 1));
  const amount = service.rate * quantity;
  const note = data.get("notes") || "";
  const validity = quickValidity(service, quantity);
  openInvoice({
    id: `quick-${Date.now()}`,
    name: data.get("name"),
    phone: data.get("phone"),
    company: "Walk-in / temporary receipt",
    plan: service.label,
    seats: quantity,
    renewalDate: isoToday(),
    monthlyFee: amount,
    basePlanPrice: amount,
    paidAt: isoToday()
  }, {
    mode: "quick",
    title: "Spaces Temporary Receipt",
    invoiceId: `SP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    description: `${service.label} - ${quantity} ${service.unitName}`,
    seats: quantity,
    standardPrice: amount,
    amount,
    ...validity,
    note
  });
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
  if (button.dataset.action === "save-cash-row") {
    saveCashRow(button.dataset.id)
      .then(loadData)
      .catch((error) => {
        alert(`Could not save cash row: ${error.message}`);
        setSyncStatus("Error", "error");
      });
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
els.quickService.addEventListener("change", syncQuickInvoiceFields);
els.quickQuantity.addEventListener("input", syncQuickInvoiceFields);
els.resetQuickInvoice.addEventListener("click", () => {
  window.setTimeout(syncQuickInvoiceFields, 0);
});
els.memberSearch.addEventListener("input", renderMembers);
els.sheetSearch.addEventListener("input", renderSheetEditor);
els.cashSearch.addEventListener("input", renderCashAccounting);
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
els.cashSheet.addEventListener("change", (event) => {
  if (event.target.dataset.field !== "entryType") return;
  const row = event.target.closest("tr[data-cash-id]");
  const categorySelect = row?.querySelector('[data-field="categorySource"]');
  if (!categorySelect) return;
  categorySelect.innerHTML = cashEntryOptions(event.target.value, "");
});
els.saveAllSheetRows.addEventListener("click", saveChangedSheetRows);
els.refreshMembers.addEventListener("click", () => loadData().catch((error) => {
  alert(`Could not refresh members: ${error.message}`);
  setSyncStatus("Error", "error");
}));
window.addEventListener("focus", () => maybeRefreshData());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) maybeRefreshData();
});
window.setInterval(() => maybeRefreshData(), 60000);
els.exportCsv.addEventListener("click", exportCsv);
els.printReceipt.addEventListener("click", () => window.print());
els.downloadReceipt.addEventListener("click", () => window.print());
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

els.quickInvoiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  generateQuickInvoice();
});

els.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setSyncStatus("Saving", "busy");
    await createCashEntryFromForm(els.expenseForm, "expense");
    els.expenseForm.reset();
    setDefaultDates();
    await loadData();
  } catch (error) {
    alert(`Could not save expense: ${error.message}`);
    setSyncStatus("Error", "error");
  }
});

els.receivingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setSyncStatus("Saving", "busy");
    await createCashEntryFromForm(els.receivingForm, "receiving");
    els.receivingForm.reset();
    setDefaultDates();
    await loadData();
  } catch (error) {
    alert(`Could not save receiving: ${error.message}`);
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
    receiptDate: member.membershipFrom,
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
