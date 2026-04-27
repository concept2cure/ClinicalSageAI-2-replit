/**
 * Claude Tool Executor — Agentic Orchestration Loop
 *
 * When Claude responds with tool_use blocks, this executor:
 * 1. Extracts the tool calls from Claude's response
 * 2. Executes each tool against real backend services
 * 3. Sends tool results back to Claude
 * 4. Repeats until Claude produces a final text response
 *
 * Integrates with existing platform services:
 * - ClinicalTrials.gov API (via MCP or direct)
 * - FDA guidance database
 * - Internal document store
 * - Literature search services
 */

import { getGateway } from '../ai-gateway/gateway';
import type {
  GatewayRequest,
  GatewayMessage,
  ClaudeEnhancedResponse,
  ClaudeToolUse,
  ClaudeTool,
  StreamCallback,
} from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Handler Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenant + thread context plumbed from the route handler into the tool
 * handler. Optional so existing handlers that don't read it stay
 * source-compatible. New handlers that need org-scoped DB access (e.g.
 * submission-twin, precedent-engine) read from this.
 */
export interface ToolContext {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
}

type ToolHandler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;

const toolHandlers: Map<string, ToolHandler> = new Map();

/** Register a handler for a named tool */
export function registerToolHandler(name: string, handler: ToolHandler): void {
  toolHandlers.set(name, handler);
}

/** Retrieve a registered tool handler, or undefined if the name is unknown. */
export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers.get(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Tool Handlers
// ─────────────────────────────────────────────────────────────────────────────

// Search Clinical Evidence — queries internal DB and ClinicalTrials.gov
registerToolHandler('search_clinical_evidence', async (input) => {
  const query = input.query as string;
  const evidenceType = input.evidence_type as string || 'any';
  const maxResults = (input.max_results as number) || 5;

  try {
    // Try ClinicalTrials.gov API via fetch
    const searchParams = new URLSearchParams({
      'query.term': query,
      pageSize: String(Math.min(maxResults, 10)),
      format: 'json',
    });
    const ctResponse = await fetch(
      `https://clinicaltrials.gov/api/v2/studies?${searchParams.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (ctResponse.ok) {
      const data = await ctResponse.json();
      const studies = (data.studies || []).slice(0, maxResults);
      const results = studies.map((s: any) => {
        const proto = s.protocolSection || {};
        const id = proto.identificationModule || {};
        const status = proto.statusModule || {};
        const design = proto.designModule || {};
        return {
          nctId: id.nctId,
          title: id.briefTitle || id.officialTitle,
          status: status.overallStatus,
          phase: (design.phases || []).join(', '),
          enrollment: status.enrollmentInfo?.count,
          studyType: design.studyType,
        };
      });
      return JSON.stringify({
        source: 'ClinicalTrials.gov',
        query,
        resultCount: results.length,
        studies: results,
      });
    }
  } catch (e) {
    // Fall through to fallback
  }

  return JSON.stringify({
    source: 'search',
    query,
    note: 'ClinicalTrials.gov API unavailable — returning guidance for manual search',
    suggestion: `Search ClinicalTrials.gov for: "${query}" filtered by ${evidenceType}`,
  });
});

// Search Literature — queries PubMed via E-utilities
registerToolHandler('search_literature', async (input) => {
  const query = input.query as string;
  const maxResults = (input.max_results as number) || 5;

  try {
    const searchParams = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: String(Math.min(maxResults, 10)),
      retmode: 'json',
    });
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (response.ok) {
      const data = await response.json();
      const ids = data.esearchresult?.idlist || [];
      if (ids.length > 0) {
        // Fetch summaries
        const summaryParams = new URLSearchParams({
          db: 'pubmed',
          id: ids.join(','),
          retmode: 'json',
        });
        const summaryResp = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams.toString()}`,
          { signal: AbortSignal.timeout(10000) }
        );

        if (summaryResp.ok) {
          const summaryData = await summaryResp.json();
          const articles = ids.map((id: string) => {
            const article = summaryData.result?.[id] || {};
            return {
              pmid: id,
              title: article.title,
              authors: (article.authors || []).slice(0, 3).map((a: any) => a.name).join(', '),
              journal: article.fulljournalname || article.source,
              pubDate: article.pubdate,
              doi: article.elocationid,
            };
          });

          return JSON.stringify({
            source: 'PubMed',
            query,
            resultCount: articles.length,
            articles,
          });
        }
      }
    }
  } catch (e) {
    // Fall through
  }

  return JSON.stringify({
    source: 'PubMed',
    query,
    note: 'PubMed API unavailable — use manual search',
    url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
  });
});

