/**
 * IND cross-reference management — eCTD Module 1.4 (21 CFR 314.420).
 *
 * Completes the Module 1.4 cross-reference set and the RA management layer over
 * it. An IND that relies on external files (a DMF for the drug substance, or
 * another IND/NDA/BLA) must file, per the US regional Module 1.4:
 *
 *   - 1.4.1 Letter of Authorization        (from the file HOLDER — see
 *                                            ind-loa-service)
 *   - 1.4.2 Statement of Right of Reference(the SPONSOR's statement that it has
 *                                            been granted a right of reference)
 *   - 1.4.3 List of Authorized Persons     (persons authorized to incorporate
 *                                            information by reference)
 *
 * On top of the documents, `buildCrossReferenceRegister` is the RA management
 * view: every external file the IND depends on, with whether a Letter of
 * Authorization is on file — so the team can see, in one place, which
 * dependencies are not yet authorized (and therefore not reviewable by FDA).
 *
 * Pure / deterministic — no DB, no side effects.
 *
 * @module server/services/ind-lifecycle/ind-cross-reference-service
 */

import { SCOPE_PLACEHOLDER, statedSections, type ReferencedFileType } from './ind-loa-service';

// ---------------------------------------------------------------------------
// 1.4.2 — Statement of Right of Reference
// ---------------------------------------------------------------------------

export interface RightOfReferenceStatementInput {
  /** The IND sponsor making the statement. */
  sponsorName: string;
  referencedFileType: ReferencedFileType;
  referencedFileNumber: string;
  subjectName: string;
  /** The IND this statement supports. */
  indNumber?: string;
  /** The specific sections relied upon. Required: absent → a gap and "[scope to be specified]". */
  authorizedSections?: string[];
  signatoryName: string;
  signatoryTitle?: string;
  signatureDate?: string;
}

export interface CrossRefSection {
  key: string;
  heading: string;
  body: string;
}

export interface RightOfReferenceStatementModel {
  documentType: 'STATEMENT_OF_RIGHT_OF_REFERENCE';
  referencedFileType: ReferencedFileType;
  referencedFileNumber: string;
  sections: CrossRefSection[];
  gaps: string[];
}

export interface CrossRefLeafIntent {
  sectionCode: string;
  title: string;
  lifecycleOp: 'new';
  documentType: string;
}

function present(v: unknown): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : v !== undefined && v !== null;
}

/**
 * The recorded scope, or null when no section was recorded. 2026-10-15: an
 * empty list used to read "the file in its entirety" in the statement and the
 * register — a scope of reliance nobody recorded.
 */
function scopeOf(sections?: string[]): string | null {
  const stated = statedSections(sections);
  return stated.length > 0 ? stated.join('; ') : null;
}

/** Assemble the m1.4.2 Statement of Right of Reference model + gaps. Pure. */
export function assembleRightOfReferenceStatement(
  input: RightOfReferenceStatementInput,
): RightOfReferenceStatementModel {
  const required: Array<{ key: keyof RightOfReferenceStatementInput; label: string }> = [
    { key: 'sponsorName', label: 'sponsor name' },
    { key: 'referencedFileType', label: 'referenced file type' },
    { key: 'referencedFileNumber', label: 'referenced file number' },
    { key: 'subjectName', label: 'subject (drug substance/product)' },
    { key: 'signatoryName', label: 'signatory name' },
  ];
  const gaps = required.filter((f) => !present(input[f.key])).map((f) => f.label);
  const scope = scopeOf(input.authorizedSections);
  if (scope === null) gaps.push('authorized scope (sections relied upon)');
  const fileLabel = `${input.referencedFileType} ${input.referencedFileNumber}`.trim();

  const sections: CrossRefSection[] = [
    {
      key: 'statement',
      heading: 'Statement of Right of Reference',
      body: [
        `${input.sponsorName || '[sponsor]'} confirms that it has been granted a right of reference to`,
        `${fileLabel} (${input.subjectName || '[subject]'})`,
        input.indNumber ? `in support of IND ${input.indNumber},` : 'in support of this IND,',
        `covering ${scope ?? SCOPE_PLACEHOLDER}, and relies upon that information in this submission.`,
      ].join(' '),
    },
    {
      key: 'signature',
      heading: 'Signature',
      body:
        `Signed: ${input.signatoryName || '[signatory]'}` +
        (input.signatoryTitle ? `, ${input.signatoryTitle}` : '') +
        (input.signatureDate ? `\nDate: ${input.signatureDate}` : ''),
    },
  ];

  return {
    documentType: 'STATEMENT_OF_RIGHT_OF_REFERENCE',
    referencedFileType: input.referencedFileType,
    referencedFileNumber: input.referencedFileNumber,
    sections,
    gaps,
  };
}

/** eCTD placement intent for the Statement of Right of Reference (m1.4.2). */
export function buildRightOfReferenceLeafIntent(model: RightOfReferenceStatementModel): CrossRefLeafIntent {
  return {
    sectionCode: 'm1.4.2',
    title: `Statement of Right of Reference — ${model.referencedFileType} ${model.referencedFileNumber}`,
    lifecycleOp: 'new',
    documentType: 'statement_of_right_of_reference',
  };
}

// ---------------------------------------------------------------------------
// 1.4.3 — List of Authorized Persons to Incorporate by Reference
// ---------------------------------------------------------------------------

