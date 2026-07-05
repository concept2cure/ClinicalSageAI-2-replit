/**
 * Writing-quality tools — expose the deterministic Writing Precision Gate
 * (server/services/ana/writing-precision-gate.ts) to AnA.
 *
 * `critique_draft` runs every medical-writing checker over a draft in one pass
 * and returns a precision score, a pass/revise verdict, and an ordered revision
 * brief. It is the machine-checkable gate behind precise long-form writing: AnA
 * drafts, critiques with this tool, and revises against the brief until it
 * passes — closing the draft→critique→revise loop that the checkers alone
 * couldn't. Pure/deterministic — no DB, no org context.
 *
 * @module server/services/ana/writingQualityTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const CRITIQUE_DRAFT: AnaTool = {
  name: 'critique_draft',
  description:
    "Critique a draft for scientific-writing precision and return an actionable revision brief — the deterministic quality gate behind long-form medical writing. Runs, in one pass: quantitative-claim GROUNDING (every number needs a nearby citation), in-document CONSISTENCY (the same value or abbreviation must not be stated two ways), READABILITY against the audience register, abbreviation-definition-at-first-use, and STRUCTURE coverage against the document type's governing standard. Returns a 0–100 precision score, a pass/revise verdict, per-finding detail, and an ordered revision brief. Use it after drafting any section/document, then REVISE against the brief and re-run until it passes. DETERMINISTIC — the findings are machine-computed; fix each one rather than arguing with it.",
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The draft prose to critique.' },
      audience: {
        type: 'string',
        enum: ['patient', 'clinician', 'regulator', 'general'],
        description: "Target audience for the readability register (default 'regulator').",
      },
      documentType: {
        type: 'string',
        description: "Optional document type (e.g. 'clinical_overview', 'csr', 'cer') to also check required-section coverage against its standard.",
      },
    },
    required: ['text'],
  },
};

export const VERIFY_REVISION: AnaTool = {
  name: 'verify_revision',
  description:
    'Verify that a revised draft actually improved on the original — the deterministic loop-closer for draft→critique→revise. Runs the precision gate on both the before and after text and reports whether the score rose, how many findings were resolved, whether any NEW findings were introduced (regressions), and whether the revision now passes. Use after revising against a critique_draft brief to confirm the rewrite worked before moving on. DETERMINISTIC.',
  input_schema: {
    type: 'object',
    properties: {
      originalText: { type: 'string', description: 'The draft before revision.' },
      revisedText: { type: 'string', description: 'The draft after revision.' },
      audience: { type: 'string', enum: ['patient', 'clinician', 'regulator', 'general'], description: "Readability register (default 'regulator')." },
      documentType: { type: 'string', description: 'Optional document type for section-coverage checks (applied to both).' },
    },
    required: ['originalText', 'revisedText'],
  },
};

export const CRITIQUE_DOCUMENT: AnaTool = {
  name: 'critique_document',
  description:
    'Critique a whole multi-section document for precision AND cross-section coherence — the document-level gate for long-form writing. Runs the precision gate on each section (for located, per-section findings) and, critically, also checks CONSISTENCY across the whole document so a value stated one way in one section and differently in another — invisible to any single-section check — is caught. Returns a per-section breakdown, the cross-section findings, and a document score/verdict. Use for a full CSR / CER / Clinical Overview before finalizing. DETERMINISTIC.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        minItems: 1,
        description: 'The document sections in order.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Section heading or id (for attributing findings).' },
            text: { type: 'string', description: 'The section prose.' },
          },
          required: ['title', 'text'],
        },
      },
      audience: { type: 'string', enum: ['patient', 'clinician', 'regulator', 'general'], description: "Readability register (default 'regulator')." },
      documentType: { type: 'string', description: 'Optional document type for required-section coverage.' },
    },
    required: ['sections'],
  },
};

/** All writing-quality tools, spread into ALL_ANA_TOOLS. */
export const WRITING_QUALITY_TOOLS: AnaTool[] = [CRITIQUE_DRAFT, VERIFY_REVISION, CRITIQUE_DOCUMENT];
