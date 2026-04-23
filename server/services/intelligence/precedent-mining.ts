/**
 * Precedent Mining Service
 *
 * Regulatory professionals routinely ground their work in precedent: how did
 * recently approved drugs frame their Module 2.5? Which 510(k) predicates
 * carried language that survived FDA review? What safety framing did CHMP
 * accept for the last three SGLT2 inhibitors?
 *
 * This service gives AnA a first-class way to construct precedent searches
 * across the canonical public databases (Drugs@FDA, EMA EPARs, FDA 510(k)
 * database, EU MDR CE marks via EUDAMED). The tool returns structured search
 * guidance — URLs, queries, and what to look for — so that either:
 *
 *   a) The regulatory author can follow the links manually, or
 *   b) AnA's `web_search` tool (when enabled) can execute the queries
 *      against the allowlisted regulatory domains and return actual
 *      precedent content.
 *
 * The service deliberately does NOT ship a hardcoded precedent corpus.
 * Regulatory precedent is time-sensitive (post-market safety signals,
 * approval withdrawals, new guidance) and any baked-in corpus would rot.
 * Instead, AnA gets disciplined query construction against live sources.
 *
 * @module server/services/intelligence/precedent-mining
 */

export type PrecedentDocumentType =
  // Drug / biologic
  | 'clinical_overview'        // Module 2.5
  | 'clinical_summary'          // Module 2.7
  | 'quality_overall_summary'   // Module 2.3
  | 'nonclinical_overview'      // Module 2.4
  | 'ind_briefing_document'
  | 'nda_response'              // Response to CRL / information request
  | 'labeling'                  // USPI / EU SmPC
  // Device
  | '510k_substantial_equivalence'
  | 'pma_ssed'
  | 'de_novo_classification'
  | 'clinical_evaluation_report'  // EU MDR CER
  | 'ivdr_technical_file'
  // Cross-cutting
  | 'risk_management_plan'
  | 'pediatric_investigation_plan'
  | 'breakthrough_designation_request'
  | 'fast_track_request';

export type RegulatoryDatabase =
  | 'drugs_fda'           // FDA approved drug products
  | 'purple_book'         // FDA approved biologics
  | 'orange_book'         // FDA approved generic drugs
  | 'fda_510k'            // FDA 510(k) clearance database
  | 'fda_pma'             // FDA PMA approvals
  | 'fda_de_novo'         // FDA De Novo classifications
  | 'fda_guidance_search' // Search FDA guidance documents
  | 'fda_warning_letters' // FDA warning letters database
  | 'ema_medicines'       // EMA European public assessment reports
  | 'ema_guidelines'      // EMA scientific guidelines
  | 'pmda_reviews'        // PMDA review reports
  | 'eudamed'             // EU device database
  | 'clinicaltrials_gov'  // ClinicalTrials.gov registrations
  | 'pubmed'              // PubMed / MEDLINE
  | 'ecfr'                // Electronic Code of Federal Regulations
  | 'ich_org';            // ICH guideline repository

export interface PrecedentSearchSpec {
  readonly database: RegulatoryDatabase;
  readonly baseUrl: string;
  /** Human-readable name of the database for display. */
  readonly databaseLabel: string;
  /** Either a constructed search URL or a guidance string for navigating the site. */
  readonly searchUrl?: string;
  /** A web_search-style query string for use with Anthropic's web_search tool. */
  readonly webSearchQuery?: string;
  /** What to look for in each result. */
  readonly whatToLookFor: readonly string[];
}

