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
let memberPlanItems = [];
let invoices = [];
let payments = [];
let cashEntries = [];
let cashLedgerReady = true;
let memberPlanItemsReady = true;
let staffProfile = null;
let session = loadSession();
let lastAutoRefreshAt = 0;
let memberFormPlanLines = [];
let currentReceiptShare = {
  message: "",
  fileName: "spaces-receipt.png",
  receipt: null
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

async function deleteRows(table, query) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
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
      const seats = Math.max(1, Number(seatsRaw || plan?.seats || 1));
      const standardRate = Number(standardRaw || plan?.price || 0);
      const offeredRate = Number(offeredRaw || standardRate);
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
    seats: Number(item.seats || 1),
    standard_monthly_rate: Number(item.standardRate || 0),
    offered_monthly_rate: Number(item.offeredRate || 0),
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
      <td><button class="tiny-button" data-action="save-member-row" data-id="${member.id}" type="button">Save</button></td>
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
  const existingMember = memberRecords.find((member) => member.id === id);
  const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim();
  const editedPlanLines = canSeeRevenue()
    ? parsePlanLines(value("planLines") || "")
    : existingMember?.planItems || [];
  const primaryPlanLine = editedPlanLines[0] || {
    planId: selectedPlan?.id || null,
    planName: selectedPlan?.name || planSelect.selectedOptions[0]?.dataset.name || value("plan"),
    category: selectedPlan?.category || inferPlanCategory(selectedPlan?.name),
    seats: Number(value("seats") || 1),
    standardRate: Number(value("basePlanPrice") || selectedPlan?.price || 0),
    offeredRate: Number(value("monthlyFee") || selectedPlan?.price || 0),
    sortOrder: 0
  };
  const totalSeats = editedPlanLines.reduce((sum, item) => sum + Number(item.seats || 0), 0) || Number(value("seats") || 1);
  const totalStandard = editedPlanLines.reduce((sum, item) => sum + Number(item.standardRate || 0), 0);
  const totalOffered = editedPlanLines.reduce((sum, item) => sum + Number(item.offeredRate || 0), 0);

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
    changes.standard_monthly_rate = totalStandard || Number(value("basePlanPrice") || 0);
    changes.offered_monthly_rate = totalOffered || Number(value("monthlyFee") || 0);
    changes.deposit_amount = Number(value("deposit") || 0);
    changes.discount_reason = value("discountReason") || null;
  } else if (existingMember) {
    changes.standard_monthly_rate = Number(existingMember.basePlanPrice || 0);
    changes.offered_monthly_rate = Number(existingMember.monthlyFee || 0);
    changes.deposit_amount = Number(existingMember.deposit || 0);
    changes.discount_reason = existingMember.discountReason || null;
  }
  await patchRow("members", id, changes);
  if (canSeeRevenue()) {
    await replaceMemberPlanItems(id, editedPlanLines.length ? editedPlanLines : [primaryPlanLine]);
  }
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

async function replaceMemberPlanItems(memberId, items) {
  if (!memberPlanItemsReady) return;
  try {
    await deleteRows("member_plan_items", `member_id=eq.${encodeURIComponent(memberId)}`);
    if (!items.length) return;
    await supabaseRequest("/rest/v1/member_plan_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: items.map((item, index) => serializePlanLineForDb(item, memberId, index))
    });
  } catch (error) {
    memberPlanItemsReady = false;
    console.warn("Could not save member plan bundle lines", error);
  }
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
    seats: Number(els.memberForm.elements.seats.value || selected?.dataset.seats || 1),
    standardRate: Number(els.memberForm.elements.basePlanPrice.value || selected?.dataset.price || 0),
    offeredRate: Number(els.memberForm.elements.monthlyFee.value || selected?.dataset.price || 0),
    sortOrder: 0
  };
}

function syncMainFormFromPlanLines() {
  if (!memberFormPlanLines.length) return;
  const primary = memberFormPlanLines[0];
  const totalSeats = memberFormPlanLines.reduce((sum, line) => sum + Number(line.seats || 0), 0);
  const totalStandard = memberFormPlanLines.reduce((sum, line) => sum + Number(line.standardRate || 0), 0);
  const totalOffered = memberFormPlanLines.reduce((sum, line) => sum + Number(line.offeredRate || 0), 0);
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
      <label>Seats<input data-field="bundleSeats" type="number" min="1" value="${Number(line.seats || 1)}"></label>
      <label>Standard<input data-field="bundleStandard" type="number" min="0" step="500" value="${Number(line.standardRate || 0)}"></label>
      <label>Offered<input data-field="bundleOffered" type="number" min="0" step="500" value="${Number(line.offeredRate || 0)}"></label>
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
    line.seats = Number(plan?.seats || line.seats || 1);
    line.standardRate = Number(plan?.price || line.standardRate || 0);
    line.offeredRate = Number(plan?.price || line.offeredRate || 0);
    renderMemberPlanLines();
    return;
  }
  if (field === "bundleSeats") line.seats = Math.max(1, Number(value || 1));
  if (field === "bundleStandard") line.standardRate = Number(value || 0);
  if (field === "bundleOffered") line.offeredRate = Number(value || 0);
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
  if (state === "due") return "Due soon";
  return "Unpaid";
}

