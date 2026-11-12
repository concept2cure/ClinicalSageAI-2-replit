/**
 * eTMF inspection-readiness package (E3).
 *
 * Closes the gap where the eTMF domain could file + score artifacts but had NO
 * way to turn a completed TMF into an inspection deliverable. It builds a
 * self-contained ZIP an inspector (or the sponsor's QA) can open:
 *
 *   manifest.json          — machine-readable package descriptor
 *   completeness.json      — the deterministic per-zone assessment
 *   inspection-index.csv   — every filed artifact (zone, code, filed, ref), and every
 *                            record declared not applicable with its reason (P-124 item 5)
 *   README.txt             — human-readable summary + honesty note
 *
 * HONESTY CONTRACT: tmf_artifacts stores metadata only — no document bytes. This
 * package therefore assembles the inspection *index and readiness picture*, and
 * says so plainly. It never fabricates document content it does not hold. Where
 * a filing carries a documentRef the ref is listed so the inspector can locate
 * the source of record; the bytes themselves are not claimed to be inside.
 *
 * Deterministic: no Date.now()/random in the payload beyond a caller-supplied
 * generatedAt, so the same TMF state yields a byte-stable manifest ordering.
 */

import JSZip from 'jszip';
import { readTrialTmf, type TmfStudy } from './tmf-artifact-persistence';
import { getTmfReferenceModel } from './tmf-completeness';
import type { TmfCompletenessResult } from './tmf-completeness';

export interface InspectionPackageParams {
  /** The study's own id string (cdisc_prm_studies.study_id), as GET /api/study-design lists it. */
  trialId: string;
  organizationId: number;
  /** The caller: the package is built only for a study whose project they can open. */
  userId: number;
  scope?: 'essential' | 'all';
  /** ISO timestamp stamped into the manifest; caller supplies for determinism. */
  generatedAt?: string;
}

export interface InspectionPackageResult {
  zip: Buffer;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  /** null: every remaining gap is a reference this service cannot check (see TmfCompletenessResult.ready). */
  ready: boolean | null;
  summary: TmfCompletenessResult['summary'];
  artifactCount: number;
  /** The study the package is about. */
  study: TmfStudy;
}

/** A file name made of the study's id: letters, digits, dot, dash and underscore only, so it is safe in a header. */
function packageFileName(studyId: string): string {
  return `tmf-inspection-${studyId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100)}.zip`;
}

/** code → human label + zone, from the reference model (single source of truth). */
function referenceLabelMap(): Map<string, { label: string; zone: number }> {
  const m = new Map<string, { label: string; zone: number }>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, { label: a.name, zone: zone.number });
  }
  return m;
}

/** The README's account of what "filed" rests on. */
/** The cover's readiness line. No record left to check (every one declared not applicable) is no verdict, never "YES". */
function readinessLabel(completeness: TmfCompletenessResult): string {
  if (completeness.ready === null) {
    return completeness.summary.totalRequired === 0 ? 'NO VERDICT (every required record is declared not applicable)' : 'NOT DETERMINED';
  }
  return completeness.ready ? 'YES' : 'NO';
}

