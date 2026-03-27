/**
 * Claude Tool Definitions — Agentic Document Generation
 *
 * Tools that Claude can invoke during document generation workflows:
 * - Evidence search (clinical trials, literature)
 * - FDA guidance lookup
 * - Cross-reference validation
 * - Regulatory citation generation
 * - Compliance checking
 */

import type { ClaudeTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Evidence & Literature Tools
// ─────────────────────────────────────────────────────────────────────────────

export const SEARCH_CLINICAL_EVIDENCE: ClaudeTool = {
  name: 'search_clinical_evidence',
  description:
    'Search for clinical evidence by condition, intervention, or outcome. Returns relevant clinical trial data, study results, and evidence summaries from ClinicalTrials.gov and internal databases.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for clinical evidence (condition, drug, device, etc.)',
      },
      evidence_type: {
        type: 'string',
        enum: ['clinical_trial', 'literature', 'real_world_evidence', 'meta_analysis'],
        description: 'Type of evidence to search for',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
  },
};

export const SEARCH_LITERATURE: ClaudeTool = {
  name: 'search_literature',
  description:
    'Search published literature databases (PubMed, internal corpus) for relevant publications. Returns titles, abstracts, DOIs, and key findings.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Literature search query',
      },
      date_range: {
        type: 'string',
        description: 'Date range filter, e.g. "2020-2025"',
      },
      study_type: {
        type: 'string',
        enum: ['rct', 'observational', 'systematic_review', 'case_report', 'any'],
        description: 'Filter by study type',
      },
      max_results: {
        type: 'number',
        description: 'Maximum results (default: 10)',
      },
    },
    required: ['query'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory & Compliance Tools
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKUP_FDA_GUIDANCE: ClaudeTool = {
  name: 'lookup_fda_guidance',
  description:
    'Look up FDA guidance documents, regulations (21 CFR), and draft/final guidance relevant to a topic. Returns guidance title, document number, key requirements, and citation-ready references.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Regulatory topic to look up (e.g., "510(k) predicate comparison", "biocompatibility testing")',
      },
      regulation_type: {
        type: 'string',
        enum: ['guidance', '21cfr', 'federal_register', 'any'],
        description: 'Type of regulatory document',
      },
      device_class: {
        type: 'string',
        enum: ['I', 'II', 'III', 'any'],
        description: 'FDA device classification',
      },
    },
    required: ['topic'],
  },
};

export const CHECK_REGULATORY_COMPLIANCE: ClaudeTool = {
  name: 'check_regulatory_compliance',
  description:
    'Check a document section against specific regulatory requirements. Returns compliance status, gaps, and recommended remediation for each requirement.',
  input_schema: {
    type: 'object',
    properties: {
      section_content: {
        type: 'string',
        description: 'The document section content to check',
      },
      regulatory_framework: {
        type: 'string',
        enum: ['fda_510k', 'fda_pma', 'eu_mdr', 'ich_e6', 'ich_e8', 'ich_e9', '21cfr_part11'],
        description: 'Regulatory framework to check against',
      },
      section_type: {
        type: 'string',
        description: 'Type of document section (e.g., "device_description", "clinical_evidence", "risk_analysis")',
      },
    },
    required: ['section_content', 'regulatory_framework'],
  },
};

export const LOOKUP_ICH_GUIDELINE: ClaudeTool = {
  name: 'lookup_ich_guideline',
  description:
    'Look up ICH (International Council for Harmonisation) guidelines relevant to a topic. Returns guideline reference, key requirements, and applicable sections.',
  input_schema: {
    type: 'object',
    properties: {
      guideline: {
        type: 'string',
        description: 'ICH guideline code (e.g., "E6(R2)", "E8(R1)", "E9(R1)", "M4") or topic to search',
      },
      section: {
        type: 'string',
        description: 'Specific section within the guideline (optional)',
      },
    },
    required: ['guideline'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Reference & Validation Tools
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATE_CROSS_REFERENCES: ClaudeTool = {
  name: 'validate_cross_references',
  description:
    'Validate cross-references within a document — check that cited sections exist, table/figure numbers are correct, and internal references are consistent.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'Internal document ID to validate',
      },
      section_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of section references to validate (e.g., ["Section 3.2", "Table 4", "Figure 1"])',
      },
    },
    required: ['document_id'],
  },
};

