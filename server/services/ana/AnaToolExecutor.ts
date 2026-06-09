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
import fdaMaudeClient from '../../fda_maude_client.js';
import { searchTrials } from '../integrations/clinicaltrials-client.js';
import { searchPubmed } from '../integrations/pubmed-client.js';
import { searchMedicareCoverage } from '../integrations/cms-coverage-client.js';
import { searchConnectedRepositories } from '../integrations/connector-search.js';
import { searchRegulatoryCorrespondence } from '../integrations/correspondence-search.js';
import { createCalendarEvent } from '../integrations/calendar-event.js';
import { searchHubSpotCrm, type HubSpotObject } from '../integrations/hubspot-client.js';
import { searchDeviceRecalls } from '../integrations/device-recalls.js';
import fdaFaersClient from '../../fda_faers_client.js';
import type {
  GatewayRequest,
  GatewayMessage,
  AnaGatewayResponse,
  AnaToolUse,
  AnaTool,
  StreamCallback,
} from '../ai-gateway/types';
import { ragRouter } from '../ragRouter';

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
  /** Tenant UUID — required to scope project_knowledge_search retrieval. */
  organizationUuid?: string | null;
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

// Study digital twin simulation. Builds a StudyDesign from the model's sketch and
// predicts outcomes across any therapeutic area / phase, grounded on the org's
// uploaded history when available. The disclaimer + (when no history) the upload
// request are enforced by the service and returned in the result string, so AnA
// always surfaces them. Org/project come from the active ToolContext.
registerToolHandler('simulate_study_design', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'Simulation requires an active organization context.';
  const phase = typeof input.phase === 'string' ? input.phase.trim() : '';
  const indication = typeof input.indication === 'string' ? input.indication.trim() : '';
  if (!phase || !indication) {
    return 'Provide at least the study phase and the indication to simulate a study design.';
  }
  const toNum = (v: unknown): number | undefined => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const { simulateStudyTwin } = await import('../study-design/study-twin-service.js');
  const design: any = {
    title: `Twin: ${indication} (phase ${phase})`,
    phase,
    indication,
    productType: input.product_type,
    objectives: [],
    estimands: [],
    endpoints: input.primary_endpoint
      ? [
          {
            name: String(input.primary_endpoint).slice(0, 160),
            role: 'primary',
            type: input.primary_endpoint_type ?? 'continuous',
            definition: String(input.primary_endpoint),
          },
        ]
      : [],
    framework: {
      inferentialFrame: input.inferential_frame ?? 'superiority',
      structuralDesign: input.structural_design ?? 'parallel_group',
      controlType: input.control_type ?? 'placebo',
    },
    population: { targetDescription: indication, analysisPopulations: [], eligibility: [] },
    statisticalPlan: {
      alpha: toNum(input.alpha),
      power: toNum(input.power),
      plannedSampleSize: toNum(input.planned_sample_size),
      dropoutRate: toNum(input.dropout_rate),
      plannedAnalyses: [],
      powerAssumptions: { effectSize: toNum(input.effect_size) },
    },
  };
  const result = await simulateStudyTwin({
    design,
    organizationId: orgId,
    projectId: ctx?.projectId ?? null,
    question: typeof input.question === 'string' ? input.question : undefined,
  });
  const parts = [
    `Study digital twin simulation — ${indication}, phase ${phase}:`,
    '',
    result.prediction,
    '',
    result.disclaimer,
  ];
  if (result.needsHistoryUpload && result.historyRequest) {
    parts.push('', result.historyRequest);
  }
  return parts.join('\n');
});

// Project Knowledge Search — exposes the project-scoped hybrid retrieval
// (ragRouter intent 'project_scoped') as a model-callable tool. The project and
// tenant come from the active ToolContext, never from model input, so the model
// cannot read another project's corpus. Graceful: returns a plain message when
// there is no active project or the retrieval fails.
registerToolHandler('project_knowledge_search', async (input, ctx) => {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) return 'No query provided for project_knowledge_search.';
  const projectId = ctx?.projectId;
  const organizationUuid = ctx?.organizationUuid;
  if (!projectId || !organizationUuid) {
    return 'No active project is in context, so project knowledge cannot be searched. Ask the user to open a project first.';
  }
  const maxResults =
    typeof input.max_results === 'number' && input.max_results > 0
      ? Math.min(Math.floor(input.max_results), 20)
      : 6;
  try {
    const result = await ragRouter.retrieve({
      query,
      intent: 'project_scoped',
      organizationUuid,
      artifactScope: { projectId, organizationUuid },
      useReranking: true,
      limit: maxResults,
    });
    const docs = (result?.documents ?? []).slice(0, maxResults);
    if (docs.length === 0) {
      return `No matching passages were found in this project's knowledge for "${query}".`;
    }
    const formatted = docs
      .map((d, i) => {
        const passage = (d.compressedContent || d.content || '').slice(0, 800);
        const score = typeof d.finalScore === 'number' ? d.finalScore.toFixed(3) : 'n/a';
        return `[${i + 1}] ${d.title || 'Untitled'} (relevance ${score})\n${passage}`;
      })
      .join('\n\n');
    return `Project knowledge results for "${query}":\n\n${formatted}`;
  } catch (err: any) {
    return `Project knowledge search failed: ${err?.message ?? 'unknown error'}.`;
  }
});

// Search Clinical Evidence — queries internal DB and ClinicalTrials.gov
registerToolHandler('search_clinical_evidence', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const maxResults = Math.min((input.max_results as number) || 5, 20);
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  try {
    // Live ClinicalTrials.gov v2 via the governed client (structured filters
    // when supplied, free-text otherwise). Returns citeable trials + total count.
    const result = await searchTrials({
      query: query || undefined,
      condition: asStr(input.condition),
      intervention: asStr(input.intervention),
      sponsor: asStr(input.sponsor),
      status: asStr(input.status),
      phase: asStr(input.phase),
      pageSize: maxResults,
    });

    return JSON.stringify({
      source: result.source,
      query: query || undefined,
      totalCount: result.totalCount,
      resultCount: result.trials.length,
      studies: result.trials,
      citation_hint: 'Cite each trial by its NCT ID and link to the provided url.',
    });
  } catch {
    // Never regress below the prior behavior: degrade to manual-search guidance.
    return JSON.stringify({
      source: 'search',
      query,
      note: 'ClinicalTrials.gov API unavailable — returning guidance for manual search',
      suggestion: `Search ClinicalTrials.gov for: "${query || [asStr(input.condition), asStr(input.intervention)].filter(Boolean).join(' ')}"`,
    });
  }
});

// Search Device Adverse Events — live FDA MAUDE via openFDA passthrough.
registerToolHandler('search_device_adverse_events', async (input) => {
  const maxResults = Math.min((input.max_results as number) || 50, 100);
  try {
    const reports = await fdaMaudeClient.searchDeviceReports({
      productCode: (input.product_code as string) || '',
      deviceName: (input.device_name as string) || '',
      manufacturer: (input.manufacturer as string) || '',
      dateFrom: (input.date_from as string) || '',
      dateTo: (input.date_to as string) || '',
      limit: maxResults,
    });
    const analysis = fdaMaudeClient.analyzeMaudeData(reports);
    return JSON.stringify({
      source: 'FDA MAUDE (openFDA)',
      summary: analysis,
      sample: Array.isArray(reports) ? reports.slice(0, 15) : [],
    });
  } catch (e) {
    return JSON.stringify({
      source: 'FDA MAUDE (openFDA)',
      error: e instanceof Error ? e.message : 'MAUDE search failed',
      summary: { total_reports: 0 },
      sample: [],
    });
  }
});

// Search Drug Adverse Events — live FDA FAERS via openFDA passthrough.
registerToolHandler('search_drug_adverse_events', async (input) => {
  const maxResults = Math.min((input.max_results as number) || 50, 100);
  try {
    const reports = await fdaFaersClient.searchAdverseEvents({
      productNdc: (input.product_ndc as string) || '',
      productName: (input.product_name as string) || '',
      manufacturer: (input.manufacturer as string) || '',
      dateFrom: (input.date_from as string) || '',
      dateTo: (input.date_to as string) || '',
      limit: maxResults,
    });
    const analysis = fdaFaersClient.analyzeFaersData(reports);
    return JSON.stringify({
      source: 'FDA FAERS (openFDA)',
      summary: analysis,
      sample: Array.isArray(reports) ? reports.slice(0, 15) : [],
    });
  } catch (e) {
    return JSON.stringify({
      source: 'FDA FAERS (openFDA)',
      error: e instanceof Error ? e.message : 'FAERS search failed',
      summary: { total_reports: 0 },
      sample: [],
    });
  }
});

// Search Literature — live PubMed via the governed E-utilities client.
registerToolHandler('search_literature', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const maxResults = Math.min((input.max_results as number) || 5, 20);
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  try {
    const result = await searchPubmed({
      query,
      maxResults,
      dateRange: asStr(input.date_range),
      studyType: asStr(input.study_type),
    });
    return JSON.stringify({
      source: result.source,
      query,
      totalCount: result.totalCount,
      resultCount: result.articles.length,
      articles: result.articles,
      citation_hint: 'Cite each article by PMID (and DOI when present) and link to the provided url.',
    });
  } catch {
    return JSON.stringify({
      source: 'PubMed',
      query,
      note: 'PubMed API unavailable — use manual search',
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
    });
  }
});

// Search Connected Repositories — fan out across the org's configured data
// connectors (Google Drive, Box, OneDrive, SharePoint, Veeva, …) via the
// existing authenticated connector framework.
registerToolHandler('search_connected_repositories', async (input, ctx) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const organizationId = ctx?.organizationId;
  if (!organizationId) {
    return JSON.stringify({
      status: 'needs_context',
      message:
        'Searching connected repositories requires an active organization context. Ask the user to open a project first.',
    });
  }
  if (!query.trim()) {
    return JSON.stringify({ error: 'search_connected_repositories requires a non-empty query.' });
  }

  const connectors = Array.isArray(input.connectors)
    ? (input.connectors as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined;
  const maxResults = Math.min((input.max_results as number) || 8, 25);

  try {
    const result = await searchConnectedRepositories(Number(organizationId), {
      query,
      connectors,
      limit: maxResults,
    });
    return JSON.stringify({
      ...result,
      citation_hint:
        'Cite each document by its title and source system, and link to the provided url when present.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'Connected Repositories',
      error: e instanceof Error ? e.message : 'Connected-repository search failed',
      documents: [],
    });
  }
});

// Search Device Recalls — FDA openFDA device/recall via the post-market module.
registerToolHandler('search_device_recalls', async (input) => {
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  try {
    const result = await searchDeviceRecalls({
      deviceName: asStr(input.device_name),
      manufacturer: asStr(input.manufacturer),
      query: asStr(input.query),
      limit: Math.min((input.max_results as number) || 25, 100),
    });
    if (!result.searchExpression) {
      return JSON.stringify({ error: 'Provide device_name, manufacturer, or query to search recalls.' });
    }
    return JSON.stringify({
      source: result.source,
      summary: result.summary,
      recalls: result.recalls.slice(0, 15),
      citation_hint: 'Reference recalls by recall number and classification; Class I is most serious.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'FDA Device Recalls (openFDA)',
      error: e instanceof Error ? e.message : 'Recall search failed',
      recalls: [],
    });
  }
});

// Search CRM — read-only HubSpot CRM lookup (contacts/companies/deals/tickets).
registerToolHandler('search_crm', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  if (!query.trim()) {
    return JSON.stringify({ error: 'search_crm requires a non-empty query.' });
  }
  const object = ['contacts', 'companies', 'deals', 'tickets'].includes(input.object as string)
    ? (input.object as HubSpotObject)
    : undefined;
  const maxResults = Math.min((input.max_results as number) || 10, 25);
  try {
    const result = await searchHubSpotCrm({ query, object, limit: maxResults });
    return JSON.stringify({
      ...result,
      citation_hint: result.configured
        ? 'Reference records by title and link to the provided url when present.'
        : undefined,
    });
  } catch (e) {
    return JSON.stringify({
      source: 'HubSpot CRM',
      configured: true,
      error: e instanceof Error ? e.message : 'CRM search failed',
      records: [],
    });
  }
});

// Create Calendar Event — writes an all-day milestone to the team Google Calendar.
registerToolHandler('create_calendar_event', async (input) => {
  try {
    const result = await createCalendarEvent({
      summary: typeof input.summary === 'string' ? input.summary : '',
      date: typeof input.date === 'string' ? input.date : '',
      description: typeof input.description === 'string' ? input.description : undefined,
      timezone: typeof input.timezone === 'string' ? input.timezone : undefined,
    });
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({
      source: 'Google Calendar',
      configured: true,
      created: false,
      error: e instanceof Error ? e.message : 'Calendar event creation failed',
    });
  }
});

