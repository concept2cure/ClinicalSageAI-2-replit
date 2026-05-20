/**
 * Document template registry — the canonical "which template?" service.
 *
 * AnA must produce documents that match the right template for the right
 * agency and the right submission. A protocol for an FDA IND is not the
 * same shape as a protocol filed with PMDA; a Module 3 CMC for EMA is not
 * the same as the FDA version of the same module. This registry holds the
 * agency-specific section schemas + formatting rules so the generation
 * path consults a structured template instead of inferring the shape from
 * the LLM each turn.
 *
 * Resolution order (most-specific → least-specific):
 *   1. exact (agency, document_type, submission_type, indication_area)
 *   2. (agency, document_type, submission_type), any indication
 *   3. (agency, document_type), any submission_type
 *   4. cross_agency variant of (document_type, submission_type)
 *   5. cross_agency variant of (document_type), any submission_type
 *
 * @module server/services/intelligence/template-registry
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  binAgencyForInteraction,
  binDocumentType,
  type Agency,
  type DocumentType,
} from './ana-failure-learning.js';

const log = createScopedLogger('template-registry');

export const TEMPLATE_REGISTRY_VERSION = '1.0.0';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TemplateSection {
  readonly id: string;
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly ordering: number;
  readonly required: boolean;
  readonly criticality: 'blocking' | 'important' | 'supporting';
  readonly contentGuidance: string | null;
  readonly requiredElements: readonly string[];
  readonly citationRules: Record<string, unknown>;
  readonly agencyQuirks: string | null;
  readonly minWords: number | null;
  readonly maxWords: number | null;
  readonly forbiddenPhrases: readonly string[];
  readonly requiredPhrases: readonly string[];
}

export interface DocumentTemplate {
  readonly id: string;
  readonly templateCode: string;
  readonly templateName: string;
  readonly version: string;
  readonly agency: Agency | 'cross_agency';
  readonly documentType: DocumentType;
  readonly submissionType: string | null;
  readonly indicationArea: string | null;
  readonly modulePath: string | null;
  readonly baseTemplateId: string | null;
  readonly description: string | null;
  readonly formattingRules: Record<string, unknown>;
  readonly agencySpecificNotes: string | null;
  readonly sourceReference: string | null;
  readonly status: 'active' | 'deprecated' | 'draft';
  readonly lastVerifiedAt: string | null;
  readonly sections: readonly TemplateSection[];
}

export interface TemplateLookup {
  readonly agency: string;
  readonly documentType: string;
  readonly submissionType?: string | null;
  readonly indicationArea?: string | null;
}

export interface TemplateLookupResult {
  readonly template: DocumentTemplate | null;
  readonly matchSpecificity:
    | 'exact'
    | 'no_indication'
    | 'no_submission_type'
    | 'cross_agency_with_submission'
    | 'cross_agency'
    | 'none';
}

// ─── Pure helpers (testable) ─────────────────────────────────────────────────

/**
 * Build the ordered fallback chain for a lookup. The chain is deterministic
 * so callers can reason about what got matched.
 */
export function buildLookupChain(query: TemplateLookup): Array<{
  agency: string | null;
  submissionType: string | null;
  indicationArea: string | null;
  tag: TemplateLookupResult['matchSpecificity'];
}> {
  const agency = binAgencyForInteraction(query.agency);
  const sType = query.submissionType ?? null;
  const ind = query.indicationArea ?? null;
  return [
    { agency, submissionType: sType, indicationArea: ind, tag: 'exact' },
    { agency, submissionType: sType, indicationArea: null, tag: 'no_indication' },
    { agency, submissionType: null, indicationArea: null, tag: 'no_submission_type' },
    { agency: 'cross_agency', submissionType: sType, indicationArea: null, tag: 'cross_agency_with_submission' },
    { agency: 'cross_agency', submissionType: null, indicationArea: null, tag: 'cross_agency' },
  ];
}

// ─── DB-backed read path ─────────────────────────────────────────────────────

async function fetchSections(templateId: string): Promise<TemplateSection[]> {
  const result = await pool.query(
    `SELECT id, section_code, section_title, ordering, required, criticality,
            content_guidance, required_elements, citation_rules, agency_quirks,
            min_words, max_words, forbidden_phrases, required_phrases
       FROM intelligence.template_sections
      WHERE template_id = $1
      ORDER BY ordering ASC`,
    [templateId],
  );
  return result.rows.map(r => ({
    id: r.id,
    sectionCode: r.section_code,
    sectionTitle: r.section_title,
    ordering: r.ordering,
    required: r.required,
    criticality: r.criticality,
    contentGuidance: r.content_guidance,
    requiredElements: Array.isArray(r.required_elements) ? r.required_elements : [],
    citationRules: r.citation_rules || {},
    agencyQuirks: r.agency_quirks,
    minWords: r.min_words,
    maxWords: r.max_words,
    forbiddenPhrases: Array.isArray(r.forbidden_phrases) ? r.forbidden_phrases : [],
    requiredPhrases: Array.isArray(r.required_phrases) ? r.required_phrases : [],
  }));
}

function mapRow(r: Record<string, unknown>): Omit<DocumentTemplate, 'sections'> {
  return {
    id: r.id as string,
    templateCode: r.template_code as string,
    templateName: r.template_name as string,
    version: r.version as string,
    agency: r.agency as Agency | 'cross_agency',
    documentType: r.document_type as DocumentType,
    submissionType: (r.submission_type as string | null) ?? null,
    indicationArea: (r.indication_area as string | null) ?? null,
    modulePath: (r.module_path as string | null) ?? null,
    baseTemplateId: (r.base_template_id as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    formattingRules: (r.formatting_rules as Record<string, unknown>) || {},
    agencySpecificNotes: (r.agency_specific_notes as string | null) ?? null,
    sourceReference: (r.source_reference as string | null) ?? null,
    status: r.status as 'active' | 'deprecated' | 'draft',
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at as string).toISOString() : null,
  };
}

