/**
 * Tool Definitions
 *
 * All tools the assistant can invoke, organized by category.
 * Each tool wraps a backend service or returns a structured response.
 *
 * Registration order doesn't matter — the router resolves by intent string.
 *
 * To add a new tool:
 *   1. Define it here with registerTool()
 *   2. The router picks it up automatically — no switch-case to update
 */

import { registerTool, ToolResult, ToolContext } from '../toolRegistry';
import { generateRegulatory, type DocxInput } from '../docx/docxFactory';
import { getTemplate, listTemplates, mergeWithTemplate } from '../docx/templateRegistry';
import fs from 'fs/promises';
import path from 'path';

// ─── Workspace Tools ──────────────────────────────────────────────────────────

registerTool({
  name: 'vault.upload',
  label: 'Upload Documents',
  description: 'Open the document vault for uploading PDFs, DOCX files, or datasets.',
  category: 'documents',
  params: [],
  aliases: ['vault.open_upload'],
  execute: async (): Promise<ToolResult> => ({
    ok: true,
    artifact: null,
    message: {
      role: 'assistant',
      content:
        'The document vault is open — you can upload PDFs, DOCX files, or datasets. Once uploaded, I can parse them and reference their content in any submission section.',
    },
    redirect: '/concept2cure?panel=vault',
  }),
});

registerTool({
  name: 'project.new',
  label: 'Create New Project',
  description: 'Start a new regulatory submission project.',
  category: 'workspace',
  params: [],
  execute: async (): Promise<ToolResult> => ({
    ok: true,
    artifact: null,
    message: {
      role: 'assistant',
      content:
        "I'll help you set up a new project. What type of submission are you working on? (510(k), IND, NDA/BLA, CER, IVDR, or something else?)",
    },
    openModal: 'new-project',
  }),
});

registerTool({
  name: 'chat.new',
  label: 'Ask a Question',
  description: 'Start a new conversation with the regulatory assistant.',
  category: 'chat',
  params: [{ name: 'prompt', type: 'string', description: 'Initial question' }],
  execute: async (params): Promise<ToolResult> => ({
    ok: true,
    artifact: null,
    message: {
      role: 'assistant',
      content: params.prompt || 'What regulatory question can I help you with?',
    },
  }),
});

// ─── Regulatory / Validation Tools ────────────────────────────────────────────

registerTool({
  name: 'validation.run',
  label: 'Run Regulatory Validation',
  description:
    'Check completeness against FDA/CE criteria and surface missing artifacts, labelling gaps, or clinical evidence requirements.',
  category: 'regulatory',
  params: [{ name: 'projectId', type: 'string', description: 'Target project ID' }],
  execute: async (params, ctx): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'validation_report',
        id: `val-${Date.now()}`,
        title: projectId ? `Validation — Project ${projectId}` : 'Regulatory Validation',
        status: 'queued',
        projectId,
      },
      message: {
        role: 'assistant',
        content:
          'Regulatory validation queued. I\'ll check completeness against FDA/CE criteria and surface any missing artifacts, labelling gaps, or clinical evidence requirements. Results appear in the sidebar under "Recent".',
      },
    };
  },
});

// ─── 510(k) Tools ─────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.510k.generate_outline',
  label: 'Generate 510(k) Outline',
  description: 'Generate an eSTAR-aligned 510(k) submission outline with all required sections.',
  category: 'regulatory',
  params: [{ name: 'projectId', type: 'string', description: 'Target project ID' }],
  aliases: ['510k.outline'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || params.project_id || null;
    return {
      ok: true,
      artifact: {
        type: 'outline',
        id: `outline-510k-${Date.now()}`,
        title: '510(k) eSTAR Submission Outline',
        status: 'generated',
        projectId,
      },
      message: {
        role: 'assistant',
        content:
          "I've generated a 510(k) eSTAR-aligned outline structure. It includes: Device Description, Substantial Equivalence Discussion, Technological Characteristics, Performance Testing Summary, and Labeling. Want me to start drafting any specific section?",
      },
    };
  },
});

