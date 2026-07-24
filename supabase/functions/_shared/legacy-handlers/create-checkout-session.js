import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
};

const readJsonBody = async (request) => {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const cleanText = (value) => String(value || "").trim();
const cleanEmail = (value) => cleanText(value).toLowerCase();

const getOrigin = (request) => {
  const configuredUrl = process.env.PUBLIC_SITE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host;

  return `${protocol}://${host}`;
};

function createSupabaseAdmin() {
  const url = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findOrCreateDonor(supabase, body = {}) {
  const email = cleanEmail(body.email || body.donor_email || body.customer_email || body.contact_email);
  if (!supabase || !email) return null;

  const fallbackName = email.split("@")[0] || "Donante";
  const name = cleanText(body.name || body.donor_name || body.customer_name || body.contact_name || fallbackName);
  const phone = cleanText(body.phone || body.contact_phone);
  const now = new Date().toISOString();

  const { data: existing, error: findError } = await supabase
    .from("donors")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("donors")
      .update({ name, email, phone, is_active: true, updated_at: now })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("donors")
    .insert({ name, email, phone, is_active: true, impact: {}, created_at: now, updated_at: now })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    return sendJson(response, 204, {});
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return sendJson(response, 405, { message: "Metodo no permitido." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return sendJson(response, 501, {
      message: "Stripe no está configurado todavía.",
    });
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { message: "Solicitud no valida." });
  }

  const frequency = body.frequency === "monthly" ? "monthly" : "one_time";
  const mode = frequency === "monthly" ? "subscription" : "payment";
  const priceId =
    frequency === "monthly"
      ? process.env.STRIPE_PRICE_DONATION_MONTHLY
      : process.env.STRIPE_PRICE_DONATION_ONCE;

  if (!priceId) {
    return sendJson(response, 501, {
      message: "El precio de donación no está configurado todavía.",
    });
  }

  let donor = null;
  try {
    donor = await findOrCreateDonor(createSupabaseAdmin(), body);
  } catch (error) {
    console.error("[create-checkout-session] No se pudo preparar el donante", {
      message: error?.message,
    });
    return sendJson(response, 502, {
      message: "No se ha podido preparar la ficha del donante.",
    });
  }

  const origin = getOrigin(request);
  const params = new URLSearchParams();

  params.append("mode", mode);
  params.append("locale", "es");
  params.append("submit_type", "donate");
  params.append("success_url", `${origin}/?donacion=ok`);
  params.append("cancel_url", `${origin}/#colabora`);
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("metadata[source]", cleanText(body.source || "public_checkout"));
  params.append("metadata[frequency]", frequency);

  if (mode === "payment") {
    params.append("customer_creation", "always");
  }

  if (donor?.email) {
    params.append("customer_email", donor.email);
    params.append("metadata[donor_id]", donor.id);
    params.append("metadata[donor_email]", donor.email);
    params.append("metadata[donor_name]", donor.name);
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const stripePayload = await stripeResponse.json().catch(() => ({}));

  if (!stripeResponse.ok || typeof stripePayload.url !== "string") {
    return sendJson(response, 502, {
      message: "No se ha podido preparar la donacion.",
    });
  }

  return sendJson(response, 200, {
    url: stripePayload.url,
    donorId: donor?.id || null,
  });
}