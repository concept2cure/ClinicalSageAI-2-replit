import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencedTables, relationsIn } from '../check-migration-reachability.mjs';

const includes = (names, name) => names.has(name) || names.has(`public.${name}`);

test('existing recorded-lineage statements bind their walk relation in each inspected literal', () => {
  const names = referencedTables();
  assert.ok(!includes(names, 'rl_walk'), `unbound walk references: ${JSON.stringify([...(names.get('rl_walk') ?? [])])}`);
  for (const storage of ['cre_evidence_sources', 'file_uploads', 'document_data_dispositions']) {
    assert.ok(includes(names, storage), `real storage ${storage} remains visible to the deployment scanner`);
  }
});

test('the live scanner already recognizes declared-column CTEs while retaining their real storage reads', () => {
  const names = relationsIn('WITH RECURSIVE walk(id) AS (SELECT id FROM actual_missing_storage) SELECT id FROM walk');
  assert.ok(!includes(names, 'walk'));
  assert.ok(includes(names, 'actual_missing_storage'));
});

test('a standalone same-named table remains subject to storage qualification', () => {
  assert.ok(includes(relationsIn('SELECT id FROM rl_walk'), 'rl_walk'));
});
