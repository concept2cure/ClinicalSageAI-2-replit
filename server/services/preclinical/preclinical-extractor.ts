/**
 * Module 4 preclinical extractor — turns a nonclinical study report PDF
 * into a structured object validated against `PreclinicalStudySchema`.
 *
 * Parsing path:
 *   Buffer → common PDF text/OCR → coverage/budget checks → unified-ai-client.structured →
 *   Zod validation → typed PreclinicalStudy.
 *
 * The extractor is provider-agnostic: it goes through `ai.structured`
 * which routes to Claude by default. The returned model field is the requested
 * registry alias; it does not claim to identify the resolved provider version.
 */

import { extractDocumentText, type ExtractionCoverage } from '../ocr/extractDocumentText';
import { AUTOMATIC_PDF_OCR_BUDGET } from '../ocr/ocr-budget';
import { readExtractionCoverage } from '../../../shared/data-room-processing-status';
import { ai } from '../../lib/unified-ai-client';
import { createScopedLogger } from '../../utils/logger';
import {
  PreclinicalStudySchema,
  type PreclinicalStudy,
} from './preclinical-extraction-schema';

const log = createScopedLogger('preclinical-extractor');

const DEFAULT_MAX_INPUT_CHARS = 60_000;
// The registry ALIAS, not a wire version: the gateway resolves it to the
// current Opus, and an unmatched pin would fall through to normal routing
// without saying so.
export const DEFAULT_MODEL = 'claude-opus-4';

export type PreclinicalExtractionInputCode =
  | 'PRECLINICAL_NO_TEXT'
  | 'PRECLINICAL_INCOMPLETE_TEXT'
  | 'PRECLINICAL_REPORT_TOO_LARGE';

/** A safe, actionable input refusal, never a provider/database error. */
export class PreclinicalExtractionInputError extends Error {
  readonly code: PreclinicalExtractionInputCode;
  readonly coverage?: ExtractionCoverage;

  constructor(code: PreclinicalExtractionInputCode, message: string, coverage?: ExtractionCoverage) {
    super(message);
    this.name = 'PreclinicalExtractionInputError';
    this.code = code;
    this.coverage = coverage;
  }
}

const SYSTEM_PROMPT = `You are a regulatory toxicology data extractor working on
ICH M3(R2) / ICH S1B / ICH S2(R1) preclinical study reports for a Module 4
nonclinical submission.

You will receive the text of a single nonclinical study report. Return a JSON
object that exactly matches the supplied schema. Rules:

- Use null when the report does not state a value. Do not infer or guess.
- glpCompliant is true only when the report explicitly states GLP / 21 CFR Part 58 compliance.
- studyType MUST be one of the enumerated values; pick the closest match.
- studyCompletionDate must be ISO yyyy-mm-dd or null.
- targetOrganToxicity is an array of {organ, severity, doseLevel}; empty if no findings.
- safetyMargins entries describe basis (e.g. 'AUC', 'Cmax', 'mg/kg') and the numeric multiple over MRHD.
- extractionConfidence is your self-reported confidence in [0, 1] for the entire object.

Return ONLY the JSON object, no commentary.`;

export interface ExtractFromPdfOptions {
  sourcePdfId: string;
  /** Override default model (testing). */
  model?: string;
  /** Supported text budget; oversized reports are refused, never truncated. */
  maxInputChars?: number;
  /** Caller module label for the AI gateway audit log. */
  callerModule?: string;
}

export interface ExtractFromPdfResult {
  data: PreclinicalStudy;
  /** Echoes options.model so callers can persist the provenance value used. */
  model: string;
}

function hasCompleteCoverage(coverage: ExtractionCoverage | undefined): boolean {
  return coverage !== undefined && coverage.limitedBy === null &&
    coverage.pageCount !== null && coverage.pageCount > 0 &&
    coverage.pagesRead === coverage.pageCount;
}

/** Admit readable text only when no known unread portion or input truncation remains. */
async function readReportText(pdfBuffer: Buffer, maxChars: number): Promise<string> {
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
    throw new RangeError('preclinical-extractor: maxInputChars must be a positive safe integer');
  }
  const parsed = await extractDocumentText(pdfBuffer, 'application/pdf', 'preclinical-report.pdf', {
    pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET,
  });
  const text = parsed.text?.trim() ?? '';
  const coverage = readExtractionCoverage(parsed.coverage) ?? undefined;
  if (!text) {
    throw new PreclinicalExtractionInputError(
      'PRECLINICAL_NO_TEXT',
      'The report produced no readable text. Provide a readable report or complete document processing before extracting study facts.',
      coverage,
    );
  }
  // A thin text-layer fallback can carry partial OCR coverage too. Do not let
  // its readable cover page stand in for unread study findings.
  if (parsed.coverage !== undefined || parsed.method === 'pdf-ocr') {
    if (!hasCompleteCoverage(coverage)) {
      throw new PreclinicalExtractionInputError(
        'PRECLINICAL_INCOMPLETE_TEXT',
        'The report was not fully read. Complete document processing and review the unread pages before extracting study facts.',
        coverage,
      );
    }
  }
  if (text.length > maxChars) {
    throw new PreclinicalExtractionInputError(
      'PRECLINICAL_REPORT_TOO_LARGE',
      'The report exceeds the supported study-extraction text budget. Use the retained report in governed authoring until complete long-report extraction is supported.',
      coverage,
    );
  }
  return text;
}

/** Extract structured nonclinical study data from a single PDF buffer. */
export async function extractFromPdf(
  pdfBuffer: Buffer,
  opts: ExtractFromPdfOptions,
): Promise<ExtractFromPdfResult> {
  const text = await readReportText(pdfBuffer, opts.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS);
  const model = opts.model ?? DEFAULT_MODEL;

  log.info('Extracting preclinical study', {
    sourcePdfId: opts.sourcePdfId,
    inputChars: text.length,
    model,
  });

  const userPrompt = `Source PDF id: ${opts.sourcePdfId}
Report text:
"""
${text}
"""`;

  const raw = await ai.structured<unknown>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    undefined,
    {
      taskType: 'structured_output',
      model,
      maxTokens: 4096,
      temperature: 0,
      callerModule: opts.callerModule ?? 'preclinical-extractor',
    },
  );

  const data = PreclinicalStudySchema.parse(raw);
  return { data, model };
}
