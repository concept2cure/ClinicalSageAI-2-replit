import fs from 'node:fs';
import path from 'node:path';

// External source overlay only. Relative imports, PGlite migration paths and
// existing mocks keep their original module ids; no repository file is written.
const repo = '/workspace/ClinicalSageAI-2-replit';
const preparation = '/tmp/protocol-signature-read-qualification/refined';
const sources = JSON.parse(fs.readFileSync(path.join(preparation, 'sources.json'), 'utf8'));
const phase = process.env.QUALIFICATION_TEST_PHASE ?? 'green';
if (!['red', 'green'].includes(phase)) throw new Error('QUALIFICATION_TEST_PHASE must be red or green.');
const coreTests = Object.keys(sources).filter(rel => rel.includes('/__tests__/'));
const existingChecks = [
  'server/services/protocol-export/__tests__/protocol-export-logic.test.ts',
  'server/routes/__tests__/protocol-export-binding.http.test.ts',
  'client/src/concept2cure/v2/__tests__/protocolDispositionSigned.test.tsx',
];

export default {
  root: preparation,
  cacheDir: path.join(preparation, 'vite-cache', phase),
  plugins: [{
    name: 'external-protocol-signature-source-overlay',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?')[0];
      if (!clean.startsWith(repo + '/')) return null;
      const rel = path.relative(repo, clean);
      if (!Object.hasOwn(sources, rel)) return null;
      if (phase === 'red' && !rel.includes('/__tests__/')) return null;
      return fs.readFileSync(path.join(preparation, 'next', rel), 'utf8');
    },
  }],
  resolve: {
    alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared'), shared: path.join(repo, 'shared') },
  },
  server: { fs: { allow: [repo, preparation] } },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.join(repo, 'tests/setup.ts')],
    include: [...coreTests, ...(phase === 'green' ? existingChecks : [])].map(rel => path.join(repo, rel)),
    exclude: ['**/node_modules/**', '**/*.dbtest.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 10000,
    reporters: ['verbose'],
    watch: false,
  },
};
