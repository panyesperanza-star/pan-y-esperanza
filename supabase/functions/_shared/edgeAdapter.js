import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function installNodeCompat() {
  globalThis.Buffer = globalThis.Buffer || Buffer;
  globalThis.process = globalThis.process || {};
  globalThis.process.env = new Proxy({}, {
    get(_target, property) {
      return typeof property === "string" ? Deno.env.get(property) || "" : undefined;
    },
    has(_target, property) {
      return typeof property === "string" && Deno.env.has(property);
    },
  });
}

function buildHeaders(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  headers.get = (name) => request.headers.get(name);
  return headers;
}

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return Buffer.from(await request.arrayBuffer());
  }

  const text = await request.text();
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  return text;
}

function createRequestShim(request, body) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());

  return {
    method: request.method,
    url: request.url,
    headers: buildHeaders(request),
    query,
    body,
    on(eventName, callback) {
      if (eventName === "data" && body !== undefined) {
        callback(body);
      }
      if (eventName === "end") {
        callback();
      }
      return this;
    },
  };
}

function createResponseShim() {
  let statusCode = 200;
  let body = "";
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders,
  });

  const response = {
    setHeader(name, value) {
      headers.set(name, String(value));
      return response;
    },
    status(code) {
      statusCode = Number(code) || 200;
      return response;
    },
    json(payload) {
      body = JSON.stringify(payload ?? {});
      headers.set("Content-Type", "application/json; charset=utf-8");
      return response;
    },
    send(payload) {
      body = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
      return response;
    },
    toEdgeResponse() {
      return new Response(statusCode === 204 || statusCode === 304 ? null : body, {
        status: statusCode,
        headers,
      });
    },
  };

  return response;
}

export function serveLegacyHandler(handler) {
  installNodeCompat();

  serve(async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const response = createResponseShim();

    try {
      const body = await readBody(request);
      const result = await handler(createRequestShim(request, body), response);
      if (result instanceof Response) {
        return result;
      }
      return response.toEdgeResponse();
    } catch (error) {
      console.error("[edge-function] Unhandled exception", {
        message: error?.message,
        stack: error?.stack,
      });
      return new Response(JSON.stringify({
        ok: false,
        code: "EDGE_FUNCTION_FAILED",
        error: error?.message || "No se pudo completar la operacion.",
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      });
    }
  });
}
