/**
 * The demo change controls name their program (2026-11-09). C2C-CC-001 (C2C-101) and the NP-100 software release
 * change were created with no programId, so the Quality evidence capture (server/services/qms/project-evidence-queries.ts:
 * change controls are `program_id IS NULL OR = this program`) read them as organization-wide and attached them to
 * every project in the workspace. POST /api/mdx/qms/changes admits a body programId (mdx-qms-context.ts
 * admitBodyProject); each pack now sends its own program's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biotechChangeBody } from './packs/biotech-qms.mjs';
import { mdxChangeBody } from './packs/mdx-qms.mjs';

const PROGRAM = '6065271c-d4b0-4936-aad1-02855423a738';

test('C2C-CC-001 is created on its program', () => {
  assert.equal(biotechChangeBody(7, PROGRAM).programId, PROGRAM);
});

test('the NP-100 change is created on its program', () => {
  assert.equal(mdxChangeBody({ sop104: { id: 3 } }, PROGRAM).programId, PROGRAM);
});

test('with no program, none is sent (the route treats it as unscoped)', () => {
  assert.equal('programId' in biotechChangeBody(7, null), false);
  assert.equal('programId' in mdxChangeBody({ sop104: { id: 3 } }, null), false);
});
