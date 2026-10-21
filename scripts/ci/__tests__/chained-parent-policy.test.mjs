import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chainedParentPolicyTables } from '../lib/chained-parent-policy.mjs';

const source = readFileSync(new URL('../../../db/migrations/20260813_child_table_parent_scoped_rls.sql', import.meta.url), 'utf8');
test('models the actual schema-qualified packet/export/render parent chain', () => {
  const tables = chainedParentPolicyTables(source);
  for (const name of ['predicate.defense_packets', 'predicate.proof_pack_exports', 'predicate.render_jobs']) assert.ok(tables.has(name));
  assert.ok(tables.has('c2c_document_section_versions'));
  assert.equal(tables.has('unlisted_private_child'), false);
});
test('removing a declaration cannot leave its table silently covered', () => {
  const changed = source.replace(/^\s*\['predicate\.defense_packets'[^\n]+\n/m, '');
  assert.equal(chainedParentPolicyTables(changed).has('predicate.defense_packets'), false);
});
for (const [name, replace, withText] of [
  ['removed generator', /chained TEXT\[\]\[\] := ARRAY\[/, 'unmodeled TEXT[][] := ARRAY['],
  ['missing parent guard', /WHERE schemaname=parent_schema AND tablename=parent/, 'WHERE false'],
  ['missing forced RLS', /ALTER TABLE %I\.%I FORCE ROW LEVEL SECURITY/g, 'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY'],
  ['wrong parent binding', /parent_schema, parent, parent_col, child_schema, child, fk_col\)/, 'parent_schema, parent, parent_col, child_schema, child, wrong_key)'],
  ['missing write predicate', /\$pol\$, child_schema, child, predicate, predicate\)/, '$pol$, child_schema, child, predicate, unscoped)'],
  ['computed table name', /\['predicate\.defense_packets'/, "[computed_child()"],
]) {
  test(`fails closed for ${name}`, () => {
    const changed = source.replace(replace, withText);
    assert.notEqual(changed, source, 'negative control must actually change the source');
    assert.throws(() => chainedParentPolicyTables(changed));
  });
}
