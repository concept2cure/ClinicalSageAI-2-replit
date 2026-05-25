import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import pdfParse from '../utils/pdfParse';
import { extractRawText } from 'mammoth';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { analyzeText, isApiKeyAvailable } from '../openai-service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

type ExtractedDocument = {
  filename: string;
  mimeType: string;
  size: number;
  text: string;
  extractionMethod: string;
};

type ModuleDraft = {
  source: 'ai' | 'template';
  content: string;
};

type ModuleEvidence = {
  filename: string;
  score: number;
  excerpt: string;
};

type ModuleAssessment = {
  confidence: 'high' | 'medium' | 'low';
  relevanceScore: number;
  evidence: ModuleEvidence[];
};

type IndWorkflowArtifact = {
  projectId: string;
  templateId: number;
  projectName: string;
  specialization: string;
  moduleDrafts: Record<string, ModuleDraft>;
  moduleAssessments: Record<string, ModuleAssessment>;
  reviewActions: Record<string, 'pending' | 'accepted' | 'needs_revision' | 'rewrite'>;
  editorJson: { type: 'doc'; content: any[] };
  docxBuffer: Buffer;
  createdAt: string;
};

type KpiEventName =
  | 'upload_started'
  | 'draft_generated'
  | 'section_accepted'
  | 'section_rewritten'
  | 'export_triggered';

type KpiEvent = {
  id: string;
  eventName: KpiEventName;
  projectId: string | null;
  payload: Record<string, any>;
  createdAt: string;
};

const generatedWorkflowArtifacts = new Map<string, IndWorkflowArtifact>();
const kpiEvents: KpiEvent[] = [];

const SUPPORTED_KPI_EVENTS = new Set<KpiEventName>([
  'upload_started',
  'draft_generated',
  'section_accepted',
  'section_rewritten',
  'export_triggered',
]);

function recordKpiEvent(
  eventName: KpiEventName,
  options: { projectId?: string | null; payload?: Record<string, any> } = {}
) {
  const event: KpiEvent = {
    id: uuidv4(),
    eventName,
    projectId: options.projectId || null,
    payload: options.payload || {},
    createdAt: new Date().toISOString(),
  };

  kpiEvents.push(event);

  if (kpiEvents.length > 5000) {
    kpiEvents.splice(0, kpiEvents.length - 5000);
  }

  return event;
}

function countEvents(eventName: KpiEventName, sinceMs?: number): number {
  const now = Date.now();
  return kpiEvents.filter(event => {
    if (event.eventName !== eventName) return false;
    if (!sinceMs) return true;
    return now - new Date(event.createdAt).getTime() <= sinceMs;
  }).length;
}

function countEventsBySource(source: string, sinceMs?: number): number {
  const now = Date.now();
  return kpiEvents.filter(event => {
    const eventSource = String(event.payload?.source || 'standard_flow');
    if (eventSource !== source) return false;
    if (!sinceMs) return true;
    return now - new Date(event.createdAt).getTime() <= sinceMs;
  }).length;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeKpiPayload(payload: unknown): Record<string, any> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 25);
  const safePayload: Record<string, any> = {};

  for (const [key, value] of entries) {
    const safeKey = String(key).slice(0, 60);

    if (value === null || value === undefined) {
      safePayload[safeKey] = null;
      continue;
    }

    if (typeof value === 'string') {
      safePayload[safeKey] = value.slice(0, 500);
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      safePayload[safeKey] = value;
      continue;
    }

    if (Array.isArray(value)) {
      safePayload[safeKey] = value
        .slice(0, 20)
        .map(item =>
          typeof item === 'string'
            ? item.slice(0, 120)
            : typeof item === 'number' || typeof item === 'boolean'
              ? item
              : '[complex]'
        );
      continue;
    }

    if (typeof value === 'object') {
      const nestedEntries = Object.entries(value as Record<string, unknown>).slice(0, 10);
      safePayload[safeKey] = Object.fromEntries(
        nestedEntries.map(([nestedKey, nestedValue]) => {
          const safeNestedKey = String(nestedKey).slice(0, 60);
          if (typeof nestedValue === 'string') return [safeNestedKey, nestedValue.slice(0, 120)];
          if (typeof nestedValue === 'number' || typeof nestedValue === 'boolean') {
            return [safeNestedKey, nestedValue];
          }
          return [safeNestedKey, '[complex]'];
        })
      );
      continue;
    }

    safePayload[safeKey] = '[unsupported]';
  }

  return safePayload;
}

