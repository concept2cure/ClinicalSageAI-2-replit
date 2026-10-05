/**
 * AnA's read-only tools over the platform's regulatory knowledge.
 *
 *   get_document_section_requirements — what a CTD section, a document type
 *       (NDA, ISS, DSUR, ...) or an ICH E3 clinical study report heading must
 *       contain, where it comes from, what reviewers find wrong, and the basis;
 *   plan_submission_from_database_lock — the sequence from database lock to a
 *       filed application, and where the open project stands on it, read from
 *       what its Vault records;
 *   list_fda_technical_rules — FDA's published PDF, eCTD and study-data rules,
 *       what missing each costs, and whether the platform checks it today.
 *
 * ── Why these exist ──────────────────────────────────────────────────────────
 * The platform's deepest regulatory knowledge — the CTD authoring overlay, the
 * lifecycle document types — was reachable by no AnA tool: only the IND section
 * registry and one IND route read it (D2 survey, 2026-10-04). AnA drafted from
 * prompt tables that had drifted from it. These tools put the canonical record
 * in front of her, and the record says how strongly each statement is
 * evidenced, so she can tell a client what FDA requires from what the platform
 * recommends.
 *
 * ── Rules these tools keep ───────────────────────────────────────────────────
 *   - Deterministic: every answer is read from server/services/ind/ctd; nothing
 *     here asks a model for a fact, a verdict or a figure.
 *   - The program comes from the conversation (resolveOpenProgram), never from
 *     input. With no open project the plan still answers, without a standing.
 *   - A failed read is said to have failed. A step the Vault cannot hold is
 *     `not_visible`, never `not_found`, and never done.
 *   - Every result fits RESULT_BUDGET serialized (see authoring-read-tools.ts
 *     "Size": results over 8000 characters are cut before the model reads
 *     them), and no result has a top-level `status`.
 *
 * Handlers are registered through the injected `register`, so this module
 * imports only types from the executor and adds no import cycle.
 *
 * @module server/services/ana/regulatory-knowledge-tools
 */

import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RegisterFn } from './document-tools-shared.js';
import { resolveOpenProgram } from '../c2c/program-access';
import { createScopedLogger } from '../../utils/logger';
import {
  ELSA_NOTE,
  SUBMISSION_CHAIN,
  evaluateChain,
  getChainNode,
  resolveRequirements,
  rulesByArea,
  type ChainNode,
  type ChainVerdict,
  type RequirementSource,
  type VaultSectionFact,
} from '../ind/ctd/index.js';

const logger = createScopedLogger('regulatory-knowledge-tools');

/** The most any one result may weigh, serialized. */
export const RESULT_BUDGET = 5000;
/** Vault rows read for a standing; one more than this means the read was cut short. */
export const VAULT_FACTS_MAX = 5000;

export const GET_DOCUMENT_SECTION_REQUIREMENTS: AnaTool = {
  name: 'get_document_section_requirements',
  description:
    'What a regulatory document or section must contain, from the platform’s canonical guidance: the content a ' +
    'complete section carries, the tables and data reviewers expect, where the data usually come from, the common ' +
    'deficiencies that draw information requests or refuse-to-file, what to read it with, and the basis of each ' +
    'statement (a checked FDA/ICH text, ICH recall, or platform practice). Pass a CTD section code ("2.7.3", ' +
    '"2.5", "3.2.P.5", "1.14.4.1", "5.3.5.3"), a document type ("nda", "bla", "iss", "ise", "ind_initial", "dsur", ' +
    '"pre_nda_meeting", "nda_bla_annual_report"), or "csr" with an ICH E3 heading in `section` ("12.2", "16.1.9"; ' +
    'omit for the outline). Call it before drafting or reviewing a CSR, a Module 2 summary or overview, a Module 3 ' +
    'section or an application component, and state its requirements rather than recalling them.',
  input_schema: {
    type: 'object',
    properties: {
      document: { type: 'string', description: 'A CTD section code, a document type id, or "csr".' },
      section: { type: 'string', description: 'With document "csr": the ICH E3 heading number. Omit for the outline.' },
    },
    required: ['document'],
  },
};

