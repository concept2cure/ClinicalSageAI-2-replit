/**
 * Regulatory clause-template catalog.
 *
 * A curated library of named, reusable regulatory-submission building blocks
 * (signature/approval blocks, cover-letter headers, section headings, sponsor
 * placeholder swaps). Each template validates its fields and renders to the
 * SAME governed insertion contract used by `insert_document_content`
 * (DocxInsertion → workers/artifact-compute/docx-insert-runtime.py), so this
 * adds NO new execution surface: it is a content layer over the existing
 * isolated, no-network docx-insert worker.
 *
 * This is the productized, validated equivalent of the hand-rolled `mkb` /
 * `mkh` / `sig` clause helpers a person would otherwise script per document —
 * named blocks with required-field checks instead of bespoke one-off code.
 *
 * Rendered content is plain UTF-8 text using the docx-insert markdown-ish
 * paragraph syntax ('#'/'##'/'###' headings, '- ' bullets, '1. ' numbered,
 * plain lines as body paragraphs). We emit literal Unicode characters (e.g. an
 * em-dash "—"), never XML entities like "&#x2014;", because python-docx writes
 * proper UTF-8 — which sidesteps the entity-vs-literal anchor-matching pitfall
 * that bites raw-string OOXML scripting.
 */

import type { DocxInsertion } from '../compute/scriptWorker';

/** Where a rendered clause is placed in the target document. */
export interface ClauseAnchor {
  anchorType: 'heading_text' | 'placeholder' | 'paragraph_index' | 'start' | 'end';
  anchorValue?: string | number;
  position?: 'before' | 'after' | 'replace';
  match?: 'exact' | 'contains';
}

