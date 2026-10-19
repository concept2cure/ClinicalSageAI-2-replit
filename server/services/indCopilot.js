/**
 * IND Wizard AI Copilot Service
 *
 * Provides intelligent assistance for IND submissions:
 * - Context-aware content generation for each section
 * - Regulatory guidance integration
 * - Inline citations with source verification
 * - Section-requirement coverage from the CTD record (deterministic); the model
 *   narrates and never supplies a score or verdict
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { ai } from '../lib/unified-ai-client';
import { resolveSectionBriefSource } from './ind/ctd/index';
import { normalizeCtdCode } from '../../shared/regulatory/section-code';

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Only init Supabase if credentials are present (not required in PostgreSQL-only deployments)
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Cache for regulatory guidelines to avoid repeated fetching
const guidelinesCache = new Map();

/**
 * Cache timeout in milliseconds (1 hour)
 */
const CACHE_TIMEOUT = 60 * 60 * 1000;

/**
 * Regulatory document sources for different IND sections
 */
const REGULATORY_SOURCES = {
  // Module 1 - Administrative Information
  1.1: ['21 CFR 312.23(a)(1)', 'Form FDA 1571'],
  1.2: ['Form FDA 1572', '21 CFR 312.23(a)(1)(viii)'],
  1.3: ['21 CFR 312.23(a)(1)(ii)', 'FDA Guidance for Industry: Content and Format of INDs'],

  // Module 2 - Summaries
  2.1: ['ICH M4Q', 'ICH M4E'],
  2.2: ['ICH M4', 'FDA Guidance for Industry: M4 Organization of the CTD'],
  2.3: ['ICH M4Q', 'FDA Guidance for Industry: Quality Considerations'],
  2.4: ['ICH M4S', 'FDA Guidance for Industry: Nonclinical Overview and Integrated Summaries'],
  2.5: ['ICH M4E', 'FDA Guidance for Industry: Clinical Overview and Clinical Summaries'],
  2.6: ['ICH S6', 'FDA Guidance for Industry: Nonclinical Safety Evaluation'],
  2.7: ['ICH E3', 'FDA Guidance for Industry: Clinical Study Reports'],

  // Module 3 - Quality
  '3.2.P': [
    'ICH Q1A',
    'ICH Q3A',
    'ICH Q5C',
    'FDA Guidance for Industry: Drug Substance CMC Information',
  ],
  '3.2.S': ['ICH Q1A', 'ICH Q5C', 'FDA Guidance for Industry: Drug Substance CMC Information'],

  // Module 4 - Nonclinical
  4.2: ['ICH S7A', 'ICH S7B', 'FDA Guidance for Industry: Nonclinical Safety Studies'],

  // Module 5 - Clinical
  5.2: ['ICH E6', 'ICH E8', 'FDA Guidance for Industry: Clinical Trials'],
  5.3: ['ICH E3', 'FDA Guidance for Industry: Clinical Study Reports'],
  '5.3.5': ['ICH E3', 'FDA Guidance for Industry: Integrated Summary of Effectiveness'],
};

/**
 * Section-specific prompt templates
 */
const SECTION_PROMPTS = {
  // Default template (used if no specific template exists)
  default: `
You are an expert regulatory affairs specialist helping to draft an IND submission.
For the following section, provide content that follows FDA guidelines and regulations.
Make the content specific, accurate, and properly formatted for an IND submission.

SECTION: {{section_code}} - {{section_name}}

CONTEXT INFORMATION:
{{context}}

REGULATORY GUIDELINES TO FOLLOW:
{{guidelines}}

REFERENCES AVAILABLE FOR CITATION:
{{references}}

Please provide well-structured, technically accurate content for this section.
Include appropriate inline citations where relevant, formatting them as [Author, Year] or [Guidance Document].
The content should be comprehensive yet concise, focusing on the most critical information for regulatory review.
`,

  // Module 2.7 - Clinical Summary templates
  2.7: `
You are an expert medical writer specializing in clinical regulatory documentation.
Draft a concise yet comprehensive clinical summary based on the available study data.
Focus on highlighting the key efficacy and safety findings that support the investigational drug.

SECTION: 2.7 - Clinical Summary

DRUG INFORMATION:
{{context}}

STUDY DATA AVAILABLE:
{{references}}

REGULATORY GUIDELINES:
{{guidelines}}

Draft a professional clinical summary that includes:
1. Overview of clinical development program
2. Summary of efficacy findings across studies
3. Summary of safety data and risk assessment
4. Benefit-risk assessment
5. Conclusions and proposed further studies

Use clear, scientific language and incorporate appropriate citations to the study reports using the format [Study ID].
`,

  // Module 3.2.P - Drug Product template
  '3.2.P': `
You are a pharmaceutical CMC expert writing an IND submission.
Draft the drug product section that describes the formulation, manufacturing process, and controls.

SECTION: 3.2.P - Drug Product

PRODUCT DETAILS:
{{context}}

MANUFACTURING INFORMATION:
{{references}}

REGULATORY REQUIREMENTS:
{{guidelines}}

Provide concise, technically accurate content covering:
1. Composition of the drug product
2. Pharmaceutical development considerations
3. Manufacturing process description (brief for IND)
4. Control of excipients
5. Control of drug product
6. Reference standards
7. Container closure system
8. Stability data and conclusions

Format the content professionally, using scientific terminology appropriate for regulatory submissions.
Cite relevant references using [Manufacturer, Year] format for supporting documents.
`,

  // Protocol synopsis template
  '5.3.5': `
You are a clinical research expert drafting a protocol synopsis for an IND submission.
Create a clear, comprehensive, and scientifically sound protocol synopsis based on the information provided.

SECTION: 5.3.5 - Protocol Synopsis

CLINICAL PROGRAM INFORMATION:
{{context}}

AVAILABLE BACKGROUND DATA:
{{references}}

REGULATORY CONSIDERATIONS:
{{guidelines}}

Draft a structured protocol synopsis covering:
1. Study title and design
2. Objectives (primary and secondary)
3. Study population and key inclusion/exclusion criteria
4. Treatment plan and duration
5. Efficacy assessments and endpoints
6. Safety assessments
7. Statistical considerations
8. Ethical considerations

Use precise medical and scientific language appropriate for a regulatory submission.
Format the synopsis with clear headings and concise paragraphs.
Include citations where appropriate using [Reference] format.
`,
};