/**
 * Resolve the best matching template for a context. Walks the fallback chain
 * defined by `buildLookupChain` and returns the first hit along with a tag
 * indicating how specific the match was.
 */
export async function resolveTemplate(query: TemplateLookup): Promise<TemplateLookupResult> {
  const documentType = binDocumentType(query.documentType);
  const chain = buildLookupChain(query);

  for (const link of chain) {
    const result = await pool.query(
      `SELECT * FROM intelligence.document_templates
        WHERE status = 'active'
          AND document_type = $1
          AND agency = $2
          AND ($3::text IS NULL AND submission_type IS NULL OR submission_type = $3)
          AND ($4::text IS NULL AND indication_area IS NULL OR indication_area = $4)
        ORDER BY version DESC
        LIMIT 1`,
      [documentType, link.agency, link.submissionType, link.indicationArea],
    );
    if (result.rows.length > 0) {
      const base = mapRow(result.rows[0]);
      const sections = await fetchSections(base.id);
      return {
        template: { ...base, sections },
        matchSpecificity: link.tag,
      };
    }
  }
  return { template: null, matchSpecificity: 'none' };
}

/**
 * Return a single template by id (including its sections).
 */
export async function getTemplateById(templateId: string): Promise<DocumentTemplate | null> {
  const result = await pool.query(
    `SELECT * FROM intelligence.document_templates WHERE id = $1`,
    [templateId],
  );
  if (result.rows.length === 0) return null;
  const base = mapRow(result.rows[0]);
  const sections = await fetchSections(base.id);
  return { ...base, sections };
}

/**
 * Directory listing. All filters are optional.
 */
export async function listTemplates(filter: {
  agency?: string;
  documentType?: string;
  submissionType?: string;
  status?: 'active' | 'deprecated' | 'draft';
} = {}): Promise<Array<Omit<DocumentTemplate, 'sections'>>> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (filter.agency) {
    params.push(binAgencyForInteraction(filter.agency));
    where.push(`agency = $${params.length}`);
  }
  if (filter.documentType) {
    params.push(binDocumentType(filter.documentType));
    where.push(`document_type = $${params.length}`);
  }
  if (filter.submissionType) {
    params.push(filter.submissionType);
    where.push(`submission_type = $${params.length}`);
  }
  params.push(filter.status ?? 'active');
  where.push(`status = $${params.length}`);

  const result = await pool.query(
    `SELECT * FROM intelligence.document_templates
      WHERE ${where.join(' AND ')}
      ORDER BY agency, document_type, submission_type NULLS FIRST, template_code`,
    params,
  );
  return result.rows.map(mapRow);
}

/**
 * Cross-agency diff: for a given (document_type, submission_type), return the
 * union of section codes across every agency's variant, plus a per-agency
 * presence vector. Lets the UI render a side-by-side "what's required where".
 */
export async function compareAcrossAgencies(query: {
  documentType: string;
  submissionType?: string | null;
}): Promise<{
  documentType: DocumentType;
  submissionType: string | null;
  agencies: Array<{ agency: string; templateId: string | null }>;
  sections: Array<{
    sectionCode: string;
    sectionTitle: string;
    presentByAgency: Record<string, boolean>;
    requiredByAgency: Record<string, boolean>;
  }>;
}> {
  const documentType = binDocumentType(query.documentType);
  const sType = query.submissionType ?? null;

  const result = await pool.query(
    `SELECT dt.id, dt.agency, ts.section_code, ts.section_title, ts.required, ts.ordering
       FROM intelligence.document_templates dt
       JOIN intelligence.template_sections ts ON ts.template_id = dt.id
      WHERE dt.status = 'active'
        AND dt.document_type = $1
        AND ($2::text IS NULL AND dt.submission_type IS NULL OR dt.submission_type = $2)
      ORDER BY dt.agency, ts.ordering`,
    [documentType, sType],
  );

  const agencyMap = new Map<string, string>();
  const sectionMap = new Map<string, {
    sectionCode: string;
    sectionTitle: string;
    presentByAgency: Record<string, boolean>;
    requiredByAgency: Record<string, boolean>;
    minOrdering: number;
  }>();

  for (const r of result.rows) {
    agencyMap.set(r.agency, r.id);
    let entry = sectionMap.get(r.section_code);
    if (!entry) {
      entry = {
        sectionCode: r.section_code,
        sectionTitle: r.section_title,
        presentByAgency: {},
        requiredByAgency: {},
        minOrdering: r.ordering,
      };
      sectionMap.set(r.section_code, entry);
    }
    entry.presentByAgency[r.agency] = true;
    entry.requiredByAgency[r.agency] = !!r.required;
    if (r.ordering < entry.minOrdering) entry.minOrdering = r.ordering;
  }

  const sortedSections = Array.from(sectionMap.values())
    .sort((a, b) => a.minOrdering - b.minOrdering)
    .map(({ minOrdering: _omit, ...rest }) => rest);

  return {
    documentType,
    submissionType: sType,
    agencies: Array.from(agencyMap.entries()).map(([agency, templateId]) => ({ agency, templateId })),
    sections: sortedSections,
  };
}