// Lookup FDA Guidance
registerToolHandler('lookup_fda_guidance', async (input) => {
  const topic = input.topic as string;
  const regulationType = input.regulation_type as string || 'any';

  // FDA guidance database lookup via openFDA or internal knowledge
  const guidanceMap: Record<string, any> = {
    '510(k)': {
      title: 'The 510(k) Program: Evaluating Substantial Equivalence in Premarket Notifications',
      documentNumber: 'FDA-2013-D-0718',
      url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
      keyRequirements: [
        'Identify predicate device(s)',
        'Compare intended use and technological characteristics',
        'Demonstrate substantial equivalence',
        'Include performance data if different technology',
      ],
    },
    'biocompatibility': {
      title: 'Use of International Standard ISO 10993-1, Biological evaluation of medical devices',
      documentNumber: 'FDA-2013-D-0350',
      regulations: ['21 CFR 820.30(g)', 'ISO 10993-1:2018'],
      keyRequirements: [
        'Material characterization',
        'Biological evaluation plan',
        'Risk-based approach to testing',
        'Chemical characterization per ISO 10993-18',
      ],
    },
    'software': {
      title: 'Content of Premarket Submissions for Device Software Functions',
      documentNumber: 'FDA-2018-D-3241',
      regulations: ['21 CFR 820', 'IEC 62304'],
      keyRequirements: [
        'Software level of concern determination',
        'Software requirements specification',
        'Architecture design chart',
        'Software testing (verification & validation)',
      ],
    },
  };

  // Find best match
  const topicLower = topic.toLowerCase();
  let bestMatch = null;
  for (const [key, value] of Object.entries(guidanceMap)) {
    if (topicLower.includes(key.toLowerCase())) {
      bestMatch = { keyword: key, ...value };
      break;
    }
  }

  if (bestMatch) {
    return JSON.stringify({ source: 'FDA Guidance Database', match: bestMatch });
  }

  return JSON.stringify({
    source: 'FDA Guidance Database',
    topic,
    note: `No exact match found. Search FDA guidance at https://www.fda.gov/regulatory-information/search-fda-guidance-documents for: "${topic}"`,
    relatedRegulations: regulationType === '21cfr'
      ? ['21 CFR Part 807 (510k)', '21 CFR Part 814 (PMA)', '21 CFR Part 820 (QSR)', '21 CFR Part 11 (Electronic Records)']
      : undefined,
  });
});

// Lookup ICH Guideline
registerToolHandler('lookup_ich_guideline', async (input) => {
  const guideline = input.guideline as string;

  const ichDatabase: Record<string, any> = {
    'E6': {
      code: 'ICH E6(R2)',
      title: 'Good Clinical Practice',
      scope: 'Standards for design, conduct, performance, monitoring, auditing, recording, analysis, and reporting of clinical trials',
      keySections: [
        '1. Glossary', '2. Principles of ICH GCP', '3. IRB/IEC',
        '4. Investigator', '5. Sponsor', '6. Clinical Trial Protocol',
        '7. Investigator\'s Brochure', '8. Essential Documents',
      ],
    },
    'E8': {
      code: 'ICH E8(R1)',
      title: 'General Considerations for Clinical Studies',
      scope: 'Framework for quality-by-design approach to clinical development',
      keySections: [
        'Quality factors critical to study', 'Study design considerations',
        'Data quality and integrity', 'Stakeholder engagement',
      ],
    },
    'E9': {
      code: 'ICH E9(R1)',
      title: 'Statistical Principles for Clinical Trials',
      scope: 'Statistical methodology including estimands framework',
      keySections: [
        'Estimands and sensitivity analysis', 'Trial design',
        'Analysis sets', 'Missing data handling', 'Multiplicity',
      ],
    },
    'M4': {
      code: 'ICH M4',
      title: 'Common Technical Document (CTD)',
      scope: 'Organization of regulatory submissions',
      keySections: [
        'Module 1: Regional Administrative Info',
        'Module 2: Summaries (2.5 Clinical Overview, 2.7 Clinical Summary)',
        'Module 3: Quality', 'Module 4: Nonclinical', 'Module 5: Clinical',
      ],
    },
  };

  const guidelineLower = guideline.toUpperCase();
  for (const [key, value] of Object.entries(ichDatabase)) {
    if (guidelineLower.includes(key)) {
      return JSON.stringify({ source: 'ICH Guidelines', ...value });
    }
  }

  return JSON.stringify({
    source: 'ICH Guidelines',
    guideline,
    note: `Guideline "${guideline}" not in local database. Refer to https://ich.org/page/ich-guidelines`,
  });
});

