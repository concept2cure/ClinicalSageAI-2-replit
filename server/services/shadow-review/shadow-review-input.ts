/**
 * What the Shadow Review reviewer is given to read (2026-10-25, row D7).
 *
 * Before: each leaf reached the reviewer as `{ sectionCode, title, lifecycleOp }`
 * and nothing else. The prompt asked for refuse-to-file and complete-response
 * findings, and the reviewer could judge only a table of contents: a Clinical
 * Overview that contradicted its own CSR, a Module 3 that named no
 * specification, a cover letter for the wrong application all read the same as
 * correct ones. Findings about content were guesses from titles.
 *
 * Now the reviewer reads each leaf's text, taken from the same rendered leaf the
 * package would carry (leaf-source-resolver.ts materializeLeafSources, the
 * assembler's own reader) and extracted by the platform's one text extractor
 * (ocr/extractDocumentText.ts). Nothing here reads a document store directly.
 *
 * What is sent is bounded and said:
 *   - Each leaf's text is cut to REVIEW_TEXT_PER_LEAF_CHARS, and the run to
 *     REVIEW_TEXT_TOTAL_CHARS; a leaf past the total is sent by title only. Each
 *     leaf in the payload says how much of it was sent.
 *   - Contact details carry no review evidence, so emails, US SSNs, secrets
 *     (the governed redactor, observability/redaction.ts) and US phone numbers
 *     (the classifier's own pattern) are masked before anything is sent.
 *   - A leaf whose text still classifies as PII or PHI after masking (a
 *     labelled date of birth, a medical record number) is withheld: a simulated
 *     reviewer has no need of a patient identifier, and the leaf is sent by title
 *     with the reason.
 * The run records all of it (shadow_review_runs.input_coverage), so a finding's
 * reader can see what the reviewer could and could not have read.
 *
 * @module server/services/shadow-review/shadow-review-input
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { materializeLeafSources, leafSourceKey } from '../ectd/leaf-source-resolver';
import { readCompanyLegalSubmissionContext } from '../ectd/company-legal-context';
import { extractDocumentText, AUTOMATIC_PDF_OCR_BUDGET } from '../ocr/extractDocumentText';
import { redactSecretsAndPiiText } from '../observability/redaction';
import { US_PHONE_PATTERN } from '../ai-governance/classification/heuristic-classifier';
import { getContentClassifier } from '../ai-governance/classification/index.js';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('shadow-review-input');

/** The most of one leaf's text the reviewer is sent. */
export const REVIEW_TEXT_PER_LEAF_CHARS = 12_000;
/** The most text one run sends, across all its leaves. */
export const REVIEW_TEXT_TOTAL_CHARS = 150_000;

/** The leaf fields this module reads. */
export interface ReviewLeaf {
  id: number;
  sectionCode: string;
  title: string;
  lifecycleOp: string;
  documentTable: string | null;
  documentId: number | null;
  documentUuid?: string | null;
}

/** One leaf's text as read, or why it was not. */
export type LeafTextRead = { text: string } | { notRead: string };

/** One leaf as the reviewer receives it. */
export interface ReviewerLeaf {
  sectionCode: string;
  title: string;
  lifecycleOp: string;
  /** The leaf's text, masked and cut to the budget. Absent when not sent. */
  text?: string;
  /** The leaf's full extracted length, when it was read. */
  textChars?: number;
  /** The text was cut: only the first `text.length` characters were sent. */
  truncated?: boolean;
  /** Why no text was sent for this leaf. */
  notRead?: string;
}

export type LeafCoverageStatus = 'read' | 'truncated' | 'not_read' | 'withheld' | 'withdrawn';