function buildKpiTrends(days = 7) {
  const trendDays = Array.from({ length: days }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (days - 1 - index));
    return day;
  });

  const rows = trendDays.map(day => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const byEvent = (eventName: KpiEventName) =>
      kpiEvents.filter(event => {
        if (event.eventName !== eventName) return false;
        const eventTs = new Date(event.createdAt).getTime();
        return eventTs >= dayStart && eventTs < dayEnd;
      }).length;

    return {
      date: day.toISOString().slice(0, 10),
      uploadStarted: byEvent('upload_started'),
      draftGenerated: byEvent('draft_generated'),
      sectionAccepted: byEvent('section_accepted'),
      sectionRewritten: byEvent('section_rewritten'),
      exportTriggered: byEvent('export_triggered'),
    };
  });

  return rows;
}

function safePercent(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countEventsInRange(eventName: KpiEventName, startMs: number, endMs: number): number {
  return kpiEvents.filter(event => {
    if (event.eventName !== eventName) return false;
    const eventTs = new Date(event.createdAt).getTime();
    return eventTs >= startMs && eventTs < endMs;
  }).length;
}

function countEventsBySourceInRange(source: string, startMs: number, endMs: number): number {
  return kpiEvents.filter(event => {
    const eventSource = String(event.payload?.source || 'standard_flow');
    if (eventSource !== source) return false;
    const eventTs = new Date(event.createdAt).getTime();
    return eventTs >= startMs && eventTs < endMs;
  }).length;
}

const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
]);

