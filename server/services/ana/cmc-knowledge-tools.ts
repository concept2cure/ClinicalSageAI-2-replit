/**
 * AnA's read-only tools over the cited CMC regulatory record
 * (server/services/cmc/knowledge):
 *
 *   find_cmc_guidance    — which documents govern a CMC question, in which
 *                          version, with status and date as of the record;
 *   get_cmc_requirements — what an authority requires of the quality part of a
 *                          clinical-trial or marketing application, by phase,
 *                          CTD section and modality, each tied to its source,
 *                          and how that authority receives the quality dossier;
 *   explain_cmc_topic    — the science behind a requirement, with the
 *                          guidelines and peer-reviewed literature that support
 *                          it (PMID / PMCID / DOI).
 *
 * The CMC engines (shelf life, poolability, impurity classification,
 * specifications) compute; these tools say what the rules ARE. Both are
 * deterministic: nothing here asks a model for a fact, and a question the
 * record does not index is answered as not indexed, with the instruction not
 * to supply it from memory. Every result fits RESULT_BUDGET serialized, and no
 * result has a top-level `status`.
 *
 * Handlers are registered through the injected `register`, so this module
 * imports only types from the executor and adds no import cycle.
 *
 * @module server/services/ana/cmc-knowledge-tools
 */

import type { AnaTool } from '../ai-gateway/types';
import type { RegisterFn } from './document-tools-shared.js';
import {
  CMC_RECORD,
  citeSource,
  findCmcGuidance,
  findCmcNotes,
  findCmcPathways,
  findCmcRequirements,
  getCmcSource,
  resolveAuthorities,
  type CmcRequirement,
} from '../cmc/knowledge/index.js';

/** The most any one result may weigh, serialized. */
export const CMC_RESULT_BUDGET = 5000;

const NOT_INDEXED =
  'Not indexed in the platform’s CMC regulatory record. Say so, name what you would need to check, and do not supply ' +
  'the requirement, version or date from memory.';

const AUTHORITY_HELP =
  'Authorities: ICH, FDA (US), EMA/EC (EU), MHRA (UK), Swissmedic, PMDA/MHLW (Japan), MFDS (Korea), NMPA (China), ' +
  'Health Canada, TGA (Australia), ANVISA (Brazil), CDSCO (India), HSA (Singapore), WHO, PIC/S.';

export const FIND_CMC_GUIDANCE: AnaTool = {
  name: 'find_cmc_guidance',
  description:
    'Which official documents govern a CMC / quality question, from the platform’s cited regulatory record: ICH Q1–Q14, ' +
    'Q3A–E, Q5A–E, Q6A/B, M4Q and M7, FDA regulations and CMC guidances for INDs and NDAs/BLAs, the EU CTR and EMA ' +
    'IMP quality guidelines, MHRA, Swissmedic, PMDA/MHLW, MFDS, NMPA/CDE, Health Canada, TGA, ANVISA, CDSCO, HSA, WHO ' +
    'and PIC/S. Each result carries the official code, title, status (final, draft, superseded, withdrawn) and date as ' +
    'of the record, what replaced it, and its URL. Use it for "what is the current version of Q2", "which guidance ' +
    'covers nitrosamines", "is the consolidated ICH Q1 final", and before citing any guideline. Pass `query` (a code ' +
    'or topic) and optionally `authority`.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A guideline code ("Q5A", "M7", "312.23") or a topic ("extractables and leachables").' },
      authority: { type: 'string', description: 'Optional authority: FDA, EMA, PMDA, NMPA, Health Canada, ...' },
    },
    required: ['query'],
  },
};

