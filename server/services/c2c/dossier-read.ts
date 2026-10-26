/**
 * The project's dossier, read once: how much of each filing is approved, per
 * market and per module (docs/design/FILING_SPINE.md F23).
 *
 * ── What it replaces ──────────────────────────────────────────────────────────
 * Project home showed two figures for one dossier, from two reads that
 * disagreed:
 *   - "Dossier readiness" (readinessByProject): approved or locked over every
 *     section of every document of the project, home and added markets pooled,
 *     so adding EMA's MAA lowered an FDA filing's figure;
 *   - "Module completion" (GET /:id/workstreams): a weighted mean (approved
 *     100, review 75, drafted 50, locked 0) grouped by the text before the
 *     first dot, so "M1" and "1.1" were two modules, every section in review
 *     read 75% beside a 0% header, and every section locked read 100% beside a
 *     0% module.
 * Both now come from here, with one definition of complete.
 *
 * ── Definitions ───────────────────────────────────────────────────────────────
 *   - Complete: C2C_SECTION_COMPLETE_STATUSES (approved, locked), the set the
 *     c2c_documents.readiness trigger uses. In review and drafted are counted
 *     beside it and never weighted into it.
 *   - Home: the project's documents with filing_scope 'home' (read through
 *     to_jsonb, so a database before 20261015e reads every document as home).
 *     The header, the Projects card and the detail read show this figure; a
 *     market added to the project is measured on its own line and cannot move it.
 *   - An added market (filing_scope 'market', F22) holds its Module 1 and
 *     3.2.R; its common modules are the home filing's. Its figure counts the
 *     home sections outside Module 1 and 3.2.R plus its own regional sections,
 *     so the M3 heading its subtree carries is not counted twice. The market
 *     pack's mandatory sections the home filing does not hold are named beside
 *     it (`notHeld`, the outline's gaps) and never enter the denominator.
 *     With two or more home applications the common modules cannot be
 *     attributed to one market, and the market says so instead of a figure.
 *   - Rows: an application's sections grouped by CTD module (the first
 *     segment of normalizeCtdCode, so "M1" and "1.1" are Module 1); a filing
 *     document class (a CSR, an IB, a PAS) is one row, because its "1"…"5"
 *     are its own headings, not CTD modules.
 *   - A figure with nothing to count is 'no_sections', never 0. A store this
 *     environment has not provisioned (42P01, 42703) is 'unavailable', with the
 *     reason. Any other failure throws: the route answers 500 and the screen
 *     says the read failed. Never a measured-looking 0.
 *
 * Numbers are counted here; nothing is estimated.
 *
 * @module server/services/c2c/dossier-read
 */
import { C2C_SECTION_COMPLETE_STATUSES, markCountedSections } from './section-content.js';
import { readDocumentOutline } from './document-outline.js';
import { isRegionalSectionKey } from '../../../shared/regulatory/filing-scope.js';
import { compareSectionCode, normalizeCtdCode } from '../../../shared/regulatory/section-code.js';
import { filingDocumentClassOf } from '../../../shared/regulatory/filing-document-classes.js';
import { readDossierArtifactReadiness } from './dossier-artifact-read';
import type { ArtifactReadiness } from '../../../shared/types/dossier-artifact-readiness';
import { readProjectSectionTracking } from '../dossier/dossier-map-view-assembler';
import type { DossierSectionTracking } from '../../../shared/types/dossier-section-tracking';
import { ProgramReadAccessError, requireCurrentProgramAccess, type CurrentProgramAccess } from './current-program-access';

interface Queryable { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }

export type DossierFigure =
  | { state: 'measured'; pct: number; counted: number; complete: number }
  | { state: 'no_sections'; pct: null }
  | { state: 'unavailable'; pct: null; reason: string };

export interface DossierCounts {
  counted: number;
  complete: number;
  inReview: number;
  drafted: number;
}

export interface DossierRow extends DossierCounts {
  /** 'module': an application's CTD module; 'document': a filing document class, one row. */
  group: 'module' | 'document';
  /** The CTD module ('1'…'5'), or null for a document row or keys that are not CTD codes. */
  module: string | null;
  /** The market the row belongs to (an added market's regional rows), or null for the home filing. */
  agency: string | null;
  label: string;
  documentId: string;
  figure: DossierFigure;
  lastUpdated: string | null;
  /** Only the governed sections included in this row's counts, in filing order. */
  sections: Array<{ key: string; label: string; status: string }>;
}

