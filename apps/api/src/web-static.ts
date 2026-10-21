import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Same policy the nginx container sets for the SPA (apps/web/nginx.conf). */
const HTML_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-cache',
};

/**
 * ADR-022: single-origin deployment. Serves the built SPA from `dir`:
 * hashed `/assets/*` are immutable, other files are served as-is, and every other GET outside `/api`
 * falls back to index.html so client-side routes survive a reload.
 */
export function serveWebApp(app: NestExpressApplication, dir: string): void {
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);

  app.useStaticAssets(join(root, 'assets'), {
    prefix: '/assets/',
    immutable: true,
    maxAge: '365d',
    index: false,
  });
  app.useStaticAssets(root, {
    index: false,
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) for (const [k, v] of Object.entries(HTML_HEADERS)) res.setHeader(k, v);
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) return next();
    // A stale hashed asset must not come back as HTML (the browser would try to run index.html as JS).
    if (req.path.startsWith('/assets/')) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    for (const [k, v] of Object.entries(HTML_HEADERS)) res.setHeader(k, v);
    res.sendFile(index);
  });
}