const MODULE_KEYWORDS: Record<string, string[]> = {
  Protocol: ['protocol', 'endpoint', 'eligibility', 'randomization', 'visit', 'statistical'],
  CMC: ['cmc', 'manufacturing', 'drug substance', 'drug product', 'stability', 'specification'],
  IB: ['investigator brochure', 'ib', 'nonclinical', 'clinical pharmacology', 'safety'],
  'FDA Forms': ['1571', '1572', '3674', 'fda form', 'financial disclosure'],
  'Cover Letter': ['cover letter', 'submission', 'request', 'investigational new drug'],
  'Orphan Designation': ['orphan', 'rare disease', 'prevalence', 'orphan designation'],
  'DSUR Template': ['dsur', 'development safety update report', 'annual safety report'],
  'Safety Monitoring': ['safety monitoring', 'dsmb', 'adverse event', 'sae', 'stopping rule'],
  'Advanced CMC': ['cell therapy', 'gene therapy', 'vector', 'potency', 'sterility'],
  'Manufacturing Controls': ['batch record', 'release test', 'process control', 'quality control'],
  'Accelerated Approval Sections': ['accelerated approval', 'breakthrough', 'surrogate endpoint'],
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars)}...`;
}

async function extractExcelText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: string[] = [];
  workbook.eachSheet(worksheet => {
    const rows: string[] = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
      const rowValues = Array.isArray(row.values) ? row.values : [];
      const values = rowValues
        .slice(1)
        .map((value: unknown) => (value === null || value === undefined ? '' : String(value)))
        .join(', ')
        .trim();
      if (values.length > 0) rows.push(values);
    });

    if (rows.length > 0) {
      sheets.push(`Sheet ${worksheet.name}:\n${rows.join('\n')}`);
    }
  });

  return sheets.join('\n\n');
}

async function extractDocumentText(file: Express.Multer.File): Promise<ExtractedDocument> {
  const extension = path.extname(file.originalname).toLowerCase();
  const baseDoc = {
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };

  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  if (extension === '.pdf') {
    const parsed = await pdfParse(file.buffer);
    return {
      ...baseDoc,
      extractionMethod: 'pdf-parse',
      text: normalizeWhitespace(parsed.text || ''),
    };
  }

  if (extension === '.docx' || extension === '.doc') {
    const result = await extractRawText({ buffer: file.buffer });
    return {
      ...baseDoc,
      extractionMethod: 'mammoth',
      text: normalizeWhitespace(result.value || ''),
    };
  }

  if (extension === '.xlsx' || extension === '.xls') {
    const text = await extractExcelText(file.buffer);
    return {
      ...baseDoc,
      extractionMethod: 'exceljs',
      text: normalizeWhitespace(text),
    };
  }

  if (extension === '.csv' || extension === '.txt') {
    return {
      ...baseDoc,
      extractionMethod: 'utf8',
      text: normalizeWhitespace(file.buffer.toString('utf8')),
    };
  }

  throw new Error(`No extraction strategy for ${extension}`);
}

function scoreDocumentForModule(moduleName: string, documentText: string): number {
  const keywords = MODULE_KEYWORDS[moduleName] || [];
  if (keywords.length === 0) return 0;

  const lowered = documentText.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (lowered.includes(keyword.toLowerCase())) {
      return score + 1;
    }
    return score;
  }, 0);
}

function rankDocumentsForModule(
  moduleName: string,
  docs: ExtractedDocument[]
): Array<{ doc: ExtractedDocument; score: number }> {
  return docs
    .map(doc => ({
      doc,
      score: scoreDocumentForModule(moduleName, doc.text),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter(item => item.doc.text.length > 0);
}

function buildContextForModule(moduleName: string, docs: ExtractedDocument[]): string {
  const ranked = rankDocumentsForModule(moduleName, docs);

  if (ranked.length === 0) return '';

  return ranked
    .map(item => {
      const excerpt = truncate(item.doc.text, 3500);
      return `Source: ${item.doc.filename}\nRelevance Score: ${item.score}\n${excerpt}`;
    })
    .join('\n\n---\n\n');
}

function toConfidenceLabel(score: number, hasEvidence: boolean): 'high' | 'medium' | 'low' {
  if (!hasEvidence) return 'low';
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function buildModuleAssessment(moduleName: string, docs: ExtractedDocument[]): ModuleAssessment {
  const ranked = rankDocumentsForModule(moduleName, docs);
  const relevanceScore = ranked.reduce((sum, item) => sum + item.score, 0);

  return {
    confidence: toConfidenceLabel(relevanceScore, ranked.length > 0),
    relevanceScore,
    evidence: ranked.map(item => ({
      filename: item.doc.filename,
      score: item.score,
      excerpt: truncate(item.doc.text, 260),
    })),
  };
}

async function generateModuleDraft(
  moduleName: string,
  projectName: string,
  specialization: string,
  sourceContext: string
): Promise<{ content: string; source: 'ai' | 'template' }> {
  if (!sourceContext) {
    return {
      source: 'template',
      content: `Draft for ${moduleName} (${specialization}) for project ${projectName}. Upload source documents to generate a data-grounded draft.`,
    };
  }

  if (!isApiKeyAvailable()) {
    return {
      source: 'template',
      content: `Auto-draft for ${moduleName} based on uploaded materials:\n\n${truncate(sourceContext, 2500)}\n\n(Enable OPENAI_API_KEY for full narrative generation.)`,
    };
  }

  const prompt = [
    `You are an expert IND regulatory writer.`,
    `Generate a concise but submission-ready draft section for module: ${moduleName}.`,
    `Project: ${projectName}`,
    `Specialization: ${specialization}`,
    `Rules: use only information from the supplied source context, do not invent facts, preserve uncertainty where data is missing, and structure output with clear headings and bullet points when useful.`,
    `Source context:`,
    sourceContext,
  ].join('\n\n');

  const content = await analyzeText(
    prompt,
    'You write FDA-ready IND module content grounded strictly in provided evidence.',
    0.2,
    1800
  );

  return {
    source: 'ai',
    content: content || `Draft generation returned empty output for ${moduleName}.`,
  };
}

function buildTipTapNodes(title: string, content: string): any[] {
  const nodes: any[] = [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: title }],
    },
  ];

  const lines = content.split('\n');
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];

    if (line.startsWith('## ')) {
      nodes.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.replace(/^## /, '') }],
      });
    } else if (line.startsWith('### ')) {
      nodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.replace(/^### /, '') }],
      });
    } else if (line.startsWith('- ')) {
      const listItems: any[] = [];
      while (lineIndex < lines.length && lines[lineIndex].startsWith('- ')) {
        listItems.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[lineIndex].replace(/^- /, '') }],
            },
          ],
        });
        lineIndex += 1;
      }
      nodes.push({ type: 'bulletList', content: listItems });
      continue;
    } else if (line.trim()) {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      });
    }

    lineIndex += 1;
  }

  return nodes;
}

function buildCanvasEditorJson(moduleDrafts: Record<string, ModuleDraft>): {
  type: 'doc';
  content: any[];
} {
  const contentNodes: any[] = [];

  for (const [moduleName, draft] of Object.entries(moduleDrafts)) {
    const nodes = buildTipTapNodes(moduleName, draft.content || '');
    contentNodes.push(...nodes);
  }

  return {
    type: 'doc',
    content: contentNodes,
  };
}

async function buildDocxFromModuleDrafts(
  projectName: string,
  specialization: string,
  moduleDrafts: Record<string, ModuleDraft>
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: projectName, bold: true })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Specialization: ${specialization}` })],
    }),
    new Paragraph({ text: '' }),
  ];

  for (const [moduleName, draft] of Object.entries(moduleDrafts)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: moduleName, bold: true })],
      })
    );

    const lines = (draft.content || '').split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      children.push(new Paragraph({ text: 'No content generated.' }));
      continue;
    }

    for (const line of lines) {
      children.push(new Paragraph({ text: line }));
    }

    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// IND template configurations
