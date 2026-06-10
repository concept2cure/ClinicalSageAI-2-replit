/**
 * Technical-file manifest — the assembled table-of-contents for an EU device/IVD
 * technical documentation file (the device equivalent of the eCTD index.xml).
 *
 * `assembleTechDoc` projects the canonical leaves onto the MDR/IVDR Annex II/III
 * structure and reports completeness; this turns that projection into an ordered,
 * stable, serializable manifest: each tech-doc section gets a deterministic folder
 * path, its annex reference, its required flag, a present/missing status, and the
 * source leaves mapped into it. It is the artifact a manufacturer hands a Notified
 * Body, and the structure a real ZIP packager would lay down on disk.
 *
 * HONEST SCOPE: this is the technical-file STRUCTURE/manifest (a table of contents),
 * not a EUDAMED registration payload and not a rendered dossier. It maps and
 * reports; a section with no source leaf is a gap, never invented.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/pathway-engines/technical-file-manifest
 */

import type { EuRegulation, TechDocResult } from './mdr-ivdr/tech-doc-assembler';

export type TechnicalFileSectionStatus = 'present' | 'missing' | 'optional-absent';

export interface TechnicalFileManifestEntry {
  /** Deterministic, sortable folder path, e.g. "03-annex-ii/device-description". */
  path: string;
  id: string;
  label: string;
  /** MDR/IVDR annex reference for the section. */
  annex: string;
  required: boolean;
  status: TechnicalFileSectionStatus;
  /** Source leaf section codes / titles mapped into this section (empty if absent). */
  sources: string[];
}

export interface TechnicalFileManifest {
  regulation: EuRegulation;
  /** Human-readable framework label. */
  framework: string;
  productName?: string;
  manufacturer?: string;
  generatedFrom: 'canonical-core';
  /** True when every required section has a source leaf. */
  ready: boolean;
  totals: {
    sections: number;
    requiredPresent: number;
    requiredMissing: number;
  };
  entries: TechnicalFileManifestEntry[];
}

const FRAMEWORK_LABEL: Record<EuRegulation, string> = {
  mdr: 'EU MDR (Regulation 2017/745) — Annex II/III technical documentation',
  ivdr: 'EU IVDR (Regulation 2017/746) — Annex II/III technical documentation',
};

/** Lowercase slug for a stable on-disk path segment. */
function slug(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

function statusOf(required: boolean, present: boolean): TechnicalFileSectionStatus {
  if (present) return 'present';
  return required ? 'missing' : 'optional-absent';
}

/**
 * Build the ordered technical-file manifest from an assembled tech-doc result.
 * Entry order follows the registry order in the result; paths are numbered so the
 * manifest sorts and lays out deterministically.
 */
export function buildTechnicalFileManifest(
  result: TechDocResult,
  meta: { productName?: string; manufacturer?: string } = {}
): TechnicalFileManifest {
  const entries: TechnicalFileManifestEntry[] = result.sections.map((s, i) => ({
    path: `${String(i + 1).padStart(2, '0')}-${slug(s.annex)}/${slug(s.id)}`,
    id: s.id,
    label: s.label,
    annex: s.annex,
    required: s.required,
    status: statusOf(s.required, s.present),
    sources: s.sources,
  }));

  const requiredPresent = result.sections.filter(s => s.required && s.present).length;
  const requiredMissing = result.summary.missingRequired.length;

  return {
    regulation: result.regulation,
    framework: FRAMEWORK_LABEL[result.regulation],
    productName: meta.productName,
    manufacturer: meta.manufacturer,
    generatedFrom: 'canonical-core',
    ready: result.summary.ready,
    totals: {
      sections: result.sections.length,
      requiredPresent,
      requiredMissing,
    },
    entries,
  };
}

export default { buildTechnicalFileManifest };
