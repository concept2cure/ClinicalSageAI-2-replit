/**
 * Frontend serving: Vite HMR in dev, static files in production.
 *
 * Extracted from server/index.ts. Must run AFTER all API routes are mounted;
 * the 404 fallback served here would otherwise shadow legitimate routes.
 */

import type { Express } from 'express';
import type { Server } from 'http';
import { setupVite, serveStatic } from '../vite';

export async function setupFrontendServing(app: Express, httpServer: Server): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVite = ['1', 'true', 'yes'].includes(String(process.env.SKIP_VITE || '').toLowerCase());

  if (isProduction || skipVite) {
    try {
      serveStatic(app);
      console.log('✅ Production static file serving enabled (immutable asset caching)');
    } catch (staticError) {
      console.error('⚠️ Static serving failed:', staticError);
      app.get('/', (_req, res) => {
        res.send(
          '<h1>Concept2Cure Platform</h1><p>API running. Build client with <code>npm run build</code>.</p>'
        );
      });
    }
  } else {
    try {
      await setupVite(app, httpServer);
      console.log('✅ Vite HMR middleware setup complete');
    } catch (viteError) {
      console.error('⚠️ Vite setup failed:', viteError);
    }
  }
}
