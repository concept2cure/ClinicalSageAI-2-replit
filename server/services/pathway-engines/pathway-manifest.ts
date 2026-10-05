/**
 * Universal pathway manifest — the assembled table-of-contents for ANY non-eCTD
 * submission pathway (FDA eSTAR 510(k)/De Novo, EU CTIS Part I/II, EU MDR/IVDR
 * Annex II/III, Japan PMDA Shōnin).
 *
 * The pathway engines all project the canonical leaves onto a registry of slots
 * and report which are present vs missing. This turns any of those projections
 * into one uniform, ordered, serializable manifest: each slot becomes an entry
 * with a deterministic path, a group label (annex / eSTAR / CTIS part+state / STED),
 * a required flag, a present/missing status, and the source leaves mapped into it.
 *
 * It complements the packaging-oriented `technical-file-manifest` (which feeds the
 * MDR/IVDR ZIP packager): this is the read-only ToC surface across every pathway,
 * so the four pathways without a dedicated packager still expose an assembled view.
 *
 * HONEST SCOPE: a table of contents over the projection — it maps and reports
 * gaps, never invents a missing slot. PURE + DETERMINISTIC: no DB/network/LLM.
 *
 * @module server/services/pathway-engines/pathway-manifest
 */

import type { Pathway } from './index';

/**
 * 'undetermined' and 'not-applicable' come from engines that model them (CTIS
 * today): an undetermined slot blocks readiness exactly as a missing one does,
 * so it must not be rendered as 'optional-absent'.
 */
export type PathwaySectionStatus = 'present' | 'missing' | 'optional-absent' | 'undetermined' | 'not-applicable';

export interface PathwayManifestEntry {
  /** Deterministic, sortable path, e.g. "03-annex-ii/device-description". */
  path: string;
  id: string;
  label: string;
  /** Grouping label: MDR/IVDR annex, "eSTAR", "Part I"/"Part II — DE", or "STED". */
  group: string;
  required: boolean;
  status: PathwaySectionStatus;
  sources: string[];
}

export interface PathwayManifest {
  pathway: Pathway;
  framework: string;
  generatedFrom: 'canonical-core';
  ready: boolean;
  /** `undetermined`: slots whose need or placement is unanswered; they block `ready` like missing ones. */
  totals: { sections: number; requiredPresent: number; requiredMissing: number; undetermined: number };
  entries: PathwayManifestEntry[];
}

const FRAMEWORK: Record<Pathway, string> = {
  ctis: 'EU CTIS (Regulation 536/2014) — Part I/II clinical trial dossier',
  mdr: 'EU MDR (Regulation 2017/745) — Annex II/III technical documentation',
  ivdr: 'EU IVDR (Regulation 2017/746) — Annex II/III technical documentation',
  estar_510k: 'FDA eSTAR — 510(k) premarket notification',
  estar_de_novo: 'FDA eSTAR — De Novo classification request',
  pmda_shonin: 'Japan PMDA — Shōnin (marketing approval) application',
  pma: 'FDA PMA (21 CFR 814) — premarket approval application',
  prestar_q_sub: 'FDA PreSTAR — Q-Submission (Q-Sub) request',
  prestar_ide: 'FDA PreSTAR — Investigational Device Exemption (IDE)',
  prestar_513g: 'FDA PreSTAR — 513(g) request for information',
};

const DEFAULT_GROUP: Record<Pathway, string> = {
  ctis: 'Part I',
  mdr: 'Annex II',
  ivdr: 'Annex II',
  estar_510k: 'eSTAR',
  estar_de_novo: 'eSTAR',
  pmda_shonin: 'STED',
  pma: 'PMA',
  prestar_q_sub: 'PreSTAR',
  prestar_ide: 'PreSTAR',
  prestar_513g: 'PreSTAR',
};

