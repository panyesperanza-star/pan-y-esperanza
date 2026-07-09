import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

await build({
  root: rootDir,
  build: {
    outDir: path.join(distDir, 'client'),
    emptyOutDir: true,
  },
});

await mkdir(path.join(distDir, 'server'), { recursive: true });
await mkdir(path.join(distDir, '.openai'), { recursive: true });

await copyFile(
  path.join(rootDir, '.openai', 'hosting.json'),
  path.join(distDir, '.openai', 'hosting.json'),
);

const workerSource = `const htmlMethods = new Set(['GET', 'HEAD']);

function acceptsHtml(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('*/*');
}

export default {
  async fetch(request, env) {
    if (!env || !env.ASSETS) {
      return new Response('Asociacion Pan y Esperanza', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (
      assetResponse.status !== 404 ||
      !htmlMethods.has(request.method) ||
      !acceptsHtml(request)
    ) {
      return assetResponse;
    }

    const url = new URL(request.url);
    url.pathname = '/index.html';
    url.search = '';

    return env.ASSETS.fetch(new Request(url, request));
  },
};
`;

await writeFile(path.join(distDir, 'server', 'index.js'), workerSource);
