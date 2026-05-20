/**
 * Template validator — conformance scoring for a draft against a template.
 *
 * Given a draft (the section content we've authored so far) and a template
 * id, walk the template's section schema and check:
 *   1. Every `required` section is present (by section_code or by title).
 *   2. Present sections respect min/max word counts.
 *   3. Required phrases appear; forbidden phrases don't.
 *   4. Required elements (from the section's `required_elements` array) are
 *      mentioned somewhere in the body.
 *
 * The output is a structured violations list + a conformance score in [0,1]
 * that the UI surfaces alongside the predictive CRL/RTF score. Recurring
 * violations from this validator can be promoted into `failure_patterns`
 * via the standard learning loop so AnA's next draft self-corrects.
 *
 * The validator is intentionally LLM-free — pure string/token matching.
 * Misses are converted into hints; the AnA-failure-learning corrections
 * surface the LLM-side fix once a pattern accumulates.
 *
 * @module server/services/intelligence/template-validator
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import { getTemplateById, type DocumentTemplate, type TemplateSection } from './template-registry.js';

const log = createScopedLogger('template-validator');

export const VALIDATOR_VERSION = '1.0.0';

// ─── Public types ────────────────────────────────────────────────────────────

export interface DraftSection {
  /** Section code or title that identifies which template section this is. */
  readonly identifier: string;
  /** Free-text body of the section. May be empty. */
  readonly body: string;
}

export interface DraftInput {
  readonly templateId: string;
  readonly sections: readonly DraftSection[];
  readonly organizationId: number;
  readonly projectId?: number;
  readonly artifactId?: string;
}

export type ViolationRule =
  | 'min_words'
  | 'max_words'
  | 'forbidden_phrase'
  | 'missing_required_phrase'
  | 'missing_required_element';

export interface Violation {
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly rule: ViolationRule;
  readonly message: string;
}

export interface MissingSection {
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly criticality: TemplateSection['criticality'];
}

export interface WeakSection {
  readonly sectionCode: string;
  readonly sectionTitle: string;
  readonly wordCount: number;
  readonly minWords: number;
}

export interface ValidationResult {
  readonly templateId: string;
  readonly templateName: string;
  readonly conformanceScore: number; // 0..1
  readonly missingRequired: readonly MissingSection[];
  readonly missingOptional: readonly MissingSection[];
  readonly weakSections: readonly WeakSection[];
  readonly violations: readonly Violation[];
  readonly sectionsEvaluated: number;
  readonly validatorVersion: string;
}