export const GET_CMC_REQUIREMENTS: AnaTool = {
  name: 'get_cmc_requirements',
  description:
    'What a regulatory authority requires of the CMC / quality part of an application, from the platform’s cited ' +
    'record, filtered by any of: `authority` (FDA, EMA, PMDA, NMPA, Health Canada, TGA, MHRA, ...), `application_type` ' +
    '(clinical_trial or marketing), `phase` ("1", "2-3", "marketing"), `ctd_section` ("3.2.S.4", "3.2.P.8.3"), ' +
    '`modality` (small_molecule, biologic, atmp, vaccine) and `topic` (free text: "stability for a phase 1 IND", ' +
    '"viral safety"). Each requirement is tied to the documents that state it, with their status and date, and a ' +
    'confidence. With an authority, it also returns how that authority receives the quality dossier (IND, IMPD under ' +
    'the EU CTR, Japan CTN, China IND, Canada CTA with QOS-CE, ...): legal basis, format, how expectations scale with ' +
    'phase, GMP for the investigational product, and regional specifics. ICH requirements are included as the ' +
    'harmonised baseline. Call it before advising what a Module 3, IMPD or quality section must contain for a market, ' +
    'and state what it returns rather than recalling requirements.',
  input_schema: {
    type: 'object',
    properties: {
      authority: { type: 'string' },
      application_type: { type: 'string', enum: ['clinical_trial', 'marketing', 'post_approval', 'gmp'] },
      phase: { type: 'string' },
      ctd_section: { type: 'string' },
      modality: { type: 'string', enum: ['small_molecule', 'biologic', 'atmp', 'vaccine'] },
      topic: { type: 'string' },
    },
    required: [],
  },
};

export const EXPLAIN_CMC_TOPIC: AnaTool = {
  name: 'explain_cmc_topic',
  description:
    'The science and regulatory reasoning behind a CMC question, from the platform’s record of knowledge notes: what ' +
    'is expected and why, the key points, the deficiencies agencies and the literature report, and the citations — ' +
    'official guidelines and peer-reviewed articles or industry white papers by PMID, PMCID or DOI. Use it for "how ' +
    'are impurity limits justified for a phase 1 drug substance", "what stability supports a 12-month clinical shelf ' +
    'life", "how is potency assay validation phased for a gene therapy", "what does Q14 change for method ' +
    'validation". Pass `query`, and optionally `ctd_section` and `modality`. Cite what it returns.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      ctd_section: { type: 'string' },
      modality: { type: 'string', enum: ['small_molecule', 'biologic', 'atmp', 'vaccine'] },
    },
    required: ['query'],
  },
};

