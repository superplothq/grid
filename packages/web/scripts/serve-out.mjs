import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd(), process.env.OUT_DIR || 'out');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const candidates = pathname.endsWith('/')
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}/index.html`, `${pathname}.html`];

  for (const candidate of candidates) {
    try {
      const file = await readFile(join(root, normalize(candidate)));
      response.writeHead(200, {
        'content-type': contentTypes[extname(candidate)] ?? 'application/octet-stream',
      });
      response.end(file);
      return;
    } catch {}
  }

  try {
    const notFound = await readFile(join(root, '404.html'));
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(notFound);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  }
});

const port = Number(process.env.PORT) || 3335;
server.listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port}`);
});