export interface PrecedentMiningResult {
  readonly documentType: PrecedentDocumentType;
  readonly searchContext: string;
  readonly generatedAt: string;
  readonly searches: readonly PrecedentSearchSpec[];
  readonly guidance: string;
  readonly webSearchReady: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CATALOG — URL templates and search behaviors
// ─────────────────────────────────────────────────────────────────────────────

const DATABASE_CATALOG: Record<
  RegulatoryDatabase,
  { baseUrl: string; label: string; searchTemplate?: (q: string) => string }
> = {
  drugs_fda: {
    baseUrl: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
    label: 'Drugs@FDA',
    searchTemplate: q => `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=BasicSearch.process&searchTerm=${encodeURIComponent(q)}`,
  },
  purple_book: {
    baseUrl: 'https://purplebooksearch.fda.gov/',
    label: 'FDA Purple Book (Biologics)',
    searchTemplate: q => `https://purplebooksearch.fda.gov/results?query=${encodeURIComponent(q)}`,
  },
  orange_book: {
    baseUrl: 'https://www.accessdata.fda.gov/scripts/cder/ob/',
    label: 'FDA Orange Book (Generics)',
  },
  fda_510k: {
    baseUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm',
    label: 'FDA 510(k) Premarket Notification',
    searchTemplate: q => `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?start_search=1&Center=&Panel=&ProductCode=&KNumber=&Applicant=${encodeURIComponent(q)}`,
  },
  fda_pma: {
    baseUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm',
    label: 'FDA PMA Approvals',
  },
  fda_de_novo: {
    baseUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm',
    label: 'FDA De Novo Classifications',
  },
  fda_guidance_search: {
    baseUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
    label: 'FDA Guidance Document Search',
    searchTemplate: q => `https://www.fda.gov/regulatory-information/search-fda-guidance-documents?search=${encodeURIComponent(q)}`,
  },
  fda_warning_letters: {
    baseUrl: 'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters',
    label: 'FDA Warning Letters',
  },
  ema_medicines: {
    baseUrl: 'https://www.ema.europa.eu/en/medicines',
    label: 'EMA Medicines (EPARs)',
    searchTemplate: q => `https://www.ema.europa.eu/en/medicines/search_api_fulltext=${encodeURIComponent(q)}`,
  },
  ema_guidelines: {
    baseUrl: 'https://www.ema.europa.eu/en/human-regulatory-overview/research-and-development/scientific-guidelines',
    label: 'EMA Scientific Guidelines',
  },
  pmda_reviews: {
    baseUrl: 'https://www.pmda.go.jp/english/review-services/reviews/approved-information/0001.html',
    label: 'PMDA Review Reports',
  },
  eudamed: {
    baseUrl: 'https://ec.europa.eu/tools/eudamed/',
    label: 'EUDAMED (EU Medical Devices)',
  },
  clinicaltrials_gov: {
    baseUrl: 'https://clinicaltrials.gov/',
    label: 'ClinicalTrials.gov',
    searchTemplate: q => `https://clinicaltrials.gov/search?cond=${encodeURIComponent(q)}`,
  },
  pubmed: {
    baseUrl: 'https://pubmed.ncbi.nlm.nih.gov/',
    label: 'PubMed',
    searchTemplate: q => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`,
  },
  ecfr: {
    baseUrl: 'https://www.ecfr.gov/',
    label: 'Electronic Code of Federal Regulations',
  },
  ich_org: {
    baseUrl: 'https://www.ich.org/page/ich-guidelines',
    label: 'ICH Guidelines',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PLANS — per document type
// ─────────────────────────────────────────────────────────────────────────────

function buildSearchPlan(
  documentType: PrecedentDocumentType,
  searchContext: string,
): PrecedentSearchSpec[] {
  const plans: Record<PrecedentDocumentType, () => PrecedentSearchSpec[]> = {
    clinical_overview: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        searchUrl: DATABASE_CATALOG.drugs_fda.searchTemplate?.(searchContext),
        webSearchQuery: `site:accessdata.fda.gov "Clinical Overview" ${searchContext} approval package`,
        whatToLookFor: [
          'Module 2.5 Clinical Overview section structure in the approved labeling/review docs',
          'How the sponsor framed product development rationale (benefit-risk logic)',
          'Efficacy section — which endpoints were emphasized, how subgroup consistency was addressed',
          'Safety framing — which known class effects were acknowledged upfront',
          'The FDA Medical Review document (if available) — reviewer comments reveal what worked',
        ],
      },
      {
        database: 'ema_medicines',
        baseUrl: DATABASE_CATALOG.ema_medicines.baseUrl,
        databaseLabel: DATABASE_CATALOG.ema_medicines.label,
        searchUrl: DATABASE_CATALOG.ema_medicines.searchTemplate?.(searchContext),
        webSearchQuery: `site:ema.europa.eu EPAR "Clinical aspects" ${searchContext}`,
        whatToLookFor: [
          'EPAR "Clinical aspects" section — parallels FDA Module 2.5',
          'CHMP rapporteur and co-rapporteur comments',
          'How multi-regional bridging and ethnic factors (ICH E5) were addressed',
          'Benefit-risk conclusion language that CHMP accepted',
        ],
      },
    ],
    clinical_summary: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        searchUrl: DATABASE_CATALOG.drugs_fda.searchTemplate?.(searchContext),
        webSearchQuery: `site:accessdata.fda.gov "Summary of Clinical Efficacy" OR "Summary of Clinical Safety" ${searchContext}`,
        whatToLookFor: [
          'Module 2.7.3 and 2.7.4 structure from approved labeling / FDA review',
          'Integrated analyses (ISS/ISE) framing',
          'Handling of missing data and sensitivity analyses',
        ],
      },
    ],
    quality_overall_summary: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        webSearchQuery: `site:accessdata.fda.gov "Quality Overall Summary" ${searchContext} chemistry review`,
        whatToLookFor: [
          'Module 2.3 QOS structure — drug substance + drug product integrated',
          'Control strategy presentation',
          'How specifications were justified via ICH Q6A/Q6B logic',
          'Post-approval change strategy (ICH Q12 lifecycle) if present',
        ],
      },
    ],
    nonclinical_overview: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        webSearchQuery: `site:accessdata.fda.gov "Pharmacology/Toxicology" review ${searchContext}`,
        whatToLookFor: [
          'Module 2.4 integration of pharmacology, PK, toxicology',
          'Dose selection rationale linking NOAEL → MRSD → clinical starting dose',
          'Carcinogenicity and repro-tox framing',
        ],
      },
    ],
    ind_briefing_document: () => [
      {
        database: 'fda_guidance_search',
        baseUrl: DATABASE_CATALOG.fda_guidance_search.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_guidance_search.label,
        searchUrl: DATABASE_CATALOG.fda_guidance_search.searchTemplate?.('pre-IND meeting'),
        webSearchQuery: `site:fda.gov "pre-IND meeting" briefing document template ${searchContext}`,
        whatToLookFor: [
          'Example question framing — yes/no decision-oriented, not open-ended',
          'Sponsor position structure',
          'Typical 5-7 question scope for effective Type B meetings',
        ],
      },
    ],
    nda_response: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        webSearchQuery: `site:accessdata.fda.gov "Complete Response Letter" OR "CRL" response ${searchContext}`,
        whatToLookFor: [
          'Point-by-point response structure',
          'How the sponsor framed new data vs reanalysis of existing data',
          'Timeline from CRL to resubmission to approval (signals for FDA comfort level)',
        ],
      },
    ],
    labeling: () => [
      {
        database: 'drugs_fda',
        baseUrl: DATABASE_CATALOG.drugs_fda.baseUrl,
        databaseLabel: DATABASE_CATALOG.drugs_fda.label,
        searchUrl: DATABASE_CATALOG.drugs_fda.searchTemplate?.(searchContext),
        webSearchQuery: `site:accessdata.fda.gov prescribing information ${searchContext}`,
        whatToLookFor: [
          'USPI Highlights section',
          'Indications and Usage exact wording (informs strategic framing)',
          'Boxed Warning presence and how the sponsor may have avoided one',
          'Dose adjustment language for special populations',
        ],
      },
    ],
    '510k_substantial_equivalence': () => [
      {
        database: 'fda_510k',
        baseUrl: DATABASE_CATALOG.fda_510k.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_510k.label,
        searchUrl: DATABASE_CATALOG.fda_510k.searchTemplate?.(searchContext),
        webSearchQuery: `site:accessdata.fda.gov 510(k) substantial equivalence ${searchContext}`,
        whatToLookFor: [
          'Predicate selection — how the sponsor chose among multiple predicates',
          'Intended use comparison — identical vs with documented delta',
          'Technological characteristics table structure',
          'Performance data summary — which consensus standards were referenced',
        ],
      },
    ],
    pma_ssed: () => [
      {
        database: 'fda_pma',
        baseUrl: DATABASE_CATALOG.fda_pma.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_pma.label,
        webSearchQuery: `site:accessdata.fda.gov PMA SSED ${searchContext}`,
        whatToLookFor: [
          'SSED structure per CDRH guidance',
          'Primary endpoint pre-specification language',
          'Adverse device effect disclosure — how unfavorable subgroup results were framed',
          'Post-approval study (PAS) commitments',
        ],
      },
    ],
    de_novo_classification: () => [
      {
        database: 'fda_de_novo',
        baseUrl: DATABASE_CATALOG.fda_de_novo.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_de_novo.label,
        webSearchQuery: `site:accessdata.fda.gov "De Novo" classification ${searchContext}`,
        whatToLookFor: [
          'Classification rationale — why the device is novel',
          'Special controls proposed and accepted',
          'Risk-benefit framing against the novel-device standard',
        ],
      },
    ],
    clinical_evaluation_report: () => [
      {
        database: 'ema_medicines',
        baseUrl: DATABASE_CATALOG.ema_medicines.baseUrl,
        databaseLabel: DATABASE_CATALOG.ema_medicines.label,
        webSearchQuery: `"Clinical Evaluation Report" OR "CER" EU MDR MDCG 2020-13 ${searchContext}`,
        whatToLookFor: [
          'CER structure per MEDDEV 2.7/1 Rev 4 / MDCG 2020-13',
          'State-of-the-art definition with cited guidance and standards',
          'Literature appraisal methodology (GRADE-style)',
          'Equivalence claims per MDCG 2020-5 (rare post-MDR)',
          'PMCF plan specificity',
        ],
      },
    ],
    ivdr_technical_file: () => [
      {
        database: 'eudamed',
        baseUrl: DATABASE_CATALOG.eudamed.baseUrl,
        databaseLabel: DATABASE_CATALOG.eudamed.label,
        webSearchQuery: `IVDR "Technical Documentation" Annex II III ${searchContext}`,
        whatToLookFor: [
          'Scientific validity, analytical performance, clinical performance sections',
          'Performance Evaluation Report (PER) structure',
          'Risk management file integration',
        ],
      },
    ],
    risk_management_plan: () => [
      {
        database: 'ema_medicines',
        baseUrl: DATABASE_CATALOG.ema_medicines.baseUrl,
        databaseLabel: DATABASE_CATALOG.ema_medicines.label,
        webSearchQuery: `site:ema.europa.eu "Risk Management Plan" RMP ${searchContext}`,
        whatToLookFor: [
          'Safety concerns identification (important identified, important potential, missing)',
          'Risk minimization measures — routine vs additional',
          'Pharmacovigilance plan — routine + additional studies',
        ],
      },
    ],
    pediatric_investigation_plan: () => [
      {
        database: 'ema_medicines',
        baseUrl: DATABASE_CATALOG.ema_medicines.baseUrl,
        databaseLabel: DATABASE_CATALOG.ema_medicines.label,
        webSearchQuery: `site:ema.europa.eu PIP "Paediatric Investigation Plan" ${searchContext}`,
        whatToLookFor: [
          'Condition-specific PIP structure',
          'Waiver and deferral requests with rationale',
          'Key binding measures accepted by the PDCO',
        ],
      },
    ],
    breakthrough_designation_request: () => [
      {
        database: 'fda_guidance_search',
        baseUrl: DATABASE_CATALOG.fda_guidance_search.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_guidance_search.label,
        searchUrl: DATABASE_CATALOG.fda_guidance_search.searchTemplate?.('Breakthrough Therapy'),
        webSearchQuery: `FDA "Breakthrough Therapy Designation" request template ${searchContext}`,
        whatToLookFor: [
          'Preliminary clinical evidence framing',
          'Substantial improvement vs available therapies argument',
          'Serious condition definition supporting eligibility',
        ],
      },
    ],
    fast_track_request: () => [
      {
        database: 'fda_guidance_search',
        baseUrl: DATABASE_CATALOG.fda_guidance_search.baseUrl,
        databaseLabel: DATABASE_CATALOG.fda_guidance_search.label,
        searchUrl: DATABASE_CATALOG.fda_guidance_search.searchTemplate?.('Fast Track'),
        webSearchQuery: `FDA "Fast Track" request ${searchContext}`,
        whatToLookFor: [
          'Unmet medical need framing',
          'Nonclinical/clinical data supporting potential',
          'Development plan showing how Fast Track benefits will be used',
        ],
      },
    ],
  };

  const builder = plans[documentType];
  return builder ? builder() : [];
}

function buildGuidance(documentType: PrecedentDocumentType, searchContext: string): string {
  const preamble = `Precedent mining for ${documentType.replace(/_/g, ' ')} in the context of "${searchContext}". Three operating principles:`;
  const principles = [
    "1. **Recency matters.** Prefer precedents approved in the last 3-5 years. Regulatory expectations drift; a 2015 approval may predate the current standard on endpoints, safety framing, or risk language.",
    "2. **Read the reviewer document if available.** FDA Medical Reviews and Statistical Reviews (on Drugs@FDA) and CHMP EPARs show what the agency actually said — more informative than the sponsor's labeling alone.",
    "3. **Precedent is calibration, not template.** Match the register and structural choices; do not paste prose. Every submission's data, therapy, and context are unique, and reviewer questions will follow from those specifics.",
  ];
  return `${preamble}\n\n${principles.join('\n\n')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function minePrecedents(params: {
  documentType: PrecedentDocumentType;
  searchContext: string;
}): PrecedentMiningResult {
  const { documentType, searchContext } = params;
  const searches = buildSearchPlan(documentType, searchContext);
  const guidance = buildGuidance(documentType, searchContext);
  return {
    documentType,
    searchContext,
    generatedAt: new Date().toISOString(),
    searches,
    guidance,
    webSearchReady: process.env.ANA_ENABLE_WEB_SEARCH === 'true',
  };
}
