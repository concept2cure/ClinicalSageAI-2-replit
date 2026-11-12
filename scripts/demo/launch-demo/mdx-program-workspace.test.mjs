/**
 * The MDX pack creates its 510(k) program in its own fictional client workspace (2026-11-09; the coordinating
 * session's ruling (b), creation-only). It created the program with no client workspace, so once the Lumen pack had
 * added its workspace, any run that had to CREATE the program was refused 409 AMBIGUOUS_CLIENT_WORKSPACE and the rest
 * of the pack did not run. An existing program is found wherever it is, never moved or refused; the workspace is used
 * only for creation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdxProgramBody } from './packs/mdx.mjs';

test('the program is created in the workspace it is given', () => {
  assert.equal(mdxProgramBody(9).clientWorkspaceId, 9);
});

test('with no workspace, none is sent (intake decides, as before)', () => {
  assert.equal('clientWorkspaceId' in mdxProgramBody(undefined), false);
});
