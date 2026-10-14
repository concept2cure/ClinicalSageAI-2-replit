import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
export default {
  root,
  resolve: { alias: { '@shared': resolve(root, 'shared'), shared: resolve(root, 'shared'),
    vitest: resolve(root, 'node_modules/vitest/dist/index.js') } },
  test: { globals: true, environment: 'node', include: [resolve(here, 'independent-integration.test.ts')],
    maxWorkers: 1, fileParallelism: false, watch: false, reporters: ['verbose'] },
};