registerTool({
  name: 'workflow.510k.predicate_search',
  label: 'Find Predicate Devices',
  description: 'Search FDA databases for predicate devices similar to the subject device.',
  category: 'analysis',
  params: [
    { name: 'projectId', type: 'string', description: 'Target project ID' },
    { name: 'deviceName', type: 'string', description: 'Subject device name' },
    { name: 'productCode', type: 'string', description: 'FDA product code' },
  ],
  aliases: ['510k.predicate', 'predicate.search'],
  execute: async (params, ctx): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'predicate_analysis',
        id: `pred-${Date.now()}`,
        title: 'Predicate Device Analysis',
        status: 'queued',
        projectId,
        data: {
          deviceName: params.deviceName || null,
          productCode: params.productCode || null,
        },
      },
      message: {
        role: 'assistant',
        content:
          "Searching FDA 510(k) database for predicate devices. I'll compare product codes, intended use, and technological characteristics to find the strongest candidates for substantial equivalence.",
      },
    };
  },
});

// ─── CER Tools ────────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.cer.generate',
  label: 'Generate Clinical Evaluation Report',
  description: 'Generate a CER from project evidence, literature, and clinical data.',
  category: 'regulatory',
  params: [{ name: 'projectId', type: 'string', required: true, description: 'Target project ID' }],
  aliases: ['cer.generate'],
  execute: async (params, ctx): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'cer_document',
        id: `cer-${Date.now()}`,
        title: 'Clinical Evaluation Report',
        status: 'queued',
        projectId,
      },
      message: {
        role: 'assistant',
        content:
          "CER generation started. I'll compile clinical data, literature review, risk-benefit analysis, and post-market surveillance into a MEDDEV 2.7/1 Rev 4 compliant report. This typically takes 2-5 minutes.",
      },
      chain: ['analysis.literature_search'],
    };
  },
});

registerTool({
  name: 'workflow.cer.literature_review',
  label: 'Run Literature Review',
  description: 'Search PubMed and regulatory databases for relevant clinical literature.',
  category: 'analysis',
  params: [
    { name: 'projectId', type: 'string', description: 'Target project ID' },
    { name: 'query', type: 'string', description: 'Search terms' },
  ],
  aliases: ['cer.literature', 'literature.search'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'literature_review',
        id: `lit-${Date.now()}`,
        title: 'Literature Review',
        status: 'queued',
        projectId,
        data: { query: params.query || null },
      },
      message: {
        role: 'assistant',
        content:
          "Literature search initiated across PubMed, MEDLINE, and Cochrane databases. I'll filter for clinical relevance, extract key findings, and generate a structured review summary.",
      },
    };
  },
});

// ─── IND Tools ────────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.ind.draft_section',
  label: 'Draft IND Section',
  description: 'Generate a draft for a specific IND submission section.',
  category: 'regulatory',
  params: [
    { name: 'projectId', type: 'string', required: true, description: 'Target project ID' },
    {
      name: 'section',
      type: 'string',
      required: true,
      description: 'Section number (e.g., 2.5, 3.2)',
    },
  ],
  aliases: ['ind.draft'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    const section = params.section || 'overview';
    return {
      ok: true,
      artifact: {
        type: 'ind_section',
        id: `ind-${section}-${Date.now()}`,
        title: `IND Section ${section} Draft`,
        status: 'queued',
        projectId,
        data: { section },
      },
      message: {
        role: 'assistant',
        content: `Drafting IND Section ${section}. I'll use project documents, regulatory templates, and FDA guidance to generate a compliant draft. You can review and edit in the document authoring panel.`,
      },
    };
  },
});

// ─── Protocol Analysis Tools ──────────────────────────────────────────────────

registerTool({
  name: 'analysis.protocol',
  label: 'Analyze Protocol',
  description:
    'Analyze a clinical trial protocol for design quality, endpoint selection, and regulatory risk.',
  category: 'analysis',
  params: [{ name: 'projectId', type: 'string', description: 'Target project ID' }],
  aliases: ['protocol.analyze'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'protocol_analysis',
        id: `proto-${Date.now()}`,
        title: 'Protocol Analysis Report',
        status: 'queued',
        projectId,
      },
      message: {
        role: 'assistant',
        content:
          "Protocol analysis started. I'll evaluate study design, primary/secondary endpoints, sample size justification, inclusion/exclusion criteria, and statistical analysis plan against FDA/ICH guidelines.",
      },
    };
  },
});