/**
 * Fetch relevant regulatory guidelines for a section
 *
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {Promise<string>} - Relevant guidelines text
 */
async function fetchRegulatoryGuidelines(sectionCode) {
  try {
    // Check cache first
    if (guidelinesCache.has(sectionCode)) {
      const cached = guidelinesCache.get(sectionCode);
      // Return cached value if it's still valid
      if (cached.timestamp > Date.now() - CACHE_TIMEOUT) {
        return cached.data;
      }
    }

    // Find the most specific match for the section code
    const mainSection =
      Object.keys(REGULATORY_SOURCES)
        .filter(key => sectionCode.startsWith(key))
        .sort((a, b) => b.length - a.length)[0] || 'default';

    const sources = REGULATORY_SOURCES[mainSection] || [];

    if (sources.length === 0) {
      return 'No specific regulatory guidelines identified for this section.';
    }

    // Fetch guidelines from Supabase
    const { data: guidelines, error } = await supabase
      .from('regulatory_guidelines')
      .select('title, text, url')
      .in('reference_id', sources);

    if (error) {
      throw new Error(`Error fetching guidelines: ${error.message}`);
    }

    if (!guidelines || guidelines.length === 0) {
      // Try to load default guidelines from file
      try {
        const guidelinesPath = path.join(process.cwd(), 'data', 'guidelines', `${mainSection}.txt`);
        const guidelinesText = await readFile(guidelinesPath, 'utf8');
        return guidelinesText;
      } catch (fileError) {
        // No file is "none on file"; any other failure is a failed read.
        if (fileError?.code !== 'ENOENT') throw fileError;
        logger.info(`No file guidelines found for section ${sectionCode}`);
        return 'Please refer to FDA and ICH guidelines for IND submissions.';
      }
    }

    // Format guidelines text
    const guidelinesText = guidelines
      .map(g => `${g.title}\n${g.text}\n${g.url ? `Source: ${g.url}` : ''}`)
      .join('\n\n');

    // Cache the result
    guidelinesCache.set(sectionCode, {
      data: guidelinesText,
      timestamp: Date.now(),
    });

    return guidelinesText;
  } catch (error) {
    // 2026-10-15: a failed read was returned AS the guideline text ('Unable to
    // fetch …'), drafted against, and served by GET …/guidance with 200. It is
    // an error now; the store's own message stays in the log.
    logger.error(`Error in fetchRegulatoryGuidelines: ${error.message}`);
    throw new Error(`Regulatory guidelines for section ${sectionCode} could not be read.`);
  }
}

/**
 * Fetch available references for citation
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {Promise<Array>} - Array of available references
 */
async function fetchAvailableReferences(submissionId, sectionCode) {
  try {
    // Get the main section category (first part of section code)
    const mainSection = sectionCode.split('.')[0];

    // Fetch documents linked to this submission
    const { data: documents, error } = await supabase
      .from('ind_references')
      .select('id, title, author, year, url, document_type, filename')
      .eq('submission_id', submissionId);

    if (error) {
      logger.warn(`Error fetching references: ${error.message}`);
      return [];
    }

    // Filter documents by relevance to section
    let relevantDocs = documents;

    // Apply section-specific filtering
    switch (mainSection) {
      case '2': // Summaries
        relevantDocs = documents.filter(d =>
          ['clinical_study', 'preclinical_study', 'literature', 'guidance'].includes(
            d.document_type
          )
        );
        break;

      case '3': // Quality
        relevantDocs = documents.filter(d =>
          ['cmc_report', 'batch_record', 'specification', 'stability_report'].includes(
            d.document_type
          )
        );
        break;

      case '4': // Nonclinical
        relevantDocs = documents.filter(d =>
          ['preclinical_study', 'toxicology_report', 'pharmacology_report'].includes(
            d.document_type
          )
        );
        break;

      case '5': // Clinical
        relevantDocs = documents.filter(d =>
          ['clinical_study', 'csr', 'protocol', 'investigator_brochure'].includes(d.document_type)
        );
        break;
    }

    return relevantDocs.map(doc => ({
      id: doc.id,
      citation: `${doc.author ? doc.author : 'Unknown'}, ${doc.year ? doc.year : 'n.d.'}, ${doc.title}`,
      type: doc.document_type,
      url: doc.url || doc.filename,
    }));
  } catch (error) {
    logger.error(`Error in fetchAvailableReferences: ${error.message}`);
    return [];
  }
}

