/**
 * Tests for Part 11 governance — which AnA commands require sign-off, the
 * fail-closed validation, and the structured "signature required" result. Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  requiresPart11Signoff,
  requiresEsignature,
  validateSignoff,
  buildSignatureRequiredResult,
  PART11_GOVERNED_COMMANDS,
  PART11_ESIGN_COMMANDS,
  MIN_REASON_FOR_CHANGE_LEN,
  governedTierOf,
  requiredSignatureMeaning,
  buildHumanConfirmationRequiredResult,
  resolveDeclaredSignatureMeaning,
  declaredMeaningTokenFor,
  type Part11Signoff,
} from '../part11-governance.js';

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
  it('requires an e-signature for the GDPR erasure (audit 2026-09-24 DP-08/DP-09, P0-12)', () => {
    expect(requiresPart11Signoff('erase_personal_data')).toBe(true);
    expect(requiresEsignature('erase_personal_data')).toBe(true);
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

/**
 * 2026-10-01 (D5): a command's tier can follow what the call does. AnA's
 * update_artifact_status moves an artifact to review or draft on a reason for
 * change; approving or locking it is the status route's electronic signature,
 * each with its own §11.50 meaning. It was the reason tier for every target.
 */
describe('a command whose tier follows the call: update_artifact_status', () => {
  const call = (status: string) => ({ projectId: 3, artifactId: 'artifact_abc', status });

  it.each([['draft'], ['review']])('to %s: the reason tier, no signature, no fixed meaning', status => {
    expect(governedTierOf('update_artifact_status', call(status))).toBe('reason');
    expect(requiresEsignature('update_artifact_status', call(status))).toBe(false);
    expect(requiredSignatureMeaning('update_artifact_status', call(status))).toBeNull();
  });

  it.each([
    ['approved', 'approval', 'APPROVER'],
    ['locked', 'release', 'RELEASE'],
  ])('to %s: the e-signature tier, signed with the meaning %s', (status, meaning, token) => {
    expect(governedTierOf('update_artifact_status', call(status))).toBe('esignature');
    expect(requiresEsignature('update_artifact_status', call(status))).toBe(true);
    expect(requiredSignatureMeaning('update_artifact_status', call(status))).toBe(meaning);
    expect(buildHumanConfirmationRequiredResult('update_artifact_status', call(status)).data).toMatchObject({
      tier: 'esignature',
      signatureRequired: true,
      signatureMeaning: token,
    });
    expect(
      buildSignatureRequiredResult('update_artifact_status', { ok: false, code: 'SIGNATURE_NOT_VERIFIED' }, call(status)).data,
    ).toMatchObject({ tier: 'esignature', signatureRequired: true, signatureMeaning: token });
  });

  it('read without its params, it is the reason tier — the params decide, and every caller passes them', () => {
    expect(governedTierOf('update_artifact_status')).toBe('reason');
  });

  it('a command in the e-signature set fixes no meaning: the signer declares one', () => {
    expect(requiredSignatureMeaning('place_in_dossier', {})).toBeNull();
    expect(buildHumanConfirmationRequiredResult('place_in_dossier', {}).data).not.toHaveProperty('signatureMeaning');
  });

  it("the dialog's RELEASE is the canonical 'release'", () => {
    expect(resolveDeclaredSignatureMeaning('RELEASE')).toEqual({ ok: true, meaning: 'release' });
    expect(declaredMeaningTokenFor('release')).toBe('RELEASE');
    expect(declaredMeaningTokenFor('approval')).toBe('APPROVER');
  });
});