export interface AuthorizedPerson {
  name: string;
  organization?: string;
  role?: string;
}

export interface AuthorizedPersonsListInput {
  sponsorName: string;
  persons: AuthorizedPerson[];
}

export interface AuthorizedPersonsListModel {
  documentType: 'LIST_OF_AUTHORIZED_PERSONS';
  sections: CrossRefSection[];
  gaps: string[];
}

/** Assemble the m1.4.3 List of Authorized Persons model + gaps. Pure. */
export function assembleAuthorizedPersonsList(input: AuthorizedPersonsListInput): AuthorizedPersonsListModel {
  const gaps: string[] = [];
  if (!present(input.sponsorName)) gaps.push('sponsor name');
  if (!input.persons || input.persons.length === 0) gaps.push('at least one authorized person');

  const lines = (input.persons ?? [])
    .map((p) => `- ${p.name || '[name]'}${p.role ? ` (${p.role})` : ''}${p.organization ? `, ${p.organization}` : ''}`)
    .join('\n');

  const sections: CrossRefSection[] = [
    {
      key: 'authorized_persons',
      heading: 'Persons Authorized to Incorporate Information by Reference',
      body: [
        `${input.sponsorName || '[sponsor]'} authorizes the following persons to incorporate information by reference:`,
        lines || '[No authorized persons listed.]',
      ].join('\n'),
    },
  ];

  return { documentType: 'LIST_OF_AUTHORIZED_PERSONS', sections, gaps };
}

/** eCTD placement intent for the List of Authorized Persons (m1.4.3). */
export function buildAuthorizedPersonsLeafIntent(): CrossRefLeafIntent {
  return {
    sectionCode: 'm1.4.3',
    title: 'List of Authorized Persons to Incorporate by Reference',
    lifecycleOp: 'new',
    documentType: 'list_of_authorized_persons',
  };
}

// ---------------------------------------------------------------------------
// Cross-reference register — the RA management view + LOA-coverage QC
// ---------------------------------------------------------------------------

/** One external file the IND depends on. */
export interface CrossReferenceEntry {
  referencedFileType: ReferencedFileType;
  referencedFileNumber: string;
  subjectName: string;
  authorizedSections?: string[];
  /** Whether a Letter of Authorization (m1.4.1) has been obtained/filed. */
  loaOnFile: boolean;
  /** Where the LOA is filed (eCTD section), when on file. */
  loaLeafSection?: string;
}

export interface CrossReferenceRegisterEntry extends CrossReferenceEntry {
  /** Stable label "TYPE NUMBER". */
  fileLabel: string;
  /** The recorded authorized sections, joined; null when none were recorded (a SCOPE_NOT_SPECIFIED warning). */
  scope: string | null;
}

export interface CrossReferenceFinding {
  fileLabel: string;
  severity: 'error' | 'warning';
  /** MISSING_LOA / DUPLICATE / SCOPE_NOT_SPECIFIED. */
  code: string;
  message: string;
}

export interface CrossReferenceRegister {
  ready: boolean;
  entries: CrossReferenceRegisterEntry[];
  findings: CrossReferenceFinding[];
  counts: { total: number; withLoa: number; missingLoa: number };
}

/**
 * Build the cross-reference register: every external file the IND depends on,
 * with LOA coverage. An entry without an LOA on file is an error — FDA cannot
 * review that file in support of the IND. `ready` is true only when every
 * reference is authorized. Pure / deterministic.
 */
export function buildCrossReferenceRegister(references: CrossReferenceEntry[]): CrossReferenceRegister {
  const entries: CrossReferenceRegisterEntry[] = references.map((r) => ({
    ...r,
    fileLabel: `${r.referencedFileType} ${r.referencedFileNumber}`.trim(),
    scope: scopeOf(r.authorizedSections),
  }));

  const findings: CrossReferenceFinding[] = [];
  const seen = new Set<string>();
  let withLoa = 0;

  for (const e of entries) {
    if (seen.has(e.fileLabel)) {
      findings.push({ fileLabel: e.fileLabel, severity: 'warning', code: 'DUPLICATE', message: `${e.fileLabel} is listed more than once.` });
    }
    seen.add(e.fileLabel);

    if (e.loaOnFile) {
      withLoa += 1;
    } else {
      findings.push({
        fileLabel: e.fileLabel,
        severity: 'error',
        code: 'MISSING_LOA',
        message: `${e.fileLabel} (${e.subjectName}) has no Letter of Authorization on file; FDA cannot review it in support of the IND.`,
      });
    }

    if (e.scope === null) {
      findings.push({
        fileLabel: e.fileLabel,
        severity: 'warning',
        code: 'SCOPE_NOT_SPECIFIED',
        message: `${e.fileLabel} records no authorized sections, so the scope of the right of reference is not specified; record the sections relied upon (or "the file in its entirety" if that is what was granted).`,
      });
    }
  }

  const severityRank = (f: CrossReferenceFinding) => (f.severity === 'error' ? 0 : 1);
  findings.sort((a, b) => a.fileLabel.localeCompare(b.fileLabel) || severityRank(a) - severityRank(b) || a.code.localeCompare(b.code));
  const missingLoa = entries.length - withLoa;

  return {
    ready: findings.every((f) => f.severity !== 'error'),
    entries,
    findings,
    counts: { total: entries.length, withLoa, missingLoa },
  };
}