export interface DossierMarket {
  scope: 'home' | 'market';
  agency: string;
  docType: string;
  documentId: string;
  figure: DossierFigure;
  /** The market pack's mandatory sections the home filing does not hold; null when not read. */
  notHeld: Array<{ key: string; label: string }> | null;
}

export interface DossierRead {
  projectId: string;
  measuredAt: string;
  /** The home filing: the header, the card and the detail read. */
  home: DossierFigure;
  markets: DossierMarket[];
  rows: DossierRow[];
  artifactReadiness?: ArtifactReadiness;
  supportingReadiness?: DossierSupportingReadiness;
}

export interface DossierSupportingReadiness {
  sectionTracking: DossierSectionTracking;
}

async function requireSupportingScopeCurrent(db: Queryable, organizationId: number, access: CurrentProgramAccess): Promise<void> {
  const current = await requireCurrentProgramAccess(db, { organizationId, userId: access.actor.userId, programId: access.programId });
  if (current.programId !== access.programId || current.projectId !== access.projectId || current.clientWorkspaceId !== access.clientWorkspaceId ||
      current.actor.userId !== access.actor.userId || current.actor.role !== access.actor.role) {
    throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_CHANGED', 'Current project access changed during the read. No project data was supplied.');
  }
}

/** One read of each source, bound to and revalidated against the accepted mapping. */
export async function readDossierSupporting(db: Queryable, organizationId: number, access: CurrentProgramAccess): Promise<DossierSupportingReadiness & { artifactReadiness: ArtifactReadiness }> {
  await requireSupportingScopeCurrent(db, organizationId, access);
  const artifactReadiness = await readDossierArtifactReadiness(db, organizationId, access.projectId, access);
  const sectionTracking = await readProjectSectionTracking(db, organizationId, access.projectId, access);
  await requireSupportingScopeCurrent(db, organizationId, access);
  return { artifactReadiness, sectionTracking };
}

const UNPROVISIONED = new Set(['42P01', '42703']);
const UNPROVISIONED_REASON = 'The governed section store is not provisioned in this environment.';
const TWO_HOMES_REASON = (n: number) =>
  `The project has ${n} home filings, so the common modules cannot be attributed to one market.`;

interface SectionRow {
  document_id: string;
  doc_type: string;
  agency: string;
  title: string | null;
  filing_scope: string;
  section_key: string;
  parent_key: string | null;
  label: string | null;
  status: string;
  updated_at: string | Date | null;
  /** Whether readiness counts it: false for a heading that holds other
   *  sections (markCountedSections, the trigger's rule). Required, so a row
   *  that did not pass through the read cannot be counted by default. */
  counted: boolean;
}

const isUnprovisioned = (err: unknown) => UNPROVISIONED.has(String((err as { code?: string })?.code ?? ''));

function figureOf(c: DossierCounts): DossierFigure {
  if (c.counted === 0) return { state: 'no_sections', pct: null };
  return { state: 'measured', pct: Math.round((100 * c.complete) / c.counted), counted: c.counted, complete: c.complete };
}

function emptyCounts(): DossierCounts {
  return { counted: 0, complete: 0, inReview: 0, drafted: 0 };
}

/** Count one section, unless it is a heading that holds other sections:
 *  those are never approved, and the trigger does not count them (F23 8/9). */
function add(c: DossierCounts, s: SectionRow): void {
  if (!s.counted) return;
  c.counted += 1;
  if (C2C_SECTION_COMPLETE_STATUSES.has(s.status)) c.complete += 1;
  else if (s.status === 'review') c.inReview += 1;
  else if (s.status === 'drafted') c.drafted += 1;
}

/** The CTD module a section key belongs to ('M1' and '1.1' are '1'), or null. */
export function ctdModuleOfKey(key: string): string | null {
  const code = normalizeCtdCode(key);
  return code ? code.split('.')[0] : null;
}

const iso = (v: string | Date | null): string | null => (v == null ? null : new Date(v).toISOString());
const later = (a: string | null, b: string | null) => (a == null ? b : b == null ? a : a > b ? a : b);

/** The same counted rows as the figure, without bodies or a second read.
 *  Normalize M-prefixed CTD keys for ordering, while preserving their stored
 *  spelling in the response. Non-CTD filing outlines retain their own keys. */
function countedSections(rows: readonly SectionRow[]): DossierRow['sections'] {
  return rows.filter((s) => s.counted)
    .sort((a, b) => compareSectionCode(normalizeCtdCode(a.section_key) ?? a.section_key, normalizeCtdCode(b.section_key) ?? b.section_key))
    .map((s) => ({ key: s.section_key, label: s.label?.trim() || s.section_key, status: s.status }));
}