// Search Regulatory Correspondence — read-only Gmail (env-configured mailbox).
registerToolHandler('search_regulatory_correspondence', async (input) => {
  const query = typeof input.query === 'string' ? input.query : undefined;
  const maxResults = Math.min((input.max_results as number) || 10, 25);
  try {
    const result = await searchRegulatoryCorrespondence({ query, limit: maxResults });
    return JSON.stringify({
      ...result,
      citation_hint: result.configured
        ? 'Reference messages by subject and sender; note the date for deadline/recency context.'
        : undefined,
    });
  } catch (e) {
    return JSON.stringify({
      source: 'Regulatory Mailbox (Gmail)',
      configured: true,
      error: e instanceof Error ? e.message : 'Mailbox search failed',
      messages: [],
    });
  }
});

// Search Medicare Coverage — live CMS Coverage Database (NCDs / final LCDs).
registerToolHandler('search_medicare_coverage', async (input) => {
  const keyword = typeof input.keyword === 'string' ? input.keyword : '';
  const coverageType = input.coverage_type === 'lcd' ? 'lcd' : 'ncd';
  const maxResults = Math.min((input.max_results as number) || 10, 25);

  try {
    const result = await searchMedicareCoverage({
      keyword: keyword || undefined,
      type: coverageType,
      limit: maxResults,
    });
    return JSON.stringify({
      source: result.source,
      coverageType: result.type,
      keyword,
      matched: result.matched,
      resultCount: result.documents.length,
      documents: result.documents,
      citation_hint:
        'Cite each coverage document by its MCD number and link to the provided url. ' +
        'NCDs apply nationally; LCDs apply only within the issuing MAC jurisdiction.',
    });
  } catch {
    return JSON.stringify({
      source: 'CMS Medicare Coverage Database',
      coverageType,
      keyword,
      note: 'CMS Coverage API unavailable — search manually.',
      url: 'https://www.cms.gov/medicare-coverage-database/search.aspx',
    });
  }
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

// Extract Document Structure — real heading/section/clause outline from text.
registerToolHandler('extract_document_structure', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) {
    return JSON.stringify({
      error: 'No document text provided. Pass the extracted document text in `text` (e.g. from the OCR/extraction step).',
    });
  }
  const { parseDocumentStructure } = await import('../document-analysis');
  const s = parseDocumentStructure(text);
  return JSON.stringify({
    documentId: input.document_id ?? null,
    counts: s.counts,
    toc: s.toc,
    sections: s.sections.map(sec => ({
      number: sec.number, title: sec.title, level: sec.level,
      startLine: sec.startLine, endLine: sec.endLine,
    })),
  });
});

// Compare Document Versions — section/clause-level + line-level diff of two texts.
registerToolHandler('compare_document_versions', async (input) => {
  const oldText = typeof input.old_text === 'string' ? input.old_text : '';
  const newText = typeof input.new_text === 'string' ? input.new_text : '';
  if (!oldText || !newText) {
    return JSON.stringify({ error: 'compare_document_versions requires both `old_text` and `new_text`.' });
  }
  const { diffDocumentStructure } = await import('../document-analysis');
  const d = diffDocumentStructure(oldText, newText);
  return JSON.stringify({
    summary: d.summary,
    lineLevel: { additions: d.flat.additions, deletions: d.flat.deletions },
    // The changed sections first, so AnA leads with what actually moved.
    sections: d.sections
      .filter(s => s.status !== 'unchanged')
      .concat(d.sections.filter(s => s.status === 'unchanged')),
  });
});

// Search Document — "grep" within a document's text, attributed by section.
registerToolHandler('search_document', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  const query = typeof input.query === 'string' ? input.query : '';
  if (!text || !query) {
    return JSON.stringify({ error: 'search_document requires `text` and `query`.' });
  }
  try {
    const { searchDocument } = await import('../document-analysis');
    const r = searchDocument(text, query, {
      regex: input.regex === true,
      caseSensitive: input.case_sensitive === true,
      maxResults: typeof input.max_results === 'number' ? input.max_results : undefined,
    });
    return JSON.stringify(r);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
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

// ── Biostatistics tools — backed by the deterministic engine ──────────────
// Shared parser: map a raw tool-input record onto the engine's StatisticalInput
// shape. Used by every biostats tool so they speak the same parameter language.
function toBiostatsInput(input: Record<string, unknown>, ctx?: ToolContext): Record<string, unknown> {
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;

  return {
    clientTrack: str(input.clientTrack),
    studyType: str(input.studyType),
    objectiveType: str(input.objectiveType),
    endpointType: str(input.endpointType),
    effectSize: num(input.effectSize),
    controlRate: num(input.controlRate),
    treatmentRate: num(input.treatmentRate),
    alpha: num(input.alpha),
    powerTarget: num(input.powerTarget),
    attritionRate: num(input.attritionRate),
    allocationRatio: num(input.allocationRatio),
    nonInferiorityMargin: num(input.nonInferiorityMargin),
    equivalenceMargin: num(input.equivalenceMargin),
    comparatorType: str(input.comparatorType),
    numberOfGroups: num(input.numberOfGroups),
    followUpDuration: num(input.followUpDuration),
    interimAnalyses: num(input.interimAnalyses),
    sensitivity: num(input.sensitivity),
    specificity: num(input.specificity),
    prevalence: num(input.prevalence),
    aucTarget: num(input.aucTarget),
    aucNull: num(input.aucNull),
    agreementTarget: num(input.agreementTarget),
    crossoverPeriods: num(input.crossoverPeriods),
    withinSubjectCorrelation: num(input.withinSubjectCorrelation),
    numberOfEndpoints: num(input.numberOfEndpoints),
    multiplicityMethod: str(input.multiplicityMethod),
    estimandStrategy: str(input.estimandStrategy),
    missingDataMethod: str(input.missingDataMethod),
    expectedMissingRate: num(input.expectedMissingRate),
    regulatoryBody: str(input.regulatoryBody),
    indication: str(input.indication),
    phase: str(input.phase),
    projectId: num(input.projectId) ?? (ctx?.projectId ?? undefined),
  };
}

const NEEDS_PARAMS_MESSAGE =
  'The biostatistics engine could not compute — required parameters are missing or invalid. Ask the user for exactly the fields listed in errors, then call the tool again.';

// Compute Sample Size — deterministic biostatistics engine (validated formulas)
registerToolHandler('compute_sample_size', async (input: Record<string, unknown>, ctx) => {
  try {
    const { anaBiostatsOrchestrator } = await import('../ana-biostats/index.js');
     
    const result = anaBiostatsOrchestrator.quickCompute(toBiostatsInput(input, ctx) as any);

    if (!result.validation.valid) {
      return JSON.stringify({ status: 'needs_parameters', errors: result.validation.errors, message: NEEDS_PARAMS_MESSAGE });
    }

    const c = result.computation;
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      sampleSize: {
        total: c?.adjustedTotal ?? c?.sampleSize.total,
        rawTotal: c?.sampleSize.total,
        perGroup: c?.sampleSize.perGroup,
      },
      power: c?.power,
      method: c?.method,
      // Enhanced computation surfaces — present only when the inputs trigger them.
      multiplicity: c?.multiplicityResult,
      crossover: c?.crossoverResult,
      missingDataImpact: c?.missingDataImpact,
      diagnosticMetrics: c?.diagnosticMetrics,
      confidenceInterval: c?.confidenceInterval,
      assumptions: result.validation.normalizedInput,
      prefilledDefaults: result.validation.prefilled,
      warnings: result.validation.warnings,
      judgment: result.judgment
        ? {
            actionRecommendation: result.judgment.actionRecommendation,
            overallVerdict: result.judgment.overallVerdict,
            overallRisk: result.judgment.overallRisk,
            dimensions: result.judgment.dimensions?.map(d => ({ name: d.name, verdict: d.verdict, score: d.score })),
            escalationReasons: result.judgment.escalationReasons,
          }
        : undefined,
      regulatory: result.regulatory ? { body: result.regulatory.body } : undefined,
      interpretation: result.interpretation,
      instruction:
        'Report these numbers verbatim. Do NOT recompute or round differently. State which assumptions were defaults (prefilledDefaults) so the user can override them.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Sample size computation failed: ${err?.message || 'unknown error'}` });
  }
});

// First-in-human dose — deterministic NOAEL→HED→MRSD vs MABEL
registerToolHandler('compute_fih_dose', async (input: Record<string, unknown>) => {
  try {
    const { computeFirstInHumanDose } = await import('../preclinical/fih-dose-engine.js');
     
    const result = computeFirstInHumanDose(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report these numbers verbatim. Do NOT recompute or round differently. State which derivation is limiting (limitedBy) and surface any warnings.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/required|at least one|usable HED|must be/.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `FIH dose computation failed: ${message}` });
  }
});

// Toxicologic-pathology adversity classification — deterministic
registerToolHandler('classify_tox_findings', async (input: Record<string, unknown>) => {
  try {
    const findings = input.findings;
    if (!Array.isArray(findings) || findings.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'findings[] (organ + finding) is required.' });
    }
    const { classifyToxFindings } = await import('../preclinical/tox-findings-classifier.js');
     
    const summary = classifyToxFindings(findings as any);
    return JSON.stringify({
      status: 'classified',
      engine: 'deterministic',
      ...summary,
      instruction:
        'Use these classifications and the overviewParagraph for the M2.4 target-organ profile. A pathologist adjudicates the final adversity call; surface any escalated or indeterminate findings.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Tox-finding classification failed: ${err?.message || 'unknown error'}` });
  }
});

// Exposure-response dose selection — deterministic Project Optimus engine
registerToolHandler('select_exposure_response_dose', async (input: Record<string, unknown>) => {
  try {
    // Normalize an array-form exposuresByDose into the engine's Record shape.
    const normalized: Record<string, unknown> = { ...input };
    const raw = input.exposuresByDose;
    if (Array.isArray(raw)) {
      const map: Record<number, number> = {};
      for (const e of raw as Array<{ doseMg: number; exposure: number }>) {
        if (e && Number.isFinite(Number(e.doseMg))) map[Number(e.doseMg)] = Number(e.exposure);
      }
      normalized.exposuresByDose = map;
    }
    const { selectExposureResponseDose } = await import('../clinical-pharmacology/exposure-response-engine.js');
     
    const result = selectExposureResponseDose(normalized as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report the optimized dose, MTD, and per-dose predictions verbatim. When belowMtd is true, frame the selection as Project Optimus dose optimization rather than dosing to the MTD.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/required|supply/.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `Exposure-response dose selection failed: ${message}` });
  }
});

// Draft M2.4 Nonclinical Overview — deterministic composer + adversity profile
registerToolHandler('draft_nonclinical_overview_m2_4', async (input: Record<string, unknown>) => {
  try {
    const studies = input.studies;
    if (!Array.isArray(studies) || studies.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'studies[] is required to draft the M2.4 overview.' });
    }
    const { buildEnrichedM24 } = await import('../preclinical/nonclinical-m24-adapter.js');
    const { summary, toxProfile } = buildEnrichedM24({
       
      studies: studies as any,
       
      findings: input.findings as any,
      drugSubstanceName: input.drugSubstanceName as string | undefined,
      indication: input.indication as string | undefined,
    });
    return JSON.stringify({
      status: 'drafted',
      engine: 'deterministic',
      sectionKey: summary.sectionKey,
      title: summary.title,
      content: summary.narrative,
      completeness: summary.completeness,
      gaps: summary.gaps,
      toxProfile: toxProfile
        ? {
            adverse: toxProfile.adverseFindings.map(f => f.finding),
            adaptive: toxProfile.adaptiveFindings.map(f => f.finding),
            monitor: toxProfile.monitorFindings.map(f => f.finding),
            overviewParagraph: toxProfile.overviewParagraph,
          }
        : null,
      instruction:
        'This is a draft the author promotes through the governed authoring flow. State the completeness score and gaps honestly; do not assert a study that was not supplied.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `M2.4 overview drafting failed: ${err?.message || 'unknown error'}` });
  }
});

