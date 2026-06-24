import crypto from "node:crypto";

export const config = {
  api: { bodyParser: false }
};

async function requestBuffer(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validSignature(body, signature) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function updateDeliveryStatus(status) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole || !status.id) return;
  const mappedStatus = ["sent", "delivered", "read", "failed"].includes(status.status)
    ? status.status
    : "sent";
  const changes = {
    status: mappedStatus,
    delivered_at: mappedStatus === "delivered" ? new Date().toISOString() : undefined,
    read_at: mappedStatus === "read" ? new Date().toISOString() : undefined,
    error_message: status.errors?.[0]?.title || status.errors?.[0]?.message || null
  };
  Object.keys(changes).forEach((key) => changes[key] === undefined && delete changes[key]);
  await fetch(
    `${supabaseUrl}/rest/v1/whatsapp_messages?meta_message_id=eq.${encodeURIComponent(status.id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(changes)
    }
  );
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      response.status(200).send(challenge);
      return;
    }
    response.status(403).send("Verification failed");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = await requestBuffer(request);
  if (!validSignature(body, request.headers["x-hub-signature-256"])) {
    response.status(401).json({ error: "Invalid signature" });
    return;
  }

  try {
    const payload = JSON.parse(body.toString("utf8"));
    const statuses = payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.statuses || []) || []
    ) || [];
    await Promise.all(statuses.map(updateDeliveryStatus));
    response.status(200).json({ ok: true });
  } catch {
    response.status(400).json({ error: "Invalid webhook payload" });
  }
}