/**
 * Get context information about the submission and section
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {Promise<Object>} - Context information
 */
async function getSubmissionContext(submissionId, sectionCode) {
  try {
    // Get submission details
    const { data: submission, error: submissionError } = await supabase
      .from('ind_wizards')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (submissionError) {
      throw new Error(`Error fetching submission: ${submissionError.message}`);
    }

    // Get section definition
    const { data: sectionDef, error: sectionError } = await supabase
      .from('ind_sections')
      .select('name, description, parent_id')
      .eq('section_code', sectionCode)
      .single();

    if (sectionError && sectionError.code !== 'PGRST116') {
      // PGRST116 is "not found"
      throw new Error(`Error fetching section definition: ${sectionError.message}`);
    }

    // Get drug information
    const { data: drugInfo, error: drugError } = await supabase
      .from('ind_drug_info')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (drugError && drugError.code !== 'PGRST116') {
      // PGRST116 is "not found"
      throw new Error(`Error fetching drug information: ${drugError.message}`);
    }

    // Get any existing content for this section
    const { data: existingBlocks, error: blocksError } = await supabase
      .from('ind_blocks')
      .select('content, block_type')
      .eq('submission_id', submissionId)
      .eq('section_code', sectionCode);

    if (blocksError) {
      throw new Error(`Error fetching existing content: ${blocksError.message}`);
    }

    return {
      submission,
      sectionInfo: sectionDef || {
        name: `Section ${sectionCode}`,
        description: 'No description available',
      },
      drugInfo: drugInfo || {},
      existingContent: existingBlocks || [],
    };
  } catch (error) {
    logger.error(`Error in getSubmissionContext: ${error.message}`);
    throw error;
  }
}

/**
 * Format references for inclusion in prompt
 *
 * @param {Array} references - Array of reference objects
 * @returns {string} - Formatted references text
 */
function formatReferences(references) {
  if (!references || references.length === 0) {
    return 'No specific references available.';
  }

  return references.map((ref, index) => `[${index + 1}] ${ref.citation} (${ref.type})`).join('\n');
}

/**
 * Format existing content for context
 *
 * @param {Array} blocks - Array of content blocks
 * @returns {string} - Formatted content text
 */
function formatExistingContent(blocks) {
  if (!blocks || blocks.length === 0) {
    return '';
  }

  return blocks
    .map(block => {
      if (block.block_type === 'markdown') {
        return block.content.markdown;
      } else if (block.block_type === 'table') {
        return `[Table data available]`;
      } else if (block.block_type === 'figure') {
        return `[Figure: ${block.content.caption || 'Image'}]`;
      }
      return '';
    })
    .join('\n\n');
}

/**
 * Get prompt template for a section
 *
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {string} - Prompt template
 */
function getSectionPrompt(sectionCode) {
  // Find the most specific match for the section code
  const mainSection =
    Object.keys(SECTION_PROMPTS)
      .filter(key => sectionCode.startsWith(key))
      .sort((a, b) => b.length - a.length)[0] || 'default';

  return SECTION_PROMPTS[mainSection];
}

/**
 * Create prompt for AI content generation
 *
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @param {Object} context - Context information
 * @param {string} guidelines - Regulatory guidelines text
 * @param {Array} references - Available references
 * @returns {string} - Formatted prompt
 */
function createPrompt(sectionCode, context, guidelines, references) {
  // Get section-specific template
  const template = getSectionPrompt(sectionCode);

  // Format context information
  const contextText = `
Drug Name: ${context.drugInfo.generic_name || 'Not specified'}
Indication: ${context.drugInfo.indication || 'Not specified'}
Phase: ${context.submission.phase || 'Not specified'}
Sponsor: ${context.submission.sponsor_name || 'Not specified'}

Section Description: ${context.sectionInfo.description}

Existing Content:
${formatExistingContent(context.existingContent)}
`;

  // Replace template placeholders
  const prompt = template
    .replace('{{section_code}}', sectionCode)
    .replace('{{section_name}}', context.sectionInfo.name)
    .replace('{{context}}', contextText)
    .replace('{{guidelines}}', guidelines)
    .replace('{{references}}', formatReferences(references));

  return prompt;
}

/**
 * Parse citations from generated content
 *
 * @param {string} content - Generated content text
 * @param {Array} references - Available references
 * @returns {Object} - Parsed content with citation metadata
 */
