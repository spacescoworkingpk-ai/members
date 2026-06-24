import {
  receiptPdfBuffer,
  sendReceiptTemplate,
  uploadWhatsAppMedia,
  whatsappPhone
} from "../lib/whatsapp.js";

const fallbackSupabaseUrl = "https://hsnkcrxowajnadwtzdlk.supabase.co";
const fallbackAnonKey = "sb_publishable_swOIHdgfBNI_shshMi7nUw_z8OUy8k-";

function bearerToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function supabaseFetch(path, token, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL || fallbackSupabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || fallbackAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.msg || text || "Supabase request failed.");
  return payload;
}

async function authenticatedStaff(token) {
  if (!token) throw new Error("Staff login required.");
  const user = await supabaseFetch("/auth/v1/user", token);
  const rows = await supabaseFetch(
    `/rest/v1/staff_profiles?select=*&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true`,
    token
  );
  if (!rows?.length) throw new Error("This login is not an active Spaces staff account.");
  return rows[0];
}

async function findExistingMessage(token, invoiceNumber, recipientPhone) {
  try {
    const rows = await supabaseFetch(
      `/rest/v1/whatsapp_messages?select=*&invoice_number=eq.${encodeURIComponent(invoiceNumber)}&recipient_phone=eq.${encodeURIComponent(recipientPhone)}&status=in.(queued,sent,delivered,read)&order=created_at.desc&limit=1`,
      token
    );
    const existing = rows?.[0] || null;
    if (existing?.status === "queued") {
      const queuedAt = new Date(existing.created_at).getTime();
      if (Number.isFinite(queuedAt) && Date.now() - queuedAt > 10 * 60 * 1000) return null;
    }
    return existing;
  } catch (error) {
    throw new Error(`WhatsApp message log is not ready. Run the Supabase WhatsApp patch first. ${error.message}`);
  }
}

async function createMessageLog(token, row) {
  try {
    const rows = await supabaseFetch("/rest/v1/whatsapp_messages", token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    return rows?.[0] || null;
  } catch (error) {
    throw new Error(`Could not create the WhatsApp send log. ${error.message}`);
  }
}

async function updateMessageLog(token, id, changes) {
  if (!id) return;
  try {
    await supabaseFetch(`/rest/v1/whatsapp_messages?id=eq.${encodeURIComponent(id)}`, token, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(changes)
    });
  } catch {
    // Sending must not fail only because the optional delivery log is unavailable.
  }
}

async function markInvoiceWhatsAppSent(token, invoiceNumber) {
  try {
    await supabaseFetch(`/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(invoiceNumber)}`, token, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ whatsapp_sent_at: new Date().toISOString() })
    });
  } catch {
    // Quick receipts do not have an invoices row, and logging should not block delivery.
  }
}

async function sendToRecipient({
  token,
  recipientType,
  recipientPhone,
  memberId,
  invoiceNumber,
  receipt,
  mediaId,
  fileName,
  whatsapp
}) {
  const existing = await findExistingMessage(token, invoiceNumber, recipientPhone);
  if (existing) return { ok: true, duplicate: true, messageId: existing.meta_message_id, recipientType };

  const log = await createMessageLog(token, {
    invoice_number: invoiceNumber,
    member_id: memberId || null,
    recipient_type: recipientType,
    recipient_phone: recipientPhone,
    status: "queued"
  });
  if (!log?.id) throw new Error("Could not create the WhatsApp send log.");

  try {
    const result = await sendReceiptTemplate({
      to: recipientPhone,
      mediaId,
      fileName,
      receipt,
      ...whatsapp
    });
    const messageId = result.messages?.[0]?.id || null;
    await updateMessageLog(token, log?.id, {
      status: "sent",
      meta_message_id: messageId,
      sent_at: new Date().toISOString(),
      error_message: null
    });
    return { ok: true, messageId, recipientType };
  } catch (error) {
    await updateMessageLog(token, log?.id, {
      status: "failed",
      error_message: error.message
    });
    throw error;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const whatsapp = {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v23.0",
    templateName: process.env.WHATSAPP_RECEIPT_TEMPLATE || "spaces_payment_receipt",
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US"
  };
  if (!whatsapp.token || !whatsapp.phoneNumberId) {
    response.status(503).json({
      code: "WHATSAPP_SETUP_NEEDED",
      error: "Automatic WhatsApp sending is not configured in Vercel yet."
    });
    return;
  }

  try {
    const token = bearerToken(request);
    const staff = await authenticatedStaff(token);
    const { memberId, phone, receipt, fileName = "spaces-receipt.pdf", sendStaffCopy = true } = request.body || {};
    const customerPhone = whatsappPhone(phone || receipt?.phone);
    if (!customerPhone) throw new Error("Member WhatsApp number is missing.");
    if (!receipt?.invoiceId) throw new Error("Receipt data or receipt number is missing.");

    const pdf = await receiptPdfBuffer(receipt);
    const mediaId = await uploadWhatsAppMedia({
      pdf,
      fileName,
      token: whatsapp.token,
      phoneNumberId: whatsapp.phoneNumberId,
      apiVersion: whatsapp.apiVersion
    });

    const customer = await sendToRecipient({
      token,
      recipientType: "customer",
      recipientPhone: customerPhone,
      memberId,
      invoiceNumber: receipt.invoiceId,
      receipt,
      mediaId,
      fileName,
      whatsapp
    });
    await markInvoiceWhatsAppSent(token, receipt.invoiceId);

    let staffCopy = null;
    const copyPhone = whatsappPhone(staff.whatsapp_phone || process.env.WHATSAPP_COPY_NUMBER);
    if (sendStaffCopy && copyPhone && copyPhone !== customerPhone) {
      try {
        staffCopy = await sendToRecipient({
          token,
          recipientType: "staff_copy",
          recipientPhone: copyPhone,
          memberId,
          invoiceNumber: receipt.invoiceId,
          receipt,
          mediaId,
          fileName,
          whatsapp
        });
      } catch (error) {
        staffCopy = { ok: false, error: error.message, recipientType: "staff_copy" };
      }
    }

    response.status(200).json({
      ok: true,
      customer,
      staffCopy,
      staffCopySkipped: !copyPhone || copyPhone === customerPhone
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Receipt sending failed." });
  }
}
