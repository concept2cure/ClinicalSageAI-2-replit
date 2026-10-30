/**
 * Trial Master File (TMF) completeness — inspection-readiness against the DIA
 * TMF Reference Model.
 *
 * An eTMF must hold the essential records (ICH E6(R3) Appendix C) organized to the DIA
 * TMF Reference Model's zones. This service assesses a trial's filed artifacts
 * against the 11 zones and their essential artifacts (the catalog is
 * shared/constants/domain/tmf-reference-model.ts) — surfacing the missing
 * essential documents per zone before an inspection.
 * (This is the deterministic readiness core; full document management /
 * versioning is a separate concern.)
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: DIA Trial Master File Reference Model v3.x (zone/artifact taxonomy);
 * ICH E6(R3) Appendix C (Essential Records for the Conduct of a Clinical Trial).
 *
 * @module server/services/etmf/tmf-completeness
 */

import { TMF_REFERENCE_MODEL } from '../../../shared/constants/domain/tmf-reference-model.js';
import type { TmfZone } from '../../../shared/constants/domain/tmf-reference-model.js';

/*
 * The DIA TMF Reference Model zones and artifacts. Its one copy is
 * shared/constants/domain/tmf-reference-model.ts (2026-10-30, slice E1 of
 * docs/design/ETMF_CONVERGENCE_2026-10-30.md); this module held its own until
 * then. Re-exported so the routes, persistence, inspection package and AnA
 * callers of this module keep their imports.
 */
export { TMF_REFERENCE_MODEL };
export type { TmfArtifact, TmfZone } from '../../../shared/constants/domain/tmf-reference-model.js';

/**
 * What a filed artifact's document reference was found to be when readiness was
 * computed (tmf-artifact-persistence). Only `verified` makes an artifact present.
 *   verified      a vault document the reference names exists now (org-scoped, not deleted)
 *   no_document   filed with no document reference: a record of filing, not a document
 *   unresolved    a vault reference that names no document now
 *   unverifiable  an off-platform reference (a URL, an archive locator) this service cannot check
 */
export type TmfDocumentEvidence = 'verified' | 'no_document' | 'unresolved' | 'unverifiable';
export type TmfUnverifiedEvidence = Exclude<TmfDocumentEvidence, 'verified'>;

export interface ZoneCompleteness {
  number: number;
  name: string;
  required: string[];
  /** Required artifacts counted as present (basis 'verified_documents': filed against a verified document). */
  present: string[];
  /** Required artifacts not counted as present: never filed, or filed without a verified document. */
  missing: string[];
  /** The part of `missing` that HAS a filing, and what its document reference was found to be. */
  unverified: Array<{ code: string; evidence: TmfUnverifiedEvidence }>;
  complete: boolean;
}

export interface TmfCompletenessResult {
  /**
   * true only when every required artifact is present. false when one is
   * unfiled, filed with no document, or filed against a vault document that no
   * longer resolves. null when every remaining gap is an off-platform reference
   * this service cannot check: readiness is then undetermined, not "no".
   */
  ready: boolean | null;
  /**
   * What `present` rests on. 'verified_documents': stored filings whose document
   * reference was checked when this was computed. 'asserted_codes': the codes the
   * caller listed, taken as given (the stateless POST /completeness checker).
   */
  basis: 'verified_documents' | 'asserted_codes';
  /** 'essential' (default) checks only essential artifacts; 'all' checks every artifact. */
  scope: 'essential' | 'all';
  zones: ZoneCompleteness[];
  summary: {
    zoneCount: number;
    zonesComplete: number;
    totalRequired: number;
    totalMissing: number;
    /** Filed, but without a verified document. Included in totalMissing. */
    totalUnverified: number;
  };
  /** Per filed artifact code, what its document reference was found to be (basis 'verified_documents' only). */
  documentEvidence?: Record<string, TmfDocumentEvidence>;
}

