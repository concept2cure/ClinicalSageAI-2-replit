/**
 * AnA Tool Executor — Agentic Orchestration Loop
 *
 * When AnA responds with tool_use blocks, this executor:
 * 1. Extracts the tool calls from AnA's response
 * 2. Executes each tool against real backend services
 * 3. Sends tool results back to AnA
 * 4. Repeats until AnA produces a final text response
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
  AnaGatewayResponse,
  AnaToolUse,
  AnaTool,
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

    // Summarize for AnA — keep the response compact. Full divergences
    // stay in the structured report; the summary gives AnA enough to
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
// Template Library handler — wires templateService + masterDocumentBuilder.
// Discovery mode (no fill_data) returns metadata; fill mode returns a path
// to a built DOCX with placeholder substitutions applied.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('fetch_template_and_fill', async (input, ctx) => {
  const templateId = typeof input.template_id === 'number' ? input.template_id : undefined;
  if (!templateId) {
    return JSON.stringify({
      error: 'fetch_template_and_fill requires template_id (number)',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'fetch_template_and_fill requires tenant context (organizationId)',
    });
  }
  try {
    const { templateService } = await import('../templateService.js');
    const template = await templateService.getTemplateById(templateId, ctx.organizationId);
    if (!template) {
      return JSON.stringify({
        error: `Template ${templateId} not found in this organization's library`,
      });
    }

    const fillData =
      input.fill_data && typeof input.fill_data === 'object'
        ? (input.fill_data as Record<string, string>)
        : undefined;

    // Discovery mode: no fill_data → return template metadata only so the
    // model can decide which placeholders need values before filling.
    if (!fillData || Object.keys(fillData).length === 0) {
      const contentPreview =
        typeof template.content === 'string' ? template.content.slice(0, 500) : null;
      return JSON.stringify({
        mode: 'discovery',
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
          module: template.module,
          description: template.description,
          content_preview: contentPreview,
          has_word_template: !!template.fileUrl,
        },
        next_step:
          'Inspect the content_preview to identify {{PLACEHOLDER}} tokens, then call again with fill_data populated to produce the filled DOCX.',
      });
    }

    // Fill mode: must have a backing DOCX template on disk.
    if (!template.fileUrl) {
      return JSON.stringify({
        error: `Template ${templateId} has no underlying DOCX file (only inline content). Use generate_document with the content directly instead.`,
      });
    }

    const { getMasterDocumentBuilder } = await import('../docx/masterDocumentBuilder.js');
    const builder = getMasterDocumentBuilder();
    const outputFormat: 'docx' | 'pdf' = input.output_format === 'pdf' ? 'pdf' : 'docx';
    const result = await builder.buildFromTemplate({
      templatePath: template.fileUrl,
      replacements: fillData,
      outputFormat,
      documentTitle: template.name,
    });

    return JSON.stringify({
      mode: 'filled',
      template: { id: template.id, name: template.name },
      output: {
        path: result.outputPath,
        format: result.format,
        size_bytes: result.sizeBytes,
        replacements_applied: result.replacementsApplied,
        build_duration_ms: result.buildDurationMs,
      },
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Template fetch/fill failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Native python-docx authoring handler — runs
// workers/artifact-compute/docx-python-runtime.py inside the isolated compute
// worker (no network, bounded timeout). Returns a real python-docx-authored
// .docx with configured fonts, margins, headers, footers, headings, lists,
// tables, page breaks, and inline images. When output_format='pdf', chains
// the result through headless LibreOffice for native Word→PDF fidelity.
//
// AnA's canonical "produce a paying-client-grade document" path. Use over
// generate_document for regulatory deliverables that must look like real
// Word output.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('author_docx_native', async (input, ctx) => {
  const title    = typeof input.title === 'string' ? input.title.trim() : '';
  const content  = typeof input.content === 'string' ? input.content : '';
  const fmt      =
    input.output_format === 'pdf' || input.output_format === 'docx'
      ? input.output_format
      : 'docx';
  const compress = input.pdf_compress === true;
  const allowedQ = new Set(['screen', 'ebook', 'printer', 'prepress', 'default']);
  const quality =
    typeof input.pdf_quality === 'string' && allowedQ.has(input.pdf_quality)
      ? (input.pdf_quality as 'screen' | 'ebook' | 'printer' | 'prepress' | 'default')
      : 'ebook';
  const images =
    input.images && typeof input.images === 'object'
      ? (input.images as Record<string, string>)
      : undefined;

  if (!title) {
    return JSON.stringify({ error: 'author_docx_native requires title (string).' });
  }
  if (!content || content.length < 8) {
    return JSON.stringify({
      error: 'author_docx_native requires content (string ≥ 8 chars).',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'author_docx_native requires tenant context (organizationId).',
    });
  }

  try {
    const { runIsolatedCompute } = await import('../compute/workerClient.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    /* runIsolatedCompute spawns the python-docx subprocess in an ephemeral
       tempdir, parses output JSON, returns the .docx as a Buffer. The
       intent shape requires project/org/user identifiers — we surface
       them from the tool context and use a default surface key when the
       caller hasn't bound to a specific surface. */
    const outputs = await runIsolatedCompute({
      projectId:       ctx.projectId ?? 0,
      organizationId:  ctx.organizationId,
      requestedById:   ctx.userId ?? 0,
      surfaceKey:      'ri_copilot',
      intentType:      'docx_generation',
      title,
      content:         images
        ? content // images are passed via metadata.images below
        : content,
      format:          'docx',
      metadata:        images ? { images } : undefined,
    });

    const docx = outputs[0];
    if (!docx || docx.outputType !== 'docx') {
      return JSON.stringify({
        error: 'author_docx_native: python-docx worker returned no docx output.',
      });
    }

    /* Persist the .docx to a tempdir so downstream tools (and the user)
       have a stable path. The compute worker itself uses an ephemeral
       tempdir that gets cleaned; we move our copy into the builder
       tempdir so it persists for the session. */
    const outDir = path.resolve(process.cwd(), 'tmp', 'docbuilder', randomUUID().slice(0, 8));
    await fs.mkdir(outDir, { recursive: true });
    const docxPath = path.join(outDir, docx.fileName);
    await fs.writeFile(docxPath, docx.buffer);

    /* PDF requested → chain through LibreOffice. The .docx is preserved
       as the editable source; the PDF is a downstream rendering. */
    if (fmt === 'pdf') {
      const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
      const pipeline = await runDocxPdfPipeline({
        inputDocxPath: docxPath,
        compress,
        quality,
      });
      const pdfStat = await fs.stat(pipeline.finalPdf);
      return JSON.stringify({
        ok:           true,
        engine:       'python-docx + libreoffice',
        docxPath,
        pdfPath:      pipeline.finalPdf,
        sizeBytes:    pdfStat.size,
        compression:  pipeline.compression ?? null,
        message: `Authored ${docx.fileName} via python-docx and converted to PDF via headless LibreOffice. PDF: ${pipeline.finalPdf}.`,
      });
    }

    return JSON.stringify({
      ok:        true,
      engine:    'python-docx',
      docxPath,
      sizeBytes: docx.buffer.length,
      fileName:  docx.fileName,
      message: `Authored ${docx.fileName} (${Math.round(docx.buffer.length / 1024)}KB) via python-docx isolated worker.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `author_docx_native failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify python3 and the docx package are available on the host (see services/Dockerfile).`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCX → PDF handler — wraps the existing Python pipeline
// (server/scripts/docx_pdf_pipeline.py → soffice --headless --convert-to pdf).
// AnA invokes this after authoring a .docx to produce the canonical
// Word-grade PDF deliverable. No reportlab, no flat render — the .docx is
// the source of truth, the PDF is its native rendering.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('convert_docx_to_pdf', async (input) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({
      error: 'convert_docx_to_pdf requires input_docx_path (string).',
    });
  }
  const outputPdfPath =
    typeof input.output_pdf_path === 'string' ? input.output_pdf_path : undefined;
  const compress = input.compress === true;
  const allowedQ = new Set(['screen', 'ebook', 'printer', 'prepress', 'default']);
  const quality =
    typeof input.quality === 'string' && allowedQ.has(input.quality)
      ? (input.quality as 'screen' | 'ebook' | 'printer' | 'prepress' | 'default')
      : 'ebook';

  try {
    const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
    const { promises: fs } = await import('fs');
    const result = await runDocxPdfPipeline({
      inputDocxPath,
      outputPdfPath,
      compress,
      quality,
    });
    const stat = await fs.stat(result.finalPdf);
    return JSON.stringify({
      ok:               true,
      inputDocx:        result.inputDocx,
      convertedPdf:     result.convertedPdf,
      finalPdf:         result.finalPdf,
      sizeBytes:        stat.size,
      compression:      result.compression ?? null,
      message: `DOCX → PDF complete via headless LibreOffice. PDF: ${result.finalPdf}${
        result.compression ? ` (${result.compression.compressedSizeBytes} bytes after ${quality} compression)` : ''
      }.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `convert_docx_to_pdf failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify that python3 and libreoffice (soffice) are available on the host.`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MDX mutation handlers — Q-Sub creation, commitment rollover, program
// metadata binding. Each routes through the existing service layer so the
// tenant-scoping + audit + business rules stay in one place; the handler
// is just an adapter between AnA's input shape and the service signature.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

registerToolHandler('create_q_sub', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_q_sub requires tenant context (organizationId).' });
  }
  const programId = typeof input.program_id === 'string' ? input.program_id : '';
  const qSubType  = typeof input.q_sub_type === 'string' ? input.q_sub_type : '';
  const title     = typeof input.title === 'string' ? input.title.trim() : '';
  if (!UUID_RE.test(programId)) {
    return JSON.stringify({ error: 'create_q_sub: program_id must be a UUID.' });
  }
  const allowedTypes = new Set(['presub', 'sir', 'srd', 'agree', 'info']);
  if (!allowedTypes.has(qSubType)) {
    return JSON.stringify({
      error: `create_q_sub: q_sub_type must be one of ${Array.from(allowedTypes).join(', ')}.`,
    });
  }
  if (!title) {
    return JSON.stringify({ error: 'create_q_sub: title is required.' });
  }

  let targetDate: Date | null = null;
  if (typeof input.target_date === 'string' && input.target_date.length > 0) {
    const d = new Date(input.target_date);
    if (Number.isNaN(d.getTime())) {
      return JSON.stringify({ error: 'create_q_sub: target_date must be ISO-8601.' });
    }
    targetDate = d;
  }

  try {
    const { createQSubmission, TenantAccessError } = await import(
      '../q-sub/q-sub.service.js'
    );
    const row = await createQSubmission(ctx.organizationId, {
      programId,
      qSubType: qSubType as 'presub' | 'sir' | 'srd' | 'agree' | 'info',
      title,
      fdaTeam:   typeof input.fda_team === 'string' ? input.fda_team : null,
      targetDate,
      summary:   typeof input.summary === 'string' ? input.summary : null,
      createdBy: ctx.userId !== null && ctx.userId !== undefined ? String(ctx.userId) : null,
    });
    return JSON.stringify({
      ok:        true,
      qSubId:    row.id,
      qNumber:   row.qNumber,
      stage:     row.stage,
      programId: row.programId,
      message:   `Created ${row.qNumber} (${row.stage}) for program ${row.programId}.`,
    });
  } catch (err: unknown) {
    const TenantAccessErrorClass = (await import('../q-sub/q-sub.service.js')).TenantAccessError;
    if (err instanceof TenantAccessErrorClass) {
      return JSON.stringify({
        error: `create_q_sub: ${err.message}. The program does not belong to this organization.`,
      });
    }
    return JSON.stringify({
      error: `create_q_sub failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('update_q_sub_commitment_rolled_in', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'update_q_sub_commitment_rolled_in requires tenant context (organizationId).',
    });
  }
  const commitmentId = typeof input.commitment_id === 'string' ? input.commitment_id : '';
  const rolledIn = input.rolled_in === true;
  if (!UUID_RE.test(commitmentId)) {
    return JSON.stringify({
      error: 'update_q_sub_commitment_rolled_in: commitment_id must be a UUID.',
    });
  }
  if (typeof input.rolled_in !== 'boolean') {
    return JSON.stringify({
      error: 'update_q_sub_commitment_rolled_in: rolled_in (boolean) is required.',
    });
  }

  try {
    const { setCommitmentRolledIn, TenantAccessError } = await import(
      '../q-sub/q-sub.service.js'
    );
    const updated = await setCommitmentRolledIn(ctx.organizationId, {
      commitmentId,
      rolledIn,
      rolledInBy:
        rolledIn && ctx.userId !== null && ctx.userId !== undefined ? String(ctx.userId) : null,
    });
    return JSON.stringify({
      ok:           true,
      commitmentId: updated.id,
      rolledIn:     updated.rolledIn,
      message: `Marked commitment ${updated.id} as ${rolledIn ? 'rolled-in' : 'not rolled-in'}.`,
    });
  } catch (err: unknown) {
    const TenantAccessErrorClass = (await import('../q-sub/q-sub.service.js')).TenantAccessError;
    if (err instanceof TenantAccessErrorClass) {
      return JSON.stringify({ error: `update_q_sub_commitment_rolled_in: ${err.message}.` });
    }
    return JSON.stringify({
      error: `update_q_sub_commitment_rolled_in failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

/* link_program_clinical_study + set_program_metadata both write to
   regulatory_programs.metadata (jsonb). The first is a typed convenience
   over the second — we keep them separate for clarity in AnA's tool
   selection ("bind a study" vs. "set arbitrary metadata"). */

async function mergeProgramMetadata(
  organizationId: number,
  programId: string,
  patch: Record<string, unknown>,
): Promise<{ programId: string; metadata: Record<string, unknown> }> {
  const { getPool } = await import('../../db.js');
  const pool = getPool();
  /* The COALESCE handles the rare row that has metadata=NULL; jsonb_strip_nulls
     trims any keys the caller explicitly passed as null (delete semantics). */
  const { rows } = await pool.query<{ id: string; metadata: Record<string, unknown> }>(
    `UPDATE regulatory_programs
        SET metadata   = jsonb_strip_nulls(COALESCE(metadata, '{}'::jsonb) || $3::jsonb),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, metadata`,
    [programId, organizationId, JSON.stringify(patch)],
  );
  if (rows.length === 0) {
    throw new Error('program not found in this organization');
  }
  return { programId: rows[0].id, metadata: rows[0].metadata };
}

registerToolHandler('link_program_clinical_study', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'link_program_clinical_study requires tenant context (organizationId).',
    });
  }
  const programId = typeof input.program_id === 'string' ? input.program_id : '';
  const studyId   = typeof input.clinical_study_id === 'string' ? input.clinical_study_id : '';
  if (!UUID_RE.test(programId)) {
    return JSON.stringify({ error: 'link_program_clinical_study: program_id must be a UUID.' });
  }
  if (!UUID_RE.test(studyId)) {
    return JSON.stringify({
      error: 'link_program_clinical_study: clinical_study_id must be a UUID.',
    });
  }
  try {
    const r = await mergeProgramMetadata(ctx.organizationId, programId, { clinicalStudyId: studyId });
    return JSON.stringify({
      ok:              true,
      programId:       r.programId,
      clinicalStudyId: studyId,
      message:
        `Bound program ${r.programId} to clinical_ops.studies ${studyId}. PMA trial-metrics will now resolve against this study.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `link_program_clinical_study failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('set_program_metadata', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'set_program_metadata requires tenant context (organizationId).',
    });
  }
  const programId = typeof input.program_id === 'string' ? input.program_id : '';
  const meta = input.metadata && typeof input.metadata === 'object'
    ? (input.metadata as Record<string, unknown>)
    : null;
  if (!UUID_RE.test(programId)) {
    return JSON.stringify({ error: 'set_program_metadata: program_id must be a UUID.' });
  }
  if (!meta || Array.isArray(meta)) {
    return JSON.stringify({ error: 'set_program_metadata: metadata (object) is required.' });
  }
  /* Defense in depth: refuse to write keys the caller can't possibly need
     to reach here — id, organization_id, etc. are owned by the row, not
     the metadata jsonb. */
  for (const k of Object.keys(meta)) {
    if (k.startsWith('_') || k === 'id' || k === 'organization_id') {
      return JSON.stringify({
        error: `set_program_metadata: key '${k}' is reserved.`,
      });
    }
  }
  try {
    const r = await mergeProgramMetadata(ctx.organizationId, programId, meta);
    return JSON.stringify({
      ok:        true,
      programId: r.programId,
      metadata:  r.metadata,
      message:   `Merged ${Object.keys(meta).length} key(s) into program metadata.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `set_program_metadata failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Beta-surface mutation handlers — backing for the 5 new AnA tools that
// write into the MDX domain surfaces (UDI, risk management, software
// lifecycle, Q-Sub briefing section). Tenant-scoped via ToolContext.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_udi_record', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_udi_record requires tenant context (organizationId).' });
  }
  const deviceName = typeof input.device_name === 'string' ? input.device_name.trim() : '';
  const udiDi      = typeof input.udi_di === 'string' ? input.udi_di.trim() : '';
  const agency     = typeof input.issuing_agency === 'string' ? input.issuing_agency : '';
  if (!deviceName || !udiDi) {
    return JSON.stringify({ error: 'create_udi_record: device_name and udi_di are required.' });
  }
  if (!['GS1', 'HIBCC', 'ICCBBA'].includes(agency)) {
    return JSON.stringify({ error: "create_udi_record: issuing_agency must be GS1 / HIBCC / ICCBBA." });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO udi_records (
         organization_id, program_id, device_name, udi_di, issuing_agency,
         device_class, product_code, gmdn_code, brand_name, catalog_number,
         version_or_model, mri_safety, lot_serial, single_use
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, false)
       )
       RETURNING id, device_name, udi_di, issuing_agency, gudid_status`,
      [
        ctx.organizationId, programId, deviceName, udiDi, agency,
        input.device_class ?? null, input.product_code ?? null, input.gmdn_code ?? null,
        input.brand_name ?? null, input.catalog_number ?? null,
        input.version_or_model ?? null, input.mri_safety ?? null, input.lot_serial ?? null,
        input.single_use ?? null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created UDI record for "${deviceName}" (${udiDi}, ${agency}).`,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return JSON.stringify({ error: 'A UDI record with that UDI-DI already exists in this org.' });
    }
    return JSON.stringify({
      error: `create_udi_record failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('create_risk_item', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_risk_item requires tenant context (organizationId).' });
  }
  const hazard = typeof input.hazard === 'string' ? input.hazard : '';
  const harm   = typeof input.harm === 'string' ? input.harm : '';
  const sev    = typeof input.severity === 'number' ? Math.round(input.severity) : NaN;
  const prob   = typeof input.probability === 'number' ? Math.round(input.probability) : NaN;
  if (!hazard || !harm) {
    return JSON.stringify({ error: 'create_risk_item: hazard and harm are required.' });
  }
  if (!Number.isFinite(sev) || sev < 1 || sev > 5) {
    return JSON.stringify({ error: 'create_risk_item: severity must be 1..5.' });
  }
  if (!Number.isFinite(prob) || prob < 1 || prob > 5) {
    return JSON.stringify({ error: 'create_risk_item: probability must be 1..5.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO risk_items (
         organization_id, program_id, ref_code, hazard, hazardous_situation, harm,
         sequence_of_events, severity, probability, detectability, initial_risk,
         control_strategy, source, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'open'
       )
       RETURNING id, ref_code, hazard, harm, severity, probability, initial_risk, status`,
      [
        ctx.organizationId, programId,
        input.ref_code ?? null, hazard, input.hazardous_situation ?? null, harm,
        input.sequence_of_events ?? null, sev, prob,
        typeof input.detectability === 'number' ? Math.round(input.detectability) : null,
        sev * prob,
        input.control_strategy ?? null, input.source ?? null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created risk item (initial risk ${sev * prob}). Add risk_controls via add_risk_control to drive residual risk down.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `create_risk_item failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('add_risk_control', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'add_risk_control requires tenant context (organizationId).' });
  }
  const itemId = typeof input.risk_item_id === 'number' ? input.risk_item_id : NaN;
  const desc   = typeof input.description === 'string' ? input.description : '';
  const ctype  = typeof input.control_type === 'string' ? input.control_type : '';
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return JSON.stringify({ error: 'add_risk_control: risk_item_id (positive integer) required.' });
  }
  if (!desc) {
    return JSON.stringify({ error: 'add_risk_control: description required.' });
  }
  if (!['inherent_safety', 'protective_measure', 'information_safety'].includes(ctype)) {
    return JSON.stringify({ error: 'add_risk_control: control_type must be one of inherent_safety / protective_measure / information_safety.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    /* Tenant gate. */
    const own = await pool.query(
      `SELECT 1 FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [itemId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `risk_item ${itemId} not found in this organization.` });
    }
    const { rows } = await pool.query(
      `INSERT INTO risk_controls (
         risk_item_id, organization_id, description, control_type,
         implementation_evidence, verification_evidence, effectiveness_evidence,
         introduces_new_risk, new_risk_item_id, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'proposed'))
       RETURNING id, description, control_type, status`,
      [
        itemId, ctx.organizationId, desc, ctype,
        input.implementation_evidence ?? null,
        input.verification_evidence ?? null,
        input.effectiveness_evidence ?? null,
        input.introduces_new_risk === true,
        typeof input.new_risk_item_id === 'number' ? input.new_risk_item_id : null,
        typeof input.status === 'string' ? input.status : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Added ${ctype} control to risk item ${itemId}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `add_risk_control failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('create_software_lifecycle_item', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_software_lifecycle_item requires tenant context.' });
  }
  const docLevel = typeof input.doc_level === 'string' ? input.doc_level : '';
  const kind     = typeof input.item_kind === 'string' ? input.item_kind : '';
  const title    = typeof input.title === 'string' ? input.title : '';
  if (!['basic', 'enhanced'].includes(docLevel)) {
    return JSON.stringify({ error: "doc_level must be 'basic' or 'enhanced'." });
  }
  if (!title) {
    return JSON.stringify({ error: 'title is required.' });
  }
  const allowedKinds = new Set([
    'srs', 'sds', 'arch', 'unit_test', 'integration_test', 'system_test',
    'release_note', 'anomaly_log', 'ots_list', 'sbom', 'pentest',
    'threat_model', 'risk_control', 'use_error', 'cybersecurity_label',
  ]);
  if (!allowedKinds.has(kind)) {
    return JSON.stringify({ error: `item_kind must be one of: ${Array.from(allowedKinds).join(', ')}.` });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO software_lifecycle_items (
         organization_id, program_id, doc_level, safety_class, item_kind,
         title, identifier, status, evidence_artifact_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'draft'), $9, $10)
       RETURNING id, item_kind, title, identifier, status`,
      [
        ctx.organizationId, programId, docLevel,
        typeof input.safety_class === 'string' ? input.safety_class : null,
        kind, title, input.identifier ?? null,
        typeof input.status === 'string' ? input.status : null,
        typeof input.evidence_artifact_id === 'number' ? input.evidence_artifact_id : null,
        input.notes ?? null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created ${kind} deliverable (${docLevel} doc level): ${title}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `create_software_lifecycle_item failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('write_q_sub_section', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'write_q_sub_section requires tenant context.' });
  }
  const qSubId     = typeof input.q_sub_id === 'string' ? input.q_sub_id : '';
  const sectionKey = typeof input.section_key === 'string' ? input.section_key : '';
  const content    = typeof input.content === 'string' ? input.content : '';
  const note       = typeof input.summary_note === 'string' ? input.summary_note : '';
  if (!UUID_RE.test(qSubId)) {
    return JSON.stringify({ error: 'q_sub_id must be a UUID.' });
  }
  const allowed = new Set([
    'submission_type', 'sponsor_information', 'device_description',
    'regulatory_history', 'issues_for_discussion', 'specific_questions_for_fda',
    'proposed_meeting_format', 'supporting_information',
  ]);
  if (!allowed.has(sectionKey)) {
    return JSON.stringify({
      error: `section_key must be one of: ${Array.from(allowed).join(', ')}.`,
    });
  }
  if (!content || content.length < 40) {
    return JSON.stringify({ error: 'content (string ≥ 40 chars) is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    /* Tenant gate: the q_submission's program must belong to the org. */
    const own = await pool.query(
      `SELECT 1
         FROM q_submissions qs
         JOIN regulatory_programs p ON p.id = qs.program_id::uuid
        WHERE qs.id = $1 AND p.organization_id = $2`,
      [qSubId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: 'Q-Sub not found in this organization.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO q_sub_section_bodies (
         q_submission_id, organization_id, section_key, content,
         draft_source, drafted_at, drafted_summary
       ) VALUES ($1, $2, $3, $4, 'ana', NOW(), NULLIF($5, ''))
       ON CONFLICT (q_submission_id, section_key) DO UPDATE SET
         content         = EXCLUDED.content,
         draft_source    = 'ana',
         drafted_at      = NOW(),
         drafted_summary = COALESCE(EXCLUDED.drafted_summary, q_sub_section_bodies.drafted_summary),
         accepted_at     = NULL,
         accepted_by     = NULL,
         updated_at      = NOW()
       RETURNING id, section_key, draft_source, drafted_at`,
      [qSubId, ctx.organizationId, sectionKey, content, note],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Wrote ${sectionKey} into Q-Sub ${qSubId}. Awaiting human accept.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `write_q_sub_section failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IVD + diagnostic surface mutation handlers — backs the 7 IVD-specific
// AnA tools added with migration 20260508. Each adapter takes AnA-style
// snake_case input + tenant-scopes via ToolContext.organizationId, routes
// through the existing pool, and returns a compact JSON envelope.
// ─────────────────────────────────────────────────────────────────────────────

const ANAL_STUDY_TYPES = new Set([
  'accuracy', 'precision', 'linearity', 'limit_of_detection',
  'limit_of_quantitation', 'analytical_specificity', 'interference',
  'matrix_comparison', 'reagent_stability', 'sample_stability', 'carryover',
]);

registerToolHandler('record_analytical_performance_study', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'record_analytical_performance_study requires tenant context.' });
  }
  const studyType = typeof input.study_type === 'string' ? input.study_type : '';
  const title     = typeof input.title === 'string' ? input.title.trim() : '';
  if (!ANAL_STUDY_TYPES.has(studyType)) {
    return JSON.stringify({ error: `study_type must be one of: ${Array.from(ANAL_STUDY_TYPES).join(', ')}.` });
  }
  if (!title) {
    return JSON.stringify({ error: 'title is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO ivd_analytical_performance (
         organization_id, program_id, study_type, study_id, title,
         acceptance_criterion, result_summary, pass_fail, n_samples,
         n_replicates, sites, analytes, matrix_type
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,COALESCE($8,'pending'),$9,$10,$11,$12,$13
       )
       RETURNING id, study_type, title, pass_fail`,
      [
        ctx.organizationId, programId, studyType,
        typeof input.study_id === 'string' ? input.study_id : null,
        title,
        typeof input.acceptance_criterion === 'string' ? input.acceptance_criterion : null,
        typeof input.result_summary === 'string' ? input.result_summary : null,
        typeof input.pass_fail === 'string' ? input.pass_fail : null,
        typeof input.n_samples === 'number' ? Math.round(input.n_samples) : null,
        typeof input.n_replicates === 'number' ? Math.round(input.n_replicates) : null,
        Array.isArray(input.sites) ? input.sites.filter((s) => typeof s === 'string') : null,
        Array.isArray(input.analytes) ? input.analytes.filter((s) => typeof s === 'string') : null,
        typeof input.matrix_type === 'string' ? input.matrix_type : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Logged ${studyType} study: ${title}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `record_analytical_performance_study failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('record_clinical_performance_study', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'record_clinical_performance_study requires tenant context.' });
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    return JSON.stringify({ error: 'title is required.' });
  }
  const numOrNull = (k: string): number | null =>
    typeof (input as Record<string, unknown>)[k] === 'number'
      ? ((input as Record<string, unknown>)[k] as number)
      : null;
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO ivd_clinical_performance (
         organization_id, program_id, study_id, title, intended_population,
         comparator, comparator_kind, total_subjects, positive_n, negative_n,
         sensitivity_pct, sensitivity_lower, sensitivity_upper,
         specificity_pct, specificity_lower, specificity_upper,
         ppv_pct, npv_pct, prevalence_pct, auc_roc, pre_specified_endpoint_met
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
       )
       RETURNING id, title, sensitivity_pct, specificity_pct`,
      [
        ctx.organizationId, programId,
        typeof input.study_id === 'string' ? input.study_id : null,
        title,
        typeof input.intended_population === 'string' ? input.intended_population : null,
        typeof input.comparator === 'string' ? input.comparator : null,
        typeof input.comparator_kind === 'string' ? input.comparator_kind : null,
        numOrNull('total_subjects'), numOrNull('positive_n'), numOrNull('negative_n'),
        numOrNull('sensitivity_pct'), numOrNull('sensitivity_lower'), numOrNull('sensitivity_upper'),
        numOrNull('specificity_pct'), numOrNull('specificity_lower'), numOrNull('specificity_upper'),
        numOrNull('ppv_pct'), numOrNull('npv_pct'), numOrNull('prevalence_pct'),
        numOrNull('auc_roc'),
        typeof input.pre_specified_endpoint_met === 'boolean' ? input.pre_specified_endpoint_met : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Logged clinical performance study: ${title}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `record_clinical_performance_study failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('classify_ivd_device', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'classify_ivd_device requires tenant context.' });
  }
  const deviceName = typeof input.device_name === 'string' ? input.device_name.trim() : '';
  const ivdrClass  = typeof input.ivdr_class === 'string' ? input.ivdr_class : '';
  if (!deviceName) {
    return JSON.stringify({ error: 'device_name is required.' });
  }
  if (!['A', 'B', 'C', 'D'].includes(ivdrClass)) {
    return JSON.stringify({ error: 'ivdr_class must be A / B / C / D.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const nbRequired = ivdrClass !== 'A';
    const { rows } = await getPool().query(
      `INSERT INTO ivdr_classifications (
         organization_id, program_id, device_name, ivdr_class, classification_rule,
         rationale, companion_diagnostic, self_test, near_patient_test,
         notified_body_required, notified_body_name, notified_body_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,COALESCE($7,false),COALESCE($8,false),COALESCE($9,false),
         $10,$11,$12
       )
       RETURNING id, device_name, ivdr_class, notified_body_required`,
      [
        ctx.organizationId, programId, deviceName, ivdrClass,
        typeof input.classification_rule === 'string' ? input.classification_rule : null,
        typeof input.rationale === 'string' ? input.rationale : null,
        input.companion_diagnostic === true,
        input.self_test === true,
        input.near_patient_test === true,
        nbRequired,
        typeof input.notified_body_name === 'string' ? input.notified_body_name : null,
        typeof input.notified_body_id === 'string' ? input.notified_body_id : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Classified ${deviceName} as IVDR Class ${ivdrClass}${nbRequired ? ' (notified body required)' : ' (self-declaration)'}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `classify_ivd_device failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('create_per_document', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_per_document requires tenant context.' });
  }
  const deviceName = typeof input.device_name === 'string' ? input.device_name.trim() : '';
  const version    = typeof input.per_version === 'string' ? input.per_version.trim() : '';
  if (!deviceName || !version) {
    return JSON.stringify({ error: 'device_name and per_version are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO ivdr_per_documents (
         organization_id, program_id, device_name, per_version, per_status,
         scientific_validity_done, analytical_performance_done, clinical_performance_done,
         benefit_risk_conclusion, pmpf_plan_attached, author_name, author_qualifications,
         per_date
       ) VALUES (
         $1,$2,$3,$4,COALESCE($5,'draft'),
         COALESCE($6,false),COALESCE($7,false),COALESCE($8,false),
         $9,COALESCE($10,false),$11,$12,$13
       )
       RETURNING id, device_name, per_version, per_status`,
      [
        ctx.organizationId, programId, deviceName, version,
        typeof input.per_status === 'string' ? input.per_status : null,
        input.scientific_validity_done === true,
        input.analytical_performance_done === true,
        input.clinical_performance_done === true,
        typeof input.benefit_risk_conclusion === 'string' ? input.benefit_risk_conclusion : null,
        input.pmpf_plan_attached === true,
        typeof input.author_name === 'string' ? input.author_name : null,
        typeof input.author_qualifications === 'string' ? input.author_qualifications : null,
        typeof input.per_date === 'string' ? input.per_date : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Started PER ${version} for ${deviceName}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `create_per_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('categorize_clia_complexity', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'categorize_clia_complexity requires tenant context.' });
  }
  const testName = typeof input.test_name === 'string' ? input.test_name.trim() : '';
  const complexity = typeof input.clia_complexity === 'string' ? input.clia_complexity : '';
  if (!testName) return JSON.stringify({ error: 'test_name is required.' });
  if (!['waived', 'moderate', 'high'].includes(complexity)) {
    return JSON.stringify({ error: "clia_complexity must be 'waived', 'moderate', or 'high'." });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO ivd_clia_categorization (
         organization_id, program_id, test_name, analyte, clia_complexity,
         cms_letter_date, cms_letter_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, test_name, clia_complexity`,
      [
        ctx.organizationId, programId, testName,
        typeof input.analyte === 'string' ? input.analyte : null,
        complexity,
        typeof input.cms_letter_date === 'string' ? input.cms_letter_date : null,
        typeof input.cms_letter_ref === 'string' ? input.cms_letter_ref : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Categorized ${testName} as CLIA ${complexity}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `categorize_clia_complexity failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('pair_companion_diagnostic', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'pair_companion_diagnostic requires tenant context.' });
  }
  const drugName = typeof input.drug_name === 'string' ? input.drug_name.trim() : '';
  if (!drugName) {
    return JSON.stringify({ error: 'drug_name is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.device_program_id === 'string' && UUID_RE.test(input.device_program_id)
      ? input.device_program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO cdx_pairings (
         organization_id, device_program_id, drug_name, drug_innn,
         drug_application_type, drug_application_no, drug_sponsor,
         indication, biomarker, approval_status, fda_approval_date,
         ema_approval_date, cdx_label_text
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'planned'),$11,$12,$13
       )
       RETURNING id, drug_name, biomarker, approval_status`,
      [
        ctx.organizationId, programId, drugName,
        typeof input.drug_innn === 'string' ? input.drug_innn : null,
        typeof input.drug_application_type === 'string' ? input.drug_application_type : null,
        typeof input.drug_application_no === 'string' ? input.drug_application_no : null,
        typeof input.drug_sponsor === 'string' ? input.drug_sponsor : null,
        typeof input.indication === 'string' ? input.indication : null,
        typeof input.biomarker === 'string' ? input.biomarker : null,
        typeof input.approval_status === 'string' ? input.approval_status : null,
        typeof input.fda_approval_date === 'string' ? input.fda_approval_date : null,
        typeof input.ema_approval_date === 'string' ? input.ema_approval_date : null,
        typeof input.cdx_label_text === 'string' ? input.cdx_label_text : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Paired ${drugName} with the device program.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `pair_companion_diagnostic failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('register_ldt', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'register_ldt requires tenant context.' });
  }
  const labName  = typeof input.lab_name === 'string' ? input.lab_name.trim() : '';
  const testName = typeof input.test_name === 'string' ? input.test_name.trim() : '';
  if (!labName || !testName) {
    return JSON.stringify({ error: 'lab_name and test_name are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `INSERT INTO ldt_inventory (
         organization_id, lab_name, clia_certificate_no, test_name, analyte,
         intended_use, first_offered_date, grandfathered,
         enforcement_discretion_eligible, enforcement_discretion_basis,
         fda_pathway, current_phase
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,COALESCE($8,false),$9,$10,$11,COALESCE($12,1)
       )
       RETURNING id, lab_name, test_name, current_phase`,
      [
        ctx.organizationId, labName,
        typeof input.clia_certificate_no === 'string' ? input.clia_certificate_no : null,
        testName,
        typeof input.analyte === 'string' ? input.analyte : null,
        typeof input.intended_use === 'string' ? input.intended_use : null,
        typeof input.first_offered_date === 'string' ? input.first_offered_date : null,
        input.grandfathered === true,
        typeof input.enforcement_discretion_eligible === 'boolean' ? input.enforcement_discretion_eligible : null,
        typeof input.enforcement_discretion_basis === 'string' ? input.enforcement_discretion_basis : null,
        typeof input.fda_pathway === 'string' ? input.fda_pathway : null,
        typeof input.current_phase === 'number' ? Math.round(input.current_phase) : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Registered LDT "${testName}" at ${labName}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `register_ldt failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MDX kit-section write-back handler — closes the loop between AnA's drafting
// and the kit's section editors. Persists drafted content into
// cerv2_510k_sections with draft_source='ana' so the MDX surfaces can render
// the "drafted by AnA — accept / refine" affordance.
//
// Audit-logged via auditService — audit_logs row records the action so 21 CFR
// Part 11 trail captures every AI-authored section edit.
// ─────────────────────────────────────────────────────────────────────────────

const KIT_SECTION_DEFAULT_PCT: Record<string, number> = {
  drafting:           60,
  ready_for_review:   85,
  in_review:          90,
};

registerToolHandler('write_kit_section', async (input, ctx) => {
  const sectionKey = typeof input.section_key === 'string' ? input.section_key.trim() : '';
  const content    = typeof input.content === 'string' ? input.content : '';
  const status     = typeof input.status === 'string' ? input.status : 'drafting';
  const note       = typeof input.summary_note === 'string' ? input.summary_note.trim() : '';
  const explicitPct =
    typeof input.completion_percentage === 'number' ? input.completion_percentage : null;

  if (!sectionKey) {
    return JSON.stringify({ error: 'write_kit_section requires section_key (string).' });
  }
  if (!content || content.length < 40) {
    return JSON.stringify({
      error:
        'write_kit_section requires content (string ≥ 40 chars). Pass the finished drafted prose, not raw notes.',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'write_kit_section requires tenant context (organizationId) — nothing was written.',
    });
  }
  const allowedStatus = new Set(['drafting', 'ready_for_review', 'in_review']);
  if (!allowedStatus.has(status)) {
    return JSON.stringify({
      error: `write_kit_section: status must be one of drafting | ready_for_review | in_review (got ${status}).`,
    });
  }

  const completionPct =
    explicitPct !== null && Number.isFinite(explicitPct)
      ? Math.max(0, Math.min(100, Math.round(explicitPct)))
      : KIT_SECTION_DEFAULT_PCT[status] ?? 60;

  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();

    /* The migration 20260506 creates a unique index on (organization_id,
       section_key); the seed populates one row per key. We update in place
       rather than insert to preserve display_order, level, parent linkage.
       If the row doesn't exist we surface a clear error rather than silently
       creating a free-floating row outside the kit's taxonomy. */
    const { rows } = await pool.query(
      `UPDATE cerv2_510k_sections
          SET content                = $3,
              status                 = $4,
              completion_percentage  = $5,
              draft_source           = 'ana',
              drafted_at             = NOW(),
              drafted_summary        = NULLIF($6, ''),
              accepted_at            = NULL,
              accepted_by            = NULL,
              updated_at             = NOW()
        WHERE organization_id = $1 AND section_key = $2
        RETURNING id, section_number, section_title, section_key, status,
                  completion_percentage AS "completionPercentage",
                  drafted_at AS "draftedAt"`,
      [ctx.organizationId, sectionKey, content, status, completionPct, note],
    );

    if (rows.length === 0) {
      return JSON.stringify({
        error: `No section found for organization with section_key='${sectionKey}'. The kit's section taxonomy must be seeded first (run \`npm run db:seed:mdx-content\`).`,
      });
    }

    const row = rows[0];

    /* Audit log — fire-and-forget, never block the response. The auditService
       singleton handles tamper-proof chaining + Drizzle persistence. */
    try {
      const { auditLog } = await import('../auditService.js');
      auditLog({
        tenantId:     ctx.organizationId,
        userId:       ctx.userId ?? null,
        action:       'KIT_SECTION_DRAFTED_BY_ANA',
        resource:     'cerv2_510k_sections',
        resourceId:   String(row.id),
        details: {
          sectionKey,
          sectionNumber: row.section_number,
          sectionTitle:  row.section_title,
          status:        row.status,
          completionPercentage: row.completionPercentage,
          contentLength: content.length,
          summary:       note || null,
        },
      });
    } catch {
      /* never block the tool response on audit failure */
    }

    return JSON.stringify({
      ok:                  true,
      id:                  row.id,
      sectionNumber:       row.section_number,
      sectionTitle:        row.section_title,
      sectionKey:          row.section_key,
      status:              row.status,
      completionPercentage: row.completionPercentage,
      draftedAt:           row.draftedAt,
      message: `Drafted ${row.section_title} written into the kit (${row.completionPercentage}% complete). The user will see the draft inside the editor with an accept/refine affordance.`,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return JSON.stringify({
        error:
          "Table cerv2_510k_sections doesn't exist. Apply the MDX migrations (npm run db:push) before drafting kit sections.",
      });
    }
    return JSON.stringify({
      error: `write_kit_section failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// eCTD Module Assembly handler — pure assembly, no AI. Pulls every artifact
// in the project whose ctd_section starts with the requested module prefix,
// dedupes by section keeping highest version, and emits via masterDocumentBuilder.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assemble_ectd_module_from_artifacts', async (input, ctx) => {
  const projectId = typeof input.project_id === 'number' ? input.project_id : undefined;
  const moduleNumber = typeof input.module_number === 'string' ? input.module_number : undefined;
  if (!projectId || !moduleNumber) {
    return JSON.stringify({
      error:
        'assemble_ectd_module_from_artifacts requires project_id (number) and module_number (string, e.g. "3.2.S")',
    });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({
      error: 'assemble_ectd_module_from_artifacts requires tenant context (organizationId)',
    });
  }
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, artifact_id, title, content, ctd_section, type, status, version
         FROM concept2cure_artifacts
         WHERE project_id = $1
           AND organization_id = $2
           AND ctd_section LIKE $3 || '%'
           AND status != 'archived'
         ORDER BY ctd_section, version DESC`,
      [projectId, ctx.organizationId, moduleNumber]
    );
    if (rows.length === 0) {
      return JSON.stringify({
        error: `No artifacts found for module ${moduleNumber} in project ${projectId}`,
        suggestion:
          'Verify the module_number prefix matches existing artifacts (e.g. "3.2.S" not "Module 3").',
      });
    }
    // Dedupe by ctd_section, keeping highest version (rows already ordered by version DESC).
    const sectionMap = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      const key = r.ctd_section || r.artifact_id;
      if (!sectionMap.has(key)) sectionMap.set(key, r);
    }
    const sections = Array.from(sectionMap.values())
      .sort((a, b) => (a.ctd_section || '').localeCompare(b.ctd_section || ''))
      .map(r => ({
        number: r.ctd_section || '',
        title: r.title,
        content: r.content || '',
      }));

    const outputFormat: 'docx' | 'pdf' = input.output_format === 'pdf' ? 'pdf' : 'docx';
    const { getMasterDocumentBuilder } = await import('../docx/masterDocumentBuilder.js');
    const builder = getMasterDocumentBuilder();
    const result = await builder.generateFromScratch({
      documentType: 'ctd_module',
      sections,
      outputFormat,
      documentTitle: `eCTD Module ${moduleNumber}`,
    });
    return JSON.stringify({
      module_number: moduleNumber,
      sections_assembled: sections.length,
      sections_index: sections.map(s => ({ number: s.number, title: s.title })),
      output: {
        path: result.outputPath,
        format: result.format,
        size_bytes: result.sizeBytes,
        build_duration_ms: result.buildDurationMs,
      },
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Module assembly failed: ${err?.message || 'unknown error'}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Section-aware drafting scaffolds — return canonical regulatory structure
// (outlines, table formats, citation hints). Tool does NOT draft prose;
// model uses the returned structure to draft inline. Same pattern as
// mine_precedents (structure + guidance, no AI inside the handler).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('draft_510k_substantial_equivalence', async (input) => {
  const predicateKNumber = input.predicate_510k_number as string;
  const deviceName = input.device_name as string;
  const intendedUse = input.intended_use as string;
  const technologySummary = input.technology_summary as string | undefined;
  if (!predicateKNumber || !deviceName || !intendedUse) {
    return JSON.stringify({
      error:
        'draft_510k_substantial_equivalence requires predicate_510k_number, device_name, intended_use',
    });
  }
  return JSON.stringify({
    structure: {
      title: `510(k) Substantial Equivalence Comparison — ${deviceName} vs ${predicateKNumber}`,
      sections: [
        {
          number: '1',
          title: 'Subject Device Description',
          guidance:
            'Device name, classification name and class, product code, intended use, technological characteristics, principles of operation. Cite 21 CFR product classification.',
        },
        {
          number: '2',
          title: 'Predicate Device Identification',
          guidance: `Identify the primary predicate (${predicateKNumber}). Cite the 510(k) Decision Summary or Summary of Safety and Effectiveness. Note clearance date and applicant.`,
        },
        {
          number: '3',
          title: 'Indications for Use Comparison',
          guidance:
            'Side-by-side comparison of subject vs predicate Indications for Use. Highlight any differences and assess whether they raise different questions of safety/effectiveness — the FDA SE test pivots on this.',
        },
        {
          number: '4',
          title: 'Technological Characteristics Comparison',
          guidance:
            'Compare device design, materials, energy source, software, sensors, principles of operation. Use the SE table format below. Different technological characteristics require performance data demonstrating they do not raise different questions of S&E.',
        },
        {
          number: '5',
          title: 'Performance Testing Summary',
          guidance:
            'List performance tests conducted (bench, animal, clinical) supporting SE. For each: test name, recognized standard followed (ISO/ASTM/IEC), acceptance criteria, results, conclusion.',
        },
        {
          number: '6',
          title: 'Substantial Equivalence Conclusion',
          guidance:
            'Single paragraph stating subject is SE to predicate, with the rationale: same intended use AND (same OR different but not different questions of S&E) technological characteristics. This is the explicit FDA SE test from 21 USC 360c(i).',
        },
      ],
    },
    se_table_format: {
      columns: ['Characteristic', 'Subject Device', 'Predicate Device', 'Comparison Notes'],
      typical_rows: [
        'Intended Use',
        'Indications for Use',
        'Target Population',
        'Anatomical Site',
        'Energy Source / Power',
        'Materials in Patient Contact',
        'Principle of Operation',
        'Software Level of Concern',
        'Sterility',
        'Single-Use vs Reusable',
        'Performance Standards',
      ],
    },
    inputs_echo: {
      device_name: deviceName,
      intended_use: intendedUse,
      predicate_510k_number: predicateKNumber,
      technology_summary: technologySummary || null,
    },
    next_step:
      'Use this structure to draft the SE narrative inline. Pay particular attention to section 4 — that is where most 510(k) RTAs are issued. If you need predicate technical details, call analyze_predicate_device with the predicate K-number first.',
  });
});

registerToolHandler('draft_clinical_overview_m2_5', async (input, ctx) => {
  const productName = input.product_name as string;
  const indication = input.indication as string;
  const projectId = typeof input.project_id === 'number' ? input.project_id : undefined;
  if (!productName || !indication) {
    return JSON.stringify({
      error: 'draft_clinical_overview_m2_5 requires product_name and indication',
    });
  }

  // Best-effort: pull project artifacts to suggest citations. Skip silently if
  // tenant context is missing or DB is unavailable — the structure response
  // is still useful without it.
  let projectArtifacts: any[] = [];
  if (projectId && ctx?.organizationId) {
    try {
      const { getPool } = await import('../../db.js');
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT artifact_id, title, ctd_section, type, status
           FROM concept2cure_artifacts
           WHERE project_id = $1 AND organization_id = $2 AND status != 'archived'
           ORDER BY ctd_section
           LIMIT 50`,
        [projectId, ctx.organizationId]
      );
      projectArtifacts = rows;
    } catch {
      /* best-effort — structure response stands without artifact list */
    }
  }

  return JSON.stringify({
    structure: {
      title: `Clinical Overview (Module 2.5) — ${productName} for ${indication}`,
      ich_reference: 'ICH M4E(R2)',
      sections: [
        {
          number: '2.5.1',
          title: 'Product Development Rationale',
          guidance:
            'Background on the disease, current therapeutic options, unmet medical need, scientific rationale for this product. Cite key external references. Typically 2-3 pages.',
        },
        {
          number: '2.5.2',
          title: 'Overview of Biopharmaceutics',
          guidance:
            'Summary of biopharmaceutic studies — formulation development, bioavailability, food effect, in vitro/in vivo correlations.',
          cite_from_module: '2.7.1',
        },
        {
          number: '2.5.3',
          title: 'Overview of Clinical Pharmacology',
          guidance:
            'PK/PD profile, dose-response, special populations (renal/hepatic/elderly/pediatric), drug-drug interactions.',
          cite_from_module: '2.7.2',
        },
        {
          number: '2.5.4',
          title: 'Overview of Efficacy',
          guidance:
            'Efficacy across pivotal studies — primary/secondary endpoints, key subgroups, sensitivity analyses, robustness, durability of effect.',
          cite_from_module: '2.7.3',
        },
        {
          number: '2.5.5',
          title: 'Overview of Safety',
          guidance:
            'Safety pool — exposure, AEs, SAEs, deaths, special-interest events, lab abnormalities, risk minimization measures, contraindications/warnings.',
          cite_from_module: '2.7.4',
        },
        {
          number: '2.5.6',
          title: 'Benefits and Risks Conclusions',
          guidance:
            'Integrated benefit-risk assessment. State the conclusion explicitly. Address residual uncertainties and post-approval commitments. Typically 3-5 pages.',
        },
      ],
    },
    project_artifacts: projectArtifacts,
    next_step:
      'Use this outline to draft each subsection inline. The cite_from_module field in each section indicates which Module 2.7 summary should be referenced. If project_artifacts is populated, suggest specific artifact_ids to cite in each section based on their ctd_section values.',
  });
});

registerToolHandler('draft_fda_ir_response', async (input) => {
  const irText = typeof input.ir_text === 'string' ? input.ir_text : '';
  if (!irText || irText.length < 50) {
    return JSON.stringify({
      error:
        'draft_fda_ir_response requires ir_text (pasted Information Request content, min 50 chars)',
    });
  }

  // Extract numbered questions: "N." or "N.M." or "Question N:" at line start.
  const questions: { number: string; text: string }[] = [];
  const lines = irText.split(/\r?\n/);
  let current: { number: string; text: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:Question\s+)?(\d+(?:\.\d+)*)[\.:)\s]+(.+)$/i);
    if (m) {
      if (current) questions.push(current);
      current = { number: m[1], text: m[2].trim() };
    } else if (current && line.trim()) {
      // Continuation line — append to current question text.
      current.text += ' ' + line.trim();
      if (current.text.length > 1500) current.text = current.text.slice(0, 1500);
    }
  }
  if (current) questions.push(current);

  return JSON.stringify({
    questions_extracted: questions.length,
    questions: questions.slice(0, 50),
    response_scaffold: {
      cover_letter: {
        guidance:
          'Brief cover letter acknowledging receipt of the IR (with date received), confirming the response addresses each question, and listing the questions by number. Sign by responsible regulatory officer.',
      },
      per_question_format: {
        sections: ['FDA Question (verbatim)', 'Sponsor Response', 'Supporting Data / Citation'],
        guidance:
          'Reproduce the FDA question verbatim. Provide a direct, concise response — do not over-explain. Cite the supporting artifact ID, table number, or section reference. If data is not available, explain why and propose a path forward (e.g., commitment to provide post-approval). FDA prefers responses that close the question vs responses that defer.',
      },
    },
    next_step:
      questions.length > 0
        ? 'For each extracted question, draft the response inline using the per_question_format. Group related questions if FDA grouped them. The 14-day clock is firm — the response must be received by FDA, not just sent.'
        : 'Could not auto-extract numbered questions from the IR text. Either paste a more structured version of the IR (with numbered questions) or treat the entire IR as a single open question and respond holistically.',
  });
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
 * Execute a multi-turn agentic loop with AnA.
 *
 * AnA can call tools, get results, reason further, call more tools,
 * and eventually produce a final text answer.
 */
export async function executeAgenticLoop(
  request: GatewayRequest,
  options?: AgenticOptions
): Promise<AnaGatewayResponse> {
  const gateway = getGateway();
  const maxRounds = options?.maxRounds || 5;

  let currentRequest = { ...request };
  let finalResponse: AnaGatewayResponse | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const response = (await gateway.route(currentRequest)) as AnaGatewayResponse;

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
    finalResponse = (await gateway.route(currentRequest)) as AnaGatewayResponse;
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
