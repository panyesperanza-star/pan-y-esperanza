import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: Record<string, unknown>) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
});

const cleanText = (value: unknown) => String(value || "").trim();
const cleanEmail = (value: unknown) => cleanText(value).toLowerCase();

function createSupabaseAdmin() {
  const url = cleanText(Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL"));
  const serviceRoleKey = cleanText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceRoleKey) throw new Error("Supabase admin no esta configurado.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const entries = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, ...rest] = part.split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = entries.t;
  const signature = entries.v1;
  if (!timestamp || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return timingSafeEqual(bytesToHex(new Uint8Array(digest)), signature);
}

async function audit(supabase: ReturnType<typeof createSupabaseAdmin>, action: string) {
  await supabase.from("audit_logs").insert({
    user_name: "Stripe",
    user_email: "stripe@system.local",
    action,
    happened_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

async function upsertDonor(supabase: ReturnType<typeof createSupabaseAdmin>, session: Record<string, any>) {
  const metadata = session.metadata || {};
  const details = session.customer_details || {};
  const email = cleanEmail(details.email || session.customer_email || metadata.donor_email);
  if (!email) throw new Error("Stripe no envio email del donante.");

  const fallbackName = email.split("@")[0] || "Donante";
  const name = cleanText(details.name || metadata.donor_name || session.customer_name || fallbackName);
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
      .update({ name, email, is_active: true, updated_at: now })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("donors")
    .insert({ name, email, is_active: true, impact: {}, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function donationPayloadFromSession(session: Record<string, any>, donor: Record<string, any>) {
  const metadata = session.metadata || {};
  const amount = Number(session.amount_total || 0) / 100;
  const paid = session.payment_status === "paid" || session.status === "complete";
  const frequency = session.mode === "subscription" || metadata.frequency === "monthly" ? "Mensual" : "Puntual";
  const now = new Date().toISOString();

  return {
    donor_id: donor.id,
    donor: donor.name,
    donor_email: donor.email,
    donor_kind: "Particular",
    donation_type: "Economica",
    status: paid ? "Recibida" : "Pendiente",
    state: paid ? "Recibida" : "Pendiente",
    payment_method: "Stripe",
    donated_at: now.slice(0, 10),
    estimated_value: amount,
    amount,
    frequency,
    stripe_session_id: cleanText(session.id),
    stripe_payment_intent_id: cleanText(session.payment_intent),
    stripe_customer_id: cleanText(session.customer),
    notes: [`Stripe Checkout: ${cleanText(session.id)}`, metadata.source ? `Origen: ${metadata.source}` : ""].filter(Boolean).join("\n"),
    created_at: now,
    updated_at: now,
  };
}

async function upsertDonation(supabase: ReturnType<typeof createSupabaseAdmin>, payload: Record<string, any>) {
  const { data: existing, error: findError } = await supabase
    .from("donations")
    .select("*")
    .eq("stripe_session_id", payload.stripe_session_id)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("donations")
      .update({ ...payload, created_at: existing.created_at })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("donations").insert(payload).select().single();
  if (error) throw error;
  return data;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { ok: false, error: "Metodo no permitido." });

  const webhookSecret = cleanText(Deno.env.get("STRIPE_WEBHOOK_SECRET"));
  if (!webhookSecret) return json(501, { ok: false, error: "Stripe webhook no esta configurado." });

  const signature = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
    return json(400, { ok: false, error: "Firma Stripe no valida." });
  }

  const event = JSON.parse(rawBody);
  if (event.type !== "checkout.session.completed") {
    return json(200, { ok: true, ignored: event.type });
  }

  const session = event.data?.object;
  if (!session?.id) return json(400, { ok: false, error: "Evento Stripe sin sesion." });

  const supabase = createSupabaseAdmin();
  const donor = await upsertDonor(supabase, session);
  const donation = await upsertDonation(supabase, donationPayloadFromSession(session, donor));
  await audit(supabase, `Stripe: donacion ${donation.id} asociada al donante ${donor.email}`);

  return json(200, { ok: true, donorId: donor.id, donationId: donation.id });
});