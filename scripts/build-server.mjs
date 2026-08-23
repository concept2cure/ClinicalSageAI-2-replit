/**
 * build-server.mjs — Server production build via esbuild
 *
 * Bundles server/index.ts into dist/index.js (ESM) with CJS compatibility.
 */
import { build } from 'esbuild';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

/** The commit this build serves — env override first (CI), then git. */
function resolveBuildCommit() {
  const fromEnv = process.env.BUILD_COMMIT || process.env.GIT_SHA;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    return execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

try {
  await build({
    entryPoints: [path.join(root, 'server/index.ts')],
    platform: 'node',
    packages: 'external',
    bundle: true,
    format: 'esm',
    outfile: path.join(root, 'dist/index.js'),
    logLevel: 'warning',
    sourcemap: false,
    minifySyntax: true, // Shorten syntax (ternaries, dead-code) — safe, no mangling
    minifyWhitespace: true, // Remove whitespace — cuts ~40% off 12MB bundle
    treeShaking: true,
    target: 'node20',
    define: {
      'process.env.NODE_ENV': '"production"',
      // Bake the served commit into the bundle: production containers often
      // have no .git to ask, and "what is deployed here?" must stay a
      // checkable fact (server/buildStamp.ts falls back to this).
      'process.env.BUILD_COMMIT': JSON.stringify(resolveBuildCommit()),
    },
  });
  console.log('✅ Server build complete → dist/index.js');
} catch (err) {
  console.error('❌ Server build failed:', err.message);
  process.exit(1);
}