export const PLAN_SUBMISSION_FROM_DATABASE_LOCK: AnaTool = {
  name: 'plan_submission_from_database_lock',
  description:
    'The sequence from study close-out and database lock to a filed NDA or BLA, and where the open project stands ' +
    'on it: SAP final → database lock → SDTM (TS, DM, define.xml, reviewer’s guide) → ADaM (ADSL) → tables, listings ' +
    'and figures → clinical study reports → integrated datasets → ISS and ISE (5.3.5.3) → 2.7.x summaries → 2.5 ' +
    'Clinical Overview → labeling → eCTD assembly → technical validation → transmission. Each step names what it ' +
    'produces, what it is written from, where it is filed, the check it must pass, and what FDA checks on receipt. ' +
    'With a project open, each step’s state is read from the project’s Vault (filed, proposed, not found, or not ' +
    'visible to the platform), with what is next, what is blocked and on what, and anything filed ahead of its ' +
    'sources. Documents are matched by the kind the Vault recorded and their title, so a SAP or protocol is never ' +
    'counted as a CSR; a CSR held at 5.3.5 or in Module 5 without a section is listed under unspecific_placement ' +
    '(seen, not filed), and a Module 2 summary or ISS/ISE filed where its kind does not go is listed as misfiled ' +
    'with the section expected. Pass `step` (for example "csr", "ise", "m2_7_3") for one step in full. Use it for "what happens after ' +
    'database lock", "what is next for the submission", "what is blocking 2.7.3", or organising the data room.',
  input_schema: {
    type: 'object',
    properties: {
      step: { type: 'string', description: 'A step id from the plan, for its full detail. Omit for the whole plan.' },
    },
    required: [],
  },
};

export const LIST_FDA_TECHNICAL_RULES: AnaTool = {
  name: 'list_fda_technical_rules',
  description:
    'FDA’s published technical rules for what a reviewer receives — PDF (version, no security, embedded fonts, ' +
    'bookmarks and hyperlinked table of contents, text searchable rather than scanned images), eCTD (relative ' +
    'hyperlinks, file and path naming, granularity), study data (TS dataset, DM, ADSL and define.xml, XPORT v5, ' +
    'reviewer’s guides — the technical rejection criteria), and content (ISS/ISE placement, CRFs for deaths and ' +
    'adverse-event withdrawals, Module 2 length, refuse-to-file) — each with what missing it costs, its source, and ' +
    'whether this platform checks it today. Also what FDA has said about Elsa, its AI review assistant. Use it for ' +
    '"will this pass FDA technical validation", "is our dossier ready for Elsa", "what are FDA’s PDF requirements", ' +
    'or "why would the gateway reject this". Pass `area` (pdf, ectd, study-data, content, labeling) for one area in full; labeling holds the PLR format rules for a US Prescribing Information.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: ['pdf', 'ectd', 'study-data', 'content', 'labeling'], description: 'One area in full. Omit for every rule in brief.' },
    },
    required: [],
  },
};

export const REGULATORY_KNOWLEDGE_TOOLS: AnaTool[] = [
  GET_DOCUMENT_SECTION_REQUIREMENTS,
  PLAN_SUBMISSION_FROM_DATABASE_LOCK,
  LIST_FDA_TECHNICAL_RULES,
];

// ── get_document_section_requirements ───────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The tool's name for the record that answered. */
const KIND_LABEL: Record<RequirementSource['kind'], string> = {
  outline: 'ICH E3 clinical study report',
  'ctd-section': 'CTD section',
  lifecycle: 'document type',
};

/**
 * The tool's answer: a thin wrapper over resolveRequirements
 * (server/services/ind/ctd/requirements-resolver.ts), which holds the routing.
 * This function only checks the input and shapes the JSON.
 */
export function documentSectionRequirements(input: Record<string, unknown>): string {
  const document = str(input.document);
  if (!document) {
    return JSON.stringify({ error: 'get_document_section_requirements needs `document`: a CTD section code, a document type id, or "csr".' });
  }
  const answer = resolveRequirements({ document, section: str(input.section) });
  if (answer.kind === 'not_indexed') {
    return JSON.stringify({
      not_indexed: true,
      message: answer.reason,
      ...(answer.indexedDocuments ? { document_types: answer.indexedDocuments } : {}),
    });
  }
  if (answer.kind === 'candidates') {
    // No route returns candidates yet. Every reading is listed; none is picked.
    return JSON.stringify({
      not_indexed: true,
      message: `"${document}" matches more than one entry; name the one meant.`,
      candidates: answer.candidates.map((c) => c.title),
    });
  }
  return JSON.stringify({
    kind: KIND_LABEL[answer.source.kind],
    requirements: answer.requirements,
    note: 'Reference structure from the platform’s canonical guidance; the sponsor owns every conclusion. Statements marked as recall or platform practice are not a regulator’s text.',
  });
}

// ── plan_submission_from_database_lock ──────────────────────────────────────

export interface KnowledgeQueryable { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> }
type PoolSource = () => KnowledgeQueryable | Promise<KnowledgeQueryable>;
const appPool: PoolSource = async () => (await import('../../db.js')).getPool();

/** A Vault document the plan reads, with the id a reader opens it by. */
export interface VaultDocumentFact extends VaultSectionFact {
  /** vault.documents.id: what loadDocumentForOrg takes to read the text. */
  id: string;
}