/** Whether a document is an application (a CTD filing) rather than a filing document class. */
const isApplication = (docType: string) => filingDocumentClassOf(docType) == null;

/** The one read: every governed section of the projects, with its document.
 *  Exported for tests/schema-contract/c2c-section-timestamps, which plans it
 *  against the real migration. */
export const DOSSIER_SECTIONS_SQL = `SELECT d.project_id::text AS project_id, d.id AS document_id, d.doc_type, d.agency, d.title,
            COALESCE(to_jsonb(d)->>'filing_scope', 'home') AS filing_scope,
            s.section_key, s.parent_key, s.label, s.status, s.updated_at
       FROM c2c_documents d
       JOIN c2c_document_sections s ON s.document_id = d.id
      WHERE d.project_id = ANY($1::uuid[]) AND d.org_id = $2`;

async function readSections(db: Queryable, orgId: number, projectIds: string[]): Promise<Array<SectionRow & { project_id: string }>> {
  const { rows } = await db.query(DOSSIER_SECTIONS_SQL, [projectIds, orgId]);
  return markCountedSections(rows as Array<Omit<SectionRow, 'counted'> & { project_id: string }>);
}

/** The home filing's figure from one project's rows. */
function homeFigure(rows: SectionRow[]): DossierFigure {
  const c = emptyCounts();
  for (const r of rows) if (r.filing_scope !== 'market') add(c, r);
  return figureOf(c);
}

/**
 * The home filing's figure for each project, for the Projects list, the
 * detail read and a create's response. A project with no governed sections is
 * 'no_sections'; an unprovisioned store makes every figure 'unavailable'; any
 * other failure throws. The result is keyed by the ids as given; they are
 * matched to the rows case-insensitively, because Postgres prints a uuid in
 * lower case and a URL may not (an upper-case id read 'no_sections' for a
 * program with sections: review of e6058e4126).
 */
export async function readDossierFigures(db: Queryable, orgId: number, projectIds: string[]): Promise<Map<string, DossierFigure>> {
  const out = new Map<string, DossierFigure>();
  if (projectIds.length === 0) return out;
  let rows: Array<SectionRow & { project_id: string }>;
  try {
    rows = await readSections(db, orgId, projectIds);
  } catch (err) {
    if (!isUnprovisioned(err)) throw err;
    for (const id of projectIds) out.set(id, { state: 'unavailable', pct: null, reason: UNPROVISIONED_REASON });
    return out;
  }
  const byProject = new Map<string, SectionRow[]>();
  for (const r of rows) {
    const key = String(r.project_id).toLowerCase();
    const list = byProject.get(key) ?? [];
    list.push(r);
    byProject.set(key, list);
  }
  for (const id of projectIds) out.set(id, homeFigure(byProject.get(id.toLowerCase()) ?? []));
  return out;
}

interface DocGroup {
  id: string; docType: string; agency: string; title: string | null; scope: 'home' | 'market'; sections: SectionRow[];
}

