import { receiptPdfBuffer } from "../lib/whatsapp.js";

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

function tokenUserId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8"));
    return payload.sub || "";
  } catch {
    return "";
  }
}

async function requireStaff(token) {
  if (!token) throw new Error("Staff login required.");
  // The user id comes from the JWT payload; the staff_profiles query below is
  // authenticated with that same token, so PostgREST rejects forged or expired
  // tokens and RLS only returns rows the caller is allowed to see.
  const userId = tokenUserId(token);
  if (!userId) throw new Error("Staff login required.");
  const rows = await supabaseFetch(
    `/rest/v1/staff_profiles?select=user_id&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`,
    token
  );
  if (!rows?.length) throw new Error("This login is not an active Spaces staff account.");
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { receipt, fileName = "spaces-receipt.pdf" } = request.body || {};
    if (!receipt?.invoiceId) throw new Error("Receipt data or receipt number is missing.");

    await requireStaff(bearerToken(request));
    const pdf = await receiptPdfBuffer(receipt);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    response.status(200).send(pdf);
  } catch (error) {
    response.status(500).json({ error: error.message || "Could not create receipt PDF." });
  }
}