const indTemplates = {
  1: {
    id: 1,
    title: 'Oncology IND Full Solution',
    description:
      'End-to-end templates for oncology INDs, including protocol templates, CMC documentation, and regulatory response examples.',
    modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Cover Letter'],
    specialization: 'Oncology',
    files: [
      'templates/oncology/protocol_template.docx',
      'templates/oncology/cmc_template.docx',
      'templates/oncology/investigator_brochure.docx',
      'templates/oncology/fda_forms.zip',
      'templates/oncology/cover_letter.docx',
    ],
  },
  2: {
    id: 2,
    title: 'Rare Disease IND Package',
    description:
      'Comprehensive package for rare disease indications with orphan drug designation elements and regulatory pathways.',
    modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Orphan Designation', 'Cover Letter'],
    specialization: 'Rare Disease',
    files: [
      'templates/rare_disease/protocol_template.docx',
      'templates/rare_disease/cmc_template.docx',
      'templates/rare_disease/investigator_brochure.docx',
      'templates/rare_disease/orphan_designation.docx',
      'templates/rare_disease/fda_forms.zip',
      'templates/rare_disease/cover_letter.docx',
    ],
  },
  3: {
    id: 3,
    title: 'First-in-Human IND Template',
    description:
      'Templates designed specifically for Phase 1 first-in-human studies with robust safety monitoring provisions.',
    modules: [
      'Protocol',
      'CMC',
      'IB',
      'FDA Forms',
      'DSUR Template',
      'Safety Monitoring',
      'Cover Letter',
    ],
    specialization: 'Phase 1',
    files: [
      'templates/first_in_human/protocol_template.docx',
      'templates/first_in_human/cmc_template.docx',
      'templates/first_in_human/investigator_brochure.docx',
      'templates/first_in_human/dsur_template.docx',
      'templates/first_in_human/safety_monitoring.docx',
      'templates/first_in_human/fda_forms.zip',
      'templates/first_in_human/cover_letter.docx',
    ],
  },
  4: {
    id: 4,
    title: 'Advanced Therapy IND (Cell/Gene)',
    description:
      'Specialized IND package for cell and gene therapies with comprehensive CMC and manufacturing documentation.',
    modules: [
      'Protocol',
      'Advanced CMC',
      'IB',
      'FDA Forms',
      'Manufacturing Controls',
      'Cover Letter',
    ],
    specialization: 'Cell/Gene Therapy',
    files: [
      'templates/advanced_therapy/protocol_template.docx',
      'templates/advanced_therapy/advanced_cmc.docx',
      'templates/advanced_therapy/investigator_brochure.docx',
      'templates/advanced_therapy/manufacturing_controls.docx',
      'templates/advanced_therapy/fda_forms.zip',
      'templates/advanced_therapy/cover_letter.docx',
    ],
  },
  5: {
    id: 5,
    title: 'Infectious Disease IND Solution',
    description:
      'IND package with special considerations for infectious disease indications including accelerated pathway elements.',
    modules: [
      'Protocol',
      'CMC',
      'IB',
      'FDA Forms',
      'Accelerated Approval Sections',
      'Cover Letter',
    ],
    specialization: 'Infectious Disease',
    files: [
      'templates/infectious_disease/protocol_template.docx',
      'templates/infectious_disease/cmc_template.docx',
      'templates/infectious_disease/investigator_brochure.docx',
      'templates/infectious_disease/accelerated_approval.docx',
      'templates/infectious_disease/fda_forms.zip',
      'templates/infectious_disease/cover_letter.docx',
    ],
  },
};