/** What the reviewer was given, recorded on the run (input_coverage). */
export interface ReviewInputCoverage {
  version: 1;
  /** Whether any leaf's text was sent. False when none could be, or when the
   *  run fell back to titles only because the gateway refused the text
   *  (`textWithheld` then says so). */
  textSent: boolean;
  /** Why the text was not sent at all, when textSent is false. */
  textWithheld?: string;
  perLeafLimit: number;
  totalLimit: number;
  charsSent: number;
  /** Whether the run recorded the digest of the leaves it read (set by the
   *  service): 'changed_during_read' and 'not_derivable' runs cover no leaves
   *  the dispatch gate can count. */
  leafDigest?: 'recorded' | 'changed_during_read' | 'not_derivable';
  leaves: Array<{
    leafId: number;
    sectionCode: string;
    status: LeafCoverageStatus;
    chars?: number;
    sentChars?: number;
    reason?: string;
  }>;
}

const PHONE_ALL = new RegExp(US_PHONE_PATTERN.source, 'g');

/** Contact details and secrets masked: they carry no review evidence. Pure. */
export function maskContactDetails(text: string): string {
  return redactSecretsAndPiiText(text).replace(PHONE_ALL, '[REDACTED]');
}

const WITHDRAWN = 'The leaf withdraws a document (lifecycle delete); it ships no content.';
const OVER_BUDGET = `Not sent: the run's text budget (${REVIEW_TEXT_TOTAL_CHARS.toLocaleString('en-US')} characters) was reached before this leaf.`;

/**
 * The reviewer's leaves and the coverage record, from each leaf's text as read
 * (already masked and screened). Pure; the budgets are parameters for tests.
 */
export function buildReviewerInput(
  leaves: ReviewLeaf[],
  reads: Map<number, LeafTextRead>,
  limits: { perLeaf: number; total: number } = { perLeaf: REVIEW_TEXT_PER_LEAF_CHARS, total: REVIEW_TEXT_TOTAL_CHARS },
): { leaves: ReviewerLeaf[]; coverage: ReviewInputCoverage } {
  let remaining = limits.total;
  const out: ReviewerLeaf[] = [];
  const coverage: ReviewInputCoverage = {
    version: 1, textSent: false, perLeafLimit: limits.perLeaf, totalLimit: limits.total, charsSent: 0, leaves: [],
  };
  for (const leaf of leaves) {
    const base = { sectionCode: leaf.sectionCode, title: leaf.title, lifecycleOp: leaf.lifecycleOp };
    const read = reads.get(leaf.id) ?? { notRead: 'The leaf was not read.' };
    if ('notRead' in read) {
      const status: LeafCoverageStatus = read.notRead === WITHDRAWN ? 'withdrawn'
        : read.notRead.startsWith('Withheld') ? 'withheld' : 'not_read';
      out.push({ ...base, notRead: read.notRead });
      coverage.leaves.push({ leafId: leaf.id, sectionCode: leaf.sectionCode, status, reason: read.notRead });
      continue;
    }
    const chars = read.text.length;
    if (remaining <= 0) {
      out.push({ ...base, textChars: chars, notRead: OVER_BUDGET });
      coverage.leaves.push({ leafId: leaf.id, sectionCode: leaf.sectionCode, status: 'not_read', chars, reason: OVER_BUDGET });
      continue;
    }
    const sent = read.text.slice(0, Math.min(limits.perLeaf, remaining));
    remaining -= sent.length;
    coverage.charsSent += sent.length;
    const truncated = sent.length < chars;
    out.push({ ...base, text: sent, textChars: chars, ...(truncated ? { truncated: true } : {}) });
    coverage.leaves.push({
      leafId: leaf.id, sectionCode: leaf.sectionCode, status: truncated ? 'truncated' : 'read', chars, sentChars: sent.length,
    });
  }
  coverage.textSent = coverage.charsSent > 0;
  return { leaves: out, coverage };
}