export const GENERATE_CITATION: ClaudeTool = {
  name: 'generate_citation',
  description:
    'Generate a properly formatted regulatory citation for a given source. Supports FDA guidance, ICH guidelines, EU MDR articles, journal articles, and 21 CFR references.',
  input_schema: {
    type: 'object',
    properties: {
      source_type: {
        type: 'string',
        enum: ['fda_guidance', 'ich_guideline', 'eu_mdr', 'journal_article', '21cfr', 'iso_standard'],
        description: 'Type of source to cite',
      },
      source_identifier: {
        type: 'string',
        description: 'Source identifier (guidance number, DOI, CFR section, etc.)',
      },
      citation_style: {
        type: 'string',
        enum: ['regulatory', 'apa', 'vancouver'],
        description: 'Citation style (default: regulatory)',
      },
    },
    required: ['source_type', 'source_identifier'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document Intelligence Tools
// ─────────────────────────────────────────────────────────────────────────────

export const ANALYZE_PREDICATE_DEVICE: ClaudeTool = {
  name: 'analyze_predicate_device',
  description:
    'Analyze a predicate device for 510(k) substantial equivalence comparison. Returns device details, clearance info, indications for use, and technology comparison points.',
  input_schema: {
    type: 'object',
    properties: {
      predicate_510k_number: {
        type: 'string',
        description: '510(k) number of the predicate device (e.g., "K201234")',
      },
      comparison_aspects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Aspects to compare (e.g., ["intended_use", "technology", "materials", "performance"])',
      },
    },
    required: ['predicate_510k_number'],
  },
};

export const EXTRACT_DOCUMENT_STRUCTURE: ClaudeTool = {
  name: 'extract_document_structure',
  description:
    'Extract and analyze the structure of an uploaded document — headings, sections, tables, figures, references. Useful for gap analysis and template matching.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'Internal document ID to analyze',
      },
      extract_elements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Elements to extract (e.g., ["headings", "tables", "figures", "references", "acronyms"])',
      },
    },
    required: ['document_id'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool Collections by Use Case
// ─────────────────────────────────────────────────────────────────────────────

/** Tools for regulatory document drafting */
export const DOCUMENT_DRAFTING_TOOLS: ClaudeTool[] = [
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  GENERATE_CITATION,
  ANALYZE_PREDICATE_DEVICE,
];

/** Tools for compliance review */
export const COMPLIANCE_REVIEW_TOOLS: ClaudeTool[] = [
  CHECK_REGULATORY_COMPLIANCE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  VALIDATE_CROSS_REFERENCES,
];

/** Tools for gap analysis */
export const GAP_ANALYSIS_TOOLS: ClaudeTool[] = [
  CHECK_REGULATORY_COMPLIANCE,
  EXTRACT_DOCUMENT_STRUCTURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  VALIDATE_CROSS_REFERENCES,
];

// ─────────────────────────────────────────────────────────────────────────────
// Document Generation Tools (Master Python Builder)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a regulatory document from scratch or template */
export const GENERATE_DOCUMENT: ClaudeTool = {
  name: 'generate_document',
  description: 'Generate a complete regulatory document (CSR, CTD section, CER, 510(k), protocol, SAP, IB, ICSR). Produces DOCX, PDF, or XML output. Use when the user asks to create, generate, draft, or build a regulatory document.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        description: 'Type of document to generate',
        enum: ['csr', 'ctd_module1', 'ctd_module2', 'ctd_module3', 'ctd_module4', 'ctd_module5', 'cer', '510k', 'pma', 'protocol', 'sap', 'ib', 'icsr', 'ectd_backbone'],
      },
      title: {
        type: 'string',
        description: 'Document title',
      },
      sections: {
        type: 'array',
        description: 'Sections to include with content',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Section number (e.g., 2.5, 5.3.1)' },
            title: { type: 'string', description: 'Section title' },
            content: { type: 'string', description: 'Section content (can be HTML)' },
          },
          required: ['number', 'title', 'content'],
        },
      },
      output_format: {
        type: 'string',
        description: 'Output format',
        enum: ['docx', 'pdf', 'xml'],
      },
      agencies: {
        type: 'array',
        description: 'Target regulatory agencies',
        items: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada', 'TGA', 'MHRA'] },
      },
      template_path: {
        type: 'string',
        description: 'Optional: path to a client-uploaded DOCX template to use as base',
      },
      replacements: {
        type: 'object',
        description: 'Optional: placeholder-to-value string replacements for template mode',
      },
    },
    required: ['document_type', 'title'],
  },
};

