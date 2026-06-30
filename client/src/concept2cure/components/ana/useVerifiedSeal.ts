/**
 * useVerifiedSeal — client side of E1's Part 11 verified-and-sealed export.
 *
 * When AnA's `verify_docx_against_source` step returns `ok === true`, the user
 * can manifest a §11.50 electronic signature against that version. This hook
 * posts the manifestation (printedName + meaning AUTHOR|REVIEWER|APPROVER +
 * reason-for-change) plus re-auth credentials to POST
 * /api/ana-ri/seal-verified-version, which persists an immutable SealedRecord
 * (SHA-256 contentHash, aiDisclosed, sealedAt) + provenance + audit in one
 * transaction.
 *
 * The §11.50 meaning enum is also enforced server-side; this module mirrors it
 * so the UI never offers an unsupported meaning. Re-auth secrets (password, MFA
 * token) are forwarded to fetch and never stored.
 *
 * Reuses the shared <EsignModal> e-sign mechanism: its EsigMeaning is mapped to
 * the seal meaning via {@link esigMeaningToSealMeaning}.
 *
 * @module client/src/concept2cure/components/ana/useVerifiedSeal
 */

import { useCallback, useState } from 'react';

import { getAuthHeaders } from '../../../utils/authToken';

/** The §11.50 meanings E1 admits for a sealed verified version. Mirrors the
 * server enum (verifiedSeal/helpers.ts SEAL_MEANINGS). */
export const SEAL_MEANINGS = ['AUTHOR', 'REVIEWER', 'APPROVER'] as const;
export type SealMeaning = (typeof SEAL_MEANINGS)[number];

/**
 * Map the shared EsignModal's §11.50 meaning onto the seal meaning. The modal
 * offers five meanings; E1 seals under AUTHOR | REVIEWER | APPROVER, so the two
 * meanings outside that vocabulary (responsibility / release) are not admitted.
 * Pure + exported for unit testing.
 */
export function esigMeaningToSealMeaning(meaning: string): SealMeaning | null {
  switch (meaning) {
    case 'authorship':
      return 'AUTHOR';
    case 'review':
      return 'REVIEWER';
    case 'approval':
      return 'APPROVER';
    default:
      return null;
  }
}

/** A provenance atom carried on the seal (the source the doc was verified against). */
export interface SealProvenanceAtom {
  blockPath: string;
  sourceTable: string;
  sourceField?: string;
  recordId?: string | number;
  transformation?: string;
  confidence?: number;
  auditId?: string;
}

/** The immutable seal returned by the server — a report-os SealedRecord. */
export interface SealedRecordView {
  algorithm: 'sha256';
  contentHash: string;
  atoms: SealProvenanceAtom[];
  atomCount: number;
  aiDisclosed: boolean;
  sealedAt: string;
}

/** The signed-and-sealed evidence for a verified version, surfaced in the UI. */
export interface VerifiedSeal {
  signatureId: string;
  versionId: number;
  version: number;
  printedName: string;
  meaning: SealMeaning;
  reasonForChange: string;
  sealedRecord: SealedRecordView;
}

export interface SealVerifiedArgs {
  /** The verified document. */
  title: string;
  content: string;
  ctdSection?: string;
  /** The §11.50 manifestation. */
  printedName: string;
  meaning: SealMeaning;
  reasonForChange: string;
  /** The verify verdict for THIS content (server re-checks `ok`). */
  verification: { ok: boolean; message?: string };
  /** Re-auth credentials (forwarded, never stored). */
  password: string;
  mfaToken?: string;
  /** Project scope for the persisted artifact/version. */
  projectId?: string | number;
  signerEmail?: string;
  signerRole?: string;
  /**
   * Build-1 integration points — when version persistence has run, pass the
   * persisted references so the server seals against them instead of creating a
   * fallback artifact/version. Optional today.
   * TODO(build-1): wire these from the persisted artifact/version once Build 1 lands.
   */
  artifactPk?: number;
  artifactExternalId?: string;
  existingVersionId?: number;
  existingVersionNumber?: number;
}

/**
 * Compose the request body for POST /seal-verified-version from typed args.
 * Pure + exported so the payload (printedName/meaning/reason carried under
 * `manifestation`) is unit-testable without a network round-trip.
 */
export function composeSealPayload(args: SealVerifiedArgs): Record<string, unknown> {
  return {
    title: args.title,
    content: args.content,
    ctdSection: args.ctdSection,
    projectId: args.projectId,
    signerEmail: args.signerEmail,
    signerRole: args.signerRole,
    signerName: args.printedName,
    manifestation: {
      printedName: args.printedName,
      meaning: args.meaning,
      reasonForChange: args.reasonForChange,
    },
    verification: { ok: args.verification.ok, message: args.verification.message },
    password: args.password,
    mfaToken: args.mfaToken,
    // Build-1 integration points (omitted when undefined).
    artifactPk: args.artifactPk,
    artifactExternalId: args.artifactExternalId,
    existingVersionId: args.existingVersionId,
    existingVersionNumber: args.existingVersionNumber,
  };
}

export interface UseVerifiedSealReturn {
  seal: (args: SealVerifiedArgs) => Promise<VerifiedSeal | null>;
  sealing: boolean;
  error: string | null;
}

/** Posts a verified-version seal and exposes sealing/error state. */
export function useVerifiedSeal(): UseVerifiedSealReturn {
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seal = useCallback(async (args: SealVerifiedArgs): Promise<VerifiedSeal | null> => {
    setSealing(true);
    setError(null);
    try {
      const res = await fetch('/api/ana-ri/seal-verified-version', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(composeSealPayload(args)),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) {
        const msg =
          (payload?.error?.message as string) ||
          (payload?.error as string) ||
          `HTTP ${res.status}`;
        setError(msg);
        return null;
      }
      const data = (payload?.data ?? payload) as Record<string, any>;
      return {
        signatureId: String(data.signatureId ?? ''),
        versionId: Number(data.versionId ?? 0),
        version: Number(data.version ?? 0),
        printedName: args.printedName,
        meaning: args.meaning,
        reasonForChange: args.reasonForChange,
        sealedRecord: data.sealedRecord as SealedRecordView,
      };
    } catch (e: any) {
      setError(e?.message || 'Request failed');
      return null;
    } finally {
      setSealing(false);
    }
  }, []);

  return { seal, sealing, error };
}
