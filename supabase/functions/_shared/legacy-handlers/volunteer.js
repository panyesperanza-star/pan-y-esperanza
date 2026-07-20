const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s.-]{6,30}$/;

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

const getText = (value) => (typeof value === "string" ? value.trim() : "");

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
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

  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { message: "Solicitud no valida." });
  }

  if (getText(body.company)) {
    return sendJson(response, 200, { ok: true });
  }

  const name = getText(body.name);
  const phone = getText(body.phone);
  const email = getText(body.email);
  const availability = getText(body.availability);
  const observations = getText(body.observations);
  const errors = {};

  if (name.length < 2 || name.length > 120) {
    errors.name = "Nombre no valido.";
  }

  if (!phonePattern.test(phone)) {
    errors.phone = "Telefono no valido.";
  }

  if (!emailPattern.test(email) || email.length > 160) {
    errors.email = "Email no valido.";
  }

  if (availability.length < 3 || availability.length > 240) {
    errors.availability = "Disponibilidad no valida.";
  }

  if (observations.length > 2000) {
    errors.observations = "Observaciones demasiado largas.";
  }

  if (Object.keys(errors).length > 0) {
    return sendJson(response, 422, {
      message: "Revisa los campos del formulario.",
      errors,
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  const to = process.env.VOLUNTEER_TO_EMAIL || process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !from || !to) {
    return sendJson(response, 503, {
      message: "El servicio de voluntariado no esta configurado todavia.",
    });
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: email,
      subject: "Nueva solicitud de voluntariado desde la web",
      text: [
        `Nombre: ${name}`,
        `Telefono: ${phone}`,
        `Email: ${email}`,
        `Disponibilidad: ${availability}`,
        "",
        `Observaciones: ${observations || "No indicadas"}`,
      ].join("\n"),
    }),
  });

  if (!resendResponse.ok) {
    return sendJson(response, 502, {
      message: "No se ha podido enviar la solicitud.",
    });
  }

  return sendJson(response, 200, { ok: true });
}
