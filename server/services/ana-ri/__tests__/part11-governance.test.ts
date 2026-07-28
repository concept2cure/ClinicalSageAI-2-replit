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