/** Build a document from a client-uploaded template with string replacement and XML injection */
export const BUILD_FROM_TEMPLATE: ClaudeTool = {
  name: 'build_from_template',
  description: 'Copy a client-uploaded DOCX template, unpack it, perform string replacement to inject content, and optionally inject raw XML for complex structures like tables and regulatory elements. Use when the user has uploaded a template and wants to fill it with project-specific content.',
  input_schema: {
    type: 'object',
    properties: {
      template_path: {
        type: 'string',
        description: 'Path to the uploaded DOCX template file',
      },
      replacements: {
        type: 'object',
        description: 'Map of placeholder strings to replacement values. E.g., {"{{PRODUCT_NAME}}": "Compound X", "{{SPONSOR}}": "Acme Pharma"}',
      },
      xml_injections: {
        type: 'array',
        description: 'Direct XML injections into the DOCX structure',
        items: {
          type: 'object',
          properties: {
            position: { type: 'string', enum: ['before-close-body', 'after-open-body', 'replace-placeholder', 'append-to-body'] },
            xml: { type: 'string', description: 'OOXML content to inject' },
            placeholder: { type: 'string', description: 'For replace-placeholder: the text to find and replace with XML' },
          },
          required: ['position', 'xml'],
        },
      },
      output_format: {
        type: 'string',
        enum: ['docx', 'pdf'],
      },
      document_title: {
        type: 'string',
        description: 'Title for the output file',
      },
    },
    required: ['template_path', 'replacements'],
  },
};

/** Rasterize a document page for visual inspection */
export const RASTERIZE_PAGE: ClaudeTool = {
  name: 'rasterize_page',
  description: 'Rasterize (render as image) a specific page of a DOCX or PDF document for visual inspection. Returns a PNG image of the page. Use when the user wants to preview, inspect, or visually verify a generated document page.',
  input_schema: {
    type: 'object',
    properties: {
      document_path: {
        type: 'string',
        description: 'Path to the DOCX or PDF document',
      },
      page_number: {
        type: 'number',
        description: 'Page number to rasterize (1-based)',
      },
      dpi: {
        type: 'number',
        description: 'Resolution in DPI (default: 150)',
      },
    },
    required: ['document_path'],
  },
};

/** Overlay content onto a PDF template (forms, headers, signatures, stamps) */
export const PDF_OVERLAY: ClaudeTool = {
  name: 'pdf_overlay',
  description: 'Overlay text, images, or regulatory stamps onto specific coordinates of an existing PDF template. Use for form filling, adding signatures, watermarks, approval stamps, or finalizing templates with positioned content. Supports multi-page overlay.',
  input_schema: {
    type: 'object',
    properties: {
      base_pdf_path: {
        type: 'string',
        description: 'Path to the base PDF template to overlay onto',
      },
      overlays: {
        type: 'array',
        description: 'List of overlay operations',
        items: {
          type: 'object',
          properties: {
            page: { type: 'number', description: 'Page number (1-based)' },
            type: { type: 'string', enum: ['text', 'image', 'stamp'], description: 'Overlay type' },
            x: { type: 'number', description: 'X coordinate (points from left)' },
            y: { type: 'number', description: 'Y coordinate (points from bottom)' },
            content: { type: 'string', description: 'Text content, image path, or stamp type' },
            font_size: { type: 'number', description: 'Font size for text overlays' },
            color: { type: 'string', description: 'Color for text (e.g., "#000000")' },
          },
          required: ['page', 'type', 'x', 'y', 'content'],
        },
      },
      output_path: {
        type: 'string',
        description: 'Path for the finalized output PDF',
      },
    },
    required: ['base_pdf_path', 'overlays'],
  },
};

/** All tools combined */
export const ALL_CLAUDE_TOOLS: ClaudeTool[] = [
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  CHECK_REGULATORY_COMPLIANCE,
  VALIDATE_CROSS_REFERENCES,
  GENERATE_CITATION,
  ANALYZE_PREDICATE_DEVICE,
  EXTRACT_DOCUMENT_STRUCTURE,
  GENERATE_DOCUMENT,
  BUILD_FROM_TEMPLATE,
  RASTERIZE_PAGE,
  PDF_OVERLAY,
];
