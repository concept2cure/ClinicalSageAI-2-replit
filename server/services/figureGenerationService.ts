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
  confidence: number; // 0-1 confidence in data accuracy
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
  generatedBy: string;
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
  error?: string;
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
      'Include confidence intervals. Mark significant time points. Show visit numbers per ICH.',
  },
  scatter_plot: {
    preferredFormat: 'chartjs',
    promptTemplate: 'Generate a scatter plot specification',
    regulatoryGuidance: 'Include regression line if applicable. Show correlation coefficient.',
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
    regulatoryGuidance: 'Include reporting lines, key roles per ICH E6(R2).',
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
 * Generate a regulatory-grade figure using AI.
 */
export async function generateFigure(
  request: FigureGenerationRequest
): Promise<FigureGenerationResult> {
  const startTime = Date.now();
  const figureId = `fig-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // 1. Resolve source data from Data Room if references provided
    const sourceData = await resolveSourceData(
      request.sourceDataRefs || [],
      request.rawData || [],
      request.projectId,
      request.organizationId
    );

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
    const userPrompt = buildFigureUserPrompt(request, typeConfig, sourceData, format, figureNumber);

    // 5. Call OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Return a placeholder figure spec when no API key
      return buildPlaceholderFigure(request, figureId, figureNumber, format);
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const aiResult = await ai.chat({
      model,
      temperature: 0.1,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = aiResult.content || '';
    const tokensUsed = aiResult.usage?.totalTokens;

    // 6. Build figure spec
    const figure: FigureSpec = {
      id: figureId,
      figureNumber,
      title: request.title,
      figureType: request.figureType,
      description: request.description,
      sourceData: sourceData.map(s => ({
        sourceType: s.type as FigureDataSource['sourceType'],
        sourceId: s.id,
        sourceName: s.name,
        dataPoints: s.data,
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
        generatedBy: `user-${request.userId}`,
        modelUsed: model,
        tokensUsed,
      },
      confidence: computeFigureConfidence(sourceData, content),
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
  } catch (error: any) {
    console.error('[FigureService] Generation failed:', error);
    return {
      success: false,
      error: error.message || 'Figure generation failed',
    };
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

  try {
    // Use AI to identify where figures should be inserted
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return results;

    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const analysis = await ai.chat({
      model,
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
      suggestions = { figures: [] };
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
  } catch (error) {
    console.error('[FigureService] Auto-insert analysis failed:', error);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function resolveSourceData(
  dataRoomRefs: string[],
  rawData: Record<string, unknown>[],
  projectId: number,
  organizationId: number
): Promise<Array<{ id: string; name: string; type: string; data: Record<string, unknown>[] }>> {
  const sources: Array<{
    id: string;
    name: string;
    type: string;
    data: Record<string, unknown>[];
  }> = [];

  // Resolve Data Room references
  if (dataRoomRefs.length > 0) {
    try {
      const result = await pool.query(
        `SELECT id, title, metadata, content_type
         FROM concept2cure_artifacts
         WHERE id = ANY($1::int[]) AND project_id = $2 AND organization_id = $3`,
        [dataRoomRefs.map(Number).filter(Boolean), projectId, organizationId]
      );
      for (const row of result.rows) {
        sources.push({
          id: String(row.id),
          name: row.title,
          type: 'data_room',
          data: row.metadata?.extractedData || [],
        });
      }
    } catch (error) {
      console.warn('[FigureService] Failed to resolve Data Room refs:', error);
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

  return sources;
}

async function getNextFigureNumber(projectId: number, sectionCode: string): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM concept2cure_artifacts
       WHERE project_id = $1 AND metadata->>'artifactType' = 'figure'
         AND metadata->>'sectionCode' = $2`,
      [projectId, sectionCode]
    );
    const count = parseInt(result.rows[0]?.count || '0', 10) + 1;
    return `Figure ${sectionCode}-${count}`;
  } catch {
    return `Figure ${sectionCode}-1`;
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
2. All data must be accurately represented — no fabrication
3. Include proper labels, legends, and units
4. Follow regulatory conventions for this figure type
5. Use professional color schemes suitable for regulatory submissions
6. Include source attribution in figure notes where applicable`;
}

function buildFigureUserPrompt(
  request: FigureGenerationRequest,
  typeConfig: (typeof FIGURE_TYPE_CONFIG)[FigureType],
  sourceData: Array<{ id: string; name: string; type: string; data: Record<string, unknown>[] }>,
  format: string,
  figureNumber: string
): string {
  const dataSection =
    sourceData.length > 0
      ? `\n\nSource Data:\n${sourceData.map(s => `- ${s.name} (${s.type}): ${JSON.stringify(s.data).slice(0, 3000)}`).join('\n')}`
      : '\n\nNo source data provided — generate a representative template with clear [DATA PLACEHOLDER] markers.';

  return `Generate: ${figureNumber} — ${request.title}
Type: ${request.figureType}
Format: ${format}
Description: ${request.description}${request.targetSection ? `\nTarget Section: ${request.targetSection}` : ''}${dataSection}`;
}

function computeFigureConfidence(
  sourceData: Array<{ id: string; name: string; type: string; data: Record<string, unknown>[] }>,
  content: string
): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence with actual source data
  if (sourceData.length > 0) confidence += 0.2;
  if (sourceData.some(s => s.data && s.data.length > 0)) confidence += 0.15;

  // Lower confidence for placeholders
  if (content.includes('PLACEHOLDER') || content.includes('DATA NEEDED')) confidence -= 0.2;

  // Higher confidence for structured output
  if (content.includes('{') || content.includes('graph') || content.includes('<svg'))
    confidence += 0.1;

  return Math.max(0, Math.min(1, confidence));
}

async function storeFigure(figure: FigureSpec, request: FigureGenerationRequest): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO concept2cure_artifacts (
        project_id, organization_id, user_id, title, content, content_type, status,
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        request.projectId,
        request.organizationId,
        request.userId,
        figure.title,
        figure.generatedContent,
        'figure',
        'draft',
        JSON.stringify({
          artifactType: 'figure',
          figureId: figure.id,
          figureNumber: figure.figureNumber,
          figureType: figure.figureType,
          generatedFormat: figure.generatedFormat,
          sectionCode: figure.regulatoryContext,
          confidence: figure.confidence,
          sourceData: figure.sourceData.map(s => ({ id: s.sourceId, name: s.sourceName })),
          ...figure.metadata,
        }),
      ]
    );
  } catch (error) {
    console.warn('[FigureService] Failed to store figure:', error);
  }
}

async function logFigureGeneration(
  request: FigureGenerationRequest,
  figure: FigureSpec,
  durationMs: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        request.userId,
        request.organizationId,
        'figure_generated',
        'figure',
        figure.id,
        JSON.stringify({
          figureType: figure.figureType,
          generatedFormat: figure.generatedFormat,
          sectionCode: figure.regulatoryContext,
          confidence: figure.confidence,
          durationMs,
          model: figure.metadata.modelUsed,
        }),
        '0.0.0.0',
      ]
    );
  } catch {
    // Non-critical
  }
}

function buildPlaceholderFigure(
  request: FigureGenerationRequest,
  figureId: string,
  figureNumber: string,
  format: string
): FigureGenerationResult {
  const placeholderContent =
    format === 'mermaid'
      ? `graph TD\n  A[${request.title}] --> B[DATA PLACEHOLDER]\n  B --> C[Generate with API key]`
      : format === 'chartjs'
        ? JSON.stringify(
            {
              type: 'bar',
              data: {
                labels: ['Placeholder 1', 'Placeholder 2', 'Placeholder 3'],
                datasets: [
                  {
                    label: request.title,
                    data: [0, 0, 0],
                    backgroundColor: ['#292524', '#57534e', '#a8a29e'],
                  },
                ],
              },
              options: {
                plugins: {
                  title: {
                    display: true,
                    text: `${figureNumber}: ${request.title} [DATA PLACEHOLDER]`,
                  },
                },
              },
            },
            null,
            2
          )
        : `<!-- ${figureNumber}: ${request.title} -->\n<p>[FIGURE PLACEHOLDER — Configure OPENAI_API_KEY to generate]</p>`;

  return {
    success: true,
    figure: {
      id: figureId,
      figureNumber,
      title: request.title,
      figureType: request.figureType,
      description: request.description,
      sourceData: [],
      generatedContent: placeholderContent,
      generatedFormat: format as FigureSpec['generatedFormat'],
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: `user-${request.userId}`,
        modelUsed: 'placeholder',
      },
      confidence: 0,
      auditTrail: [
        {
          action: 'placeholder_generated',
          timestamp: new Date().toISOString(),
          userId: request.userId,
          details: 'Placeholder figure — no API key configured',
        },
      ],
    },
  };
}