function parseCitations(content, references) {
  // Regular expression to find citations in format [Author, Year] or [1]
  const citationRegex = /\[([\w\s,\.]+)(?:\s\((\d{4})\))?(?:,\s([\w\s]+))?\]|\[(\d+)\]/g;

  // Find all citations
  const citations = [];
  let match;

  while ((match = citationRegex.exec(content)) !== null) {
    const citation = match[0];
    let referenceIndex = null;

    // Check if it's a numeric citation [1]
    if (match[4]) {
      const index = parseInt(match[4], 10) - 1;
      if (index >= 0 && index < references.length) {
        referenceIndex = index;
      }
    } else {
      // Try to match author/year citation with references
      const author = match[1];
      const year = match[2];

      if (author) {
        // Find the reference that best matches this citation
        referenceIndex = references.findIndex(
          ref =>
            ref.citation.toLowerCase().includes(author.toLowerCase()) &&
            (!year || ref.citation.includes(year))
        );
      }
    }

    citations.push({
      text: citation,
      index: match.index,
      length: match[0].length,
      referenceIndex: referenceIndex !== -1 ? referenceIndex : null,
      reference: referenceIndex !== -1 ? references[referenceIndex] : null,
    });
  }

  return {
    content,
    citations,
  };
}

/**
 * Extract entities from generated content for knowledge graph
 *
 * @param {string} content - Generated content
 * @param {string} sectionCode - Section code
 * @param {string} submissionId - Submission ID
 * @returns {Promise<Array>} - Extracted entities
 */
