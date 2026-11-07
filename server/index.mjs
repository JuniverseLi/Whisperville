import { createStudyStore } from './model-study.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './app.mjs';
import { createSettingsStore } from './settings.mjs';
import { createObservationStore } from './observation-audit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
if (production && !existsSync(resolve(root, 'dist/index.html'))) {
  console.error('Build the client first: npm run build');
  process.exit(1);
}
const vite = production
  ? null
  : await (
      await import('vite')
    ).createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
const handleApi = createApiHandler({
  settingsStore: createSettingsStore(resolve(root, '.whisperville/api.json')),
  studyStore: createStudyStore(resolve(root, '.whisperville/model-studies')),
  observationStore: createObservationStore(resolve(root, '.whisperville/observations')),
});
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (request, response) => {
  try {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    if (await handleApi(request, response)) return;
    if (vite) {
      vite.middlewares(request, response);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const dist = resolve(root, 'dist');
    const candidate = resolve(dist, `.${pathname}`);
    if (!candidate.startsWith(`${dist}${sep}`) && candidate !== dist) {
      response.writeHead(403).end();
      return;
    }
    if (pathname.split('/').some((part) => part.startsWith('.') && part.length > 1)) {
      response.writeHead(404).end();
      return;
    }
    let file = candidate;
    try {
      if (!(await stat(file)).isFile()) file = resolve(dist, 'index.html');
    } catch {
      if (extname(pathname)) {
        response.writeHead(404).end();
        return;
      }
      file = resolve(dist, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response);
  } catch {
    if (!response.headersSent) response.writeHead(500);
    response.end('Local server error');
  }
});

const port = Number(process.env.PORT || 5173);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is in use. Set PORT in .env or stop the existing server.`
      : 'Could not start the local server.',
  );
  process.exitCode = 1;
  vite?.close();
});
server.listen(port, '127.0.0.1', () =>
  console.log(`\n  Whisperville is ready → http://localhost:${port}\n`),
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    vite?.close();
  });
}
