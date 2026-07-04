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

const paymentSources = [
  { key: "spaces_account", label: "Spaces Account" },
  { key: "raza_manager", label: "Raza / Manager" },
  { key: "staff", label: "Staff" },
  { key: "abrar_owner", label: "Abrar / Owner" }
];

const staffExpensePaymentMethods = [
  { key: "petty_cash", label: "Cash / Petty cash" },
  { key: "business_card", label: "Business debit card" }
];

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

const ownerExpenseCategories = [
  "Petty Cash Top-Up",
  "Transfer to Staff",
  "Salaries",
  "Cleaning Expenses",
  "Internet Bills",
  "Utility Bills",
  "Building Maintenance",
  "Office Maintenance",
  "Office Supplies",
  "Food Supplies",
  "Generator Maintenance",
  "Miscellaneous Expenses",
  "Custom Categories"
];

let plans = [];
let members = [];
let memberRecords = [];
let memberPlanItems = [];
let invoices = [];
let payments = [];
let cashEntries = [];
let ownerEntries = [];
let salesReceipts = [];
let auditLogs = [];
let salesReceiptsReady = true;
let auditLogReady = true;
let cashLedgerReady = true;
let ownerLedgerReady = true;
let memberPlanItemsReady = true;
let staffProfile = null;
let session = loadSession();
let lastAutoRefreshAt = 0;
let memberFormPlanLines = [];
let currentReceiptShare = {
  message: "",
  fileName: "spaces-receipt.pdf",
  receipt: null,
  memberId: null
};

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
  toastStack: document.querySelector("#toastStack"),
  logoutButton: document.querySelector("#logoutButton"),
  pageTitle: document.querySelector("#pageTitle"),
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
  addPlanLine: document.querySelector("#addPlanLine"),
  memberPlanLines: document.querySelector("#memberPlanLines"),
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
  cashOpeningBalance: document.querySelector("#cashOpeningBalance"),
  cashReceivedMonth: document.querySelector("#cashReceivedMonth"),
  cashInternalMonth: document.querySelector("#cashInternalMonth"),
  cashExpensesMonth: document.querySelector("#cashExpensesMonth"),
  cashCashExpensesMonth: document.querySelector("#cashCashExpensesMonth"),
  cashCardExpensesMonth: document.querySelector("#cashCardExpensesMonth"),
  cashMonth: document.querySelector("#cashMonth"),
  cashReport: document.querySelector("#cashReport"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseCategory: document.querySelector("#expenseCategory"),
  expensePaymentMethod: document.querySelector("#expensePaymentMethod"),
  receivingForm: document.querySelector("#receivingForm"),
  receivingSource: document.querySelector("#receivingSource"),
  receivingPaymentSource: document.querySelector("#receivingPaymentSource"),
  cashSearch: document.querySelector("#cashSearch"),
  cashMessage: document.querySelector("#cashMessage"),
  cashSheet: document.querySelector("#cashSheet"),
  ownerMonth: document.querySelector("#ownerMonth"),
  ownerReport: document.querySelector("#ownerReport"),
  financeRevenue: document.querySelector("#financeRevenue"),
  financeOwnerExpenses: document.querySelector("#financeOwnerExpenses"),
  financeStaffExpenses: document.querySelector("#financeStaffExpenses"),
  financeNetProfit: document.querySelector("#financeNetProfit"),
  financeOwnerBalance: document.querySelector("#financeOwnerBalance"),
  financeStaffBalance: document.querySelector("#financeStaffBalance"),
  financeOutstanding: document.querySelector("#financeOutstanding"),
  financeCompanyExpenses: document.querySelector("#financeCompanyExpenses"),
  financeSourceBreakdown: document.querySelector("#financeSourceBreakdown"),
  ownerExpenseForm: document.querySelector("#ownerExpenseForm"),
  ownerExpenseCategory: document.querySelector("#ownerExpenseCategory"),
  ownerExpenseSource: document.querySelector("#ownerExpenseSource"),
  ownerReceivingForm: document.querySelector("#ownerReceivingForm"),
  ownerReceivingSource: document.querySelector("#ownerReceivingSource"),
  ownerReceivingPaymentSource: document.querySelector("#ownerReceivingPaymentSource"),
  ownerSearch: document.querySelector("#ownerSearch"),
  ownerMessage: document.querySelector("#ownerMessage"),
  ownerSheet: document.querySelector("#ownerSheet"),
  auditReport: document.querySelector("#auditReport"),
  auditLogSheet: document.querySelector("#auditLogSheet"),
  auditMessage: document.querySelector("#auditMessage"),
  editInvoiceDialog: document.querySelector("#editInvoiceDialog"),
  editInvoiceForm: document.querySelector("#editInvoiceForm"),
  receiptDialog: document.querySelector("#receiptDialog"),
  receiptPreview: document.querySelector("#receiptPreview"),
  whatsappReceipt: document.querySelector("#whatsappReceipt"),
  manualWhatsappReceipt: document.querySelector("#manualWhatsappReceipt"),
  receiptSendStatus: document.querySelector("#receiptSendStatus"),
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
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const message = payload?.message || payload?.msg || payload?.error_description || text || `Supabase request failed: ${response.status}`;
    const details = payload?.details && !String(message).includes(payload.details) ? ` ${payload.details}` : "";
    const error = new Error(`${message}${details}`);
    error.status = response.status;
    error.code = payload?.code || null;
    error.payload = payload;
    throw error;
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

async function deleteRows(table, query) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function callRpc(name, params) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: params
  });
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
  const invoiceSelect = canSeeRevenue()
    ? "select=*&order=created_at.desc"
    : "select=id,invoice_number,member_id,invoice_type,issue_date,valid_till,status,created_at&order=created_at.desc";
  const [planRows, memberRows, invoiceRows, paymentRows] = await Promise.all([
    selectRows("plans", "select=*&active=eq.true&order=name.asc"),
    selectRows("members", "select=*&order=created_at.desc"),
    selectRows("invoices", invoiceSelect),
    canSeeRevenue() ? selectRows("payments", "select=*&order=paid_at.desc") : Promise.resolve([])
  ]);
  try {
    cashEntries = await selectRows("cash_ledger", "select=*&order=entry_date.desc,created_at.desc");
    cashLedgerReady = true;
  } catch (error) {
    cashEntries = [];
    cashLedgerReady = false;
    console.warn("cash_ledger unavailable", error);
  }
  if (canSeeRevenue()) {
    try {
      ownerEntries = await selectRows("owner_ledger", "select=*&order=entry_date.desc,created_at.desc");
      ownerLedgerReady = true;
    } catch (error) {
      ownerEntries = [];
      ownerLedgerReady = false;
      console.warn("owner_ledger unavailable", error);
    }
    try {
      auditLogs = await selectRows("transaction_audit", "select=*&order=created_at.desc&limit=100");
      auditLogReady = true;
    } catch (error) {
      auditLogs = [];
      auditLogReady = false;
      console.warn("transaction_audit unavailable", error);
    }
  } else {
    ownerEntries = [];
    auditLogs = [];
    ownerLedgerReady = false;
  }
  try {
    salesReceipts = await selectRows("sales_receipts", "select=*&order=receipt_date.desc,created_at.desc");
    salesReceiptsReady = true;
  } catch (error) {
    salesReceipts = [];
    salesReceiptsReady = false;
    console.warn("sales_receipts unavailable", error);
  }
  plans = planRows.map(mapPlan);
  invoices = invoiceRows;
  payments = paymentRows;
  try {
    memberPlanItems = await selectRows("member_plan_items", "select=*&order=sort_order.asc,created_at.asc");
    memberPlanItemsReady = true;
  } catch (error) {
    memberPlanItems = [];
    memberPlanItemsReady = false;
    console.warn("member_plan_items unavailable", error);
  }
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

function mapMemberPlanItem(row) {
  const plan = plans.find((item) => item.id === row.plan_id || item.name === row.plan_name);
  return {
    id: row.id,
    memberId: row.member_id,
    planId: row.plan_id,
    planName: row.plan_name,
    category: row.category || plan?.category || inferPlanCategory(row.plan_name),
    seats: Number(row.seats || plan?.seats || 1),
    standardRate: Number(row.standard_monthly_rate || plan?.price || 0),
    offeredRate: Number(row.offered_monthly_rate || 0),
    sortOrder: Number(row.sort_order || 0)
  };
}

function derivedPlanItems(row, plan) {
  return [{
    id: `${row.id}-primary`,
    memberId: row.id,
    planId: row.plan_id,
    planName: row.plan_name,
    category: plan?.category || inferPlanCategory(row.plan_name),
    seats: Number(row.seats || 1),
    standardRate: Number(row.standard_monthly_rate || 0),
    offeredRate: Number(row.offered_monthly_rate || 0),
    sortOrder: 0
  }];
}

function planItemsLabel(items) {
  if (!items.length) return "No plan";
  if (items.length === 1) return items[0].planName;
  return items.map((item) => `${item.seats} ${item.planName}`).join(" + ");
}

function formatPlanLines(items) {
  return (items || []).map((item) => [
    item.planName,
    item.seats,
    item.standardRate,
    item.offeredRate
  ].join(" | ")).join("\n");
}

function parsePlanLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [planNameRaw, seatsRaw, standardRaw, offeredRaw] = line.split("|").map((part) => part?.trim());
      const planName = planNameRaw || "";
      const plan = plans.find((item) => item.name.toLowerCase() === planName.toLowerCase());
      const seats = positiveIntOr(seatsRaw || plan?.seats, 1);
      const standardRate = nonNegativeMoney(standardRaw || plan?.price, 0);
      const offeredRate = nonNegativeMoney(offeredRaw || standardRate, standardRate);
      return {
        planId: plan?.id || null,
        planName: plan?.name || planName,
        category: plan?.category || inferPlanCategory(planName),
        seats,
        standardRate,
        offeredRate,
        sortOrder: index
      };
    });
}

function serializePlanLineForDb(item, memberId, index) {
  return {
    member_id: memberId,
    plan_id: item.planId || null,
    plan_name: item.planName,
    category: item.category || inferPlanCategory(item.planName),
    seats: positiveIntOr(item.seats, 1),
    standard_monthly_rate: nonNegativeMoney(item.standardRate, 0),
    offered_monthly_rate: nonNegativeMoney(item.offeredRate, 0),
    sort_order: index
  };
}

function mapMember(row) {
  const plan = plans.find((item) => item.id === row.plan_id || item.name === row.plan_name);
  const planItems = memberPlanItems
    .filter((item) => item.member_id === row.id)
    .map(mapMemberPlanItem);
  const activePlanItems = planItems.length ? planItems : derivedPlanItems(row, plan);
  const totalSeats = activePlanItems.reduce((sum, item) => sum + Number(item.seats || 0), 0);
  const standardRate = activePlanItems.reduce((sum, item) => sum + Number(item.standardRate || 0), 0);
  const offeredRate = activePlanItems.reduce((sum, item) => sum + Number(item.offeredRate || 0), 0);
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
    plan: planItemsLabel(activePlanItems),
    primaryPlanName: row.plan_name,
    planCategory: activePlanItems.some((item) => item.category === "room") ? "room" : activePlanItems[0]?.category || plan?.category || inferPlanCategory(row.plan_name),
    planItems: activePlanItems,
    seats: totalSeats || row.seats,
    joiningDate: row.joining_date,
    renewalDate: row.renewal_date,
    membershipFrom: cycle.from,
    validTill: cycle.validTill,
    basePlanPrice: standardRate || row.standard_monthly_rate,
    monthlyFee: offeredRate || row.offered_monthly_rate,
    deposit: row.deposit_amount,
    discountReason: row.discount_reason,
    notes: row.notes,
    status: row.status,
    paid: Boolean(paidInvoice),
    paidAt: paidPayment?.paid_at?.slice(0, 10) || paidInvoice?.issue_date || null,
    paidAmount: paidPayment ? Number(paidPayment.amount || 0) : Number(paidInvoice?.total_amount || 0),
    previousUnpaidAmount: previousUnpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    previousUnpaidCount: previousUnpaidInvoices.length
  };
}

function setSyncStatus(text, state = "") {
  els.syncStatus.textContent = text;
  els.syncStatus.dataset.state = state;
}