function groupDocuments(rows: SectionRow[]): DocGroup[] {
  const docs = new Map<string, DocGroup>();
  for (const r of rows) {
    const d = docs.get(r.document_id) ?? {
      id: r.document_id, docType: r.doc_type, agency: r.agency, title: r.title,
      scope: r.filing_scope === 'market' ? 'market' : 'home', sections: [],
    } as DocGroup;
    d.sections.push(r);
    docs.set(r.document_id, d);
  }
  return [...docs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * An application document's sections, one row per part of its outline: a CTD
 * module (the first segment of normalizeCtdCode, so "M1" and "1.1" are one
 * Module 1), or for a pack whose keys are not CTD codes (a 510(k)'s "A",
 * "A1"…) its top-level heading. Each row is named by the pack's own label for
 * that heading, as the scaffold stored it ("Module 1 · Administrative (US)"),
 * never by a second list of module names.
 */
function moduleRows(doc: DocGroup, keep: (key: string) => boolean, agency: string | null): DossierRow[] {
  const byKey = new Map(doc.sections.map((s) => [s.section_key, s]));
  const rootOf = (key: string): string => {
    let k = key;
    for (let i = 0; i < 32; i += 1) {
      const parent = byKey.get(k)?.parent_key;
      if (!parent || !byKey.has(parent)) return k;
      k = parent;
    }
    return k;
  };
  const groups = new Map<string, { module: string | null; heading: string; order: string; c: DossierCounts; last: string | null; sections: SectionRow[] }>();
  for (const s of doc.sections) {
    if (!keep(s.section_key)) continue;
    const module = ctdModuleOfKey(s.section_key);
    const heading = module ? `M${module}` : rootOf(s.section_key);
    const id = module ? `ctd:${module}` : `root:${heading}`;
    const g = groups.get(id) ?? { module, heading, order: module ?? `~${heading}`, c: emptyCounts(), last: null, sections: [] as SectionRow[] };
    add(g.c, s);
    g.sections.push(s);
    g.last = later(g.last, iso(s.updated_at));
    groups.set(id, g);
  }
  const market = agency ? ` · ${agency.toUpperCase()} ${doc.docType.toUpperCase()}` : '';
  return [...groups.values()]
    .sort((a, b) => compareSectionCode(a.order, b.order))
    .map((g) => ({
      group: 'module' as const, module: g.module, agency, documentId: doc.id,
      label: (byKey.get(g.heading)?.label?.trim() || (g.module ? `Module ${g.module}` : g.heading)) + market,
      ...g.c, figure: figureOf(g.c), lastUpdated: g.last, sections: countedSections(g.sections),
    }));
}

/** A filing document class: one row for the whole document. */
function documentRow(doc: DocGroup): DossierRow {
  const c = emptyCounts();
  let last: string | null = null;
  for (const s of doc.sections) {
    add(c, s);
    last = later(last, iso(s.updated_at));
  }
  const cls = filingDocumentClassOf(doc.docType);
  return {
    group: 'document', module: null, agency: null, documentId: doc.id,
    label: cls?.label ?? doc.title ?? doc.docType, ...c, figure: figureOf(c), lastUpdated: last,
    sections: countedSections(doc.sections),
  };
}

/** Each market's line: a home application's own figure, and an added market's
 *  common modules plus its own regional part, with the sections it lacks. */
async function dossierMarkets(db: Queryable, orgId: number, homeApps: DocGroup[], marketDocs: DocGroup[]): Promise<DossierMarket[]> {
  const homeCommon = homeApps.flatMap((d) => d.sections.filter((s) => !isRegionalSectionKey(s.section_key)));
  const markets: DossierMarket[] = homeApps.map((d) => {
    const c = emptyCounts();
    for (const s of d.sections) add(c, s);
    return { scope: 'home', agency: d.agency, docType: d.docType, documentId: d.id, figure: figureOf(c), notHeld: [] };
  });
  for (const d of marketDocs) {
    let figure: DossierFigure;
    if (homeApps.length > 1) {
      figure = { state: 'unavailable', pct: null, reason: TWO_HOMES_REASON(homeApps.length) };
    } else {
      const c = emptyCounts();
      for (const s of homeCommon) add(c, s);
      for (const s of d.sections) if (isRegionalSectionKey(s.section_key)) add(c, s);
      figure = figureOf(c);
    }
    const outline = await readDocumentOutline(db, orgId, d.id);
    markets.push({ scope: 'market', agency: d.agency, docType: d.docType, documentId: d.id, figure, notHeld: outline ? outline.gaps : null });
  }
  return markets;
}

/**
 * One project's dossier. Throws on any failure other than an unprovisioned
 * store, which answers every figure 'unavailable' with the reason.
 */
export async function readDossier(db: Queryable, orgId: number, projectId: string): Promise<DossierRead> {
  const measuredAt = new Date().toISOString();
  let rows: SectionRow[];
  try {
    rows = await readSections(db, orgId, [projectId]);
  } catch (err) {
    if (!isUnprovisioned(err)) throw err;
    const unavailable: DossierFigure = { state: 'unavailable', pct: null, reason: UNPROVISIONED_REASON };
    return { projectId, measuredAt, home: unavailable, markets: [], rows: [] };
  }

  const docs = groupDocuments(rows);
  const homeApps = docs.filter((d) => d.scope === 'home' && isApplication(d.docType));
  const marketDocs = docs.filter((d) => d.scope === 'market');
  const markets = await dossierMarkets(db, orgId, homeApps, marketDocs);
  const out: DossierRow[] = [];
  for (const d of homeApps) out.push(...moduleRows(d, () => true, null));
  for (const d of marketDocs) out.push(...moduleRows(d, isRegionalSectionKey, d.agency));
  for (const d of docs) if (d.scope === 'home' && !isApplication(d.docType)) out.push(documentRow(d));

  return { projectId, measuredAt, home: homeFigure(rows), markets, rows: out };
}
