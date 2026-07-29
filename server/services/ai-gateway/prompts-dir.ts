import path from 'node:path';

/**
 * Absolute path to the AI-gateway prompt library
 * (server/services/ai-gateway/prompts/<task>/<version>.md).
 *
 * Why cwd-based and not import.meta.url: the server ships as a single esbuild
 * bundle at dist/index.js, which collapses every service module into one file.
 * Resolving prompts from the bundle's own location therefore points at
 * <appRoot>/ai-gateway/prompts (one level above dist/), which does not exist —
 * so AI generation ENOENTs the moment it loads a prompt, even though the build
 * and unit suites (which run the source unbundled) look fine. The Dockerfile
 * copies the `server/` source tree into the image alongside `dist/`, and both
 * run paths use the app root as the working directory:
 *   - dev:  `tsx server/index.ts`     → cwd = repo root
 *   - prod: `node dist/index.js` (WORKDIR /app, `server/` copied to /app/server)
 * so <cwd>/server/services/ai-gateway/prompts is correct in both. This is the
 * single resolution that holds for the source, the bundle, and the test runner.
 */
export const PROMPTS_DIR = path.resolve(
  process.cwd(),
  'server',
  'services',
  'ai-gateway',
  'prompts',
);