export interface TmfCompletenessInput {
  /** Artifact codes filed in the TMF. */
  providedArtifacts: string[];
  /** Whether to require all artifacts or only essential ones (default 'essential'). */
  scope?: 'essential' | 'all';
  /**
   * Per filed code, what its document reference was found to be. When given, a
   * code counts as present only if it is 'verified'. Omitted, the codes are the
   * caller's assertion and the result says so (basis 'asserted_codes').
   */
  documentEvidence?: Record<string, TmfDocumentEvidence>;
}

/**
 * Assess a trial's filed artifacts against the TMF Reference Model.
 * `ready` is true only when every required artifact (per scope) is present in
 * every zone. Pure / deterministic.
 *
 * 2026-10-15: every filing ROW counted as the document, so 26 essential codes
 * POSTed with no document reference read `ready: true` ("Inspection ready:
 * YES"). With `documentEvidence`, only a verified document makes a code present.
 */
export function assessTmfCompleteness(input: TmfCompletenessInput): TmfCompletenessResult {
  const scope = input.scope === 'all' ? 'all' : 'essential';
  const provided = new Set((input.providedArtifacts ?? []).map(String));
  const evidence = input.documentEvidence;
  const counts = (c: string) => provided.has(c) && (!evidence || evidence[c] === 'verified');
  const unverifiedOf = (codes: string[]) =>
    evidence
      ? codes.flatMap((code) => {
          const e = evidence[code];
          return provided.has(code) && e && e !== 'verified' ? [{ code, evidence: e }] : [];
        })
      : [];

  const zones: ZoneCompleteness[] = TMF_REFERENCE_MODEL.map((zone) => {
    const required = zone.artifacts.filter((a) => (scope === 'all' ? true : a.essential)).map((a) => a.code);
    const present = required.filter(counts);
    const missing = required.filter((c) => !counts(c));
    return { number: zone.number, name: zone.name, required, present, missing, unverified: unverifiedOf(missing), complete: missing.length === 0 };
  });

  const totalRequired = zones.reduce((n, z) => n + z.required.length, 0);
  const gaps = zones.flatMap((z) => z.missing);
  const ready = gaps.length === 0 ? true : evidence && gaps.every((c) => evidence[c] === 'unverifiable') ? null : false;

  return {
    ready,
    basis: evidence ? 'verified_documents' : 'asserted_codes',
    scope,
    zones,
    summary: {
      zoneCount: zones.length,
      zonesComplete: zones.filter((z) => z.complete).length,
      totalRequired,
      totalMissing: gaps.length,
      totalUnverified: zones.reduce((n, z) => n + z.unverified.length, 0),
    },
    ...(evidence ? { documentEvidence: { ...evidence } } : {}),
  };
}

export interface TmfSeedArtifact {
  zone: number;
  code: string;
  artifactName: string;
  /** Essential documents drive completeness; optional ones are tracked only. */
  completenessRequired: boolean;
}

/**
 * The expected-document skeleton a NEW study TMF is seeded with: every
 * reference-model artifact as an 'expected' placeholder, with
 * completeness_required = essential (ICH E6(R3) Appendix C essential records
 * drive the inspection-readiness denominator; optional artifacts are
 * tracked but never dilute it). Pure — the seeding transaction in
 * etmf-service.ts consumes this list.
 */
export function seedArtifacts(scope: 'essential' | 'all' = 'all'): TmfSeedArtifact[] {
  const out: TmfSeedArtifact[] = [];
  for (const zone of TMF_REFERENCE_MODEL) {
    for (const a of zone.artifacts) {
      if (scope === 'essential' && !a.essential) continue;
      out.push({
        zone: zone.number,
        code: a.code,
        artifactName: a.name,
        completenessRequired: a.essential,
      });
    }
  }
  return out;
}

/** The reference model (zones + artifacts) for a checklist UI. */
export function getTmfReferenceModel(): TmfZone[] {
  return TMF_REFERENCE_MODEL;
}
