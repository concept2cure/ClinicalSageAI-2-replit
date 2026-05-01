/**
 * Cover-letter composer — deterministic templating from eSTAR sections.
 *
 * Builds an FDA-style cover letter draft for an AI-letter response by
 * pulling verbatim section content from the eSTAR (typically §3, §6, §11,
 * §12) and rendering against a stable template. No LLM; entirely
 * deterministic so the output is reviewable and auditable.
 *
 * The 510(k) summary uses the same primitives but a longer template; that
 * is a follow-on extension layered on top of this module.
 */

import { pullEstarSections, type PulledSection } from './section-pull';

export interface CoverLetterIssueSummary {
  id: string;
  category: string;
  severity: string;
  blocker: boolean;
  /** Free-text description used as the bullet body. */
  description: string;
  /** eSTAR section numbers this issue resolves against (e.g. ["3","6"]). */
  sectionNumbers: string[];
}

export interface ComposeCoverLetterInput {
  organizationId: number;
  /** eSTAR document id in cerv2_510k_sections.document_id. */
  documentId: number;
  /** FDA submission tracking number, e.g. "K251102". */
  submissionTrackingNumber: string | null;
  /** Sponsor display name for the addressee block. */
  sponsorName: string;
  /** Issues being addressed in this response. */
  issues: CoverLetterIssueSummary[];
}

export interface CoverLetterDraft {
  /** Rendered Markdown ready to ship to the editor surface. */
  body: string;
  /** Sections that were attempted but had no content; surfaced for the gap UI. */
  missingSections: string[];
  /** Provenance hash inputs — used by the audit trail. */
  provenance: {
    composerVersion: string;
    composedAt: string;
    deterministic: true;
    sectionNumbers: string[];
    issueIds: string[];
  };
}

const COMPOSER_VERSION = 'cover-letter-v1';

export async function composeCoverLetterDraft(
  input: ComposeCoverLetterInput,
): Promise<CoverLetterDraft> {
  // Collect the union of section numbers referenced by all issues, preserving
  // a stable order so the rendered output is deterministic.
  const orderedSections: string[] = [];
  const seen = new Set<string>();
  for (const issue of input.issues) {
    for (const num of issue.sectionNumbers) {
      if (!seen.has(num)) {
        seen.add(num);
        orderedSections.push(num);
      }
    }
  }

  const pulled = await pullEstarSections({
    organizationId: input.organizationId,
    documentId: input.documentId,
    sectionNumbers: orderedSections,
  });
  const sectionByNumber = new Map(pulled.map(s => [s.sectionNumber, s]));
  const missingSections = pulled
    .filter(s => s.status !== 'present')
    .map(s => s.sectionNumber);

  const body = renderBody({
    submissionTrackingNumber: input.submissionTrackingNumber,
    sponsorName: input.sponsorName,
    issues: input.issues,
    sections: pulled,
  });

  return {
    body,
    missingSections,
    provenance: {
      composerVersion: COMPOSER_VERSION,
      composedAt: new Date().toISOString(),
      deterministic: true,
      sectionNumbers: orderedSections,
      issueIds: input.issues.map(i => i.id),
    },
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderBody(args: {
  submissionTrackingNumber: string | null;
  sponsorName: string;
  issues: CoverLetterIssueSummary[];
  sections: PulledSection[];
}): string {
  const heading = args.submissionTrackingNumber
    ? `Response to FDA Additional Information Request — ${args.submissionTrackingNumber}`
    : 'Response to FDA Additional Information Request';

  const lines: string[] = [];
  lines.push(`# ${heading}`);
  lines.push('');
  lines.push('Food and Drug Administration');
  lines.push('Center for Devices and Radiological Health');
  lines.push('Document Control Center');
  lines.push('10903 New Hampshire Avenue');
  lines.push('Silver Spring, MD 20993-0002');
  lines.push('');
  lines.push(`From: ${args.sponsorName}`);
  lines.push('');
  lines.push('Dear Sir or Madam,');
  lines.push('');
  lines.push(
    `${args.sponsorName} respectfully submits this response to the FDA Additional Information request issued for the above submission. The following items are addressed in this package:`,
  );
  lines.push('');

  // ─── Issue list ────────────────────────────────────────────────────────
  for (const issue of args.issues) {
    lines.push(`## Item ${issue.id} — ${issue.category} (${issue.severity}${issue.blocker ? ', blocker' : ''})`);
    lines.push('');
    lines.push(issue.description.trim());
    if (issue.sectionNumbers.length > 0) {
      lines.push('');
      lines.push(`Sections updated: ${issue.sectionNumbers.map(n => `§${n}`).join(', ')}.`);
    }
    lines.push('');
  }

  // ─── Section content blocks ───────────────────────────────────────────
  if (args.sections.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Updated section content (verbatim)');
    lines.push('');
    for (const section of args.sections) {
      const titleSuffix = section.sectionTitle ? ` — ${section.sectionTitle}` : '';
      lines.push(`### §${section.sectionNumber}${titleSuffix}`);
      lines.push('');
      switch (section.status) {
        case 'present':
          lines.push(section.content ?? '');
          break;
        case 'empty':
          lines.push('_(Section is currently empty in the dossier — content pending author update.)_');
          break;
        case 'missing':
          lines.push('_(Section not found in the eSTAR — verify section number with the dossier owner.)_');
          break;
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'Should you require additional information, please contact the regulatory point of contact listed in the submission.',
  );
  lines.push('');
  lines.push('Sincerely,');
  lines.push('');
  lines.push(`${args.sponsorName} Regulatory Affairs`);

  return lines.join('\n');
}
