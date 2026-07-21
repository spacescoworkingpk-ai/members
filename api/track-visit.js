const allowedEvents = new Set([
  "page_view", "section_view", "whatsapp_visit", "plan_dedicated", "plan_personal",
  "plan_room", "room_visit", "brue_order", "meeting_booking", "maps", "brue_nav",
  "brue_footer", "visit_planner", "plan_enquiry", "visit_submit", "experience_slide",
  "membership_expand", "amenity_view", "visit_form_complete",
  "guide_open", "guide_answer", "guide_whatsapp"
]);

function clean(value, limit = 120) {
  return String(value || "").replace(/[\r\n]/g, " ").slice(0, limit);
}

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const safe = {};
  Object.entries(value).slice(0, 12).forEach(([key, item]) => {
    const safeKey = clean(key, 40);
    if (!safeKey) return;
    if (["string", "number", "boolean"].includes(typeof item)) safe[safeKey] = clean(item, 120);
  });
  return safe;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const body = request.body || {};
  if (!allowedEvents.has(body.eventName) || !body.sessionId) return response.status(400).json({ error: "Invalid event" });
  // The project URL is already public in the client, so fall back to it and
  // keep SUPABASE_SERVICE_ROLE_KEY as the only value that must be configured.
  const supabaseUrl = process.env.SUPABASE_URL || "https://hsnkcrxowajnadwtzdlk.supabase.co";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    console.warn("track-visit: SUPABASE_SERVICE_ROLE_KEY is not set, so this visit was not saved.");
    return response.status(204).end();
  }

  const row = {
    session_id: clean(body.sessionId, 80),
    event_name: body.eventName,
    path: clean(body.path, 180),
    section: clean(body.section, 80) || null,
    referrer_host: clean(body.referrerHost, 120) || null,
    device_type: ["mobile", "tablet", "desktop"].includes(body.deviceType) ? body.deviceType : "desktop",
    metadata: cleanMetadata(body.metadata)
  };
  try {
    const result = await fetch(`${supabaseUrl}/rest/v1/website_events`, {
      method: "POST",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    if (!result.ok) throw new Error(await result.text());
    response.status(204).end();
  } catch (error) {
    console.error("website event insert failed", error.message);
    response.status(204).end();
  }
}