/**
 * The open program's live Vault documents at the CTD sections the plan reads,
 * scoped by organization and program in the statement itself, with the folder
 * and evidence kind the filing classifiers wrote and the document id. A
 * document the Vault holds in Module 5 with no section (a declared CSR upload)
 * is read too: before 2026-10-05 the statement required a section, so such a
 * CSR was invisible.
 *
 * This is the one statement. readVaultFacts is this read without the id, so a
 * tool that opens the documents (the dossier reconciler) reads exactly the
 * documents the submission plan counts — never a second, drifting query.
 * Throws when the read fails; a failed read is never an empty Vault.
 */
export async function readVaultDocuments(
  pool: KnowledgeQueryable,
  organizationId: number,
  programId: string,
): Promise<{ documents: VaultDocumentFact[]; truncated: boolean }> {
  const { rows } = await pool.query(
    `SELECT d.id, d.ctd_section, d.folder_id, d.evidence_kind, d.placement_status, d.document_title
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
      WHERE d.program_id = $2
        AND d.deleted_at IS NULL
        AND (
          (d.ctd_section IS NOT NULL
            AND (d.ctd_section LIKE '2.%' OR d.ctd_section LIKE '5.%' OR d.ctd_section LIKE '1.14%'))
          OR (d.ctd_section IS NULL AND d.folder_id = 'module-5')
        )
      LIMIT $3`,
    [organizationId, programId, VAULT_FACTS_MAX + 1],
  );
  const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
  const documents = (rows as Array<Record<string, unknown>>).slice(0, VAULT_FACTS_MAX).map((r) => ({
    id: String(r.id ?? ''),
    ctdSection: text(r.ctd_section),
    folderId: text(r.folder_id),
    evidenceKind: text(r.evidence_kind),
    placementStatus: String(r.placement_status ?? ''),
    title: String(r.document_title ?? ''),
  }));
  return { documents, truncated: rows.length > VAULT_FACTS_MAX };
}

/** The plan's facts: readVaultDocuments without the id. */
export async function readVaultFacts(
  pool: KnowledgeQueryable,
  organizationId: number,
  programId: string,
): Promise<{ facts: VaultSectionFact[]; truncated: boolean }> {
  const { documents, truncated } = await readVaultDocuments(pool, organizationId, programId);
  const facts = documents.map((d): VaultSectionFact => ({
    ctdSection: d.ctdSection, folderId: d.folderId, evidenceKind: d.evidenceKind, placementStatus: d.placementStatus, title: d.title,
  }));
  return { facts, truncated };
}

/** What the platform reads as this step done, in words. */
function platformSees(node: ChainNode): string {
  const e = node.evidence;
  if (e.kind !== 'vault') return e.why;
  const identified = e.kinds || e.titlePattern
    ? `a document identified as a ${node.title.toLowerCase()} by ${e.kinds ? 'the kind the Vault recorded or ' : ''}its title`
    : 'a document';
  return [
    `${identified}, filed at ${e.sections.join(', ')}`,
    e.unspecific ? `one at ${e.unspecific.sections.join(', ')} or in ${e.unspecific.folders.join(', ')} without a section counts as suggested, never filed` : '',
    e.misfiledPattern ? 'one titled as this step but filed where it does not go is reported as misfiled' : '',
  ].filter(Boolean).join('; ');
}

function stepDetail(id: string): string {
  const node = getChainNode(id);
  if (!node) {
    return JSON.stringify({ error: `No step "${id}" in the plan.`, steps: SUBMISSION_CHAIN.map((n) => n.id) });
  }
  return JSON.stringify({
    step: {
      id: node.id, title: node.title, stage: node.stage, scope: node.scope, produces: node.produces,
      written_from: node.dependsOn, filed_under: node.files ?? [], gate: node.gate, fda_checks: node.reviewerChecks ?? [],
      basis: node.basis.map((b) => `${b.ref} (${b.confidence}${b.url ? `, ${b.url}` : ''})`),
      platform_sees: platformSees(node),
    },
  });
}

/** Placement lines listed in a standing; the rest are counted, so the result stays in budget. */
const PLACEMENT_LINES_MAX = 3;
const TITLE_MAX = 60;

function capped(lines: string[]): string[] {
  if (lines.length <= PLACEMENT_LINES_MAX) return lines;
  return [...lines.slice(0, PLACEMENT_LINES_MAX), `and ${lines.length - PLACEMENT_LINES_MAX} more`];
}

const shortTitle = (t: string): string => (t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t);