// IND module configurations
const indModules = {
  1: {
    id: 1,
    name: 'Protocol Template',
    description:
      'Comprehensive clinical protocol template with statistical sections, safety monitoring, and dosing schemas.',
    files: [
      'modules/protocol/clinical_protocol_template.docx',
      'modules/protocol/statistical_analysis_plan.docx',
      'modules/protocol/safety_monitoring_plan.docx',
      'modules/protocol/dosing_schema_template.docx',
    ],
  },
  2: {
    id: 2,
    name: 'CMC Documentation',
    description:
      'Chemistry, manufacturing, and controls documentation templates with compliant formatting and structure.',
    files: [
      'modules/cmc/drug_substance_template.docx',
      'modules/cmc/drug_product_template.docx',
      'modules/cmc/manufacturing_info.docx',
      'modules/cmc/analytical_procedures.docx',
    ],
  },
  3: {
    id: 3,
    name: "Investigator's Brochure",
    description:
      'Standardized IB template with clinical and non-clinical data presentation frameworks.',
    files: [
      'modules/investigator_brochure/ib_template.docx',
      'modules/investigator_brochure/clinical_data_summary.docx',
      'modules/investigator_brochure/nonclinical_data_summary.docx',
    ],
  },
  4: {
    id: 4,
    name: 'FDA Forms Package',
    description:
      'Complete set of FDA forms (1571, 1572, 3674, etc.) with guidance on proper completion.',
    files: [
      'modules/fda_forms/form_1571.pdf',
      'modules/fda_forms/form_1572.pdf',
      'modules/fda_forms/form_3674.pdf',
      'modules/fda_forms/completion_guide.docx',
    ],
  },
  5: {
    id: 5,
    name: 'Cover Letter Templates',
    description:
      'Industry-standard cover letter templates for initial submissions, amendments, and responses to information requests.',
    files: [
      'modules/cover_letters/initial_submission_template.docx',
      'modules/cover_letters/amendment_template.docx',
      'modules/cover_letters/ir_response_template.docx',
    ],
  },
};

// Create template files if they don't exist
async function ensureTemplateFiles() {
  const templatesDir = path.join(process.cwd(), 'templates');

  try {
    await fs.access(templatesDir);
  } catch {
    await fs.mkdir(templatesDir, { recursive: true });
  }

  // Create sample template content
  const sampleTemplateContent = `
# IND Template Document

This is a professional IND template document created by Concept2Cure™.

## Contents:
- FDA-compliant formatting
- Regulatory guidance integration
- Professional structure
- Ready for customization

Generated: ${new Date().toISOString()}
Template ID: {TEMPLATE_ID}
`;

  // Create template files for each category
  for (const template of Object.values(indTemplates)) {
    for (const file of template.files) {
      const filePath = path.join(templatesDir, file);
      const fileDir = path.dirname(filePath);

      try {
        await fs.access(fileDir);
      } catch {
        await fs.mkdir(fileDir, { recursive: true });
      }

      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(
          filePath,
          sampleTemplateContent.replace('{TEMPLATE_ID}', template.id.toString())
        );
      }
    }
  }
}