function billingStandardForMember(member) {
  if (isRoomMember(member)) return Number(member.seats || 0) * roomSeatRate;
  return Number(member.basePlanPrice || member.monthlyFee || 0);
}

function shouldShowDiscount(member, override = {}) {
  return override.mode === "edited" || Boolean(override.showDiscount) || Boolean(member.discountReason);
}

function invoicePricing(member, override = {}) {
  const amount = Number(override.amount ?? member.monthlyFee);
  const tax = Number(override.tax ?? 0);
  const quantity = Math.max(1, Number(override.seats ?? member.seats ?? 1));
  const showDiscount = shouldShowDiscount(member, override);
  const standardPrice = showDiscount
    ? Number(override.standardPrice ?? billingStandardForMember(member) ?? amount)
    : amount;
  const discount = showDiscount ? Math.max(0, standardPrice - amount) : 0;
  const unitPrice = Number(override.unitPrice ?? Math.round(standardPrice / quantity));
  return { amount, tax, total: amount + tax, standardPrice, unitPrice, discount };
}

function invoiceLines(member, override = {}) {
  if (override.lines?.length) return override.lines;
  if (override.mode === "quick" || override.mode === "edited" || override.description) {
    const quantity = Math.max(1, Number(override.seats ?? member.seats ?? 1));
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
    quantity: Number(item.seats || 1),
    unitPrice: Math.round(Number(item.offeredRate || 0) / Math.max(1, Number(item.seats || 1))),
    amount: Number(item.offeredRate || 0),
    standardAmount: Number(item.standardRate || 0)
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
      validTill: member.validTill,
      showDiscount: Boolean(member.discountReason)
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
      quantity: Number(line.quantity || 1),
      unit_price: Number(line.unitPrice ?? unitPrice),
      amount: Number(line.amount || 0)
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
  const quantity = Number(override.seats ?? member.seats);
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
    fileName: `${invoiceId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-spaces-receipt.png`,
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
  els.whatsappReceipt.href = `https://wa.me/${whatsappPhone(member.phone)}?text=${encodeURIComponent(message)}`;
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

  ctx.strokeStyle = "#d7dde1";
  ctx.lineWidth = 1;
  ctx.strokeRect(tableX, tableY + 54, tableW, 110);
  ctx.fillStyle = "#222222";
  ctx.font = "700 17px Arial, sans-serif";
  drawWrappedText(ctx, receipt.description, tableX + 22, tableY + 96, 350, 23);
  ctx.fillText(String(receipt.quantity).padStart(2, "0"), tableX + 438, tableY + 96);
  ctx.fillText(receipt.unitPrice.toLocaleString("en-PK"), tableX + 522, tableY + 96);
  ctx.fillText(receipt.amount.toLocaleString("en-PK"), tableX + 632, tableY + 96);

  let noteY = tableY + 190;
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillStyle = "#4d555a";
  receipt.noteRows.forEach((row) => {
    noteY = drawWrappedText(ctx, row, tableX + 22, noteY, 680, 22);
  });

  let totalY = 760;
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

async function shareReceiptToWhatsapp(event) {
  if (!navigator.share || !navigator.canShare) return;
  event.preventDefault();
  try {
    const file = await receiptPreviewFile();
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Spaces Coworking receipt",
        text: currentReceiptShare.message,
        files: [file]
      });
      return;
    }
  } catch (error) {
    console.warn("Receipt image sharing failed", error);
  }
  window.open(els.whatsappReceipt.href, "_blank", "noopener,noreferrer");
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

