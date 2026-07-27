/**
 * Tests for Part 11 governance — which AnA commands require sign-off, the
 * fail-closed validation, and the structured "signature required" result. Pure.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  requiresPart11Signoff,
  requiresEsignature,
  validateSignoff,
  buildSignatureRequiredResult,
  PART11_GOVERNED_COMMANDS,
  PART11_ESIGN_COMMANDS,
  MIN_REASON_FOR_CHANGE_LEN,
  isRegulatedProfile,
  resolvePart11Enforce,
  type Part11Signoff,
} from '../part11-governance.js';

type FakePool = { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> };
const poolReturning = (settings: unknown): FakePool => ({
  query: async () => ({ rows: [{ settings }] }),
});
const poolThatThrows = (): FakePool => ({
  query: async () => {
    throw new Error('settings read failed');
  },
});

describe('requiresPart11Signoff', () => {
  it('gates record-altering mutations', () => {
    for (const c of ['place_in_dossier', 'revert_to_version', 'update_milestone', 'sign_document', 'submit_document']) {
      expect(requiresPart11Signoff(c)).toBe(true);
    }
  });
  it('does NOT gate reads / drafting / listing', () => {
    for (const c of ['list_projects', 'search_artifacts', 'draft_section', 'check_dossier_readiness', 'load_user_context']) {
      expect(requiresPart11Signoff(c)).toBe(false);
    }
  });
});

describe('requiresEsignature (high-impact tier)', () => {
  it('requires an e-signature for record-altering / submission-state actions', () => {
    for (const c of ['place_in_dossier', 'revert_to_version', 'submit_document', 'sign_document', 'freeze_document', 'create_submission_package']) {
      expect(requiresEsignature(c)).toBe(true);
    }
  });
  it('does NOT require an e-signature for milestone / status transitions (reason-only)', () => {
    for (const c of ['create_milestone', 'update_milestone', 'update_artifact_status']) {
      expect(requiresPart11Signoff(c)).toBe(true); // still governed
      expect(requiresEsignature(c)).toBe(false); // but reason-only
    }
  });
  it('the e-sign set is a subset of the governed set', () => {
    for (const c of PART11_ESIGN_COMMANDS) expect(PART11_GOVERNED_COMMANDS.has(c)).toBe(true);
  });
});

describe('validateSignoff (fail-closed)', () => {
  const valid: Part11Signoff = {
    reasonForChange: 'Correcting the stability data per CMC review',
    signatureVerified: true,
  };

  it('accepts a verified sign-off with a sufficient reason', () => {
    expect(validateSignoff(valid)).toEqual({ ok: true });
  });
  it('rejects a missing sign-off', () => {
    expect(validateSignoff(undefined).code).toBe('MISSING_SIGNOFF');
  });
  it('rejects an empty reason', () => {
    expect(validateSignoff({ ...valid, reasonForChange: '   ' }).code).toBe('MISSING_REASON');
  });
  it('rejects a too-short reason', () => {
    expect(validateSignoff({ ...valid, reasonForChange: 'too short'.slice(0, MIN_REASON_FOR_CHANGE_LEN - 1) }).code).toBe('REASON_TOO_SHORT');
  });
  it('rejects when the signature was not server-verified (default = strict)', () => {
    expect(validateSignoff({ ...valid, signatureVerified: false }).code).toBe('SIGNATURE_NOT_VERIFIED');
    // A client must not be able to assert verification with a truthy non-true value.
    expect(validateSignoff({ ...valid, signatureVerified: 'yes' as unknown as boolean }).code).toBe('SIGNATURE_NOT_VERIFIED');
  });
  it('reason-only tier: accepts a valid reason WITHOUT a verified signature', () => {
    expect(validateSignoff({ reasonForChange: 'Advancing the milestone to in-review', signatureVerified: false }, { requireSignature: false })).toEqual({ ok: true });
  });
  it('reason-only tier still requires a sufficient reason', () => {
    expect(validateSignoff({ reasonForChange: 'x', signatureVerified: false }, { requireSignature: false }).code).toBe('REASON_TOO_SHORT');
  });
});

describe('buildSignatureRequiredResult', () => {
  it('is a fail-closed result that cues the e-sign modal', () => {
    const r = buildSignatureRequiredResult('place_in_dossier', validateSignoff(undefined));
    expect(r.success).toBe(false);
    expect(r.error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(r.openModal).toBe('esign');
    expect(r.data.reasonRequired).toBe(true);
    expect(r.data.code).toBe('MISSING_SIGNOFF');
  });

  it('echoes the command + params so the client can re-submit with a sign-off', () => {
    const r = buildSignatureRequiredResult('revert_to_version', validateSignoff(undefined), { artifactId: 7, versionId: 3 });
    expect(r.data.retry).toEqual({ command: 'revert_to_version', params: { artifactId: 7, versionId: 3 } });
  });

  it('flags signatureRequired per tier (high-impact vs reason-only)', () => {
    expect(buildSignatureRequiredResult('revert_to_version', validateSignoff(undefined)).data.signatureRequired).toBe(true);
    expect(buildSignatureRequiredResult('update_milestone', validateSignoff(undefined)).data.signatureRequired).toBe(false);
  });
});

describe('governed set hygiene', () => {
  it('contains no read-shaped verbs', () => {
    for (const c of PART11_GOVERNED_COMMANDS) {
      expect(c).not.toMatch(/^(list|search|get|load|check|view)_/);
    }
  });
});

describe('isRegulatedProfile', () => {
  const prior = process.env.C2C_REGULATED_PROFILE;
  afterEach(() => {
    if (prior === undefined) delete process.env.C2C_REGULATED_PROFILE;
    else process.env.C2C_REGULATED_PROFILE = prior;
  });
  it('is true only when C2C_REGULATED_PROFILE=1', () => {
    process.env.C2C_REGULATED_PROFILE = '1';
    expect(isRegulatedProfile()).toBe(true);
    process.env.C2C_REGULATED_PROFILE = '0';
    expect(isRegulatedProfile()).toBe(false);
    delete process.env.C2C_REGULATED_PROFILE;
    expect(isRegulatedProfile()).toBe(false);
  });
});

describe('resolvePart11Enforce (G-04)', () => {
  it('outside the regulated profile, mirrors the legacy fail-soft flag', async () => {
    expect(await resolvePart11Enforce(poolReturning({ anaPart11Enforce: true }), 1, { regulated: false }))
      .toEqual({ enforced: true, readFailed: false });
    // absent setting → not enforced
    expect(await resolvePart11Enforce(poolReturning({}), 1, { regulated: false }))
      .toEqual({ enforced: false, readFailed: false });
    // read failure → not enforced, and NOT flagged (legacy fail-soft)
    expect(await resolvePart11Enforce(poolThatThrows(), 1, { regulated: false }))
      .toEqual({ enforced: false, readFailed: false });
  });

  it('under the regulated profile, defaults ON and only an explicit false opts out', async () => {
    // absent setting → enforced
    expect(await resolvePart11Enforce(poolReturning({}), 1, { regulated: true }))
      .toEqual({ enforced: true, readFailed: false });
    // explicit true → enforced
    expect(await resolvePart11Enforce(poolReturning({ anaPart11Enforce: true }), 1, { regulated: true }))
      .toEqual({ enforced: true, readFailed: false });
    // explicit false → opted out
    expect(await resolvePart11Enforce(poolReturning({ anaPart11Enforce: false }), 1, { regulated: true }))
      .toEqual({ enforced: false, readFailed: false });
  });

  it('under the regulated profile, a settings-read failure FAILS CLOSED', async () => {
    expect(await resolvePart11Enforce(poolThatThrows(), 1, { regulated: true }))
      .toEqual({ enforced: true, readFailed: true });
  });

  it('under the regulated profile, a missing pool handle FAILS CLOSED', async () => {
    expect(await resolvePart11Enforce(null, 1, { regulated: true }))
      .toEqual({ enforced: true, readFailed: true });
    // outside the profile, no pool → not enforced
    expect(await resolvePart11Enforce(null, 1, { regulated: false }))
      .toEqual({ enforced: false, readFailed: false });
  });
});