function compactStanding(v: ChainVerdict, truncated: boolean): Record<string, unknown> {
  const states: Record<string, string> = {};
  for (const n of v.nodes) states[n.id] = n.documents ? `${n.state} (${n.documents})` : n.state;
  return {
    states,
    next: v.next.map((n) => (n.assumes.length ? `${n.id} (assumes ${n.assumes.join(', ')} done; not visible here)` : n.id)),
    blocked: v.blocked.map((b) => `${b.id} waits on ${b.waitsOn.join(', ')}`),
    filed_ahead_of_sources: v.filedAheadOfSources.map((f) => `${f.id} is filed but ${f.missing.join(', ')} is not`),
    misfiled: capped(v.misfiled.map((m) => `"${shortTitle(m.title)}" is filed at ${m.filedAt}; it goes at ${m.expected.join(' or ')} (${m.basis.ref})`)),
    unspecific_placement: capped(v.unspecificPlacement.map((u) => `${u.step}: "${shortTitle(u.document)}" is at ${u.filedAt}; it needs its leaf (${u.expected.join(', ')}) before packaging`)),
    ...(v.placementNotes.length ? { placement_notes: capped(v.placementNotes.map((p) => `"${shortTitle(p.document)}" at ${p.filedAt}: ${p.note}`)) } : {}),
    ...(truncated ? { incomplete: `More than ${VAULT_FACTS_MAX} documents at these sections; "not_found" may be wrong — say so.` } : {}),
  };
}

const PLAN_LINES = SUBMISSION_CHAIN.map((n) => `${n.id}: ${n.title} ← ${n.dependsOn.length ? n.dependsOn.join(', ') : 'start'}${n.files?.length ? ` [${n.files.join(', ')}]` : ''}`);

async function submissionPlan(poolOf: PoolSource, input: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const step = str(input.step);
  if (step) return stepDetail(step);
  const base = {
    plan: PLAN_LINES,
    legend: 'id: step ← what it is written from [where it is filed]. Pass step=<id> for one step in full.',
  };
  if (!ctx?.organizationId) {
    return JSON.stringify({ ...base, standing: null, standing_note: 'No organization in context, so no project standing.' });
  }
  try {
    const pool = await poolOf();
    const programId = await resolveOpenProgram(pool, {
      organizationId: ctx.organizationId, projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null,
    });
    if (!programId) {
      return JSON.stringify({ ...base, standing: null, standing_note: 'No project is open, so no standing. Open a project to see where it stands.' });
    }
    const { facts, truncated } = await readVaultFacts(pool, Number(ctx.organizationId), programId);
    let verdict = evaluateChain(facts);
    if (truncated) {
      verdict = { ...verdict, nodes: verdict.nodes.map((n) => (n.state === 'not_found' ? { ...n, state: 'not_visible' as const, why: 'The Vault read was cut short.' } : n)) };
    }
    return JSON.stringify({ ...base, standing: compactStanding(verdict, truncated) });
  } catch (err) {
    // The driver's message names tables; it goes to the log. The model is told
    // the read failed, never that the steps are missing.
    logger.error('plan_submission_from_database_lock failed', { err: err instanceof Error ? err.message : String(err) });
    return JSON.stringify({ ...base, standing: null, standing_error: 'The project’s Vault could not be read just now. Say so; do not report any step as missing.' });
  }
}

// ── list_fda_technical_rules ────────────────────────────────────────────────

export function fdaTechnicalRules(input: Record<string, unknown>): string {
  const area = str(input.area).toLowerCase();
  const rules = rulesByArea(area || null);
  if (area && rules.length === 0) {
    return JSON.stringify({ error: `No area "${area}". Areas: pdf, ectd, study-data, content, labeling.` });
  }
  const full = Boolean(area);
  return JSON.stringify({
    rules: rules.map((r) => full
      ? { id: r.id, rule: r.rule, if_missed: r.consequence, source: r.basis.ref, url: r.basis.url, platform: r.platform.check, platform_note: r.platform.note }
      : { id: r.id, area: r.area, rule: r.rule, platform: r.platform.check }),
    elsa: full ? undefined : { checked: ELSA_NOTE.checked, guidance: ELSA_NOTE.guidance, facts: ELSA_NOTE.facts.map((f) => f.url) },
    note: full ? undefined : 'Pass area for each rule’s consequence, source and what the platform checks.',
  });
}

// ── registration ─────────────────────────────────────────────────────────────

/** Register the three handlers on the executor's registry (or a test's). */
export function registerRegulatoryKnowledgeHandlers(register: RegisterFn, options: { pool?: PoolSource } = {}): void {
  const poolOf = options.pool ?? appPool;
  register('get_document_section_requirements', async (input) => documentSectionRequirements(input ?? {}));
  register('plan_submission_from_database_lock', async (input, ctx) => submissionPlan(poolOf, input ?? {}, ctx));
  register('list_fda_technical_rules', async (input) => fdaTechnicalRules(input ?? {}));
}