registerTool({
  name: 'analysis.similarity_search',
  label: 'Find Similar Trials',
  description: 'Search for historically similar clinical trials and compare outcomes.',
  category: 'analysis',
  params: [
    { name: 'projectId', type: 'string', description: 'Target project ID' },
    { name: 'indication', type: 'string', description: 'Therapeutic indication' },
    { name: 'phase', type: 'string', description: 'Clinical trial phase' },
  ],
  aliases: ['trial.similarity', 'csr.search'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'similarity_report',
        id: `sim-${Date.now()}`,
        title: 'Trial Similarity Analysis',
        status: 'queued',
        projectId,
        data: {
          indication: params.indication || null,
          phase: params.phase || null,
        },
      },
      message: {
        role: 'assistant',
        content:
          "Searching CSR database for similar trials. I'll compare study design, patient population, endpoints, and outcomes to identify relevant precedents and success/failure patterns.",
      },
    };
  },
});

registerTool({
  name: 'analysis.endpoint_risk',
  label: 'Predict Endpoint Risk',
  description:
    'Predict the likelihood of meeting primary and secondary endpoints based on historical data.',
  category: 'analysis',
  params: [
    { name: 'projectId', type: 'string', description: 'Target project ID' },
    { name: 'indication', type: 'string', description: 'Therapeutic indication' },
    { name: 'endpoint', type: 'string', description: 'Primary endpoint' },
  ],
  aliases: ['endpoint.predict'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'risk_prediction',
        id: `risk-${Date.now()}`,
        title: 'Endpoint Risk Prediction',
        status: 'queued',
        projectId,
        data: {
          indication: params.indication || null,
          endpoint: params.endpoint || null,
        },
      },
      message: {
        role: 'assistant',
        content:
          "Running endpoint risk analysis. I'll model the probability of success based on historical trial outcomes for similar indications, endpoints, and patient populations.",
      },
    };
  },
});

// ─── Document Tools ───────────────────────────────────────────────────────────

registerTool({
  name: 'documents.export',
  label: 'Export Document',
  description: 'Export a project document or artifact as PDF/DOCX.',
  category: 'documents',
  params: [
    { name: 'artifactId', type: 'string', required: true, description: 'Artifact to export' },
    { name: 'format', type: 'string', description: 'Export format: pdf or docx' },
  ],
  aliases: ['doc.export', 'export'],
  execute: async (params): Promise<ToolResult> => ({
    ok: true,
    artifact: {
      type: 'export',
      id: `exp-${Date.now()}`,
      title: `Export ${params.artifactId || 'Document'}`,
      status: 'queued',
      data: { format: params.format || 'pdf' },
    },
    message: {
      role: 'assistant',
      content: `Generating ${(params.format || 'PDF').toUpperCase()} export. The download will appear in your browser when ready.`,
    },
  }),
});

registerTool({
  name: 'documents.compare',
  label: 'Compare Documents',
  description: 'Compare two document versions or artifacts side-by-side.',
  category: 'documents',
  params: [
    { name: 'sourceId', type: 'string', required: true, description: 'Source document/artifact' },
    { name: 'targetId', type: 'string', required: true, description: 'Target document/artifact' },
  ],
  aliases: ['doc.compare', 'doc.diff'],
  execute: async (params): Promise<ToolResult> => ({
    ok: true,
    artifact: {
      type: 'document_diff',
      id: `diff-${Date.now()}`,
      title: 'Document Comparison',
      status: 'queued',
      data: { sourceId: params.sourceId, targetId: params.targetId },
    },
    message: {
      role: 'assistant',
      content:
        "Running document comparison. I'll highlight additions, deletions, and changes between the two versions with regulatory significance annotations.",
    },
  }),
});