// ─── Pure logic (testable without DB) ────────────────────────────────────────

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function wordCount(text: string): number {
  if (!text) return 0;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

/**
 * Match a draft section to a template section. We accept either an exact
 * section_code match or a case-insensitive title-includes match — drafters
 * often label sections by title rather than CTD code.
 */
export function findDraftForSection(
  draft: readonly DraftSection[],
  templateSection: TemplateSection,
): DraftSection | null {
  for (const d of draft) {
    if (d.identifier === templateSection.sectionCode) return d;
  }
  const normalizedTitle = normalizeForMatch(templateSection.sectionTitle);
  for (const d of draft) {
    if (normalizeForMatch(d.identifier) === normalizedTitle) return d;
  }
  // Looser title-contains match — last resort, helps when drafts label
  // "2.5 Clinical Overview" instead of just "2.5".
  for (const d of draft) {
    if (normalizeForMatch(d.identifier).includes(normalizedTitle) && normalizedTitle.length >= 6) {
      return d;
    }
  }
  return null;
}

export function validateSectionBody(
  templateSection: TemplateSection,
  body: string,
): Violation[] {
  const violations: Violation[] = [];
  const normalized = normalizeForMatch(body);
  const wc = wordCount(body);

  if (templateSection.minWords != null && wc > 0 && wc < templateSection.minWords) {
    violations.push({
      sectionCode: templateSection.sectionCode,
      sectionTitle: templateSection.sectionTitle,
      rule: 'min_words',
      message: `Section has ${wc} words; template requires at least ${templateSection.minWords}.`,
    });
  }
  if (templateSection.maxWords != null && wc > templateSection.maxWords) {
    violations.push({
      sectionCode: templateSection.sectionCode,
      sectionTitle: templateSection.sectionTitle,
      rule: 'max_words',
      message: `Section has ${wc} words; template recommends at most ${templateSection.maxWords}.`,
    });
  }
  for (const phrase of templateSection.forbiddenPhrases) {
    if (normalized.includes(normalizeForMatch(phrase))) {
      violations.push({
        sectionCode: templateSection.sectionCode,
        sectionTitle: templateSection.sectionTitle,
        rule: 'forbidden_phrase',
        message: `Contains forbidden phrase: "${phrase}".`,
      });
    }
  }
  for (const phrase of templateSection.requiredPhrases) {
    if (!normalized.includes(normalizeForMatch(phrase))) {
      violations.push({
        sectionCode: templateSection.sectionCode,
        sectionTitle: templateSection.sectionTitle,
        rule: 'missing_required_phrase',
        message: `Missing required phrase: "${phrase}".`,
      });
    }
  }
  for (const element of templateSection.requiredElements) {
    if (!normalized.includes(normalizeForMatch(element))) {
      violations.push({
        sectionCode: templateSection.sectionCode,
        sectionTitle: templateSection.sectionTitle,
        rule: 'missing_required_element',
        message: `Missing required element: "${element}".`,
      });
    }
  }
  return violations;
}

/**
 * Compute the conformance score from the validation outcome. We weight
 * blocking-missing higher than important-missing, and important-missing
 * higher than violations. Word-count warnings are mild.
 */
export function computeConformanceScore(params: {
  missingRequired: readonly MissingSection[];
  weakSections: readonly WeakSection[];
  violations: readonly Violation[];
  totalSections: number;
}): number {
  if (params.totalSections === 0) return 0;
  let score = 1.0;
  for (const m of params.missingRequired) {
    score -= m.criticality === 'blocking' ? 0.15 : m.criticality === 'important' ? 0.07 : 0.02;
  }
  for (const _ of params.weakSections) score -= 0.02;
  for (const v of params.violations) {
    score -= v.rule === 'missing_required_element' ? 0.04
      : v.rule === 'forbidden_phrase' ? 0.03
      : v.rule === 'missing_required_phrase' ? 0.03
      : 0.01;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Pure runner — evaluate a draft against the loaded template. Used by both
 * the DB-backed entry point and the test suite.
 */
export function evaluate(template: DocumentTemplate, draft: readonly DraftSection[]): Omit<ValidationResult, 'templateId' | 'templateName' | 'validatorVersion'> {
  const missingRequired: MissingSection[] = [];
  const missingOptional: MissingSection[] = [];
  const weakSections: WeakSection[] = [];
  const violations: Violation[] = [];

  for (const ts of template.sections) {
    const draftSec = findDraftForSection(draft, ts);
    if (!draftSec || !draftSec.body.trim()) {
      const missing: MissingSection = {
        sectionCode: ts.sectionCode,
        sectionTitle: ts.sectionTitle,
        criticality: ts.criticality,
      };
      if (ts.required) missingRequired.push(missing);
      else missingOptional.push(missing);
      continue;
    }
    const wc = wordCount(draftSec.body);
    if (ts.minWords != null && wc < ts.minWords) {
      weakSections.push({
        sectionCode: ts.sectionCode,
        sectionTitle: ts.sectionTitle,
        wordCount: wc,
        minWords: ts.minWords,
      });
    }
    violations.push(...validateSectionBody(ts, draftSec.body));
  }

  const conformanceScore = computeConformanceScore({
    missingRequired,
    weakSections,
    violations,
    totalSections: template.sections.length,
  });

  return {
    conformanceScore,
    missingRequired,
    missingOptional,
    weakSections,
    violations,
    sectionsEvaluated: template.sections.length,
  };
}

// ─── DB-backed entry point ───────────────────────────────────────────────────

export async function validateDraft(input: DraftInput): Promise<ValidationResult> {
  const template = await getTemplateById(input.templateId);
  if (!template) {
    throw new Error(`Template not found: ${input.templateId}`);
  }
  const inner = evaluate(template, input.sections);
  const result: ValidationResult = {
    templateId: template.id,
    templateName: template.templateName,
    validatorVersion: VALIDATOR_VERSION,
    ...inner,
  };

  // Persist for calibration and learning. Fire-and-forget; failures here
  // don't break the score.
  try {
    await pool.query(
      `INSERT INTO intelligence.template_validations (
         organization_id, project_id, artifact_id, template_id,
         conformance_score, missing_required, weak_sections, violations,
         validator_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.organizationId,
        input.projectId ?? null,
        input.artifactId ?? null,
        template.id,
        result.conformanceScore,
        JSON.stringify(result.missingRequired),
        JSON.stringify(result.weakSections),
        JSON.stringify(result.violations),
        VALIDATOR_VERSION,
      ],
    );
  } catch (err) {
    log.warn('Failed to persist template validation:', err instanceof Error ? err.message : err);
  }

  return result;
}
