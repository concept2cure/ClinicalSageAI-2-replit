/**
 * C2C-201 is created in C2C-101's client workspace (2026-11-09). The biotech pack created C2C-201 with no client
 * workspace, so in an organization with several workspaces and no default marked (the Lumen pack adds its own) the
 * canonical intake refused it: 409 AMBIGUOUS_CLIENT_WORKSPACE, and the rest of the pack did not run. C2C-201 is the
 * same fictional sponsor's programme, so its workspace is C2C-101's unless --client-workspace-id says otherwise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS, programIntakeBody } from './packs/biotech.mjs';

test('the small molecule is created in the antibody programme\'s workspace when none was chosen', () => {
  const body = programIntakeBody({ ...PROGRAMS.smallMolecule, createInWorkspaceId: 2 }, undefined);
  assert.equal(body.clientWorkspaceId, 2);
});

test('an explicit --client-workspace-id still wins', () => {
  const body = programIntakeBody({ ...PROGRAMS.smallMolecule, createInWorkspaceId: 2 }, 5);
  assert.equal(body.clientWorkspaceId, 5);
});

test('with neither, intake alone decides, as before', () => {
  assert.equal('clientWorkspaceId' in programIntakeBody(PROGRAMS.mab, undefined), false);
});