function showToast(title, detail = "", type = "success") {
  if (!els.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
  `;
  els.toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "opacity 160ms ease, transform 160ms ease";
    window.setTimeout(() => toast.remove(), 180);
  }, type === "error" ? 5200 : 3400);
}

function lockControl(control, busyText = "Saving...") {
  if (!control || control.dataset.busy === "true") return null;
  control.dataset.busy = "true";
  control.disabled = true;
  if ("textContent" in control) {
    control.dataset.originalText = control.textContent;
    control.textContent = busyText;
  }
  return (delay = 1800) => {
    window.setTimeout(() => {
      control.disabled = false;
      control.dataset.busy = "false";
      if (control.dataset.originalText) {
        control.textContent = control.dataset.originalText;
        delete control.dataset.originalText;
      }
    }, delay);
  };
}

async function withControlLock(control, task, options = {}) {
  if (control?.dataset.busy === "true") return null;
  const unlock = lockControl(control, options.busyText || "Saving...");
  try {
    const result = await task();
    if (options.successTitle && result !== false) showToast(options.successTitle, options.successDetail || "");
    if (unlock) unlock(options.cooldownMs ?? 1800);
    return result;
  } catch (error) {
    if (unlock) unlock(0);
    showToast(options.errorTitle || "Action failed", error.message || "Please try again.", "error");
    throw error;
  }
}

function submitButtonFor(form, event, fallbackSelector = 'button[type="submit"]') {
  return event?.submitter || form?.querySelector(fallbackSelector);
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

function numberOr(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function positiveIntOr(value, fallback = 1) {
  const next = Math.round(numberOr(value, fallback));
  return Math.max(1, next);
}

function nonNegativeMoney(value, fallback = 0) {
  return Math.max(0, Math.round(numberOr(value, fallback)));
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
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  let fromDate = dateInMonthByJoiningDay(reference.getFullYear(), reference.getMonth(), joining.getDate());
  if (reference < fromDate) {
    fromDate = dateInMonthByJoiningDay(reference.getFullYear(), reference.getMonth() - 1, joining.getDate());
  }
  const validTillDate = addMonthsClamped(fromDate, 1);
  return {
    from: isoDate(fromDate),
    validTill: isoDate(validTillDate)
  };
}

function paymentState(member) {
  if (member.paid) return "paid";
  const days = daysUntil(member.validTill);
  if (days < 0) return "overdue";
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

function planItemCategory(item) {
  if (item.category === "room" || inferPlanCategory(item.planName) === "room") return { key: "rooms", label: "Rooms" };
  if (/flexible/i.test(item.planName)) return { key: "flexible", label: "Flexible Desk" };
  if (/dedicated/i.test(item.planName)) return { key: "dedicated", label: "Dedicated Desk" };
  if (/personal/i.test(item.planName)) return { key: "personal", label: "Personal Desk" };
  return { key: "other", label: "Other" };
}

function memberHasCategory(member, key) {
  return (member.planItems || []).some((item) => planItemCategory(item).key === key);
}

function memberCategoryLabel(member) {
  const labels = [...new Set((member.planItems || []).map((item) => planItemCategory(item).label))];
  return labels.length ? labels.join(" + ") : memberCategory(member).label;
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
  return staffProfile?.role === "owner";
}

function moneyOrRestricted(amount) {
  return canSeeRevenue() ? fmt.format(amount) : "Restricted";
}

function paymentSourceLabel(source) {
  return paymentSources.find((item) => item.key === source || item.label === source)?.label || source || "Not selected";
}

function paymentSourceOptions(selected) {
  return paymentSources.map((source) => `
    <option value="${source.key}" ${source.key === selected || source.label === selected ? "selected" : ""}>${source.label}</option>
  `).join("");
}

function expensePaymentMethodLabel(method) {
  const normalized = method || "petty_cash";
  if (normalized === "cash") return "Cash / Petty cash";
  if (normalized === "card") return "Business debit card";
  return staffExpensePaymentMethods.find((item) => item.key === normalized)?.label || normalized || "Cash / Petty cash";
}

function expensePaymentMethodOptions(selected = "petty_cash") {
  const normalized = selected === "cash" ? "petty_cash" : selected === "card" ? "business_card" : selected;
  return staffExpensePaymentMethods.map((method) => `
    <option value="${method.key}" ${method.key === normalized ? "selected" : ""}>${method.label}</option>
  `).join("");
}

function setOwnerOnlyVisibility() {
  document.querySelectorAll(".owner-only").forEach((element) => {
    element.hidden = !canSeeRevenue();
  });
  ["basePlanPrice", "monthlyFee", "deposit", "discountReason"].forEach((name) => {
    const field = els.memberForm?.elements?.[name];
    if (!field) return;
    field.disabled = !canSeeRevenue();
    const label = field.closest("label");
    if (label) label.hidden = !canSeeRevenue();
  });
  const rateHint = document.querySelector(".member-form-panel .form-hint");
  if (rateHint) rateHint.hidden = !canSeeRevenue();
  if (els.rateSummary) els.rateSummary.hidden = !canSeeRevenue();
  if (!canAccessPage(activePage())) {
    history.replaceState(null, "", "#dashboard");
  }
}

const pageTitles = {
  dashboard: "Dashboard",
  members: "Members",
  receipts: "Receipts",
  "cash-accounting": "Staff Spending",
  "owner-ledger": "Business Ledger",
  accounting: "Accounting",
  plans: "Plans"
};

const pageAliases = {
  "member-form": "members",
  "member-sheet": "members",
  "quick-invoice": "receipts"
};

function activePage() {
  const hash = window.location.hash.replace("#", "") || "dashboard";
  const page = pageAliases[hash] || hash;
  return pageTitles[page] ? page : "dashboard";
}

function canAccessPage(page) {
  return canSeeRevenue() || page !== "owner-ledger";
}

function showActivePage() {
  let page = activePage();
  if (!canAccessPage(page)) {
    history.replaceState(null, "", "#dashboard");
    page = "dashboard";
    showToast("Owner access required", "Business ledger is only visible to Abrar.", "error");
  }
  document.querySelectorAll(".page-section").forEach((section) => {
    section.hidden = section.dataset.page !== page;
  });
  document.querySelectorAll(".sidebar nav a").forEach((link) => {
    const linkPage = pageAliases[link.hash.replace("#", "")] || link.hash.replace("#", "");
    link.classList.toggle("active", linkPage === page);
  });
  if (els.pageTitle) {
    els.pageTitle.textContent = pageTitles[page] || "Dashboard";
  }
}

function promptPaymentSource(title = "Select payment source") {
  const lines = paymentSources.map((source, index) => `${index + 1}. ${source.label}`).join("\n");
  const answer = window.prompt(`${title}\n\n${lines}\n\nEnter 1, 2, 3, or 4:`);
  if (answer === null) return null;
  const selected = paymentSources[Number(answer.trim()) - 1];
  if (!selected) {
    alert("Payment source is required before saving this payment.");
    return null;
  }
  return selected.key;
}

function categorySummaries() {
  const categories = [
    { key: "rooms", label: "Rooms", capacity: capacityForCategory("rooms") },
    { key: "flexible", label: "Flexible Desk", capacity: capacityForCategory("flexible") },
    { key: "dedicated", label: "Dedicated Desk", capacity: capacityForCategory("dedicated") },
    { key: "personal", label: "Personal Desk", capacity: capacityForCategory("personal") }
  ];

  return categories.map((category) => {
    const categoryItems = members.flatMap((member) => (member.planItems || [])
      .filter((item) => planItemCategory(item).key === category.key));
    const categoryMembers = members.filter((member) => memberHasCategory(member, category.key));
    const occupied = categoryItems.reduce((sum, item) => sum + Number(item.seats || 0), 0);
    const revenue = categoryItems.reduce((sum, item) => sum + Number(item.offeredRate || 0), 0);
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
  setOwnerOnlyVisibility();
  showActivePage();
  renderMetrics();
  renderMembers();
  renderSheetEditor();
  renderReceipts();
  renderLedger();
  renderBars();
  renderCashAccounting();
  renderOwnerLedger();
  renderAuditLog();
}

function renderMetrics() {
  const total = members.reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const collected = members.filter((member) => member.paid).reduce((sum, member) => sum + Number(member.paidAmount || member.monthlyFee), 0);
  const previousUnpaid = members.reduce((sum, member) => sum + Number(member.previousUnpaidAmount || 0), 0);
  const pending = total - collected + previousUnpaid;
  const dueSoon = members.filter((member) => !member.paid && daysUntil(member.validTill) <= 7).length;
  const seats = members.reduce((sum, member) => sum + Number(member.seats), 0);
  const capacity = capacityForCategory("rooms") + deskCapacities.flexible + deskCapacities.dedicated + deskCapacities.personal;
  const percentage = total ? Math.round((collected / total) * 100) : 0;
  const pendingThisMonth = total - collected;

  els.metricRevenue.textContent = moneyOrRestricted(total);
  els.metricCollected.textContent = canSeeRevenue() ? `${percentage}% collected` : "Owner only";
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
    const lineText = (member.planItems || []).map((item) => `${item.planName} ${item.offeredRate}`).join(" ");
    const haystack = `${member.name} ${member.company || ""} ${member.phone} ${member.plan} ${lineText}`.toLowerCase();
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
      .filter((member) => memberHasCategory(member, group.key))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!groupMembers.length) return "";
    const groupItems = groupMembers.flatMap((member) => member.planItems.filter((item) => planItemCategory(item).key === group.key));
    const occupied = groupItems.reduce((sum, item) => sum + Number(item.seats || 0), 0);
    const revenue = groupItems.reduce((sum, item) => sum + Number(item.offeredRate || 0), 0);
    return `
      <tr class="member-group-row">
        <td colspan="8">
          <strong>${escapeHtml(group.label)}</strong>
          <span>${groupMembers.length} member${groupMembers.length === 1 ? "" : "s"} | ${occupied} seat${occupied === 1 ? "" : "s"}${canSeeRevenue() ? ` | ${fmt.format(revenue)}` : ""}</span>
        </td>
      </tr>
      ${groupMembers.map((member) => {
        const state = paymentState(member);
        const lineSummary = (member.planItems || []).map((item) => `${item.seats} ${item.planName}${canSeeRevenue() ? ` @ ${fmt.format(item.offeredRate)}` : ""}`).join(" | ");
        return `
      <tr>
        <td><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.company || "Individual")} | ${escapeHtml(member.phone)}</span></td>
        <td><span class="category-label">${escapeHtml(memberCategoryLabel(member))}</span></td>
        <td><strong>${escapeHtml(member.plan)}</strong><span>${escapeHtml(lineSummary || `${member.seats} seat${Number(member.seats) === 1 ? "" : "s"}`)}</span></td>
        <td>${formatDate(member.joiningDate)}</td>
        <td>${formatDate(member.validTill)}</td>
        <td>${canSeeRevenue() ? rateLabel(member) : "Restricted"}</td>
        <td><span class="status ${state}">${stateLabel(state)}</span></td>
        <td>
          <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Receipt</button>
          ${canSeeRevenue() ? `<button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edit invoice</button>` : ""}
          ${member.paid ? "" : `<button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>`}
          <button class="tiny-button danger" data-action="delete-member" data-id="${member.id}" type="button">Archive</button>
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
      <td>${canSeeRevenue()
        ? `<textarea class="sheet-plan-lines" data-field="planLines" rows="3" placeholder="Plan | seats | standard | offered">${escapeHtml(formatPlanLines(member.planItems))}</textarea>`
        : `<textarea class="sheet-plan-lines" disabled rows="3">Restricted</textarea>`}</td>
      <td><input required data-field="seats" type="number" min="1" value="${Number(member.seats || 1)}"></td>
      <td><input required data-field="joiningDate" type="date" value="${escapeAttr(member.joiningDate)}"></td>
      <td><input required data-field="renewalDate" type="date" value="${escapeAttr(member.renewalDate)}"></td>
      <td>${canSeeRevenue() ? `<input required data-field="basePlanPrice" type="number" min="0" step="500" value="${Number(member.basePlanPrice || 0)}">` : `<input disabled value="Restricted">`}</td>
      <td>${canSeeRevenue() ? `<input required data-field="monthlyFee" type="number" min="0" step="500" value="${Number(member.monthlyFee || 0)}">` : `<input disabled value="Restricted">`}</td>
      <td>${canSeeRevenue() ? `<input data-field="deposit" type="number" min="0" step="500" value="${Number(member.deposit || 0)}">` : `<input disabled value="Restricted">`}</td>
      <td>${canSeeRevenue() ? `<input data-field="discountReason" value="${escapeAttr(member.discountReason)}">` : `<input disabled value="Restricted">`}</td>
      <td><textarea data-field="notes" rows="1">${escapeHtml(member.notes)}</textarea></td>
      <td>
        <select data-field="status">
          <option value="active" ${member.status === "active" ? "selected" : ""}>Active</option>
          <option value="paused" ${member.status === "paused" ? "selected" : ""}>Paused</option>
          <option value="cancelled" ${member.status === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
      </td>
      <td>
        <button class="tiny-button" data-action="save-member-row" data-id="${member.id}" type="button">Save</button>
        <button class="tiny-button danger" data-action="delete-member" data-id="${member.id}" type="button">Archive</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="16">No records found.</td></tr>`;
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

function markLedgerRowDirty(row, messageElement, defaultMessage) {
  if (!row) return;
  row.classList.add("dirty");
  if (messageElement) messageElement.textContent = defaultMessage;
}

function hasUnsavedLedgerChanges() {
  return Boolean(els.cashSheet?.querySelector("tr.dirty") || els.ownerSheet?.querySelector("tr.dirty"));
}

async function maybeRefreshData(reason = "auto") {
  if (!session?.access_token || els.appShell.hidden || hasUnsavedSheetChanges() || hasUnsavedLedgerChanges()) return;
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
  const existingMember = memberRecords.find((member) => member.id === id);
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();
  const editedPlanLines = canSeeRevenue()
    ? parsePlanLines(value("planLines") || "")
    : existingMember?.planItems || [];
  const primaryPlanLine = editedPlanLines[0] || {
    planId: selectedPlan?.id || null,
    planName: selectedPlan?.name || planSelect.selectedOptions[0]?.dataset.name || value("plan"),
    category: selectedPlan?.category || inferPlanCategory(selectedPlan?.name),
    seats: positiveIntOr(value("seats"), 1),
    standardRate: nonNegativeMoney(value("basePlanPrice") || selectedPlan?.price, 0),
    offeredRate: nonNegativeMoney(value("monthlyFee") || selectedPlan?.price, 0),
    sortOrder: 0
  };
  const totalSeats = editedPlanLines.reduce((sum, item) => sum + positiveIntOr(item.seats, 1), 0) || positiveIntOr(value("seats"), 1);
  const totalStandard = editedPlanLines.reduce((sum, item) => sum + nonNegativeMoney(item.standardRate, 0), 0);
  const totalOffered = editedPlanLines.reduce((sum, item) => sum + nonNegativeMoney(item.offeredRate, 0), 0);

  const changes = {
    full_name: value("name"),
    company: value("company") || null,
    phone: value("phone"),
    email: value("email") || null,
    plan_id: primaryPlanLine.planId || selectedPlan?.id || null,
    plan_name: primaryPlanLine.planName,
    seats: totalSeats,
    joining_date: value("joiningDate"),
    renewal_date: value("renewalDate"),
    notes: value("notes") || null,
    status: value("status") || "active"
  };
  if (canSeeRevenue()) {
    changes.standard_monthly_rate = totalStandard || nonNegativeMoney(value("basePlanPrice"), 0);
    changes.offered_monthly_rate = totalOffered || nonNegativeMoney(value("monthlyFee"), 0);
    changes.deposit_amount = nonNegativeMoney(value("deposit"), 0);
    changes.discount_reason = value("discountReason") || null;
  } else if (existingMember) {
    changes.standard_monthly_rate = nonNegativeMoney(existingMember.basePlanPrice, 0);
    changes.offered_monthly_rate = nonNegativeMoney(existingMember.monthlyFee, 0);
    changes.deposit_amount = nonNegativeMoney(existingMember.deposit, 0);
    changes.discount_reason = existingMember.discountReason || null;
  }
  await patchRow("members", id, changes);
  if (canSeeRevenue()) {
    await replaceMemberPlanItems(id, editedPlanLines.length ? editedPlanLines : [primaryPlanLine]);
  }
  await recordAudit("update_member_sheet", "members", id, {
    name: changes.full_name,
    status: changes.status,
    monthly_fee: changes.offered_monthly_rate
  });
}

async function saveChangedSheetRows() {
  const changedRows = [...els.memberSheet.querySelectorAll("tr.dirty")];
  if (!changedRows.length) {
    updateSheetMessage("No changes to save");
    showToast("No changes to save", "The client sheet is already up to date.");
    return false;
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
    setSyncStatus("Error", "error");
    updateSheetMessage("Save failed");
    throw error;
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
    setSyncStatus("Error", "error");
    updateSheetMessage("Save failed");
    throw error;
  }
}

async function deleteMember(id) {
  const member = memberRecords.find((item) => item.id === id);
  if (!member) return;
  const confirmed = window.confirm(`Archive ${member.name} from active clients? Receipt history will be kept.`);
  if (!confirmed) return;
  try {
    setSyncStatus("Deleting", "busy");
    await patchRow("members", id, { status: "cancelled" });
    await recordAudit("archive_member", "members", id, { name: member.name, previous_status: member.status });
    await loadData();
    showToast("Client archived", `${member.name} was removed from active clients.`);
  } catch (error) {
    showToast("Could not archive client", error.message, "error");
    setSyncStatus("Error", "error");
  }
}

async function createCashEntryFromForm(form, entryType) {
  const data = new FormData(form);
  const categoryOrSource = entryType === "expense" ? data.get("category") : data.get("source");
  const amount = nonNegativeMoney(data.get("amount"), 0);
  const isInternal = isInternalTransfer({
    entry_type: entryType,
    category: entryType === "expense" ? categoryOrSource : null,
    source: entryType === "receiving" ? categoryOrSource : null
  });
  const row = await insertCashLedgerEntry({
    entry_date: data.get("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categoryOrSource : null,
    source: entryType === "receiving" ? categoryOrSource : null,
    person_name: data.get("personName") || null,
    amount,
    notes: data.get("notes") || null,
    payment_method: entryType === "expense" ? data.get("paymentMethod") || "petty_cash" : null,
    payment_source: data.get("paymentSource") || (entryType === "receiving" ? "staff" : null),
    is_internal_transfer: isInternal
  });
  await recordAudit(`create_staff_${entryType}`, "cash_ledger", row.id, {
    category_or_source: categoryOrSource,
    amount,
    payment_method: data.get("paymentMethod") || null,
    payment_source: data.get("paymentSource") || null
  });
}

async function replaceMemberPlanItems(memberId, items) {
  if (!memberPlanItemsReady) return;
  const existingIds = memberPlanItems
    .filter((item) => item.member_id === memberId || item.memberId === memberId)
    .map((item) => item.id)
    .filter(Boolean);
  try {
    if (items.length) {
      await supabaseRequest("/rest/v1/member_plan_items", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: items.map((item, index) => serializePlanLineForDb(item, memberId, index))
      });
    }
    if (existingIds.length) {
      await deleteRows("member_plan_items", `id=in.(${existingIds.map(encodeURIComponent).join(",")})`);
    }
  } catch (error) {
    memberPlanItemsReady = false;
    throw new Error(`Could not save member plan bundle lines: ${error.message}`);
  }
}

async function saveCashRow(id) {
  const row = els.cashSheet.querySelector(`tr[data-cash-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const existing = cashEntries.find((entry) => entry.id === id);
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();
  const entryType = value("entryType");
  const categorySource = value("categorySource");
  const changes = {
    entry_date: value("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categorySource : null,
    source: entryType === "receiving" ? categorySource : null,
    person_name: value("personName") || null,
    amount: nonNegativeMoney(value("amount"), 0),
    notes: value("notes") || null,
    payment_method: entryType === "expense" ? value("paymentMethod") || "petty_cash" : null
  };
  const nextRow = { ...existing, ...changes };
  if (!existing?.linked_owner_ledger_id && isInternalTransfer(nextRow)) {
    throw new Error("Internal transfers must be created from the Business Ledger so both sides stay linked.");
  }
  if (existing?.linked_owner_ledger_id && !isInternalTransfer(nextRow)) {
    throw new Error("Linked transfer rows cannot be changed into normal cash rows. Add a correcting entry instead.");
  }
  await patchRow("cash_ledger", id, changes);
  if (existing?.linked_owner_ledger_id && isInternalTransfer(nextRow)) {
    await syncOwnerFromCashRow(existing.linked_owner_ledger_id, nextRow);
  }
  await recordAudit("update_staff_cash_row", "cash_ledger", id, { before: existing, after: changes });
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
        const arrearsText = member.previousUnpaidCount
          ? ` | Older unpaid: ${member.previousUnpaidCount}${canSeeRevenue() ? ` / ${fmt.format(member.previousUnpaidAmount)}` : ""}`
          : "";
        return `
    <article class="queue-item">
      <header>
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.plan)} | Valid till ${formatDate(member.validTill)}${arrearsText}</span>
        </div>
        <div class="queue-amount">
          <strong>${moneyOrRestricted(Number(member.monthlyFee))}</strong>
          <span>${dueLabel}</span>
        </div>
      </header>
      <div class="queue-actions">
        <button class="tiny-button secondary" data-action="paid" data-id="${member.id}" type="button">Mark paid</button>
        <button class="tiny-button" data-action="receipt" data-id="${member.id}" type="button">Preview receipt</button>
        ${canSeeRevenue() ? `<button class="tiny-button" data-action="edit-invoice" data-id="${member.id}" type="button">Edited invoice</button>` : ""}
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
    ["Collected", `${collected.length} paid record${collected.length === 1 ? "" : "s"}`, collected.reduce((sum, member) => sum + Number(member.paidAmount || member.monthlyFee), 0)],
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
  if (entry.entry_type === "receiving") return amount;
  return isCashAffectingExpense(entry) ? -amount : 0;
}

function ownerAmount(entry) {
  const amount = Number(entry.amount || 0);
  return entry.entry_type === "expense" ? -amount : amount;
}

function isInternalTransfer(entry) {
  if (entry.is_internal_transfer === true) return true;
  const label = `${entry.category || ""} ${entry.source || ""}`.toLowerCase();
  return label.includes("transfer to staff")
    || label.includes("petty cash top-up")
    || label.includes("owner transfer")
    || label.includes("received from owner")
    || label.includes("returned to owner")
    || label.includes("received from staff");
}

function isCashAffectingExpense(entry) {
  if (entry.entry_type !== "expense") return false;
  const method = entry.payment_method || "petty_cash";
  return !["business_card", "card", "business_bank_transfer", "bank_transfer"].includes(method);
}

function isQuickRevenueEntry(entry) {
  const source = String(entry.source || "");
  return ["Day Pass", "Weekly Pass", "Conference Room"].includes(source);
}

function entryInRange(entry, range, dateField = "entry_date") {
  if (!range) return true;
  const value = String(entry[dateField] || "").slice(0, 10);
  return value >= range.start && value < range.end;
}

function paymentSourceTotals(range = null) {
  const totals = Object.fromEntries(paymentSources.map((source) => [source.key, 0]));
  payments.filter((payment) => entryInRange(payment, range, "paid_at")).forEach((payment) => {
    const source = payment.payment_source || "spaces_account";
    totals[source] = (totals[source] || 0) + Number(payment.amount || 0);
  });
  if (salesReceiptsReady) {
    salesReceipts.filter((receipt) => entryInRange(receipt, range, "receipt_date")).forEach((receipt) => {
      const source = receipt.payment_source || "staff";
      totals[source] = (totals[source] || 0) + Number(receipt.total_amount || 0);
    });
  } else {
    [...cashEntries, ...ownerEntries].filter((entry) => entryInRange(entry, range)).forEach((entry) => {
      if (entry.entry_type !== "receiving" || isInternalTransfer(entry) || !isQuickRevenueEntry(entry)) return;
      const source = entry.payment_source || (entry.created_by ? "staff" : "spaces_account");
      totals[source] = (totals[source] || 0) + Number(entry.amount || 0);
    });
  }
  return totals;
}

function financialSummary(range = null) {
  const sourceTotals = paymentSourceTotals(range);
  const totalRevenue = Object.values(sourceTotals).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const scopedOwnerEntries = ownerEntries.filter((entry) => entryInRange(entry, range));
  const scopedCashEntries = cashEntries.filter((entry) => entryInRange(entry, range));
  const ownerExpenses = scopedOwnerEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const staffExpenses = scopedCashEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const staffCardExpenses = scopedCashEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry) && !isCashAffectingExpense(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const ownerCollectedRevenue = Number(sourceTotals.spaces_account || 0) + Number(sourceTotals.abrar_owner || 0);
  const ownerNonRevenueReceiving = scopedOwnerEntries
    .filter((entry) => entry.entry_type === "receiving")
    .filter((entry) => !isQuickRevenueEntry(entry) && String(entry.source || "").toLowerCase() !== "membership receipt")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const ownerOutgoing = scopedOwnerEntries
    .filter((entry) => entry.entry_type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const ownerBalance = ownerCollectedRevenue + ownerNonRevenueReceiving - ownerOutgoing - staffCardExpenses;
  const staffBalance = scopedCashEntries.reduce((sum, entry) => sum + cashAmount(entry), 0);
  const outstanding = members
    .filter((member) => !member.paid)
    .reduce((sum, member) => sum + Number(member.monthlyFee || 0), 0)
    + members.reduce((sum, member) => sum + Number(member.previousUnpaidAmount || 0), 0);
  const companyExpenses = ownerExpenses + staffExpenses;
  return {
    sourceTotals,
    totalRevenue,
    ownerExpenses,
    staffExpenses,
    staffCardExpenses,
    companyExpenses,
    ownerBalance,
    staffBalance,
    outstanding,
    netProfit: totalRevenue - companyExpenses
  };
}

function monthKey(date = new Date()) {
  return isoDate(date).slice(0, 7);
}

function cashMonthRange(selectedMonth = monthKey()) {
  const [year, month] = String(selectedMonth || monthKey()).split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    start: isoDate(start),
    end: isoDate(end)
  };
}

function isCashEntryInMonth(entry, range) {
  return entry.entry_date >= range.start && entry.entry_date < range.end;
}

function cashMonthlySummary(selectedMonth = els.cashMonth?.value || monthKey()) {
  const range = cashMonthRange(selectedMonth);
  const opening = cashEntries
    .filter((entry) => entry.entry_date < range.start)
    .reduce((sum, entry) => sum + cashAmount(entry), 0);
  const monthEntries = cashEntries.filter((entry) => isCashEntryInMonth(entry, range));
  const received = monthEntries
    .filter((entry) => entry.entry_type === "receiving")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const customerReceived = monthEntries
    .filter((entry) => entry.entry_type === "receiving" && !isInternalTransfer(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const internalTopups = monthEntries
    .filter((entry) => entry.entry_type === "receiving" && isInternalTransfer(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expenses = monthEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cashExpenses = monthEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry) && isCashAffectingExpense(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cardExpenses = monthEntries
    .filter((entry) => entry.entry_type === "expense" && !isInternalTransfer(entry) && !isCashAffectingExpense(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const internalMovements = monthEntries
    .filter(isInternalTransfer)
    .reduce((sum, entry) => sum + Math.abs(cashAmount(entry)), 0);
  const movementTotal = monthEntries.reduce((sum, entry) => sum + cashAmount(entry), 0);
  return {
    ...range,
    opening,
    received,
    customerReceived,
    internalTopups,
    expenses,
    cashExpenses,
    cardExpenses,
    internalMovements,
    closing: opening + movementTotal,
    entries: monthEntries
  };
}

function canEditCashEntry(entry) {
  if (canSeeRevenue()) return true;
  if (entry.created_by && entry.created_by !== session?.user?.id) return false;
  const createdAt = new Date(entry.created_at || entry.entry_date);
  return Date.now() - createdAt.getTime() <= 3 * 86400000;
}

function cashEntryOptions(type, selected) {
  const options = type === "expense"
    ? [...expenseCategories, "Returned to Owner"]
    : ["Petty Cash Top-Up - Abrar", "Owner transfer - Abrar", ...plans.map((plan) => plan.name), "Day Pass", "Weekly Pass", "Conference Room", "Miscellaneous"];
  return options.map((option) => `
    <option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>
  `).join("");
}

function renderCashAccounting() {
  if (!cashLedgerReady) {
    els.cashBalance.textContent = "Setup needed";
    els.cashOpeningBalance.textContent = "Setup needed";
    els.cashReceivedMonth.textContent = "Setup needed";
    if (els.cashInternalMonth) els.cashInternalMonth.textContent = "Setup needed";
    els.cashExpensesMonth.textContent = "Setup needed";
    if (els.cashCashExpensesMonth) els.cashCashExpensesMonth.textContent = "Setup needed";
    if (els.cashCardExpensesMonth) els.cashCardExpensesMonth.textContent = "Setup needed";
    els.cashMessage.textContent = "Run the cash ledger SQL in Supabase to enable this section.";
    els.cashSheet.innerHTML = `<tr><td colspan="8">Staff spending table is not enabled yet.</td></tr>`;
    return;
  }
  const query = els.cashSearch.value.trim().toLowerCase();
  const summary = cashMonthlySummary();
  els.cashOpeningBalance.textContent = fmt.format(summary.opening);
  els.cashReceivedMonth.textContent = fmt.format(summary.customerReceived);
  if (els.cashInternalMonth) els.cashInternalMonth.textContent = fmt.format(summary.internalTopups);
  els.cashExpensesMonth.textContent = fmt.format(summary.expenses);
  if (els.cashCashExpensesMonth) els.cashCashExpensesMonth.textContent = fmt.format(summary.cashExpenses);
  if (els.cashCardExpensesMonth) els.cashCardExpensesMonth.textContent = fmt.format(summary.cardExpenses);
  els.cashBalance.textContent = fmt.format(summary.closing);

  const filtered = summary.entries.filter((entry) => {
    const haystack = [
      entry.entry_type,
      entry.category,
      entry.source,
      expensePaymentMethodLabel(entry.payment_method),
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
        <td><select data-field="paymentMethod" ${editable && entry.entry_type === "expense" ? "" : "disabled"}>${expensePaymentMethodOptions(entry.payment_method || "petty_cash")}</select></td>
        <td><input data-field="personName" value="${escapeAttr(entry.person_name)}" ${editable ? "" : "disabled"}></td>
        <td><input data-field="amount" type="number" min="0" step="100" value="${Number(entry.amount || 0)}" ${editable ? "" : "disabled"}></td>
        <td><textarea data-field="notes" rows="1" ${editable ? "" : "disabled"}>${escapeHtml(entry.notes)}</textarea></td>
        <td>${editable ? `<button class="tiny-button" data-action="save-cash-row" data-id="${entry.id}" type="button">Save</button>` : `<span class="locked-note">Locked</span>`}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">No cash entries found. Run the cash ledger SQL if this section has not been enabled yet.</td></tr>`;

  els.cashMessage.textContent = filtered.length
    ? `${filtered.length} row${filtered.length === 1 ? "" : "s"} for ${summary.key} | Cash expenses ${fmt.format(summary.cashExpenses)} | Card expenses ${fmt.format(summary.cardExpenses)} | Staff can edit own rows for 3 days`
    : `No cash entries for ${summary.key}`;
}

function ownerEntryOptions(type, selected) {
  const options = type === "expense"
    ? ownerExpenseCategories
    : ["Received From Staff", "Spaces Account Deposit", "Owner Balance Adjustment", "Miscellaneous Receiving"];
  return options.map((option) => `
    <option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>
  `).join("");
}

function renderOwnerLedger() {
  if (!canSeeRevenue() || !els.ownerSheet) return;
  const range = cashMonthRange(els.ownerMonth?.value || monthKey());
  const summary = financialSummary(range);
  const currentSummary = financialSummary();
  els.financeRevenue.textContent = fmt.format(summary.totalRevenue);
  els.financeOwnerExpenses.textContent = fmt.format(summary.ownerExpenses);
  els.financeStaffExpenses.textContent = fmt.format(summary.staffExpenses);
  els.financeCompanyExpenses.textContent = fmt.format(summary.companyExpenses);
  els.financeNetProfit.textContent = fmt.format(summary.netProfit);
  els.financeOwnerBalance.textContent = fmt.format(currentSummary.ownerBalance);
  els.financeStaffBalance.textContent = fmt.format(currentSummary.staffBalance);
  els.financeOutstanding.textContent = fmt.format(currentSummary.outstanding);
  els.financeSourceBreakdown.innerHTML = paymentSources.map((source) => `
    <div class="source-pill">
      <span>${source.label}</span>
      <strong>${fmt.format(summary.sourceTotals[source.key] || 0)}</strong>
    </div>
  `).join("");

  if (!ownerLedgerReady) {
    els.ownerMessage.textContent = "Run the owner ledger SQL in Supabase to enable this section.";
    els.ownerSheet.innerHTML = `<tr><td colspan="8">Business ledger table is not enabled yet.</td></tr>`;
    return;
  }

  const query = els.ownerSearch.value.trim().toLowerCase();
  const filtered = ownerEntries
    .filter((entry) => isCashEntryInMonth(entry, range))
    .filter((entry) => {
      const haystack = [
        entry.entry_type,
        entry.category,
        entry.source,
        entry.payment_source,
        entry.notes,
        entry.attachment_note
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });

  els.ownerSheet.innerHTML = filtered.length ? filtered.map((entry) => {
    const categoryValue = entry.entry_type === "expense" ? entry.category : entry.source;
    return `
      <tr data-owner-id="${entry.id}" class="${isInternalTransfer(entry) ? "linked-transfer" : ""}">
        <td><input data-field="entryDate" type="date" value="${escapeAttr(entry.entry_date)}"></td>
        <td>
          <select data-field="entryType">
            <option value="expense" ${entry.entry_type === "expense" ? "selected" : ""}>Expense</option>
            <option value="receiving" ${entry.entry_type === "receiving" ? "selected" : ""}>Receiving</option>
          </select>
        </td>
        <td><select data-field="categorySource">${ownerEntryOptions(entry.entry_type, categoryValue)}</select></td>
        <td><select data-field="paymentSource">${paymentSourceOptions(entry.payment_source || "abrar_owner")}</select></td>
        <td><input data-field="amount" type="number" min="0" step="100" value="${Number(entry.amount || 0)}"></td>
        <td><textarea data-field="notes" rows="1">${escapeHtml(entry.notes)}</textarea></td>
        <td><input data-field="attachment" value="${escapeAttr(entry.attachment_note)}"></td>
        <td><button class="tiny-button" data-action="save-owner-row" data-id="${entry.id}" type="button">Save</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">No owner ledger entries found for ${range.key}.</td></tr>`;

  els.ownerMessage.textContent = filtered.length
    ? `${filtered.length} row${filtered.length === 1 ? "" : "s"} for ${range.key}`
    : `No owner entries for ${range.key}`;
}

function renderAuditLog() {
  if (!els.auditLogSheet) return;
  if (!canSeeRevenue()) {
    els.auditLogSheet.innerHTML = "";
    if (els.auditMessage) els.auditMessage.textContent = "";
    return;
  }
  const rows = auditLogs.slice(0, 30);
  els.auditLogSheet.innerHTML = rows.length ? rows.map((entry) => {
    const details = entry.details || {};
    const { before, after, ...summary } = details;
    return `
      <tr>
        <td data-label="Time">${formatDateTime(new Date(entry.created_at))}</td>
        <td data-label="Action">${escapeHtml(entry.action)}</td>
        <td data-label="Table">${escapeHtml(entry.table_name)}</td>
        <td data-label="Record">${escapeHtml(entry.record_id || "")}</td>
        <td data-label="Summary">${escapeHtml(JSON.stringify(summary))}</td>
        <td data-label="Before">${escapeHtml(before ? JSON.stringify(before) : "")}</td>
        <td data-label="After">${escapeHtml(after ? JSON.stringify(after) : "")}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7">No transaction log entries yet. Run the latest Supabase patch if this stays empty after saving.</td></tr>`;
  if (els.auditMessage) {
    els.auditMessage.textContent = auditLogReady
      ? `${rows.length} recent transaction log row${rows.length === 1 ? "" : "s"}`
      : "Transaction log table is not ready";
  }
}

async function insertCashLedgerEntry(row) {
  try {
    return await insertRow("cash_ledger", row);
  } catch (error) {
    if (!String(error.message || "").includes("payment_method")) throw error;
    if (row.payment_method === "business_card") {
      throw new Error("Run the latest Supabase ledger patch before saving card expenses.");
    }
    const { payment_method: _paymentMethod, ...legacyRow } = row;
    return insertRow("cash_ledger", legacyRow);
  }
}

async function insertOwnerLedgerEntry(row) {
  return insertRow("owner_ledger", row);
}

async function insertPaymentRow(row) {
  try {
    await supabaseRequest("/rest/v1/payments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: row
    });
    return true;
  } catch (error) {
    if (!String(error.message || "").includes("payment_source")) throw error;
    throw new Error("The payments table is missing payment_source. Run the latest Supabase schema patch before recording paid receipts.");
  }
}

async function insertSalesReceipt(row) {
  if (!salesReceiptsReady) {
    throw new Error("Sales receipt table is not ready. Run the latest Supabase owner ledger patch before generating quick receipts.");
  }
  try {
    return await insertRow("sales_receipts", row);
  } catch (error) {
    salesReceiptsReady = false;
    throw new Error(`Could not save quick receipt record: ${error.message}`);
  }
}

async function recordAudit(action, tableName, recordId, details = {}) {
  if (!auditLogReady) return;
  const { before, after, ...rest } = details || {};
  try {
    await insertRow("transaction_audit", {
      action,
      table_name: tableName,
      record_id: recordId || null,
      before_data: before || null,
      after_data: after || null,
      details: rest
    });
  } catch (error) {
    auditLogReady = false;
    console.warn("transaction_audit unavailable", error);
  }
}

async function createOwnerEntryFromForm(form, entryType) {
  const data = new FormData(form);
  const categoryOrSource = entryType === "expense" ? data.get("category") : data.get("source");
  const transferId = crypto.randomUUID();
  const amount = nonNegativeMoney(data.get("amount"), 0);
  const isTransferToStaff = entryType === "expense" && ["Transfer to Staff", "Petty Cash Top-Up"].includes(categoryOrSource);
  const isReceivedFromStaff = entryType === "receiving" && categoryOrSource === "Received From Staff";
  const ownerRow = await insertOwnerLedgerEntry({
    entry_date: data.get("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categoryOrSource : null,
    source: entryType === "receiving" ? categoryOrSource : null,
    payment_source: data.get("paymentSource"),
    amount,
    notes: data.get("notes") || null,
    attachment_note: data.get("attachment") || null,
    is_internal_transfer: isTransferToStaff || isReceivedFromStaff,
    transfer_group_id: (isTransferToStaff || isReceivedFromStaff) ? transferId : null
  });
  await recordAudit(`create_owner_${entryType}`, "owner_ledger", ownerRow.id, {
    category_or_source: categoryOrSource,
    amount,
    payment_source: data.get("paymentSource"),
    internal_transfer: isTransferToStaff || isReceivedFromStaff
  });

  if (isTransferToStaff) {
    const cashRow = await insertCashLedgerEntry({
      entry_date: data.get("entryDate"),
      entry_type: "receiving",
      category: null,
      source: "Petty Cash Top-Up - Abrar",
      person_name: "Abrar",
      amount,
      notes: data.get("notes") || null,
      payment_source: "staff",
      is_internal_transfer: true,
      transfer_group_id: transferId,
      linked_owner_ledger_id: ownerRow.id
    });
    await patchRow("owner_ledger", ownerRow.id, { linked_cash_ledger_id: cashRow.id });
    await recordAudit("link_owner_to_staff_transfer", "cash_ledger", cashRow.id, {
      owner_ledger_id: ownerRow.id,
      amount
    });
  }

  if (isReceivedFromStaff) {
    const cashRow = await insertCashLedgerEntry({
      entry_date: data.get("entryDate"),
      entry_type: "expense",
      category: "Returned to Owner",
      source: null,
      person_name: "Abrar",
      amount,
      notes: data.get("notes") || null,
      payment_source: "staff",
      is_internal_transfer: true,
      transfer_group_id: transferId,
      linked_owner_ledger_id: ownerRow.id
    });
    await patchRow("owner_ledger", ownerRow.id, { linked_cash_ledger_id: cashRow.id });
    await recordAudit("link_staff_to_owner_transfer", "cash_ledger", cashRow.id, {
      owner_ledger_id: ownerRow.id,
      amount
    });
  }
}

async function saveOwnerRow(id) {
  const row = els.ownerSheet.querySelector(`tr[data-owner-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const existing = ownerEntries.find((entry) => entry.id === id);
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();
  const entryType = value("entryType");
  const categorySource = value("categorySource");
  const changes = {
    entry_date: value("entryDate"),
    entry_type: entryType,
    category: entryType === "expense" ? categorySource : null,
    source: entryType === "receiving" ? categorySource : null,
    payment_source: value("paymentSource"),
    amount: nonNegativeMoney(value("amount"), 0),
    notes: value("notes") || null,
    attachment_note: value("attachment") || null,
    is_internal_transfer: isInternalTransfer({ entry_type: entryType, category: entryType === "expense" ? categorySource : null, source: entryType === "receiving" ? categorySource : null })
  };
  const nextRow = { ...existing, ...changes };
  if (existing?.linked_cash_ledger_id && !isInternalTransfer(nextRow)) {
    throw new Error("Linked transfer rows cannot be changed into normal owner rows. Add a correcting entry instead.");
  }
  await patchRow("owner_ledger", id, changes);
  if (existing?.linked_cash_ledger_id && isInternalTransfer(nextRow)) {
    await syncCashFromOwnerRow(existing.linked_cash_ledger_id, nextRow);
  } else if (!existing?.linked_cash_ledger_id && isInternalTransfer(nextRow)) {
    await createLinkedCashForOwnerRow(id, nextRow);
  }
  await recordAudit("update_owner_ledger_row", "owner_ledger", id, { before: existing, after: changes });
}

async function createLinkedCashForOwnerRow(ownerId, ownerRow) {
  if (ownerRow.entry_type === "expense" && ["Transfer to Staff", "Petty Cash Top-Up"].includes(ownerRow.category)) {
    const cashRow = await insertCashLedgerEntry({
      entry_date: ownerRow.entry_date,
      entry_type: "receiving",
      category: null,
      source: "Petty Cash Top-Up - Abrar",
      person_name: "Abrar",
      amount: Number(ownerRow.amount || 0),
      notes: ownerRow.notes || null,
      payment_source: "staff",
      is_internal_transfer: true,
      transfer_group_id: ownerRow.transfer_group_id || crypto.randomUUID(),
      linked_owner_ledger_id: ownerId
    });
    await patchRow("owner_ledger", ownerId, { linked_cash_ledger_id: cashRow.id, transfer_group_id: cashRow.transfer_group_id });
    await recordAudit("create_linked_staff_receiving", "cash_ledger", cashRow.id, { owner_ledger_id: ownerId });
    return;
  }
  if (ownerRow.entry_type === "receiving" && ownerRow.source === "Received From Staff") {
    const cashRow = await insertCashLedgerEntry({
      entry_date: ownerRow.entry_date,
      entry_type: "expense",
      category: "Returned to Owner",
      source: null,
      person_name: "Abrar",
      amount: Number(ownerRow.amount || 0),
      notes: ownerRow.notes || null,
      payment_source: "staff",
      is_internal_transfer: true,
      transfer_group_id: ownerRow.transfer_group_id || crypto.randomUUID(),
      linked_owner_ledger_id: ownerId
    });
    await patchRow("owner_ledger", ownerId, { linked_cash_ledger_id: cashRow.id, transfer_group_id: cashRow.transfer_group_id });
    await recordAudit("create_linked_staff_return", "cash_ledger", cashRow.id, { owner_ledger_id: ownerId });
  }
}

async function syncCashFromOwnerRow(cashId, ownerRow) {
  if (ownerRow.entry_type === "expense" && ["Transfer to Staff", "Petty Cash Top-Up"].includes(ownerRow.category)) {
    await patchRow("cash_ledger", cashId, {
      entry_date: ownerRow.entry_date,
      entry_type: "receiving",
      category: null,
      source: "Petty Cash Top-Up - Abrar",
      person_name: "Abrar",
      amount: Number(ownerRow.amount || 0),
      notes: ownerRow.notes || null,
      payment_source: "staff",
      is_internal_transfer: true
    });
    return;
  }
  if (ownerRow.entry_type === "receiving" && ownerRow.source === "Received From Staff") {
    await patchRow("cash_ledger", cashId, {
      entry_date: ownerRow.entry_date,
      entry_type: "expense",
      category: "Returned to Owner",
      source: null,
      person_name: "Abrar",
      amount: Number(ownerRow.amount || 0),
      notes: ownerRow.notes || null,
      payment_source: "staff",
      is_internal_transfer: true
    });
  }
}

async function syncOwnerFromCashRow(ownerId, cashRow) {
  if (cashRow.entry_type === "receiving" && ["Received From Owner", "Petty Cash Top-Up - Abrar", "Owner transfer - Abrar"].includes(cashRow.source)) {
    await patchRow("owner_ledger", ownerId, {
      entry_date: cashRow.entry_date,
      entry_type: "expense",
      category: "Petty Cash Top-Up",
      source: null,
      amount: Number(cashRow.amount || 0),
      notes: cashRow.notes || null,
      is_internal_transfer: true
    });
    return;
  }
  if (cashRow.entry_type === "expense" && cashRow.category === "Returned to Owner") {
    await patchRow("owner_ledger", ownerId, {
      entry_date: cashRow.entry_date,
      entry_type: "receiving",
      category: null,
      source: "Received From Staff",
      amount: Number(cashRow.amount || 0),
      notes: cashRow.notes || null,
      is_internal_transfer: true
    });
  }
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
  if (els.expensePaymentMethod) {
    els.expensePaymentMethod.innerHTML = expensePaymentMethodOptions("petty_cash");
  }

  if (els.ownerExpenseCategory) {
    els.ownerExpenseCategory.innerHTML = ownerExpenseCategories.map((category) => `
      <option value="${escapeAttr(category)}">${escapeHtml(category)}</option>
    `).join("");
    els.ownerExpenseSource.innerHTML = paymentSourceOptions("abrar_owner");
    els.ownerReceivingPaymentSource.innerHTML = paymentSourceOptions("abrar_owner");
    els.ownerReceivingSource.innerHTML = ownerEntryOptions("receiving", "Received From Staff");
  }

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
  els.receivingPaymentSource.innerHTML = paymentSourceOptions("staff");
}

function planOptionHtml(selectedPlanName) {
  return plans.map((plan) => `
    <option value="${escapeAttr(plan.name)}" data-id="${plan.id}" data-category="${plan.category}" data-seats="${plan.seats}" data-price="${plan.price}" ${plan.name === selectedPlanName ? "selected" : ""}>${escapeHtml(plan.name)}</option>
  `).join("");
}

function selectedPlanLineFromMainForm() {
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  return {
    planId: selected?.dataset.id || null,
    planName: selected?.value || "",
    category: plans.find((plan) => plan.id === selected?.dataset.id)?.category || inferPlanCategory(selected?.value),
    seats: positiveIntOr(els.memberForm.elements.seats.value || selected?.dataset.seats, 1),
    standardRate: nonNegativeMoney(els.memberForm.elements.basePlanPrice.value || selected?.dataset.price, 0),
    offeredRate: nonNegativeMoney(els.memberForm.elements.monthlyFee.value || selected?.dataset.price, 0),
    sortOrder: 0
  };
}

function syncMainFormFromPlanLines() {
  if (!memberFormPlanLines.length) return;
  const primary = memberFormPlanLines[0];
  const totalSeats = memberFormPlanLines.reduce((sum, line) => sum + positiveIntOr(line.seats, 1), 0);
  const totalStandard = memberFormPlanLines.reduce((sum, line) => sum + nonNegativeMoney(line.standardRate, 0), 0);
  const totalOffered = memberFormPlanLines.reduce((sum, line) => sum + nonNegativeMoney(line.offeredRate, 0), 0);
  els.planSelect.value = primary.planName;
  els.memberForm.elements.seats.value = totalSeats;
  els.memberForm.elements.basePlanPrice.value = totalStandard;
  els.memberForm.elements.monthlyFee.value = totalOffered;
}

function renderMemberPlanLines() {
  if (!els.memberPlanLines) return;
  els.memberPlanLines.innerHTML = memberFormPlanLines.map((line, index) => `
    <div class="plan-line-row" data-plan-line="${index}">
      <label>Plan
        <select data-field="bundlePlan">${planOptionHtml(line.planName)}</select>
      </label>
      <label>Seats<input data-field="bundleSeats" type="number" min="1" value="${positiveIntOr(line.seats, 1)}"></label>
      <label ${canSeeRevenue() ? "" : "hidden"}>Standard<input data-field="bundleStandard" type="number" min="0" step="500" value="${nonNegativeMoney(line.standardRate, 0)}" ${canSeeRevenue() ? "" : "disabled"}></label>
      <label ${canSeeRevenue() ? "" : "hidden"}>Offered<input data-field="bundleOffered" type="number" min="0" step="500" value="${nonNegativeMoney(line.offeredRate, 0)}" ${canSeeRevenue() ? "" : "disabled"}></label>
      <button class="ghost-button plan-line-remove" data-action="remove-plan-line" data-index="${index}" type="button" aria-label="Remove plan line">x</button>
    </div>
  `).join("");
  syncMainFormFromPlanLines();
  renderRateSummary();
}

function updateMemberFormPlanLine(index, field, value) {
  const line = memberFormPlanLines[index];
  if (!line) return;
  if (field === "bundlePlan") {
    const plan = plans.find((item) => item.name === value);
    line.planId = plan?.id || null;
    line.planName = plan?.name || value;
    line.category = plan?.category || inferPlanCategory(value);
    line.seats = positiveIntOr(plan?.seats || line.seats, 1);
    line.standardRate = nonNegativeMoney(plan?.price || line.standardRate, 0);
    line.offeredRate = nonNegativeMoney(plan?.price || line.offeredRate, 0);
    renderMemberPlanLines();
    return;
  }
  if (field === "bundleSeats") line.seats = positiveIntOr(value, 1);
  if (field === "bundleStandard") line.standardRate = nonNegativeMoney(value, 0);
  if (field === "bundleOffered") line.offeredRate = nonNegativeMoney(value, 0);
  syncMainFormFromPlanLines();
  renderRateSummary();
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
  if (state === "overdue") return "Overdue";
  if (state === "due") return "Due soon";
  return "Unpaid";
}

function billingStandardForMember(member) {
  const planStandard = (member.planItems || []).reduce((sum, item) => sum + nonNegativeMoney(item.standardRate, 0), 0);
  if (planStandard) return planStandard;
  if (isRoomMember(member)) return positiveIntOr(member.seats, 1) * roomSeatRate;
  return nonNegativeMoney(member.basePlanPrice || member.monthlyFee, 0);
}

function shouldShowDiscount(member, override = {}) {
  return override.mode === "edited" || Boolean(override.showDiscount) || Boolean(member.discountReason);
}

function invoicePricing(member, override = {}) {
  const amount = nonNegativeMoney(override.amount ?? member.monthlyFee, 0);
  const tax = nonNegativeMoney(override.tax ?? 0, 0);
  const quantity = positiveIntOr(override.seats ?? member.seats, 1);
  const showDiscount = shouldShowDiscount(member, override);
  const standardPrice = showDiscount
    ? nonNegativeMoney(override.standardPrice ?? billingStandardForMember(member) ?? amount, amount)
    : amount;
  const discount = showDiscount ? Math.max(0, standardPrice - amount) : 0;
  const unitPrice = nonNegativeMoney(override.unitPrice ?? Math.round(standardPrice / quantity), 0);
  return { amount, tax, total: amount + tax, standardPrice, unitPrice, discount };
}

function invoiceLines(member, override = {}) {
  if (override.lines?.length) return override.lines;
  if (override.mode === "quick" || override.mode === "edited" || override.description) {
    const quantity = positiveIntOr(override.seats ?? member.seats, 1);
    const { amount, unitPrice } = invoicePricing(member, override);
    return [{
      description: override.description || member.plan,
      quantity,
      unitPrice,
      amount
    }];
  }
  return (member.planItems || []).map((item) => ({
    description: item.planName,
    quantity: positiveIntOr(item.seats, 1),
    unitPrice: Math.round(nonNegativeMoney(item.offeredRate, 0) / positiveIntOr(item.seats, 1)),
    amount: nonNegativeMoney(item.offeredRate, 0),
    standardAmount: nonNegativeMoney(item.standardRate, 0)
  }));
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

async function recordCollectedAmount({ amount, paymentSource, entryDate, source, personName, notes }) {
  const row = {
    entry_date: entryDate || isoToday(),
    entry_type: "receiving",
    category: null,
    source,
    person_name: personName || null,
    amount: nonNegativeMoney(amount, 0),
    notes: notes || null,
    payment_source: paymentSource,
    is_internal_transfer: false
  };
  if (paymentSource === "raza_manager" || paymentSource === "staff") {
    try {
      await insertCashLedgerEntry(row);
    } catch (error) {
      throw new Error(`Receipt was not added to staff cash balance: ${error.message}`);
    }
    return;
  }
  if (paymentSource === "spaces_account" || paymentSource === "abrar_owner") {
    try {
      await insertOwnerLedgerEntry({
        entry_date: row.entry_date,
        entry_type: "receiving",
        category: null,
        source,
        payment_source: paymentSource,
        amount: row.amount,
        notes: row.notes,
        is_internal_transfer: false
      });
    } catch (error) {
      throw new Error(`Receipt was not added to owner ledger: ${error.message}`);
    }
  }
}

function isMissingRpcError(error, name) {
  const text = [
    error?.code,
    error?.message,
    error?.payload?.message,
    error?.payload?.details
  ].filter(Boolean).join(" ");
  return text.includes("PGRST202")
    || text.includes(`function public.${name}`)
    || text.includes(`/${name}`)
    || text.includes(`rpc/${name}`);
}

function shouldUsePaymentFallback(error, name) {
  const text = [
    error?.code,
    error?.message,
    error?.payload?.message,
    error?.payload?.details,
    error?.payload?.hint
  ].filter(Boolean).join(" ").toLowerCase();
  return isMissingRpcError(error, name)
    || text.includes("undefined_table")
    || text.includes("undefined_column")
    || text.includes("relation \"public.")
    || text.includes("column ")
    || text.includes("schema cache")
    || text.includes("member_plan_items")
    || text.includes("owner_ledger")
    || text.includes("cash_ledger")
    || text.includes("payment_source");
}

async function requireCashCollectedLedger({ amount, paymentSource, entryDate, source, personName, notes }) {
  if (!["raza_manager", "staff"].includes(paymentSource)) return;
  await recordCollectedAmount({ amount, paymentSource, entryDate, source, personName, notes });
}

async function findPaidInvoiceForCycle(member) {
  const rows = await selectRows(
    "invoices",
    `select=id,invoice_number,member_id,status,valid_till&member_id=eq.${encodeURIComponent(member.id)}&status=eq.paid&valid_till=eq.${encodeURIComponent(member.validTill)}&limit=1`
  );
  return rows[0] || null;
}

async function recordMembershipPaymentFallback(member, paymentSource) {
  const localExistingPaid = invoices.find((invoice) =>
    invoice.member_id === member.id
    && invoice.status === "paid"
    && invoice.valid_till === member.validTill
  );
  const existingPaid = localExistingPaid || await findPaidInvoiceForCycle(member);
  if (existingPaid) {
    return { invoice_number: existingPaid.invoice_number, invoice_id: existingPaid.id, reused: true };
  }

  const { amount, tax, total, standardPrice, discount } = invoicePricing(member);
  const invoiceNumber = `SC-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}-${String(member.validTill || isoToday()).replaceAll("-", "")}`;
  const sameNumberRows = await selectRows("invoices", `select=id,invoice_number,status&invoice_number=eq.${encodeURIComponent(invoiceNumber)}&limit=1`);
  if (sameNumberRows[0]?.status === "paid") {
    return { invoice_number: sameNumberRows[0].invoice_number, invoice_id: sameNumberRows[0].id, reused: true };
  }
  if (sameNumberRows[0]) {
    await deleteRows("invoices", `id=eq.${encodeURIComponent(sameNumberRows[0].id)}`);
  }
  const invoice = await insertRow("invoices", {
    invoice_number: invoiceNumber,
    member_id: member.id,
    invoice_type: "membership",
    issue_date: member.membershipFrom || isoToday(),
    valid_till: member.validTill || member.renewalDate,
    standard_amount: standardPrice,
    discount_amount: discount,
    subtotal_amount: amount,
    tax_amount: tax,
    total_amount: total,
    status: "sent",
    edit_note: null
  });
  try {
    const lines = invoiceLines(member);
    await supabaseRequest("/rest/v1/invoice_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: lines.map((line) => ({
        invoice_id: invoice.id,
        description: line.description,
        quantity: positiveIntOr(line.quantity, 1),
        unit_price: nonNegativeMoney(line.unitPrice, 0),
        amount: nonNegativeMoney(line.amount, 0)
      }))
    });
    await insertPaymentRow({
      invoice_id: invoice.id,
      member_id: member.id,
      amount: total,
      payment_method: "cash",
      payment_source: paymentSource,
      reference: invoiceNumber,
      notes: member.plan
    });
    await requireCashCollectedLedger({
      amount: total,
      paymentSource,
      entryDate: member.membershipFrom || isoToday(),
      source: "Membership receipt",
      personName: member.name,
      notes: `${invoiceNumber} | ${member.plan}`
    });
    await patchRow("invoices", invoice.id, { status: "paid" });
    await recordAudit("record_membership_payment_fallback", "payments", invoice.id, {
      invoice_number: invoiceNumber,
      member_id: member.id,
      member_name: member.name,
      amount: total,
      payment_source: paymentSource,
      valid_till: member.validTill
    });
  } catch (error) {
    await deleteRows("invoices", `id=eq.${encodeURIComponent(invoice.id)}`).catch((cleanupError) => {
      console.warn("Could not clean up partial fallback invoice", cleanupError);
    });
    throw error;
  }
  return { invoice_number: invoiceNumber, invoice_id: invoice.id };
}

async function markPaid(id, control = null) {
  const member = members.find((item) => item.id === id);
  if (!member) return;
  const paymentSource = promptPaymentSource(`Payment source for ${member.name}`);
  if (!paymentSource) return;
  return withControlLock(control, async () => {
    setSyncStatus("Saving", "busy");
    let receiptRows;
    try {
      receiptRows = await callRpc("record_membership_payment", {
        p_member_id: member.id,
        p_amount: nonNegativeMoney(member.monthlyFee, 0),
        p_payment_source: paymentSource,
        p_receipt_date: member.membershipFrom,
        p_valid_till: member.validTill,
        p_note: member.plan
      });
    } catch (error) {
      if (!shouldUsePaymentFallback(error, "record_membership_payment")) throw error;
      console.warn("record_membership_payment RPC failed; using REST fallback", error);
      receiptRows = await recordMembershipPaymentFallback(member, paymentSource);
    }
    const receiptRow = Array.isArray(receiptRows) ? receiptRows[0] : receiptRows;
    const invoiceNumber = receiptRow?.invoice_number || `SC-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`;
    await loadData();
    const updatedMember = members.find((item) => item.id === id) || member;
    openInvoice(updatedMember, { mode: "receipt", invoiceId: invoiceNumber });
    setReceiptSendStatus("Payment saved. Tap Share PDF to send the receipt through WhatsApp.", "success");
  }, {
    busyText: "Saving...",
    successTitle: "Receipt marked paid",
    successDetail: `${member.name} receipt was saved.`,
    errorTitle: "Could not mark paid",
    cooldownMs: 2400
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
}

async function createInvoice(member, override = {}) {
  const { amount, tax, total, standardPrice, unitPrice, discount } = invoicePricing(member, override);
  const lines = invoiceLines(member, override);
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
  await supabaseRequest("/rest/v1/invoice_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: lines.map((line) => ({
      invoice_id: invoice.id,
      description: line.description,
      quantity: positiveIntOr(line.quantity, 1),
      unit_price: nonNegativeMoney(line.unitPrice ?? unitPrice, 0),
      amount: nonNegativeMoney(line.amount, 0)
    }))
  });
  return invoice;
}

function openInvoice(member, override = {}) {
  const invoiceId = override.invoiceId || `${override.mode === "edited" ? "INV" : "SC"}-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`;
  const { amount, tax, total, standardPrice, unitPrice, discount } = invoicePricing(member, override);
  const invoiceTitle = override.title || (override.mode === "edited" ? "Spaces Membership Invoice" : "Spaces Membership");
  const invoiceLabel = override.mode === "edited" ? "Invoice No." : "Receipt No.";
  const statusLine = override.mode === "edited" ? "Edited invoice" : "Receipt";
  const issuedDate = receiptDateFor(member, override);
  const issuedDateLabel = override.mode === "quick" ? "Receipt Date" : "Membership From";
  const validText = validityLabel(member, override);
  const description = override.description || member.plan;
  const quantity = positiveIntOr(override.seats ?? member.seats, 1);
  const lines = invoiceLines(member, override);
  const serviceText = lines.length > 1
    ? lines.map((line) => `${line.description}: ${line.quantity} x ${fmt.format(line.unitPrice)} = ${fmt.format(line.amount)}`).join("\n")
    : description;
  const customerLabel = override.mode === "quick" ? "Customer" : "Member";
  const shareTitle = override.mode === "edited" ? "Spaces Coworking Invoice" : "Spaces Coworking Receipt";
  const message = [
    `*${shareTitle}*`,
    `${invoiceLabel} ${invoiceId}`,
    `${customerLabel}: ${member.name}`,
    member.phone ? `Contact: ${member.phone}` : "",
    `Service: ${serviceText}`,
    lines.length === 1 && quantity > 1 ? `Quantity: ${quantity}` : "",
    discount ? `Standard rate: ${fmt.format(standardPrice)}` : "",
    discount ? `Discount: ${fmt.format(discount)}` : "",
    `Total amount: ${fmt.format(total)}`,
    validText,
    override.note ? `Note: ${override.note}` : "",
    "",
    `${business.name}`,
    business.address,
    `${business.phone} | ${business.landline}`,
    "Thank you."
  ].filter(Boolean).join("\n");

  const noteRows = [
    override.note && !discount ? override.note : "",
    discount ? `Discount: ${fmt.format(discount)}${override.note ? ` - ${override.note}` : ""}` : ""
  ].filter(Boolean);

  const standardCell = standardPrice.toLocaleString("en-PK");
  currentReceiptShare = {
    message,
    fileName: `${invoiceId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-spaces-receipt.pdf`,
    memberId: member.id || null,
    receipt: {
      invoiceId,
      invoiceTitle,
      invoiceLabel,
      customerLabel,
      customerName: member.name,
      phone: member.phone,
      issuedDate,
      issuedDateLabel,
      validText,
      validTill: override.validTill || member.validTill || member.renewalDate,
      description,
      quantity,
      lines,
      standardPrice,
      unitPrice,
      discount,
      amount,
      tax,
      total,
      noteRows
    }
  };

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
              <span><strong>${issuedDateLabel}:</strong> ${formatDate(issuedDate)}</span>
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
          ${lines.map((line) => `
            <tr>
              <td>${escapeHtml(line.description)}</td>
              <td>${String(line.quantity).padStart(2, "0")}</td>
              <td>${Number(line.unitPrice).toLocaleString("en-PK")}</td>
              <td>${Number(line.amount).toLocaleString("en-PK")}</td>
            </tr>
          `).join("")}
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
  els.manualWhatsappReceipt.href = `https://wa.me/${whatsappPhone(member.phone)}?text=${encodeURIComponent(message)}`;
  els.manualWhatsappReceipt.hidden = true;
  setReceiptSendStatus("");
  els.whatsappReceipt.textContent = "Share PDF";
  els.receiptDialog.showModal();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  });
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
}

function collectReceiptStyles() {
  return [...document.styleSheets].map((sheet) => {
    try {
      return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    } catch {
      return "";
    }
  }).join("\n");
}

async function inlineReceiptImages(root) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(images.map(async (image) => {
    try {
      const source = image.getAttribute("src");
      if (!source || source.startsWith("data:")) return;
      const response = await fetch(new URL(source, window.location.href));
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      image.setAttribute("src", dataUrl);
    } catch (error) {
      console.warn("Could not inline receipt image", error);
    }
  }));
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not generate receipt image."));
      }
    }, "image/png", 0.96);
  });
}

async function receiptDomSnapshotFile() {
  const element = els.receiptPreview.querySelector(".receipt-box");
  if (!element) throw new Error("Receipt preview is not ready.");

  const clone = element.cloneNode(true);
  await inlineReceiptImages(clone);

  const rect = element.getBoundingClientRect();
  const padding = 32;
  const width = Math.ceil(rect.width || element.offsetWidth || 760);
  const height = Math.ceil(element.scrollHeight || rect.height || 980);
  clone.style.margin = `${padding}px auto`;
  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";

  const serialized = new XMLSerializer().serializeToString(clone);
  const styles = collectReceiptStyles();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width + padding * 2}" height="${height + padding * 2}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" class="receipt-share-capture">
          <style>
            ${styles}
            .receipt-share-capture {
              width: ${width + padding * 2}px;
              min-height: ${height + padding * 2}px;
              overflow: hidden;
              background: #eef2f4;
              padding: 0;
              box-sizing: border-box;
            }
            .receipt-share-capture .receipt-box {
              box-sizing: border-box;
            }
          </style>
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `;

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(window.devicePixelRatio || 2, 3);
    canvas.width = (width + padding * 2) * scale;
    canvas.height = (height + padding * 2) * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#eef2f4";
    ctx.fillRect(0, 0, width + padding * 2, height + padding * 2);
    ctx.drawImage(image, 0, 0);
    const blob = await canvasBlob(canvas);
    return new File([blob], currentReceiptShare.fileName, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function receiptPreviewFile() {
  try {
    return await receiptDomSnapshotFile();
  } catch (error) {
    console.warn("Receipt DOM snapshot failed, using fallback image", error);
    return receiptCanvasFallbackFile();
  }
}

function receiptCanvasFallbackFile() {
  const receipt = currentReceiptShare.receipt;
  if (!receipt) throw new Error("No receipt is open.");

  const canvas = document.createElement("canvas");
  const scale = Math.min(window.devicePixelRatio || 2, 3);
  const width = 900;
  const height = 1200;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#eef2f4";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(20, 24, 26, 0.16)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillRect(54, 34, 792, 1118);
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "#202020";
  ctx.beginPath();
  ctx.roundRect(742, 34, 104, 210, 0);
  ctx.fill();
  ctx.fillStyle = "#1197d5";
  ctx.beginPath();
  ctx.roundRect(54, 1038, 500, 114, 0);
  ctx.fill();

  ctx.save();
  ctx.translate(88, 78);
  ctx.rotate(0.02);
  ctx.fillStyle = "#1197d5";
  ctx.beginPath();
  ctx.roundRect(0, 0, 48, 110, 18);
  ctx.fill();
  ctx.fillStyle = "#232323";
  ctx.beginPath();
  ctx.roundRect(54, 50, 48, 110, 18);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#202020";
  ctx.font = "900 48px Arial, sans-serif";
  ctx.fillText("spaces", 210, 135);
  ctx.fillStyle = "#1197d5";
  ctx.beginPath();
  ctx.arc(405, 122, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1197d5";
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText(receipt.invoiceTitle, 88, 230);

  ctx.fillStyle = "#4d555a";
  ctx.font = "600 17px Arial, sans-serif";
  ctx.fillText(`${receipt.invoiceLabel} ${receipt.invoiceId}`, 610, 100);
  ctx.fillText(business.phone, 610, 132);
  ctx.fillText(business.email, 610, 162);
  drawWrappedText(ctx, business.address, 610, 192, 190, 24);

  ctx.fillStyle = "#222222";
  ctx.font = "800 18px Arial, sans-serif";
  ctx.fillText(`${receipt.customerLabel}: ${receipt.customerName}`, 88, 282);
  ctx.font = "600 16px Arial, sans-serif";
  ctx.fillStyle = "#4d555a";
  ctx.fillText(`Contact: ${receipt.phone || "-"}`, 88, 314);
  ctx.fillText(`${receipt.issuedDateLabel}: ${formatDate(receipt.issuedDate)}`, 88, 346);

  const tableX = 88;
  const tableY = 430;
  const tableW = 724;
  ctx.fillStyle = "#202020";
  ctx.fillRect(tableX, tableY, tableW, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 14px Arial, sans-serif";
  ctx.fillText("DESCRIPTION", tableX + 22, tableY + 34);
  ctx.fillText("QTY.", tableX + 430, tableY + 34);
  ctx.fillText("PRICE", tableX + 522, tableY + 34);
  ctx.fillText("AMOUNT", tableX + 626, tableY + 34);

  const fallbackLines = receipt.lines?.length ? receipt.lines : [{
    description: receipt.description,
    quantity: receipt.quantity,
    unitPrice: receipt.unitPrice,
    amount: receipt.amount
  }];
  const rowHeight = 72;
  const tableBodyHeight = Math.max(110, fallbackLines.length * rowHeight);
  ctx.strokeStyle = "#d7dde1";
  ctx.lineWidth = 1;
  ctx.strokeRect(tableX, tableY + 54, tableW, tableBodyHeight);
  ctx.fillStyle = "#222222";
  ctx.font = "700 16px Arial, sans-serif";
  fallbackLines.forEach((line, index) => {
    const rowY = tableY + 96 + index * rowHeight;
    if (index > 0) {
      ctx.strokeStyle = "#edf1f3";
      ctx.beginPath();
      ctx.moveTo(tableX, tableY + 54 + index * rowHeight);
      ctx.lineTo(tableX + tableW, tableY + 54 + index * rowHeight);
      ctx.stroke();
      ctx.fillStyle = "#222222";
    }
    drawWrappedText(ctx, line.description, tableX + 22, rowY, 350, 22);
    ctx.fillText(String(line.quantity).padStart(2, "0"), tableX + 438, rowY);
    ctx.fillText(Number(line.unitPrice || 0).toLocaleString("en-PK"), tableX + 522, rowY);
    ctx.fillText(Number(line.amount || 0).toLocaleString("en-PK"), tableX + 632, rowY);
  });

  let noteY = tableY + 94 + tableBodyHeight;
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillStyle = "#4d555a";
  receipt.noteRows.forEach((row) => {
    noteY = drawWrappedText(ctx, row, tableX + 22, noteY, 680, 22);
  });

  let totalY = Math.max(760, noteY + 24);
  const labelX = 530;
  const valueX = 748;
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillStyle = "#4d555a";
  if (receipt.discount) {
    ctx.fillText("Standard Rate", labelX, totalY);
    ctx.fillText(receipt.standardPrice.toLocaleString("en-PK"), valueX, totalY);
    totalY += 34;
    ctx.fillText("Discount", labelX, totalY);
    ctx.fillText(`- ${receipt.discount.toLocaleString("en-PK")}`, valueX, totalY);
    totalY += 42;
  }
  ctx.fillStyle = "#232323";
  ctx.fillText("Subtotal", labelX, totalY);
  ctx.fillText(receipt.amount.toLocaleString("en-PK"), valueX, totalY);
  totalY += 38;
  ctx.fillText("Tax", labelX, totalY);
  ctx.fillText(receipt.tax.toLocaleString("en-PK"), valueX, totalY);
  totalY += 24;
  ctx.strokeStyle = "#aab0c9";
  ctx.beginPath();
  ctx.moveTo(labelX, totalY);
  ctx.lineTo(812, totalY);
  ctx.stroke();
  totalY += 40;
  ctx.font = "900 24px Arial, sans-serif";
  ctx.fillText("Total", labelX, totalY);
  ctx.fillText(receipt.total.toLocaleString("en-PK"), valueX, totalY);

  ctx.fillStyle = "#222222";
  ctx.font = "700 17px Arial, sans-serif";
  drawWrappedText(ctx, receipt.validText, 88, 974, 360, 25);
  ctx.strokeStyle = "#333333";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(88, 1010);
  ctx.lineTo(390, 1010);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "900 15px Arial, sans-serif";
  ctx.fillText("Spaces Representative", 88, 1042);

  ctx.textAlign = "right";
  ctx.fillStyle = "#222222";
  ctx.font = "900 30px Arial, sans-serif";
  ctx.fillText("Thank you!", 812, 974);
  ctx.font = "600 16px Arial, sans-serif";
  ctx.fillText(business.shortAddress.replace("<br>", " "), 812, 1010);
  ctx.fillText(business.landline, 812, 1040);
  ctx.fillStyle = "#1197d5";
  ctx.font = "800 17px Arial, sans-serif";
  ctx.fillText(business.website, 812, 1098);
  ctx.textAlign = "left";

  return canvasBlob(canvas).then((blob) => new File([blob], currentReceiptShare.fileName, { type: "image/png" }));
}

function setReceiptSendStatus(message, type = "") {
  els.receiptSendStatus.textContent = message;
  els.receiptSendStatus.className = `receipt-send-status${type ? ` ${type}` : ""}`;
}

async function receiptPdfFile() {
  if (!currentReceiptShare.receipt) throw new Error("No receipt is open.");
  const response = await fetch("/api/receipt-pdf", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session?.access_token || ""}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: currentReceiptShare.fileName,
      receipt: currentReceiptShare.receipt
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not create the receipt PDF.");
  }
  const blob = await response.blob();
  return new File([blob], currentReceiptShare.fileName, { type: "application/pdf" });
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sendCurrentReceipt() {
  if (!currentReceiptShare.receipt) throw new Error("No receipt is open.");
  const originalText = els.whatsappReceipt.textContent;
  els.whatsappReceipt.disabled = true;
  els.whatsappReceipt.textContent = "Preparing...";
  setReceiptSendStatus("Preparing the PDF receipt...", "busy");

  try {
    const file = await receiptPdfFile();
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: "Spaces Coworking receipt",
        text: currentReceiptShare.message,
        files: [file]
      });
      setReceiptSendStatus("PDF ready. Choose WhatsApp in the share sheet and select the customer chat.", "success");
      showToast("PDF ready to share", "Choose WhatsApp and send the attached receipt.");
      return { ok: true, shared: true };
    }

    downloadFile(file);
    els.manualWhatsappReceipt.hidden = false;
    setReceiptSendStatus("PDF downloaded. Use Open WhatsApp for the message, then attach the downloaded PDF if needed.", "success");
    showToast("PDF downloaded", "Attach the downloaded receipt in WhatsApp.");
    return { ok: true, downloaded: true };
  } catch (error) {
    console.warn("Receipt PDF share failed", error);
    els.manualWhatsappReceipt.hidden = false;
    setReceiptSendStatus(`Could not prepare the PDF: ${error.message}`, "error");
    showToast("PDF share failed", error.message, "error");
    throw error;
  } finally {
    els.whatsappReceipt.disabled = false;
    if (els.whatsappReceipt.textContent === "Preparing...") {
      els.whatsappReceipt.textContent = originalText;
    }
  }
}

async function shareReceiptToWhatsapp(event) {
  event.preventDefault();
  sendCurrentReceipt().catch(() => {});
}

async function shareReceiptManually(event) {
  if (!navigator.share || !navigator.canShare) return;
  event.preventDefault();
  try {
    const file = await receiptPdfFile();
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Spaces Coworking receipt",
        text: currentReceiptShare.message,
        files: [file]
      });
      return;
    }
  } catch (error) {
    console.warn("Manual receipt sharing failed", error);
  }
  window.open(els.manualWhatsappReceipt.href, "_blank", "noopener,noreferrer");
}

function openReceipt(member) {
  openInvoice(member, { mode: "receipt" });
}

function openEditedInvoiceForm(member) {
  if (!canSeeRevenue()) {
    showToast("Owner access required", "Discounted invoices can only be created by Abrar.", "error");
    return;
  }
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

function whatsappPhone(phone) {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return "";
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  if (cleaned.startsWith("0")) return `92${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("3")) return `92${cleaned}`;
  return cleaned;
}

function normalizedPhone(phone) {
  return whatsappPhone(phone);
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
  const ownerExport = canSeeRevenue();
  const headers = ownerExport
    ? ["Name", "Company", "Phone", "Email", "Category", "Plan", "Seats", "Joining", "Renewal", "Standard Rate", "Offered Monthly Fee", "Discount", "Discount Reason", "Deposit", "Paid"]
    : ["Name", "Company", "Phone", "Email", "Category", "Plan", "Seats", "Joining", "Renewal", "Paid"];
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
    ...(ownerExport ? [
    billingStandardForMember(member) || member.monthlyFee,
    member.monthlyFee,
    member.discountReason ? Math.max(0, billingStandardForMember(member) - Number(member.monthlyFee)) : 0,
    member.discountReason,
    member.deposit
    ] : []),
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

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCashMonthlyReport() {
  const summary = cashMonthlySummary();
  const rows = [
    ["Spaces Coworking Staff Spending Report"],
    ["Month", summary.key],
    ["Opening balance", summary.opening],
    ["Customer collections", summary.customerReceived],
    ["Internal top-ups", summary.internalTopups],
    ["Total amount received", summary.received],
    ["Total staff expenses", summary.expenses],
    ["Cash expenses", summary.cashExpenses],
    ["Card expenses", summary.cardExpenses],
    ["Petty cash in hand", summary.closing],
    [],
    ["Date", "Type", "Category / Source", "Paid Using", "Person", "Amount", "Cash Impact", "Notes"]
  ];
  summary.entries
    .slice()
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .forEach((entry) => {
      rows.push([
        entry.entry_date,
        entry.entry_type === "expense" ? "Expense" : "Receiving",
        entry.entry_type === "expense" ? entry.category : entry.source,
        entry.entry_type === "expense" ? expensePaymentMethodLabel(entry.payment_method) : "",
        entry.person_name,
        Number(entry.amount || 0),
        cashAmount(entry),
        entry.notes
      ]);
    });
  downloadCsv(`spaces-cash-report-${summary.key}.csv`, rows);
}

function exportOwnerMonthlyReport() {
  const range = cashMonthRange(els.ownerMonth?.value || monthKey());
  const entries = ownerEntries
    .filter((entry) => isCashEntryInMonth(entry, range))
    .slice()
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const summary = financialSummary(range);
  const currentSummary = financialSummary();
  const rows = [
    ["Spaces Coworking Business Financial Report"],
    ["Month", range.key],
    ["Total revenue collected", summary.totalRevenue],
    ["Owner expenses", summary.ownerExpenses],
    ["Staff expenses", summary.staffExpenses],
    ["Combined company expenses", summary.companyExpenses],
    ["Current business / owner balance", currentSummary.ownerBalance],
    ["Current staff petty cash", currentSummary.staffBalance],
    ["Current outstanding invoices", currentSummary.outstanding],
    ["Net profit", summary.netProfit],
    [],
    ["Revenue by source"],
    ...paymentSources.map((source) => [source.label, summary.sourceTotals[source.key] || 0]),
    [],
    ["Date", "Type", "Category / Source", "Payment Source", "Amount", "Signed Amount", "Internal Transfer", "Notes", "Attachment"]
  ];
  entries.forEach((entry) => {
    rows.push([
      entry.entry_date,
      entry.entry_type === "expense" ? "Expense" : "Receiving",
      entry.entry_type === "expense" ? entry.category : entry.source,
      paymentSourceLabel(entry.payment_source),
      Number(entry.amount || 0),
      ownerAmount(entry),
      isInternalTransfer(entry) ? "Yes" : "No",
      entry.notes,
      entry.attachment_note
    ]);
  });
  downloadCsv(`spaces-owner-report-${range.key}.csv`, rows);
}

function exportAuditReport() {
  if (!canSeeRevenue()) return;
  const rows = [
    ["Spaces Coworking Transaction Recovery Log"],
    ["Exported at", new Date().toISOString()],
    [],
    ["Source", "Date / Time", "Type", "Action / Category", "Person / Customer", "Payment Source", "Paid Using", "Amount", "Reference", "Record ID", "Notes / Details"],
    ...payments.map((payment) => [
      "Payment",
      payment.paid_at,
      "Membership payment",
      paymentSourceLabel(payment.payment_source),
      payment.member_id,
      paymentSourceLabel(payment.payment_source),
      payment.payment_method,
      Number(payment.amount || 0),
      payment.reference,
      payment.id,
      payment.payment_method
    ]),
    ...salesReceipts.map((receipt) => [
      "Quick receipt",
      receipt.receipt_date,
      receipt.service_name,
      receipt.receipt_number,
      receipt.customer_name,
      paymentSourceLabel(receipt.payment_source),
      "",
      Number(receipt.total_amount || 0),
      receipt.phone,
      receipt.id,
      receipt.notes
    ]),
    ...cashEntries.map((entry) => [
      "Staff spending ledger",
      entry.entry_date,
      entry.entry_type,
      entry.entry_type === "expense" ? entry.category : entry.source,
      entry.person_name,
      paymentSourceLabel(entry.payment_source),
      entry.entry_type === "expense" ? expensePaymentMethodLabel(entry.payment_method) : "",
      Number(entry.amount || 0),
      isInternalTransfer(entry) ? "Internal transfer" : "",
      entry.id,
      entry.notes
    ]),
    ...ownerEntries.map((entry) => [
      "Business ledger",
      entry.entry_date,
      entry.entry_type,
      entry.entry_type === "expense" ? entry.category : entry.source,
      "",
      paymentSourceLabel(entry.payment_source),
      "",
      Number(entry.amount || 0),
      isInternalTransfer(entry) ? "Internal transfer" : "",
      entry.id,
      [entry.notes, entry.attachment_note].filter(Boolean).join(" | ")
    ]),
    ...auditLogs.map((entry) => [
      "Audit log",
      entry.created_at,
      entry.table_name,
      entry.action,
      "",
      "",
      "",
      "",
      "",
      entry.record_id,
      [
        entry.before_data ? `Before: ${JSON.stringify(entry.before_data)}` : "",
        entry.after_data ? `After: ${JSON.stringify(entry.after_data)}` : "",
        entry.details ? `Details: ${JSON.stringify(entry.details)}` : ""
      ].filter(Boolean).join(" | ")
    ])
  ];
  downloadCsv(`spaces-transaction-recovery-log-${isoToday()}.csv`, rows);
}

function setDefaultDates() {
  const today = new Date();
  const renewal = addMonthsClamped(today, 1);
  els.memberForm.elements.joiningDate.value = isoDate(today);
  els.memberForm.elements.renewalDate.value = isoDate(renewal);
  els.expenseForm.elements.entryDate.value = isoToday();
  els.receivingForm.elements.entryDate.value = isoToday();
  if (els.ownerExpenseForm) els.ownerExpenseForm.elements.entryDate.value = isoToday();
  if (els.ownerReceivingForm) els.ownerReceivingForm.elements.entryDate.value = isoToday();
  if (els.cashMonth && !els.cashMonth.value) els.cashMonth.value = monthKey(today);
  if (els.ownerMonth && !els.ownerMonth.value) els.ownerMonth.value = monthKey(today);
}

function syncPlanFields() {
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  if (!selected) {
    els.rateSummary.innerHTML = `<strong>Plans unavailable:</strong> Run the Supabase schema and refresh.`;
    return;
  }
  memberFormPlanLines = [{
    planId: selected.dataset.id,
    planName: selected.value,
    category: plans.find((plan) => plan.id === selected.dataset.id)?.category || inferPlanCategory(selected.value),
    seats: positiveIntOr(selected.dataset.seats, 1),
    standardRate: nonNegativeMoney(selected.dataset.price, 0),
    offeredRate: nonNegativeMoney(selected.dataset.price, 0),
    sortOrder: 0
  }];
  renderMemberPlanLines();
}

function renderRateSummary() {
  const basePrice = memberFormPlanLines.reduce((sum, line) => sum + nonNegativeMoney(line.standardRate, 0), 0) || nonNegativeMoney(els.memberForm.elements.basePlanPrice.value, 0);
  const offeredPrice = memberFormPlanLines.reduce((sum, line) => sum + nonNegativeMoney(line.offeredRate, 0), 0) || nonNegativeMoney(els.memberForm.elements.monthlyFee.value, 0);
  const discount = Math.max(0, basePrice - offeredPrice);
  els.rateSummary.innerHTML = discount
    ? `<strong>Discounted signup:</strong> ${memberFormPlanLines.length} invoice line${memberFormPlanLines.length === 1 ? "" : "s"}, ${fmt.format(offeredPrice)} offered instead of ${fmt.format(basePrice)}. Monthly discount ${fmt.format(discount)}.`
    : `<strong>Standard signup:</strong> ${memberFormPlanLines.length} invoice line${memberFormPlanLines.length === 1 ? "" : "s"} totaling ${fmt.format(offeredPrice)}.`;
}

function syncQuickInvoiceFields() {
  const service = quickServices[els.quickService.value];
  const quantity = positiveIntOr(els.quickQuantity.value, 1);
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

async function recordQuickReceiptFallback({ receiptNumber, customer, service, quantity, amount, paymentMode, validity, note }) {
  const row = await insertSalesReceipt({
    receipt_number: receiptNumber,
    customer_name: customer.name,
    phone: customer.phone || null,
    service_name: service.label,
    quantity,
    unit_rate: service.rate,
    total_amount: amount,
    payment_source: paymentMode,
    receipt_date: validity.receiptDate,
    valid_till: validity.validTill,
    notes: note || null
  });
  try {
    await requireCashCollectedLedger({
      amount,
      paymentSource: paymentMode,
      entryDate: validity.receiptDate,
      source: service.label,
      personName: customer.name,
      notes: [`${receiptNumber}`, note].filter(Boolean).join(" | ")
    });
    await recordAudit("record_quick_receipt_fallback", "sales_receipts", row.id, {
      receipt_number: receiptNumber,
      customer_name: customer.name,
      service_name: service.label,
      quantity,
      amount,
      payment_source: paymentMode
    });
  } catch (error) {
    await deleteRows("sales_receipts", `id=eq.${encodeURIComponent(row.id)}`).catch((cleanupError) => {
      console.warn("Could not clean up partial quick receipt", cleanupError);
    });
    throw error;
  }
  return row;
}

async function generateQuickInvoice() {
  const data = new FormData(els.quickInvoiceForm);
  const service = quickServices[data.get("service")];
  const quantity = positiveIntOr(data.get("quantity"), 1);
  const amount = service.rate * quantity;
  const note = data.get("notes") || "";
  const validity = quickValidity(service, quantity);
  const paymentMode = data.get("paymentMode");
  const receiptNumber = `SP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const customer = {
    name: data.get("name"),
    phone: data.get("phone")
  };
  try {
    await callRpc("record_quick_receipt", {
      p_receipt_number: receiptNumber,
      p_customer_name: customer.name,
      p_phone: customer.phone,
      p_service_name: service.label,
      p_quantity: quantity,
      p_unit_rate: service.rate,
      p_total_amount: amount,
      p_payment_source: paymentMode,
      p_receipt_date: validity.receiptDate,
      p_valid_till: validity.validTill,
      p_notes: note || null
    });
  } catch (error) {
    if (!shouldUsePaymentFallback(error, "record_quick_receipt")) throw error;
    console.warn("record_quick_receipt RPC failed; using REST fallback", error);
    await recordQuickReceiptFallback({ receiptNumber, customer, service, quantity, amount, paymentMode, validity, note });
  }
  openInvoice({
    id: `quick-${Date.now()}`,
    name: customer.name,
    phone: customer.phone,
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
    invoiceId: receiptNumber,
    description: `${service.label} - ${quantity} ${service.unitName}`,
    seats: quantity,
    standardPrice: amount,
    unitPrice: service.rate,
    amount,
    ...validity,
    note: [`Payment source: ${paymentSourceLabel(paymentMode)}`, note].filter(Boolean).join(" | ")
  });
}

async function createMemberFromForm() {
  const data = new FormData(els.memberForm);
  const incomingPhone = normalizedPhone(data.get("phone"));
  const duplicate = memberRecords.find((member) =>
    member.status !== "cancelled"
    && incomingPhone
    && normalizedPhone(member.phone) === incomingPhone
  );
  if (duplicate) {
    throw new Error(`${duplicate.name} already uses this phone number. Update the existing record instead of adding a duplicate.`);
  }
  const rawLines = memberFormPlanLines.length ? memberFormPlanLines : [selectedPlanLineFromMainForm()];
  const lines = canSeeRevenue()
    ? rawLines
    : rawLines.map((line) => ({ ...line, offeredRate: nonNegativeMoney(line.standardRate, 0) }));
  const primary = lines[0];
  const totalSeats = lines.reduce((sum, line) => sum + positiveIntOr(line.seats, 1), 0);
  const totalStandard = lines.reduce((sum, line) => sum + nonNegativeMoney(line.standardRate, 0), 0);
  const totalOffered = lines.reduce((sum, line) => sum + nonNegativeMoney(line.offeredRate, 0), 0);
  const row = await insertRow("members", {
    full_name: data.get("name"),
    company: data.get("company") || null,
    phone: data.get("phone"),
    email: data.get("email") || null,
    plan_id: primary.planId || null,
    plan_name: primary.planName,
    seats: totalSeats,
    joining_date: data.get("joiningDate"),
    renewal_date: data.get("renewalDate"),
    standard_monthly_rate: totalStandard,
    offered_monthly_rate: totalOffered,
    deposit_amount: canSeeRevenue() ? nonNegativeMoney(data.get("deposit"), 0) : 0,
    discount_reason: canSeeRevenue() ? data.get("discountReason") || null : null,
    notes: data.get("notes") || null
  });
  try {
    await replaceMemberPlanItems(row.id, lines);
  } catch (error) {
    await deleteRows("members", `id=eq.${encodeURIComponent(row.id)}`).catch((cleanupError) => {
      console.warn("Could not clean up partial member", cleanupError);
    });
    throw error;
  }
  await recordAudit("create_member", "members", row.id, {
    name: data.get("name"),
    phone: data.get("phone"),
    plan_lines: lines.map((line) => ({
      plan: line.planName,
      seats: line.seats,
      offered_rate: line.offeredRate
    })),
    monthly_fee: totalOffered
  });
  return row;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "save-member-row") {
    withControlLock(button, () => saveChangedSheetRowsFor(button.dataset.id), {
      busyText: "Saving...",
      successTitle: "Member row saved",
      successDetail: "Client sheet changes were saved.",
      errorTitle: "Could not save member row",
      cooldownMs: 1800
    });
    return;
  }
  if (button.dataset.action === "save-cash-row") {
    withControlLock(button, async () => {
      await saveCashRow(button.dataset.id);
      await loadData();
    }, {
      busyText: "Saving...",
      successTitle: "Cash row saved",
      successDetail: "Staff spending sheet was updated.",
      errorTitle: "Could not save cash row",
      cooldownMs: 1800
    }).catch((error) => {
      setSyncStatus("Error", "error");
    });
    return;
  }
  if (button.dataset.action === "save-owner-row") {
    withControlLock(button, async () => {
      await saveOwnerRow(button.dataset.id);
      await loadData();
    }, {
      busyText: "Saving...",
      successTitle: "Business row saved",
      successDetail: "Business ledger was updated.",
      errorTitle: "Could not save business ledger row",
      cooldownMs: 1800
    }).catch((error) => {
      setSyncStatus("Error", "error");
    });
    return;
  }
  if (button.dataset.action === "remove-plan-line") {
    memberFormPlanLines.splice(Number(button.dataset.index), 1);
    if (!memberFormPlanLines.length) memberFormPlanLines = [selectedPlanLineFromMainForm()];
    renderMemberPlanLines();
    return;
  }
  if (button.dataset.action === "delete-member") {
    withControlLock(button, () => deleteMember(button.dataset.id), {
      busyText: "Deleting...",
      errorTitle: "Could not delete client",
      cooldownMs: 1600
    });
    return;
  }
  const member = members.find((item) => item.id === button.dataset.id);
  if (!member) return;
  if (button.dataset.action === "paid") markPaid(member.id, button);
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
els.addPlanLine.addEventListener("click", () => {
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  memberFormPlanLines.push({
    planId: selected?.dataset.id || null,
    planName: selected?.value || plans[0]?.name || "",
    category: plans.find((plan) => plan.id === selected?.dataset.id)?.category || inferPlanCategory(selected?.value),
    seats: positiveIntOr(selected?.dataset.seats, 1),
    standardRate: nonNegativeMoney(selected?.dataset.price, 0),
    offeredRate: nonNegativeMoney(selected?.dataset.price, 0),
    sortOrder: memberFormPlanLines.length
  });
  renderMemberPlanLines();
});
els.memberPlanLines.addEventListener("input", (event) => {
  const row = event.target.closest("[data-plan-line]");
  if (!row) return;
  updateMemberFormPlanLine(Number(row.dataset.planLine), event.target.dataset.field, event.target.value);
});
els.memberPlanLines.addEventListener("change", (event) => {
  const row = event.target.closest("[data-plan-line]");
  if (!row) return;
  updateMemberFormPlanLine(Number(row.dataset.planLine), event.target.dataset.field, event.target.value);
});
els.memberForm.elements.monthlyFee.addEventListener("input", () => {
  if (memberFormPlanLines.length === 1) {
    memberFormPlanLines[0].offeredRate = nonNegativeMoney(els.memberForm.elements.monthlyFee.value, 0);
  }
  renderRateSummary();
});
els.quickService.addEventListener("change", syncQuickInvoiceFields);
els.quickQuantity.addEventListener("input", syncQuickInvoiceFields);
els.resetQuickInvoice.addEventListener("click", () => {
  window.setTimeout(syncQuickInvoiceFields, 0);
});
els.memberSearch.addEventListener("input", renderMembers);
els.sheetSearch.addEventListener("input", renderSheetEditor);
els.cashSearch.addEventListener("input", renderCashAccounting);
els.cashMonth.addEventListener("change", renderCashAccounting);
els.cashReport.addEventListener("click", exportCashMonthlyReport);
els.ownerSearch.addEventListener("input", renderOwnerLedger);
els.ownerMonth.addEventListener("change", renderOwnerLedger);
els.ownerReport.addEventListener("click", exportOwnerMonthlyReport);
if (els.auditReport) els.auditReport.addEventListener("click", exportAuditReport);
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
    if (canSeeRevenue()) {
      row.querySelector('[data-field="basePlanPrice"]').value = selected.dataset.price;
      row.querySelector('[data-field="monthlyFee"]').value = selected.dataset.price;
    }
  }
  markSheetRowDirty(row);
});
els.cashSheet.addEventListener("change", (event) => {
  markLedgerRowDirty(event.target.closest("tr[data-cash-id]"), els.cashMessage, "Unsaved staff ledger row");
  if (event.target.dataset.field !== "entryType") return;
  const row = event.target.closest("tr[data-cash-id]");
  const categorySelect = row?.querySelector('[data-field="categorySource"]');
  const paymentMethodSelect = row?.querySelector('[data-field="paymentMethod"]');
  if (!categorySelect) return;
  categorySelect.innerHTML = cashEntryOptions(event.target.value, "");
  if (paymentMethodSelect) {
    paymentMethodSelect.disabled = event.target.value !== "expense";
    if (event.target.value === "expense" && !paymentMethodSelect.value) {
      paymentMethodSelect.value = "petty_cash";
    }
  }
});
els.cashSheet.addEventListener("input", (event) => {
  markLedgerRowDirty(event.target.closest("tr[data-cash-id]"), els.cashMessage, "Unsaved staff ledger row");
});
els.ownerSheet.addEventListener("change", (event) => {
  markLedgerRowDirty(event.target.closest("tr[data-owner-id]"), els.ownerMessage, "Unsaved owner ledger row");
  if (event.target.dataset.field !== "entryType") return;
  const row = event.target.closest("tr[data-owner-id]");
  const categorySelect = row?.querySelector('[data-field="categorySource"]');
  if (!categorySelect) return;
  categorySelect.innerHTML = ownerEntryOptions(event.target.value, "");
});
els.ownerSheet.addEventListener("input", (event) => {
  markLedgerRowDirty(event.target.closest("tr[data-owner-id]"), els.ownerMessage, "Unsaved owner ledger row");
});
els.saveAllSheetRows.addEventListener("click", () => {
  withControlLock(els.saveAllSheetRows, saveChangedSheetRows, {
    busyText: "Saving...",
    successTitle: "Client sheet saved",
    successDetail: "All changed rows were updated.",
    errorTitle: "Could not save sheet",
    cooldownMs: 2200
  });
});
els.refreshMembers.addEventListener("click", () => loadData().catch((error) => {
  showToast("Could not refresh members", error.message, "error");
  setSyncStatus("Error", "error");
}));
window.addEventListener("focus", () => maybeRefreshData());
window.addEventListener("hashchange", showActivePage);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) maybeRefreshData();
});
window.setInterval(() => maybeRefreshData(), 60000);
els.exportCsv.addEventListener("click", exportCsv);
els.printReceipt.addEventListener("click", () => window.print());
els.downloadReceipt.addEventListener("click", async () => {
  try {
    const file = await receiptPdfFile();
    downloadFile(file);
    showToast("PDF saved", "Receipt PDF downloaded.");
  } catch (error) {
    showToast("Could not save PDF", error.message, "error");
  }
});
els.closeReceipt.addEventListener("click", () => els.receiptDialog.close());
els.whatsappReceipt.addEventListener("click", shareReceiptToWhatsapp);
els.manualWhatsappReceipt.addEventListener("click", shareReceiptManually);
els.resetMemberForm.addEventListener("click", () => {
  window.setTimeout(() => {
    setDefaultDates();
    syncPlanFields();
  }, 0);
});

els.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.memberForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await createMemberFromForm();
    els.memberForm.reset();
    await loadData();
    setDefaultDates();
    syncPlanFields();
  }, {
    busyText: "Saving...",
    successTitle: "Member added",
    successDetail: "The new member record was saved.",
    errorTitle: "Could not save member",
    cooldownMs: 2500
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.quickInvoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.quickInvoiceForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await generateQuickInvoice();
    els.quickInvoiceForm.reset();
    syncQuickInvoiceFields();
    await loadData();
  }, {
    busyText: "Generating...",
    successTitle: "Receipt generated",
    successDetail: "Temporary receipt is ready to share.",
    errorTitle: "Could not generate receipt",
    cooldownMs: 2500
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.expenseForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await createCashEntryFromForm(els.expenseForm, "expense");
    els.expenseForm.reset();
    setDefaultDates();
    await loadData();
  }, {
    busyText: "Saving...",
    successTitle: "Expense saved",
      successDetail: "Staff spending ledger was updated.",
    errorTitle: "Could not save expense",
    cooldownMs: 2200
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.receivingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.receivingForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await createCashEntryFromForm(els.receivingForm, "receiving");
    els.receivingForm.reset();
    setDefaultDates();
    await loadData();
  }, {
    busyText: "Saving...",
    successTitle: "Receiving saved",
    successDetail: "Staff petty cash was updated.",
    errorTitle: "Could not save receiving",
    cooldownMs: 2200
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.ownerExpenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.ownerExpenseForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await createOwnerEntryFromForm(els.ownerExpenseForm, "expense");
    els.ownerExpenseForm.reset();
    setDefaultDates();
    await loadData();
  }, {
    busyText: "Saving...",
    successTitle: "Owner expense saved",
    successDetail: "Business ledger was updated.",
    errorTitle: "Could not save owner expense",
    cooldownMs: 2200
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.ownerReceivingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = submitButtonFor(els.ownerReceivingForm, event);
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    await createOwnerEntryFromForm(els.ownerReceivingForm, "receiving");
    els.ownerReceivingForm.reset();
    setDefaultDates();
    await loadData();
  }, {
    busyText: "Saving...",
    successTitle: "Owner receiving saved",
    successDetail: "Business ledger was updated.",
    errorTitle: "Could not save owner receiving",
    cooldownMs: 2200
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
});

els.editInvoiceForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const submitButton = submitButtonFor(els.editInvoiceForm, event);
  const data = new FormData(els.editInvoiceForm);
  const member = members.find((item) => item.id === data.get("memberId"));
  if (!member) return;
  const override = {
    mode: "edited",
    invoiceId: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    seats: positiveIntOr(data.get("seats"), 1),
    standardPrice: nonNegativeMoney(data.get("standardPrice"), 0),
    amount: nonNegativeMoney(data.get("invoiceAmount"), 0),
    receiptDate: member.membershipFrom,
    validTill: data.get("validTill"),
    note: data.get("editNote")
  };
  withControlLock(submitButton, async () => {
    setSyncStatus("Saving", "busy");
    const invoice = await createInvoice(member, override);
    await recordAudit("create_edited_invoice", "invoices", invoice.id, {
      member_id: member.id,
      member_name: member.name,
      invoice_number: invoice.invoice_number,
      amount: override.amount,
      valid_till: override.validTill
    });
    await loadData();
    els.editInvoiceDialog.close();
    openInvoice(member, override);
  }, {
    busyText: "Saving...",
    successTitle: "Edited invoice ready",
    successDetail: `${member.name} invoice was created.`,
    errorTitle: "Could not create edited invoice",
    cooldownMs: 2200
  }).catch((error) => {
    setSyncStatus("Error", "error");
  });
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
