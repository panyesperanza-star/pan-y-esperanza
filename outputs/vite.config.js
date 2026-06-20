import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApiPlugin(env)],
    server: { port: 5173 }
  };
});

function localApiPlugin(env) {
  return {
    name: 'pan-y-esperanza-local-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/send-justificantes')) {
          next();
          return;
        }
        const startedAt = Date.now();
        console.info('[vite-api] Request recibida', {
          method: request.method,
          url: request.url,
          hasResendKey: Boolean(env.RESEND_API_KEY),
          hasFromEmail: Boolean(env.FROM_EMAIL)
        });

        process.env.RESEND_API_KEY = env.RESEND_API_KEY || process.env.RESEND_API_KEY || '';
        process.env.FROM_EMAIL = env.FROM_EMAIL || process.env.FROM_EMAIL || '';
        process.env.PUBLIC_LOGO_URL = env.PUBLIC_LOGO_URL || process.env.PUBLIC_LOGO_URL || '';

        try {
          request.body = await readJsonBody(request);
          const { default: handler } = await import('./api/send-justificantes.js');
          await handler(request, createResponseAdapter(response, startedAt));
        } catch (error) {
          console.error('[vite-api] Error ejecutando /api/send-justificantes', {
            message: error.message,
            stack: error.stack
          });
          if (!response.headersSent) {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ ok: false, code: 'LOCAL_API_ERROR', error: error.message || 'Error local de API.' }));
          }
        }
      });
    }
  };
}

function createResponseAdapter(response, startedAt) {
  return {
    setHeader: (name, value) => response.setHeader(name, value),
    status(statusCode) {
      response.statusCode = statusCode;
      return this;
    },
    send(payload) {
      console.info('[vite-api] Respuesta enviada', {
        status: response.statusCode || 200,
        ms: Date.now() - startedAt,
        preview: typeof payload === 'string' ? payload.slice(0, 300) : payload
      });
      response.end(payload);
      return response;
    }
  };
}

async function readJsonBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('[vite-api] JSON invalido recibido', { raw: raw.slice(0, 300), error: error.message });
    return {};
  }
}
