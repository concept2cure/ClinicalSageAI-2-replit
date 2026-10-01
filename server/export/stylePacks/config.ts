import path from 'node:path';

/**
 * Absolute path to the export style packs (server/export/stylePacks/*.html,
 * print.css) that every device draft-package and 510(k) / PMA / CER PDF render
 * reads (server/export/renderers.ts, POST /api/510k/estar/build).
 *
 * Why cwd-based and not import.meta.url: the server ships as a single esbuild
 * bundle at dist/index.js, which collapses every module into one file.
 * Resolving the packs from the bundle's own location therefore points at
 * <appRoot>/dist/510k_v1.html, which does not exist — so every PDF export
 * ENOENTs into a 500 the moment it reads a pack, even though the build and
 * unit suites (which run the source unbundled, and whose route tests mock
 * this module) look fine. The Dockerfile copies the `server/` source tree into
 * the image alongside `dist/`, and both run paths use the app root as the
 * working directory:
 *   - dev:  `tsx server/index.ts`     → cwd = repo root
 *   - prod: `node dist/index.js` (WORKDIR /app, `server/` copied to /app/server)
 * so <cwd>/server/export/stylePacks is correct in both. This is the same
 * resolution as server/services/ai-gateway/prompts-dir.ts, and it is pinned
 * against a real production-options bundle by
 * tests/export/stylepacks-bundle-resolution.test.ts.
 */
export const STYLE_PACKS_DIR = path.resolve(process.cwd(), 'server', 'export', 'stylePacks');

export type StylePack = {
  html: string;
  css: string;
};

export const stylePacks: Record<string, StylePack> = {
  '510k_v1': {
    html: path.join(STYLE_PACKS_DIR, '510k_v1.html'),
    css: path.join(STYLE_PACKS_DIR, 'print.css'),
  },
  pma_v1: {
    html: path.join(STYLE_PACKS_DIR, 'pma_v1.html'),
    css: path.join(STYLE_PACKS_DIR, 'print.css'),
  },
  cer_mdr_v1: {
    html: path.join(STYLE_PACKS_DIR, 'cer_mdr_v1.html'),
    css: path.join(STYLE_PACKS_DIR, 'print.css'),
  },
};