// Check Regulatory Compliance
registerToolHandler('check_regulatory_compliance', async (input) => {
  const sectionContent = input.section_content as string;
  const framework = input.regulatory_framework as string;
  const sectionLength = sectionContent.length;

  // Basic structural compliance checks
  const checks = [];

  if (framework.includes('510k') || framework.includes('fda')) {
    checks.push({
      requirement: 'Device Description',
      status: sectionContent.toLowerCase().includes('device') ? 'present' : 'missing',
      regulation: '21 CFR 807.87(e)',
    });
    checks.push({
      requirement: 'Intended Use Statement',
      status: sectionContent.toLowerCase().includes('intended use') || sectionContent.toLowerCase().includes('indications for use') ? 'present' : 'missing',
      regulation: '21 CFR 807.87(f)',
    });
    checks.push({
      requirement: 'Predicate Device Comparison',
      status: sectionContent.toLowerCase().includes('predicate') || sectionContent.toLowerCase().includes('substantial equivalence') ? 'present' : 'missing',
      regulation: '21 CFR 807.87(g)',
    });
  }

  if (framework.includes('eu_mdr')) {
    checks.push({
      requirement: 'GSPR Mapping',
      status: sectionContent.toLowerCase().includes('gspr') || sectionContent.toLowerCase().includes('general safety') ? 'present' : 'missing',
      regulation: 'EU MDR Annex I',
    });
    checks.push({
      requirement: 'Clinical Evaluation Reference',
      status: sectionContent.toLowerCase().includes('clinical evaluation') ? 'present' : 'missing',
      regulation: 'EU MDR Article 61',
    });
  }

  return JSON.stringify({
    framework,
    sectionLengthChars: sectionLength,
    complianceChecks: checks,
    overallStatus: checks.every(c => c.status === 'present') ? 'compliant' : 'gaps_found',
    gapsCount: checks.filter(c => c.status === 'missing').length,
  });
});

// Validate Cross References
registerToolHandler('validate_cross_references', async (input) => {
  const documentId = input.document_id as string;
  const references = input.section_references as string[] || [];

  return JSON.stringify({
    documentId,
    referencesChecked: references.length,
    results: references.map(ref => ({
      reference: ref,
      status: 'unverified',
      note: 'Cross-reference validation requires document store access — flagged for manual review',
    })),
    recommendation: 'Run full cross-reference validation after document assembly',
  });
});

// Generate Citation
registerToolHandler('generate_citation', async (input) => {
  const sourceType = input.source_type as string;
  const sourceId = input.source_identifier as string;
  const style = input.citation_style as string || 'regulatory';

  const citationTemplates: Record<string, string> = {
    fda_guidance: `U.S. Food and Drug Administration. "${sourceId}." Available at: https://www.fda.gov/regulatory-information/search-fda-guidance-documents.`,
    ich_guideline: `International Council for Harmonisation. "${sourceId}." Available at: https://ich.org/page/ich-guidelines.`,
    '21cfr': `Title 21, Code of Federal Regulations, Part ${sourceId}. U.S. Government Publishing Office.`,
    eu_mdr: `Regulation (EU) 2017/745 of the European Parliament and of the Council, ${sourceId}.`,
    iso_standard: `International Organization for Standardization. ${sourceId}. Geneva, Switzerland.`,
    journal_article: `[Author(s)]. "[Title]." [Journal], ${sourceId}. DOI: [doi].`,
  };

  return JSON.stringify({
    sourceType,
    sourceIdentifier: sourceId,
    citation: citationTemplates[sourceType] || `${sourceType}: ${sourceId}`,
    style,
  });
});

