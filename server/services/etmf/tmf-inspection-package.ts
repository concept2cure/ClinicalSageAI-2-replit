/**
 * eTMF inspection-readiness package (E3).
 *
 * Closes the gap where the eTMF domain could file + score artifacts but had NO
 * way to turn a completed TMF into an inspection deliverable. It builds a
 * self-contained ZIP an inspector (or the sponsor's QA) can open:
 *
 *   manifest.json          — machine-readable package descriptor
 *   completeness.json      — the deterministic per-zone assessment
 *   inspection-index.csv   — every filed artifact (zone, code, filed, ref)
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
import { getTrialTmfCompleteness, listTmfArtifacts } from './tmf-artifact-persistence';
import { getTmfReferenceModel } from './tmf-completeness';
import type { TmfCompletenessResult } from './tmf-completeness';

export interface InspectionPackageParams {
  trialId: string;
  organizationId: number;
  scope?: 'essential' | 'all';
  /** ISO timestamp stamped into the manifest; caller supplies for determinism. */
  generatedAt?: string;
}

export interface InspectionPackageResult {
  zip: Buffer;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  ready: boolean;
  summary: TmfCompletenessResult['summary'];
  artifactCount: number;
}

/** code → human label + zone, from the reference model (single source of truth). */
function referenceLabelMap(): Map<string, { label: string; zone: number }> {
  const m = new Map<string, { label: string; zone: number }>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, { label: a.name, zone: zone.number });
  }
  return m;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Assemble the inspection-readiness ZIP for a trial's TMF. Org-scoped through
 * the persistence layer (both reads are org-filtered).
 */
export async function buildTmfInspectionPackage(
  params: InspectionPackageParams,
): Promise<InspectionPackageResult> {
  const { trialId, organizationId } = params;
  const scope = params.scope ?? 'essential';
  const generatedAt = params.generatedAt ?? '';

  const [completeness, filings] = await Promise.all([
    getTrialTmfCompleteness(trialId, { organizationId }, scope),
    listTmfArtifacts(trialId, { organizationId }),
  ]);

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
    organizationId,
    scope,
    generatedAt,
    referenceModel: 'DIA TMF Reference Model (ICH E6(R2) §8)',
    ready: completeness.ready,
    summary: completeness.summary,
    artifactCount: orderedFilings.length,
    contents: ['manifest.json', 'completeness.json', 'inspection-index.csv', 'README.txt'],
    note:
      'Metadata + readiness index only. Document bytes are held in the systems of ' +
      'record referenced by each filing; they are not embedded in this package.',
  };

  const csvHeader = 'zone,artifact_code,artifact_name,filed_at,document_ref';
  const csvRows = orderedFilings.map((f) => {
    const meta = labels.get(f.artifactCode);
    return [
      csvCell(meta?.zone ?? ''),
      csvCell(f.artifactCode),
      csvCell(meta?.label ?? ''),
      csvCell((f as any).filedAt instanceof Date ? (f as any).filedAt.toISOString() : (f as any).filedAt ?? ''),
      csvCell((f as any).documentRef ?? ''),
    ].join(',');
  });
  const csv = [csvHeader, ...csvRows].join('\n') + '\n';

  const readme = [
    'TRIAL MASTER FILE — INSPECTION-READINESS PACKAGE',
    '='.repeat(50),
    ``,
    `Trial:            ${trialId}`,
    `Scope:            ${scope} artifacts`,
    `Reference model:  DIA TMF Reference Model (ICH E6(R2) §8)`,
    `Inspection ready: ${completeness.ready ? 'YES' : 'NO'}`,
    ``,
    `Zones complete:   ${completeness.summary.zonesComplete} / ${completeness.summary.zoneCount}`,
    `Required docs:    ${completeness.summary.totalRequired}`,
    `Missing:          ${completeness.summary.totalMissing}`,
    `Artifacts filed:  ${orderedFilings.length}`,
    ``,
    'CONTENTS',
    '  manifest.json         Machine-readable package descriptor',
    '  completeness.json     Per-zone readiness assessment',
    '  inspection-index.csv  Every filed artifact (zone, code, filed, ref)',
    '  README.txt            This file',
    ``,
    'NOTE ON CONTENT',
    '  This package is the inspection index and readiness picture. Artifact',
    '  document bytes live in the systems of record referenced by each filing',
    '  and are not embedded here. Nothing in this package is fabricated: a',
    "  missing or unfiled artifact is reported as missing, not glossed over.",
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
    fileName: `tmf-inspection-${trialId}.zip`,
    sha256,
    sizeBytes: buffer.length,
    ready: completeness.ready,
    summary: completeness.summary,
    artifactCount: orderedFilings.length,
  };
}

export default { buildTmfInspectionPackage };
