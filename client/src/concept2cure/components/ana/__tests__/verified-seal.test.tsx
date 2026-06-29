// @vitest-environment jsdom
/**
 * Tests for E1 — Part 11 verified-and-sealed export (client).
 *
 *   - Pure helpers: composeSealPayload carries the manifestation under
 *     `manifestation` (printedName/meaning/reason); esigMeaningToSealMeaning maps
 *     the modal's §11.50 meaning; formatSealedAt is stable + tz-explicit.
 *   - VerificationPanel: the "Sign and seal" action appears ONLY when verified
 *     AND a sealer is supplied; the SealBadge renders for an applied seal.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { VerificationPanel } from '../VerificationPanel';
import { SealBadge, formatSealedAt } from '../SealBadge';
import {
  composeSealPayload,
  esigMeaningToSealMeaning,
  type SealVerifiedArgs,
  type VerifiedSeal,
} from '../useVerifiedSeal';
import type { VerificationResult } from '../useAnaChat';

afterEach(cleanup);

const verifiedOk: VerificationResult = {
  ok: true,
  missingRequiredStrings: [],
  requiredStringsChecked: 3,
  message: 'Verified.',
};
const notVerified: VerificationResult = {
  ok: false,
  missingRequiredStrings: ['Figure 1'],
  requiredStringsChecked: 3,
};

const sampleSeal: VerifiedSeal = {
  signatureId: 'sig_1',
  versionId: 202,
  version: 1,
  printedName: 'Dr. Jane Roe',
  meaning: 'APPROVER',
  reasonForChange: 'Verified clean against source.',
  sealedRecord: {
    algorithm: 'sha256',
    contentHash: 'a'.repeat(64),
    atoms: [],
    atomCount: 0,
    aiDisclosed: true,
    sealedAt: '2026-06-29T12:00:00.000Z',
  },
};

describe('esigMeaningToSealMeaning', () => {
  it('maps the three admitted §11.50 meanings', () => {
    expect(esigMeaningToSealMeaning('authorship')).toBe('AUTHOR');
    expect(esigMeaningToSealMeaning('review')).toBe('REVIEWER');
    expect(esigMeaningToSealMeaning('approval')).toBe('APPROVER');
  });
  it('rejects meanings outside the seal vocabulary', () => {
    expect(esigMeaningToSealMeaning('responsibility')).toBeNull();
    expect(esigMeaningToSealMeaning('release')).toBeNull();
    expect(esigMeaningToSealMeaning('nonsense')).toBeNull();
  });
});

describe('composeSealPayload', () => {
  it('carries printedName/meaning/reason under manifestation and forwards verification', () => {
    const args: SealVerifiedArgs = {
      title: 'Module 3 Stability',
      content: 'real content',
      printedName: 'Dr. Jane Roe',
      meaning: 'APPROVER',
      reasonForChange: 'Verified clean against source.',
      verification: { ok: true, message: 'Verified.' },
      password: 'secret',
      mfaToken: '123456',
      projectId: 7,
    };
    const body = composeSealPayload(args);
    expect(body.manifestation).toEqual({
      printedName: 'Dr. Jane Roe',
      meaning: 'APPROVER',
      reasonForChange: 'Verified clean against source.',
    });
    expect(body.verification).toEqual({ ok: true, message: 'Verified.' });
    expect(body.password).toBe('secret');
    expect(body.mfaToken).toBe('123456');
    expect(body.signerName).toBe('Dr. Jane Roe');
  });

  it('E11: threads the persisted version identity so the server seals the EXISTING row (not a fallback)', () => {
    const args: SealVerifiedArgs = {
      title: 'IND Module 2.5 — ABC-123',
      content: 'real content',
      printedName: 'Dr. Jane Roe',
      meaning: 'AUTHOR',
      reasonForChange: 'Verified clean against source.',
      verification: { ok: true },
      password: 'secret',
      // The Build-1 persisted references the client threads from the active draft.
      artifactExternalId: 'artifact_persisted_e11',
      existingVersionNumber: 4,
    };
    const body = composeSealPayload(args);
    expect(body.artifactExternalId).toBe('artifact_persisted_e11');
    expect(body.existingVersionNumber).toBe(4);
  });
});

describe('formatSealedAt', () => {
  it('renders a stable, tz-explicit UTC string', () => {
    expect(formatSealedAt('2026-06-29T12:00:00.000Z')).toBe('2026-06-29 12:00:00 UTC');
  });
  it('is defensive about bad input', () => {
    expect(formatSealedAt('not-a-date')).toBe('unknown');
  });
});

describe('VerificationPanel — seal action visibility', () => {
  it('shows "Sign and seal verified version" only when verified AND a sealer is supplied', () => {
    render(<VerificationPanel verification={verifiedOk} onSeal={async () => sampleSeal} signer={{ name: 'Dr. Jane Roe' }} />);
    expect(screen.getByRole('button', { name: /sign and seal verified version/i })).toBeTruthy();
  });

  it('hides the seal action when not verified', () => {
    render(<VerificationPanel verification={notVerified} onSeal={async () => sampleSeal} signer={{ name: 'Dr. Jane Roe' }} />);
    expect(screen.queryByRole('button', { name: /sign and seal verified version/i })).toBeNull();
  });

  it('hides the seal action when no sealer is supplied (e.g. studio flag off)', () => {
    render(<VerificationPanel verification={verifiedOk} />);
    expect(screen.queryByRole('button', { name: /sign and seal verified version/i })).toBeNull();
  });

  it('renders a SealBadge (not the action) once a seal is applied', () => {
    render(<VerificationPanel verification={verifiedOk} onSeal={async () => sampleSeal} seal={sampleSeal} signer={{ name: 'Dr. Jane Roe' }} />);
    expect(screen.getByText(/signed and sealed/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign and seal verified version/i })).toBeNull();
  });
});

describe('SealBadge / ProvenanceTrail', () => {
  it('surfaces the §11.50 facts and an expandable provenance trail', () => {
    render(<SealBadge seal={sampleSeal} />);
    expect(screen.getByText(/signed and sealed/i)).toBeTruthy();
    // Provenance trail collapsed by default; the toggle exposes it.
    const toggle = screen.getByRole('button', { name: /show provenance trail/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(sampleSeal.sealedRecord.contentHash)).toBeTruthy();
  });

  it('states version + who/when/meaning as text (not colour alone)', () => {
    const { container } = render(<SealBadge seal={{ ...sampleSeal, version: 3 }} />);
    const meta = container.textContent || '';
    expect(meta).toMatch(/v3/);
    expect(meta).toMatch(/Approval by Dr\. Jane Roe on 2026-06-29 12:00:00 UTC/);
  });

  it('marks a superseded seal in text and names the superseding version', () => {
    render(<SealBadge seal={{ ...sampleSeal, version: 3 }} supersededByVersion={4} />);
    expect(screen.getByText(/signed and sealed \(superseded\)/i)).toBeTruthy();
    expect(screen.getByText(/Superseded by v4\./)).toBeTruthy();
  });
});
