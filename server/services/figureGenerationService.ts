/**
 * @fileoverview AI Figure Generation Service
 * @module server/services/figureGenerationService
 * @version 1.0.0
 *
 * @description
 * Generates regulatory-grade figures, charts, and diagrams using AI.
 * Supports: Mermaid diagrams, Chart.js specifications, SVG generation,
 * and figure metadata for eCTD compliance.
 *
 * Addresses audit finding: "❌ No figure insertion service found in codebase"
 *
 * @compliance FDA 21 CFR Part 11 — all figure generation is audited
 */

import { pool } from '../db.js';
import auditService from './auditService';
import { recordArtifactProvenance } from './provenance/artifact-provenance';
import crypto from 'crypto';
import { ai } from '../lib/unified-ai-client';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FigureSpec {
  id: string;
  figureNumber: string; // e.g., "Figure 2.7.4.1-1"
  title: string;
  figureType: FigureType;
  description: string;
  sourceData: FigureDataSource[];
  regulatoryContext?: string; // Which CTD section this supports
  generatedContent: string; // Mermaid/SVG/ChartJS spec
  generatedFormat: 'mermaid' | 'chartjs' | 'svg' | 'html-table' | 'text-description';
  metadata: FigureMetadata;
  // 2026-10-15: `confidence` ("0-1 confidence in data accuracy") is gone. It was
  // scored from the output's syntax; nothing checked a datum. Each source now
  // records how many of its rows the model was given (FigureDataSource).
  auditTrail: FigureAuditEntry[];
}

export type FigureType =
  | 'bar_chart'
  | 'line_chart'
  | 'scatter_plot'
  | 'kaplan_meier'
  | 'forest_plot'
  | 'waterfall_plot'
  | 'consort_flow'
  | 'process_flow'
  | 'org_chart'
  | 'gantt_chart'
  | 'pie_chart'
  | 'box_plot'
  | 'heatmap'
  | 'dose_response'
  | 'pk_concentration'
  | 'stability_trend'
  | 'comparison_table'
  | 'decision_tree'
  | 'custom';

export interface FigureDataSource {
  sourceType: 'data_room' | 'study_report' | 'extracted_table' | 'manual' | 'api';
  sourceId?: string;
  sourceName: string;
  dataPoints?: Record<string, unknown>[];
  /** Rows this source supplied. */
  rowsSupplied: number;
  /** Whole rows of it the drafting model was given (the prompt has a size budget). */
  rowsSentToModel: number;
  extractedAt?: string;
}

export interface FigureMetadata {
  width?: number;
  height?: number;
  colorScheme?: string;
  axisLabels?: { x?: string; y?: string };
  legendPosition?: string;
  footnotes?: string[];
  sourceReference?: string; // "Source: Study XYZ-001, Table 14.2.1"
  generatedAt: string;
  /** The requesting user's id — an id, not a person-shaped label (ledger L142). */
  generatedByUserId: number;
  modelUsed: string;
  tokensUsed?: number;
}

export interface FigureAuditEntry {
  action: string;
  timestamp: string;
  userId?: number;
  details: string;
}

export interface FigureGenerationRequest {
  projectId: number;
  organizationId: number;
  userId: number;
  figureType: FigureType;
  title: string;
  description: string;
  targetSection?: string; // CTD section code, e.g., "2.7.4"
  sourceDataRefs?: string[]; // Data Room document IDs
  rawData?: Record<string, unknown>[];
  preferences?: {
    style?: 'clinical' | 'regulatory' | 'presentation';
    colorScheme?: 'default' | 'grayscale' | 'high-contrast';
    format?: 'mermaid' | 'chartjs' | 'svg';
  };
}

