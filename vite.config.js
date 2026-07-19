import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cleanRoutes = new Set([
  '/acceder',
  '/recursos',
  '/privacidad',
  '/aviso-legal',
  '/cookies',
]);

const erpRoutes = new Set([
  '/acceso',
  '/dashboard',
  '/notifications',
  '/agenda',
  '/beneficiaries',
  '/communications',
  '/families',
  '/deliveries',
  '/receipts',
  '/inventory',
  '/donations',
  '/accounting',
  '/treasury',
  '/volunteers',
  '/reports',
  '/users',
  '/settings',
  '/backup',
  '/provider',
  '/debug/admin',
  '/portal-beneficiario',
  '/portal-colaboradores',
  '/portal-donaciones',
]);

const rewriteAppRoutes = (middlewares) => {
  middlewares.use((req, _res, next) => {
    if (!req.url) {
      next();
      return;
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const normalizedPath = requestUrl.pathname !== '/'
      ? requestUrl.pathname.replace(/\/$/, '')
      : requestUrl.pathname;

    if (cleanRoutes.has(normalizedPath)) {
      requestUrl.pathname = `${normalizedPath}/`;
      req.url = `${requestUrl.pathname}${requestUrl.search}`;
      next();
      return;
    }

    if (erpRoutes.has(normalizedPath)) {
      req.url = `/erp/index.html${requestUrl.search}`;
    }

    next();
  });
};

const appRoutesPlugin = {
  name: 'pan-y-esperanza-app-routes',
  configureServer(server) {
    rewriteAppRoutes(server.middlewares);
  },
  configurePreviewServer(server) {
    rewriteAppRoutes(server.middlewares);
  },
};

export default defineConfig({
  plugins: [react(), appRoutesPlugin],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        acceder: resolve(__dirname, 'acceder/index.html'),
        recursos: resolve(__dirname, 'recursos/index.html'),
        privacidad: resolve(__dirname, 'privacidad/index.html'),
        avisoLegal: resolve(__dirname, 'aviso-legal/index.html'),
        cookies: resolve(__dirname, 'cookies/index.html'),
        erp: resolve(__dirname, 'erp/index.html'),
      },
    },
  },
});