function contentBasisNote(basis: TmfCompletenessResult['basis']): string {
  return basis === 'verified_documents'
    ? '  An artifact counts as filed only when its filing references a vault\n' +
        '  document that resolved when this package was generated. A filing with\n' +
        '  no reference, a reference that no longer resolves, or an off-platform\n' +
        '  reference this service cannot check is counted as missing, and the\n' +
        '  document_evidence column says which. When off-platform references are\n' +
        '  the only gaps, readiness is NOT DETERMINED rather than YES or NO.'
    : '  Readiness was assessed from artifact codes as listed; no document was\n' +
        '  checked.';
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Assemble the inspection-readiness ZIP for a study's TMF. Scoped through the
 * persistence layer: one read, admitted by the caller's current access to the
 * study's project (STUDY_NOT_FOUND otherwise), org-filtered.
 */
export async function buildTmfInspectionPackage(
  params: InspectionPackageParams,
): Promise<InspectionPackageResult> {
  const { organizationId } = params;
  const scope = params.scope ?? 'essential';
  const generatedAt = params.generatedAt ?? '';

  const { study, filings, completeness } = await readTrialTmf(params.trialId, { organizationId, userId: params.userId }, scope);
  const trialId = study.studyId;

  const labels = referenceLabelMap();
  // Stable ordering: by zone then code.
  const orderedFilings = [...filings].sort(
    (a, b) =>
      (labels.get(a.artifactCode)?.zone ?? 99) - (labels.get(b.artifactCode)?.zone ?? 99) ||
      a.artifactCode.localeCompare(b.artifactCode),
  );

  const manifest = {
    kind: 'tmf-inspection-package',
    version: 1,
    trialId,
    study: { id: study.id, studyId: study.studyId, protocolId: study.protocolId, title: study.title, programId: study.programId },
    organizationId,
    scope,
    generatedAt,
    referenceModel: 'DIA TMF Reference Model (ICH E6(R3) Appendix C)',
    ready: completeness.ready,
    basis: completeness.basis,
    summary: completeness.summary,
    artifactCount: orderedFilings.length,
    contents: ['manifest.json', 'completeness.json', 'inspection-index.csv', 'README.txt'],
    note:
      'Metadata + readiness index only. Document bytes are held in the systems of ' +
      'record referenced by each filing; they are not embedded in this package.',
  };

  // document_evidence: what each filing's reference was found to be when this
  // package was built ('not_assessed' only if the assessment carried none);
  // 'not_applicable' for a record declared not applicable to the study, whose
  // reason is the last column and whose filed_at is when it was declared.
  const csvHeader = 'zone,artifact_code,artifact_name,filed_at,document_ref,document_evidence,not_applicable_reason';
  const csvRows = orderedFilings.map((f) => {
    const meta = labels.get(f.artifactCode);
    const declared = f.notApplicableReason != null;
    return [
      csvCell(meta?.zone ?? ''),
      csvCell(f.artifactCode),
      csvCell(meta?.label ?? ''),
      csvCell((f as any).filedAt instanceof Date ? (f as any).filedAt.toISOString() : (f as any).filedAt ?? ''),
      csvCell((f as any).documentRef ?? ''),
      csvCell(declared ? 'not_applicable' : completeness.documentEvidence?.[f.artifactCode] ?? 'not_assessed'),
      csvCell(f.notApplicableReason ?? ''),
    ].join(',');
  });
  const declaredCount = orderedFilings.filter((f) => f.notApplicableReason != null).length;
  const csv = [csvHeader, ...csvRows].join('\n') + '\n';

  /* 2026-10-15: this printed "Inspection ready: YES" whenever every essential
     code had a filing row — with or without a document — under a note that
     "nothing in this package is fabricated". */
  const readyLabel = readinessLabel(completeness);
  const readme = [
    'TRIAL MASTER FILE — INSPECTION-READINESS PACKAGE',
    '='.repeat(50),
    ``,
    `Study:            ${trialId}`,
    `Protocol:         ${study.protocolId}`,
    `Title:            ${study.title}`,
    `Scope:            ${scope} artifacts`,
    `Reference model:  DIA TMF Reference Model (ICH E6(R3) Appendix C)`,
    `Inspection ready: ${readyLabel}`,
    ``,
    `Zones complete:   ${completeness.summary.zonesComplete} / ${completeness.summary.zoneCount}`,
    `Required docs:    ${completeness.summary.totalRequired}`,
    `Missing:          ${completeness.summary.totalMissing}`,
    `  of which filed without a verified document: ${completeness.summary.totalUnverified}`,
    `Not applicable:   ${completeness.summary.totalNotApplicable} (declared, each with its reason; not required)`,
    `Artifacts filed:  ${orderedFilings.length - declaredCount}`,
    ``,
    'CONTENTS',
    '  manifest.json         Machine-readable package descriptor',
    '  completeness.json     Per-zone readiness assessment',
    '  inspection-index.csv  Every filed artifact (zone, code, filed, ref, evidence),',
    '                        and every record declared not applicable, with its reason',
    '  README.txt            This file',
    ``,
    'NOTE ON CONTENT',
    '  This package is the inspection index and readiness picture. Artifact',
    '  document bytes live in the systems of record referenced by each filing',
    '  and are not embedded here.',
    contentBasisNote(completeness.basis),
    ``,
  ].join('\n');

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('completeness.json', JSON.stringify(completeness, null, 2));
  zip.file('inspection-index.csv', csv);
  zip.file('README.txt', readme);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  return {
    zip: buffer,
    fileName: packageFileName(trialId),
    sha256,
    sizeBytes: buffer.length,
    ready: completeness.ready,
    summary: completeness.summary,
    artifactCount: orderedFilings.length,
    study,
  };
}

export default { buildTmfInspectionPackage };
