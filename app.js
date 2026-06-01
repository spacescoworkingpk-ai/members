const plans = [
  { name: "Flexible Desk", type: "Individual", seats: 1, price: 18000 },
  { name: "Dedicated Desk", type: "Individual", seats: 1, price: 25000 },
  { name: "Dedicated Desk Plus", type: "Individual", seats: 1, price: 32000 },
  { name: "Personal Desk", type: "Individual", seats: 1, price: 38000 },
  { name: "Cubicle", type: "Room", seats: 4, price: 85000 },
  { name: "Room 5", type: "Room", seats: 5, price: 120000 },
  { name: "Room 7", type: "Room", seats: 7, price: 160000 },
  { name: "Room 7 Plus", type: "Room", seats: 7, price: 175000 },
  { name: "Room 11", type: "Room", seats: 11, price: 240000 },
  { name: "Executive / Manager Room", type: "Room", seats: 1, price: 210000 }
];

const business = {
  name: "Spaces Coworking",
  phone: "+92 317 3337756",
  landline: "(021)-33393881",
  email: "spaces.net.pk@gmail.com",
  address: "Mezzanine Floor, C-10 Block 4, Federal B Area, Karachi",
  shortAddress: "Spaces, C-10, mezzanine floor<br>Block 4 fb Area, Karachi",
  website: "spacespk.com"
};

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const seedMembers = [
  {
    id: uid(),
    name: "Ayesha Khan",
    company: "Northstar Studio",
    phone: "923001112233",
    email: "ayesha@northstar.co",
    plan: "Dedicated Desk",
    seats: 1,
    joiningDate: "2026-01-12",
    renewalDate: "2026-06-12",
    basePlanPrice: 25000,
    monthlyFee: 25000,
    deposit: 10000,
    paid: false,
    notes: "Window side desk"
  },
  {
    id: uid(),
    name: "Bilal Ahmed",
    company: "Indus Apps",
    phone: "923214445566",
    email: "bilal@indusapps.pk",
    plan: "Room 7",
    seats: 7,
    joiningDate: "2025-11-01",
    renewalDate: "2026-06-01",
    basePlanPrice: 160000,
    monthlyFee: 160000,
    deposit: 50000,
    paid: true,
    paidAt: "2026-06-01",
    notes: "Room 2"
  },
  {
    id: uid(),
    name: "Maha Raza",
    company: "Solo Consultant",
    phone: "923335551010",
    email: "maha@example.com",
    plan: "Flexible Desk",
    seats: 1,
    joiningDate: "2026-03-20",
    renewalDate: "2026-06-20",
    basePlanPrice: 18000,
    monthlyFee: 18000,
    deposit: 0,
    paid: false,
    notes: "Morning shift"
  },
  {
    id: uid(),
    name: "Omar Farooq",
    company: "Ledger House",
    phone: "923455557788",
    email: "omar@ledgerhouse.pk",
    plan: "Executive / Manager Room",
    seats: 1,
    joiningDate: "2025-09-15",
    renewalDate: "2026-06-15",
    basePlanPrice: 210000,
    monthlyFee: 210000,
    deposit: 100000,
    paid: true,
    paidAt: "2026-06-01",
    notes: "Manager office"
  }
];

const storeKey = "spaces-coworking-preview-members-v2";
const members = loadMembers();

const fmt = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0
});

