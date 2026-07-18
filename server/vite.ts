import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, createLogger } from 'vite';
import { type Server } from 'http';
import viteConfig from '../vite.config';
import { nanoid } from 'nanoid';

const viteLogger = createLogger();

/**
 * Inject the per-request CSP nonce into the SPA template:
 *   1. Add `nonce="..."` to every <script> tag (authorizes the module
 *      loader under script-src).
 *   2. Replace the `__CSP_NONCE__` placeholder in the
 *      `<meta name="csp-nonce">` tag so client-side code (cspNonce.ts)
 *      can read it and apply it to runtime-injected <style> elements.
 *
 * No-op on the script transform if a script tag already has a nonce.
 */
function injectCspNonce(html: string, nonce: string): string {
  if (!nonce) return html;
  return html
    .replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
    .replace(/__CSP_NONCE__/g, nonce);
}

function readNonce(res: Response): string {
  return (res.locals as { cspNonce?: string }).cspNonce ?? '';
}

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('{*path}', async (req: Request, res: Response, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(import.meta.dirname, '..', 'client', 'index.html');

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const transformed = await vite.transformIndexHtml(url, template);
      const page = injectCspNonce(transformed, readNonce(res));
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, 'public');

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Hashed assets (JS/CSS/images with content hash in filename) — immutable, cache forever
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
      etag: false,
      lastModified: false,
    })
  );

  // Serve index.html through the per-request CSP nonce injector. The raw
  // build file still contains the literal __CSP_NONCE__ placeholder and
  // un-nonced <script> tags; under the prod CSP (nonce + strict-dynamic,
  // which ignores 'self') the browser blocks that bundle and the page
  // renders blank. Every HTML entry point must go through this path.
  const indexPath = path.resolve(distPath, 'index.html');
  const sendInjectedIndex = async (res: Response, next: NextFunction) => {
    try {
      const template = await fs.promises.readFile(indexPath, 'utf-8');
      const page = injectCspNonce(template, readNonce(res));
      res.set('Cache-Control', 'no-cache');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      next(e);
    }
  };

  // Intercept the literal /index.html BEFORE express.static can answer it
  // with the raw file. index:false (below) only disables directory-index
  // resolution for "/", not a direct file match on "/index.html".
  app.get('/index.html', (_req: Request, res: Response, next: NextFunction) =>
    sendInjectedIndex(res, next)
  );

  // Non-hashed files (favicon, etc.) — short cache with revalidation.
  // index:false keeps express.static from answering "/" with the raw
  // index.html, forcing it through the injector via the SPA fallback below.
  app.use(
    express.static(distPath, {
      maxAge: 0,
      etag: true,
      index: false,
    })
  );

  // SPA fallback — inject a fresh per-request nonce on every navigation.
  app.use('{*path}', (_req: Request, res: Response, next: NextFunction) =>
    sendInjectedIndex(res, next)
  );
}
