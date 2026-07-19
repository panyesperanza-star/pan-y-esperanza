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

const getOrigin = (request) => {
  const configuredUrl = process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host;

  return `${protocol}://${host}`;
};

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
      message: "Stripe no esta configurado todavia.",
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
      message: "El precio de donacion no esta configurado todavia.",
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
  });
}