const els = {
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

function loadMembers() {
  const saved = localStorage.getItem(storeKey);
  if (!saved) return seedMembers;
  try {
    return JSON.parse(saved);
  } catch {
    return seedMembers;
  }
}

function saveMembers() {
  localStorage.setItem(storeKey, JSON.stringify(members));
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
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

function render() {
  renderMetrics();
  renderMembers();
  renderReceipts();
  renderLedger();
  renderPlans();
  renderBars();
}

function renderMetrics() {
  const total = members.reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const collected = members.filter((member) => member.paid).reduce((sum, member) => sum + Number(member.monthlyFee), 0);
  const pending = total - collected;
  const dueSoon = members.filter((member) => !member.paid && daysUntil(member.renewalDate) <= 7).length;
  const seats = members.reduce((sum, member) => sum + Number(member.seats), 0);
  const percentage = total ? Math.round((collected / total) * 100) : 0;

  els.metricRevenue.textContent = fmt.format(total);
  els.metricCollected.textContent = `${percentage}% collected`;
  els.metricMembers.textContent = members.length;
  els.metricSeats.textContent = `${seats} seats occupied`;
  els.metricDue.textContent = dueSoon;
  els.metricPending.textContent = members.filter((member) => !member.paid).length;
  els.metricOutstanding.textContent = `${fmt.format(pending)} outstanding`;
}

function renderMembers() {
  const query = els.memberSearch.value.trim().toLowerCase();
  const filtered = members.filter((member) => {
    const haystack = `${member.name} ${member.company} ${member.phone} ${member.plan}`.toLowerCase();
    return haystack.includes(query);
  });

  els.membersTable.innerHTML = filtered.map((member) => {
    const state = paymentState(member);
    return `
      <tr>
        <td><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.company || "Individual")} | ${escapeHtml(member.phone)}</span></td>
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
  }).join("");
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
  const groups = [
    ["Collected", members.filter((member) => member.paid)],
    ["Outstanding", members.filter((member) => !member.paid)],
    ["Deposits held", members]
  ];

  els.ledger.innerHTML = groups.map(([label, list]) => {
    const amount = label === "Deposits held"
      ? list.reduce((sum, member) => sum + Number(member.deposit || 0), 0)
      : list.reduce((sum, member) => sum + Number(member.monthlyFee), 0);

    return `
      <div class="ledger-row">
        <div>
          <strong>${label}</strong>
          <span>${list.length} record${list.length === 1 ? "" : "s"}</span>
        </div>
        <strong>${fmt.format(amount)}</strong>
      </div>
    `;
  }).join("");
}

function renderPlans() {
  els.planList.innerHTML = plans.map((plan) => `
    <article class="plan-card">
      <header>
        <div>
          <strong>${plan.name}</strong>
          <span>${plan.type} | ${plan.seats} seat${plan.seats === 1 ? "" : "s"}</span>
        </div>
        <strong>${fmt.format(plan.price)}</strong>
      </header>
    </article>
  `).join("");

  els.planSelect.innerHTML = plans.map((plan) => `
    <option value="${plan.name}" data-seats="${plan.seats}" data-price="${plan.price}">${plan.name}</option>
  `).join("");
}

function renderBars() {
  const revenueByPlan = plans.map((plan) => {
    const amount = members
      .filter((member) => member.plan === plan.name)
      .reduce((sum, member) => sum + Number(member.monthlyFee), 0);
    return { name: plan.name, amount };
  }).filter((row) => row.amount > 0);
  const max = Math.max(...revenueByPlan.map((row) => row.amount), 1);

  els.planBars.innerHTML = revenueByPlan.map((row) => `
    <div class="bar-row">
      <div class="bar-label"><span>${row.name}</span><strong>${fmt.format(row.amount)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(8, Math.round((row.amount / max) * 100))}%"></div></div>
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

function markPaid(id) {
  const member = members.find((item) => item.id === id);
  if (!member) return;
  member.paid = true;
  member.paidAt = new Date().toISOString().slice(0, 10);
  saveMembers();
  render();
  openInvoice(member, { mode: "receipt" });
}

function openInvoice(member, override = {}) {
  const invoiceId = override.invoiceId || `SC-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`;
  const standardPrice = Number(override.standardPrice ?? member.basePlanPrice ?? member.monthlyFee);
  const amount = Number(override.amount ?? member.monthlyFee);
  const tax = Number(override.tax ?? 0);
  const total = amount + tax;
  const discount = Math.max(0, standardPrice - amount);
  const invoiceTitle = override.mode === "edited" ? "Spaces Membership Invoice" : "Spaces Membership";
  const invoiceLabel = override.mode === "edited" ? "Invoice No." : "Receipt No.";
  const statusLine = override.mode === "edited" ? "Edited invoice" : "Receipt";
  const validTill = override.validTill || member.renewalDate;
  const issuedDate = member.paidAt || new Date().toISOString().slice(0, 10);
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
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportCsv() {
  const headers = ["Name", "Company", "Phone", "Email", "Plan", "Seats", "Joining", "Renewal", "Standard Rate", "Offered Monthly Fee", "Discount", "Discount Reason", "Deposit", "Paid"];
  const rows = members.map((member) => [
    member.name,
    member.company,
    member.phone,
    member.email,
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
  if (!selected) return;
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

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const member = members.find((item) => item.id === button.dataset.id);
  if (!member) return;
  if (button.dataset.action === "paid") markPaid(member.id);
  if (button.dataset.action === "receipt") openReceipt(member);
  if (button.dataset.action === "edit-invoice") openEditedInvoiceForm(member);
});

els.planSelect.addEventListener("change", syncPlanFields);
els.memberForm.elements.monthlyFee.addEventListener("input", renderRateSummary);
els.memberSearch.addEventListener("input", renderMembers);
els.exportCsv.addEventListener("click", exportCsv);
els.printReceipt.addEventListener("click", () => window.print());
els.closeReceipt.addEventListener("click", () => els.receiptDialog.close());
els.resetMemberForm.addEventListener("click", () => {
  window.setTimeout(() => {
    setDefaultDates();
    syncPlanFields();
  }, 0);
});

els.memberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(els.memberForm);
  members.unshift({
    id: uid(),
    name: data.get("name"),
    company: data.get("company"),
    phone: data.get("phone"),
    email: data.get("email"),
    plan: data.get("plan"),
    seats: Number(data.get("seats")),
    joiningDate: data.get("joiningDate"),
    renewalDate: data.get("renewalDate"),
    basePlanPrice: Number(data.get("basePlanPrice")),
    monthlyFee: Number(data.get("monthlyFee")),
    deposit: Number(data.get("deposit")),
    discountReason: data.get("discountReason"),
    paid: false,
    notes: data.get("notes")
  });
  saveMembers();
  els.memberForm.reset();
  setDefaultDates();
  syncPlanFields();
  render();
});

els.editInvoiceForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const data = new FormData(els.editInvoiceForm);
  const member = members.find((item) => item.id === data.get("memberId"));
  if (!member) return;
  els.editInvoiceDialog.close();
  openInvoice(member, {
    mode: "edited",
    invoiceId: `INV-${new Date().getFullYear()}-${member.id.slice(0, 6).toUpperCase()}`,
    seats: Number(data.get("seats")),
    standardPrice: Number(data.get("standardPrice")),
    amount: Number(data.get("invoiceAmount")),
    validTill: data.get("validTill"),
    note: data.get("editNote")
  });
});

renderPlans();
setDefaultDates();
syncPlanFields();
render();
