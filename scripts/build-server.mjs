/**
 * build-server.mjs — Server production build via esbuild
 *
 * Bundles server/index.ts into dist/index.js (ESM) with CJS compatibility.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

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
    },
  });
  console.log('✅ Server build complete → dist/index.js');
} catch (err) {
  console.error('❌ Server build failed:', err.message);
  process.exit(1);
}