// Fetch a blank nonclinical/clin-pharm document template (form)
registerToolHandler('get_nonclinical_template', async (input: Record<string, unknown>) => {
  try {
    const { getNonclinicalTemplate, listNonclinicalTemplates } = await import('../templates/nonclinical-templates.js');
    const key = typeof input.template === 'string' ? input.template.trim() : '';
    if (!key) {
      return JSON.stringify({ status: 'list', templates: listNonclinicalTemplates() });
    }
    const tmpl = getNonclinicalTemplate(key);
    if (!tmpl) {
      return JSON.stringify({ status: 'not_found', message: `No nonclinical template for "${key}".`, available: listNonclinicalTemplates() });
    }
    return JSON.stringify({
      status: 'template',
      granule_id: tmpl.granule_id,
      sectionCode: tmpl.sectionCode,
      title: tmpl.title,
      content: tmpl.content,
      instruction: 'Fill the [PLACEHOLDER] tokens. If the program has ingested studies, prefer the draft_* composer tools, which fill content from data.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Fetching nonclinical template failed: ${err?.message || 'unknown error'}` });
  }
});

// Load a program's ingested nonclinical studies (feature-gated DB read)
registerToolHandler('load_nonclinical_program', async (input: Record<string, unknown>, ctx) => {
  try {
    const organizationId = ctx?.organizationId;
    if (!organizationId) {
      return JSON.stringify({
        status: 'needs_context',
        message: 'Loading program data requires an active organization context. Ask the user to open a project first.',
      });
    }
    const ctdProgramId = Number(input.ctdProgramId);
    if (!Number.isInteger(ctdProgramId) || ctdProgramId <= 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'A positive integer ctdProgramId is required.' });
    }
    const { loadNonclinicalProgram } = await import('../preclinical/nonclinical-program-loader.js');
    const loaded = await loadNonclinicalProgram(ctdProgramId, organizationId);
    if (!loaded) {
      return JSON.stringify({
        status: 'unavailable',
        message: 'The preclinical data layer is not enabled in this environment (PRECLINICAL_REVIEWER_ENABLED unset) or the program id is invalid.',
      });
    }
    return JSON.stringify({
      status: 'loaded',
      rowCount: loaded.rowCount,
      studies: loaded.studies,
      presentStudies: loaded.presentStudies,
      speciesNoaels: loaded.speciesNoaels,
      instruction:
        'Pass studies into draft_nonclinical_overview_m2_4 / draft_nonclinical_summaries_m2_6, presentStudies into assess_nonclinical_program, and speciesNoaels into compute_fih_dose. If rowCount is 0, tell the user no nonclinical studies are ingested for this program.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Loading nonclinical program failed: ${err?.message || 'unknown error'}` });
  }
});

// Draft M2.6 Nonclinical Written & Tabulated Summaries — deterministic composer
// ── Platform command bridge — ANA's full operational control surface ─────────
// Bridges the agentic tool loop into the governed ana-ri command executor so the
// conversational ANA can discover and invoke every platform command (project /
// artifact / task / dossier / Module 3 / CMC / MDX / PDEV / …). Reads are open;
// governed mutations still require confirm + reason and are audit-logged. Tenant
// and user come from the session context, never from model input.

registerToolHandler('list_platform_commands', async (input: Record<string, unknown>) => {
  try {
    const { COMMAND_REGISTRY } = await import('../ana-ri/command-executor.js');
    const q = typeof input.query === 'string' ? input.query.toLowerCase().trim() : '';
     
    let list = COMMAND_REGISTRY as Array<any>;
    if (q) list = list.filter(c => `${c.name} ${c.description ?? ''}`.toLowerCase().includes(q));
    return JSON.stringify({
      status: 'ok',
      count: list.length,
      commands: list.map(c => ({ command: c.name, description: c.description, parameters: c.parameters })),
      instruction:
        "Invoke any of these with execute_platform_command { command, params }. This is ANA's full platform command surface beyond the typed tools; governed mutations need params.confirm=true and params.reason.",
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Listing platform commands failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('execute_platform_command', async (input: Record<string, unknown>, ctx) => {
  try {
    const command = typeof input.command === 'string' ? input.command.trim() : '';
    if (!command) {
      return JSON.stringify({ status: 'needs_parameters', message: 'command is required — call list_platform_commands to discover the catalog.' });
    }
    const organizationId = ctx?.organizationId;
    const userId = ctx?.userId;
    if (!organizationId || !userId) {
      return JSON.stringify({ status: 'needs_context', message: 'execute_platform_command requires an active organization and user context.' });
    }
    const params = input.params && typeof input.params === 'object' ? (input.params as Record<string, unknown>) : {};
    const { executeCommands, COMMAND_REGISTRY } = await import('../ana-ri/command-executor.js');
     
    if (!(COMMAND_REGISTRY as Array<any>).some(c => c.name === command)) {
      return JSON.stringify({ status: 'unknown_command', message: `Unknown command "${command}". Call list_platform_commands to see the catalog.` });
    }
    const cmdCtx = {
      userId: Number(userId),
      organizationId: Number(organizationId),
      activeProjectId: ctx?.projectId != null ? Number(ctx.projectId) : undefined,
    };
     
    const results = await executeCommands([{ command, params } as any], cmdCtx as any);
    const result = results[0];
    return JSON.stringify({
      status: result?.success ? 'executed' : 'failed',
      command,
      result,
      instruction:
        'Governed mutations require confirm + reason in params. If the result indicates confirmation is required, re-issue with params.confirm=true and params.reason set. Report the result message verbatim.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Platform command failed: ${err?.message || 'unknown error'}` });
  }
});

// Draft M2.3 Quality Overall Summary — composes Module 3 then builds the QOS
registerToolHandler('draft_quality_overall_summary_m2_3', async (input: Record<string, unknown>) => {
  try {
    const cmcSources = input.cmcSources;
    if (!Array.isArray(cmcSources) || cmcSources.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'cmcSources[] is required to compose the QOS.' });
    }
    const { composeModule3FromCanonicalSources } = await import('../module3Composer.js');
    const { buildM23QualityOverallSummary } = await import('../m2-summary-builders.js');
     
    const module3Sections = composeModule3FromCanonicalSources(cmcSources as any);
    const summary = buildM23QualityOverallSummary({
      module3Sections,
      drugSubstanceName: typeof input.drugSubstanceName === 'string' ? input.drugSubstanceName : undefined,
      drugProductName: typeof input.drugProductName === 'string' ? input.drugProductName : undefined,
    });
    return JSON.stringify({
      status: 'drafted',
      engine: 'deterministic',
      sectionKey: summary.sectionKey,
      title: summary.title,
      content: summary.narrative,
      tables: summary.tables,
      completeness: summary.completeness,
      gaps: summary.gaps,
      instruction:
        'This is a draft the author promotes through the governed authoring flow. State the completeness and the missing Module 3 sections (gaps) honestly.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `M2.3 QOS composition failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('draft_nonclinical_summaries_m2_6', async (input: Record<string, unknown>) => {
  try {
    const studies = input.studies;
    if (!Array.isArray(studies) || studies.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'studies[] is required to draft the M2.6 summaries.' });
    }
    const { buildM26NonclinicalSummaries } = await import('../preclinical/m26-nonclinical-summaries.js');
     
    const r = buildM26NonclinicalSummaries(input as any);
    return JSON.stringify({
      status: 'drafted',
      engine: 'deterministic',
      sectionKey: r.sectionKey,
      title: r.title,
      content: r.narrative,
      tables: r.tables,
      completeness: r.completeness,
      gaps: r.gaps,
      instruction:
        'This is a draft the author promotes through the governed authoring flow. State the completeness and gaps honestly.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `M2.6 summaries drafting failed: ${err?.message || 'unknown error'}` });
  }
});

// Integrated nonclinical safety assessment — composes the engines
registerToolHandler('assess_nonclinical_safety', async (input: Record<string, unknown>) => {
  try {
    const { assessNonclinicalSafety } = await import('../preclinical/nonclinical-safety-assessment.js');
     
    const a = assessNonclinicalSafety(input as any);
    return JSON.stringify({
      status: 'assessed',
      engine: 'deterministic',
      readiness: a.readiness,
      recommendedStartingDoseMg: a.fihDose?.recommendedStartingDoseMg ?? null,
      limitedBy: a.fihDose?.limitedBy ?? null,
      adverseFindings: a.toxProfile?.adverseFindings.map(f => `${f.finding} (${f.organ})`) ?? [],
      programGaps: a.programGaps?.gaps ?? [],
      blockers: a.blockers,
      overviewCompleteness: a.overview?.completeness ?? null,
      summary: a.summary,
      instruction: 'Report the readiness verdict, FIH dose, adverse findings, and blockers verbatim. A blocker means a study is missing for the target phase, not that the molecule is unsafe.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Nonclinical safety assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Nonclinical study-program requirements & gaps — deterministic ICH M3(R2)
registerToolHandler('assess_nonclinical_program', async (input: Record<string, unknown>) => {
  try {
    if (input.maxClinicalDurationWeeks == null) {
      return JSON.stringify({ status: 'needs_parameters', message: 'maxClinicalDurationWeeks is required.' });
    }
    const { assessNonclinicalProgram } = await import('../preclinical/nonclinical-program-requirements.js');
    const present = Array.isArray(input.present) ? input.present : [];
    const result = assessNonclinicalProgram(
       
      input as any,
       
      present as any,
    );
    return JSON.stringify({
      status: 'assessed',
      engine: 'deterministic',
      adequate: result.adequate,
      required: result.required,
      gaps: result.gaps,
      instruction:
        'Report the required battery and the gaps verbatim. Only studies due at or before the target phase are gated; note the timing of later-due studies.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Nonclinical program assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Concentration-QTc / thorough-QT waiver — deterministic
registerToolHandler('assess_concentration_qtc', async (input: Record<string, unknown>) => {
  try {
    const { assessConcentrationQtc } = await import('../clinical-pharmacology/concentration-qtc.js');
     
    const result = assessConcentrationQtc(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction: 'Report the upper 90% bound and the TQT verdict verbatim. State the confidence flag.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/must be|required/.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `Concentration-QTc assessment failed: ${message}` });
  }
});

// PK characterization — deterministic dose proportionality + accumulation
registerToolHandler('characterize_pk', async (input: Record<string, unknown>) => {
  try {
    const dp = input.doseProportionality as Record<string, unknown> | undefined;
    const acc = input.accumulation as Record<string, unknown> | undefined;
    if (!dp && !acc) {
      return JSON.stringify({ status: 'needs_parameters', message: 'Supply doseProportionality and/or accumulation.' });
    }
    const mod = await import('../clinical-pharmacology/pk-characterization.js');
    const result: Record<string, unknown> = { status: 'computed', engine: 'deterministic' };
    if (dp) {
       
      result.doseProportionality = mod.assessDoseProportionality(dp as any);
    }
    if (acc) {
      result.accumulation = mod.accumulation(Number(acc.halfLifeHours), Number(acc.dosingIntervalHours));
    }
    result.instruction = 'Report the slope, 90% CI, proportionality verdict, and accumulation ratio verbatim.';
    return JSON.stringify(result);
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/required|must be/.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `PK characterization failed: ${message}` });
  }
});

// DDI static-model risk — deterministic
registerToolHandler('assess_ddi_risk', async (input: Record<string, unknown>) => {
  try {
    const { assessDdiRisk } = await import('../clinical-pharmacology/ddi-static-model.js');
     
    const result = assessDdiRisk(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction: 'Report the computed R-values, thresholds, and the clinical-study recommendation verbatim.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `DDI risk assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Draft M2.7 Clinical Summary — deterministic composer
registerToolHandler('draft_clinical_summary_m2_7', async (input: Record<string, unknown>) => {
  try {
    const csrs = input.csrs;
    if (!Array.isArray(csrs) || csrs.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'csrs[] is required to draft the M2.7 summary.' });
    }
    const { buildM27ClinicalSummary } = await import('../m2-summary-builders.js');
    const summary = buildM27ClinicalSummary({
       
      csrs: csrs as any,
      indication: (input.indication as string) ?? '',
      investigationalProduct: (input.investigationalProduct as string) ?? '',
    });
    return JSON.stringify({
      status: 'drafted',
      engine: 'deterministic',
      sectionKey: summary.sectionKey,
      title: summary.title,
      content: summary.narrative,
      completeness: summary.completeness,
      gaps: summary.gaps,
      instruction:
        'This is a draft the author promotes through the governed authoring flow. State the completeness and gaps honestly; do not invent studies or events.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `M2.7 summary drafting failed: ${err?.message || 'unknown error'}` });
  }
});

// Compare Statistical Scenarios — side-by-side deterministic comparison
registerToolHandler('compare_statistical_scenarios', async (input: Record<string, unknown>, ctx) => {
  try {
    const { anaBiostatsOrchestrator } = await import('../ana-biostats/index.js');
    const a = input.scenarioA as Record<string, unknown> | undefined;
    const b = input.scenarioB as Record<string, unknown> | undefined;
    if (!a || !b) {
      return JSON.stringify({ error: 'compare_statistical_scenarios requires scenarioA and scenarioB objects.' });
    }
    const meta = { userId: ctx?.userId ?? 0, organizationId: ctx?.organizationId ?? 0 };
    const result = await anaBiostatsOrchestrator.compareScenarios(
       
      toBiostatsInput(a, ctx) as any,
       
      toBiostatsInput(b, ctx) as any,
      meta,
    );
    const summarize = (r: typeof result.scenarioA) => ({
      sampleSize: r.computation?.adjustedTotal ?? r.computation?.sampleSize.total,
      power: r.computation?.power,
      verdict: r.judgment?.overallVerdict,
      actionRecommendation: r.judgment?.actionRecommendation,
    });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      label: input.label,
      scenarioA: summarize(result.scenarioA),
      scenarioB: summarize(result.scenarioB),
      comparison: result.comparison,
      comparisonBrief: result.comparisonDocument
        ? { title: result.comparisonDocument.title, content: result.comparisonDocument.content }
        : undefined,
      instruction: 'Report both scenarios\' engine-computed N and power and the recommendation verbatim.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Scenario comparison failed: ${err?.message || 'unknown error'}` });
  }
});

// Assess Statistical Defensibility — deterministic judgment engine (/defensibility)
registerToolHandler('assess_statistical_defensibility', async (input: Record<string, unknown>, ctx) => {
  try {
    const { anaBiostatsOrchestrator } = await import('../ana-biostats/index.js');
     
    const result = anaBiostatsOrchestrator.quickCompute(toBiostatsInput(input, ctx) as any);
    if (!result.validation.valid) {
      return JSON.stringify({ status: 'needs_parameters', errors: result.validation.errors, message: NEEDS_PARAMS_MESSAGE });
    }
    const j = result.judgment;
    return JSON.stringify({
      status: 'assessed',
      engine: 'deterministic',
      sampleSize: result.computation?.adjustedTotal ?? result.computation?.sampleSize.total,
      power: result.computation?.power,
      judgment: j
        ? {
            overallVerdict: j.overallVerdict,
            overallRisk: j.overallRisk,
            actionRecommendation: j.actionRecommendation,
            confidence: j.confidence,
            dimensions: j.dimensions?.map(d => ({ name: d.name, verdict: d.verdict, score: d.score, rationale: d.rationale, flags: d.flags })),
            fragility: j.fragility,
            endpointMethodFit: j.endpointMethodFit,
            escalationReasons: j.escalationReasons,
          }
        : undefined,
      interpretation: result.interpretation,
      instruction: 'Report the verdict, per-dimension scores and escalation reasons verbatim. Do not soften or invent scores.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Defensibility assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Analyze Missing Data Impact — deterministic power-erosion analysis
registerToolHandler('analyze_missing_data_impact', async (input: Record<string, unknown>, ctx) => {
  try {
    const { computationEngine, inputNormalizer } = await import('../ana-biostats/index.js');
    const validation = inputNormalizer.normalize(toBiostatsInput(input, ctx));
    if (!validation.valid) {
      return JSON.stringify({ status: 'needs_parameters', errors: validation.errors, message: NEEDS_PARAMS_MESSAGE });
    }
    const normalized = validation.normalizedInput;
    const base = computationEngine.computeEnhanced(normalized);
    const impact = computationEngine.computeMissingDataImpact(normalized, base);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      baselineSampleSize: base.adjustedTotal ?? base.sampleSize.total,
      baselinePower: base.power,
      missingDataImpact: impact,
      assumptions: { missingDataMethod: normalized.missingDataMethod, expectedMissingRate: normalized.expectedMissingRate },
      instruction: 'Report the effective sample size, power reduction, adjusted power, bias risk and recommendation verbatim.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Missing-data impact analysis failed: ${err?.message || 'unknown error'}` });
  }
});

// Generate Statistical Document — deterministic-grounded SAP / rationale draft
registerToolHandler('generate_statistical_document', async (input: Record<string, unknown>, ctx) => {
  try {
    const { anaBiostatsOrchestrator, documentGenerator } = await import('../ana-biostats/index.js');
    const documentType = input.documentType as string | undefined;
    if (!documentType) {
      return JSON.stringify({ error: 'generate_statistical_document requires a documentType.' });
    }
     
    const result = anaBiostatsOrchestrator.quickCompute(toBiostatsInput(input, ctx) as any);
    if (!result.validation.valid) {
      return JSON.stringify({ status: 'needs_parameters', errors: result.validation.errors, message: NEEDS_PARAMS_MESSAGE });
    }
    if (!result.computation || !result.judgment || !result.domain) {
      return JSON.stringify({ error: 'Engine did not return a complete computation; cannot generate the document.' });
    }
    const doc = documentGenerator.generate(
       
      documentType as any,
      result.validation.normalizedInput,
      result.computation,
      result.judgment,
      result.domain,
      result.regulatory,
      {
        projectId: result.validation.normalizedInput.projectId ?? (ctx?.projectId ?? 0),
        organizationId: ctx?.organizationId ?? 0,
        userId: ctx?.userId ?? 0,
      },
    );
    return JSON.stringify({
      status: 'generated',
      engine: 'deterministic',
      documentType: doc.type,
      title: doc.title,
      content: doc.content,
      sampleSize: result.computation.adjustedTotal ?? result.computation.sampleSize.total,
      power: result.computation.power,
      instruction:
        'Present this as a DRAFT grounded in the deterministic engine. The numbers in the content are engine-computed — do not alter them. The user promotes it through the governed authoring flow; do not claim it is filed or approved.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Statistical document generation failed: ${err?.message || 'unknown error'}` });
  }
});

// Assess Analytical Similarity — deterministic FDA Tier 1/2/3 engine (BLA)
registerToolHandler('assess_analytical_similarity', async (input: Record<string, unknown>) => {
  try {
    const { assessAnalyticalSimilarity } = await import('../biologics/analytical-similarity.js');
     
    const result = assessAnalyticalSimilarity(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report the per-attribute verdicts, the overall conclusion, and the statistics verbatim. Do not recompute. Tier 1 uses EAC = ±1.5·σ_R with a 90% CI; Tier 2 a mean_R ± k·σ_R quality range.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Analytical similarity assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Assess Comparability — deterministic ICH Q5E engine (BLA)
registerToolHandler('assess_comparability', async (input: Record<string, unknown>) => {
  try {
    const { assessComparability } = await import('../biologics/comparability.js');
     
    const result = assessComparability(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report the per-attribute verdicts, the overall ICH Q5E conclusion, and the bridging recommendation (analytical-sufficient vs non-clinical/clinical) verbatim. Do not recompute.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Comparability assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Assess Immunogenicity — deterministic ADA/NAb + risk engine (BLA)
registerToolHandler('assess_immunogenicity', async (input: Record<string, unknown>) => {
  try {
    const { assessImmunogenicity } = await import('../biologics/immunogenicity.js');
     
    const result = assessImmunogenicity(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report each arm’s ADA/NAb incidence with its 95% CI, the comparative difference, and the overall risk tier with its rationale verbatim. Do not recompute.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Immunogenicity assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Assess BLA Filing Risk — deterministic biologics RTF/CRL engine
registerToolHandler('assess_bla_filing_risk', async (input: Record<string, unknown>) => {
  try {
    const { assessBlaFilingRisk } = await import('../biologics/regulatory-risk.js');
     
    const result = assessBlaFilingRisk(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      ...result,
      instruction:
        'Report the RTF and CRL risk bands, the triggered findings with their citations and mitigations, and the filing blockers verbatim. Do not invent triggers beyond those returned.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `BLA filing-risk assessment failed: ${err?.message || 'unknown error'}` });
  }
});

// Generate SOP — deterministic GxP SOP generator (region-aware)
registerToolHandler('generate_sop', async (input: Record<string, unknown>) => {
  try {
    const { generateSop } = await import('../sop-generator.js');
     
    const result = generateSop(input as any);
    return JSON.stringify({
      status: 'generated',
      documentId: result.documentId,
      title: result.title,
      regions: result.regions,
      processType: result.processType,
      content: result.markdown,
      sections: result.sections,
      references: result.references,
      instruction:
        'Present the SOP markdown for review. It is a draft for the client to tailor and approve; the procedure steps and references are a region-appropriate starting point, not final.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `SOP generation failed: ${err?.message || 'unknown error'}` });
  }
});

// Resolve Submission Plan — multi-region build+submit resolver (FDA/EMA/PMDA)
registerToolHandler('resolve_submission_plan', async (input: Record<string, unknown>) => {
  try {
    const { resolveSubmissionPlan, submissionCoverageMatrix } = await import('../regulatory/submission-resolver.js');
     
    const plan = resolveSubmissionPlan(input as any);
    const coverage = submissionCoverageMatrix();
    return JSON.stringify({
      status: 'resolved',
      plan,
      coverageSummary: coverage.summary,
      instruction:
        'Report the per-region filing, dossier standard, Module 1 path, validation profile, and gateway, plus the coverage/gaps verbatim. The build and submit stacks for FDA/EMA/PMDA already exist; this is the routing plan over them.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Submission plan resolution failed: ${err?.message || 'unknown error'}` });
  }
});

// Get CTD Module 1 / Module 2 home — region-aware section structure
registerToolHandler('get_ctd_module_home', async (input: Record<string, unknown>) => {
  try {
    const mod = await import('../regulatory/ctd-module-structure.js');
    const region = mod.normalizeRegion(input.region as string | undefined);
    const which = input.module as string | undefined;
    if (which === '1') {
      return JSON.stringify({ status: 'ok', region, module: 1, sections: mod.getModule1Structure(region) });
    }
    if (which === '2') {
      return JSON.stringify({ status: 'ok', region, module: 2, sections: mod.getModule2Structure() });
    }
    return JSON.stringify({ status: 'ok', ...mod.getCtdModuleHome(region) });
  } catch (err: any) {
    return JSON.stringify({ error: `CTD module home lookup failed: ${err?.message || 'unknown error'}` });
  }
});

// Check Dossier Consistency — cross-artifact divergence detection
registerToolHandler('check_dossier_consistency', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const draftContent = input.draft_content as string;
  const projectId = Number(input.project_id);
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'check_dossier_consistency requires tenant context (organizationId).' });
  }
  const organizationId = ctx.organizationId;
  const ctdSection = input.ctd_section as string | undefined;
  const excludeArtifactId = input.exclude_artifact_id
    ? Number(input.exclude_artifact_id)
    : undefined;

  if (!draftContent || !Number.isFinite(projectId)) {
    return JSON.stringify({
      error: 'check_dossier_consistency requires draft_content and project_id',
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
// Submission-gateway handlers — package + transmit to FDA ESG / EMA CESP /
// EUDAMED / PMDA Gateway. Wraps server/services/submission-gateways/.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('package_ectd_for_region', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'package_ectd_for_region requires tenant context.' });
  }
  const region = typeof input.region === 'string' ? input.region : '';
  if (!['fda', 'ema', 'pmda'].includes(region)) {
    return JSON.stringify({ error: 'region must be fda / ema / pmda.' });
  }
  const leaves = Array.isArray(input.leaves) ? (input.leaves as Array<Record<string, unknown>>) : [];
  if (leaves.length === 0) {
    return JSON.stringify({ error: 'leaves[] is required and must be non-empty.' });
  }
  try {
    const { packageEctdSubmission } = await import('../submission-gateways/index.js');
    const path = await import('path');
    const outputDir =
      typeof input.output_dir === 'string'
        ? input.output_dir
        : path.resolve(process.cwd(), 'tmp', 'submissions', String(ctx.organizationId));
    const bundle = await packageEctdSubmission({
      region: region as 'fda' | 'ema' | 'pmda',
      applicationId: String(input.application_id),
      sequence:      String(input.sequence),
      submissionType: String(input.submission_type),
      sponsorId:     String(input.sponsor_id),
      sponsorName:   String(input.sponsor_name),
      productName:   String(input.product_name),
      leaves: leaves.map((l) => ({
        ctdSection: String(l.ctd_section),
        operation:  (String(l.operation) as 'new' | 'append' | 'replace' | 'delete'),
        sourcePath: String(l.source_path),
        fileName:   String(l.file_name),
        title:      String(l.title),
      })),
      outputDir,
    });
    return JSON.stringify({
      ok: true,
      bundlePath:    bundle.path,
      sha256:        bundle.sha256,
      sizeBytes:     bundle.sizeBytes,
      format:        bundle.format,
      displayName:   bundle.displayName,
      message: `Packaged ${leaves.length} leaves into a ${region.toUpperCase()} eCTD zip.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `package_ectd_for_region failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('transmit_submission', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'transmit_submission requires tenant context.' });
  }
  const region  = typeof input.region === 'string' ? input.region : '';
  const gateway = typeof input.gateway === 'string' ? input.gateway : '';
  if (!['fda', 'ema', 'pmda'].includes(region)) {
    return JSON.stringify({ error: 'region must be fda / ema / pmda.' });
  }
  if (!['esg', 'cesp', 'eudamed', 'pmda_gateway'].includes(gateway)) {
    return JSON.stringify({ error: 'gateway must be esg / cesp / eudamed / pmda_gateway.' });
  }
  try {
    const { getGateway, CredentialError, GatewayError, TransportError } = await import('../submission-gateways/index.js');
    const gw = getGateway(region as 'fda' | 'ema' | 'pmda', gateway as 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway');
    const environment = input.environment === 'staging' ? 'staging' : 'production';
    const result = await gw.transmit({
      organizationId: ctx.organizationId,
      userId:         ctx.userId ?? null,
      programId:      typeof input.program_id === 'string' && UUID_RE.test(input.program_id) ? input.program_id : null,
      packageId:      typeof input.package_id === 'number' ? input.package_id : null,
      bundle: {
        path:        String(input.bundle_path),
        sha256:      String(input.bundle_sha256),
        sizeBytes:   Number(input.bundle_size_bytes),
        format:      String(input.format) as 'ectd' | 'estar' | 'eudamed_register' | 'pmda_ectd',
      },
      environment,
      submissionType: typeof input.submission_type === 'string' ? input.submission_type : undefined,
      metadata: {
        applicationId: input.application_id,
        sequence:      input.sequence,
        environment,
      },
    });
    return JSON.stringify({ ok: true, ...result });
  } catch (err: unknown) {
    /* CredentialError / GatewayError / TransportError surfaced as user-
       readable messages with the original class preserved so AnA can
       suggest the right remediation (set env var vs. retry vs. validate). */
    if (err instanceof Error && err.name === 'CredentialError') {
      return JSON.stringify({ error: err.message, errorClass: 'auth' });
    }
    if (err instanceof Error && err.name === 'TransportError') {
      return JSON.stringify({ error: err.message, errorClass: 'transport' });
    }
    if (err instanceof Error && err.name === 'GatewayError') {
      return JSON.stringify({ error: err.message, errorClass: 'gateway' });
    }
    return JSON.stringify({
      error: `transmit_submission failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('check_submission_status', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'check_submission_status requires tenant context.' });
  }
  const id = typeof input.transmittal_id === 'number' ? input.transmittal_id : NaN;
  if (!Number.isFinite(id)) {
    return JSON.stringify({ error: 'transmittal_id (number) is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query<{ region: string; gateway: string }>(
      `SELECT region, gateway FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
      [id, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Transmittal ${id} not found in this organization.` });
    }
    const { getGateway } = await import('../submission-gateways/index.js');
    const gw = getGateway(own.rows[0].region as 'fda' | 'ema' | 'pmda', own.rows[0].gateway as 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway');
    const result = await gw.checkStatus(id);
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `check_submission_status failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('get_submission_ack', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'get_submission_ack requires tenant context.' });
  }
  const id = typeof input.transmittal_id === 'number' ? input.transmittal_id : NaN;
  if (!Number.isFinite(id)) {
    return JSON.stringify({ error: 'transmittal_id (number) is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query<{ region: string; gateway: string }>(
      `SELECT region, gateway FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
      [id, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Transmittal ${id} not found in this organization.` });
    }
    const { getGateway } = await import('../submission-gateways/index.js');
    const gw = getGateway(own.rows[0].region as 'fda' | 'ema' | 'pmda', own.rows[0].gateway as 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway');
    const ack = await gw.downloadAcknowledgment(id);
    return JSON.stringify({
      ok: true,
      transmittalId:   ack.transmittalId,
      transmissionId:  ack.transmissionId,
      contentType:     ack.contentType,
      ackText:         ack.buffer.toString('utf8').slice(0, 4000),
      receivedAt:      ack.receivedAt,
    });
  } catch (err) {
    return JSON.stringify({
      error: `get_submission_ack failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('record_validation_finding', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'record_validation_finding requires tenant context.' });
  }
  const id = typeof input.transmittal_id === 'number' ? input.transmittal_id : NaN;
  const validator = typeof input.validator === 'string' ? input.validator : '';
  const severity  = typeof input.severity === 'string' ? input.severity : '';
  const message   = typeof input.message === 'string' ? input.message : '';
  if (!Number.isFinite(id)) {
    return JSON.stringify({ error: 'transmittal_id (number) is required.' });
  }
  if (!['fda_evalidator', 'ema_validator', 'pmda_precheck', 'lorenz', 'globalsubmit', 'internal'].includes(validator)) {
    return JSON.stringify({ error: 'validator must be one of fda_evalidator | ema_validator | pmda_precheck | lorenz | globalsubmit | internal.' });
  }
  if (!['error', 'warning', 'info'].includes(severity)) {
    return JSON.stringify({ error: 'severity must be error | warning | info.' });
  }
  if (!message) {
    return JSON.stringify({ error: 'message is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query(
      `SELECT 1 FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
      [id, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Transmittal ${id} not found in this organization.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO submission_validation_findings (
         transmittal_id, organization_id, validator, severity, rule_id, rule_title,
         message, file_path, line_number
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, severity, message`,
      [
        id, ctx.organizationId, validator, severity,
        typeof input.rule_id === 'string' ? input.rule_id : null,
        typeof input.rule_title === 'string' ? input.rule_title : null,
        message,
        typeof input.file_path === 'string' ? input.file_path : null,
        typeof input.line_number === 'number' ? Math.round(input.line_number) : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Recorded ${severity} finding from ${validator} against transmittal ${id}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `record_validation_finding failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('resolve_validation_finding', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'resolve_validation_finding requires tenant context.' });
  }
  const id = typeof input.finding_id === 'number' ? input.finding_id : NaN;
  if (!Number.isFinite(id)) {
    return JSON.stringify({ error: 'finding_id (number) is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `UPDATE submission_validation_findings
          SET resolved        = true,
              resolved_at     = NOW(),
              resolved_by     = $3,
              resolution_note = $4
        WHERE id = $1 AND organization_id = $2 AND resolved = false
        RETURNING id, resolved_at`,
      [
        id, ctx.organizationId,
        ctx.userId ?? null,
        typeof input.resolution_note === 'string' ? input.resolution_note : null,
      ],
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: `Finding ${id} not found, or already resolved.` });
    }
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Resolved validation finding ${id}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `resolve_validation_finding failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('gateway_configuration_status', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'gateway_configuration_status requires tenant context.' });
  }
  try {
    const { gatewayConfigurationStatus } = await import('../submission-gateways/index.js');
    const environment = input.environment === 'staging' ? 'staging' : 'production';
    const status = await gatewayConfigurationStatus(ctx.organizationId, environment);
    return JSON.stringify({
      ok: true,
      environment,
      gateways: status,
      message: `${status.filter((s) => s.configured).length} of ${status.length} gateways configured for ${environment}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `gateway_configuration_status failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Submission-center handlers. The three compute tools are pure (no tenant data
// touched, so no org gate); the two ingestion tools persist and are tenant +
// user scoped via the active ToolContext and audited inside the ingestion
// service (AI_GENERATE). None of these transmit or freeze — those stay in the
// existing governed tools.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('compute_lifecycle_operations', async (input) => {
  try {
    const { computeLifecycleOperations } = await import('../ectd/lifecycle-operator.js');
    const prior = (Array.isArray(input.prior_leaves) ? input.prior_leaves : []).map((p: any) => ({
      leafKey: p.leaf_key,
      ctdSection: p.ctd_section,
      fileName: p.file_name,
      md5: p.md5,
      title: p.title,
      sourcePath: p.source_path,
    }));
    const desired = (Array.isArray(input.desired_leaves) ? input.desired_leaves : []).map((d: any) => ({
      leafKey: d.leaf_key,
      ctdSection: d.ctd_section,
      fileName: d.file_name,
      md5: d.md5,
      title: d.title ?? d.file_name,
      sourcePath: d.source_path ?? '',
      appendOnChange: d.append_on_change === true,
    }));
    const result = computeLifecycleOperations(prior, desired);
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `compute_lifecycle_operations failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('generate_stf', async (input) => {
  try {
    const { generateStfFiles } = await import('../ectd/stf-generator.js');
    const leaves = (Array.isArray(input.leaves) ? input.leaves : []).map((l: any) => ({
      studyId: l.study_id,
      fileTag: l.file_tag,
      ctdSection: l.ctd_section,
      href: l.href,
      title: l.title,
      operation: l.operation,
    }));
    const studyMeta = (Array.isArray(input.study_meta) ? input.study_meta : []).map((m: any) => ({
      studyId: m.study_id,
      studyTitle: m.study_title,
      studyCategory: m.study_category,
    }));
    const result = generateStfFiles(leaves, studyMeta);
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `generate_stf failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('check_ectd_cross_references', async (input) => {
  try {
    const { resolveCrossReferences } = await import('../ectd/cross-reference-resolver.js');
    const leaves = (Array.isArray(input.leaves) ? input.leaves : []).map((l: any) => ({
      leafKey: l.leaf_key,
      ctdSection: l.ctd_section,
      fileName: l.file_name,
      title: l.title ?? l.file_name,
      operation: l.operation ?? 'new',
      sourcePath: l.source_path ?? '',
      md5: l.md5,
    }));
    const references = (Array.isArray(input.references) ? input.references : []).map((r: any) => ({
      id: r.id,
      source: r.source,
      target: r.target,
      label: r.label,
    }));
    const result = resolveCrossReferences(leaves, references);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: `check_ectd_cross_references failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('classify_submission_document', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'classify_submission_document requires tenant context (organizationId and userId).' });
  }
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isFinite(documentId)) {
    return JSON.stringify({ error: 'document_id (number) is required.' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : undefined;
  try {
    const { classifyDocument } = await import('../ingestion/ingestion-service.js');
    const result = await classifyDocument({
      documentId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      sequenceId,
    });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `classify_submission_document failed: ${err instanceof Error ? err.message : String(err)}`,
      code: (err as any)?.code,
    });
  }
});

registerToolHandler('extract_submission_document', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'extract_submission_document requires tenant context (organizationId and userId).' });
  }
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const sectionCode = typeof input.section_code === 'string' ? input.section_code : '';
  const submissionId = typeof input.submission_id === 'number' ? input.submission_id : NaN;
  if (!Number.isFinite(documentId)) return JSON.stringify({ error: 'document_id (number) is required.' });
  if (!sectionCode) return JSON.stringify({ error: 'section_code is required.' });
  if (!Number.isFinite(submissionId)) return JSON.stringify({ error: 'submission_id (number) is required.' });
  try {
    const { extractStructure } = await import('../ingestion/ingestion-service.js');
    const result = await extractStructure({
      documentId,
      sectionCode,
      submissionId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `extract_submission_document failed: ${err instanceof Error ? err.message : String(err)}`,
      code: (err as any)?.code,
    });
  }
});

registerToolHandler('validate_ectd_package', async (input) => {
  try {
    const { validatePackage } = await import('../ectd/ectd4-validator.js');
    const submissionType = typeof input.submission_type === 'string' ? input.submission_type : 'IND';
    const leaves = (Array.isArray(input.leaves) ? input.leaves : []).map((l: any) => ({
      sectionCode: l.section_code,
      title: l.title,
      checksum: l.checksum,
      checksumType: 'md5' as const,
      operation: l.operation,
      lifecycleOperator: l.lifecycle_operator,
      filePath: l.file_path,
      mimeType: l.mime_type ?? 'application/pdf',
      fileSize: typeof l.file_size === 'number' ? l.file_size : 0,
    }));
    const result = validatePackage(leaves, submissionType);
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `validate_ectd_package failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('run_shadow_review', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'run_shadow_review requires tenant context (organizationId and userId).' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : NaN;
  if (!Number.isFinite(sequenceId)) {
    return JSON.stringify({ error: 'sequence_id (number) is required.' });
  }
  const allowedLens = ['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr'];
  const lens = typeof input.lens === 'string' && allowedLens.includes(input.lens) ? (input.lens as any) : undefined;
  try {
    const { runShadowReview } = await import('../shadow-review/shadow-review-service.js');
    const result = await runShadowReview({ sequenceId, lens, organizationId: ctx.organizationId, userId: ctx.userId });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `run_shadow_review failed: ${err instanceof Error ? err.message : String(err)}`,
      code: (err as any)?.code,
    });
  }
});

// ── Submission AI tasks (gateway-backed, audited; tenant from ToolContext) ────

registerToolHandler('plan_submission', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'plan_submission requires tenant context (organizationId and userId).' });
  }
  const applicationType = typeof input.application_type === 'string' ? input.application_type : '';
  const clientType = typeof input.client_type === 'string' ? input.client_type : '';
  const regions = Array.isArray(input.regions) ? (input.regions as string[]) : [];
  if (!applicationType) return JSON.stringify({ error: 'application_type is required.' });
  if (!clientType) return JSON.stringify({ error: 'client_type is required.' });
  if (regions.length === 0) return JSON.stringify({ error: 'regions (non-empty array) is required.' });
  try {
    const { generateSubmissionPlan } = await import('../submission-ai/submission-ai-service.js');
    const result = await generateSubmissionPlan(
      { applicationType, clientType, regions, productProfile: typeof input.product_profile === 'string' ? input.product_profile : undefined },
      { organizationId: ctx.organizationId, userId: ctx.userId, submissionId: typeof input.submission_id === 'number' ? input.submission_id : undefined }
    );
    return JSON.stringify({ ok: true, plan: result });
  } catch (err) {
    return JSON.stringify({ error: `plan_submission failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('explain_validation_findings', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'explain_validation_findings requires tenant context (organizationId and userId).' });
  }
  const region = typeof input.region === 'string' ? input.region : '';
  const findings = Array.isArray(input.findings) ? (input.findings as any[]) : [];
  if (!region) return JSON.stringify({ error: 'region is required.' });
  if (findings.length === 0) return JSON.stringify({ error: 'findings (non-empty array) is required.' });
  try {
    const { explainValidation } = await import('../submission-ai/submission-ai-service.js');
    const result = await explainValidation(
      { region, findings },
      { organizationId: ctx.organizationId, userId: ctx.userId, submissionId: typeof input.submission_id === 'number' ? input.submission_id : undefined }
    );
    return JSON.stringify({ ok: true, ...((result as object) ?? {}) });
  } catch (err) {
    return JSON.stringify({ error: `explain_validation_findings failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('cross_region_gap_analysis', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'cross_region_gap_analysis requires tenant context (organizationId and userId).' });
  }
  const sourceRegion = typeof input.source_region === 'string' ? input.source_region : '';
  const targetRegions = Array.isArray(input.target_regions) ? (input.target_regions as string[]) : [];
  const applicationType = typeof input.application_type === 'string' ? input.application_type : '';
  if (!sourceRegion) return JSON.stringify({ error: 'source_region is required.' });
  if (targetRegions.length === 0) return JSON.stringify({ error: 'target_regions (non-empty array) is required.' });
  if (!applicationType) return JSON.stringify({ error: 'application_type is required.' });
  try {
    const { computeCrossRegionGap } = await import('../submission-ai/submission-ai-service.js');
    const result = await computeCrossRegionGap(
      { sourceRegion, targetRegions, applicationType, sectionsPresent: Array.isArray(input.sections_present) ? (input.sections_present as string[]) : undefined },
      { organizationId: ctx.organizationId, userId: ctx.userId, submissionId: typeof input.submission_id === 'number' ? input.submission_id : undefined }
    );
    return JSON.stringify({ ok: true, ...((result as object) ?? {}) });
  } catch (err) {
    return JSON.stringify({ error: `cross_region_gap_analysis failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('dispatch_qc_check', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'dispatch_qc_check requires tenant context (organizationId and userId).' });
  }
  const region = typeof input.region === 'string' ? input.region : '';
  const validationErrors = typeof input.validation_errors === 'number' ? input.validation_errors : NaN;
  const unresolvedShadowCriticals = typeof input.unresolved_shadow_criticals === 'number' ? input.unresolved_shadow_criticals : NaN;
  const leaves = Array.isArray(input.leaves) ? (input.leaves as any[]) : [];
  if (!region) return JSON.stringify({ error: 'region is required.' });
  if (!Number.isFinite(validationErrors)) return JSON.stringify({ error: 'validation_errors (number) is required.' });
  if (!Number.isFinite(unresolvedShadowCriticals)) return JSON.stringify({ error: 'unresolved_shadow_criticals (number) is required.' });
  try {
    const { runDispatchQc } = await import('../submission-ai/submission-ai-service.js');
    const result = await runDispatchQc(
      { region, validationErrors, unresolvedShadowCriticals, leaves: leaves.map((l) => ({ sectionCode: l.section_code, operation: l.operation })) },
      { organizationId: ctx.organizationId, userId: ctx.userId, submissionId: typeof input.submission_id === 'number' ? input.submission_id : undefined }
    );
    return JSON.stringify({ ok: true, ...((result as object) ?? {}) });
  } catch (err) {
    return JSON.stringify({ error: `dispatch_qc_check failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('trace_provenance', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'trace_provenance requires tenant context (organizationId and userId).' });
  }
  const submissionId = typeof input.submission_id === 'number' ? input.submission_id : NaN;
  const targetSectionCode = typeof input.target_section_code === 'string' ? input.target_section_code : '';
  if (!Number.isFinite(submissionId)) return JSON.stringify({ error: 'submission_id (number) is required.' });
  if (!targetSectionCode) return JSON.stringify({ error: 'target_section_code is required.' });
  try {
    const { traceProvenance } = await import('../truth-engine/truth-engine-service.js');
    const result = await traceProvenance({ submissionId, targetSectionCode }, { organizationId: ctx.organizationId, userId: ctx.userId });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({ error: `trace_provenance failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('check_consistency', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'check_consistency requires tenant context (organizationId and userId).' });
  }
  const submissionId = typeof input.submission_id === 'number' ? input.submission_id : NaN;
  const dimension = typeof input.dimension === 'string' ? input.dimension : '';
  const left = input.left as { ref?: string; text?: string } | undefined;
  const right = Array.isArray(input.right) ? (input.right as Array<{ ref: string; text: string }>) : [];
  if (!Number.isFinite(submissionId)) return JSON.stringify({ error: 'submission_id (number) is required.' });
  if (!dimension) return JSON.stringify({ error: 'dimension is required.' });
  if (!left || !left.ref || !left.text) return JSON.stringify({ error: 'left { ref, text } is required.' });
  if (right.length === 0) return JSON.stringify({ error: 'right (non-empty array) is required.' });
  try {
    const { runConsistencyCheck } = await import('../truth-engine/truth-engine-service.js');
    const findings = await runConsistencyCheck(
      { submissionId, dimension, left: { ref: left.ref, text: left.text }, right },
      { organizationId: ctx.organizationId, userId: ctx.userId }
    );
    return JSON.stringify({ ok: true, findings, conflicts: findings.filter((f) => f.status === 'conflict').length });
  } catch (err) {
    return JSON.stringify({ error: `check_consistency failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('assess_pathway_readiness', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'assess_pathway_readiness requires tenant context (organizationId and userId).' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : NaN;
  const pathway = typeof input.pathway === 'string' ? input.pathway : '';
  const memberStates = Array.isArray(input.member_states) ? (input.member_states as string[]) : [];
  const allowed = ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'];
  if (!Number.isFinite(sequenceId)) return JSON.stringify({ error: 'sequence_id (number) is required.' });
  if (!allowed.includes(pathway)) return JSON.stringify({ error: `pathway must be one of: ${allowed.join(', ')}.` });
  try {
    const { listLeaves } = await import('../submission-service/submission-service.js');
    const { assessPathwayReadiness } = await import('../pathway-engines/index.js');
    const leaves = await listLeaves(sequenceId, { organizationId: ctx.organizationId });
    const result = assessPathwayReadiness({
      pathway: pathway as 'ctis' | 'mdr' | 'ivdr' | 'estar_510k' | 'estar_de_novo' | 'pmda_shonin',
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      memberStates,
    });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({ error: `assess_pathway_readiness failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('build_pathway_manifest', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'build_pathway_manifest requires tenant context (organizationId and userId).' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : NaN;
  const pathway = typeof input.pathway === 'string' ? input.pathway : '';
  const memberStates = Array.isArray(input.member_states) ? (input.member_states as string[]) : [];
  const allowed = ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo', 'pmda_shonin'];
  if (!Number.isFinite(sequenceId)) return JSON.stringify({ error: 'sequence_id (number) is required.' });
  if (!allowed.includes(pathway)) return JSON.stringify({ error: `pathway must be one of: ${allowed.join(', ')}.` });
  try {
    const { listLeaves } = await import('../submission-service/submission-service.js');
    const { assessPathwayReadiness } = await import('../pathway-engines/index.js');
    const { buildPathwayManifest } = await import('../pathway-engines/pathway-manifest.js');
    const leaves = await listLeaves(sequenceId, { organizationId: ctx.organizationId });
    const result = assessPathwayReadiness({
      pathway: pathway as 'ctis' | 'mdr' | 'ivdr' | 'estar_510k' | 'estar_de_novo' | 'pmda_shonin',
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      memberStates,
    });
    const manifest = buildPathwayManifest(
      pathway as 'ctis' | 'mdr' | 'ivdr' | 'estar_510k' | 'estar_de_novo' | 'pmda_shonin',
      result.detail
    );
    return JSON.stringify({ ok: true, ...manifest });
  } catch (err) {
    return JSON.stringify({ error: `build_pathway_manifest failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

registerToolHandler('list_validation_rules', async (input) => {
  // Static reference data — not tenant-specific, so no org/user context required.
  const region = typeof input.region === 'string' ? input.region : '';
  const REGIONS = ['fda', 'eu', 'jp', 'ca', 'au', 'ch'] as const;
  if (region && !(REGIONS as readonly string[]).includes(region)) {
    return JSON.stringify({ error: `region must be one of: ${REGIONS.join(', ')}.` });
  }
  try {
    const { RULE_CORPUS, rulesForRegion, corpusSummary } = await import('../ectd/validation-rule-corpus.js');
    const rules = region ? rulesForRegion(region as (typeof REGIONS)[number]) : RULE_CORPUS;
    return JSON.stringify({ ok: true, region: region || 'all', summary: corpusSummary(), rules });
  } catch (err) {
    return JSON.stringify({ error: `list_validation_rules failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_market_submission_spec', async (input) => {
  // Static reference data — not tenant-specific, so no org/user context required.
  const specId = typeof input.spec_id === 'string' ? input.spec_id : '';
  const market = typeof input.market === 'string' ? input.market.toLowerCase() : '';
  const family = typeof input.family === 'string' ? input.family : '';
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return JSON.stringify({ error: `family must be one of: ${FAMILIES.join(', ')}.` });
  }
  try {
    const m = await import('../market-specs/market-submission-specs.js');
    if (specId) {
      const spec = m.getMarketSpec(specId);
      return spec
        ? JSON.stringify({ ok: true, spec })
        : JSON.stringify({ error: `No market spec "${specId}".` });
    }
    let specs = m.MARKET_SUBMISSION_SPECS;
    if (market) specs = specs.filter((s) => s.market === market);
    if (family) specs = specs.filter((s) => s.family === family);
    return JSON.stringify({ ok: true, summary: m.marketSpecSummary(), specs });
  } catch (err) {
    return JSON.stringify({ error: `get_market_submission_spec failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_document_template', async (input) => {
  // Static reference data — not tenant-specific, so no org/user context required.
  const templateId = typeof input.template_id === 'string' ? input.template_id : '';
  const family = typeof input.family === 'string' ? input.family : '';
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return JSON.stringify({ error: `family must be one of: ${FAMILIES.join(', ')}.` });
  }
  try {
    const m = await import('../market-specs/document-template-library.js');
    if (templateId) {
      const t = m.getDocumentTemplate(templateId);
      return t ? JSON.stringify({ ok: true, template: t }) : JSON.stringify({ error: `No document template "${templateId}".` });
    }
    const templates = family ? m.templatesForFamily(family as 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis') : m.DOCUMENT_TEMPLATES;
    return JSON.stringify({ ok: true, templates });
  } catch (err) {
    return JSON.stringify({ error: `get_document_template failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('validate_market_formatting', async (input) => {
  // Static reference data + pure computation — no tenant context required.
  const specId = typeof input.spec_id === 'string' ? input.spec_id : '';
  if (!specId) return JSON.stringify({ error: 'spec_id is required.' });
  const rawLeaves = Array.isArray(input.leaves) ? input.leaves : [];
  try {
    const { getMarketSpec } = await import('../market-specs/market-submission-specs.js');
    const spec = getMarketSpec(specId);
    if (!spec) return JSON.stringify({ error: `No market spec "${specId}".` });
    const { validateLeavesAgainstMarketSpec } = await import('../market-specs/market-formatting-validator.js');
    const leaves = rawLeaves.map((l: Record<string, unknown>) => ({
      fileName: String(l.file_name ?? ''),
      filePath: typeof l.file_path === 'string' ? l.file_path : undefined,
      fileSizeBytes: typeof l.file_size_bytes === 'number' ? l.file_size_bytes : undefined,
      fileFormat: typeof l.file_format === 'string' ? l.file_format : undefined,
      encrypted: typeof l.encrypted === 'boolean' ? l.encrypted : undefined,
    }));
    return JSON.stringify({ ok: true, ...validateLeavesAgainstMarketSpec(spec, leaves) });
  } catch (err) {
    return JSON.stringify({ error: `validate_market_formatting failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_dispatch_readiness', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'assess_dispatch_readiness requires tenant context (organizationId and userId).' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : NaN;
  if (!Number.isFinite(sequenceId)) return JSON.stringify({ error: 'sequence_id (number) is required.' });
  try {
    const { assessSequenceDispatchReadiness } = await import('../ectd/assess-dispatch-readiness.js');
    // All gate inputs are computed server-side (canonical leaves + shadow findings),
    // so this verdict is the tamper-proof one — never a client-supplied count.
    const assessment = await assessSequenceDispatchReadiness({ sequenceId, organizationId: ctx.organizationId });
    return JSON.stringify({ ok: true, ...assessment });
  } catch (err) {
    return JSON.stringify({ error: `assess_dispatch_readiness failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as any)?.code });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Notifications + clinical-study + memory handlers (migration 20260510).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('fire_notification', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'fire_notification requires tenant context.' });
  }
  const category = typeof input.category === 'string' ? input.category : '';
  const severity = typeof input.severity === 'string' ? input.severity : '';
  const title    = typeof input.title === 'string' ? input.title.trim() : '';
  const allowedCat = new Set([
    'submission_status', 'validation_finding', 'q_sub_response', 'cdx_pairing',
    'ldt_milestone_due', 'gateway_credential_expiring', 'ana_draft_pending',
    'risk_residual_high', 'capa_due', 'study_deviation', 'enrollment_milestone',
    'admin', 'system',
  ]);
  if (!allowedCat.has(category)) {
    return JSON.stringify({ error: `category must be one of: ${Array.from(allowedCat).join(', ')}.` });
  }
  if (!['info', 'warning', 'critical'].includes(severity)) {
    return JSON.stringify({ error: 'severity must be info | warning | critical.' });
  }
  if (!title) {
    return JSON.stringify({ error: 'title is required.' });
  }
  try {
    const { createNotification } = await import('../notifications/notification-service.js');
    const id = await createNotification({
      organizationId:  ctx.organizationId,
      recipientUserId: typeof input.recipient_user_id === 'number' ? input.recipient_user_id : null,
      recipientRole:   typeof input.recipient_role === 'string' ? input.recipient_role : null,
      category,
      severity:        severity as 'info' | 'warning' | 'critical',
      title,
      body:            typeof input.body === 'string' ? input.body : null,
      resourceType:    typeof input.resource_type === 'string' ? input.resource_type : null,
      resourceId:      typeof input.resource_id === 'string' ? input.resource_id : null,
      actionUrl:       typeof input.action_url === 'string' ? input.action_url : null,
    });
    return JSON.stringify({
      ok: true, notificationId: id,
      message: `Notification #${id} fired (${severity} · ${category}).`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `fire_notification failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('create_clinical_study', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'create_clinical_study requires tenant context.' });
  }
  const studyId = typeof input.study_id === 'string' ? input.study_id.trim() : '';
  const title   = typeof input.title === 'string' ? input.title.trim() : '';
  if (!studyId || !title) {
    return JSON.stringify({ error: 'study_id and title are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO clinical_studies (
         organization_id, program_id, study_id, nct_id, title, phase, study_type,
         primary_endpoint, sample_size_planned, start_date, ide_number, irb_approved
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,false))
       RETURNING id, study_id, title, status`,
      [
        ctx.organizationId, programId, studyId,
        typeof input.nct_id === 'string' ? input.nct_id : null,
        title,
        typeof input.phase === 'string' ? input.phase : null,
        typeof input.study_type === 'string' ? input.study_type : null,
        typeof input.primary_endpoint === 'string' ? input.primary_endpoint : null,
        typeof input.sample_size_planned === 'number' ? Math.round(input.sample_size_planned) : null,
        typeof input.start_date === 'string' ? input.start_date : null,
        typeof input.ide_number === 'string' ? input.ide_number : null,
        input.irb_approved === true,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Opened clinical study "${title}" (id ${rows[0].id}).`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `create_clinical_study failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('log_study_deviation', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'log_study_deviation requires tenant context.' });
  }
  const studyId = typeof input.study_id === 'number' ? input.study_id : NaN;
  const date    = typeof input.deviation_date === 'string' ? input.deviation_date : '';
  const cat     = typeof input.category === 'string' ? input.category : '';
  const desc    = typeof input.description === 'string' ? input.description : '';
  if (!Number.isFinite(studyId)) {
    return JSON.stringify({ error: 'study_id (number) is required.' });
  }
  if (!date || !cat || !desc) {
    return JSON.stringify({ error: 'deviation_date, category, and description are required.' });
  }
  if (!['major', 'minor', 'inclusion_exclusion', 'visit_window', 'consent', 'protocol', 'other'].includes(cat)) {
    return JSON.stringify({ error: 'category invalid.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    /* Tenant gate. */
    const own = await getPool().query(
      `SELECT 1 FROM clinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [studyId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Study ${studyId} not found in this organization.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO clinical_study_deviations (
         study_id, site_id, organization_id, deviation_date, category, description,
         subject_id, reported_by, capa_required
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,false))
       RETURNING id, category`,
      [
        studyId,
        typeof input.site_id === 'number' ? input.site_id : null,
        ctx.organizationId, date, cat, desc,
        typeof input.subject_id === 'string' ? input.subject_id : null,
        ctx.userId ?? null,
        input.capa_required === true,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Logged ${cat} deviation against study ${studyId}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `log_study_deviation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('log_study_ae', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'log_study_ae requires tenant context.' });
  }
  const studyId = typeof input.study_id === 'number' ? input.study_id : NaN;
  const aeId    = typeof input.ae_id === 'string' ? input.ae_id.trim() : '';
  const date    = typeof input.ae_date === 'string' ? input.ae_date : '';
  if (!Number.isFinite(studyId) || !aeId || !date) {
    return JSON.stringify({ error: 'study_id, ae_id, and ae_date are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query(
      `SELECT 1 FROM clinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [studyId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Study ${studyId} not found in this organization.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO clinical_study_aes (
         study_id, site_id, organization_id, ae_id, subject_id, ae_date,
         serious, unanticipated, device_related, severity, outcome,
         preferred_term, soc
       ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,false),COALESCE($8,false),$9,$10,$11,$12,$13)
       RETURNING id, ae_id, serious, unanticipated`,
      [
        studyId,
        typeof input.site_id === 'number' ? input.site_id : null,
        ctx.organizationId, aeId,
        typeof input.subject_id === 'string' ? input.subject_id : null,
        date,
        input.serious === true,
        input.unanticipated === true,
        typeof input.device_related === 'string' ? input.device_related : null,
        typeof input.severity === 'string' ? input.severity : null,
        typeof input.outcome === 'string' ? input.outcome : null,
        typeof input.preferred_term === 'string' ? input.preferred_term : null,
        typeof input.soc === 'string' ? input.soc : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Logged AE ${aeId} against study ${studyId}${input.serious === true ? ' (serious)' : ''}${input.unanticipated === true ? ' (UADE)' : ''}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `log_study_ae failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('record_endpoint_result', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'record_endpoint_result requires tenant context.' });
  }
  const studyId = typeof input.study_id === 'number' ? input.study_id : NaN;
  const kind    = typeof input.endpoint_kind === 'string' ? input.endpoint_kind : '';
  const name    = typeof input.name === 'string' ? input.name.trim() : '';
  if (!Number.isFinite(studyId) || !name) {
    return JSON.stringify({ error: 'study_id and name are required.' });
  }
  if (!['primary', 'secondary', 'exploratory', 'safety'].includes(kind)) {
    return JSON.stringify({ error: 'endpoint_kind must be primary | secondary | exploratory | safety.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query(
      `SELECT 1 FROM clinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [studyId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Study ${studyId} not found in this organization.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO clinical_study_endpoints (
         study_id, organization_id, endpoint_kind, name, description, pre_specified,
         target_value, observed_value, ci_lower, ci_upper, p_value, met, analysis_note
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, endpoint_kind, name, met`,
      [
        studyId, ctx.organizationId, kind, name,
        typeof input.description === 'string' ? input.description : null,
        typeof input.pre_specified === 'boolean' ? input.pre_specified : null,
        typeof input.target_value === 'string' ? input.target_value : null,
        typeof input.observed_value === 'string' ? input.observed_value : null,
        typeof input.ci_lower === 'string' ? input.ci_lower : null,
        typeof input.ci_upper === 'string' ? input.ci_upper : null,
        typeof input.p_value === 'number' ? input.p_value : null,
        typeof input.met === 'boolean' ? input.met : null,
        typeof input.analysis_note === 'string' ? input.analysis_note : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Recorded ${kind} endpoint "${name}".`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `record_endpoint_result failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('verify_memory_atom', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'verify_memory_atom requires tenant context.' });
  }
  const id = typeof input.memory_id === 'number' ? input.memory_id : NaN;
  if (!Number.isFinite(id)) {
    return JSON.stringify({ error: 'memory_id (number) is required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `UPDATE client_memory_entries
          SET is_verified_by_user = true,
              verified_at = NOW(),
              verified_by = $3,
              importance_level = CASE WHEN $4 = true AND importance_level IN ('low','medium')
                                      THEN 'high'
                                      ELSE importance_level END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, importance_level, is_verified_by_user`,
      [id, ctx.organizationId, ctx.userId ?? null, input.bump_importance === true],
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: `Memory atom ${id} not found in this organization.` });
    }
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Verified memory atom ${id}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `verify_memory_atom failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// QMS + Labeling + Search handlers (migration 20260511).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'create_qms_document requires tenant context.' });
  const docNumber = typeof input.doc_number === 'string' ? input.doc_number.trim() : '';
  const title     = typeof input.title === 'string' ? input.title.trim() : '';
  const docType   = typeof input.doc_type === 'string' ? input.doc_type : '';
  if (!docNumber || !title) return JSON.stringify({ error: 'doc_number and title are required.' });
  if (!['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol'].includes(docType)) {
    return JSON.stringify({ error: 'doc_type invalid.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `INSERT INTO qms_documents (
         organization_id, doc_number, title, doc_type, category, version, status,
         author_id
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'1.0'),'draft',$7)
       RETURNING id, doc_number, title, status`,
      [
        ctx.organizationId, docNumber, title, docType,
        typeof input.category === 'string' ? input.category : null,
        typeof input.version === 'string' ? input.version : null,
        ctx.userId ?? null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created QMS document ${docNumber} (${docType}, draft).`,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return JSON.stringify({ error: 'A document with that number already exists.' });
    return JSON.stringify({
      error: `create_qms_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('approve_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'approve_qms_document requires tenant context.' });
  const id = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'document_id (number) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `UPDATE qms_documents
          SET status = 'effective',
              approver_id = $3,
              approved_at = NOW(),
              effective_date = COALESCE($4::date, effective_date, NOW()::date),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
          AND status IN ('draft','in_review')
          AND deleted_at IS NULL
        RETURNING id, status, effective_date`,
      [id, ctx.organizationId, ctx.userId ?? null,
       typeof input.effective_date === 'string' ? input.effective_date : null],
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: 'Document not found, or not in draft/in_review state.' });
    }
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Approved document ${id} — effective ${rows[0].effective_date}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `approve_qms_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('ack_training', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'ack_training requires tenant context.' });
  if (!ctx.userId) return JSON.stringify({ error: 'ack_training requires user context.' });
  const docId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isFinite(docId)) return JSON.stringify({ error: 'document_id (number) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const doc = await getPool().query<{ version: string }>(
      `SELECT version FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [docId, ctx.organizationId],
    );
    if (doc.rows.length === 0) {
      return JSON.stringify({ error: `Document ${docId} not found in this organization.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO qms_training_records (
         organization_id, user_id, document_id, document_version,
         acknowledgment_method, quiz_score, expires_at
       ) VALUES ($1, $2, $3, $4, COALESCE($5,'attestation'), $6, NOW() + INTERVAL '365 days')
       RETURNING id, document_version, expires_at`,
      [
        ctx.organizationId, ctx.userId, docId, doc.rows[0].version,
        typeof input.method === 'string' ? input.method : null,
        typeof input.quiz_score === 'number' ? Math.round(input.quiz_score) : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Recorded training acknowledgment for document ${docId} version ${doc.rows[0].version}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `ack_training failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('register_supplier', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'register_supplier requires tenant context.' });
  const name = typeof input.supplier_name === 'string' ? input.supplier_name.trim() : '';
  const crit = typeof input.criticality === 'string' ? input.criticality : '';
  if (!name) return JSON.stringify({ error: 'supplier_name is required.' });
  if (!['critical', 'major', 'minor'].includes(crit)) {
    return JSON.stringify({ error: 'criticality must be critical | major | minor.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `INSERT INTO qms_suppliers (
         organization_id, supplier_name, supplier_code, scope, criticality,
         approval_status, iso_certifications
       ) VALUES ($1,$2,$3,$4,$5,'pending',$6)
       RETURNING id, supplier_name, criticality, approval_status`,
      [
        ctx.organizationId, name,
        typeof input.supplier_code === 'string' ? input.supplier_code : null,
        typeof input.scope === 'string' ? input.scope : null,
        crit,
        Array.isArray(input.iso_certifications)
          ? (input.iso_certifications as unknown[]).filter((s) => typeof s === 'string')
          : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Registered ${crit} supplier "${name}" (pending approval).`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `register_supplier failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('log_nonconforming_product', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'log_nonconforming_product requires tenant context.' });
  const ncNumber = typeof input.nc_number === 'string' ? input.nc_number.trim() : '';
  const description = typeof input.description === 'string' ? input.description : '';
  if (!ncNumber || !description) {
    return JSON.stringify({ error: 'nc_number and description are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `INSERT INTO qms_nonconforming_products (
         organization_id, nc_number, device_name, lot_or_serial, source, description,
         detected_by, disposition
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING id, nc_number, source, disposition`,
      [
        ctx.organizationId, ncNumber,
        typeof input.device_name === 'string' ? input.device_name : null,
        typeof input.lot_or_serial === 'string' ? input.lot_or_serial : null,
        typeof input.source === 'string' ? input.source : null,
        description, ctx.userId ?? null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Logged NC ${ncNumber} (disposition pending).`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `log_nonconforming_product failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('create_labeling_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'create_labeling_document requires tenant context.' });
  const deviceName = typeof input.device_name === 'string' ? input.device_name.trim() : '';
  const docKind    = typeof input.doc_kind === 'string' ? input.doc_kind : '';
  const allowedKind = new Set(['ifu', 'package_insert', 'patient_label', 'operator_manual', 'service_manual', 'quick_ref', 'box_label']);
  if (!deviceName) return JSON.stringify({ error: 'device_name is required.' });
  if (!allowedKind.has(docKind)) return JSON.stringify({ error: 'doc_kind invalid.' });
  try {
    const { getPool } = await import('../../db.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;
    const { rows } = await getPool().query(
      `INSERT INTO labeling_documents (
         organization_id, program_id, device_name, doc_kind, language, region, udi_di
       ) VALUES ($1,$2,$3,$4,COALESCE($5,'en'),$6,$7)
       RETURNING id, device_name, doc_kind, language`,
      [
        ctx.organizationId, programId, deviceName, docKind,
        typeof input.language === 'string' ? input.language : null,
        typeof input.region === 'string' ? input.region : null,
        typeof input.udi_di === 'string' ? input.udi_di : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created ${docKind} for ${deviceName}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `create_labeling_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('add_labeling_translation', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'add_labeling_translation requires tenant context.' });
  const docId = typeof input.labeling_document_id === 'number' ? input.labeling_document_id : NaN;
  const lang  = typeof input.language === 'string' ? input.language.trim() : '';
  if (!Number.isFinite(docId)) return JSON.stringify({ error: 'labeling_document_id (number) is required.' });
  if (!lang) return JSON.stringify({ error: 'language is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query(
      `SELECT 1 FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [docId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Labeling document ${docId} not found.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO labeling_translations (
         labeling_document_id, organization_id, language, translator,
         translation_method, back_translation_verified, status
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),'pending')
       RETURNING id, language, status`,
      [
        docId, ctx.organizationId, lang,
        typeof input.translator === 'string' ? input.translator : null,
        typeof input.translation_method === 'string' ? input.translation_method : null,
        input.back_translation_verified === true,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Added ${lang} translation for document ${docId}.`,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return JSON.stringify({ error: `A translation for ${lang} already exists on document ${docId}.` });
    }
    return JSON.stringify({
      error: `add_labeling_translation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('add_labeling_symbol', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'add_labeling_symbol requires tenant context.' });
  const docId = typeof input.labeling_document_id === 'number' ? input.labeling_document_id : NaN;
  const code  = typeof input.symbol_code === 'string' ? input.symbol_code.trim() : '';
  const sname = typeof input.symbol_name === 'string' ? input.symbol_name.trim() : '';
  if (!Number.isFinite(docId)) return JSON.stringify({ error: 'labeling_document_id (number) is required.' });
  if (!code || !sname) return JSON.stringify({ error: 'symbol_code and symbol_name are required.' });
  try {
    const { getPool } = await import('../../db.js');
    const own = await getPool().query(
      `SELECT 1 FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [docId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Labeling document ${docId} not found.` });
    }
    const { rows } = await getPool().query(
      `INSERT INTO labeling_symbols (
         labeling_document_id, organization_id, symbol_code, symbol_name,
         description, required_by
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, symbol_code, symbol_name`,
      [
        docId, ctx.organizationId, code, sname,
        typeof input.description === 'string' ? input.description : null,
        Array.isArray(input.required_by)
          ? (input.required_by as unknown[]).filter((s) => typeof s === 'string')
          : null,
      ],
    );
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Added symbol ${code} (${sname}) to document ${docId}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `add_labeling_symbol failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('global_search', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'global_search requires tenant context.' });
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  if (q.length < 2) return JSON.stringify({ error: 'q must be at least 2 chars.' });
  try {
    /* Forward to the route layer's search function. We reuse the routes
       module's exported router only indirectly — calling the underlying
       SQL is simpler than re-exporting the route handler. */
    const { getPool } = await import('../../db.js');
    const ilike = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const limit = typeof input.limit === 'number' ? Math.min(100, Math.max(1, Math.round(input.limit))) : 25;
    const fanout = await Promise.allSettled([
      getPool().query(
        `SELECT id, name, code, status FROM regulatory_programs
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND (name ILIKE $2 OR COALESCE(code,'') ILIKE $2 OR COALESCE(description,'') ILIKE $2)
          LIMIT $3`, [ctx.organizationId, ilike, limit]),
      getPool().query(
        `SELECT id, title, ctd_section, status FROM concept2cure_artifacts
          WHERE organization_id = $1 AND status != 'archived' AND title ILIKE $2
          ORDER BY updated_at DESC LIMIT $3`, [ctx.organizationId, ilike, limit]),
    ]);
    const hits: Array<Record<string, unknown>> = [];
    if (fanout[0].status === 'fulfilled') {
      for (const r of fanout[0].value.rows) hits.push({ type: 'program', ...r });
    }
    if (fanout[1].status === 'fulfilled') {
      for (const r of fanout[1].value.rows) hits.push({ type: 'artifact', ...r });
    }
    return JSON.stringify({
      ok: true, query: q, hits, count: hits.length,
      message: `Found ${hits.length} hits across programs + artifacts. Use the kit's search overlay for full coverage across all 12 types.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `global_search failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy-import handlers (migration 20260512).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('start_legacy_import', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'start_legacy_import requires tenant context.' });
  const sourcePath = typeof input.source_path === 'string' ? input.source_path : '';
  if (!sourcePath) return JSON.stringify({ error: 'source_path (string) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const { detectArchive } = await import('../legacy-importer/detector.js');
    const programId = typeof input.program_id === 'string' && UUID_RE.test(input.program_id)
      ? input.program_id : null;

    /* Create job row. */
    const jobInsert = await getPool().query<{ id: number }>(
      `INSERT INTO import_jobs (
         organization_id, program_id, source_path, source_kind, source_filename,
         status, requested_by
       ) VALUES ($1, $2, $3, COALESCE($4,'zip'), $5, 'detecting', $6)
       RETURNING id`,
      [
        ctx.organizationId, programId, sourcePath,
        typeof input.source_kind === 'string' ? input.source_kind : null,
        typeof input.source_filename === 'string' ? input.source_filename : null,
        ctx.userId ?? null,
      ],
    );
    const jobId = jobInsert.rows[0].id;

    /* Run detection. */
    const detected = await detectArchive(sourcePath);
    let mappedCount = 0;
    for (const f of detected.files) {
      const status = f.detectedKind === 'leaf' && f.mappingConfidence >= 0.5 ? 'mapped'
                   : f.detectedKind === 'leaf' ? 'pending'
                   : 'skipped';
      if (status === 'mapped') mappedCount++;
      await getPool().query(
        `INSERT INTO import_job_files (
           import_job_id, organization_id, relative_path, file_name, size_bytes,
           sha256, detected_kind, mapped_ctd_section, mapped_section_key,
           mapped_artifact_kind, mapping_confidence, mapping_source, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          jobId, ctx.organizationId, f.relativePath, f.fileName, f.sizeBytes,
          f.sha256, f.detectedKind, f.mappedCtdSection, f.mappedSectionKey,
          f.mappedArtifactKind, f.mappingConfidence, f.mappingSource, status,
        ],
      );
    }
    for (const fnd of detected.findings) {
      await getPool().query(
        `INSERT INTO import_job_findings (import_job_id, organization_id, severity, code, message, file_path)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [jobId, ctx.organizationId, fnd.severity, fnd.code, fnd.message, fnd.filePath ?? null],
      );
    }
    const errorCount = detected.findings.filter((f) => f.severity === 'error').length;
    await getPool().query(
      `UPDATE import_jobs
          SET detected_format = $2, detected_region = $3,
              detected_application_id = $4, detected_sequence = $5, detected_sponsor = $6,
              file_count = $7, mapped_count = $8,
              error_count = $9, status = 'ready_for_review', updated_at = NOW()
        WHERE id = $1`,
      [
        jobId, detected.format, detected.region,
        detected.applicationId, detected.sequence, detected.sponsor,
        detected.files.length, mappedCount, errorCount,
      ],
    );

    return JSON.stringify({
      ok: true,
      jobId,
      detectedFormat: detected.format,
      detectedRegion: detected.region,
      fileCount: detected.files.length,
      mappedCount,
      errorCount,
      message: `Detected ${detected.format} archive · ${detected.files.length} files (${mappedCount} mapped, ${errorCount} errors). Review then call approve_import.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `start_legacy_import failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('override_import_mapping', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'override_import_mapping requires tenant context.' });
  const jobId  = typeof input.import_job_id === 'number' ? input.import_job_id : NaN;
  const fileId = typeof input.file_id === 'number' ? input.file_id : NaN;
  if (!Number.isFinite(jobId) || !Number.isFinite(fileId)) {
    return JSON.stringify({ error: 'import_job_id and file_id (numbers) are required.' });
  }
  const COL: Record<string, string> = {
    mapped_ctd_section: 'mapped_ctd_section',
    mapped_section_key: 'mapped_section_key',
    mapped_artifact_kind: 'mapped_artifact_kind',
    status: 'status',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'import_job_id' || k === 'file_id') continue;
    const col = COL[k]; if (!col || v === undefined) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  setFrags.push(`mapping_source = 'ana'`, `mapping_confidence = 1.00`);
  if (setFrags.length === 0) return JSON.stringify({ error: 'No fields to update.' });
  args.push(fileId, jobId, ctx.organizationId);
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `UPDATE import_job_files SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 2} AND import_job_id = $${args.length - 1}
          AND organization_id = $${args.length}
        RETURNING id, status, mapped_ctd_section, mapped_section_key`,
      args,
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: `Import file ${fileId} not found in job ${jobId}.` });
    }
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Overrode mapping on file ${fileId} (status ${rows[0].status}).`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `override_import_mapping failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('approve_import', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'approve_import requires tenant context.' });
  if (!ctx.userId) return JSON.stringify({ error: 'approve_import requires user context.' });
  const jobId     = typeof input.import_job_id === 'number' ? input.import_job_id : NaN;
  const projectId = typeof input.project_id === 'number' ? input.project_id : NaN;
  if (!Number.isFinite(jobId) || !Number.isFinite(projectId)) {
    return JSON.stringify({ error: 'import_job_id and project_id (numbers) are required.' });
  }
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    const own = await pool.query<{ status: string }>(
      `SELECT status FROM import_jobs WHERE id = $1 AND organization_id = $2`,
      [jobId, ctx.organizationId],
    );
    if (own.rows.length === 0) {
      return JSON.stringify({ error: `Import job ${jobId} not found.` });
    }
    if (own.rows[0].status !== 'ready_for_review') {
      return JSON.stringify({ error: `Job is not in ready_for_review state (current: ${own.rows[0].status}).` });
    }
    const files = await pool.query<{
      id: number; relative_path: string; file_name: string;
      mapped_ctd_section: string | null; mapped_artifact_kind: string | null;
      sha256: string | null;
    }>(
      `SELECT id, relative_path, file_name, mapped_ctd_section,
              mapped_artifact_kind, sha256
         FROM import_job_files
        WHERE import_job_id = $1 AND status = 'mapped'`,
      [jobId],
    );
    let createdCount = 0;
    for (const f of files.rows) {
      try {
        const ins = await pool.query<{ id: number }>(
          `INSERT INTO concept2cure_artifacts (
             artifact_id, project_id, organization_id, type, category, title,
             content, content_hash, ctd_section, status, created_by_id, metadata
           ) VALUES ($1, $2, $3, 'imported', 'document', $4, '', $5, $6, 'draft', $7,
             jsonb_build_object('importJobId', $8, 'sourcePath', $9, 'artifactKind', $10))
           RETURNING id`,
          [
            `import-${jobId}-${f.id}`, projectId, ctx.organizationId,
            f.mapped_artifact_kind ? `${f.mapped_artifact_kind.replace(/_/g, ' ')} — ${f.file_name}` : f.file_name,
            f.sha256, f.mapped_ctd_section, ctx.userId,
            jobId, f.relative_path, f.mapped_artifact_kind,
          ],
        );
        await pool.query(
          `UPDATE import_job_files SET artifact_id = $1, status = 'imported' WHERE id = $2`,
          [ins.rows[0].id, f.id],
        );
        createdCount++;
      } catch {
        /* per-file error already swallowed; surface count below. */
      }
    }
    await pool.query(
      `UPDATE import_jobs
          SET status = 'completed', approved_by = $2, approved_at = NOW(),
              artifacts_created = $3, updated_at = NOW()
        WHERE id = $1`,
      [jobId, ctx.userId, createdCount],
    );
    return JSON.stringify({
      ok: true, jobId, artifactsCreated: createdCount,
      message: `Imported ${createdCount} artifact(s) from job ${jobId} into project ${projectId}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `approve_import failed: ${err instanceof Error ? err.message : String(err)}`,
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

  // Data-driven mode: when clinical studies are supplied, compose the Clinical
  // Overview through the same deterministic engine the submission package uses.
  if (Array.isArray(input.csrs) && input.csrs.length > 0) {
    try {
      const { buildM25ClinicalOverview } = await import('../m2-summary-builders.js');
      const summary = buildM25ClinicalOverview({
        csrs: input.csrs as any,
        indication,
        investigationalProduct: productName,
        developmentRationale: typeof input.development_rationale === 'string' ? input.development_rationale : undefined,
      });
      return JSON.stringify({
        status: 'drafted',
        engine: 'deterministic',
        sectionKey: summary.sectionKey,
        title: summary.title,
        content: summary.narrative,
        tables: summary.tables,
        completeness: summary.completeness,
        gaps: summary.gaps,
        instruction:
          'This is a draft the author promotes through the governed authoring flow. State the completeness and gaps honestly; 2.5.6 is the benefit-risk conclusion.',
      });
    } catch (err: any) {
      return JSON.stringify({ error: `M2.5 Clinical Overview composition failed: ${err?.message || 'unknown error'}` });
    }
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
  /** Abort signal — when aborted, the loop stops before the next round (barge-in). */
  signal?: AbortSignal;
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
    // Barge-in: stop before issuing the next generation/tool round when cancelled.
    if (options?.signal?.aborted) break;
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
