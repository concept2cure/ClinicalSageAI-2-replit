/**
 * 510(k) summary composer — deterministic templating.
 *
 * The 510(k) summary is the public-facing summary of the device, its
 * predicates, and the substantial-equivalence basis. Per 21 CFR §807.92,
 * it is a "summary of safety and effectiveness" and is published by FDA
 * after clearance. It pulls from the same eSTAR sections as the cover
 * letter (§3 Indications, §6 Substantial Equivalence, §11 Performance,
 * §12 Labeling) but renders them at greater length and adds the device-
 * description / predicate-comparison blocks that aren't in the cover
 * letter.
 *
 * No LLM. The output is reviewable, auditable, and deterministic.
 */

import { pullEstarSections, type PulledSection } from './section-pull';

export interface K510Predicate {
  /** FDA K-number, e.g. 'K212284'. */
  kNumber: string;
  /** Marketed device name. */
  deviceName: string;
  /** Manufacturer / 510(k) holder name. */
  holder: string;
  /** Whether this is the primary predicate (only one should be). */
  primary: boolean;
}

export interface K510SummaryInput {
  organizationId: number;
  /** eSTAR document id in cerv2_510k_sections.document_id. */
  documentId: number;

  // Cover-page data.
  submissionTrackingNumber: string | null;
  sponsorName: string;
  deviceTradeName: string;
  commonName: string | null;
  productCode: string | null;
  regulationNumber: string | null;
  deviceClass: 'I' | 'II' | 'III';
  contactName: string | null;
  contactEmail: string | null;
  preparedDate: Date;

  // Predicate set referenced by the SE basis.
  predicates: K510Predicate[];
}

export interface K510SummaryDraft {
  /** Rendered Markdown ready to ship to the editor surface. */
  body: string;
  /** Sections that were attempted but had no content. */
  missingSections: string[];
  provenance: {
    composerVersion: string;
    composedAt: string;
    deterministic: true;
    sectionNumbers: string[];
    predicateKNumbers: string[];
  };
}

const COMPOSER_VERSION = 'k510-summary-v1';

// 21 CFR §807.92 — required content. We pull §3 / §6 / §11 / §12 verbatim
// to satisfy items (a)(4-7) of the regulation; items (a)(1-3) come from
// the input cover-page data.
const REQUIRED_SECTIONS = ['3', '6', '11', '12'] as const;

export async function compose510kSummary(
  input: K510SummaryInput,
): Promise<K510SummaryDraft> {
  const sectionNumbers = [...REQUIRED_SECTIONS];

  const sections = await pullEstarSections({
    organizationId: input.organizationId,
    documentId: input.documentId,
    sectionNumbers,
  });

  const missingSections = sections
    .filter(s => s.status !== 'present')
    .map(s => s.sectionNumber);

  validatePredicates(input.predicates);

  const body = renderBody(input, sections);

  return {
    body,
    missingSections,
    provenance: {
      composerVersion: COMPOSER_VERSION,
      composedAt: new Date().toISOString(),
      deterministic: true,
      sectionNumbers,
      predicateKNumbers: input.predicates.map(p => p.kNumber),
    },
  };
}

function validatePredicates(predicates: K510Predicate[]): void {
  if (predicates.length === 0) {
    throw new Error('510(k) summary requires at least one predicate');
  }
  const primaries = predicates.filter(p => p.primary);
  if (primaries.length === 0) {
    throw new Error('510(k) summary requires exactly one primary predicate; got 0');
  }
  if (primaries.length > 1) {
    throw new Error(
      `510(k) summary requires exactly one primary predicate; got ${primaries.length}`,
    );
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderBody(input: K510SummaryInput, sections: PulledSection[]): string {
  const sectionByNumber = new Map(sections.map(s => [s.sectionNumber, s]));

  const lines: string[] = [];

  // ─── Header ─────────────────────────────────────────────────────────
  lines.push(`# 510(k) Summary — ${input.deviceTradeName}`);
  lines.push('');
  lines.push(`Per 21 CFR §807.92`);
  lines.push('');
  if (input.submissionTrackingNumber) {
    lines.push(`Submission: **${input.submissionTrackingNumber}**`);
  }
  lines.push(`Date prepared: ${formatDate(input.preparedDate)}`);
  lines.push('');

  // ─── §807.92(a)(1) — Submitter ──────────────────────────────────────
  lines.push('## 1. Submitter');
  lines.push('');
  lines.push(input.sponsorName);
  if (input.contactName) lines.push(`Contact: ${input.contactName}`);
  if (input.contactEmail) lines.push(`Email: ${input.contactEmail}`);
  lines.push('');

  // ─── §807.92(a)(2) — Device ─────────────────────────────────────────
  lines.push('## 2. Device');
  lines.push('');
  lines.push(`- Trade name: ${input.deviceTradeName}`);
  if (input.commonName) lines.push(`- Common / classification name: ${input.commonName}`);
  if (input.productCode) lines.push(`- Product code: ${input.productCode}`);
  if (input.regulationNumber) lines.push(`- Regulation number: ${input.regulationNumber}`);
  lines.push(`- Device class: ${input.deviceClass}`);
  lines.push('');

  // ─── §807.92(a)(3) — Predicate(s) ───────────────────────────────────
  lines.push('## 3. Predicate device(s)');
  lines.push('');
  const primary = input.predicates.find(p => p.primary)!;
  lines.push(`Primary predicate: **${primary.kNumber}** — ${primary.deviceName} (${primary.holder})`);
  const refs = input.predicates.filter(p => !p.primary);
  if (refs.length > 0) {
    lines.push('');
    lines.push('Reference predicates:');
    for (const r of refs) {
      lines.push(`- ${r.kNumber} — ${r.deviceName} (${r.holder})`);
    }
  }
  lines.push('');

  // ─── §807.92(a)(4) — Indications for Use ────────────────────────────
  lines.push('## 4. Indications for Use');
  lines.push('');
  appendSection(lines, sectionByNumber.get('3'), 'Indications for Use');

  // ─── §807.92(a)(5) — Description ───────────────────────────────────
  // We don't have a clean "device description" section number convention
  // in the eSTAR fixture, so we surface §6 as the substantial-equivalence
  // narrative and let §6 carry the device-description prose where the
  // dossier authors put it.
  lines.push('## 5. Substantial Equivalence');
  lines.push('');
  appendSection(lines, sectionByNumber.get('6'), 'Substantial Equivalence');

  // ─── §807.92(a)(6) — Performance Data ───────────────────────────────
  lines.push('## 6. Performance Testing');
  lines.push('');
  appendSection(lines, sectionByNumber.get('11'), 'Performance');

  // ─── §807.92(a)(7) — Conclusions / Labeling ────────────────────────
  lines.push('## 7. Labeling');
  lines.push('');
  appendSection(lines, sectionByNumber.get('12'), 'Labeling');

  // ─── Closing ────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(
    `Based on the comparison of intended use, technological characteristics, and performance data, ${input.sponsorName} concludes that ${input.deviceTradeName} is substantially equivalent to the predicate device(s) cited above.`,
  );

  return lines.join('\n');
}

function appendSection(
  lines: string[],
  section: PulledSection | undefined,
  fallbackTitle: string,
): void {
  const title = section?.sectionTitle ?? fallbackTitle;
  if (!section || section.status !== 'present' || !section.content) {
    lines.push(`_(Section "${title}" is not yet populated in the eSTAR — review with the dossier owner before publishing.)_`);
  } else {
    lines.push(section.content);
  }
  lines.push('');
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