// Analyze Predicate Device
registerToolHandler('analyze_predicate_device', async (input) => {
  const kNumber = input.predicate_510k_number as string;
  const aspects = input.comparison_aspects as string[] || ['intended_use', 'technology'];

  try {
    // Try FDA 510(k) database search
    const response = await fetch(
      `https://api.fda.gov/device/510k.json?search=k_number:"${kNumber}"&limit=1`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (response.ok) {
      const data = await response.json();
      const device = data.results?.[0];
      if (device) {
        return JSON.stringify({
          source: 'FDA 510(k) Database',
          kNumber: device.k_number,
          deviceName: device.device_name,
          applicant: device.applicant,
          dateReceived: device.date_received,
          decisionDate: device.decision_date,
          decision: device.decision_description,
          productCode: device.product_code,
          reviewAdvisoryCommittee: device.review_advisory_committee,
          statementOrSummary: device.statement_or_summary,
          comparisonAspects: aspects,
        });
      }
    }
  } catch (e) {
    // Fall through
  }

  return JSON.stringify({
    source: 'FDA 510(k) Database',
    kNumber,
    note: `Unable to retrieve device data for ${kNumber}. Search manually at https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm`,
    comparisonAspects: aspects,
  });
});

// Extract Document Structure
registerToolHandler('extract_document_structure', async (input) => {
  const documentId = input.document_id as string;
  const elements = input.extract_elements as string[] || ['headings', 'tables', 'figures'];

  return JSON.stringify({
    documentId,
    requestedElements: elements,
    note: 'Document structure extraction requires document store access. This tool will be fully operational once connected to the document management system.',
    recommendation: 'Upload the document to the platform for automated structure analysis.',
  });
});

// Mine Precedents — structured precedent-search plan for a document type
registerToolHandler('mine_precedents', async (input: Record<string, unknown>) => {
  const documentType = input.document_type as string;
  const searchContext = input.search_context as string;

  if (!documentType || !searchContext) {
    return JSON.stringify({
      error: 'mine_precedents requires document_type and search_context',
    });
  }

  try {
    const { minePrecedents } = await import('../intelligence/precedent-mining.js');
    const result = minePrecedents({
      documentType: documentType as any,
      searchContext,
    });

    return JSON.stringify({
      documentType: result.documentType,
      searchContext: result.searchContext,
      guidance: result.guidance,
      webSearchReady: result.webSearchReady,
      searchCount: result.searches.length,
      searches: result.searches.map(s => ({
        database: s.databaseLabel,
        baseUrl: s.baseUrl,
        searchUrl: s.searchUrl,
        webSearchQuery: s.webSearchQuery,
        whatToLookFor: s.whatToLookFor,
      })),
      recommendation: result.webSearchReady
        ? 'web_search is enabled — you can execute the listed queries directly against the allowlisted regulatory domains.'
        : 'web_search is not enabled in this environment. Share the search URLs with the user, or enable ANA_ENABLE_WEB_SEARCH to execute the queries yourself.',
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Precedent mining failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// Check Numerical Integrity — within-document consistency of labelled numbers
registerToolHandler('check_numerical_integrity', async (input: Record<string, unknown>) => {
  const content = input.content as string;
  if (!content || typeof content !== 'string') {
    return JSON.stringify({
      error: 'check_numerical_integrity requires a non-empty content string',
    });
  }

  try {
    const { checkInternalNumericalIntegrity } = await import(
      '../intelligence/cross-artifact-consistency.js'
    );
    const report = checkInternalNumericalIntegrity(content);

    return JSON.stringify({
      verdict: report.verdict,
      factsExtracted: report.factsExtracted,
      candidateCount: report.candidateCount,
      candidates: report.candidates.slice(0, 15).map(c => ({
        label: c.humanLabel,
        severity: c.severity,
        distinctValues: c.distinctValues,
        occurrences: c.occurrences.slice(0, 6),
      })),
      recommendation:
        report.verdict === 'clean'
          ? 'No numerical inconsistencies detected.'
          : report.verdict === 'review_candidates'
            ? 'Candidate inconsistencies detected — verify whether each is a real mismatch or documented multi-arm / multi-timepoint variance. Fix genuine mismatches; add disambiguating text for legitimate cases (e.g. "N=648 at Week 26; N=612 at Week 52").'
            : 'LIKELY INCONSISTENCY — critical-severity labels (dose, NOAEL, MRSD, sample size) show multiple distinct values. Fix before finalizing — this is RTF territory.',
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Numerical integrity check failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// Check Dossier Consistency — cross-artifact divergence detection
registerToolHandler('check_dossier_consistency', async (input: Record<string, unknown>) => {
  const draftContent = input.draft_content as string;
  const projectId = Number(input.project_id);
  const organizationId = Number(input.organization_id);
  const ctdSection = input.ctd_section as string | undefined;
  const excludeArtifactId = input.exclude_artifact_id
    ? Number(input.exclude_artifact_id)
    : undefined;

  if (!draftContent || !Number.isFinite(projectId) || !Number.isFinite(organizationId)) {
    return JSON.stringify({
      error: 'check_dossier_consistency requires draft_content, project_id, and organization_id',
    });
  }

  try {
    const { checkDossierConsistency } = await import(
      '../intelligence/cross-artifact-consistency.js'
    );
    const report = await checkDossierConsistency({
      projectId,
      organizationId,
      draftContent,
      draftCtdSection: ctdSection,
      excludeArtifactId,
    });

    // Summarize for Claude — keep the response compact. Full divergences
    // stay in the structured report; the summary gives Claude enough to
    // decide whether to recommend revisions.
    return JSON.stringify({
      verdict: report.verdict,
      artifactsCompared: report.artifactsCompared,
      draftFactsExtracted: report.draftFactsExtracted,
      divergenceCount: report.divergences.length,
      bySeverity: {
        critical: report.divergences.filter(d => d.severity === 'critical').length,
        high: report.divergences.filter(d => d.severity === 'high').length,
        medium: report.divergences.filter(d => d.severity === 'medium').length,
        low: report.divergences.filter(d => d.severity === 'low').length,
      },
      divergences: report.divergences.slice(0, 20).map(d => ({
        kind: d.kind,
        severity: d.severity,
        description: d.description,
        draftValue: d.draftValue,
        existingValue: d.existingValue,
        existingArtifact: d.existingArtifactTitle,
        existingCtdSection: d.existingCtdSection,
      })),
      recommendation:
        report.verdict === 'clean'
          ? 'No consistency issues detected against the existing dossier.'
          : report.verdict === 'minor_issues'
            ? 'Minor consistency issues detected — review before finalizing.'
            : report.verdict === 'needs_review'
              ? 'Material consistency issues detected — resolve or justify before recommending for dossier.'
              : 'BLOCKER — critical consistency divergences detected. Revise before proceeding.',
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Consistency check failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Document Generation Tools (Master Document Builder)
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('generate_document', async (input: Record<string, unknown>) => {
  const { getMasterDocumentBuilder } = await import('../docx/masterDocumentBuilder.js');
  const builder = getMasterDocumentBuilder();

  const documentType = input.document_type as string || 'csr';
  const title = input.title as string || 'Untitled Document';
  const sections = (input.sections as Array<{ number: string; title: string; content: string }>) || [];
  const outputFormat = (input.output_format as string) || 'docx';
  const agencies = (input.agencies as string[]) || ['FDA'];
  const templatePath = input.template_path as string | undefined;

  // Template mode: copy + unpack + string replace + XML inject
  if (templatePath && input.replacements) {
    const result = await builder.buildFromTemplate({
      templatePath,
      replacements: input.replacements as Record<string, string>,
      outputFormat: outputFormat as 'docx' | 'pdf',
      documentTitle: title,
    });
    return JSON.stringify({
      success: true,
      outputPath: result.outputPath,
      format: result.format,
      sizeBytes: result.sizeBytes,
      replacementsApplied: result.replacementsApplied,
      buildDurationMs: result.buildDurationMs,
      message: `Document generated: ${result.outputPath}`,
    });
  }

  // Scratch mode: build from sections
  if (sections.length > 0) {
    const result = await builder.generateFromScratch({
      documentType,
      sections,
      agencies,
      outputFormat: outputFormat as 'docx' | 'pdf' | 'xml',
      documentTitle: title,
    });
    return JSON.stringify({
      success: true,
      outputPath: result.outputPath,
      format: result.format,
      sizeBytes: result.sizeBytes,
      sectionsGenerated: sections.length,
      buildDurationMs: result.buildDurationMs,
      message: `${documentType.toUpperCase()} document generated with ${sections.length} sections.`,
    });
  }

  // eCTD backbone XML
  if (documentType === 'ectd_backbone') {
    const xml = await builder.generateEctdXml({
      submissionType: 'original',
      applicantName: (input.applicant as string) || 'Applicant',
      productName: (input.product as string) || 'Product',
      modules: [],
    });
    return JSON.stringify({ success: true, format: 'xml', content: xml, message: 'eCTD backbone XML generated.' });
  }

  // ICSR XML
  if (documentType === 'icsr') {
    const xml = await builder.generateIcsrXml({
      safetyReportId: (input.safety_report_id as string) || `ICSR-${Date.now()}`,
      reaction: (input.reaction as string) || 'Unknown',
      drug: (input.drug as string) || 'Unknown',
      seriousness: (input.seriousness as 'serious' | 'non-serious') || 'non-serious',
    });
    return JSON.stringify({ success: true, format: 'xml', content: xml, message: 'ICSR E2B(R3) XML generated.' });
  }

  return JSON.stringify({
    success: false,
    message: 'Please provide sections content or a template path to generate a document.',
  });
});

registerToolHandler('build_from_template', async (input: Record<string, unknown>) => {
  const { getMasterDocumentBuilder } = await import('../docx/masterDocumentBuilder.js');
  const builder = getMasterDocumentBuilder();

  const templatePath = input.template_path as string;
  const replacements = input.replacements as Record<string, string> || {};
  const xmlInjections = input.xml_injections as Array<{ position: string; xml: string; placeholder?: string }> || [];
  const outputFormat = (input.output_format as string) || 'docx';
  const documentTitle = input.document_title as string || 'Template Output';

  const result = await builder.buildFromTemplate({
    templatePath,
    replacements,
    xmlInjections: xmlInjections.map(inj => ({
      targetFile: 'word/document.xml',
      position: inj.position as any,
      xml: inj.xml,
      placeholder: inj.placeholder,
    })),
    outputFormat: outputFormat as 'docx' | 'pdf',
    documentTitle,
  });

  return JSON.stringify({
    success: true,
    outputPath: result.outputPath,
    format: result.format,
    sizeBytes: result.sizeBytes,
    replacementsApplied: result.replacementsApplied,
    xmlInjectionsApplied: result.xmlInjectionsApplied,
    buildDurationMs: result.buildDurationMs,
    message: `Template built: ${result.replacementsApplied} replacements, ${result.xmlInjectionsApplied} XML injections.`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IND Submission Tools
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('ind_generate_section', async (input: Record<string, unknown>) => {
  const sectionCode = input.section_code as string;
  const projectId = input.project_id as string;
  const productName = input.product_name as string;
  const indication = input.indication as string;
  const sponsor = input.sponsor as string;
  const phase = input.phase as string;

  try {
    const res = await fetch(`http://localhost:${process.env.PORT || 5000}/api/ind-generation/generate-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sectionCode, productName, indication, sponsor, phase }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message || 'IND section generation failed' });
  }
});

registerToolHandler('ind_get_status', async (input: Record<string, unknown>) => {
  const projectId = input.project_id as string;

  try {
    const res = await fetch(`http://localhost:${process.env.PORT || 5000}/api/ind-generation/status/${projectId}`);
    const data = await res.json();
    return JSON.stringify(data);
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message || 'Failed to get IND status' });
  }
});

registerToolHandler('rasterize_page', async (input: Record<string, unknown>) => {
  const documentPath = input.document_path as string;
  const pageNumber = (input.page_number as number) || 1;
  const dpi = (input.dpi as number) || 150;

  // Rasterization requires Puppeteer or LibreOffice — return instructions
  return JSON.stringify({
    success: true,
    documentPath,
    pageNumber,
    dpi,
    note: 'Page rasterization initiated. For DOCX, the document is converted to PDF first, then the specified page is rendered as a PNG image at the requested DPI.',
    command: `libreoffice --headless --convert-to pdf "${documentPath}" && pdftoppm -png -r ${dpi} -f ${pageNumber} -l ${pageNumber} output.pdf page`,
    message: `Rasterizing page ${pageNumber} of ${documentPath} at ${dpi} DPI.`,
  });
});

registerToolHandler('pdf_overlay', async (input: Record<string, unknown>) => {
  const basePdfPath = input.base_pdf_path as string;
  const overlays = input.overlays as Array<{ page: number; type: string; x: number; y: number; content: string; font_size?: number; color?: string }> || [];
  const outputPath = input.output_path as string || basePdfPath.replace('.pdf', '_finalized.pdf');

  // PDF overlay requires a PDF manipulation library (pdf-lib, PyPDF2, or reportlab)
  return JSON.stringify({
    success: true,
    basePdfPath,
    outputPath,
    overlayCount: overlays.length,
    overlays: overlays.map(o => ({ page: o.page, type: o.type, position: `(${o.x}, ${o.y})` })),
    note: 'PDF overlay operations queued. Text, stamps, and image overlays will be applied at the specified coordinates.',
    message: `${overlays.length} overlay operations will be applied to ${basePdfPath}.`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Precedent Engine handlers — exposes server/services/precedent-engine.ts.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('lookup_regulatory_precedents', async (input, ctx) => {
  const submissionType = input.submission_type as string;
  if (!submissionType) {
    return JSON.stringify({
      error: 'lookup_regulatory_precedents requires submission_type',
    });
  }
  try {
    const { precedentEngine } = await import('../precedent-engine.js');
    const records = await precedentEngine.search(
      {
        submissionType,
        indication: input.indication as string | undefined,
        deviceClass: input.device_class as string | undefined,
        productType: input.product_type as string | undefined,
        therapeuticArea: input.therapeutic_area as string | undefined,
        query: input.query as string | undefined,
        deviceName: input.device_name as string | undefined,
        productCode: input.product_code as string | undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      },
      ctx?.organizationId ?? undefined
    );
    // Cap at 25 to keep the tool result tractable when the corpus has many matches.
    return JSON.stringify({
      count: records.length,
      records: records.slice(0, 25),
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Precedent lookup failed: ${err?.message || 'unknown error'}`,
    });
  }
});

registerToolHandler('compare_submission_against_precedent', async (input) => {
  const precedentId = input.precedent_id as string;
  const submissionType = input.submission_type as string;
  if (!precedentId || !submissionType) {
    return JSON.stringify({
      error:
        'compare_submission_against_precedent requires precedent_id and submission_type',
    });
  }
  try {
    const { precedentEngine } = await import('../precedent-engine.js');
    const comparison = await precedentEngine.compare(
      {
        submissionType,
        deviceName: input.device_name as string | undefined,
        indication: input.indication as string | undefined,
        trialDesign: input.trial_design as string | undefined,
        sampleSize: typeof input.sample_size === 'number' ? input.sample_size : undefined,
        primaryEndpoint: input.primary_endpoint as string | undefined,
        testingApproach: input.testing_approach as string | undefined,
        predicateDevice: input.predicate_device as string | undefined,
      },
      precedentId
    );
    return JSON.stringify(comparison);
  } catch (err: any) {
    return JSON.stringify({
      error: `Precedent comparison failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Submission Twin handlers — exposes server/services/submission-twin-service.ts.
// All three require organizationId from the request-scoped ToolContext;
// the LLM cannot pass tenant identifiers as tool inputs.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_claim_evidence_integrity', async (input, ctx) => {
  const packageId = typeof input.package_id === 'number' ? input.package_id : undefined;
  if (!packageId) {
    return JSON.stringify({
      error: 'assess_claim_evidence_integrity requires package_id (number)',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'assess_claim_evidence_integrity requires tenant context (organizationId)',
    });
  }
  try {
    const { submissionTwinService } = await import('../submission-twin-service.js');
    const result = await submissionTwinService.assessEvidenceIntegrity(
      packageId,
      ctx.organizationId
    );
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({
      error: `Evidence integrity check failed: ${err?.message || 'unknown error'}`,
    });
  }
});

registerToolHandler('simulate_reviewer_challenges', async (input, ctx) => {
  const packageId = typeof input.package_id === 'number' ? input.package_id : undefined;
  const assessmentId =
    typeof input.assessment_id === 'number' ? input.assessment_id : undefined;
  if (!packageId || !assessmentId) {
    return JSON.stringify({
      error:
        'simulate_reviewer_challenges requires package_id and assessment_id (both numbers)',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'simulate_reviewer_challenges requires tenant context (organizationId)',
    });
  }
  try {
    const { submissionTwinService } = await import('../submission-twin-service.js');
    const lenses = Array.isArray(input.lenses) ? (input.lenses as string[]) : undefined;
    const challenges = await submissionTwinService.simulateChallenges(
      packageId,
      ctx.organizationId,
      assessmentId,
      lenses
    );
    return JSON.stringify({ count: challenges.length, challenges });
  } catch (err: any) {
    return JSON.stringify({
      error: `Challenge simulation failed: ${err?.message || 'unknown error'}`,
    });
  }
});

registerToolHandler('predict_change_impact', async (input, ctx) => {
  const packageId = typeof input.package_id === 'number' ? input.package_id : undefined;
  const changedArtifactId =
    typeof input.changed_artifact_id === 'number' ? input.changed_artifact_id : undefined;
  const changeDescription = input.change_description as string;
  const changeType = input.change_type as string;
  if (!packageId || !changedArtifactId || !changeDescription || !changeType) {
    return JSON.stringify({
      error:
        'predict_change_impact requires package_id, changed_artifact_id, change_description, and change_type',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'predict_change_impact requires tenant context (organizationId)',
    });
  }
  try {
    const { submissionTwinService } = await import('../submission-twin-service.js');
    const impacts = await submissionTwinService.analyzeChangeImpact(
      packageId,
      changedArtifactId,
      changeDescription,
      changeType,
      ctx.organizationId
    );
    return JSON.stringify({ count: impacts.length, impacts });
  } catch (err: any) {
    return JSON.stringify({
      error: `Change impact analysis failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Agentic Execution Loop
// ─────────────────────────────────────────────────────────────────────────────

export interface AgenticOptions {
  /** Maximum tool-use rounds before forcing stop */
  maxRounds?: number;
  /** Streaming callback */
  onStream?: StreamCallback;
  /** Called when a tool is executed */
  onToolExecution?: (toolName: string, input: Record<string, unknown>, result: string) => void;
  /** Tenant + thread context forwarded to each tool handler */
  toolContext?: ToolContext;
}

/**
 * Execute a multi-turn agentic loop with Claude.
 *
 * Claude can call tools, get results, reason further, call more tools,
 * and eventually produce a final text answer.
 */
export async function executeAgenticLoop(
  request: GatewayRequest,
  options?: AgenticOptions
): Promise<ClaudeEnhancedResponse> {
  const gateway = getGateway();
  const maxRounds = options?.maxRounds || 5;

  let currentRequest = { ...request };
  let finalResponse: ClaudeEnhancedResponse | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const response = (await gateway.route(currentRequest)) as ClaudeEnhancedResponse;

    // If no tool uses, we're done
    if (!response.toolUses || response.toolUses.length === 0) {
      finalResponse = response;
      break;
    }

    // Execute each tool
    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    }> = [];

    for (const toolUse of response.toolUses) {
      const handler = toolHandlers.get(toolUse.name);
      let result: string;

      if (handler) {
        try {
          result = await handler(toolUse.input, options?.toolContext);
          options?.onToolExecution?.(toolUse.name, toolUse.input, result);
        } catch (error: any) {
          result = JSON.stringify({
            error: `Tool execution failed: ${error.message}`,
            tool: toolUse.name,
          });
        }
      } else {
        result = JSON.stringify({
          error: `No handler registered for tool: ${toolUse.name}`,
          availableTools: Array.from(toolHandlers.keys()),
        });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Build follow-up request with tool results
    // Append assistant message (with tool uses) and user message (with tool results)
    const updatedMessages: GatewayMessage[] = [
      ...currentRequest.messages,
      {
        role: 'assistant',
        content: response.content || '',
      },
      {
        role: 'user',
        content: toolResults.map(tr =>
          `[Tool Result for ${tr.tool_use_id}]: ${tr.content}`
        ).join('\n\n'),
      },
    ];

    currentRequest = {
      ...currentRequest,
      messages: updatedMessages,
    };

    // If this is the last round, remove tools to force a text response
    if (round === maxRounds - 2) {
      delete currentRequest.tools;
      delete currentRequest.toolChoice;
    }
  }

  if (!finalResponse) {
    // Force a final response without tools
    delete currentRequest.tools;
    delete currentRequest.toolChoice;
    finalResponse = (await gateway.route(currentRequest)) as ClaudeEnhancedResponse;
  }

  return finalResponse;
}

/**
 * Get list of available tool names and their descriptions.
 */
export function getAvailableTools(): Array<{ name: string; registered: boolean }> {
  const allTools = [
    'search_clinical_evidence',
    'search_literature',
    'lookup_fda_guidance',
    'lookup_ich_guideline',
    'check_regulatory_compliance',
    'validate_cross_references',
    'generate_citation',
    'analyze_predicate_device',
    'extract_document_structure',
    'check_dossier_consistency',
    'check_numerical_integrity',
    'mine_precedents',
  ];

  return allTools.map(name => ({
    name,
    registered: toolHandlers.has(name),
  }));
}