// ─── eCTD Tools ───────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.ectd.compile',
  label: 'Compile eCTD Package',
  description: 'Compile project documents into an eCTD submission package.',
  category: 'regulatory',
  params: [
    { name: 'projectId', type: 'string', required: true, description: 'Target project ID' },
    { name: 'sequence', type: 'string', description: 'Sequence number' },
  ],
  aliases: ['ectd.compile'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'ectd_package',
        id: `ectd-${Date.now()}`,
        title: 'eCTD Submission Package',
        status: 'queued',
        projectId,
        data: { sequence: params.sequence || '0000' },
      },
      message: {
        role: 'assistant',
        content:
          "eCTD compilation started. I'll assemble all modules (M1-M5), validate the XML backbone, check file references, and generate the submission-ready package.",
      },
    };
  },
});

// ─── CMC Tools ────────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.cmc.analyze',
  label: 'Analyze CMC Data',
  description: 'Analyze Chemistry, Manufacturing, and Controls data for regulatory readiness.',
  category: 'regulatory',
  params: [{ name: 'projectId', type: 'string', required: true, description: 'Target project ID' }],
  aliases: ['cmc.analyze'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'cmc_analysis',
        id: `cmc-${Date.now()}`,
        title: 'CMC Readiness Analysis',
        status: 'queued',
        projectId,
      },
      message: {
        role: 'assistant',
        content:
          "CMC analysis started. I'll review manufacturing process descriptions, specifications, stability data, and analytical methods against ICH Q1-Q12 guidelines.",
      },
    };
  },
});

// ─── Document Generation Tool (DOCX Factory) ─────────────────────────────────

