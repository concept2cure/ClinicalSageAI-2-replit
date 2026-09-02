/**
 * CTD Module 1 (Regional administrative) and Module 2 (CTD summaries) — the
 * backend "home" the dedicated authoring surfaces bind to.
 *
 * M3 (CMC), M4 (Nonclinical), and M5 (Clinical) already have homes; M1 and M2
 * were authored piecemeal. This module gives them a canonical, region-aware
 * section structure plus a pure build-state derivation that mirrors the M3 OS
 * shape (sections[] + readiness summary), computed from the existing
 * c2c_document_sections store — no new tables.
 *
 * Module 1 is region-specific (FDA / EMA / PMDA differ). Module 2 is the
 * ICH-common summary set (2.1–2.7); each summary section declares the source
 * module it is derived from (2.3 ← M3, 2.4/2.6 ← M4, 2.5/2.7 ← M5) so the
 * surface can show whether the upstream is ready before composing.
 *
 * @module server/services/regulatory/ctd-module-structure
 */

export type CtdRegion = 'FDA' | 'EMA' | 'PMDA';
export type SectionStatus = 'not_started' | 'todo' | 'drafted' | 'review' | 'approved' | 'locked';

export interface CtdSectionDef {
  /** CTD code, e.g. '1.1' or '2.3'. */
  code: string;
  title: string;
  required: boolean;
  aiDraftable?: boolean;
  /** Source CTD modules an M2 summary is derived from (e.g. [3] for the QOS). */
  sourceModules?: number[];
  regulatoryRef?: string;
  children?: CtdSectionDef[];
}

export interface CtdSectionState extends Omit<CtdSectionDef, 'children'> {
  status: SectionStatus;
  /** For M2 summaries: fraction of the source module(s) that is approved/locked. */
  upstreamReadyPercent?: number;
  /** True when the source module(s) are sufficiently ready to compose this summary. */
  upstreamReady?: boolean;
  children?: CtdSectionState[];
}

export interface ModuleBuildState {
  module: 1 | 2;
  region: CtdRegion | null;
  sections: CtdSectionState[];
  summary: {
    total: number;
    notStarted: number;
    inProgress: number; // todo | drafted | review
    approved: number;   // approved | locked
    readinessPercent: number;
  };
}

// ── Region normalization ───────────────────────────────────────────────────────

import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge.js';

const REGION_TO_CTD: Record<string, CtdRegion> = {
  US: 'FDA', EU: 'EMA', JP: 'PMDA',
  CA: 'FDA', UK: 'EMA', CN: 'FDA', AU: 'FDA',
  CH: 'EMA', BR: 'FDA', IN: 'FDA', KR: 'FDA', SG: 'FDA', ICH: 'FDA',
};

export function normalizeRegion(input?: string): CtdRegion {
  const v = (input ?? 'FDA').toUpperCase();
  if (v === 'EU' || v === 'EMA') return 'EMA';
  if (v === 'JP' || v === 'PMDA' || v === 'JNDA') return 'PMDA';
  if (v === 'CA' || v === 'UK' || v === 'MHRA' || v === 'CN' || v === 'NMPA' || v === 'AU' || v === 'TGA'
    || v === 'CH' || v === 'SWISSMEDIC' || v === 'BR' || v === 'ANVISA'
    || v === 'IN' || v === 'CDSCO' || v === 'KR' || v === 'MFDS' || v === 'SG' || v === 'HSA') {
    return REGION_TO_CTD[v] ?? REGION_TO_CTD[v.substring(0, 2)] ?? 'FDA';
  }
  // Try resolving as a registry ID (e.g. 'CA_NDS' → region 'CA' → 'FDA')
  const entry = resolveToRegistryEntry(v);
  if (entry) return REGION_TO_CTD[entry.region] ?? 'FDA';
  return 'FDA';
}

// ── Module 1 — regional administrative (per region) ────────────────────────────

