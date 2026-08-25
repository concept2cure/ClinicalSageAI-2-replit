/**
 * The client build stamp — which commit this bundle was built from.
 *
 * `__BUILD_COMMIT__` is a vite `define` (vite.config.ts) resolved from git at
 * build time, mirrored by scripts/build-server.mjs for the API bundle, and
 * served back by GET /api/version — so "what is this environment actually
 * running?" is answerable from the page (window.C2C_BUILD_COMMIT, plus one
 * console line) and from the API, and the two can be compared.
 */

declare const __BUILD_COMMIT__: string | undefined;

export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === 'string' && __BUILD_COMMIT__ ? __BUILD_COMMIT__ : 'unknown';

export function announceBuild(): void {
  try {
    (window as unknown as { C2C_BUILD_COMMIT?: string }).C2C_BUILD_COMMIT = BUILD_COMMIT;
    // One quiet, greppable line — enough to verify a deploy from devtools.
    console.info(`[c2c] build ${BUILD_COMMIT.slice(0, 12)}`);
  } catch {
    /* non-browser context — nothing to announce to */
  }
}