interface FlatSlot {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  sources: string[];
  annex?: string;
  /** eSTAR only: 'undetermined' when the device flag deciding the section was not answered. */
  applicability?: string;
}
interface FlatResult {
  sections: FlatSlot[];
  /** `undetermined`: eSTAR only (W1-5). */
  summary: { missingRequired: string[]; undetermined?: string[]; ready: boolean };
}
interface CtisSlot {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  status: 'present' | 'missing' | 'undetermined' | 'not-applicable' | 'check-applicability';
  sources: string[];
}
interface CtisResult {
  partI: CtisSlot[];
  partII: Array<{ memberState: string; slots: CtisSlot[]; missingRequired: string[]; undetermined: string[] }>;
  summary: {
    partIMissingRequired: string[];
    partIUndetermined: string[];
    partIIMissingByState: Record<string, string[]>;
    partIIUndeterminedByState: Record<string, string[]>;
    ready: boolean;
  };
}

function slug(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

function statusOf(required: boolean, present: boolean): PathwaySectionStatus {
  if (present) return 'present';
  return required ? 'missing' : 'optional-absent';
}

/** CTIS reports its own five-state status; a conditional slot nobody filed reads as optional-absent. */
function ctisStatus(s: CtisSlot): PathwaySectionStatus {
  return s.status === 'check-applicability' ? 'optional-absent' : s.status;
}

function toEntry(s: FlatSlot | CtisSlot, group: string, status: PathwaySectionStatus): PathwayManifestEntry {
  return {
    path: '', // assigned after global ordering
    id: s.id,
    label: s.label,
    group,
    required: s.required,
    status,
    sources: s.sources,
  };
}

/**
 * Build the universal manifest for a pathway from its engine `detail` result.
 * Handles both the flat-section pathways (eSTAR / PMDA / MDR / IVDR) and the
 * structured CTIS dossier (Part I + per-member-state Part II).
 */
export function buildPathwayManifest(pathway: Pathway, detail: unknown): PathwayManifest {
  const entries: PathwayManifestEntry[] = [];
  let requiredMissing: number;
  let undetermined: number;
  let ready: boolean;

  const probe = detail as Partial<FlatResult & CtisResult> | null | undefined;

  if (probe && Array.isArray(probe.partI)) {
    const ctis = detail as CtisResult;
    for (const s of ctis.partI) entries.push(toEntry(s, 'Part I', ctisStatus(s)));
    for (const st of ctis.partII) {
      for (const s of st.slots) entries.push(toEntry(s, `Part II — ${st.memberState}`, ctisStatus(s)));
    }
    requiredMissing =
      ctis.summary.partIMissingRequired.length +
      Object.values(ctis.summary.partIIMissingByState).reduce((a, b) => a + b.length, 0);
    undetermined =
      ctis.summary.partIUndetermined.length +
      Object.values(ctis.summary.partIIUndeterminedByState).reduce((a, b) => a + b.length, 0);
    ready = ctis.summary.ready;
  } else if (probe && Array.isArray(probe.sections)) {
    const flat = detail as FlatResult;
    for (const s of flat.sections) {
      const status = !s.present && s.applicability === 'undetermined' ? 'undetermined' : statusOf(s.required, s.present);
      entries.push(toEntry(s, s.annex ?? DEFAULT_GROUP[pathway], status));
    }
    requiredMissing = flat.summary.missingRequired.length;
    undetermined = flat.summary.undetermined?.length ?? 0;
    ready = flat.summary.ready;
  } else {
    throw new Error('Unrecognized pathway result shape (expected sections[] or partI[]).');
  }

  // Assign deterministic, globally-ordered paths.
  entries.forEach((e, i) => {
    e.path = `${String(i + 1).padStart(2, '0')}-${slug(e.group)}/${slug(e.id)}`;
  });
  const requiredPresent = entries.filter((e) => e.required && e.status === 'present').length;

  return {
    pathway,
    framework: FRAMEWORK[pathway],
    generatedFrom: 'canonical-core',
    ready,
    totals: { sections: entries.length, requiredPresent, requiredMissing, undetermined },
    entries,
  };
}

export default { buildPathwayManifest };