async function extractEntities(content, sectionCode, submissionId) {
  try {
    // Knowledge-graph entity extraction (an index, not a governed record).
    const aiResult = await ai.chat({
      taskType: 'structured_output',
      callerModule: 'indCopilot.extractEntities',
      messages: [
        {
          role: 'system',
          content: `Extract key entities from the IND submission content.
          Return a JSON array of objects with format {type, name, attributes}.
          Entity types can include: Drug, Indication, Endpoint, Biomarker, Study, AdverseEvent.
          Attributes should include any relevant details mentioned.`,
        },
        {
          role: 'user',
          content: `Extract entities from this IND section ${sectionCode}:\n\n${content}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(aiResult.content);

    // Store entities in database
    if (result && result.entities && result.entities.length > 0) {
      const entities = result.entities.map(entity => ({
        submission_id: submissionId,
        entity_type: entity.type,
        entity_name: entity.name,
        section_code: sectionCode,
        attributes: entity.attributes,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('ind_knowledge_entities').insert(entities);

      if (error) {
        logger.warn(`Error saving entities: ${error.message}`);
      }
    }

    return result.entities || [];
  } catch (error) {
    logger.error(`Error extracting entities: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION-REQUIREMENT COVERAGE (deterministic, from the CTD record)
// ═══════════════════════════════════════════════════════════════════════════

/** A line that opens with a CTD code: "3.2.P.4 Control …", "## 3.2.P.4", "**3.2.P.4.**". */
const HEADING_CODE =
  /^\s*(?:#{1,6}\s+)?(?:[*_]{1,2}\s*)?(?:(?:section|module)\s+)?(m?\d+(?:\.[0-9A-Za-z]+)*)\.?(?=[\s:)*_–—-]|$)/i;

/** The CTD codes a text uses as headings, spelled as the record spells them. */
function headingCodesIn(text) {
  const codes = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = HEADING_CODE.exec(line);
    const code = match ? normalizeCtdCode(match[1]) : null;
    if (code) codes.add(code);
  }
  return codes;
}

const COVERAGE_MEASURES =
  'Sections the CTD record lists within this section as required for an IND, found as a heading ' +
  '(the section code at the start of a line) in the text. A heading present is a structural fact, ' +
  'not a judgment that the content under it is adequate.';

/**
 * What the CTD record (server/services/ind/ctd) says a section must contain,
 * measured against a text deterministically — and nothing more.
 *
 * - A section the record lists as containing others (3.2.P, 4.2, 2.6): which
 *   of the contained sections it marks required for an IND appear as headings;
 *   `percent` is present / required, rounded.
 * - A section the record describes in prose (2.5, 3.2.P.1): its key content
 *   elements are descriptions, which no deterministic check verifies (the
 *   authoring scan takes the same position, routes/authoring.router.ts). They
 *   are listed with `elements_verified: false`; `percent` is null, with why.
 * - A parent with no section required for an IND, or a code the record does
 *   not index: not measured, with why.
 *
 * Pure: no I/O, no model.
 *
 * @param {string} sectionCode
 * @param {string} content
 */
export function sectionRequirementCoverage(sectionCode, content) {
  const src = resolveSectionBriefSource(sectionCode);
  const coverage = {
    section_code: String(sectionCode ?? ''),
    measures: COVERAGE_MEASURES,
    record_match: src ? src.kind : 'not_indexed',
    answered_by: !src ? null : src.kind === 'parent' ? src.requested : src.entry.code,
    required_headings: [],
    present_headings: [],
    missing_headings: [],
    percent: null,
    not_assessed: null,
    elements: [],
    elements_verified: false,
  };
  if (!src) {
    coverage.not_assessed = `The CTD record has no entry for section "${coverage.section_code}", so nothing was measured.`;
    return coverage;
  }
  if (src.kind !== 'parent') {
    coverage.elements = [...src.entry.keyContentElements];
    coverage.not_assessed =
      `The record states what ${src.entry.code} must contain as ${coverage.elements.length} descriptions; ` +
      'no deterministic check verifies a description, so they are listed, not measured.';
    return coverage;
  }
  const headings = headingCodesIn(content);
  coverage.required_headings = src.children.filter((c) => c.requiredFor.includes('IND')).map((c) => c.code);
  coverage.present_headings = coverage.required_headings.filter((c) => headings.has(c));
  coverage.missing_headings = coverage.required_headings.filter((c) => !headings.has(c));
  if (coverage.required_headings.length === 0) {
    coverage.not_assessed = `The record marks none of the sections within ${src.requested} as required for an IND, so nothing was measured.`;
  } else {
    coverage.percent = Math.round((coverage.present_headings.length / coverage.required_headings.length) * 100);
  }
  return coverage;
}

/** Told to every narration call: the model narrates around the coverage, it does not score. */
const NARRATION_RULES = `The platform has measured the section against its CTD record; those facts are given below. Do not restate them as a figure and do not contradict them.
Do not give a score, percentage, rating, pass/fail, validity or compliance verdict, and do not state which required elements are present or missing.
Return a JSON object with:
{
  "narrative": a short review commentary on the content,
  "suggestions": array of specific drafting suggestions
}`;

/** The coverage as the lines a narration prompt carries. */
function coverageFacts(coverage) {
  const lines = [`Record coverage of section ${coverage.section_code} (deterministic):`];
  if (coverage.percent === null) {
    lines.push(`- Not measured: ${coverage.not_assessed}`);
  } else {
    lines.push(`- Required headings (IND): ${coverage.required_headings.join(', ')}`);
    lines.push(`- Present as headings: ${coverage.present_headings.join(', ') || 'none'}`);
    lines.push(`- Missing as headings: ${coverage.missing_headings.join(', ') || 'none'}`);
  }
  if (coverage.elements.length > 0) {
    lines.push(`- What the record says it must contain (descriptions, not verified): ${coverage.elements.join('; ')}`);
  }
  return lines.join('\n');
}

/**
 * What a model reply contributes: its narrative and suggestions, nothing else.
 * A score, verdict or element list it volunteers is dropped. Throws when the
 * reply is not a JSON object.
 */
function narrationFrom(aiResult) {
  const raw = String(aiResult?.content ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('The narration reply was not a JSON object.');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return {
    narrative: typeof parsed.narrative === 'string' && parsed.narrative.trim() ? parsed.narrative.trim() : null,
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : null,
    narration: { status: 'narrated', narrated_by: aiResult.model ?? null },
  };
}

/** A narration that could not be produced. The coverage beside it stands. */
function narrationUnavailable() {
  return {
    narrative: null,
    suggestions: null,
    narration: { status: 'unavailable', reason: 'The model narration could not be produced; the record coverage is unaffected.' },
  };
}

/**
 * Validate content against regulatory requirements
 *
 * 2026-10-15: this asked a model for { valid, score 0-100, missingElements },
 * returned and stored what it said, and answered score 0 / valid false for an
 * error. The figure is now the record coverage; the model narrates, and a
 * narration that fails is marked unavailable.
 *
 * @param {string} content - Generated content
 * @param {string} sectionCode - Section code
 * @param {Object} context - Context information
 * @returns {Promise<Object>} - { coverage, narrative, suggestions, narration }
 */
async function validateContent(content, sectionCode, context) {
  const coverage = sectionRequirementCoverage(sectionCode, content);
  let narration;
  try {
    // Regulatory review of a draft: only a model approved for high-risk
    // regulatory work may serve it (approved-models.ts). It pinned gpt-4o as a
    // 'general' request, which the gateway's approval check never sees.
    const aiResult = await ai.chat({
      taskType: 'regulatory_review',
      callerModule: 'indCopilot.validateContent',
      messages: [
        {
          role: 'system',
          content: `You are a regulatory affairs expert reviewing IND submission content.\n${NARRATION_RULES}`,
        },
        {
          role: 'user',
          content: `Review this content for IND section ${sectionCode}:

          ${content}

          ${coverageFacts(coverage)}

          Context:
          Submission Phase: ${context.submission.phase || 'Not specified'}
          Indication: ${context.drugInfo.indication || 'Not specified'}
          Drug Type: ${context.drugInfo.drug_type || 'Not specified'}`,
        },
      ],
      response_format: { type: 'json_object' },
    });
    narration = narrationFrom(aiResult);
  } catch (error) {
    logger.error(`Error narrating validation: ${error.message}`);
    narration = narrationUnavailable();
  }

  const validation = { coverage, ...narration };

  // Log validation result
  await supabase.from('ind_content_validations').insert({
    submission_id: context.submission.id,
    section_code: sectionCode,
    // SHA-256 of the whole content. It was the base64 of the first 15 bytes,
    // so two drafts with the same opening "hashed" alike.
    content_hash: createHash('sha256').update(content).digest('hex'),
    validation_result: validation,
    created_at: new Date().toISOString(),
  });

  return validation;
}

/**
 * Generate content for an IND section
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Generated content and metadata
 */
export async function generateSectionContent(submissionId, sectionCode, options = {}) {
  try {
    // 1. Gather context, guidelines, and references
    const context = await getSubmissionContext(submissionId, sectionCode);
    const guidelines = await fetchRegulatoryGuidelines(sectionCode);
    const references = await fetchAvailableReferences(submissionId, sectionCode);

    // 2. Create prompt for AI
    const prompt = createPrompt(sectionCode, context, guidelines, references);

    // 3. Draft the section. document_drafting: the gateway serves it with a
    // model approved for high-risk regulatory drafting, and refuses a caller-
    // named model that is not (options.model comes from the request body).
    // It defaulted to gpt-4o as a 'general' request.
    const aiResult = await ai.chat({
      taskType: 'document_drafting',
      callerModule: 'indCopilot.generateSectionContent',
      model: options.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs specialist with expertise in IND submissions to the FDA.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature || 0.3,
      max_tokens: options.max_tokens || 2500,
    });

    const generatedContent = aiResult.content;

    // 4. Process citations in the content
    const contentWithCitations = parseCitations(generatedContent, references);

    // 5. Extract entities for knowledge graph (async, doesn't block response)
    extractEntities(generatedContent, sectionCode, submissionId).catch(error => {
      logger.error(`Error in background entity extraction: ${error.message}`);
    });

    // 6. Validate content against regulatory requirements
    const validation = await validateContent(generatedContent, sectionCode, context);

    // 7. Log generation event
    await supabase.from('ind_generation_events').insert({
      submission_id: submissionId,
      section_code: sectionCode,
      // What served, not what was asked for (it recorded 'gpt-4o' by default).
      model: aiResult.model,
      prompt_length: prompt.length,
      response_length: generatedContent.length,
      citation_count: contentWithCitations.citations.length,
      // No score: this held the model's compliance figure (to 2026-10-15). The
      // record coverage is stored in ind_content_validations.
      validation_score: null,
      created_at: new Date().toISOString(),
    });

    // 8. Return the generated content with metadata
    return {
      content: generatedContent,
      citations: contentWithCitations.citations,
      validation: validation,
      references: references,
      // length / 4 estimates, named as such: they were returned as
      // prompt_tokens / completion_tokens, the provider's own usage fields.
      estimated_prompt_tokens: Math.round(prompt.length / 4),
      estimated_completion_tokens: Math.round(generatedContent.length / 4),
      section_code: sectionCode,
      model: aiResult.model,
    };
  } catch (error) {
    logger.error(`Error generating content: ${error.message}`, error);
    throw error;
  }
}

/**
 * Generate a follow-up response based on user instructions/questions
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @param {string} originalContent - The original generated content
 * @param {string} userInstruction - User instructions or questions
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} - Generated response and metadata
 */
export async function generateFollowupResponse(
  submissionId,
  sectionCode,
  originalContent,
  userInstruction,
  options = {}
) {
  try {
    // Get context and references
    const context = await getSubmissionContext(submissionId, sectionCode);
    const references = await fetchAvailableReferences(submissionId, sectionCode);

    // Create prompt for follow-up
    const prompt = `
You previously generated the following content for section ${sectionCode} of an IND submission:

---BEGIN ORIGINAL CONTENT---
${originalContent}
---END ORIGINAL CONTENT---

The user has the following instruction or question:
${userInstruction}

Please respond to the user's instruction/question in the context of the IND submission.
Maintain the same level of regulatory expertise and scientific accuracy.
Reference relevant FDA guidelines or scientific literature as needed.
`;

    // Revising regulatory content: document_drafting, as for the first draft.
    const aiResult = await ai.chat({
      taskType: 'document_drafting',
      callerModule: 'indCopilot.generateFollowupResponse',
      model: options.model,
      messages: [
        {
          role: 'system',
          content: 'You are a regulatory affairs specialist assisting with an IND submission.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature || 0.3,
      max_tokens: options.max_tokens || 1500,
    });

    const response = aiResult.content;

    // Process citations in the response
    const responseWithCitations = parseCitations(response, references);

    // Log the follow-up event
    await supabase.from('ind_generation_events').insert({
      submission_id: submissionId,
      section_code: sectionCode,
      model: aiResult.model,
      event_type: 'followup',
      prompt_length: prompt.length,
      response_length: response.length,
      citation_count: responseWithCitations.citations.length,
      created_at: new Date().toISOString(),
    });

    // Return the response with metadata
    return {
      content: response,
      citations: responseWithCitations.citations,
      references: references,
      // length / 4 estimates, named as such (they were prompt_tokens / completion_tokens).
      estimated_prompt_tokens: Math.round(prompt.length / 4),
      estimated_completion_tokens: Math.round(response.length / 4),
      is_followup: true,
    };
  } catch (error) {
    logger.error(`Error generating follow-up response: ${error.message}`, error);
    throw error;
  }
}

/**
 * Get citation details by reference and context
 *
 * @param {string} referenceId - ID of the referenced document
 * @param {string} citationContext - The text surrounding the citation
 * @returns {Promise<Object>} - Citation details
 */
export async function getCitationDetails(referenceId, citationContext) {
  try {
    // Get document details
    const { data: reference, error } = await supabase
      .from('ind_references')
      .select('*')
      .eq('id', referenceId)
      .single();

    if (error) {
      throw new Error(`Error fetching reference: ${error.message}`);
    }

    // For text documents stored in Supabase Storage, fetch excerpt
    let excerpt = '';

    if (reference.content_path) {
      try {
        const { data, error: downloadError } = await supabase.storage
          .from('ind-documents')
          .download(reference.content_path);

        if (!downloadError && data) {
          // Attempt to extract context around the citation
          const text = await data.text();

          // Basic context extraction - in a real implementation, this would use
          // better text analysis to find the most relevant excerpt
          const keywords = citationContext
            .replace(/[\[\].,;:'"]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 4);

          for (const keyword of keywords) {
            const pattern = new RegExp(`[^.!?]*${keyword}[^.!?]*[.!?]`, 'i');
            const match = text.match(pattern);
            if (match) {
              excerpt = match[0].trim();
              break;
            }
          }

          // If no context found, use the first paragraph
          if (!excerpt) {
            excerpt = text.split('\n\n')[0];
          }
        }
      } catch (fetchError) {
        logger.warn(`Error fetching document excerpt: ${fetchError.message}`);
      }
    }

    return {
      reference,
      excerpt: excerpt || 'Excerpt not available.',
      citation: `${reference.author ? reference.author + ', ' : ''}${reference.year ? reference.year + '. ' : ''}${reference.title}.`,
    };
  } catch (error) {
    logger.error(`Error getting citation details: ${error.message}`);
    throw error;
  }
}

/**
 * Get regulatory guidance for a specific section
 *
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {Promise<Object>} - Regulatory guidance
 */
export async function getRegulatoryGuidance(sectionCode) {
  try {
    const guidelines = await fetchRegulatoryGuidelines(sectionCode);

    // Find the most specific match for the section code
    const mainSection =
      Object.keys(REGULATORY_SOURCES)
        .filter(key => sectionCode.startsWith(key))
        .sort((a, b) => b.length - a.length)[0] || 'default';

    const sources = REGULATORY_SOURCES[mainSection] || [];

    return {
      guidance: guidelines,
      sources: sources,
      section_code: sectionCode,
    };
  } catch (error) {
    logger.error(`Error getting regulatory guidance: ${error.message}`);
    throw error;
  }
}

/**
 * Analyze existing content and suggest improvements
 *
 * 2026-10-15: the figure was a model's completeness_score (0 for an empty
 * section) beside its own regulatory_gaps. It is the record coverage now; the
 * model narrates.
 *
 * @param {string} submissionId - The IND submission ID
 * @param {string} sectionCode - The section code (e.g., '2.7.1')
 * @returns {Promise<Object>} - { coverage, narrative, suggestions, narration, section_code }
 */
export async function analyzeContent(submissionId, sectionCode) {
  try {
    // Get existing content
    const { data: blocks, error } = await supabase
      .from('ind_blocks')
      .select('content, block_type')
      .eq('submission_id', submissionId)
      .eq('section_code', sectionCode);

    if (error) {
      throw new Error(`Error fetching content: ${error.message}`);
    }

    // Format existing content
    const content = formatExistingContent(blocks);
    const coverage = sectionRequirementCoverage(sectionCode, content);

    if (!blocks || blocks.length === 0) {
      return {
        coverage,
        narrative: null,
        suggestions: null,
        narration: { status: 'not_run', reason: 'The section has no content to narrate.' },
        section_code: sectionCode,
      };
    }

    // Get regulatory guidelines for this section
    const guidelines = await fetchRegulatoryGuidelines(sectionCode);

    // Regulatory review of existing content: narration around the record coverage.
    const aiResult = await ai.chat({
      taskType: 'regulatory_review',
      callerModule: 'indCopilot.analyzeContent',
      messages: [
        {
          role: 'system',
          content: `You are a regulatory affairs expert analyzing IND submission content.\n${NARRATION_RULES}`,
        },
        {
          role: 'user',
          content: `Analyze this content for IND section ${sectionCode}:

          ${content}

          ${coverageFacts(coverage)}

          Regulatory Guidelines:
          ${guidelines}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const analysis = { coverage, ...narrationFrom(aiResult) };

    // Log the analysis
    await supabase.from('ind_content_analyses').insert({
      submission_id: submissionId,
      section_code: sectionCode,
      analysis_result: analysis,
      created_at: new Date().toISOString(),
    });

    return {
      ...analysis,
      section_code: sectionCode,
    };
  } catch (error) {
    logger.error(`Error analyzing content: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stream AI-generated content for an IND section via the OpenAI streaming API.
 *
 * The caller is responsible for consuming the async iterable and pushing each
 * delta to the client (e.g. via Server-Sent Events).
 *
 * @param {string} submissionId
 * @param {string} sectionCode
 * @param {Object} options  - model, temperature, max_tokens
 * @returns {AsyncIterable}  OpenAI stream object
 */
export async function streamSectionContent(submissionId, sectionCode, options = {}) {
  const context = await getSubmissionContext(submissionId, sectionCode);
  const guidelines = await fetchRegulatoryGuidelines(sectionCode);
  const references = await fetchAvailableReferences(submissionId, sectionCode);
  const prompt = createPrompt(sectionCode, context, guidelines, references);

  const stream = await ai.chat({
    taskType: 'document_drafting',
    callerModule: 'indCopilot.streamSectionContent',
    model: options.model,
    messages: [
      {
        role: 'system',
        content:
          'You are a regulatory affairs specialist with expertise in IND submissions to the FDA.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature || 0.3,
    max_tokens: options.max_tokens || 2500,
    stream: true,
  });

  return stream;
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY WRAPPER WITH EXPONENTIAL BACK-OFF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wraps any async function with retry + exponential back-off.
 *
 * @param {Function}  fn           - async function to call
 * @param {Object}    opts
 * @param {number}    opts.retries - max attempts (default 3)
 * @param {number}    opts.delay   - initial delay ms (default 1 000)
 * @param {number}    opts.factor  - back-off multiplier (default 2)
 * @returns {Promise<any>}
 */
async function withRetry(fn, { retries = 3, delay = 1000, factor = 2 } = {}) {
  let lastError;
  let wait = delay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Do not retry on client errors (4xx) that are not 429 rate-limits
      const status = err?.status ?? err?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      if (attempt < retries) {
        logger.warn(
          `[indCopilot] Attempt ${attempt} failed (${err.message}). Retrying in ${wait}ms…`
        );
        await new Promise(r => setTimeout(r, wait));
        wait *= factor;
      }
    }
  }
  throw lastError;
}

/**
 * Resilient wrapper for generateSectionContent — retries up to 3 times
 * on OpenAI transient failures/rate-limits before propagating the error.
 */
export async function generateSectionContentWithRetry(submissionId, sectionCode, options = {}) {
  return withRetry(() => generateSectionContent(submissionId, sectionCode, options), {
    retries: options.retries ?? 3,
    delay: options.retryDelay ?? 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate content for multiple IND sections sequentially (with retry on each).
 * Returns a map of sectionCode → result (or error).
 *
 * @param {string}   submissionId
 * @param {string[]} sectionCodes
 * @param {Object}   options
 * @returns {Promise<Record<string, {content?: string, error?: string}>>}
 */
export async function generateBatchSectionContent(submissionId, sectionCodes, options = {}) {
  const results = {};
  for (const code of sectionCodes) {
    try {
      results[code] = await generateSectionContentWithRetry(submissionId, code, options);
    } catch (err) {
      logger.error(`Batch generation failed for section ${code}: ${err.message}`);
      results[code] = { error: err.message, section_code: code };
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE CHECKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cross-check IND section content against what the CTD record requires of the
 * section (sectionRequirementCoverage), with a model narration around it.
 *
 * 2026-10-15: this asked a model for a 0-100 score and a pass /
 * conditional_pass / fail verdict, called it `passed` at 70, and answered
 * score 0 / passed false for an error or empty content. The figure is now the
 * record coverage; a narration that fails is marked unavailable.
 *
 * @param {string} content      - Section content to check
 * @param {string} sectionCode  - CTD section code
 * @returns {Promise<{section_code: string, coverage: Object, narrative: string|null, suggestions: string[]|null, narration: Object}>}
 */
export async function checkFDACompliance(content, sectionCode) {
  const coverage = sectionRequirementCoverage(sectionCode, content);
  if (!content || !content.trim()) {
    return {
      section_code: sectionCode,
      coverage,
      narrative: null,
      suggestions: null,
      narration: { status: 'not_run', reason: 'No content was provided.' },
    };
  }

  const prompt = `
Review the following IND section content against 21 CFR 312 and the ICH CTD guidelines.

Section: ${sectionCode}

Content:
---
${content.slice(0, 3000)}
---

${coverageFacts(coverage)}

${NARRATION_RULES}

Return only valid JSON.`;

  try {
    const completion = await withRetry(() =>
      ai.chat({
        taskType: 'regulatory_review',
        callerModule: 'indCopilot.checkFDACompliance',
        messages: [
          {
            role: 'system',
            content: 'You are an FDA IND compliance reviewer. You narrate; you do not score. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
      })
    );

    return { section_code: sectionCode, coverage, ...narrationFrom(completion) };
  } catch (err) {
    logger.error(`FDA compliance narration failed: ${err.message}`);
    return { section_code: sectionCode, coverage, ...narrationUnavailable() };
  }
}

export default {
  generateSectionContent,
  generateSectionContentWithRetry,
  generateFollowupResponse,
  getCitationDetails,
  getRegulatoryGuidance,
  analyzeContent,
  streamSectionContent,
  generateBatchSectionContent,
  checkFDACompliance,
  sectionRequirementCoverage,
};