export const CMC_KNOWLEDGE_TOOLS: AnaTool[] = [FIND_CMC_GUIDANCE, GET_CMC_REQUIREMENTS, EXPLAIN_CMC_TOPIC];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** A long field cut at a word boundary, and said to be cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40))} …`;
}

/** Serialize, dropping trailing items until the result fits the budget. */
function fit(result: Record<string, unknown>, listKey: string): string {
  let out = JSON.stringify(result);
  const list = result[listKey];
  if (!Array.isArray(list)) return out;
  const items = [...list];
  while (out.length > CMC_RESULT_BUDGET && items.length > 0) {
    items.pop();
    out = JSON.stringify({ ...result, [listKey]: items, shown: `${items.length} of ${list.length}; narrow the question for the rest` });
  }
  return out;
}

const RECORD_NOTE = `Record as of ${CMC_RECORD.asOf}. Cite the code and date; say "draft" for a draft and "low confidence" where the record says so.`;

// ── find_cmc_guidance ────────────────────────────────────────────────────────

export function cmcGuidance(input: Record<string, unknown>): string {
  const query = str(input.query);
  const authority = str(input.authority);
  if (!query) return JSON.stringify({ error: 'Pass `query`: a guideline code or a topic.' });
  if (authority && resolveAuthorities(authority)?.length === 0) {
    return JSON.stringify({ error: `No authority "${authority}" in the record. ${AUTHORITY_HELP}` });
  }
  const { matches, total } = findCmcGuidance(query, authority || undefined);
  if (matches.length === 0) return JSON.stringify({ found: 0, note: NOT_INDEXED });
  return fit(
    {
      found: total,
      documents: matches.map((s) => ({
        cite: citeSource(s),
        title: s.title,
        kind: s.kind,
        applies_to: s.applicationTypes.join(', '),
        ctd: s.ctdSections.slice(0, 6).join(', ') || undefined,
        scope: clip(s.scope, 280),
        url: s.url,
        confidence: s.confidence,
        uncertain: s.uncertainty || undefined,
      })),
      record: RECORD_NOTE,
    },
    'documents',
  );
}

// ── get_cmc_requirements ─────────────────────────────────────────────────────

function renderRequirement(r: CmcRequirement): Record<string, unknown> {
  return {
    authority: r.authority,
    applies: `${r.applicationType}; ${r.phase}; ${r.modality}`,
    ctd: r.ctdSections.join(', ') || undefined,
    requirement: clip(r.statement, 600),
    sources: r.sourceIds.map((id) => getCmcSource(id)).filter(Boolean).map((s) => citeSource(s!)),
    confidence: r.confidence,
  };
}

export function cmcRequirements(input: Record<string, unknown>): string {
  const authority = str(input.authority);
  if (authority && resolveAuthorities(authority)?.length === 0) {
    return JSON.stringify({ error: `No authority "${authority}" in the record. ${AUTHORITY_HELP}` });
  }
  const query = {
    authority: authority || undefined,
    applicationType: str(input.application_type) || undefined,
    phase: str(input.phase) || undefined,
    ctdSection: str(input.ctd_section) || undefined,
    modality: str(input.modality) || undefined,
    topic: str(input.topic) || undefined,
  };
  const { matches, total } = findCmcRequirements(query);
  const pathways = authority ? findCmcPathways(authority, query.applicationType) : [];
  if (matches.length === 0 && pathways.length === 0) return JSON.stringify({ found: 0, note: NOT_INDEXED });
  return fit(
    {
      found: total,
      other_pathways: pathways.length > 1 ? pathways.slice(1).map((p) => clip(p.applicationName, 120)) : undefined,
      pathway: pathways.length
        ? pathways.slice(0, 1).map((p) => ({
            authority: p.authority,
            application: clip(p.applicationName, 160),
            legal_basis: clip(p.legalBasis, 280),
            quality_dossier: clip(p.qualityDossierFormat, 360),
            by_phase: clip(p.phaseAppropriate, 360),
            gmp_for_ip: clip(p.gmpForInvestigationalProduct, 280),
            regional: clip(p.regionalSpecifics, 360),
            language: clip(p.language, 120),
            sources: p.sourceIds.slice(0, 5).map((id) => getCmcSource(id)).filter(Boolean).map((s) => citeSource(s!)),
            confidence: p.confidence,
          }))
        : undefined,
      requirements: matches.map(renderRequirement),
      record: RECORD_NOTE,
    },
    'requirements',
  );
}

// ── explain_cmc_topic ────────────────────────────────────────────────────────

export function cmcTopic(input: Record<string, unknown>): string {
  const query = str(input.query);
  if (!query) return JSON.stringify({ error: 'Pass `query`: the CMC question.' });
  const { matches, total } = findCmcNotes(query, {
    ctdSection: str(input.ctd_section) || undefined,
    modality: str(input.modality) || undefined,
  });
  if (matches.length === 0) return JSON.stringify({ found: 0, note: NOT_INDEXED });
  return fit(
    {
      found: total,
      notes: matches.map((n) => ({
        topic: n.topic,
        applies: `${n.jurisdictions.join(', ')}; ${n.phase}; ${n.modality}`,
        ctd: n.ctdSections.join(', ') || undefined,
        summary: clip(n.summary, 900),
        key_points: n.keyPoints.slice(0, 6).map((k) => clip(k, 240)),
        common_deficiencies: n.commonDeficiencies.slice(0, 4),
        cite: n.citations.map((c) => `${c.id} — ${c.title} (${c.year})`),
        confidence: n.confidence,
      })),
      record: RECORD_NOTE,
    },
    'notes',
  );
}

// ── registration ─────────────────────────────────────────────────────────────

/** Register the three handlers on the executor's registry (or a test's). */
export function registerCmcKnowledgeHandlers(register: RegisterFn): void {
  register('find_cmc_guidance', async (input) => cmcGuidance(input ?? {}));
  register('get_cmc_requirements', async (input) => cmcRequirements(input ?? {}));
  register('explain_cmc_topic', async (input) => cmcTopic(input ?? {}));
}
