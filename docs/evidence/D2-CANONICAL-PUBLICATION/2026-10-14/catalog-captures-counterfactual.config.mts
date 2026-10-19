import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from '../../../../vitest.config.js';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const target = path.join(root, 'server/services/vault/document-catalog-actor-captures.ts');
const prior = fs.readFileSync(path.join(folder, 'catalog-captures-pre-reconciliation-source.txt'), 'utf8');
export default defineConfig({ ...base, plugins: [...(base.plugins ?? []), {
  name: 'catalog-parent-counterfactual', enforce: 'pre',
  load(id) { return id === target ? prior : undefined; },
}], test: { ...base.test, include: ['server/services/vault/__tests__/catalog-actor-capture-discovery.test.ts'] } });