registerTool({
  name: 'documents.generate_docx',
  label: 'Generate Regulatory DOCX',
  description:
    'Generate a formatted Word document from structured content. Use for CER reports, 510(k) summaries, clinical narratives, and other regulatory documents. Optionally use a template (cer-eu-mdr, fda-510k, csr-ich-e3) to enforce regulatory section structure.',
  category: 'documents',
  params: [
    { name: 'title', type: 'string', required: true, description: 'Document title' },
    {
      name: 'submissionType',
      type: 'string',
      required: true,
      description: 'Submission type: CER, 510K, IND, NDA, BLA, CSR',
    },
    {
      name: 'content',
      type: 'string',
      required: true,
      description:
        'JSON string of sections: [{title, sectionCode?, paragraphs: string[], tables?: [{caption?, headers: string[], rows: string[][]}]}]',
    },
    {
      name: 'templateId',
      type: 'string',
      required: false,
      description:
        'Regulatory template to use: cer-eu-mdr (EU MDR CER), fda-510k (FDA 510k), csr-ich-e3 (ICH E3 CSR). When set, the template defines required sections and the LLM content is merged into the blueprint.',
    },
  ],
  aliases: ['doc.generate', 'generate.docx'],
  execute: async (params, ctx): Promise<ToolResult> => {
    try {
      // Parse sections from the content parameter
      let sections;
      try {
        const parsed = JSON.parse(params.content || '[]');
        // Handle both array-of-sections and nested JSON-in-string
        if (Array.isArray(parsed)) {
          sections = parsed;
        } else if (parsed && typeof parsed === 'object') {
          // Single section object
          sections = [parsed];
        } else {
          sections = [
            {
              title: params.title || 'Document',
              paragraphs: [String(parsed)],
            },
          ];
        }
      } catch {
        // If not JSON, treat as single section with the content as text
        sections = [
          {
            title: params.title || 'Document',
            paragraphs: (params.content || '').split('\n\n').filter(Boolean),
          },
        ];
      }

      // Ensure every section has a paragraphs array (not nested stringified JSON)
      sections = sections.map((s: any) => ({
        title: s.title || 'Section',
        sectionCode: s.sectionCode,
        paragraphs: Array.isArray(s.paragraphs)
          ? s.paragraphs.map(String)
          : [String(s.paragraphs || '')],
        tables: Array.isArray(s.tables) ? s.tables : undefined,
        pageBreak: s.pageBreak,
      }));

      const metadata = {
        title: params.title || 'Regulatory Document',
        submissionType: params.submissionType || 'General',
        projectId: ctx.projectId || undefined,
        date: new Date().toISOString().split('T')[0],
      };

      // If a template is specified, merge LLM sections with the blueprint
      const input: DocxInput = params.templateId
        ? mergeWithTemplate(params.templateId, metadata, sections)
        : { metadata, sections };

      const result = await generateRegulatory(input);

      // Save to generated_documents/
      const outDir = path.resolve(process.cwd(), 'generated_documents');
      await fs.mkdir(outDir, { recursive: true });
      const docxPath = path.join(outDir, result.filename);
      const jsonPath = docxPath.replace(/\.docx$/, '.source.json');
      await fs.writeFile(docxPath, result.buffer);
      await fs.writeFile(jsonPath, JSON.stringify(result.source, null, 2));

      return {
        ok: true,
        artifact: {
          type: 'docx_document',
          id: `docx-${Date.now()}`,
          title: params.title || 'Regulatory Document',
          status: 'generated',
          projectId: ctx.projectId || null,
          data: {
            filename: result.filename,
            path: docxPath,
            sourcePath: jsonPath,
            sizeBytes: result.buffer.length,
            sectionCount: sections.length,
          },
        },
        summary: `Generated ${result.filename} (${Math.round(result.buffer.length / 1024)}KB, ${input.sections.length} sections${params.templateId ? `, template: ${params.templateId}` : ''})`,
        message: {
          role: 'assistant',
          content: `Document generated: **${result.filename}** (${Math.round(result.buffer.length / 1024)}KB). The file contains ${input.sections.length} section(s) with regulatory-compliant formatting.${params.templateId ? ` Template **${params.templateId}** was used to enforce regulatory section structure.` : ''} A source JSON file was also saved for future regeneration.`,
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        artifact: null,
        message: {
          role: 'assistant',
          content: `Document generation failed: ${err.message}`,
        },
      };
    }
  },
});

// ─── Template Listing Tool ────────────────────────────────────────────────────

registerTool({
  name: 'documents.list_templates',
  label: 'List Document Templates',
  description:
    'List available regulatory document templates (CER, 510k, CSR). Returns template IDs, names, submission types, and regions. Use before generate_docx to pick the right template.',
  category: 'documents',
  params: [],
  aliases: ['templates.list'],
  execute: async (): Promise<ToolResult> => {
    const templates = listTemplates();
    return {
      ok: true,
      artifact: null,
      summary: `${templates.length} templates: ${templates.map(t => t.id).join(', ')}`,
      message: {
        role: 'assistant',
        content: `Available regulatory templates:\n${templates.map(t => `• **${t.id}** — ${t.name} (${t.region}, ${t.submissionType})`).join('\n')}`,
      },
    };
  },
});

// ─── IVDR Tools ───────────────────────────────────────────────────────────────

registerTool({
  name: 'workflow.ivdr.gap_analysis',
  label: 'IVDR Gap Analysis',
  description: 'Identify gaps in IVDR compliance documentation and classify risk.',
  category: 'regulatory',
  params: [
    { name: 'projectId', type: 'string', required: true, description: 'Target project ID' },
    { name: 'riskClass', type: 'string', description: 'IVDR risk class (A, B, C, D)' },
  ],
  aliases: ['ivdr.gap'],
  execute: async (params): Promise<ToolResult> => {
    const projectId = params.projectId || null;
    return {
      ok: true,
      artifact: {
        type: 'ivdr_gap_analysis',
        id: `ivdr-${Date.now()}`,
        title: 'IVDR Compliance Gap Analysis',
        status: 'queued',
        projectId,
        data: { riskClass: params.riskClass || null },
      },
      message: {
        role: 'assistant',
        content:
          "IVDR gap analysis started. I'll map your documentation against Annex I General Safety and Performance Requirements, identify missing elements, and prioritize remediation steps.",
      },
    };
  },
});

/**
 * Export the count for boot logging
 */
export function getRegisteredToolCount(): number {
  // Import listTools at runtime to get accurate count
  const { listTools } = require('../toolRegistry');
  return listTools().length;
}
