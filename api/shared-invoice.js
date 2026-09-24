import { privateDocumentHeaders, resolveInvoiceToken } from "../lib/invoice-access.js";
import { receiptPdfBuffer } from "../lib/whatsapp.js";

export default async function handler(request, response) {
  privateDocumentHeaders(response);
  if (!["GET", "HEAD"].includes(request.method)) return response.status(405).send("Method not allowed");
  try {
    const receipt = await resolveInvoiceToken(request.query?.token);
    const pdf = await receiptPdfBuffer(receipt);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", 'inline; filename="spaces-invoice.pdf"');
    return response.status(200).send(request.method === "HEAD" ? "" : pdf);
  } catch (error) {
    const unavailable = [404, 409].includes(error.status);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    return response.status(unavailable ? 404 : 503).send(request.method === "HEAD" ? ""
      : unavailable ? "Invoice unavailable. Please ask Spaces for a new link." : "Invoice service temporarily unavailable. Please try again shortly.");
  }
}
