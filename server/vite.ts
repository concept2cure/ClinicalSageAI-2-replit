import express, { type Express, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, createLogger } from 'vite';
import { type Server } from 'http';
import viteConfig from '../vite.config';
import { nanoid } from 'nanoid';

const viteLogger = createLogger();

/**
 * Inject `nonce="..."` into every `<script>` tag in the SPA template so
 * the per-request CSP nonce (set by `cspNonce` middleware in
 * server/middleware/enterprise-security.ts) authorizes the module loader.
 * No-op if the tag already has a nonce attribute.
 */
function injectCspNonce(html: string, nonce: string): string {
  if (!nonce) return html;
  return html.replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
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

  // Non-hashed files (index.html, favicon, etc.) — short cache with revalidation
  app.use(
    express.static(distPath, {
      maxAge: 0,
      etag: true,
    })
  );

  // SPA fallback — read index.html on each request so we can inject the
  // per-request CSP nonce into <script> tags. Cache-Control: no-cache so
  // the nonce is fresh on every navigation.
  const indexPath = path.resolve(distPath, 'index.html');
  app.use('{*path}', async (_req: Request, res: Response, next) => {
    try {
      const template = await fs.promises.readFile(indexPath, 'utf-8');
      const page = injectCspNonce(template, readNonce(res));
      res.set('Cache-Control', 'no-cache');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      next(e);
    }
  });
}