/** A single field a clause template accepts. */
export interface ClauseField {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

/** Result of rendering a clause: insertions for the docx-insert worker. */
export interface ClauseRenderResult {
  insertions: DocxInsertion[];
  /** Non-fatal advisories (e.g. an optional field was omitted). */
  warnings: string[];
  /** Required fields the caller did not supply — non-empty means do NOT run. */
  missingFields: string[];
}

export type ClauseCategory = 'signature' | 'cover_letter' | 'heading' | 'placeholder';

export interface ClauseTemplate {
  key: string;
  name: string;
  category: ClauseCategory;
  summary: string;
  fields: ClauseField[];
  /**
   * Whether the clause needs a placement anchor. Pure placeholder swaps locate
   * their own tokens in the document and need no caller-supplied anchor.
   */
  needsAnchor: boolean;
  render: (fields: Record<string, string>, anchor?: ClauseAnchor) => ClauseRenderResult;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const DEFAULT_ANCHOR: ClauseAnchor = { anchorType: 'end' };

function pick(fields: Record<string, string>, key: string): string {
  const v = fields[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Collect required-field keys that are missing or blank. */
function missing(fields: Record<string, string>, defs: ClauseField[]): string[] {
  return defs.filter(f => f.required && pick(fields, f.key) === '').map(f => f.key);
}

/** Split a multi-line field (address, etc.) into trimmed, non-empty lines. */
function lines(value: string): string[] {
  return value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * Signature / approval block — the closing block of a regulatory letter or a
 * sign-off line in a submission section. Inherits the document's body style;
 * the underscore line stands in for a wet/electronic signature.
 */
const SIGNATURE_BLOCK: ClauseTemplate = {
  key: 'signature_block',
  name: 'Signature / Approval Block',
  category: 'signature',
  summary: 'Closing signature block with signatory name, title, organization, and date.',
  needsAnchor: true,
  fields: [
    { key: 'signatory_name', label: 'Signatory name', required: true, description: 'Printed name of the signatory.' },
    { key: 'signatory_title', label: 'Title', required: true, description: 'Role/title of the signatory (e.g. "VP, Regulatory Affairs").' },
    { key: 'organization', label: 'Organization', required: false, description: 'Signatory organization. Omitted if blank.' },
    { key: 'closing', label: 'Closing salutation', required: false, description: 'Closing line. Defaults to "Sincerely,".' },
    { key: 'signature_date', label: 'Date', required: false, description: 'Date line. Omitted if blank.' },
  ],
  render(fields, anchor) {
    const miss = missing(fields, this.fields);
    if (miss.length) return { insertions: [], warnings: [], missingFields: miss };

    const closing = pick(fields, 'closing') || 'Sincerely,';
    const org = pick(fields, 'organization');
    const date = pick(fields, 'signature_date');
    const warnings: string[] = [];
    if (!org) warnings.push('organization omitted — signature block has no organization line.');

    const block = [
      closing,
      '',
      '_______________________________',
      pick(fields, 'signatory_name'),
      pick(fields, 'signatory_title'),
      ...(org ? [org] : []),
      ...(date ? [`Date: ${date}`] : []),
    ];

    return {
      insertions: [{ ...(anchor ?? DEFAULT_ANCHOR), content: block.join('\n') }],
      warnings,
      missingFields: [],
    };
  },
};

/**
 * Cover-letter header — sponsor letterhead, date, recipient, and RE: subject
 * line for a submission cover letter. Typically anchored at the document start.
 */
const COVER_LETTER_HEADER: ClauseTemplate = {
  key: 'cover_letter_header',
  name: 'Cover-Letter Header',
  category: 'cover_letter',
  summary: 'Sponsor letterhead block: date, sponsor name/address, recipient, and RE: line.',
  needsAnchor: true,
  fields: [
    { key: 'sponsor_name', label: 'Sponsor name', required: true, description: 'Sponsor / applicant legal name.' },
    { key: 'letter_date', label: 'Date', required: true, description: 'Letter date.' },
    { key: 're_line', label: 'RE: subject', required: true, description: 'Subject of the submission (becomes the RE: line).' },
    { key: 'sponsor_address', label: 'Sponsor address', required: false, description: 'Multi-line address (newline-separated). Omitted if blank.' },
    { key: 'recipient', label: 'Recipient', required: false, description: 'Addressee. Defaults to "Food and Drug Administration".' },
    { key: 'submission_type', label: 'Submission type', required: false, description: 'e.g. "IND", "NDA", "510(k)". Added under the RE: line if provided.' },
  ],
  render(fields, anchor) {
    const miss = missing(fields, this.fields);
    if (miss.length) return { insertions: [], warnings: [], missingFields: miss };

    const recipient = pick(fields, 'recipient') || 'Food and Drug Administration';
    const addr = lines(pick(fields, 'sponsor_address'));
    const subType = pick(fields, 'submission_type');
    const warnings: string[] = [];
    if (!addr.length) warnings.push('sponsor_address omitted — header has no address block.');

    const block = [
      pick(fields, 'letter_date'),
      '',
      pick(fields, 'sponsor_name'),
      ...addr,
      '',
      recipient,
      '',
      `RE: ${pick(fields, 're_line')}`,
      ...(subType ? [`Submission Type: ${subType}`] : []),
    ];

    // A cover-letter header belongs at the top; default to document start.
    const placement: ClauseAnchor = anchor ?? { anchorType: 'start' };
    return {
      insertions: [{ ...placement, content: block.join('\n') }],
      warnings,
      missingFields: [],
    };
  },
};

/**
 * Section heading — a numbered/styled heading plus an optional intro paragraph.
 * `heading_level` (1–3) maps to the document's Heading 1/2/3 named style via
 * the docx-insert markdown heading syntax.
 */
const SECTION_HEADING: ClauseTemplate = {
  key: 'section_heading',
  name: 'Section Heading',
  category: 'heading',
  summary: 'Numbered/styled section heading (Heading 1–3) with an optional intro paragraph.',
  needsAnchor: true,
  fields: [
    { key: 'heading_text', label: 'Heading text', required: true, description: 'The heading title.' },
    { key: 'heading_number', label: 'Section number', required: false, description: 'e.g. "10.3". Prepended to the heading if provided.' },
    { key: 'heading_level', label: 'Level (1–3)', required: false, description: 'Heading level 1–3. Defaults to 2.' },
    { key: 'intro', label: 'Intro paragraph', required: false, description: 'Body paragraph placed under the heading. Omitted if blank.' },
  ],
  render(fields, anchor) {
    const miss = missing(fields, this.fields);
    if (miss.length) return { insertions: [], warnings: [], missingFields: miss };

    const warnings: string[] = [];
    let level = parseInt(pick(fields, 'heading_level') || '2', 10);
    if (!Number.isFinite(level) || level < 1 || level > 3) {
      warnings.push(`heading_level "${pick(fields, 'heading_level')}" invalid — defaulted to 2.`);
      level = 2;
    }
    const number = pick(fields, 'heading_number');
    const title = number ? `${number} ${pick(fields, 'heading_text')}` : pick(fields, 'heading_text');
    const intro = pick(fields, 'intro');

    const block = ['#'.repeat(level) + ' ' + title, ...(intro ? [intro] : [])];
    return {
      insertions: [{ ...(anchor ?? DEFAULT_ANCHOR), content: block.join('\n') }],
      warnings,
      missingFields: [],
    };
  },
};

/**
 * Sponsor placeholder swap — replace standard submission tokens
 * ({{SPONSOR}}, {{SPONSOR_ADDRESS}}, {{DATE}}, {{CONTACT}}, {{CONTACT_EMAIL}})
 * already present in a template document. Each provided field becomes a
 * placeholder-replace insertion; needs no caller anchor.
 */
const PLACEHOLDER_TO_FIELD: Record<string, string> = {
  '{{SPONSOR}}': 'sponsor_name',
  '{{SPONSOR_ADDRESS}}': 'sponsor_address',
  '{{DATE}}': 'submission_date',
  '{{CONTACT}}': 'contact_name',
  '{{CONTACT_EMAIL}}': 'contact_email',
};

const SPONSOR_PLACEHOLDER_SWAP: ClauseTemplate = {
  key: 'sponsor_placeholder_swap',
  name: 'Sponsor Placeholder Swap',
  category: 'placeholder',
  summary: 'Fill standard sponsor tokens ({{SPONSOR}}, {{DATE}}, …) already in a template document.',
  needsAnchor: false,
  fields: [
    { key: 'sponsor_name', label: 'Sponsor name', required: true, description: 'Replaces {{SPONSOR}}.' },
    { key: 'sponsor_address', label: 'Sponsor address', required: false, description: 'Replaces {{SPONSOR_ADDRESS}}.' },
    { key: 'submission_date', label: 'Submission date', required: false, description: 'Replaces {{DATE}}.' },
    { key: 'contact_name', label: 'Contact name', required: false, description: 'Replaces {{CONTACT}}.' },
    { key: 'contact_email', label: 'Contact email', required: false, description: 'Replaces {{CONTACT_EMAIL}}.' },
  ],
  render(fields) {
    const miss = missing(fields, this.fields);
    if (miss.length) return { insertions: [], warnings: [], missingFields: miss };

    const insertions: DocxInsertion[] = [];
    const warnings: string[] = [];
    for (const [token, fieldKey] of Object.entries(PLACEHOLDER_TO_FIELD)) {
      const value = pick(fields, fieldKey);
      if (value === '') continue; // skip tokens the caller did not fill
      insertions.push({
        anchorType: 'placeholder',
        anchorValue: token,
        position: 'replace',
        match: 'contains',
        content: value,
      });
    }
    if (insertions.length === 0) {
      warnings.push('no placeholder fields supplied — nothing to swap.');
    }
    return { insertions, warnings, missingFields: [] };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

const CATALOG: Record<string, ClauseTemplate> = {
  [SIGNATURE_BLOCK.key]: SIGNATURE_BLOCK,
  [COVER_LETTER_HEADER.key]: COVER_LETTER_HEADER,
  [SECTION_HEADING.key]: SECTION_HEADING,
  [SPONSOR_PLACEHOLDER_SWAP.key]: SPONSOR_PLACEHOLDER_SWAP,
};

/** Stable list of template keys (for tool enums and discovery). */
export const CLAUSE_TEMPLATE_KEYS = Object.keys(CATALOG) as ReadonlyArray<string>;

/** Catalog metadata for discovery / UI (no render functions). */
export function listClauseTemplates(): Array<Omit<ClauseTemplate, 'render'>> {
  return Object.values(CATALOG).map(({ render: _render, ...meta }) => meta);
}

export function getClauseTemplate(key: string): ClauseTemplate | undefined {
  return CATALOG[key];
}

/**
 * Render a named clause to docx-insert insertions. Returns `unknownClause` when
 * the key is not in the catalog; otherwise delegates to the template's render.
 */
export function renderClauseTemplate(
  key: string,
  fields: Record<string, string>,
  anchor?: ClauseAnchor
): ClauseRenderResult & { unknownClause?: boolean } {
  const template = CATALOG[key];
  if (!template) {
    return { insertions: [], warnings: [], missingFields: [], unknownClause: true };
  }
  const result = template.render(fields ?? {}, anchor);
  if (template.needsAnchor && !anchor) {
    result.warnings = [
      ...result.warnings,
      `no anchor supplied — clause placed at document ${
        key === 'cover_letter_header' ? 'start' : 'end'
      } by default.`,
    ];
  }
  return result;
}
