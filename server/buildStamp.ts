/**
 * The build stamp — which commit this process is actually serving.
 *
 * Deployment is not represented in this repository by any CI job; what an
 * environment runs is whatever was last manually deployed. Every argument of
 * the form "the running app doesn't show X" was therefore unfalsifiable: there
 * was no way to tell whether a live instance predated a fix or contradicted
 * it. This makes the served commit a checkable fact:
 *
 *   - production builds bake it in: scripts/build-server.mjs defines
 *     process.env.BUILD_COMMIT from git at build time, and the client bundle
 *     carries the same value via vite's __BUILD_COMMIT__ define;
 *   - dev / source runs resolve it from git at startup;
 *   - a checkout with no git metadata reports "unknown" — honestly, rather
 *     than a guess.
 *
 * Served at GET /api/health and GET /api/version (see startup/inline-endpoints).
 */

import { execSync } from 'node:child_process';

function resolveCommit(): string {
  const baked = process.env.BUILD_COMMIT || process.env.GIT_SHA;
  if (baked && baked.trim()) return baked.trim();
  try {
    return execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** The commit hash this process serves, resolved once at module load. */
export const BUILD_COMMIT: string = resolveCommit();

/** When this process started (ISO) — pairs with the commit for "what is
 *  running right now" questions. */
export const PROCESS_STARTED_AT: string = new Date().toISOString();