const M1_FDA: CtdSectionDef[] = [
  // FDA eCTD Module 1 Specification v2.3 headings — the same list the packager
  // derives its us-regional.xml elements from (controlled-vocab/cv-v4-data.ts).
  // Held to that list by tests/regulatory/fda-module1-numbering.test.ts.
  { code: '1.1', title: 'Forms (FDA 356h, 1571/1572, 3674)', required: true, regulatoryRef: 'FDA eCTD M1 v2.3' },
  { code: '1.2', title: 'Cover letter', required: true, aiDraftable: true },
  {
    code: '1.3',
    title: 'Administrative information',
    required: true,
    children: [
      { code: '1.3.1', title: 'Contact / sponsor / applicant information (changes of address, agent, sponsor, ownership)', required: false },
      { code: '1.3.3', title: 'Debarment certification (marketing applications)', required: false },
      { code: '1.3.4', title: 'Financial certification and disclosure (3454/3455)', required: true },
      { code: '1.3.5', title: 'Patent information, patent certification, exclusivity claim', required: false },
    ],
  },
  {
    code: '1.4',
    title: 'References',
    required: false,
    children: [
      { code: '1.4.1', title: 'Letters of authorization (cross-reference)', required: false },
      { code: '1.4.2', title: 'Statements of right of reference', required: false },
    ],
  },
  { code: '1.5', title: 'Application status (withdrawal, inactivation, reactivation, reinstatement)', required: false },
  { code: '1.6', title: 'Meeting materials (pre-IND / pre-NDA / Type B-C)', required: false, aiDraftable: true },
  { code: '1.9', title: 'Pediatric administrative information (PSP, waivers, deferrals)', required: false },
  { code: '1.11', title: 'Information amendment: information not covered under Modules 2 to 5', required: false },
  {
    code: '1.12',
    title: 'Other correspondence',
    required: false,
    children: [
      { code: '1.12.1', title: 'Pre-IND correspondence', required: false },
      { code: '1.12.14', title: 'Environmental analysis / claim of categorical exclusion', required: true, aiDraftable: true },
    ],
  },
  { code: '1.13', title: 'Annual report', required: false, aiDraftable: true },
  {
    code: '1.14',
    title: 'Labeling',
    required: true,
    aiDraftable: true,
    children: [
      { code: '1.14.1', title: 'Draft labeling (proposed / annotated PI, Medication Guide, carton and container)', required: false, aiDraftable: true },
      { code: '1.14.4.1', title: "Investigator's brochure (IND)", required: false, aiDraftable: true },
      { code: '1.14.4.2', title: 'Investigational drug labeling (IND)', required: false },
    ],
  },
  { code: '1.20', title: 'Introductory statement and general investigational plan (initial IND)', required: false, aiDraftable: true, regulatoryRef: '21 CFR 312.23(a)(3)' },
];

const M1_EMA: CtdSectionDef[] = [
  { code: '1.0', title: 'Cover letter', required: true, aiDraftable: true },
  { code: '1.1', title: 'Comprehensive table of contents', required: true },
  { code: '1.2', title: 'Application form', required: true, regulatoryRef: 'NtA Vol 2B, EU Module 1' },
  {
    code: '1.3',
    title: 'Product information',
    required: true,
    children: [
      { code: '1.3.1', title: 'SmPC, labelling and package leaflet', required: true, aiDraftable: true },
      { code: '1.3.2', title: 'Mock-ups and specimens', required: false },
      { code: '1.3.4', title: 'Consultation with target patient groups', required: false },
    ],
  },
  { code: '1.4', title: 'Information about the experts (Quality / Nonclinical / Clinical)', required: true },
  { code: '1.5', title: 'Specific requirements (orphan, conditional, exceptional)', required: false },
  { code: '1.6', title: 'Environmental risk assessment', required: false },
  {
    code: '1.8',
    title: 'Pharmacovigilance',
    required: true,
    children: [
      { code: '1.8.1', title: 'Pharmacovigilance system master file summary', required: true },
      { code: '1.8.2', title: 'Risk management plan (RMP)', required: true, aiDraftable: true },
    ],
  },
  { code: '1.10', title: 'Paediatrics (PIP / waiver / deferral)', required: false },
];

const M1_PMDA: CtdSectionDef[] = [
  { code: '1.1', title: 'Application form (承認申請書 / 様式)', required: true, regulatoryRef: 'PMDA J-CTD Module 1' },
  { code: '1.2', title: 'Certificates (GMP / GCP compliance)', required: true },
  { code: '1.3', title: 'Patent status (特許状況)', required: false },
  { code: '1.4', title: 'Origin or background of discovery (起原又は発見の経緯)', required: true, aiDraftable: true },
  { code: '1.5', title: 'Status of use in foreign countries (外国における使用状況)', required: true },
  { code: '1.6', title: 'List of similar drugs (同種同効品一覧)', required: false },
  { code: '1.7', title: 'Package insert draft (添付文書(案))', required: true, aiDraftable: true },
  { code: '1.8', title: 'Post-marketing surveillance basic plan (GPSP)', required: true },
  { code: '1.9', title: 'Risk management plan (J-RMP)', required: true, aiDraftable: true },
];

const M1_BY_REGION: Record<CtdRegion, CtdSectionDef[]> = {
  FDA: M1_FDA,
  EMA: M1_EMA,
  PMDA: M1_PMDA,
};

// ── Module 2 — CTD summaries (ICH-common) ──────────────────────────────────────

