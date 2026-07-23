import PDFDocument from "pdfkit";
import { letterheadBuffer } from "./letterhead.js";

export const business = {
  name: "Spaces Coworking",
  phone: "+92 317 3337756",
  landline: "(021)-33393881",
  email: "spaces.net.pk@gmail.com",
  address: "Mezzanine Floor, C-10 Block 4, Federal B Area, Karachi",
  website: "www.spaces.net.pk"
};

// Sampled from the supplied letterhead artwork so the receipt matches it.
const BRAND_BLUE = "#4C8EC8";
const BRAND_INK = "#3C3B3B";
const BRAND_MUTED = "#6B7280";
const BRAND_RULE = "#DCE3EA";

export function whatsappPhone(phone) {
  const cleaned = String(phone || "").replace(/[^\d]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  if (cleaned.startsWith("0")) return `92${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("3")) return `92${cleaned}`;
  return cleaned;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-PK");
}

function displayDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi"
  }).format(date);
}

export function receiptPdfBuffer(receipt) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, info: {
      Title: `${business.name} receipt ${receipt.invoiceId || ""}`.trim(),
      Author: business.name
    } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const LEFT = 56;
    const RIGHT = 539;          // clear of the dark shape on the right edge
    const CONTENT_W = RIGHT - LEFT;

    // The letterhead already carries the logo, phone, email, address and the
    // website, so none of that is repeated below.
    doc.image(letterheadBuffer, 0, 0, { width: PAGE_W, height: PAGE_H });

    const documentStatus = receipt.documentStatus || "PAID";
    const isPaid = documentStatus === "PAID";

    // ---- title block, clear of the letterhead header ----
    let y = 168;
    doc.fillColor(BRAND_INK).font("Helvetica-Bold").fontSize(19)
      .text((receipt.invoiceTitle || "Spaces Membership").toUpperCase(), LEFT, y, { width: 330 });
    y += 26;
    doc.fillColor(BRAND_BLUE).font("Helvetica-Bold").fontSize(10)
      .text(`${receipt.invoiceLabel || "Receipt No."} ${receipt.invoiceId || ""}`, LEFT, y);

    // Status chip on the right of the title row.
    const chipW = 74;
    const chipX = RIGHT - chipW;
    doc.roundedRect(chipX, 168, chipW, 22, 11)
      .fillAndStroke(isPaid ? "#eaf5ec" : "#fdeeee", isPaid ? "#2f7d46" : "#a33232");
    doc.fillColor(isPaid ? "#2f7d46" : "#a33232").font("Helvetica-Bold").fontSize(9)
      .text(isPaid ? "PAID" : "UNPAID", chipX, 175, { width: chipW, align: "center" });

    y += 26;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).stroke(BRAND_RULE);

    // ---- who it is for ----
    y += 18;
    doc.fillColor(BRAND_MUTED).font("Helvetica").fontSize(8.5)
      .text(`${receipt.customerLabel || "Member"}`.toUpperCase(), LEFT, y);
    doc.text((receipt.issuedDateLabel || "Receipt Date").toUpperCase(), LEFT + 300, y);
    y += 13;
    doc.fillColor(BRAND_INK).font("Helvetica-Bold").fontSize(12)
      .text(receipt.customerName || "", LEFT, y, { width: 290 });
    doc.font("Helvetica").fontSize(11)
      .text(displayDate(receipt.issuedDate), LEFT + 300, y + 1);
    y += 16;
    if (receipt.phone) {
      doc.fillColor(BRAND_MUTED).font("Helvetica").fontSize(9.5)
        .text(receipt.phone, LEFT, y, { width: 290 });
      y += 14;
    }

    // ---- line items ----
    y += 12;
    const cols = [CONTENT_W - 210, 46, 78, 86];   // description, qty, price, amount
    const colX = [LEFT];
    cols.forEach((w, i) => colX.push(colX[i] + w));

    doc.rect(LEFT, y, CONTENT_W, 26).fill(BRAND_INK);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
    ["DESCRIPTION", "QTY", "RATE", "AMOUNT"].forEach((heading, i) => {
      doc.text(heading, colX[i] + (i ? 0 : 10), y + 9, {
        width: cols[i] - (i ? 10 : 12),
        align: i ? "right" : "left"
      });
    });
    y += 26;

    const lines = receipt.lines?.length ? receipt.lines : [{
      description: receipt.description,
      quantity: receipt.quantity,
      unitPrice: receipt.unitPrice,
      amount: receipt.amount
    }];
    // Rows tighten when a member has many plan lines so the totals and the
    // signature never collide with the letterhead's bottom artwork.
    const rowH = lines.length > 5 ? 24 : 30;
    const rowFont = lines.length > 5 ? 9 : 10;
    lines.forEach((line, index) => {
      if (index % 2 === 1) doc.rect(LEFT, y, CONTENT_W, rowH).fill("#f7f9fb");
      doc.fillColor(BRAND_INK).font("Helvetica").fontSize(rowFont);
      doc.text(String(line.description || ""), colX[0] + 10, y + (rowH - rowFont) / 2 - 1,
        { width: cols[0] - 14, height: rowH - 6, ellipsis: true });
      doc.text(String(line.quantity || 1), colX[1], y + (rowH - rowFont) / 2 - 1, { width: cols[1] - 10, align: "right" });
      doc.text(money(line.unitPrice), colX[2], y + (rowH - rowFont) / 2 - 1, { width: cols[2] - 10, align: "right" });
      doc.font("Helvetica-Bold").text(money(line.amount), colX[3], y + (rowH - rowFont) / 2 - 1, { width: cols[3] - 10, align: "right" });
      y += rowH;
    });
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).stroke(BRAND_RULE);

    if (receipt.noteRows?.length) {
      y += 10;
      doc.fillColor(BRAND_MUTED).font("Helvetica").fontSize(8.5);
      receipt.noteRows.forEach((note) => {
        doc.text(note, LEFT, y, { width: CONTENT_W - 190 });
        y += 12;
      });
    }

    // ---- totals ----
    y += 14;
    const labelX = RIGHT - 220;
    const valueW = 96;
    const valueX = RIGHT - valueW;
    const totalRow = (label, value, bold = false, color = BRAND_MUTED) => {
      doc.fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5)
        .text(label, labelX, y, { width: 120, align: "right" });
      doc.fillColor(bold ? BRAND_INK : color).font(bold ? "Helvetica-Bold" : "Helvetica")
        .text(value, valueX, y, { width: valueW, align: "right" });
      y += 16;
    };
    if (receipt.discount) {
      totalRow("Standard rate", money(receipt.standardPrice));
      totalRow("Discount", `- ${money(receipt.discount)}`);
    }
    totalRow("Subtotal", money(receipt.amount));
    totalRow("Tax", money(receipt.tax));
    y += 2;
    doc.moveTo(labelX, y).lineTo(RIGHT, y).lineWidth(1).stroke(BRAND_RULE);
    y += 10;
    doc.rect(labelX, y - 4, RIGHT - labelX, 30).fill(BRAND_BLUE);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11)
      .text("TOTAL", labelX + 12, y + 5, { width: 100 });
    doc.fontSize(13).text(`Rs ${money(receipt.total)}`, valueX - 12, y + 4, { width: valueW, align: "right" });
    y += 34;

    // ---- validity and signature, clamped above the bottom artwork ----
    const footY = Math.min(Math.max(y + 30, 545), 672);
    doc.fillColor(BRAND_INK).font("Helvetica-Bold").fontSize(9.5)
      .text(receipt.validText || "", LEFT, footY, { width: 300 });
    doc.moveTo(LEFT, footY + 42).lineTo(LEFT + 190, footY + 42)
      .dash(3, { space: 3 }).lineWidth(0.8).stroke(BRAND_MUTED).undash();
    doc.fillColor(BRAND_MUTED).font("Helvetica").fontSize(8.5)
      .text("Spaces Representative", LEFT, footY + 48);
    doc.fillColor(BRAND_BLUE).font("Helvetica-Bold").fontSize(13)
      .text("Thank you!", RIGHT - 160, footY, { width: 160, align: "right" });
    doc.fillColor(BRAND_MUTED).font("Helvetica").fontSize(8)
      .text(business.landline, RIGHT - 160, footY + 20, { width: 160, align: "right" });

    if (!isPaid) {
      doc.save().opacity(0.07).fillColor("#a33232").font("Helvetica-Bold").fontSize(78)
        .rotate(-26, { origin: [PAGE_W / 2, 430] })
        .text("UNPAID", PAGE_W / 2 - 190, 395, { width: 380, align: "center" })
        .restore();
    }

    doc.end();
  });
}

export async function uploadWhatsAppMedia({ pdf, fileName, token, phoneNumberId, apiVersion }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([pdf], { type: "application/pdf" }), fileName);

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Could not upload the receipt PDF.");
  return payload.id;
}

export async function sendReceiptTemplate({
  to,
  mediaId,
  fileName,
  receipt,
  token,
  phoneNumberId,
  apiVersion,
  templateName,
  templateLanguage
}) {
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: "header",
            parameters: [{
              type: "document",
              document: { id: mediaId, filename: fileName }
            }]
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: receipt.customerName || "Member" },
              { type: "text", text: `Rs. ${money(receipt.total)}` },
              { type: "text", text: receipt.description || "Membership" },
              { type: "text", text: displayDate(receipt.validTill || receipt.validText?.match(/\d{1,2} \w+ \d{4}/)?.[0]) },
              { type: "text", text: receipt.invoiceId || "-" }
            ]
          }
        ]
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "WhatsApp could not send the receipt.");
  return payload;
}
