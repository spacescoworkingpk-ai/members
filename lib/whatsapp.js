import PDFDocument from "pdfkit";

export const business = {
  name: "Spaces Coworking",
  phone: "+92 317 3337756",
  landline: "(021)-33393881",
  email: "spaces.net.pk@gmail.com",
  address: "Mezzanine Floor, C-10 Block 4, Federal B Area, Karachi",
  website: "spacespk.com"
};

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
    const doc = new PDFDocument({ size: "A4", margin: 42, info: {
      Title: `${business.name} receipt ${receipt.invoiceId || ""}`.trim(),
      Author: business.name
    } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, 595.28, 841.89).fill("#eef2f4");
    doc.roundedRect(34, 28, 527, 785, 8).fill("#ffffff");
    doc.rect(492, 28, 69, 145).fill("#202020");
    doc.rect(34, 742, 320, 71).fill("#1197d5");

    doc.fillColor("#1197d5").font("Helvetica-Bold").fontSize(22).text(business.name, 56, 58);
    doc.fillColor("#202020").fontSize(28).text("spaces", 56, 84);
    doc.fillColor("#1197d5").fontSize(22).text(receipt.invoiceTitle || "Spaces Receipt", 56, 142);
    const documentStatus = receipt.documentStatus || "PAID";
    doc.font("Helvetica-Bold").fontSize(9)
      .fillColor(documentStatus === "PAID" ? "#1d6b45" : "#8a2525")
      .text(documentStatus, 390, 152, { width: 130, align: "right" });
    if (documentStatus !== "PAID") {
      doc.save().opacity(0.08).fillColor("#8a2525").fontSize(72)
        .rotate(-28, { origin: [297, 420] }).text("UNPAID", 140, 385, { width: 320, align: "center" })
        .restore();
    }

    doc.fillColor("#4d555a").font("Helvetica").fontSize(9);
    doc.text(`${receipt.invoiceLabel || "Receipt No."} ${receipt.invoiceId || ""}`, 390, 58, { width: 130, align: "right" });
    doc.text(business.phone, 390, 76, { width: 130, align: "right" });
    doc.text(business.email, 390, 94, { width: 130, align: "right" });
    doc.text(business.address, 390, 112, { width: 130, align: "right" });

    doc.fillColor("#222222").font("Helvetica-Bold").fontSize(11);
    doc.text(`${receipt.customerLabel || "Member"}: ${receipt.customerName || ""}`, 56, 188);
    doc.font("Helvetica").fillColor("#4d555a").text(`Contact: ${receipt.phone || "-"}`, 56, 208);
    doc.text(`${receipt.issuedDateLabel || "Receipt Date"}: ${displayDate(receipt.issuedDate)}`, 56, 226);

    const tableX = 56;
    let y = 286;
    const widths = [255, 52, 84, 84];
    doc.fillColor("#202020").rect(tableX, y, 475, 30).fill();
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    ["DESCRIPTION", "QTY.", "PRICE", "AMOUNT"].forEach((heading, index) => {
      const offset = widths.slice(0, index).reduce((sum, width) => sum + width, 0);
      doc.text(heading, tableX + offset + 10, y + 10, {
        width: widths[index] - 12,
        align: index ? "center" : "left"
      });
    });
    y += 30;

    const lines = receipt.lines?.length ? receipt.lines : [{
      description: receipt.description,
      quantity: receipt.quantity,
      unitPrice: receipt.unitPrice,
      amount: receipt.amount
    }];
    // Row height and body size adapt so multi-plan receipts never collide
    // with the fixed footer band at the bottom of the page.
    const rowHeight = lines.length > 4 ? 28 : 40;
    const rowFontSize = lines.length > 4 ? 9 : 10;
    doc.font("Helvetica").fontSize(rowFontSize).fillColor("#222222");
    lines.forEach((line) => {
      doc.rect(tableX, y, 475, rowHeight).stroke("#d7dde1");
      doc.text(String(line.description || ""), tableX + 10, y + 9, { width: widths[0] - 12, height: rowHeight - 12 });
      doc.text(String(line.quantity || 1).padStart(2, "0"), tableX + widths[0], y + 9, { width: widths[1], align: "center" });
      doc.text(money(line.unitPrice), tableX + widths[0] + widths[1], y + 9, { width: widths[2], align: "center" });
      doc.text(money(line.amount), tableX + widths[0] + widths[1] + widths[2], y + 9, { width: widths[3], align: "center" });
      y += rowHeight;
    });

    if (receipt.noteRows?.length) {
      y += 12;
      doc.fontSize(9).fillColor("#4d555a");
      receipt.noteRows.forEach((note) => {
        doc.text(note, tableX + 10, y, { width: 455 });
        y += 16;
      });
    }

    y = Math.max(y + 28, 535);
    const totalX = 350;
    const totalGap = y > 560 ? 18 : 22;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#4d555a");
    if (receipt.discount) {
      doc.text("Standard Rate", totalX, y);
      doc.text(money(receipt.standardPrice), totalX + 120, y, { width: 70, align: "right" });
      y += totalGap;
      doc.text("Discount", totalX, y);
      doc.text(`- ${money(receipt.discount)}`, totalX + 120, y, { width: 70, align: "right" });
      y += totalGap + 4;
    }
    doc.fillColor("#222222");
    doc.text("Subtotal", totalX, y);
    doc.text(money(receipt.amount), totalX + 120, y, { width: 70, align: "right" });
    y += totalGap;
    doc.text("Tax", totalX, y);
    doc.text(money(receipt.tax), totalX + 120, y, { width: 70, align: "right" });
    y += totalGap - 2;
    doc.moveTo(totalX, y).lineTo(532, y).stroke("#aab0c9");
    y += 22;
    doc.fontSize(15).text("Total", totalX, y);
    doc.text(money(receipt.total), totalX + 120, y, { width: 70, align: "right" });

    // The validity and thank-you blocks flow below the totals when content
    // runs long, clamped so nothing crosses the footer band.
    const footerY = Math.min(Math.max(675, y + 32), 692);
    doc.font("Helvetica").fontSize(10).fillColor("#222222");
    doc.text(receipt.validText || "", 56, footerY, { width: 250 });
    doc.moveTo(56, footerY + 25).lineTo(260, footerY + 25).dash(4, { space: 4 }).stroke("#333333").undash();
    doc.font("Helvetica-Bold").fontSize(9).text("Spaces Representative", 56, footerY + 39);

    doc.fillColor("#222222").font("Helvetica-Bold").fontSize(22).text("Thank you!", 390, footerY, { width: 130, align: "right" });
    doc.font("Helvetica").fontSize(9).text(business.address, 350, footerY + 35, { width: 170, align: "right" });
    doc.text(business.landline, 350, footerY + 65, { width: 170, align: "right" });
    doc.fillColor("#1197d5").font("Helvetica-Bold").text(business.website, 350, footerY + 95, { width: 170, align: "right" });

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
