/**
 * build-server.mjs — Server production build via esbuild
 *
 * Bundles server/index.ts into dist/index.js (ESM) with CJS compatibility, and
 * the audit-chain verifier into dist/ops/verify-audit-chain.mjs
 * (productionBuilds, below).
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

/**
 * The production bundle's esbuild options, exported so a test can build a
 * module the way production does and run it in plain Node, the runtime that
 * ships. Vitest cannot stand in for it: it hands every module a working
 * `require`, which the ESM bundle does not have (scripts/ci/check-commonjs-require.mjs).
 */
export const SERVER_BUILD_OPTIONS = {
  platform: 'node',
  packages: 'external',
  bundle: true,
  format: 'esm',
  logLevel: 'warning',
  sourcemap: false,
  minifySyntax: true, // Shorten syntax (ternaries, dead-code) — safe, no mangling
  minifyWhitespace: true, // Remove whitespace — cuts ~40% off 12MB bundle
  treeShaking: true,
  target: 'node20',
};

/**
 * Every bundle `npm run build` emits, in order. One list, iterated below and
 * exported, so a test builds an entry from the list the shipped build runs:
 * an entry dropped from here is dropped from the test too, and fails it
 * (server/services/audit/__tests__/verify-audit-chain-production-bundle.test.ts).
 *
 * The audit-chain verifier joined on 2026-10-18 (D5). SOP-SEC-001 §10 owes
 * "the verifier run against production and its output filed", and it could not
 * be: production's database admits only the API's own tasks, so the verifier
 * has to run from the deployed image, and that image had no runnable copy.
 * `npm run ops:verify-audit-chain` is `tsx scripts/ops/verify-audit-chain.mjs`;
 * the production stage installs `--omit=dev` (no tsx), copies no scripts/ops,
 * and the script imports TypeScript plain Node cannot load. Bundled with the
 * server's options, every TypeScript import is resolved at build time and the
 * output is one ES module plain Node runs, under dist/, which the production
 * stage copies whole. dist/ops/ is the same depth as scripts/ops/, so the
 * script's own `../..` from import.meta.url still reaches the app root. Its
 * NODE_ENV is deliberately NOT baked in: an operator tool reads the environment
 * it runs in (resolveChainSecret refuses a missing secret only in production).
 *
 * @param {string} [outDir] where to write; dist/ unless a test says otherwise.
 * @returns {{ label: string, options: import('esbuild').BuildOptions & { outfile: string } }[]}
 */
export function productionBuilds(outDir = path.join(root, 'dist')) {
  return [
    {
      label: 'Server',
      options: {
        ...SERVER_BUILD_OPTIONS,
        entryPoints: [path.join(root, 'server/index.ts')],
        outfile: path.join(outDir, 'index.js'),
        define: {
          'process.env.NODE_ENV': '"production"',
          // Bake the served commit into the bundle: production containers often
          // have no .git to ask, and "what is deployed here?" must stay a
          // checkable fact (server/buildStamp.ts falls back to this).
          'process.env.BUILD_COMMIT': JSON.stringify(resolveBuildCommit()),
        },
      },
    },
    {
      label: 'Audit-chain verifier',
      options: {
        ...SERVER_BUILD_OPTIONS,
        entryPoints: [path.join(root, 'scripts/ops/verify-audit-chain.mjs')],
        outfile: path.join(outDir, 'ops/verify-audit-chain.mjs'),
      },
    },
  ];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  for (const { label, options } of productionBuilds()) {
    try {
      await build(options);
      console.log(`✅ ${label} build complete → ${path.relative(root, options.outfile)}`);
    } catch (err) {
      console.error(`❌ ${label} build failed:`, err.message);
      process.exit(1);
    }
  }
}
