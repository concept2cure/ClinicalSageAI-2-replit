/**
 * Module 4 preclinical extractor — turns a nonclinical study report PDF
 * into a structured object validated against `PreclinicalStudySchema`.
 *
 * Parsing path:
 *   Buffer → pdf-parse → cleaned text → unified-ai-client.structured →
 *   Zod validation → typed PreclinicalStudy.
 *
 * The extractor is provider-agnostic: it goes through `ai.structured`
 * which routes to Claude by default. The model that handled the call is
 * recorded so the row's provenance row matches the LLM that produced it.
 */

import pdfParse from 'pdf-parse';
import { ai } from '../../lib/unified-ai-client';
import { createScopedLogger } from '../../utils/logger';
import {
  PreclinicalStudySchema,
  type PreclinicalStudy,
} from './preclinical-extraction-schema';

const log = createScopedLogger('preclinical-extractor');

const DEFAULT_MAX_INPUT_CHARS = 60_000;
const DEFAULT_MODEL = 'claude-opus-4-7';

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
  /** Cap text passed to the model so token cost stays bounded. */
  maxInputChars?: number;
  /** Caller module label for the AI gateway audit log. */
  callerModule?: string;
}

export interface ExtractFromPdfResult {
  data: PreclinicalStudy;
  /** Echoes options.model so callers can persist the provenance value used. */
  model: string;
}

/** Extract structured nonclinical study data from a single PDF buffer. */
export async function extractFromPdf(
  pdfBuffer: Buffer,
  opts: ExtractFromPdfOptions,
): Promise<ExtractFromPdfResult> {
  const parsed = await pdfParse(pdfBuffer);
  const text = parsed.text?.trim() ?? '';
  if (!text) {
    throw new Error('preclinical-extractor: PDF produced no extractable text');
  }

  const maxChars = opts.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) : text;
  const model = opts.model ?? DEFAULT_MODEL;

  log.info('Extracting preclinical study', {
    sourcePdfId: opts.sourcePdfId,
    inputChars: truncated.length,
    model,
  });

  const userPrompt = `Source PDF id: ${opts.sourcePdfId}
Report text:
"""
${truncated}
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