function whatsappPhone(phone) {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return "";
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  if (cleaned.startsWith("0")) return `92${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("3")) return `92${cleaned}`;
  return cleaned;
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

function setDefaultDates() {
  const today = new Date();
  const renewal = addMonthsClamped(today, 1);
  els.memberForm.elements.joiningDate.value = isoDate(today);
  els.memberForm.elements.renewalDate.value = isoDate(renewal);
  els.expenseForm.elements.entryDate.value = isoToday();
  els.receivingForm.elements.entryDate.value = isoToday();
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
    seats: Number(selected.dataset.seats || 1),
    standardRate: Number(selected.dataset.price || 0),
    offeredRate: Number(selected.dataset.price || 0),
    sortOrder: 0
  }];
  renderMemberPlanLines();
}

function renderRateSummary() {
  const basePrice = memberFormPlanLines.reduce((sum, line) => sum + Number(line.standardRate || 0), 0) || Number(els.memberForm.elements.basePlanPrice.value || 0);
  const offeredPrice = memberFormPlanLines.reduce((sum, line) => sum + Number(line.offeredRate || 0), 0) || Number(els.memberForm.elements.monthlyFee.value || 0);
  const discount = Math.max(0, basePrice - offeredPrice);
  els.rateSummary.innerHTML = discount
    ? `<strong>Discounted signup:</strong> ${memberFormPlanLines.length} invoice line${memberFormPlanLines.length === 1 ? "" : "s"}, ${fmt.format(offeredPrice)} offered instead of ${fmt.format(basePrice)}. Monthly discount ${fmt.format(discount)}.`
    : `<strong>Standard signup:</strong> ${memberFormPlanLines.length} invoice line${memberFormPlanLines.length === 1 ? "" : "s"} totaling ${fmt.format(offeredPrice)}.`;
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

async function generateQuickInvoice() {
  const data = new FormData(els.quickInvoiceForm);
  const service = quickServices[data.get("service")];
  const quantity = Math.max(1, Number(data.get("quantity") || 1));
  const amount = service.rate * quantity;
  const note = data.get("notes") || "";
  const validity = quickValidity(service, quantity);
  const paymentMode = data.get("paymentMode");
  const customer = {
    name: data.get("name"),
    phone: data.get("phone")
  };
  if (paymentMode === "Raza") {
    await insertRow("cash_ledger", {
      entry_date: isoToday(),
      entry_type: "receiving",
      category: null,
      source: service.label,
      person_name: customer.name,
      amount,
      notes: [
        "Payment mode: Raza",
        customer.phone ? `Contact: ${customer.phone}` : "",
        note
      ].filter(Boolean).join(" | ") || null
    });
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
    invoiceId: `SP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    description: `${service.label} - ${quantity} ${service.unitName}`,
    seats: quantity,
    standardPrice: amount,
    unitPrice: service.rate,
    amount,
    ...validity,
    note: [`Payment mode: ${paymentMode}`, note].filter(Boolean).join(" | ")
  });
}

async function createMemberFromForm() {
  const data = new FormData(els.memberForm);
  const lines = memberFormPlanLines.length ? memberFormPlanLines : [selectedPlanLineFromMainForm()];
  const primary = lines[0];
  const totalSeats = lines.reduce((sum, line) => sum + Number(line.seats || 0), 0);
  const totalStandard = lines.reduce((sum, line) => sum + Number(line.standardRate || 0), 0);
  const totalOffered = lines.reduce((sum, line) => sum + Number(line.offeredRate || 0), 0);
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
    deposit_amount: Number(data.get("deposit") || 0),
    discount_reason: data.get("discountReason") || null,
    notes: data.get("notes") || null
  });
  await replaceMemberPlanItems(row.id, lines);
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
  if (button.dataset.action === "remove-plan-line") {
    memberFormPlanLines.splice(Number(button.dataset.index), 1);
    if (!memberFormPlanLines.length) memberFormPlanLines = [selectedPlanLineFromMainForm()];
    renderMemberPlanLines();
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
els.addPlanLine.addEventListener("click", () => {
  const selected = els.planSelect.options[els.planSelect.selectedIndex];
  memberFormPlanLines.push({
    planId: selected?.dataset.id || null,
    planName: selected?.value || plans[0]?.name || "",
    category: plans.find((plan) => plan.id === selected?.dataset.id)?.category || inferPlanCategory(selected?.value),
    seats: Number(selected?.dataset.seats || 1),
    standardRate: Number(selected?.dataset.price || 0),
    offeredRate: Number(selected?.dataset.price || 0),
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
    memberFormPlanLines[0].offeredRate = Number(els.memberForm.elements.monthlyFee.value || 0);
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
els.whatsappReceipt.addEventListener("click", shareReceiptToWhatsapp);
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

els.quickInvoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setSyncStatus("Saving", "busy");
    await generateQuickInvoice();
    els.quickInvoiceForm.reset();
    syncQuickInvoiceFields();
    await loadData();
  } catch (error) {
    alert(`Could not generate quick receipt: ${error.message}`);
    setSyncStatus("Error", "error");
  }
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
