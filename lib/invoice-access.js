import { createHash } from "node:crypto";

export class InvoiceAccessError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

export function privateDocumentHeaders(response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
}

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function database(path, token, options = {}, privileged = false) {
  const url = process.env.SUPABASE_URL || "https://hsnkcrxowajnadwtzdlk.supabase.co";
  const key = privileged ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY || "sb_publishable_swOIHdgfBNI_shshMi7nUw_z8OUy8k-";
  if (!url || !key) throw new InvoiceAccessError("Invoice sharing is not configured yet.");
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      ...options, signal: AbortSignal.timeout(15000),
      headers: { apikey: key, Authorization: `Bearer ${privileged ? key : token}`,
        "Content-Type": "application/json" }
    });
  } catch { throw new InvoiceAccessError("Invoice service is temporarily unavailable. Please retry."); }
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const status = [401, 403].includes(response.status) && !privileged ? response.status : 503;
    throw new InvoiceAccessError(status === 401 || status === 403
      ? "Please sign in with an active staff account."
      : "Invoice service is temporarily unavailable. Check the invoice before retrying.", status);
  }
  return payload;
}

export async function requireInvoiceStaff(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new InvoiceAccessError("Staff login required.", 401);
  const user = await database("/auth/v1/user", token);
  if (!user?.id) throw new InvoiceAccessError("Staff login required.", 401);
  const rows = await database(`/rest/v1/staff_profiles?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`, token);
  if (!rows?.length) throw new InvoiceAccessError("Active staff login required.", 403);
  return token;
}

export function isInvoiceId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function savedInvoiceDocument(invoiceId, token, privileged = false) {
  if (!isInvoiceId(invoiceId)) throw new InvoiceAccessError("Invoice unavailable.", 404);
  const rows = await database(`/rest/v1/invoices?select=id,invoice_number,invoice_type,status,issue_date,membership_from,valid_till,standard_amount,discount_amount,subtotal_amount,tax_amount,total_amount,members(full_name,phone),invoice_items(id,description,quantity,unit_price,amount,created_at)&id=eq.${invoiceId}&limit=1`, token, {}, privileged);
  const invoice = rows?.[0];
  if (!invoice || !["sent", "paid"].includes(invoice.status) || !invoice.members) {
    throw new InvoiceAccessError("Invoice unavailable.", 404);
  }
  const lines = (invoice.invoice_items || []).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
    .map((item) => ({ description: item.description, quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price), amount: Number(item.amount) }));
  if (!lines.length) throw new InvoiceAccessError("This invoice needs its saved line items checked before sharing.", 409);
  const paid = invoice.status === "paid";
  const dateLabel = (date) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}) : "";
  return {
    invoiceId: invoice.invoice_number, invoiceTitle: paid ? "Spaces Membership Receipt" : "Spaces Membership Invoice",
    invoiceLabel: paid ? "Receipt No." : "Invoice No.", customerLabel: "Member",
    customerName: invoice.members.full_name, phone: invoice.members.phone || "",
    issuedDate: invoice.membership_from || invoice.issue_date,
    issuedDateLabel: invoice.membership_from ? "Membership From" : "Issue Date",
    validText: invoice.valid_till ? `Membership valid till ${dateLabel(invoice.valid_till)}` : "",
    validTill: invoice.valid_till, description: lines.map((line) => line.description).join(" + "),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0), lines,
    standardPrice: Number(invoice.invoice_type === "edited" ? invoice.standard_amount : invoice.subtotal_amount), unitPrice: lines[0].unitPrice,
    discount: invoice.invoice_type === "edited" ? Number(invoice.discount_amount) : 0, amount: Number(invoice.subtotal_amount),
    tax: Number(invoice.tax_amount), total: Number(invoice.total_amount),
    noteRows: [], documentStatus: paid ? "PAID" : "UNPAID"
  };
}

export async function resolveInvoiceToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new InvoiceAccessError("Invoice unavailable.", 404);
  }
  const rows = await database(`/rest/v1/invoice_share_links?select=invoice_id,expires_at,revoked_at&token_hash=eq.${tokenHash(token)}&limit=1`, null, {}, true);
  const link = rows?.[0];
  if (!link || link.revoked_at || !Number.isFinite(Date.parse(link.expires_at)) || Date.parse(link.expires_at) <= Date.now()) {
    throw new InvoiceAccessError("Invoice unavailable.", 404);
  }
  return savedInvoiceDocument(link.invoice_id, null, true);
}