export interface FigureGenerationResult {
  success: boolean;
  figure?: FigureSpec;
  /** A fixed sentence saying why no figure was generated — never a caught error's own text. */
  error?: string;
  /**
   * Why no figure was generated (absent on success): 'refused' — the request
   * cannot be drawn as asked, the caller's to change; 'gateway' — the drafting
   * model failed or returned nothing; 'internal' — this service could not read
   * or store what it needed. 2026-10-15: unmarked, so all three read as a refusal.
   */
  failure?: 'refused' | 'gateway' | 'internal';
  insertionPoint?: {
    sectionCode: string;
    afterParagraph?: number;
    figureNumber: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGURE TYPE → GENERATION STRATEGY MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const FIGURE_TYPE_CONFIG: Record<
  FigureType,
  {
    preferredFormat: 'mermaid' | 'chartjs' | 'svg' | 'html-table';
    promptTemplate: string;
    regulatoryGuidance: string;
  }
> = {
  bar_chart: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a bar chart specification',
    regulatoryGuidance:
      'Include error bars (SD or SEM). Label axes with units. Include n per group.',
  },
  line_chart: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a line chart specification',
    regulatoryGuidance:
      'Plot confidence intervals only when the source data carries them. Show visit numbers per ICH.',
  },
  scatter_plot: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a scatter plot specification',
    regulatoryGuidance: 'Plot the points as supplied. Show a regression line or correlation coefficient only when the source data carries it.',
  },
  kaplan_meier: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a Kaplan-Meier survival curve specification',
    regulatoryGuidance:
      'Include number at risk table below. Mark censored observations. Show HR and 95% CI per ICH E9.',
  },
  forest_plot: {
    preferredFormat: 'svg',
    promptTemplate: 'Generate a forest plot specification for meta-analysis',
    regulatoryGuidance:
      'Show point estimates, CIs, weights. Include overall estimate with diamond. Per PRISMA guidelines.',
  },
  waterfall_plot: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a waterfall plot for tumor response',
    regulatoryGuidance:
      'Color code by RECIST response category. Show 20% growth and 30% shrinkage lines.',
  },
  consort_flow: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate a CONSORT flow diagram',
    regulatoryGuidance:
      'Follow CONSORT 2010 checklist. Include enrollment, allocation, follow-up, analysis. Show n at each stage.',
  },
  process_flow: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate a process flow diagram',
    regulatoryGuidance: 'Include decision points, quality checks, and critical process parameters.',
  },
  org_chart: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate an organizational chart',
    regulatoryGuidance: 'Include reporting lines, key roles per ICH E6(R3) Principle 10 (roles, tasks and responsibilities clear and documented).',
  },
  gantt_chart: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate a Gantt chart for project timeline',
    regulatoryGuidance: 'Include regulatory milestones, critical path dependencies.',
  },
  pie_chart: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a pie chart specification',
    regulatoryGuidance: 'Include percentages and counts. Use distinct colors for each segment.',
  },
  box_plot: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a box plot specification',
    regulatoryGuidance: 'Show median, IQR, whiskers, outliers. Label axes with units.',
  },
  heatmap: {
    preferredFormat: 'svg',
    promptTemplate: 'Generate a heatmap specification',
    regulatoryGuidance: 'Include color scale legend. Label all axes.',
  },
  dose_response: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a dose-response curve',
    regulatoryGuidance:
      'Show EC50/IC50 if applicable. Include error bars. Log scale for dose axis.',
  },
  pk_concentration: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a PK concentration-time profile',
    regulatoryGuidance:
      'Show mean ± SD. Semi-log option. Include Cmax, Tmax, AUC annotations per ICH M4S.',
  },
  stability_trend: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a stability trend chart',
    regulatoryGuidance:
      'Show specification limits. Include regression line and shelf-life estimate per ICH Q1E.',
  },
  comparison_table: {
    preferredFormat: 'html-table',
    promptTemplate: 'Generate a formatted comparison table',
    regulatoryGuidance:
      'Include footnotes with statistical tests used. Bold significant differences.',
  },
  decision_tree: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate a regulatory decision tree',
    regulatoryGuidance: 'Include regulatory pathway decision criteria and references.',
  },
  custom: {
    preferredFormat: 'mermaid',
    promptTemplate: 'Generate a custom visualization',
    regulatoryGuidance: 'Follow applicable guidance for the data type.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FIGURE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A regulatory figure is drawn from data. Until 2026-09-23 a request with none
 * asked the model for "a representative template", and the model's
 * Kaplan-Meier curves, PK profiles and CONSORT counts were stored as a governed
 * artifact that document export includes. A linked document with no extracted
 * data points is no data either.
 */
/**
 * Figure types whose content is a statistical estimate — Kaplan-Meier survival
 * probabilities, hazard ratios, pooled effects with confidence intervals — and
 * so cannot be drawn by a model from raw rows without the model computing
 * them (CLAUDE.md Rule 2; until 2026-10-05 the prompt asked it to "Show HR
 * and 95% CI"). They are drawn from engine output, not generated here.
 */
const STATISTICAL_ESTIMATE_FIGURES: ReadonlySet<FigureType> = new Set<FigureType>(['kaplan_meier', 'forest_plot']);

/** A failure this service states in its own fixed sentence, safe to pass on. */
class FigureGenerationFailure extends Error {}

const refused = (error: string): FigureGenerationResult => ({ success: false, failure: 'refused', error });

const ESTIMATE_FIGURE_REFUSED: FigureGenerationResult = {
  success: false,
  failure: 'refused',
  error:
    'Kaplan-Meier curves and forest plots show statistical estimates, which come from the statistics engine, not from a model. ' +
    'No figure was generated.',
};

const NO_SOURCE_DATA: FigureGenerationResult = refused(
  'No source data was supplied, so no figure was generated. Link the data the figure should show.',
);

/** Linked sources were found, and none has a data point to draw. */
function noDataPoints(sources: Array<{ name: string }>): FigureGenerationResult {
  const one = sources.length === 1;
  const names = sources.map(s => `"${s.name}"`).join(', ');
  return refused(
    `The linked source${one ? '' : 's'} ${names} ${one ? 'has' : 'have'} no extracted data points, so no figure was generated.`,
  );
}

function hasDataPoints(sources: Array<{ data: Record<string, unknown>[] }>): boolean {
  return sources.some(src => Array.isArray(src.data) && src.data.length > 0);
}

/** Characters of serialized rows each source may put in the drafting prompt. */
const PROMPT_ROWS_CHAR_BUDGET = 3000;

const NO_ROW_FITS: FigureGenerationResult = refused(
  `No source row fits in the drafting prompt (${PROMPT_ROWS_CHAR_BUDGET} characters per source), so no figure was generated.`,
);

const GATEWAY_FAILED: FigureGenerationResult = {
  success: false,
  failure: 'gateway',
  error: 'The drafting model could not draft the figure, so no figure was generated.',
};

/**
 * The whole rows of one source that fit the prompt budget, in order. 2026-10-15:
 * the serialized rows were cut at 3000 characters, so the model could see a
 * fragment of a row and nothing recorded how many rows it saw.
 */
function rowsThatFit(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const fit: Record<string, unknown>[] = [];
  let used = 2; // the enclosing []
  for (const row of rows) {
    const cost = JSON.stringify(row).length + (fit.length > 0 ? 1 : 0);
    if (used + cost > PROMPT_ROWS_CHAR_BUDGET) break;
    fit.push(row);
    used += cost;
  }
  return fit;
}

/**
 * Why there is nothing to draw, or null when there is. 2026-10-15: an unmatched
 * or non-numeric reference was dropped silently, and a linked document with no
 * data points refused as "No source data was supplied". Each is named now.
 */
function sourceRefusal(
  sources: Array<{ name: string; data: Record<string, unknown>[] }>,
  unmatchedRefs: string[]
): FigureGenerationResult | null {
  if (unmatchedRefs.length > 0) return refused(`${unmatchedRefs.join('; ')}, so no figure was generated.`);
  if (hasDataPoints(sources)) return null;
  return sources.length > 0 ? noDataPoints(sources) : NO_SOURCE_DATA;
}

/**
 * Ask the drafting model for the figure. document_drafting: only a model
 * approved for high-risk regulatory drafting serves it. It defaulted to gpt-4o
 * as a 'general' request, and with no OpenAI key stored a placeholder figure.
 * A gateway failure, or an answer with no figure, is a 'gateway' failure with a
 * fixed sentence (2026-10-15: the gateway's own text was the reason); the
 * detail goes to the log.
 */
async function draftFigure(
  request: FigureGenerationRequest,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; model: string; tokensUsed?: number } | { failed: FigureGenerationResult }> {
  try {
    const aiResult = await ai.chat({
      taskType: 'document_drafting',
      callerModule: 'figureGeneration.generateFigure',
      organizationId: request.organizationId,
      userId: request.userId,
      projectId: request.projectId,
      temperature: 0.1,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const content = aiResult.content || '';
    if (!content.trim()) {
      return { failed: { success: false, failure: 'gateway', error: 'The drafting model returned no figure, so nothing was stored.' } };
    }
    return { content, model: aiResult.model, tokensUsed: aiResult.usage?.totalTokens };
  } catch (error) {
    console.error('[FigureService] The drafting model call failed:', error);
    return { failed: GATEWAY_FAILED };
  }
}

/**
 * Only this service's own sentences are passed on (2026-10-15: any caught
 * error's message was); anything else is stated as an internal failure.
 */
function internalFailure(error: unknown): FigureGenerationResult {
  return {
    success: false,
    failure: 'internal',
    error:
      error instanceof FigureGenerationFailure
        ? error.message
        : 'The figure could not be generated because of an internal failure, so nothing was stored.',
  };
}

/**
 * Generate a regulatory-grade figure using AI.
 */
export async function generateFigure(
  request: FigureGenerationRequest
): Promise<FigureGenerationResult> {
  const startTime = Date.now();
  const figureId = `fig-${crypto.randomUUID().slice(0, 8)}`;

  if (STATISTICAL_ESTIMATE_FIGURES.has(request.figureType)) return ESTIMATE_FIGURE_REFUSED;

  try {
    // 1. Resolve source data from Data Room if references provided
    const { sources: sourceData, unmatchedRefs } = await resolveSourceData(
      request.sourceDataRefs || [],
      request.rawData || [],
      request.projectId,
      request.organizationId
    );

    const refusal = sourceRefusal(sourceData, unmatchedRefs);
    if (refusal) return refusal;

    // The rows the model is given: whole rows within the budget, per source.
    const promptRows = sourceData.map(s => rowsThatFit(s.data));
    if (!promptRows.some(rows => rows.length > 0)) return NO_ROW_FITS;

    // 2. Get figure type config
    const typeConfig = FIGURE_TYPE_CONFIG[request.figureType] || FIGURE_TYPE_CONFIG.custom;
    const format = request.preferences?.format || typeConfig.preferredFormat;

    // 3. Determine the next figure number
    const figureNumber = await getNextFigureNumber(
      request.projectId,
      request.targetSection || 'general'
    );

    // 4. Build the prompt
    const systemPrompt = buildFigureSystemPrompt(format, request.figureType);
    const userPrompt = buildFigureUserPrompt(request, sourceData, promptRows, format, figureNumber);

    // 5. Draft the figure (see draftFigure).
    const draft = await draftFigure(request, systemPrompt, userPrompt);
    if ('failed' in draft) return draft.failed;
    const { content, model, tokensUsed } = draft;

    // 6. Build figure spec
    const figure: FigureSpec = {
      id: figureId,
      figureNumber,
      title: request.title,
      figureType: request.figureType,
      description: request.description,
      sourceData: sourceData.map((s, i) => ({
        sourceType: s.type as FigureDataSource['sourceType'],
        sourceId: s.id,
        sourceName: s.name,
        dataPoints: s.data,
        rowsSupplied: s.data.length,
        rowsSentToModel: promptRows[i].length,
        extractedAt: new Date().toISOString(),
      })),
      regulatoryContext: request.targetSection,
      generatedContent: content,
      generatedFormat: format as FigureSpec['generatedFormat'],
      metadata: {
        colorScheme: request.preferences?.colorScheme || 'default',
        footnotes: [],
        sourceReference: sourceData.map(s => s.name).join('; '),
        generatedAt: new Date().toISOString(),
        generatedByUserId: request.userId,
        modelUsed: model,
        tokensUsed,
      },
      auditTrail: [
        {
          action: 'generated',
          timestamp: new Date().toISOString(),
          userId: request.userId,
          details: `Figure generated in ${Date.now() - startTime}ms using ${model}. Type: ${request.figureType}. Format: ${format}.`,
        },
      ],
    };

    // 7. Store in database
    await storeFigure(figure, request);

    // 8. Log to audit trail
    await logFigureGeneration(request, figure, Date.now() - startTime);

    return {
      success: true,
      figure,
      insertionPoint: request.targetSection
        ? {
            sectionCode: request.targetSection,
            figureNumber,
          }
        : undefined,
    };
  } catch (error) {
    console.error('[FigureService] Generation failed:', error);
    return internalFailure(error);
  }
}

/**
 * Auto-insert figures into a section based on data analysis.
 */
export async function autoInsertFigures(params: {
  projectId: number;
  organizationId: number;
  userId: number;
  sectionCode: string;
  sectionContent: string;
}): Promise<FigureGenerationResult[]> {
  const results: FigureGenerationResult[] = [];

  // A failed or unreadable analysis is an error, never [] — which read as
  // "no figures to insert" for an analysis that did not run (2026-10-15).
  // Where figures belong in a section: suggestions only. Each one still goes
  // through generateFigure, which drafts only from source data and only with
  // an approved model.
  const analysis = await ai.chat({
    taskType: 'document_analysis',
    callerModule: 'figureGeneration.autoInsertFigures',
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a regulatory document analyst. Analyze the given section content and identify where figures/charts should be inserted to strengthen the submission. Return JSON:
{
  "figures": [
  {
    "figureType": "bar_chart|line_chart|kaplan_meier|consort_flow|process_flow|stability_trend|pk_concentration|comparison_table|forest_plot|waterfall_plot|box_plot|pie_chart|dose_response|custom",
    "title": "Figure title",
    "description": "What this figure should show",
    "insertAfterText": "First 50 chars of the paragraph this should follow",
    "dataNeeded": "What data is needed to generate this figure",
    "regulatoryJustification": "Why this figure strengthens the submission"
  }
  ]
}
Only suggest figures that are standard for this section type in regulatory submissions.`,
      },
      {
        role: 'user',
        content: `Section ${params.sectionCode}:\n\n${params.sectionContent.slice(0, 8000)}`,
      },
    ],
  });

  const analysisContent = analysis.content || '{}';
  let suggestions: {
    figures: Array<{
      figureType: string;
      title: string;
      description: string;
      insertAfterText: string;
      dataNeeded: string;
      regulatoryJustification: string;
    }>;
  };

  try {
    suggestions = JSON.parse(analysisContent);
  } catch {
    throw new Error('The figure analysis returned no readable suggestions.');
  }
  if (!suggestions || typeof suggestions !== 'object' || (suggestions.figures !== undefined && !Array.isArray(suggestions.figures))) {
    throw new Error('The figure analysis returned no readable suggestions.');
  }

  // Generate each suggested figure
  for (const suggestion of (suggestions.figures || []).slice(0, 5)) {
    const result = await generateFigure({
      projectId: params.projectId,
      organizationId: params.organizationId,
      userId: params.userId,
      figureType: (suggestion.figureType || 'custom') as FigureType,
      title: suggestion.title,
      description: `${suggestion.description}\n\nData needed: ${suggestion.dataNeeded}\nRegulatory justification: ${suggestion.regulatoryJustification}`,
      targetSection: params.sectionCode,
    });
    results.push(result);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The linked Data Room documents and the caller's rows, as sources; and, for
 * each reference that is not a document id or matched no document in this
 * project, why (`unmatchedRefs`).
 */
async function resolveSourceData(
  dataRoomRefs: string[],
  rawData: Record<string, unknown>[],
  projectId: number,
  organizationId: number
): Promise<{
  sources: Array<{ id: string; name: string; type: string; data: Record<string, unknown>[] }>;
  unmatchedRefs: string[];
}> {
  const sources: Array<{
    id: string;
    name: string;
    type: string;
    data: Record<string, unknown>[];
  }> = [];
  const refs = dataRoomRefs.map(ref => ({ ref: String(ref), id: Number(ref) }));
  const documentIds = refs.filter(r => Number.isInteger(r.id) && r.id > 0).map(r => r.id);
  const found = new Set<number>();

  // Resolve Data Room references. 2026-10-15: a failed read was logged and the
  // figure refused as "No source data was supplied" — data was supplied; the
  // read failed, and that is what the caller is told now.
  if (documentIds.length > 0) {
    const result = await pool
      .query(
        `SELECT id, title, metadata, content_type
         FROM concept2cure_artifacts
         WHERE id = ANY($1::int[]) AND project_id = $2 AND organization_id = $3`,
        [documentIds, projectId, organizationId]
      )
      .catch((error: unknown) => {
        console.error('[FigureService] Could not read the linked Data Room documents:', error);
        throw new FigureGenerationFailure('The linked Data Room documents could not be read, so no figure was generated.', { cause: error });
      });
    for (const row of result.rows) {
      found.add(Number(row.id));
      sources.push({
        id: String(row.id),
        name: row.title,
        type: 'data_room',
        data: row.metadata?.extractedData || [],
      });
    }
  }

  // Add raw data
  if (rawData.length > 0) {
    sources.push({
      id: 'raw-input',
      name: 'User-provided data',
      type: 'manual',
      data: rawData,
    });
  }

  const unmatchedRefs = refs
    .filter(r => !found.has(r.id))
    .map(r =>
      Number.isInteger(r.id) && r.id > 0
        ? `figure reference ${r.ref} matched no data source`
        : `figure reference "${r.ref}" is not a Data Room document id`
    );
  return { sources, unmatchedRefs };
}

async function getNextFigureNumber(projectId: number, sectionCode: string): Promise<string> {
  try {
    // An untargeted figure is stored with no sectionCode and numbered under
    // 'general'. 2026-10-15: the count matched 'general' only, so it was always
    // 0 and every untargeted figure was "Figure general-1".
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM concept2cure_artifacts
       WHERE project_id = $1 AND metadata->>'artifactType' = 'figure'
         AND COALESCE(metadata->>'sectionCode', 'general') = $2`,
      [projectId, sectionCode]
    );
    const count = parseInt(result.rows[0]?.count || '0', 10) + 1;
    return `Figure ${sectionCode}-${count}`;
  } catch (error) {
    // 2026-10-15: answered `Figure ${sectionCode}-1`, a number nobody assigned.
    console.error('[FigureService] Could not count existing figures:', error);
    throw new FigureGenerationFailure('The figure number could not be assigned because the existing figures could not be read, so no figure was generated.', { cause: error });
  }
}

function buildFigureSystemPrompt(format: string, figureType: FigureType): string {
  const typeConfig = FIGURE_TYPE_CONFIG[figureType] || FIGURE_TYPE_CONFIG.custom;

  const formatInstructions: Record<string, string> = {
    mermaid: `Generate ONLY valid Mermaid diagram code (no markdown code fences).
The output must be directly parseable by Mermaid.js renderer. Use graph TD, flowchart, gantt, or pie as appropriate.`,
    chartjs: `Generate ONLY a valid Chart.js configuration object as JSON.
Include: type, data (labels, datasets with data arrays, backgroundColor, borderColor), options (title, scales, legend).
The output must be directly parseable as JSON for Chart.js v4.`,
    svg: `Generate ONLY valid SVG markup.
Include proper viewBox, readable font sizes (12-14pt), and accessible colors.`,
    'html-table': `Generate ONLY an HTML table with proper thead/tbody structure.
Include regulatory footnotes below the table. Use consistent formatting.`,
  };

  return `You are a regulatory figure generation engine. ${typeConfig.promptTemplate}.

${formatInstructions[format] || formatInstructions.mermaid}

Regulatory guidance for this figure type:
${typeConfig.regulatoryGuidance}

Rules:
1. Output ONLY the figure specification — no explanatory text, no markdown fences
2. All data must be accurately represented — no fabrication. Plot only values present in the source data; compute no statistic (no mean, interval, ratio, p-value or coefficient) that is not in it
3. Include proper labels, legends, and units
4. Follow regulatory conventions for this figure type
5. Use professional color schemes suitable for regulatory submissions
6. Include source attribution in figure notes where applicable`;
}

function buildFigureUserPrompt(
  request: FigureGenerationRequest,
  sourceData: Array<{ id: string; name: string; type: string; data: Record<string, unknown>[] }>,
  promptRows: Record<string, unknown>[][],
  format: string,
  figureNumber: string
): string {
  // Whole rows only, and the model is told when it sees a subset. The
  // no-source-data "representative template" branch is gone: generateFigure
  // refuses before reaching here without data.
  const dataSection = `\n\nSource Data:\n${sourceData
    .map((s, i) => {
      const subset = promptRows[i].length < s.data.length ? ` (first ${promptRows[i].length} of ${s.data.length} rows)` : '';
      return `- ${s.name} (${s.type})${subset}: ${JSON.stringify(promptRows[i])}`;
    })
    .join('\n')}`;

  return `Generate: ${figureNumber} — ${request.title}
Type: ${request.figureType}
Format: ${format}
Description: ${request.description}${request.targetSection ? `\nTarget Section: ${request.targetSection}` : ''}${dataSection}`;
}

/** Rows supplied and rows sent to the model, summed over the figure's sources. */
function rowCounts(figure: FigureSpec): { rowsSupplied: number; rowsSentToModel: number } {
  return figure.sourceData.reduce(
    (n, s) => ({ rowsSupplied: n.rowsSupplied + s.rowsSupplied, rowsSentToModel: n.rowsSentToModel + s.rowsSentToModel }),
    { rowsSupplied: 0, rowsSentToModel: 0 }
  );
}

async function storeFigure(figure: FigureSpec, request: FigureGenerationRequest): Promise<void> {
  // 2026-10-15: a failed INSERT was logged and swallowed here, and generateFigure
  // then audited and returned as generated a figure that was never stored.
  let artifactPk: number;
  try {
    const figRes = await pool.query<{ id: number }>(
      // Named `user_id` and `content_type`, neither of which this table has —
      // they are created_by_id and type — and omitted artifact_id, type and
      // category, all NOT NULL with no default. So every generated figure
      // failed to store. Found by ci:insert-columns-declared.
      //
      // 'figure' was already the value being passed; it was simply going into a
      // column that does not exist. `category` is 'visualization' from the
      // table's own documented vocabulary (document | interactive |
      // visualization), which is what a figure is.
      `INSERT INTO concept2cure_artifacts (
        artifact_id, project_id, organization_id, created_by_id, title, content,
        content_hash, type, category, status, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'visualization', $9, $10, NOW(), NOW()) RETURNING id`,
      [
        `artifact_${crypto.randomUUID()}`,
        request.projectId,
        request.organizationId,
        request.userId,
        figure.title,
        figure.generatedContent,
        crypto.createHash('sha256').update(String(figure.generatedContent ?? '')).digest('hex'),
        'figure',
        'draft',
        JSON.stringify({
          artifactType: 'figure',
          figureId: figure.id,
          figureNumber: figure.figureNumber,
          figureType: figure.figureType,
          generatedFormat: figure.generatedFormat,
          sectionCode: figure.regulatoryContext,
          sourceData: figure.sourceData.map(s => ({
            id: s.sourceId,
            name: s.sourceName,
            rowsSupplied: s.rowsSupplied,
            rowsSentToModel: s.rowsSentToModel,
          })),
          ...figure.metadata,
        }),
      ]
    );
    artifactPk = figRes.rows[0].id;
  } catch (error) {
    console.error('[FigureService] Could not store the figure:', error);
    throw new FigureGenerationFailure('The drafted figure could not be stored, so no figure was generated.', { cause: error });
  }
  // Uniform provenance: a generated figure is a 'generation' event. Best-effort
  // beside an already-committed row, as for the other pool-level producers; a
  // failure is logged, not hidden.
  try {
    await recordArtifactProvenance(pool, {
      artifactId: artifactPk,
      organizationId: request.organizationId,
      eventType: 'generation',
      eventAction: 'figure_generate',
      actorId: request.userId,
      details: {
        figureId: figure.id,
        figureType: figure.figureType,
        ...rowCounts(figure),
        sourceIds: figure.sourceData.map(s => s.sourceId),
      },
      backendService: 'figureGenerationService',
    });
  } catch (error) {
    console.error(`[FigureService] Figure artifact ${artifactPk} is stored but its provenance event was not recorded:`, error);
  }
}

async function logFigureGeneration(
  request: FigureGenerationRequest,
  figure: FigureSpec,
  durationMs: number
): Promise<void> {
  // Chained via auditService — the previous raw INSERT named columns audit_logs
  // does not have (organization_id / entity_type / entity_id / details), so it
  // raised 42703 into a bare catch and recorded nothing.
  await auditService.logAction({
    organizationId: request.organizationId,
    userId: request.userId,
    action: 'figure_generated',
    resourceType: 'figure',
    resourceId: figure.id,
    details: {
      figureType: figure.figureType,
      generatedFormat: figure.generatedFormat,
      sectionCode: figure.regulatoryContext,
      ...rowCounts(figure),
      durationMs,
      model: figure.metadata.modelUsed,
    },
  });
}

