/** Two exact captured application modules, not a historical whole application. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import current from './independent-checkpoint.config.mts';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const recorded = JSON.parse(readFileSync(path.join(folder, 'independent-baseline-bindings.json'), 'utf8')) as { after: Record<string, string> };
const entries = [
  ['server/services/ana/draft-project-sources.ts', 'independent-baseline-draft-project-sources.ts.txt'],
  ['server/services/ana/AnaDocumentDraftingService.ts', 'independent-baseline-AnaDocumentDraftingService.ts.txt'],
].map(([module, snapshot]) => {
  const bytes = readFileSync(path.join(folder, snapshot), 'utf8');
  if (createHash('sha256').update(bytes).digest('hex') !== recorded.after[module]) throw new Error('Captured baseline source bytes changed');
  return [path.join(root, module), bytes] as const;
});
const replacements = new Map(entries);
export default mergeConfig(current, defineConfig({
  plugins: [{ name: 'exact-captured-context-checkpoint-baseline', enforce: 'pre', load: id => replacements.get(id.split('?')[0]) ?? null }],
}));
