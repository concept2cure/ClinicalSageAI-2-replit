import { defineConfig } from '/workspace/ClinicalSageAI-2-replit/node_modules/vitest/dist/config.js';
const root = '/workspace/ClinicalSageAI-2-replit';
export default defineConfig({
  root,
  resolve: { alias: [
    { find: '@', replacement: root + '/client/src' },
    { find: '@shared', replacement: root + '/shared' },
    { find: 'shared', replacement: root + '/shared' },
  ] },
  test: { globals: true, environment: 'node', setupFiles: [root + '/tests/setup.db.ts'],
    include: ['/tmp/protocol-sod-baseline.dbtest.ts'], testTimeout: 60000, hookTimeout: 120000,
    pool: 'forks', fileParallelism: false, reporters: ['verbose'], watch: false },
});