const M2_SECTIONS: CtdSectionDef[] = [
  { code: '2.1', title: 'CTD table of contents', required: true },
  { code: '2.2', title: 'CTD introduction', required: true, aiDraftable: true },
  { code: '2.3', title: 'Quality overall summary (QOS)', required: true, aiDraftable: true, sourceModules: [3], regulatoryRef: 'ICH M4Q' },
  { code: '2.4', title: 'Nonclinical overview', required: true, aiDraftable: true, sourceModules: [4], regulatoryRef: 'ICH M4S' },
  { code: '2.5', title: 'Clinical overview', required: true, aiDraftable: true, sourceModules: [5], regulatoryRef: 'ICH M4E' },
  {
    code: '2.6',
    title: 'Nonclinical written and tabulated summaries',
    required: true,
    aiDraftable: true,
    sourceModules: [4],
    children: [
      { code: '2.6.1', title: 'Introduction', required: true },
      { code: '2.6.2', title: 'Pharmacology written summary', required: true, sourceModules: [4] },
      { code: '2.6.3', title: 'Pharmacology tabulated summary', required: true, sourceModules: [4] },
      { code: '2.6.4', title: 'Pharmacokinetics written summary', required: true, sourceModules: [4] },
      { code: '2.6.6', title: 'Toxicology written summary', required: true, sourceModules: [4] },
    ],
  },
  {
    code: '2.7',
    title: 'Clinical summary',
    required: true,
    aiDraftable: true,
    sourceModules: [5],
    children: [
      { code: '2.7.1', title: 'Summary of biopharmaceutic studies', required: true, sourceModules: [5] },
      { code: '2.7.2', title: 'Summary of clinical pharmacology studies', required: true, sourceModules: [5] },
      { code: '2.7.3', title: 'Summary of clinical efficacy', required: true, sourceModules: [5] },
      { code: '2.7.4', title: 'Summary of clinical safety', required: true, sourceModules: [5] },
    ],
  },
];

// ── Public structure accessors ─────────────────────────────────────────────────

export function getModule1Structure(region: CtdRegion): CtdSectionDef[] {
  return M1_BY_REGION[region];
}

export function getModule2Structure(): CtdSectionDef[] {
  return M2_SECTIONS;
}

export interface CtdModuleHome {
  region: CtdRegion;
  module1: CtdSectionDef[];
  module2: CtdSectionDef[];
}

export function getCtdModuleHome(region: CtdRegion): CtdModuleHome {
  return { region, module1: getModule1Structure(region), module2: M2_SECTIONS };
}

// ── Build-state derivation (pure) ──────────────────────────────────────────────

export interface SectionStatusRow {
  /** section_key from c2c_document_sections, e.g. 'm2.3' | '2.3' | '3.2.S'. */
  section_key: string;
  status: string;
}

/** Normalize a section key for matching: lowercase, drop a leading 'm', trim. */
function normKey(key: string): string {
  return key.trim().toLowerCase().replace(/^m/, '');
}

const APPROVED_STATUSES = new Set(['approved', 'locked']);
const VALID_STATUSES = new Set(['todo', 'drafted', 'review', 'approved', 'locked']);

function coerceStatus(raw: string | undefined): SectionStatus {
  if (!raw) return 'not_started';
  const v = raw.toLowerCase();
  return (VALID_STATUSES.has(v) ? v : 'not_started') as SectionStatus;
}

/** Fraction (0..1) of a module's sections that are approved/locked, from all rows. */
function moduleReadiness(moduleNumber: number, rows: SectionStatusRow[]): number {
  const inModule = rows.filter((r) => normKey(r.section_key).startsWith(`${moduleNumber}`) || normKey(r.section_key).startsWith(`${moduleNumber}.`));
  if (inModule.length === 0) return 0;
  const done = inModule.filter((r) => APPROVED_STATUSES.has(r.status.toLowerCase())).length;
  return done / inModule.length;
}

/**
 * Annotate a module's section tree with per-section status from the section
 * store, and (for M2 summaries) the readiness of the upstream source module(s).
 *
 * @param sections the module structure (M1 region or M2)
 * @param allRows  ALL of the program's section rows (any module) — needed so M2
 *                 upstream readiness can read the M3/M4/M5 sections.
 */
export function annotateModuleBuildState(
  module: 1 | 2,
  region: CtdRegion | null,
  sections: CtdSectionDef[],
  allRows: SectionStatusRow[],
): ModuleBuildState {
  const byKey = new Map<string, string>();
  for (const r of allRows) byKey.set(normKey(r.section_key), r.status);

  let total = 0;
  let notStarted = 0;
  let inProgress = 0;
  let approved = 0;

  const annotate = (def: CtdSectionDef): CtdSectionState => {
    const status = coerceStatus(byKey.get(normKey(def.code)));
    total += 1;
    if (status === 'not_started') notStarted += 1;
    else if (APPROVED_STATUSES.has(status)) approved += 1;
    else inProgress += 1;

    let upstreamReadyPercent: number | undefined;
    let upstreamReady: boolean | undefined;
    if (def.sourceModules && def.sourceModules.length) {
      const pcts = def.sourceModules.map((m) => moduleReadiness(m, allRows));
      upstreamReadyPercent = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      upstreamReady = upstreamReadyPercent >= 0.8; // upstream substantially approved
    }

    const { children, ...rest } = def;
    return {
      ...rest,
      status,
      upstreamReadyPercent,
      upstreamReady,
      children: children?.map(annotate),
    };
  };

  const annotated = sections.map(annotate);

  return {
    module,
    region,
    sections: annotated,
    summary: {
      total,
      notStarted,
      inProgress,
      approved,
      readinessPercent: total === 0 ? 0 : Math.round((approved / total) * 100),
    },
  };
}