// Get IND stats
router.get('/stats', async (req, res) => {
  try {
    const requestedWindow = Number.parseInt(String(req.query.windowDays || '7'), 10);
    const safeWindowDays = Number.isFinite(requestedWindow)
      ? Math.min(Math.max(requestedWindow, 7), 30)
      : 7;
    const trendRows = buildKpiTrends(safeWindowDays);
    const nowMs = Date.now();
    const windowMs = safeWindowDays * 24 * 60 * 60 * 1000;
    const currentWindowStartMs = nowMs - windowMs;
    const previousWindowStartMs = currentWindowStartMs - windowMs;

    const windowTotals = trendRows.reduce(
      (acc, row) => {
        acc.uploadStarted += row.uploadStarted;
        acc.draftGenerated += row.draftGenerated;
        acc.sectionAccepted += row.sectionAccepted;
        acc.sectionRewritten += row.sectionRewritten;
        acc.exportTriggered += row.exportTriggered;
        return acc;
      },
      {
        uploadStarted: 0,
        draftGenerated: 0,
        sectionAccepted: 0,
        sectionRewritten: 0,
        exportTriggered: 0,
      }
    );

    const lifetimeTotals = {
      draftGenerated: countEvents('draft_generated'),
      sectionAccepted: countEvents('section_accepted'),
      sectionRewritten: countEvents('section_rewritten'),
      exportTriggered: countEvents('export_triggered'),
    };

    const previousWindowTotals = {
      draftGenerated: countEventsInRange(
        'draft_generated',
        previousWindowStartMs,
        currentWindowStartMs
      ),
      sectionAccepted: countEventsInRange(
        'section_accepted',
        previousWindowStartMs,
        currentWindowStartMs
      ),
      sectionRewritten: countEventsInRange(
        'section_rewritten',
        previousWindowStartMs,
        currentWindowStartMs
      ),
      exportTriggered: countEventsInRange(
        'export_triggered',
        previousWindowStartMs,
        currentWindowStartMs
      ),
    };

    const currentInterventionCounts = {
      standardFlow: countEventsBySourceInRange('standard_flow', currentWindowStartMs, nowMs),
      riskAlert: countEventsBySourceInRange('kpi_risk_alert', currentWindowStartMs, nowMs),
    };

    const previousInterventionCounts = {
      standardFlow: countEventsBySourceInRange(
        'standard_flow',
        previousWindowStartMs,
        currentWindowStartMs
      ),
      riskAlert: countEventsBySourceInRange(
        'kpi_risk_alert',
        previousWindowStartMs,
        currentWindowStartMs
      ),
    };

    const currentInterventionShare = safePercent(
      currentInterventionCounts.riskAlert,
      currentInterventionCounts.riskAlert + currentInterventionCounts.standardFlow
    );

    const previousInterventionShare = safePercent(
      previousInterventionCounts.riskAlert,
      previousInterventionCounts.riskAlert + previousInterventionCounts.standardFlow
    );

    const currentAcceptanceRatio = safePercent(
      windowTotals.sectionAccepted,
      windowTotals.sectionAccepted + windowTotals.sectionRewritten
    );

    const previousAcceptanceRatio = safePercent(
      previousWindowTotals.sectionAccepted,
      previousWindowTotals.sectionAccepted + previousWindowTotals.sectionRewritten
    );

    const currentDraftToExportConversion = safePercent(
      windowTotals.exportTriggered,
      windowTotals.draftGenerated
    );

    const previousDraftToExportConversion = safePercent(
      previousWindowTotals.exportTriggered,
      previousWindowTotals.draftGenerated
    );

    const stats = {
      totalSubmissions: 842,
      successRate: 98.4,
      averagePreparationTime: 14.2,
      avgCostSavings: 187500,
      templatesDownloaded: 1247,
      activeProjects: 156,
      kpiEvents: {
        totalTracked: kpiEvents.length,
        uploadStarted: countEvents('upload_started'),
        draftGenerated: countEvents('draft_generated'),
        sectionAccepted: countEvents('section_accepted'),
        sectionRewritten: countEvents('section_rewritten'),
        exportTriggered: countEvents('export_triggered'),
        last24Hours: {
          uploadStarted: countEvents('upload_started', 24 * 60 * 60 * 1000),
          draftGenerated: countEvents('draft_generated', 24 * 60 * 60 * 1000),
          sectionAccepted: countEvents('section_accepted', 24 * 60 * 60 * 1000),
          sectionRewritten: countEvents('section_rewritten', 24 * 60 * 60 * 1000),
          exportTriggered: countEvents('export_triggered', 24 * 60 * 60 * 1000),
        },
      },
      kpiTrends: {
        windowDays: safeWindowDays,
        rows: trendRows,
      },
      kpiDerived: {
        window: {
          acceptanceRatio: currentAcceptanceRatio,
          draftToExportConversion: currentDraftToExportConversion,
        },
        lifetime: {
          acceptanceRatio: safePercent(
            lifetimeTotals.sectionAccepted,
            lifetimeTotals.sectionAccepted + lifetimeTotals.sectionRewritten
          ),
          draftToExportConversion: safePercent(
            lifetimeTotals.exportTriggered,
            lifetimeTotals.draftGenerated
          ),
        },
      },
      kpiAttribution: {
        total: {
          standardFlow: countEventsBySource('standard_flow'),
          riskAlert: countEventsBySource('kpi_risk_alert'),
        },
        last24Hours: {
          standardFlow: countEventsBySource('standard_flow', 24 * 60 * 60 * 1000),
          riskAlert: countEventsBySource('kpi_risk_alert', 24 * 60 * 60 * 1000),
        },
      },
      kpiDeltas: {
        windowDays: safeWindowDays,
        acceptanceRatioDelta:
          Math.round((currentAcceptanceRatio - previousAcceptanceRatio) * 10) / 10,
        draftToExportConversionDelta:
          Math.round((currentDraftToExportConversion - previousDraftToExportConversion) * 10) / 10,
        interventionShareDelta:
          Math.round((currentInterventionShare - previousInterventionShare) * 10) / 10,
      },
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch IND stats' });
  }
});

router.post('/events', async (req, res) => {
  try {
    const eventName = String(req.body?.eventName || '').trim() as KpiEventName;
    const projectIdRaw = req.body?.projectId ? String(req.body.projectId) : null;
    const projectId = projectIdRaw && isUuid(projectIdRaw) ? projectIdRaw : null;
    const payload = sanitizeKpiPayload(req.body?.payload);

    if (!SUPPORTED_KPI_EVENTS.has(eventName)) {
      return res.status(400).json({ error: 'Unsupported eventName' });
    }

    if (projectIdRaw && !projectId) {
      return res.status(400).json({ error: 'Invalid projectId format' });
    }

    const event = recordKpiEvent(eventName, { projectId, payload });
    return res.status(201).json({ success: true, event });
  } catch (error: any) {
    console.error('KPI event ingestion error:', error);
    return res.status(500).json({ error: 'Failed to record KPI event' });
  }
});

// Download template package
router.get('/template/:id/download', async (req, res) => {
  try {
    const templateId = parseInt(String(req.params.id));
    const template = indTemplates[templateId as keyof typeof indTemplates];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await ensureTemplateFiles();

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.attachment(`IND_Template_${templateId}_${template.specialization}.zip`);
    archive.pipe(res);

    // Add template files to archive
    for (const file of template.files) {
      const filePath = path.join(process.cwd(), 'templates', file);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: path.basename(file) });
      } catch (error) {
        console.warn(`Template file not found: ${filePath}`);
      }
    }

    // Add readme file
    const readme = `
# ${template.title}

${template.description}

## Included Modules:
${template.modules.map((module: any) => `- ${module}`).join('\n')}

## Specialization: ${template.specialization}

## Usage Instructions:
1. Extract all files to your working directory
2. Customize templates with your specific data
3. Follow FDA guidance for submission requirements
4. Use Concept2Cure™ platform for submission management

Generated: ${new Date().toISOString()}
Template Package ID: ${templateId}
`;

    archive.append(readme, { name: 'README.md' });
    archive.finalize();
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// Download module package
router.get('/module/:id/download', async (req, res) => {
  try {
    const moduleId = parseInt(String(req.params.id));
    const module = indModules[moduleId as keyof typeof indModules];

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    await ensureTemplateFiles();

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.attachment(`IND_Module_${moduleId}_${module.name.replace(/\s+/g, '_')}.zip`);
    archive.pipe(res);

    // Add module files to archive
    for (const file of module.files) {
      const filePath = path.join(process.cwd(), 'templates', file);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: path.basename(file) });
      } catch (error) {
        console.warn(`Module file not found: ${filePath}`);
      }
    }

    // Add readme file
    const readme = `
# ${module.name}

${module.description}

## Usage Instructions:
1. Extract all files to your working directory
2. Customize templates with your specific data
3. Follow FDA guidance for submission requirements
4. Use Concept2Cure™ platform for submission management

Generated: ${new Date().toISOString()}
Module Package ID: ${moduleId}
`;

    archive.append(readme, { name: 'README.md' });
    archive.finalize();
  } catch (error) {
    console.error('Module download error:', error);
    res.status(500).json({ error: 'Failed to download module' });
  }
});