/** The titles-only input, for a run whose text the gateway refused. Pure. */
export function titlesOnlyInput(
  leaves: ReviewLeaf[],
  reason: string,
): { leaves: ReviewerLeaf[]; coverage: ReviewInputCoverage } {
  return {
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp })),
    coverage: {
      version: 1, textSent: false, textWithheld: reason,
      perLeafLimit: REVIEW_TEXT_PER_LEAF_CHARS, totalLimit: REVIEW_TEXT_TOTAL_CHARS, charsSent: 0,
      leaves: leaves.map((l) => ({ leafId: l.id, sectionCode: l.sectionCode, status: 'not_read' as const, reason })),
    },
  };
}

/** A leaf's text screened for the reviewer: masked, then withheld if still sensitive. */
async function screened(raw: string): Promise<LeafTextRead> {
  const text = maskContactDetails(raw.trim());
  if (!text) return { notRead: 'No text could be extracted from the rendered leaf.' };
  const c = await getContentClassifier().classify(text);
  if (c.phi || c.pii) {
    const kinds = [...new Set(c.matches.filter((m) => m.class === 'phi' || m.class === 'pii').map((m) => m.detector))];
    return {
      notRead: `Withheld: the text holds identifiers classified as ${c.phi ? 'PHI' : 'PII'} (${kinds.join(', ') || 'unlabelled'}), and a simulated reviewer is not sent them.`,
    };
  }
  return { text };
}

/**
 * Read each leaf's text as the package would carry it. Tenant-scoped through the
 * materializer; never throws for a leaf: a leaf that cannot be read says why.
 * The staged files live in a temporary directory removed before this returns.
 */
export async function readLeafTextsForReview(
  leaves: ReviewLeaf[],
  ctx: { organizationId: number; sequenceId: number },
): Promise<Map<number, LeafTextRead>> {
  const reads = new Map<number, LeafTextRead>();
  const shipping = leaves.filter((l) => {
    if ((l.lifecycleOp ?? '').trim().toLowerCase() === 'delete') {
      reads.set(l.id, { notRead: WITHDRAWN });
      return false;
    }
    if (!l.documentTable || (!l.documentId && !l.documentUuid)) {
      reads.set(l.id, { notRead: 'The leaf names no source document.' });
      return false;
    }
    return true;
  });
  if (shipping.length === 0) return reads;

  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), `shadow-review-${ctx.sequenceId}-`));
  try {
    const { byKey, unresolved } = await materializeLeafSources({
      leaves: shipping.map((l) => ({
        documentTable: l.documentTable, documentId: l.documentId, documentUuid: l.documentUuid ?? null, lifecycleOp: l.lifecycleOp,
      })),
      organizationId: ctx.organizationId,
      stageDir,
      legalTarget: shipping.some((l) => l.documentTable === 'vault_documents')
        ? await readCompanyLegalSubmissionContext(queryableFromDrizzle(db), ctx.organizationId, ctx.sequenceId)
        : undefined,
    });
    const unresolvedByKey = new Map(
      unresolved.map((u) => [leafSourceKey(u.documentTable ?? '', u.documentId, u.documentUuid ?? null), u.reason]),
    );
    const texts = new Map<string, Promise<LeafTextRead>>();
    for (const leaf of shipping) {
      const key = leafSourceKey(leaf.documentTable!, leaf.documentId, leaf.documentUuid ?? null);
      if (!texts.has(key)) {
        const file = byKey.get(key);
        texts.set(key, file
          ? fs.readFile(file.sourcePath)
            .then((bytes) => extractDocumentText(bytes, undefined, file.fileName, { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET }))
            .then((extracted) => screened(extracted.text))
            .catch((err) => {
              logger.warn('A Shadow Review leaf could not be read', {
                sequenceId: ctx.sequenceId, err: err instanceof Error ? err.message : String(err),
              });
              return { notRead: 'The rendered leaf could not be read.' };
            })
          : Promise.resolve({ notRead: `The source document could not be rendered: ${unresolvedByKey.get(key) ?? 'not found'}.` }));
      }
      reads.set(leaf.id, await texts.get(key)!);
    }
    return reads;
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
