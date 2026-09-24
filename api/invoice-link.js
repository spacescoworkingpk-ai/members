import { randomBytes } from "node:crypto";
import { database, isInvoiceId, privateDocumentHeaders, requireInvoiceStaff, savedInvoiceDocument, tokenHash } from "../lib/invoice-access.js";

export default async function handler(request, response) {
  privateDocumentHeaders(response);
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  try {
    const token = await requireInvoiceStaff(request);
    const { invoiceId, action = "document" } = request.body || {};
    if (!isInvoiceId(invoiceId) || !["document", "create", "revoke"].includes(action)) {
      return response.status(400).json({ error: "A saved invoice and valid action are required." });
    }
    if (action === "revoke") {
      await database("/rest/v1/rpc/revoke_invoice_share_links", token, {
        method: "POST", body: JSON.stringify({p_invoice_id: invoiceId})
      });
      return response.status(200).json({ revoked: true });
    }
    const receipt = await savedInvoiceDocument(invoiceId, token);
    if (action === "document") return response.status(200).json({ receipt });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return response.status(503).json({ error: "Private PDF links need the Supabase server key in Vercel. You can still share the PDF attachment." });
    }
    const capability = randomBytes(32).toString("base64url");
    const result = await database("/rest/v1/rpc/create_invoice_share_link", token, {
      method: "POST", body: JSON.stringify({ p_invoice_id: invoiceId, p_token_hash: tokenHash(capability) })
    });
    const link = Array.isArray(result) ? result[0] : result;
    if (!link?.expires_at || !link?.id) throw new Error("Incomplete link response");
    return response.status(200).json({ path: `/i/${capability}`, expiresAt: link.expires_at, receipt });
  } catch (error) {
    return response.status(error.status || 503).json({ error: error.status ? error.message : "Could not prepare the private invoice link. Please retry." });
  }
}