// Create new project from template
router.post('/template/:id/create', async (req, res) => {
  try {
    const templateId = parseInt(String(req.params.id));
    const template = indTemplates[templateId as keyof typeof indTemplates];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const projectId = uuidv4();

    // Here you would typically create a project in your database
    // For now, we'll return a success response

    res.json({
      projectId,
      templateId,
      title: template.title,
      specialization: template.specialization,
      modules: template.modules,
      created: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.post('/template/:id/create-with-documents', upload.array('files', 20), async (req, res) => {
  try {
    const templateId = parseInt(String(req.params.id), 10);
    const template = indTemplates[templateId as keyof typeof indTemplates];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const projectName = String(req.body?.projectName || template.title).trim();

    recordKpiEvent('upload_started', {
      payload: {
        templateId,
        projectName,
        specialization: template.specialization,
        uploadedFileCount: files.length,
      },
    });

    const extractedDocuments: ExtractedDocument[] = [];
    const extractionErrors: { filename: string; error: string }[] = [];

    for (const file of files) {
      try {
        const extracted = await extractDocumentText(file);
        if (extracted.text.length > 0) extractedDocuments.push(extracted);
      } catch (error: any) {
        extractionErrors.push({
          filename: file.originalname,
          error: error?.message || 'Unknown extraction failure',
        });
      }
    }

    const moduleDrafts: Record<string, ModuleDraft> = {};
    const moduleAssessments: Record<string, ModuleAssessment> = {};

    for (const moduleName of template.modules) {
      const sourceContext = buildContextForModule(moduleName, extractedDocuments);
      moduleDrafts[moduleName] = await generateModuleDraft(
        moduleName,
        projectName,
        template.specialization,
        sourceContext
      );
      moduleAssessments[moduleName] = buildModuleAssessment(moduleName, extractedDocuments);
    }

    const projectId = uuidv4();
    const canvasEditorJson = buildCanvasEditorJson(moduleDrafts);
    const docxBuffer = await buildDocxFromModuleDrafts(
      projectName,
      template.specialization,
      moduleDrafts
    );

    generatedWorkflowArtifacts.set(projectId, {
      projectId,
      templateId,
      projectName,
      specialization: template.specialization,
      moduleDrafts,
      moduleAssessments,
      reviewActions: {},
      editorJson: canvasEditorJson,
      docxBuffer,
      createdAt: new Date().toISOString(),
    });

    recordKpiEvent('draft_generated', {
      projectId,
      payload: {
        templateId,
        specialization: template.specialization,
        moduleCount: Object.keys(moduleDrafts).length,
        uploadedFileCount: extractedDocuments.length,
      },
    });

    return res.json({
      projectId,
      templateId,
      projectName,
      specialization: template.specialization,
      modules: template.modules,
      uploadedFiles: extractedDocuments.map(doc => ({
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        extractionMethod: doc.extractionMethod,
        extractedCharacters: doc.text.length,
      })),
      extractionErrors,
      moduleDrafts,
      moduleAssessments,
      reviewActions: {},
      canvasEditorJson,
      workflow: {
        canvasJsonUrl: `/api/ind-templates/projects/${projectId}/canvas`,
        docxDownloadUrl: `/api/ind-templates/projects/${projectId}/docx`,
      },
      created: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Create-with-documents error:', error);
    return res.status(500).json({ error: 'Failed to create project with uploaded documents' });
  }
});

router.get('/projects/:projectId/canvas', async (req, res) => {
  try {
    const artifact = generatedWorkflowArtifacts.get(req.params.projectId);
    if (!artifact) {
      return res.status(404).json({ error: 'Project workflow artifact not found' });
    }

    return res.json({
      projectId: artifact.projectId,
      templateId: artifact.templateId,
      projectName: artifact.projectName,
      specialization: artifact.specialization,
      editorJson: artifact.editorJson,
      moduleDrafts: artifact.moduleDrafts,
      moduleAssessments: artifact.moduleAssessments,
      reviewActions: artifact.reviewActions,
      createdAt: artifact.createdAt,
    });
  } catch (error: any) {
    console.error('Canvas artifact retrieval error:', error);
    return res.status(500).json({ error: 'Failed to retrieve canvas artifact' });
  }
});

router.post('/projects/:projectId/review-actions', async (req, res) => {
  try {
    const artifact = generatedWorkflowArtifacts.get(req.params.projectId);
    if (!artifact) {
      return res.status(404).json({ error: 'Project workflow artifact not found' });
    }

    const moduleName = String(req.body?.moduleName || '').trim();
    const action = String(req.body?.action || '').trim() as
      | 'pending'
      | 'accepted'
      | 'needs_revision'
      | 'rewrite';

    if (!moduleName || !artifact.moduleDrafts[moduleName]) {
      return res.status(400).json({ error: 'Valid moduleName is required' });
    }

    if (!['pending', 'accepted', 'needs_revision', 'rewrite'].includes(action)) {
      return res.status(400).json({ error: 'Invalid review action' });
    }

    artifact.reviewActions[moduleName] = action;
    generatedWorkflowArtifacts.set(artifact.projectId, artifact);

    if (action === 'accepted') {
      recordKpiEvent('section_accepted', {
        projectId: artifact.projectId,
        payload: { moduleName, templateId: artifact.templateId },
      });
    }

    if (action === 'rewrite') {
      recordKpiEvent('section_rewritten', {
        projectId: artifact.projectId,
        payload: { moduleName, templateId: artifact.templateId },
      });
    }

    return res.json({
      projectId: artifact.projectId,
      moduleName,
      action,
      reviewActions: artifact.reviewActions,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Review action update error:', error);
    return res.status(500).json({ error: 'Failed to update review action' });
  }
});

router.get('/projects/:projectId/docx', async (req, res) => {
  try {
    const artifact = generatedWorkflowArtifacts.get(req.params.projectId);
    if (!artifact) {
      return res.status(404).json({ error: 'Project workflow artifact not found' });
    }

    const safeTitle = artifact.projectName.replace(/[^a-z0-9_-]+/gi, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle || 'ind_project'}_generated.docx"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    return res.send(artifact.docxBuffer);
  } catch (error: any) {
    console.error('DOCX artifact retrieval error:', error);
    return res.status(500).json({ error: 'Failed to retrieve DOCX artifact' });
  }
});

export default router;
