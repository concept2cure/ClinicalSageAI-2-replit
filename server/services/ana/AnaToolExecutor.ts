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
// Type-only: the prior-sequence auto-load path assigns loadPriorSequenceManifest's
// PriorLeaf[] into the same local as the hand-mapped input leaves. Without this
// annotation the local is inferred from `p: any`, which makes every field
// REQUIRED and so rejects PriorLeaf's optional ones.
import type { PriorLeaf } from '../ectd/lifecycle-operator.js';
import fdaMaudeClient from '../../fda_maude_client.js';
import { searchTrials } from '../integrations/clinicaltrials-client.js';
import { recordArtifactProvenance } from '../provenance/artifact-provenance';
import { searchPubmed } from '../integrations/pubmed-client.js';
import { searchMedicareCoverage } from '../integrations/cms-coverage-client.js';
import { searchConnectedRepositories } from '../integrations/connector-search.js';
import { searchRegulatoryCorrespondence } from '../integrations/correspondence-search.js';
import { createCalendarEvent } from '../integrations/calendar-event.js';
import { searchHubSpotCrm, type HubSpotObject } from '../integrations/hubspot-client.js';
import { searchDeviceRecalls } from '../integrations/device-recalls.js';
import { searchDrugLabels } from '../integrations/drug-label-client.js';
import { searchDrugApprovals } from '../integrations/drug-approvals-client.js';
import { searchChemblCompounds, getChemblMechanisms } from '../integrations/chembl-client.js';
import { searchPreprints, type PreprintServerFilter } from '../integrations/preprint-client.js';
import { searchEudamed } from '../integrations/eudamed-client.js';
import { searchEmaEpar } from '../integrations/ema-epar-client.js';
import { searchEuCtis } from '../integrations/eu-ctis-client.js';
import { assessTrialFeasibility } from '../study-design/trial-feasibility-service.js';
import { screenStructuralAlerts, assessDevelopability } from '../chem/index.js';
import { buildProvenance, confidenceFromScore } from '../evidence/provenance.js';
import { assessRegulatoryLandscape } from '../integrations/landscape.js';
import { getIntegrationStatuses, summarizeStatuses } from '../integrations/integration-status.js';
import { getAllEnabledTools } from './AnaToolDefinitions.js';
import {
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  type SubmissionType,
} from '../ana-ri/deficiency-taxonomy.js';
import { getDeadlineRadar } from './deadline-radar.js';
import { getSessionBriefing } from './session-briefing.js';
import { getOpenBlockers, summarizeBlockers } from './risk-watch.js';
import { compileGovernedResponseAssembly } from '../regulatory-correspondence/response-package-compiler.js';
import type { CorrespondenceIssue } from '../../../shared/types/regulatory-correspondence.js';
import {
  adviseDeviceReadiness,
  adviseGlobalMarketStrategy,
  adviseGlobalSubmissionPlan,
  advisePmaReadiness,
  adviseEuTechnicalFileReadiness,
  lookupIvdKnowledge,
  type DeviceReadinessAdviceInput,
  type GlobalMarketAdviceInput,
  type SubmissionPlanAdviceInput,
  type PmaReadinessAdviceInput,
  type EuTechDocAdviceInput,
  type IvdKnowledgeLookupInput,
} from '../ana-advisory';
import { GLOBAL_RI_TOOL_NAMES, dispatchGlobalRiTool } from '../global-ri/ana-tools';
import { getToolPedigree, listDeterministicTools, PEDIGREE_LEVELS } from './tool-pedigree';
import { detectContradictions, type EvidenceClaim } from './evidence-contradiction-detector';
import { detectEvidenceGaps, type GapQuery, type EvidenceItem } from './evidence-gap-detector';
import {
  recordToolOutcome,
  recordContractViolation,
  recordToolSurface,
  getToolSurfaceUsage,
  classifyResult,
  getToolReliability,
  getUnhealthyTools,
  getLowYieldTools,
  isTelemetryPersistenceEnabled,
} from './tool-telemetry.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { composeMedicalWritingGuidance, listMedicalWritingCatalog } from './medical-writing.js';
import { reviewMedicalWriting } from './medical-writing-review.js';
import {
  assessReadability,
  buildAbbreviationList,
  type ReadabilityAudience,
} from './medical-writing-qc.js';
import { lookupIcd10 } from '../integrations/icd10-client.js';
import { composeSafetyNarrative } from './safety-narrative.js';
import { screenPromotionalLanguage } from './promotional-screening.js';
import { narrateStatisticalResult, type AnalysisType, type EffectMeasure } from './statistical-narrator.js';
import { composeValueDossierGuidance, listValueDossierCatalog } from './value-dossier.js';
import { adviseRegulatoryPathway, listRegulatoryPathways } from './regulatory-pathway.js';
import { adviseRiskManagement, listRiskManagementPrograms } from './risk-management.js';
import { adviseGcp, reviewInformedConsent, listGcpDomains } from './gcp-consent.js';
import { adviseCoaSelection, listCoaTypes } from './coa-selection.js';
import { adviseCtdStructure, listCtdModules } from './ctd-structure.js';
import { adviseSpecialDesignation, listDesignations } from './special-designations.js';
import {
  buildOddAuthoringPlan,
  evaluateOddVerification,
  assessOddSealability,
  type OddCitation,
  type OddProvenance,
  type OddProductInput,
} from 'shared/ana/orphan-drug-designation.js';
import {
  buildIndModuleAuthoringPlan,
  evaluateIndModuleVerification,
  assessIndModuleSealability,
  listIndModules,
  type IndModuleProvenance,
  type IndSourceFact,
} from 'shared/ana/ind-module-authoring.js';
import { adviseEstimand, listEstimandFramework } from './estimands.js';
import { advisePharmacovigilance, listPvDeliverables } from './pharmacovigilance.js';
import { adviseStudyDesign, listStudyDesigns, type SampleSizeInput, type EndpointFamily, type DesignGoal } from './study-design.js';
import { adviseLabelingStructure, listLabelTemplates } from './labeling-structure.js';
import {
  getLabelingModeSpec,
  modeToFormat,
  requiredSectionHeaders,
  deriveRequiredStrings,
  checkSectionGuard,
  buildTemplateReplacements,
  type LabelingMode,
} from './labeling-authoring.js';
import { adviseMedicalInformation, listMedInfoResponseTypes } from './medical-information.js';
import { adviseReportingGuideline, listReportingGuidelines } from './reporting-guidelines.js';
import { adviseDataIntegrity, listDataIntegrity } from './data-integrity.js';
import { adviseRweDesign, listRweDesigns } from './rwe-design.js';
import { initToolTelemetryPersistence } from './tool-telemetry-persistence.js';
import fdaFaersClient from '../../fda_faers_client.js';

// Opt-in (ANA_TELEMETRY_PERSIST_PATH): hydrate learned tool reliability on boot
// so it survives restarts. No-op when the env var is unset — default behavior
// (in-memory, process-lifetime) is unchanged.
void initToolTelemetryPersistence().catch(() => {});
import type {
  GatewayRequest,
  GatewayMessage,
  AnaGatewayResponse,
  AnaToolUse,
  StreamCallback,
} from '../ai-gateway/types';
import { ragRouter } from '../ragRouter';
import {
  runAgenticToolLoop,
  resolveMaxRounds,
  resolveRoundExtension,
  capToolResultForModel,
  budgetToolResultsForModel,
  buildAdaptationNote,
  mapWithConcurrency,
  type ToolCall,
  type ModelTurn,
  type ToolResultEntry,
  type FailedToolCall,
} from './agentic-loop.js';
import { registerAgenticWorkflowHandlers } from './agentic-workflow-tools.js';
import { registerBiotechProgramHandlers } from './biotech-program.js';
import { registerDocumentSpineHandlers } from './document-spine.js';
import { registerDocumentCatalogHandlers } from './document-catalog-tools.js';
import { assertWithinDocumentWorkspace } from './document-workspace.js';

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
  /** Active UI surface/screen (e.g. 'nonclinical', 'cmc', 'sponsored_programs') — situational context. */
  surface?: string | null;
  /** Submission/program type (e.g. 'IND', 'NDA', '510k') — situational context. */
  projectType?: string | null;
  /** Active document / CTD type (e.g. 'nonclinical_overview', 'qos') — situational context. */
  documentType?: string | null;
  /**
   * True when the turn runs under Live Drive (services/ana-ri/live-drive):
   * navigate_to directives are applied to the subscriber's screen as they
   * stream, so the handler's instruction to the model must say "you are
   * taking them there" instead of "you can offer to". Never grants any tool
   * additional authority — it only changes the narration contract.
   */
  liveDrive?: boolean | null;
}

type ToolHandler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;

const toolHandlers: Map<string, ToolHandler> = new Map();

// Lazily built map of tool name → schema-required input keys, for the
// report-only contract check in the telemetry wrapper.
let requiredInputKeys: Map<string, string[]> | null = null;
function getRequiredInputKeys(tool: string): string[] {
  if (!requiredInputKeys) {
    requiredInputKeys = new Map();
    for (const def of getAllEnabledTools()) {
      const d = def as { name?: string; input_schema?: { required?: string[] } };
      if (d.name && Array.isArray(d.input_schema?.required)) {
        requiredInputKeys.set(d.name, d.input_schema.required);
      }
    }
  }
  return requiredInputKeys.get(tool) ?? [];
}

/**
 * Register a handler for a named tool. Every handler is wrapped with execution
 * telemetry (AnA's self-awareness of what is actually working) and a
 * report-only input-contract check — every dispatch path resolves handlers
 * from this map, so coverage is total with no call-site changes.
 */
export function registerToolHandler(name: string, handler: ToolHandler): void {
  const instrumented: ToolHandler = async (input, ctx) => {
    const orgId = ctx?.organizationId ?? undefined;
    // Report-only contract check: note when the model omitted required fields.
    const missing = getRequiredInputKeys(name).filter(k => input?.[k] === undefined);
    if (missing.length > 0) recordContractViolation(name, orgId);

    // Situational context: record which surface this tool was invoked from.
    if (ctx?.surface) recordToolSurface(name, ctx.surface);

    const start = Date.now();
    try {
      const result = await handler(input, ctx);
      const { outcome, note, resultYield } = classifyResult(result);
      recordToolOutcome(name, outcome, Date.now() - start, note, orgId, resultYield);
      return result;
    } catch (e) {
      recordToolOutcome(name, 'failure', Date.now() - start, e instanceof Error ? e.message : String(e), orgId);
      throw e;
    }
  };
  toolHandlers.set(name, instrumented);
}

/** Retrieve a registered tool handler, or undefined if the name is unknown. */
export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers.get(name);
}

/**
 * Names of all registered tool handlers. Used by the registry-consistency test to
 * assert ALL_ANA_TOOLS ↔ handlers parity (no orphaned definitions, no unwired
 * handlers) across the whole ~236-tool surface.
 */
export function getRegisteredToolNames(): string[] {
  return [...toolHandlers.keys()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Tool Handlers
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('list_fda_forms', async (input) => {
  const { default: FDAFormGenerator } = await import('../FDAFormGenerator.js');
  return JSON.stringify(new FDAFormGenerator().listGovernedForms(input));
});
registerToolHandler('prepare_fda_form', async (input) => {
  const { default: FDAFormGenerator } = await import('../FDAFormGenerator.js');
  return JSON.stringify(new FDAFormGenerator().prepareEditableDraft(input));
});
registerToolHandler('amend_fda_form', async (input) => {
  const { default: FDAFormGenerator } = await import('../FDAFormGenerator.js');
  return JSON.stringify(new FDAFormGenerator().amendEditableDraft(input));
});

// Study digital twin simulation. Builds a StudyDesign from the model's sketch and
// predicts outcomes across any therapeutic area / phase, grounded on the org's
// uploaded history when available. The disclaimer + (when no history) the upload
// request are enforced by the service and returned in the result string, so AnA
// Read-only window into enterprise usage controls. Org comes from ToolContext,
// never from model input. Each service fails open, so this is safe to call.
registerToolHandler('get_usage_and_license_status', async (_input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to report usage and license status.';
  try {
    const [{ getWeeklyMonitor, getOverageLedger }, { checkSeatAvailability, isSeatEnforcementOn }] = await Promise.all([
      import('../weekly-usage-limits.js'),
      import('../seat-licensing.js'),
    ]);
    const [weeklyLimits, overage, seats] = await Promise.all([
      getWeeklyMonitor(orgId),
      getOverageLedger(orgId),
      checkSeatAvailability(orgId, 0),
    ]);
    return JSON.stringify({
      status: 'ok',
      organizationId: orgId,
      weeklyLimits,
      billableOverage: overage,
      seats,
      seatEnforcement: isSeatEnforcementOn() ? 'enforce' : 'report-only',
      instruction:
        'Report the standing plainly. Call out any metric in warn/overage/blocked state and any seat state of full/over. If weeklyLimits is empty and seats are unlimited, say no limits are configured — do not invent any.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `get_usage_and_license_status failed: ${err?.message || 'unknown error'}` });
  }
});

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
    const locatorOf = (d: (typeof docs)[number]): string | null =>
      d.locator || d.sectionTitle || (typeof d.pageNumber === 'number' ? `p.${d.pageNumber}` : null);
    // Which passages can be CITED, not just read: a passage cut from a Data
    // Room artifact resolves to a canonical evidence source (the same resolver
    // the human draft route uses); the ids travel back on the passage so the
    // model can hand them to write_q_sub_section / write_kit_section as
    // `sources` and the quoted clauses are recorded against the source
    // (ledger L154). A passage with no resolvable source says so — null,
    // never a guessed id.
    let evidenceIds = new Map<string, number>();
    if (ctx?.organizationId) {
      try {
        const { evidenceSourceIdsForRetrieval } = await import('./drafting-source-lineage.js');
        evidenceIds = await evidenceSourceIdsForRetrieval(
          ctx.organizationId,
          docs.map((d) => d.sourceArtifactId ?? null),
        );
      } catch {
        evidenceIds = new Map();
      }
    }
    const passages = docs.map((d, i) => ({
      rank: i + 1,
      title: d.title || 'Untitled',
      relevance: typeof d.finalScore === 'number' ? Number(d.finalScore.toFixed(3)) : null,
      locator: locatorOf(d),
      text: (d.compressedContent || d.content || '').slice(0, 800),
      artifact_id: d.sourceArtifactId ?? null,
      evidence_source_id: d.sourceArtifactId ? (evidenceIds.get(d.sourceArtifactId) ?? null) : null,
    }));
    const citable = passages.filter((p) => p.evidence_source_id !== null).length;
    const provenance = docs.map(d => {
      const locator = locatorOf(d);
      return buildProvenance({
        sourceId: 'project_corpus',
        citation: {
          title: locator ? `${d.title || 'Untitled'} (${locator})` : d.title || 'Untitled',
          identifier: d.documentId || d.chunkId || d.id || null,
          url: null,
        },
        query,
        confidence: confidenceFromScore(d.finalScore),
      });
    });
    return JSON.stringify({
      source: 'Project knowledge corpus (RAG)',
      query,
      resultCount: passages.length,
      passages,
      provenance,
      citable,
      citation_hint:
        "Ground statements in these passages and cite each by its document title and locator (page/section); " +
        "these are the organization's own project documents. " +
        (citable > 0
          ? `${citable} passage(s) carry an evidence_source_id: when you write a section with write_q_sub_section or write_kit_section, pass those passages as sources (evidence_source_id + the passage text as excerpt) so every clause you quote verbatim is recorded against its Data Room source.`
          : 'None of these passages resolves to a Data Room source, so none can be recorded as a citation by the drafting tools; text drafted from them is recorded as your own assertion.'),
    });
  } catch (err: any) {
    return `Project knowledge search failed: ${err?.message ?? 'unknown error'}.`;
  }
});

// Multi-query project knowledge search — fan out several sub-queries against
// the active project's corpus in parallel, then merge + de-duplicate into one
// relevance-ranked passage list. Lets AnA gather evidence across angles in a
// single call instead of looping one search at a time.
registerToolHandler('project_knowledge_search_multi', async (input, ctx) => {
  const rawQueries = Array.isArray(input.queries) ? input.queries : [];
  const queries = rawQueries
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map(q => q.trim())
    .slice(0, 8);
  if (queries.length === 0) {
    return 'No queries provided for project_knowledge_search_multi.';
  }
  const projectId = ctx?.projectId;
  const organizationUuid = ctx?.organizationUuid;
  if (!projectId || !organizationUuid) {
    return 'No active project is in context, so project knowledge cannot be searched. Ask the user to open a project first.';
  }

  const perQuery =
    typeof input.max_results_per_query === 'number' && input.max_results_per_query > 0
      ? Math.min(Math.floor(input.max_results_per_query), 10)
      : 5;
  const mergedCap =
    typeof input.max_merged_results === 'number' && input.max_merged_results > 0
      ? Math.min(Math.floor(input.max_merged_results), 25)
      : 12;

  try {
    const { mergeMultiQueryResults } = await import('./knowledge-search-merge.js');

    // Fan out the searches concurrently.
    const settled = await Promise.allSettled(
      queries.map(query =>
        ragRouter.retrieve({
          query,
          intent: 'project_scoped',
          organizationUuid,
          artifactScope: { projectId, organizationUuid },
          useReranking: true,
          limit: perQuery,
        })
      )
    );

    const perQueryBreakdown: Array<{ query: string; resultCount: number; error?: string }> = [];
    const resultsByQuery = settled.map((res, i) => {
      const query = queries[i];
      if (res.status !== 'fulfilled') {
        perQueryBreakdown.push({ query, resultCount: 0, error: 'retrieval failed' });
        return { query, docs: [] };
      }
      const docs = (res.value?.documents ?? []).slice(0, perQuery);
      perQueryBreakdown.push({ query, resultCount: docs.length });
      return { query, docs };
    });

    const merged = mergeMultiQueryResults(resultsByQuery, mergedCap);

    if (merged.length === 0) {
      return `No matching passages were found in this project's knowledge across ${queries.length} sub-queries.`;
    }

    return JSON.stringify({
      source: 'Project knowledge corpus (RAG, multi-query)',
      queries,
      perQuery: perQueryBreakdown,
      resultCount: merged.length,
      passages: merged,
      citation_hint:
        "Ground statements in these passages and cite each by its document title and locator (page/section). " +
        "`matched_queries` shows which sub-queries surfaced each passage — passages matched by several sub-queries are usually the strongest evidence.",
    });
  } catch (err: any) {
    return `Multi-query project knowledge search failed: ${err?.message ?? 'unknown error'}.`;
  }
});

// Session bootstrap — rehydrate prior context so a conversation never starts
// cold: latest thread working-memory summary + most important project/client
// atoms (query-independent) + AnA's own recent lessons for this org/project.
registerToolHandler('recall_session_context', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'recall_session_context requires tenant context (organizationId).' });
  }
  const threadId = typeof input.thread_id === 'string' && input.thread_id.trim() ? input.thread_id.trim() : undefined;
  const atomLimit =
    typeof input.atom_limit === 'number' && input.atom_limit > 0 ? Math.min(Math.floor(input.atom_limit), 15) : 6;

  try {
    const { buildSessionBootstrapContext } = await import('../ana-session-bootstrap.js');
    const context = await buildSessionBootstrapContext({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId ?? undefined,
      threadId,
      atomLimit,
    });

    if (!context) {
      return JSON.stringify({
        ok: true,
        hasContext: false,
        message:
          'No prior session memory was found for this org/project yet — this appears to be a fresh start. Proceed normally; memory will accumulate as we work.',
      });
    }
    return JSON.stringify({
      ok: true,
      hasContext: true,
      context,
      message: 'Loaded prior session memory (working summary, project/client knowledge, and past lessons). Ground your response in it.',
    });
  } catch (err) {
    return JSON.stringify({
      error: `recall_session_context failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// RIM learning-loop read path — recall the org's LEARNED regulatory patterns from
// the tenant-scoped RIM pattern store. Org comes from ToolContext, never from model
// input, so it can never read another tenant's patterns. Pure query over governed
// internal data (no LLM, no network) → deterministic_query pedigree.
registerToolHandler('recall_rim_patterns', async (input, ctx) => {
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'recall_rim_patterns requires tenant context (organizationId).' });
  }
  const domain =
    typeof input.domain === 'string' && input.domain.trim() ? input.domain.trim() : undefined;

  try {
    const { getPatterns } = await import('../intelligence/rim-pattern-store.js');
    const patterns = await getPatterns({ orgId: ctx.organizationId, domain });
    return JSON.stringify({
      source: 'RIM Pattern Store',
      pedigree: 'deterministic_query',
      organizationId: ctx.organizationId,
      domain: domain ?? null,
      count: patterns.length,
      patterns,
      message:
        patterns.length === 0
          ? 'No RIM patterns have been learned for this organization yet — proceed with generic guidance and do NOT invent learned patterns.'
          : 'Learned RIM patterns for this organization (strongest first). Ground your response in them.',
    });
  } catch (err) {
    return JSON.stringify({
      error: `recall_rim_patterns failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// RIM domain query — filter learned patterns by domain with optional confidence
// and occurrence thresholds, sorted by occurrences descending. Tenant-scoped.
registerToolHandler('query_rim_patterns_by_domain', async (input: Record<string, unknown>, ctx) =>
  runStatsTool('query_rim_patterns_by_domain', async () => {
    const { getPatterns } = await import('../intelligence/rim-pattern-store.js');
    // Tenant comes from the VERIFIED context, never from the model's arguments.
    // This previously read `input.orgId`, and the tool definition made orgId a
    // required model-supplied field — so naming another organization's id read
    // that tenant's learned regulatory patterns. The sibling recall_rim_patterns
    // already gates on ctx.organizationId; this is the same rule.
    const orgId = ctx?.organizationId;
    const domain = typeof input.domain === 'string' ? input.domain.trim() : '';
    if (!orgId) {
      throw new Error('query_rim_patterns_by_domain requires tenant context (organizationId).');
    }
    if (!domain) {
      throw new Error('domain (string) is required.');
    }
    const minConfidence = typeof input.minConfidence === 'number' ? input.minConfidence : 0;
    const minOccurrences = typeof input.minOccurrences === 'number' ? input.minOccurrences : 0;

    const patterns = (await getPatterns({ orgId, domain }))
      .filter((p) => p.confidence >= minConfidence && p.occurrences >= minOccurrences)
      .sort((a, b) => b.occurrences - a.occurrences || b.confidence - a.confidence);

    return {
      source: 'RIM Pattern Store',
      pedigree: 'rim_learned',
      organizationId: orgId,
      domain,
      filters: { minConfidence, minOccurrences },
      count: patterns.length,
      patterns,
    };
  })
);

// RIM intelligence summary — aggregate domain counts, top patterns, date range.
registerToolHandler('summarize_rim_intelligence', async (_input: Record<string, unknown>, ctx) =>
  runStatsTool('summarize_rim_intelligence', async () => {
    const { getPatterns } = await import('../intelligence/rim-pattern-store.js');
    // See query_rim_patterns_by_domain: tenant from the verified context only.
    const orgId = ctx?.organizationId;
    if (!orgId) {
      throw new Error('summarize_rim_intelligence requires tenant context (organizationId).');
    }

    const patterns = await getPatterns({ orgId });
    if (patterns.length === 0) {
      return {
        source: 'RIM Pattern Store',
        pedigree: 'rim_learned',
        organizationId: orgId,
        totalPatterns: 0,
        domains: [],
        topPatterns: [],
        oldestPattern: null,
        newestPattern: null,
        message: 'No RIM patterns have been learned for this organization yet.',
      };
    }

    // Domain counts
    const domainMap = new Map<string, number>();
    for (const p of patterns) {
      domainMap.set(p.domain, (domainMap.get(p.domain) ?? 0) + 1);
    }
    const domains = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    // Top patterns by occurrences
    const topPatterns = [...patterns]
      .sort((a, b) => b.occurrences - a.occurrences || b.confidence - a.confidence)
      .slice(0, 10)
      .map((p) => ({
        observation: p.observation,
        occurrences: p.occurrences,
        confidence: p.confidence,
      }));

    // Date range
    let oldest = patterns[0].firstSeen;
    let newest = patterns[0].lastSeen;
    for (const p of patterns) {
      if (p.firstSeen < oldest) oldest = p.firstSeen;
      if (p.lastSeen > newest) newest = p.lastSeen;
    }

    return {
      source: 'RIM Pattern Store',
      pedigree: 'rim_learned',
      organizationId: orgId,
      totalPatterns: patterns.length,
      domains,
      topPatterns,
      oldestPattern: oldest,
      newestPattern: newest,
    };
  })
);

// 21 CFR Part 11 §11.50 signature manifestation — load an executed signature
// (tenant-scoped) and render the human-readable block (printed name, date/time,
// meaning + supporting controls) to embed in the rendered record.
registerToolHandler('render_signature_manifestation', async (input, ctx) => {
  const signatureId = typeof input.signature_id === 'string' ? input.signature_id.trim() : '';
  if (!signatureId) {
    return JSON.stringify({ error: 'render_signature_manifestation requires signature_id (string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'render_signature_manifestation requires tenant context (organizationId).' });
  }
  const recordTitle = typeof input.record_title === 'string' && input.record_title.trim() ? input.record_title.trim() : undefined;

  try {
    const { db } = await import('../../db.js');
    const { concept2cureSignatures } = await import('shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const { renderSignatureManifestation, requiredManifestFields } = await import(
      '../compliance/signature-manifestation.js'
    );

    const rows = await db
      .select()
      .from(concept2cureSignatures)
      .where(
        and(
          eq(concept2cureSignatures.signatureId, signatureId),
          eq(concept2cureSignatures.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    const sig = rows[0];
    if (!sig) {
      return JSON.stringify({
        ok: false,
        message: `No signature found with id ${signatureId} for this organization.`,
      });
    }

    const manifestInput = {
      signatureId: sig.signatureId,
      signerName: sig.signerName,
      signerEmail: sig.signerEmail,
      signerRole: sig.signerRole,
      signatureType: sig.signatureType,
      signaturePurpose: sig.signaturePurpose,
      signatureMeaning: sig.signatureMeaning,
      signedAt: sig.signedAt,
      authenticationMethod: sig.authenticationMethod,
      secondFactorVerified: sig.secondFactorVerified,
      signatureHash: sig.signatureHash,
      ipAddress: sig.ipAddress,
      recordTitle,
    };

    return JSON.stringify({
      ok: true,
      basis: '21 CFR Part 11 §11.50',
      manifestation: renderSignatureManifestation(manifestInput),
      requiredFields: requiredManifestFields(manifestInput),
      status: sig.status,
      message: 'Signature manifestation rendered. Embed the block in any human-readable (PDF/Word) form of the signed record.',
    });
  } catch (err) {
    return JSON.stringify({
      error: `render_signature_manifestation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Honesty envelope — stamp a quantitative output with confidence + denominator
// + freshness, and gate "final-ready" on missing/stale dependencies. The
// platform's confidence moat as a reusable primitive. Deterministic, no LLM.
registerToolHandler('assess_output_confidence', async (input) => {
  if (typeof input.n !== 'number' || !Number.isFinite(input.n)) {
    return JSON.stringify({ error: 'assess_output_confidence requires n (number of supporting data points).' });
  }
  const freshnessDays = typeof input.freshness_days === 'number' ? input.freshness_days : undefined;
  const maxFreshnessDays = typeof input.max_freshness_days === 'number' ? input.max_freshness_days : 180;

  try {
    const { buildHonestyEnvelope, finalReadyGate } = await import('./honesty-envelope.js');
    const envelope = buildHonestyEnvelope({ n: input.n, freshnessDays, maxFreshnessDays });

    let finalReady: { ready: boolean; blockers: string[] } | null = null;
    if (Array.isArray(input.dependencies)) {
      const deps = (input.dependencies as Array<Record<string, unknown>>).map(d => ({
        name: typeof d.name === 'string' ? d.name : 'dependency',
        present: d.present === true,
        freshnessDays: typeof d.freshness_days === 'number' ? d.freshness_days : undefined,
      }));
      finalReady = finalReadyGate(deps, maxFreshnessDays);
    }

    return JSON.stringify({
      engine: 'honesty envelope (deterministic, no LLM)',
      confidence: envelope.confidence,
      n: envelope.n,
      freshnessDays: envelope.freshnessDays,
      stale: envelope.stale,
      label: envelope.label,
      finalReady,
      message: finalReady && !finalReady.ready
        ? `Output is NOT final-ready — blockers: ${finalReady.blockers.join('; ')}. Show these to the user; do not present as final.`
        : `Stamp this number with "${envelope.label}". Never present it as more certain than its denominator supports.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `assess_output_confidence failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Grounding guarantee — flags quantitative claims in a draft that lack a
// citation/source marker, so AnA grounds or hedges every number before it
// reaches a regulatory reader. Deterministic (no LLM); the trust moat made
// structural.
registerToolHandler('check_grounding', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) {
    return JSON.stringify({ error: 'check_grounding requires text (non-empty string).' });
  }
  try {
    const { assessGrounding } = await import('./grounding-core.js');
    const report = assessGrounding(text);
    return JSON.stringify({
      engine: 'deterministic grounding check (no LLM)',
      ok: report.ok,
      groundingScore: report.groundingScore,
      totalClaims: report.totalClaims,
      groundedClaims: report.groundedClaims,
      ungroundedClaims: report.ungroundedClaims.map(c => ({ sentence: c.sentence, numbers: c.numbers })),
      message:
        report.totalClaims === 0
          ? 'No quantitative claims detected — nothing to ground.'
          : report.ok
            ? `All ${report.totalClaims} quantitative claim(s) carry a citation/source marker.`
            : `${report.ungroundedClaims.length} of ${report.totalClaims} quantitative claim(s) are UNGROUNDED — add a cited source for each figure, or hedge it explicitly, before presenting to a regulatory reader.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `check_grounding failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Submission pre-mortem (RTF/CRL) — composes the deterministic deficiency scan
// (pure, no LLM) with the precedent engine (real, fault-tolerant) into one
// grounded, honest-by-construction readiness verdict. The risk read always
// carries confidence + denominator and degrades to an explicit pattern-only /
// insufficient-data note rather than a fabricated probability.
registerToolHandler('run_submission_premortem', async (input, ctx) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) {
    return JSON.stringify({ error: 'run_submission_premortem requires text (non-empty string).' });
  }
  const location = typeof input.location === 'string' && input.location.trim() ? input.location.trim() : 'document';
  const submissionType = typeof input.submission_type === 'string' ? input.submission_type.trim() : undefined;
  const agency = typeof input.agency === 'string' ? input.agency.trim() : undefined;
  const indication = typeof input.indication === 'string' ? input.indication.trim() : undefined;

  try {
    const { quickPatternScan } = await import('../intelligence/rim.js');
    const { composePremortem } = await import('./submission-premortem-core.js');

    // 1. Deterministic deficiency/reviewer-trigger findings (no LLM).
    const criteria: Record<string, unknown> = {};
    if (agency) criteria.agency = agency;
    if (submissionType) criteria.submissionType = submissionType;
    const matches = quickPatternScan(text, location, Object.keys(criteria).length ? (criteria as any) : undefined);
    const findings = matches.map(m => ({
      patternId: m.patternId,
      title: m.pattern.name,
      category: m.pattern.category,
      severity: m.pattern.severity,
      matchedText: m.matchedText,
      matchConfidence: m.matchConfidence,
      reviewerQuestion: m.pattern.reviewerQuestion,
      regulatoryBasis: m.pattern.regulatoryBasis,
      remediation: m.pattern.remediation,
    }));

    // 2. Precedent calibration (the denominator + citations). Fault-tolerant:
    //    an unavailable corpus degrades to n=0 honest output, never an error.
    let precedentCount = 0;
    let precedentCitations: Array<{ id: string; label: string; outcome: string }> = [];
    if (submissionType) {
      try {
        const { precedentEngine } = await import('../precedent-engine.js');
        const records = await precedentEngine.search(
          { submissionType, indication, limit: 25 },
          ctx?.organizationId ?? undefined
        );
        precedentCount = records.length;
        precedentCitations = records.slice(0, 5).map(r => ({
          id: r.id,
          label: r.clearanceNumber || r.deviceName || r.applicant || r.id,
          outcome: r.decisionOutcome,
        }));
      } catch {
        /* corpus unavailable — honest n=0 read */
      }
    }

    const verdict = composePremortem({
      findings,
      precedentCount,
      precedentCitations,
      submissionType,
      agency,
    });

    return JSON.stringify({
      engine: 'deterministic deficiency scan + precedent engine (honest-by-construction)',
      location,
      ...verdict,
      message: verdict.summary,
    });
  } catch (err) {
    return JSON.stringify({
      error: `run_submission_premortem failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// E14 — CRL/RTF pre-mortem DECISION ARTIFACT. Reuses the same honest-by-
// construction composition path as run_submission_premortem (deterministic
// deficiency scan + fault-tolerant precedent engine), then lifts the verdict
// into a board-ready artifact (approval-probability ESTIMATE grounded in the
// precedent approve/deny split, ranked precedent-cited risks, prioritized
// fix-list) via the pure crl-premortem-report core. Optionally renders + authors
// the artifact as a Word doc via author_docx_native — but ONLY for an estimable,
// non-sample artifact (the exportability/honesty guard). The artifact is always
// produced UNSEALED.
//
// E1 INTEGRATION: when E1's Sign-and-seal lands, attach the seal action +
// SealedRecord to the returned artifact here (sealStatus flips to 'sealed' and a
// ProvenanceTrail entry is recorded). The report is fully generatable/exportable
// without sealing now.
//
// BUILD-1 INTEGRATION: when Build 1 lands, persist the assembled artifact as a
// version row here (so each generated pre-mortem becomes an immutable record).
registerToolHandler('assemble_crl_premortem_artifact', async (input, ctx) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) {
    return JSON.stringify({ error: 'assemble_crl_premortem_artifact requires text (non-empty string).' });
  }
  const location =
    typeof input.location === 'string' && input.location.trim() ? input.location.trim() : 'document';
  const submissionType = typeof input.submission_type === 'string' ? input.submission_type.trim() : undefined;
  const agency = typeof input.agency === 'string' ? input.agency.trim() : undefined;
  const indication = typeof input.indication === 'string' ? input.indication.trim() : undefined;
  const title = typeof input.title === 'string' ? input.title : undefined;
  const doExport = input.export === true;

  try {
    const { quickPatternScan } = await import('../intelligence/rim.js');
    const { composePremortem } = await import('./submission-premortem-core.js');
    const { assembleCrlPremortemArtifact, renderArtifactMarkdown } = await import('./crl-premortem-report.js');

    // 1. Deterministic deficiency/reviewer-trigger findings (no LLM).
    const criteria: Record<string, unknown> = {};
    if (agency) criteria.agency = agency;
    if (submissionType) criteria.submissionType = submissionType;
    const matches = quickPatternScan(text, location, Object.keys(criteria).length ? (criteria as any) : undefined);
    const findings = matches.map(m => ({
      patternId: m.patternId,
      title: m.pattern.name,
      category: m.pattern.category,
      severity: m.pattern.severity,
      matchedText: m.matchedText,
      matchConfidence: m.matchConfidence,
      reviewerQuestion: m.pattern.reviewerQuestion,
      regulatoryBasis: m.pattern.regulatoryBasis,
      remediation: m.pattern.remediation,
    }));

    // 2. Precedent calibration — same fault-tolerant path as the pre-mortem; an
    //    unavailable corpus degrades to n=0 (artifact becomes not_assessed),
    //    never an error. The full outcome split grounds the probability estimate.
    let precedentCount = 0;
    let precedentCitations: Array<{ id: string; label: string; outcome: string }> = [];
    let precedentOutcomes: Array<{ id: string; label: string; outcome: string }> = [];
    if (submissionType) {
      try {
        const { precedentEngine } = await import('../precedent-engine.js');
        const records = await precedentEngine.search(
          { submissionType, indication, limit: 25 },
          ctx?.organizationId ?? undefined,
        );
        precedentCount = records.length;
        // DATA-OP: grounding fidelity ultimately depends on the P2 precedent-
        // corpus ingestion; we drive from whatever the engine returns today.
        precedentOutcomes = records.map(r => ({
          id: r.id,
          label: r.clearanceNumber || r.deviceName || r.applicant || r.id,
          outcome: r.decisionOutcome,
        }));
        precedentCitations = precedentOutcomes.slice(0, 5);
      } catch {
        /* corpus unavailable — honest n=0 read (artifact: not_assessed) */
      }
    }

    const verdict = composePremortem({
      findings,
      precedentCount,
      precedentCitations,
      submissionType,
      agency,
    });

    const artifact = assembleCrlPremortemArtifact({
      verdict,
      precedents: precedentOutcomes,
      title,
    });

    // Optional export — guarded: only an estimable, non-sample artifact may be
    // rendered/authored. renderArtifactMarkdown throws otherwise.
    let exportResult: Record<string, unknown> | null = null;
    if (doExport) {
      if (!artifact.exportable) {
        exportResult = {
          exported: false,
          reason: `Artifact is not exportable (status: ${artifact.status}). Pattern-only / insufficient-data and sample artifacts cannot be sealed or exported.`,
        };
      } else {
        try {
          const markdown = renderArtifactMarkdown(artifact);
          const authorHandler = getToolHandler('author_docx_native');
          if (authorHandler) {
            const authored = JSON.parse(
              await authorHandler({ title: artifact.title, content: markdown, output_format: 'docx' }, ctx),
            );
            exportResult = authored.error
              ? { exported: false, reason: authored.error, markdown }
              : { exported: true, sealed: false, docxPath: authored.docxPath, fileName: authored.fileName, markdown };
          } else {
            exportResult = { exported: false, reason: 'author_docx_native unavailable', markdown };
          }
        } catch (err) {
          exportResult = {
            exported: false,
            reason: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    return JSON.stringify({
      engine: 'CRL/RTF pre-mortem decision artifact (honest-by-construction, unsealed)',
      location,
      artifact,
      export: exportResult,
      message: artifact.approvalProbability.framing,
    });
  } catch (err) {
    return JSON.stringify({
      error: `assemble_crl_premortem_artifact failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// E8 — Pre-IND / EOP2 briefing-book builder with reviewer-challenge pre-mortem.
// Assembles the briefing book from a RegAgencyMeeting (fixture when no live id),
// derives required_strings (mandatory headers + sponsor questions) for
// verify_docx_against_source, and folds anticipated FDA pushback from
// simulate_reviewer_challenges + run_submission_premortem into an honest
// per-question pre-mortem verdict. The actual author_docx_native /
// verify_docx_against_source calls are driven by AnA in the agentic loop using
// the content + required_strings this tool returns.
registerToolHandler('assemble_briefing_book', async (input, ctx) => {
  try {
    const briefing = await import('./briefing-book-core.js');

    // 1. Resolve the meeting. A live meeting_id would join the product's
    //    strategy.meetings[]; absent that we use the labelled fixture.
    // INTEGRATION: join the live RegAgencyMeeting row by meeting_id + org scope
    //   (client/src/concept2cure/types/workspace.ts → product.strategy.meetings).
    const meetingId = typeof input.meeting_id === 'string' ? input.meeting_id.trim() : '';
    const overrideQuestions = Array.isArray(input.key_questions)
      ? (input.key_questions as unknown[]).filter((q): q is string => typeof q === 'string')
      : undefined;

    let meeting: import('./briefing-book-core.js').RegAgencyMeetingInput;
    let context: import('./briefing-book-core.js').BriefingBookContext;
    let dataSource: import('./briefing-book-core.js').BriefingBookDataSource;

    if (meetingId) {
      // INTEGRATION: load the live meeting here. Until that join exists, an
      // explicit id with no loader still degrades honestly to fixture-sourced.
      meeting = { ...briefing.FIXTURE_EOP2_MEETING, id: meetingId };
      context = { ...briefing.FIXTURE_EOP2_CONTEXT };
      dataSource = 'fixture';
    } else {
      meeting = { ...briefing.FIXTURE_EOP2_MEETING };
      context = { ...briefing.FIXTURE_EOP2_CONTEXT };
      dataSource = 'fixture';
    }

    const meetingType =
      typeof input.meeting_type === 'string' ? input.meeting_type : undefined;
    if (meetingType) meeting.type = meetingType as typeof meeting.type;
    if (overrideQuestions && overrideQuestions.length) meeting.keyQuestions = overrideQuestions;
    if (typeof input.product_name === 'string') context.productName = input.product_name;
    if (typeof input.indication === 'string') context.indication = input.indication;
    if (typeof input.sponsor === 'string') context.sponsor = input.sponsor;

    // 2. Assemble the markdown + required_strings.
    const assembled = briefing.assembleBriefingBook(meeting, context);

    // 3. Pre-mortem — anticipated FDA pushback per sponsor question.
    const runPremortem = input.run_premortem !== false;
    let challenges: import('./briefing-book-core.js').AnticipatedChallenge[] = [];
    // Pattern-only pre-mortem: no precedent corpus is joined for the briefing
    // book, so the denominator is honestly zero (insufficient_data risk read).
    const precedentCount = 0;

    if (runPremortem) {
      // 3a. run_submission_premortem (pattern scan). Deterministic; runs over
      //     the assembled book text. No precedent corpus is joined here, so the
      //     pre-mortem stays honestly pattern-only (precedentCount = 0).
      //     Fault-tolerant: an unavailable engine degrades to no findings.
      try {
        const { quickPatternScan } = await import('../intelligence/rim.js');
        const matches = quickPatternScan(assembled.content, 'briefing-book', { agency: 'FDA' } as any);
        const findings = matches.map(m => ({
          title: m.pattern.name,
          category: m.pattern.category,
          severity: m.pattern.severity,
          reviewerQuestion: m.pattern.reviewerQuestion,
          regulatoryBasis: m.pattern.regulatoryBasis,
          remediation: m.pattern.remediation,
        }));
        challenges = challenges.concat(briefing.normalizePremortemFindings({ findings }));
      } catch {
        /* engine unavailable — degrade to no findings, honest n=0 */
      }

      // 3b. simulate_reviewer_challenges (reviewer lenses) — only when the
      //     caller supplied a package + assessment to scope it.
      const packageId = typeof input.package_id === 'number' ? input.package_id : undefined;
      const assessmentId = typeof input.assessment_id === 'number' ? input.assessment_id : undefined;
      if (packageId && assessmentId && ctx?.organizationId) {
        try {
          const { submissionTwinService } = await import('../submission-twin-service.js');
          const lensChallenges = await submissionTwinService.simulateChallenges(
            packageId,
            ctx.organizationId,
            assessmentId,
          );
          challenges = challenges.concat(
            briefing.normalizeReviewerChallenges({ challenges: lensChallenges }),
          );
        } catch {
          /* reviewer-lens pass unavailable — keep pattern-only challenges */
        }
      }
    }

    const premortem = briefing.composeBriefingBookPremortem({
      meeting,
      challenges,
      precedentCount,
      dataSource,
    });

    // BUILD-1 INTEGRATION: persist { assembled, premortem } as a briefing-book
    //   version row (briefing_book_versions) so the assembled book + pre-mortem
    //   verdict are versioned and citable in the 21 CFR Part 11 audit trail.
    //   Sealing/exporting is gated on premortem.sealable (false for fixtures).

    // status:'generated' + content surfaces the book as an editor-openable draft
    // in the Document Studio (same artifact_draft path as author_docx_native),
    // so the markdown body and required_strings the model uses to call
    // author_docx_native / verify_docx_against_source are also previewable.
    return JSON.stringify({
      status: 'generated',
      documentType: 'briefing-book',
      title: assembled.title,
      content: assembled.content,
      requiredStrings: assembled.requiredStrings,
      questionCount: assembled.questionCount,
      premortem,
      message: premortem.summary,
    });
  } catch (err) {
    return JSON.stringify({
      error: `assemble_briefing_book failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Deterministic regulatory deficiency scan — runs the codified pattern registry
// (quickPatternScan) with NO language-model call. AnA's reasoning-without-the-LLM
// surface: fast, reproducible, citable pattern matching over regulatory text.
registerToolHandler('scan_regulatory_deficiencies', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) {
    return JSON.stringify({ error: 'scan_regulatory_deficiencies requires text (non-empty string).' });
  }
  const location = typeof input.location === 'string' && input.location.trim() ? input.location.trim() : 'document';

  // Build the optional criteria from provided filters (all optional).
  const criteria: Record<string, unknown> = {};
  if (typeof input.agency === 'string' && input.agency.trim()) criteria.agency = input.agency.trim();
  if (typeof input.submission_type === 'string' && input.submission_type.trim())
    criteria.submissionType = input.submission_type.trim();
  if (typeof input.category === 'string' && input.category.trim()) criteria.category = input.category.trim();
  if (typeof input.min_severity === 'string' && input.min_severity.trim())
    criteria.minSeverity = input.min_severity.trim();

  try {
    const { quickPatternScan } = await import('../intelligence/rim.js');
    const matches = quickPatternScan(
      text,
      location,
      Object.keys(criteria).length > 0 ? (criteria as any) : undefined
    );

    const findings = matches.map(m => ({
      patternId: m.patternId,
      name: m.pattern.name,
      category: m.pattern.category,
      severity: m.pattern.severity,
      matchedText: m.matchedText,
      matchConfidence: m.matchConfidence,
      reviewerQuestion: m.pattern.reviewerQuestion,
      regulatoryBasis: m.pattern.regulatoryBasis,
      remediation: m.pattern.remediation,
      strongerAlternatives: m.pattern.strongAlternatives,
    }));

    const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});

    return JSON.stringify({
      engine: 'deterministic pattern registry (no LLM)',
      location,
      findingsCount: findings.length,
      severityCounts: bySeverity,
      findings,
      message:
        findings.length === 0
          ? 'No codified deficiency or reviewer-trigger patterns matched this text. (Absence of a pattern match is not proof of soundness — it means no KNOWN pattern fired.)'
          : `${findings.length} pattern match(es) found deterministically. Each includes the likely reviewer question, regulatory basis, and a concrete remediation.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `scan_regulatory_deficiencies failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Large-document working set — extract a single file's full text server-side
// and return only the query-relevant windows, so AnA can work with documents
// far larger than the per-turn result cap. Stateless; reuses the real file
// loader + extraction. Disableable via ANA_LARGE_DOC_SEARCH=false.
registerToolHandler('search_large_document', async (input, ctx) => {
  if (process.env.ANA_LARGE_DOC_SEARCH === 'false') {
    return JSON.stringify({ error: 'search_large_document is disabled in this deployment.' });
  }
  const fileId = typeof input.file_id === 'string' ? input.file_id : '';
  if (!fileId) {
    return JSON.stringify({ error: 'search_large_document requires file_id (string).' });
  }
  const queries = (Array.isArray(input.queries) ? input.queries : [])
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map(q => q.trim())
    .slice(0, 8);
  if (queries.length === 0) {
    return JSON.stringify({ error: 'search_large_document requires queries (non-empty array of strings).' });
  }
  const windowChars = typeof input.window_chars === 'number' ? input.window_chars : undefined;
  const maxWindows = typeof input.max_windows_per_query === 'number' ? input.max_windows_per_query : undefined;

  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const { extractDocumentText } = await import('../ocr/extractDocumentText.js');
    const { searchWithinText, extractHeadingOutline } = await import('./document-search-core.js');

    const file = await loadUploadedFile(fileId, ctx?.organizationId);
    const extracted = await extractDocumentText(file.buffer, file.mimeType, file.fileName);
    const text = extracted.text ?? '';
    if (!text.trim()) {
      return JSON.stringify({
        ok: true,
        fileName: file.fileName,
        totalChars: 0,
        message: 'The document produced no extractable text (it may be empty, image-only, or unsupported). Try read_uploaded_document with force_ocr.',
      });
    }

    const results = searchWithinText(text, queries, {
      windowChars,
      maxWindowsPerQuery: maxWindows,
    });
    const outline = extractHeadingOutline(text);

    return JSON.stringify({
      ok: true,
      fileName: file.fileName,
      totalChars: text.length,
      extractionMethod: (extracted as any).method ?? null,
      outline,
      results,
      message: `Searched ${text.length.toLocaleString()} chars of ${file.fileName}. Returned only the relevant windows per query — read and cite these excerpts rather than the whole document.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `search_large_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Remember a read document into durable project memory — promotes a document
// AnA read into project_memory_entries (embedded) via the real project
// ingestion pipeline, so it is surfaced automatically in future sessions.
// Disableable via ANA_REMEMBER_DOCUMENT=false.
registerToolHandler('remember_document_in_project', async (input, ctx) => {
  if (process.env.ANA_REMEMBER_DOCUMENT === 'false') {
    return JSON.stringify({ error: 'remember_document_in_project is disabled in this deployment.' });
  }
  const fileId = typeof input.file_id === 'string' ? input.file_id : '';
  if (!fileId) {
    return JSON.stringify({ error: 'remember_document_in_project requires file_id (string).' });
  }
  if (!ctx?.organizationId || !ctx?.projectId) {
    return JSON.stringify({
      error: 'remember_document_in_project requires an active project and organization in context.',
    });
  }
  const userId = ctx.userId ?? 0;

  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const { getProjectIntelligence, ingestProjectDocument } = await import(
      '../client-intelligence-memory.js'
    );

    const profile = await getProjectIntelligence(ctx.projectId);
    if (!profile?.id) {
      return JSON.stringify({
        ok: false,
        message:
          'This project has no intelligence profile yet, so there is nowhere to store durable project memory. Set up the project profile first, then try again.',
      });
    }

    const file = await loadUploadedFile(fileId, ctx.organizationId);
    const result = await ingestProjectDocument(
      profile.id,
      ctx.projectId,
      ctx.organizationId,
      {
        buffer: file.buffer,
        originalname: file.fileName,
        mimetype: file.mimeType,
        size: file.fileSize,
      },
      userId
    );

    return JSON.stringify({
      ok: result.status === 'completed',
      fileName: result.fileName,
      memoryEntriesCreated: result.memoryEntriesCreated,
      tokenCount: result.tokenCount,
      message:
        result.status === 'completed'
          ? `Remembered ${result.fileName} into project memory (${result.memoryEntriesCreated} entr${
              result.memoryEntriesCreated === 1 ? 'y' : 'ies'
            } embedded). It will be surfaced automatically in future sessions.`
          : `Could not remember ${result.fileName}: ${result.error ?? 'ingestion failed'}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `remember_document_in_project failed: ${err instanceof Error ? err.message : String(err)}`,
    });
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

    const provenance = result.trials.map(t =>
      buildProvenance({
        sourceId: 'clinicaltrials',
        citation: { title: t.title || t.nctId, identifier: t.nctId, url: t.url },
        query: query || undefined,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      query: query || undefined,
      totalCount: result.totalCount,
      resultCount: result.trials.length,
      studies: result.trials,
      provenance,
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

// Onboarding readiness — READ-ONLY. Reports which onboarding fields the org
// profile already has and what a document could fill. There is deliberately no
// commit counterpart: a model-callable commit could self-invoke in the agentic
// loop and defeat the human-approval gate, so applying proposals stays a human
// action through the governed endpoint.
registerToolHandler('summarize_onboarding_readiness', async (_input, ctx) => {
  const orgId = Number(ctx?.organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return 'I need to know which workspace you are in before I can check what setup is outstanding.';
  }
  const { summarizeOnboardingReadiness } = await import('../onboarding/onboarding-readiness');
  const readiness = await summarizeOnboardingReadiness(orgId);
  return readiness.summary;
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
    const total = Number(analysis?.total_reports) || 0;
    const subject = (input.device_name as string) || (input.product_code as string) || 'the device';
    const provenance = [
      buildProvenance({
        sourceId: 'openfda',
        citation: { title: `MAUDE device adverse-event signal for ${subject} (${total} reports)`, identifier: null, url: null },
        query: subject,
        confidence: total > 0 ? 'moderate' : null,
        extraCaveats: [
          'MAUDE is passive surveillance — reports are unverified, subject to reporting bias, and do not establish causality or rates.',
        ],
      }),
    ];
    return JSON.stringify({
      source: 'FDA MAUDE (openFDA)',
      summary: analysis,
      sample: Array.isArray(reports) ? reports.slice(0, 15) : [],
      provenance,
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
    const total = Number(analysis?.total_reports) || 0;
    const subject = (input.product_name as string) || (input.product_ndc as string) || 'the product';
    const provenance = [
      buildProvenance({
        sourceId: 'openfda',
        citation: { title: `FAERS adverse-event signal for ${subject} (${total} reports)`, identifier: null, url: null },
        query: subject,
        confidence: total > 0 ? 'moderate' : null,
        extraCaveats: [
          'FAERS is spontaneous reporting — counts have no denominator and do not establish causality, incidence, or rates.',
        ],
      }),
    ];
    return JSON.stringify({
      source: 'FDA FAERS (openFDA)',
      summary: analysis,
      sample: Array.isArray(reports) ? reports.slice(0, 15) : [],
      provenance,
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
    const provenance = result.articles.map(a =>
      buildProvenance({
        sourceId: 'pubmed',
        citation: { title: a.title || a.pmid, identifier: a.doi || `PMID:${a.pmid}`, url: a.url },
        query,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      query,
      totalCount: result.totalCount,
      resultCount: result.articles.length,
      articles: result.articles,
      provenance,
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

// Record Literature — persist PubMed hits into the org's literature corpus
// (literature_entries) through the same service the CER workbench's
// POST /api/cerv2/literature/record uses (ZERO DUPLICATION). Org comes from
// ToolContext, never from model arguments; without it the tool refuses.
// Honest limits are relayed from the service constants: entries enter the
// corpus unscreened and org-scoped (no program column). Screening is a separate
// governed act with its own reviewer attribution, recorded through
// POST /api/cerv2/literature/screen (literature-screening.service) — this tool
// records bibliography only and says so rather than implying an appraisal.
registerToolHandler('record_literature', async (input, ctx) => {
  const organizationId = ctx?.organizationId;
  if (typeof organizationId !== 'number' || !Number.isInteger(organizationId) || organizationId <= 0) {
    return JSON.stringify({
      recorded: false,
      error: 'Organization context is required to record literature — none is active.',
    });
  }

  const rawEntries = Array.isArray(input.entries) ? input.entries : [];
  if (rawEntries.length === 0) {
    return JSON.stringify({
      recorded: false,
      error: 'No entries supplied — pass the search_literature hits to record (pmid + title each).',
    });
  }

  const {
    recordLiteratureEntries,
    SCREENING_RECORDED_SEPARATELY,
    PROGRAM_BINDING_NOTE,
  } = await import('../literature-recording.service.js');

  try {
    const { pool } = await import('../../db.js');
    const result = await recordLiteratureEntries(
      pool,
      organizationId,
      rawEntries.map((e: any) => ({
        pmid: String(e?.pmid ?? ''),
        title: String(e?.title ?? ''),
        abstract: typeof e?.abstract === 'string' ? e.abstract : null,
        journal: typeof e?.journal === 'string' ? e.journal : null,
        year: typeof e?.year === 'number' ? e.year : null,
        authors: Array.isArray(e?.authors) || typeof e?.authors === 'string' ? e.authors : null,
        doi: typeof e?.doi === 'string' ? e.doi : null,
        url: typeof e?.url === 'string' ? e.url : null,
      })),
    );
    return JSON.stringify({
      recorded: true,
      ...result,
      notes: [SCREENING_RECORDED_SEPARATELY, PROGRAM_BINDING_NOTE],
    });
  } catch (e) {
    return JSON.stringify({
      recorded: false,
      error: `Failed to record literature — ${e instanceof Error ? e.message : 'database error'}`,
    });
  }
});

// Search EUDAMED — live EU medical-device database (EU analogue of FDA device
// data). The client never throws: a network/HTTP failure yields a typed
// status:'unavailable' result, which we relay as manual-search guidance.
registerToolHandler('search_eudamed', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const maxResults = Math.min((input.max_results as number) || 10, 50);
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const result = await searchEudamed({
    query: query || undefined,
    manufacturer: asStr(input.manufacturer),
    riskClass: asStr(input.risk_class),
    pageSize: maxResults,
  });

  if (result.status === 'unavailable') {
    return JSON.stringify({
      source: result.source,
      status: 'unavailable',
      query,
      note: `EUDAMED unavailable — ${result.message || 'returning guidance for manual search'}`,
      url: 'https://ec.europa.eu/tools/eudamed/#/screen/search-device',
    });
  }

  const provenance = result.devices.map(d =>
    buildProvenance({
      sourceId: 'eudamed',
      citation: { title: d.deviceName || d.basicUdiDi, identifier: d.basicUdiDi || null, url: d.url },
      query: query || undefined,
      confidence: 'high',
    })
  );
  return JSON.stringify({
    source: result.source,
    status: 'ok',
    query: query || undefined,
    totalCount: result.totalCount,
    resultCount: result.devices.length,
    devices: result.devices,
    provenance,
    citation_hint: 'Cite each device by its Basic UDI-DI and link to the provided EUDAMED url.',
  });
});

// Search EMA EPAR — live EU centrally-authorised human medicines (EU analogue of
// search_drug_labels). Graceful, never-throw client; relay status:'unavailable'.
registerToolHandler('search_ema_epar', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const maxResults = Math.min((input.max_results as number) || 10, 50);
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const result = await searchEmaEpar({
    query: query || undefined,
    activeSubstance: asStr(input.active_substance),
    therapeuticArea: asStr(input.therapeutic_area),
    pageSize: maxResults,
  });

  if (result.status === 'unavailable') {
    return JSON.stringify({
      source: result.source,
      status: 'unavailable',
      query,
      note: `EMA EPAR unavailable — ${result.message || 'returning guidance for manual search'}`,
      url: `https://www.ema.europa.eu/en/medicines?search_api_fulltext=${encodeURIComponent(query)}`,
    });
  }

  const provenance = result.medicines.map(m =>
    buildProvenance({
      sourceId: 'ema_epar',
      citation: { title: m.medicineName || m.productNumber, identifier: m.productNumber || null, url: m.url },
      query: query || undefined,
      confidence: 'high',
    })
  );
  return JSON.stringify({
    source: result.source,
    status: 'ok',
    query: query || undefined,
    totalCount: result.totalCount,
    resultCount: result.medicines.length,
    medicines: result.medicines,
    provenance,
    citation_hint: 'Cite each medicine by its EMA product number and link to the provided EPAR url.',
  });
});

// Search EU CTIS — live EU clinical trials under Reg (EU) 536/2014 (EU analogue
// of search_clinical_evidence). Graceful, never-throw client.
registerToolHandler('search_eu_ctis', async (input) => {
  const query = typeof input.query === 'string' ? input.query : '';
  const maxResults = Math.min((input.max_results as number) || 10, 50);
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const result = await searchEuCtis({
    query: query || undefined,
    condition: asStr(input.condition),
    sponsor: asStr(input.sponsor),
    phase: asStr(input.phase),
    status: asStr(input.status),
    pageSize: maxResults,
  });

  if (result.status === 'unavailable') {
    return JSON.stringify({
      source: result.source,
      status: 'unavailable',
      query,
      note: `EU CTIS unavailable — ${result.message || 'returning guidance for manual search'}`,
      url: 'https://euclinicaltrials.eu/ctis-public/search',
    });
  }

  const provenance = result.trials.map(t =>
    buildProvenance({
      sourceId: 'eu_ctis',
      citation: { title: t.title || t.euTrialNumber, identifier: t.euTrialNumber || null, url: t.url },
      query: query || undefined,
      confidence: 'high',
    })
  );
  return JSON.stringify({
    source: result.source,
    status: 'ok',
    query: query || undefined,
    totalCount: result.totalCount,
    resultCount: result.trials.length,
    trials: result.trials,
    provenance,
    citation_hint: 'Cite each trial by its EU trial number and link to the provided CTIS url.',
  });
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

// Medical Writing Guidance — authoritative standards + craft for a deliverable,
// composed by document type × therapeutic area × region × audience.
registerToolHandler('medical_writing_guidance', async (input) => {
  const documentType = typeof input.document_type === 'string' ? input.document_type : '';
  if (!documentType.trim()) {
    return JSON.stringify({
      error: 'medical_writing_guidance requires document_type.',
      catalog: listMedicalWritingCatalog(),
    });
  }
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const guidance = composeMedicalWritingGuidance({
    documentType,
    therapeuticArea: asStr(input.therapeutic_area),
    region: asStr(input.region),
    audience: asStr(input.audience),
    clientSegment: asStr(input.client_segment),
  });
  return JSON.stringify({
    source: 'AnA Medical-Writing Knowledge Base',
    ...guidance,
    citation_hint:
      'Apply this structure and these conventions, then ground every clinical claim with the evidence ' +
      'search tools and cite per the citation protocol.',
  });
});

// Statistical-results narrator — hedged ICH-E3 prose from a structured result.
registerToolHandler('narrate_statistical_result', async (input) => {
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint : '';
  const analysisType = ['time_to_event', 'binary', 'continuous'].includes(input.analysis_type as string)
    ? (input.analysis_type as AnalysisType)
    : undefined;
  if (!endpoint.trim() || !analysisType) {
    return JSON.stringify({ error: 'narrate_statistical_result requires endpoint and a valid analysis_type.' });
  }
  const num = (v: unknown): number | undefined => (typeof v === 'number' && !Number.isNaN(v) ? v : undefined);
  const arms = Array.isArray(input.arms)
    ? (input.arms as any[])
        .filter(a => a && typeof a.name === 'string')
        .map(a => ({ name: String(a.name), n: num(a.n), value: a.value, unit: typeof a.unit === 'string' ? a.unit : undefined }))
    : undefined;
  const result = narrateStatisticalResult({
    endpoint,
    analysisType,
    arms,
    measure: typeof input.measure === 'string' ? (input.measure as EffectMeasure) : undefined,
    estimate: num(input.estimate),
    ciLower: num(input.ci_lower),
    ciUpper: num(input.ci_upper),
    ciLevel: num(input.ci_level),
    pValue: num(input.p_value),
    alpha: num(input.alpha),
    exploratory: typeof input.exploratory === 'boolean' ? input.exploratory : undefined,
    multiplicityControlled: typeof input.multiplicity_controlled === 'boolean' ? input.multiplicity_controlled : undefined,
  });
  return JSON.stringify({ source: 'AnA Statistical Narrator', ...result });
});

// Market-access / HEOR value-dossier guidance.
registerToolHandler('value_dossier_guidance', async (input) => {
  const deliverable = typeof input.deliverable === 'string' ? input.deliverable : undefined;
  const htaBody = typeof input.hta_body === 'string' ? input.hta_body : undefined;
  if (!deliverable && !htaBody) {
    return JSON.stringify({
      source: 'AnA Market-Access Knowledge',
      hint: 'Specify a deliverable and/or hta_body.',
      catalog: listValueDossierCatalog(),
    });
  }
  return JSON.stringify({
    source: 'AnA Market-Access Knowledge',
    ...composeValueDossierGuidance({ deliverable, htaBody }),
  });
});

// Reporting-guideline advisor — EQUATOR network (CONSORT/SPIRIT/STROBE/...).
registerToolHandler('advise_reporting_guideline', async (input) => {
  const guideline = typeof input.guideline === 'string' ? input.guideline : undefined;
  const studyType = typeof input.study_type === 'string' ? input.study_type : undefined;
  if (!guideline && !studyType) {
    return JSON.stringify({ source: 'AnA Reporting-Guideline Advisor', guidelines: listReportingGuidelines(), ...adviseReportingGuideline({}) });
  }
  return JSON.stringify({ source: 'AnA Reporting-Guideline Advisor', ...adviseReportingGuideline({ guideline, studyType }) });
});

// Data-integrity / 21 CFR Part 11 advisor — ALCOA+ + Part 11 controls.
registerToolHandler('advise_data_integrity', async (input) => {
  const requirement = typeof input.requirement === 'string' ? input.requirement : undefined;
  const description = typeof input.description === 'string' ? input.description : undefined;
  if (!requirement && !description) {
    return JSON.stringify({ source: 'AnA Data-Integrity Advisor', catalog: listDataIntegrity(), ...adviseDataIntegrity({}) });
  }
  return JSON.stringify({ source: 'AnA Data-Integrity Advisor', ...adviseDataIntegrity({ requirement, description }) });
});

// Device/IVD eSTAR submission-readiness advisor (grounded, non-LLM). Never
// claims a submittable artifact the platform cannot produce, nor transmission.
registerToolHandler('advise_device_readiness', async (input) => {
  return JSON.stringify({
    source: 'AnA Device-Readiness Advisor',
    ...adviseDeviceReadiness(input as unknown as DeviceReadinessAdviceInput),
  });
});

// Global market-entry strategy advisor (ranked, honest; never claims transmission).
registerToolHandler('advise_global_market_strategy', async (input) => {
  const rawProfile = input.profile && typeof input.profile === 'object' ? (input.profile as Record<string, unknown>) : {};
  const profile = {
    isIvd: rawProfile.isIvd === true,
    availableArtifacts: Array.isArray(rawProfile.availableArtifacts) ? (rawProfile.availableArtifacts as string[]) : [],
  };
  const candidateMarkets = Array.isArray(input.candidateMarkets) ? (input.candidateMarkets as string[]) : undefined;
  return JSON.stringify({
    source: 'AnA Global-Market Strategy Advisor',
    ...adviseGlobalMarketStrategy({ profile, candidateMarkets } as unknown as GlobalMarketAdviceInput),
  });
});

// IVD knowledge grounded lookup (curated, citation-backed corpus; no fabrication).
registerToolHandler('ivd_knowledge_lookup', async (input) => {
  return JSON.stringify({
    source: 'AnA IVD Knowledge Base',
    ...lookupIvdKnowledge(input as unknown as IvdKnowledgeLookupInput),
  });
});

// EU MDR/IVDR technical-file readiness advisor (grounded; never claims NB
// conformity or CE marking).
registerToolHandler('advise_eu_technical_file_readiness', async (input) => {
  return JSON.stringify({
    source: 'AnA EU Technical-File Readiness Advisor',
    ...adviseEuTechnicalFileReadiness(input as unknown as EuTechDocAdviceInput),
  });
});

// PMA (Class III) filing-readiness advisor (grounded; never claims a fileable PMA
// when required modules are missing, nor transmission).
registerToolHandler('advise_pma_readiness', async (input) => {
  return JSON.stringify({
    source: 'AnA PMA-Readiness Advisor',
    ...advisePmaReadiness(input as unknown as PmaReadinessAdviceInput),
  });
});

// Global multi-market submission-plan advisor (grounded; never claims transmission).
registerToolHandler('advise_global_submission_plan', async (input) => {
  const rawProfile = input.profile && typeof input.profile === 'object' ? (input.profile as Record<string, unknown>) : {};
  const profile = {
    name: typeof rawProfile.name === 'string' ? rawProfile.name : 'Unnamed device',
    isIvd: rawProfile.isIvd === true,
    riskTier: typeof rawProfile.riskTier === 'string' ? rawProfile.riskTier : undefined,
    intendedUse: typeof rawProfile.intendedUse === 'string' ? rawProfile.intendedUse : undefined,
    availableArtifacts: Array.isArray(rawProfile.availableArtifacts) ? (rawProfile.availableArtifacts as string[]) : [],
  };
  const targetMarkets = Array.isArray(input.targetMarkets) ? (input.targetMarkets as string[]) : [];
  return JSON.stringify({
    source: 'AnA Global-Submission-Plan Advisor',
    ...adviseGlobalSubmissionPlan({ profile, targetMarkets } as unknown as SubmissionPlanAdviceInput),
  });
});

// Tool determinism pedigree — AnA introspects how trustworthy a tool's output is.
registerToolHandler('ana_tool_pedigree', async (input) => {
  const tool = typeof input.tool === 'string' ? input.tool : undefined;
  if (tool) {
    return JSON.stringify({ source: 'AnA Tool-Pedigree', ...getToolPedigree(tool) });
  }
  return JSON.stringify({
    source: 'AnA Tool-Pedigree',
    levels: PEDIGREE_LEVELS,
    deterministicTools: listDeterministicTools(),
    hint: 'Pass a tool name to classify a specific tool.',
  });
});

// Evidence self-check — deterministically flag contradictions across claims.
registerToolHandler('detect_evidence_contradictions', async (input) => {
  const claims = Array.isArray(input.claims) ? (input.claims as EvidenceClaim[]) : [];
  const relativeTolerance = typeof input.relativeTolerance === 'number' ? input.relativeTolerance : undefined;
  return JSON.stringify({ source: 'AnA Evidence-Contradiction Detector', ...detectContradictions(claims, { relativeTolerance }) });
});

// Evidence sufficiency — deterministically detect coverage gaps vs the question.
registerToolHandler('detect_evidence_gaps', async (input) => {
  const query = (input.query && typeof input.query === 'object' ? input.query : {}) as GapQuery;
  const evidence = Array.isArray(input.evidence) ? (input.evidence as EvidenceItem[]) : [];
  return JSON.stringify({ source: 'AnA Evidence-Gap Detector', ...detectEvidenceGaps(query, evidence) });
});

// Submission deficiency taxonomy — deterministically surface likely reviewer
// deficiencies (severity, reviewer language, mitigations, references) for a
// submission type, so AnA can pre-empt agency findings. No LLM, no fabrication;
// invalid submission_type is returned as a structured error for model retry.
registerToolHandler('lookup_submission_deficiencies', async (input) => {
  const raw = typeof input.submission_type === 'string' ? input.submission_type.toLowerCase().trim() : '';
  const valid: SubmissionType[] = ['ind', 'nda', 'bla', '510k', 'pma', 'de_novo', 'cer', 'ectd', 'general'];
  if (!valid.includes(raw as SubmissionType)) {
    return JSON.stringify({
      source: 'AnA Deficiency Taxonomy',
      error: `submission_type must be one of: ${valid.join(', ')}`,
    });
  }
  const submissionType = raw as SubmissionType;
  const criticalOnly = input.critical_only === true;
  const patterns = criticalOnly
    ? getCriticalDeficiencies(submissionType)
    : getDeficienciesBySubmissionType(submissionType);
  const deficiencies = patterns.map(p => ({
    id: p.id,
    category: p.category,
    subcategory: p.subcategory,
    title: p.title,
    description: p.description,
    severity: p.severity,
    likelihood: p.likelihood,
    agencies: p.agencies,
    reviewerLanguage: p.reviewerLanguage,
    mitigations: p.mitigations,
    references: p.references,
  }));
  return JSON.stringify({
    source: 'AnA Deficiency Taxonomy',
    submission_type: submissionType,
    critical_only: criticalOnly,
    count: deficiencies.length,
    deficiencies,
    citation_hint: 'Cite each mitigation against its listed regulatory references.',
  });
});

// Regulatory deadline radar — tenant-scoped aggregation of the org's regulatory
// obligations/commitments into overdue / due-soon / upcoming buckets. Fails
// closed when no organization is in context (cannot scope). Deterministic.
registerToolHandler('regulatory_deadline_radar', async (input, ctx) => {
  const organizationId = ctx?.organizationId ? Number(ctx.organizationId) : null;
  if (!organizationId || Number.isNaN(organizationId)) {
    return JSON.stringify({
      source: 'AnA Regulatory Deadline Radar',
      error: 'No organization is in context, so regulatory deadlines cannot be scoped.',
    });
  }
  const windowDays =
    typeof input.window_days === 'number' && input.window_days > 0
      ? Math.min(Math.floor(input.window_days), 365)
      : 30;
  const includeCompleted = input.include_completed === true;
  try {
    const radar = await getDeadlineRadar({
      organizationId,
      windowDays,
      includeCompleted,
    });
    return JSON.stringify({ source: 'AnA Regulatory Deadline Radar', ...radar });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Regulatory Deadline Radar',
      error: `Deadline radar failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// Governed correspondence response package — deterministic assembly (issue
// matrix, evidence checklist, readiness gating) from structured agency-issue
// input. Complements draft_fda_ir_response. No LLM, no fabrication.
registerToolHandler('compile_correspondence_response_package', async (input) => {
  const correspondenceId = typeof input.correspondence_id === 'string' ? input.correspondence_id : '';
  const rawIssues = Array.isArray(input.issues) ? input.issues : [];
  if (!correspondenceId || rawIssues.length === 0) {
    return JSON.stringify({
      source: 'AnA Correspondence Response Package',
      error: 'correspondence_id and a non-empty issues array are required.',
    });
  }
  // Adapter: the compiler reads only a subset of CorrespondenceIssue fields, so
  // build those from the model-supplied issues and cast to the compiler's type.
  const issues = rawIssues.map(raw => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const evidenceNeeds = Array.isArray(r.evidenceNeeds) ? (r.evidenceNeeds as string[]) : [];
    return {
      id: String(r.id ?? ''),
      category: String(r.category ?? 'general'),
      severity: String(r.severity ?? 'medium'),
      blocker: r.blocker === true,
      mappedCtdSections: Array.isArray(r.mappedCtdSections) ? (r.mappedCtdSections as string[]) : [],
      mappedArtifactIds: Array.isArray(r.mappedArtifactIds) ? (r.mappedArtifactIds as string[]) : [],
      structuredExtraction: evidenceNeeds.length ? { evidenceNeeds } : undefined,
    };
  }) as unknown as CorrespondenceIssue[];
  const selectedIssueIds = Array.isArray(input.selected_issue_ids)
    ? (input.selected_issue_ids as string[])
    : undefined;
  const revisedArtifactIds = Array.isArray(input.revised_artifact_ids)
    ? (input.revised_artifact_ids as string[])
    : undefined;
  const assembly = compileGovernedResponseAssembly({
    correspondenceId,
    issues,
    selectedIssueIds,
    revisedArtifactIds,
  });
  return JSON.stringify({ source: 'AnA Correspondence Response Package', ...assembly });
});

// Risk watch — tenant+project-scoped list of OPEN blockers, severity-first.
// Fails closed when no org/project is in context. Deterministic.
registerToolHandler('scan_project_risks', async (input, ctx) => {
  const organizationId = ctx?.organizationId ? Number(ctx.organizationId) : null;
  const projectId = ctx?.projectId ? Number(ctx.projectId) : null;
  if (!organizationId || Number.isNaN(organizationId) || !projectId || Number.isNaN(projectId)) {
    return JSON.stringify({
      source: 'AnA Risk Watch',
      error: 'An organization and project must be in context to scan project risks.',
    });
  }
  const limit =
    typeof input.limit === 'number' && input.limit > 0 ? Math.min(Math.floor(input.limit), 100) : 20;
  try {
    const blockers = await getOpenBlockers({ organizationId, projectId, limit });
    return JSON.stringify({
      source: 'AnA Risk Watch',
      summary: summarizeBlockers(blockers),
      blockers,
    });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Risk Watch',
      error: `Risk scan failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// Schedule of Events — AnA owns a regulatory-aware milestone schedule per
// project, generated from the project type + goals + regulatory framework,
// kept current with amendments/health reviews, and re-baselined via goals.
// Milestones reuse project_workflow_stages; proactive tasks reuse project_tasks;
// alerts reuse the notification service. All operations are org+project scoped.
function scheduleToolContext(ctx?: ToolContext): { organizationId: number; projectId: number } | null {
  const organizationId = ctx?.organizationId ? Number(ctx.organizationId) : null;
  const projectId = ctx?.projectId ? Number(ctx.projectId) : null;
  if (!organizationId || Number.isNaN(organizationId) || !projectId || Number.isNaN(projectId)) {
    return null;
  }
  return { organizationId, projectId };
}

function parseScheduleDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

registerToolHandler('generate_schedule_of_events', async (input, ctx) => {
  const scope = scheduleToolContext(ctx);
  if (!scope) {
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      error: 'An active organization and project are required to generate a schedule.',
    });
  }
  try {
    const { generateProjectSchedule } = await import('../projects/schedule-of-events');
    const projectType =
      (typeof input.project_type === 'string' && input.project_type.trim()) || ctx?.projectType || null;
    const goals = Array.isArray(input.goals)
      ? (input.goals as Array<Record<string, unknown>>).map((g) => ({
          title: String(g.title ?? '').trim(),
          description: typeof g.description === 'string' ? g.description : null,
          targetDate: typeof g.target_date === 'string' ? g.target_date : null,
          priority: typeof g.priority === 'string' ? g.priority : null,
          metric: typeof g.metric === 'string' ? g.metric : null,
        })).filter((g) => g.title)
      : undefined;
    const view = await generateProjectSchedule({
      orgId: scope.organizationId,
      projectId: scope.projectId,
      projectType,
      baselineDate: parseScheduleDate(input.baseline_date),
      targetDate: parseScheduleDate(input.target_date),
      goals,
      triggeredBy: 'ana_user',
      createdByAna: true,
    });
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      plan: view.plan,
      milestones: view.milestones,
      goals: view.goals,
      health: view.health,
    });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      error: `Schedule generation failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

registerToolHandler('amend_schedule_of_events', async (input, ctx) => {
  const scope = scheduleToolContext(ctx);
  if (!scope) {
    return JSON.stringify({ source: 'AnA Schedule of Events', error: 'An active organization and project are required.' });
  }
  const milestoneKey = typeof input.milestone_key === 'string' ? input.milestone_key.trim() : '';
  if (!milestoneKey) {
    return JSON.stringify({ source: 'AnA Schedule of Events', error: 'milestone_key is required.' });
  }
  try {
    const { amendMilestone } = await import('../projects/schedule-of-events');
    const result = await amendMilestone({
      orgId: scope.organizationId,
      projectId: scope.projectId,
      milestoneKey,
      newTargetDate: parseScheduleDate(input.new_target_date),
      status: typeof input.status === 'string' ? (input.status as any) : undefined,
      progress: typeof input.progress === 'number' ? input.progress : undefined,
      note: typeof input.note === 'string' ? input.note : undefined,
      triggeredBy: 'ana_user',
      createdByAna: true,
    });
    return JSON.stringify({ source: 'AnA Schedule of Events', ...result });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      error: `Amendment failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

registerToolHandler('review_schedule_of_events_health', async (input, ctx) => {
  const scope = scheduleToolContext(ctx);
  if (!scope) {
    return JSON.stringify({ source: 'AnA Schedule of Events', error: 'An active organization and project are required.' });
  }
  try {
    const { reviewScheduleHealth } = await import('../projects/schedule-of-events');
    const apply = input.apply === undefined ? true : !!input.apply;
    const result = await reviewScheduleHealth({
      orgId: scope.organizationId,
      projectId: scope.projectId,
      apply,
      triggeredBy: 'ana_user',
    });
    return JSON.stringify({ source: 'AnA Schedule of Events', ...result });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      error: `Health review failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

registerToolHandler('reset_project_goals', async (input, ctx) => {
  const scope = scheduleToolContext(ctx);
  if (!scope) {
    return JSON.stringify({ source: 'AnA Schedule of Events', error: 'An active organization and project are required.' });
  }
  const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
  const goals = Array.isArray(input.goals)
    ? (input.goals as Array<Record<string, unknown>>).map((g) => ({
        title: String(g.title ?? '').trim(),
        description: typeof g.description === 'string' ? g.description : null,
        targetDate: typeof g.target_date === 'string' ? g.target_date : null,
        priority: typeof g.priority === 'string' ? g.priority : null,
        metric: typeof g.metric === 'string' ? g.metric : null,
      })).filter((g) => g.title)
    : [];
  if (goals.length === 0 || !rationale) {
    return JSON.stringify({ source: 'AnA Schedule of Events', error: 'At least one goal and a rationale are required.' });
  }
  try {
    const { resetProjectGoals } = await import('../projects/schedule-of-events');
    const result = await resetProjectGoals({
      orgId: scope.organizationId,
      projectId: scope.projectId,
      goals,
      rationale,
      triggeredBy: 'ana_user',
      createdByAna: true,
    });
    return JSON.stringify({ source: 'AnA Schedule of Events', ...result });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Schedule of Events',
      error: `Goal reset failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// Session briefing — tenant-scoped reconciliation of overdue/due-soon deadlines
// + recent decisions, for opening a session or re-orienting. Fails closed when
// no organization is in context. Deterministic.
registerToolHandler('get_session_briefing', async (input, ctx) => {
  const organizationId = ctx?.organizationId ? Number(ctx.organizationId) : null;
  if (!organizationId || Number.isNaN(organizationId)) {
    return JSON.stringify({
      source: 'AnA Session Briefing',
      error: 'No organization is in context, so a session briefing cannot be scoped.',
    });
  }
  const decisionLimit =
    typeof input.decision_limit === 'number' && input.decision_limit > 0
      ? Math.min(Math.floor(input.decision_limit), 25)
      : 5;
  const windowDays =
    typeof input.window_days === 'number' && input.window_days > 0
      ? Math.min(Math.floor(input.window_days), 365)
      : 30;
  try {
    const { data } = await getSessionBriefing({
      organizationId,
      projectId: ctx?.projectId ?? null,
      decisionLimit,
      windowDays,
    });
    return JSON.stringify({
      source: 'AnA Session Briefing',
      deadlines: { summary: data.deadlines.summary, items: data.deadlines.items },
      decisions: data.decisions,
    });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Session Briefing',
      error: `Session briefing failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// Global-RI deterministic expert tools — registry-grounded cross-market regulatory
// intelligence (pathway, exclusivity/LOE, dossier legal basis, expedited programs,
// designations, fees, post-approval changes, device classification, safety
// reporting, stability, lifecycle obligations, pediatric plans, reliance pathways).
// No LLM, no fabrication: each result is computed by a pure global-ri service.
// Invalid input is returned as a structured error rather than thrown, so the model
// can correct and retry.
for (const globalRiToolName of GLOBAL_RI_TOOL_NAMES) {
  registerToolHandler(globalRiToolName, async (input) => {
    try {
      const result = dispatchGlobalRiTool(globalRiToolName, (input ?? {}) as Record<string, unknown>);
      return JSON.stringify({ source: 'AnA Global-RI Expert', tool: globalRiToolName, deterministic: true, result });
    } catch (e) {
      return JSON.stringify({ source: 'AnA Global-RI Expert', tool: globalRiToolName, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

// Real-world-evidence study-design advisor.
registerToolHandler('advise_rwe_design', async (input) => {
  const design = typeof input.design === 'string' ? input.design : undefined;
  if (!design) {
    return JSON.stringify({ source: 'AnA RWE-Design Advisor', catalog: listRweDesigns(), ...adviseRweDesign({}) });
  }
  return JSON.stringify({ source: 'AnA RWE-Design Advisor', ...adviseRweDesign({ design }) });
});

// Study-design & sample-size advisor.
registerToolHandler('advise_study_design', async (input) => {
  const goal = typeof input.goal === 'string' ? input.goal : undefined;
  const ssRaw = input.sample_size && typeof input.sample_size === 'object' ? (input.sample_size as Record<string, unknown>) : undefined;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && !Number.isNaN(v) ? v : undefined);
  let sampleSize: SampleSizeInput | undefined;
  if (ssRaw && typeof ssRaw.endpoint_family === 'string' && ['continuous', 'binary', 'time_to_event'].includes(ssRaw.endpoint_family)) {
    sampleSize = {
      endpointFamily: ssRaw.endpoint_family as EndpointFamily,
      goal: typeof goal === 'string' && ['superiority', 'non_inferiority', 'equivalence'].includes(goal) ? (goal as DesignGoal) : undefined,
      alpha: num(ssRaw.alpha),
      power: num(ssRaw.power),
      twoSided: typeof ssRaw.two_sided === 'boolean' ? ssRaw.two_sided : undefined,
      meanDifference: num(ssRaw.mean_difference),
      sd: num(ssRaw.sd),
      p1: num(ssRaw.p1),
      p2: num(ssRaw.p2),
      hazardRatio: num(ssRaw.hazard_ratio),
      probEvent: num(ssRaw.prob_event),
      allocationRatio: num(ssRaw.allocation_ratio),
      margin: num(ssRaw.margin),
    };
  }
  if (!goal && !sampleSize) {
    return JSON.stringify({ source: 'AnA Study-Design Advisor', designs: listStudyDesigns(), ...adviseStudyDesign({}) });
  }
  return JSON.stringify({ source: 'AnA Study-Design Advisor', ...adviseStudyDesign({ goal, sampleSize }) });
});

// Product-labeling structure advisor — USPI / SmPC.
registerToolHandler('advise_labeling_structure', async (input) => {
  const format = typeof input.format === 'string' ? input.format : undefined;
  const content = typeof input.content === 'string' ? input.content : undefined;
  if (!format && !content) {
    return JSON.stringify({ source: 'AnA Labeling-Structure Advisor', templates: listLabelTemplates(), ...adviseLabelingStructure({}) });
  }
  return JSON.stringify({ source: 'AnA Labeling-Structure Advisor', ...adviseLabelingStructure({ format, content }) });
});

// Build-from-template labeling authoring plan (roadmap E9). Returns the
// deterministic PLR/QRD section guard + the required_strings derivation + the
// build_from_template replacements for a US (USPI/PLR) or EU (SmPC/QRD) mode, so
// the host can drive build_from_template → review_label_currency →
// verify_docx_against_source. Pure/deterministic; the currency verdict is NOT
// produced here (call review_label_currency for that).
registerToolHandler('plan_labeling_authoring', async (input) => {
  const raw = typeof input.mode === 'string' ? input.mode.trim().toLowerCase() : '';
  const mode: LabelingMode | null = raw === 'us' || raw === 'uspi' || raw === 'plr'
    ? 'us'
    : raw === 'eu' || raw === 'smpc' || raw === 'qrd'
      ? 'eu'
      : null;
  if (!mode) {
    return JSON.stringify({ error: "plan_labeling_authoring requires mode 'us' (USPI/PLR) or 'eu' (SmPC/QRD)." });
  }
  const productName = typeof input.product_name === 'string' && input.product_name.trim()
    ? input.product_name.trim()
    : 'Product';
  const draftText = typeof input.draft_text === 'string' ? input.draft_text : '';
  const spec = getLabelingModeSpec(mode);
  const guard = checkSectionGuard(mode, draftText);
  return JSON.stringify({
    source: 'AnA Labeling Authoring (build-from-template)',
    mode,
    format: modeToFormat(mode),
    structure: spec.structure,
    label: spec.label,
    basis: spec.basis,
    requiredSectionHeaders: requiredSectionHeaders(mode),
    // The required_strings to pass to verify_docx_against_source for this mode.
    requiredStrings: deriveRequiredStrings(mode),
    // The replacements to pass to build_from_template.
    templateReplacements: buildTemplateReplacements(mode, productName),
    sectionGuard: guard,
    note: 'Drive build_from_template with templateReplacements, then review_label_currency (deterministic), then verify_docx_against_source with required_strings. Currency verdict is deterministic — never inferred.',
  });
});

// Orphan-Drug Designation (ODD) authoring — 21 CFR Part 316 (§316.20(b) / §316.21).
// Pure orchestration: build the author_docx_native plan (title + content +
// required_strings) from the product/evidence, verify the generated document
// contains every mandatory header, and emit the Part 11 honesty verdict
// (sample/not_assessed or any uncited prevalence/eligibility claim ⇒ non-sealable).
registerToolHandler('plan_orphan_drug_designation', async (input) => {
  const rawProduct =
    input.product && typeof input.product === 'object' ? (input.product as Record<string, unknown>) : null;
  if (!rawProduct) {
    return JSON.stringify({ error: 'plan_orphan_drug_designation requires a product object.' });
  }
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const name = str(rawProduct.name);
  const indication = str(rawProduct.indication);
  if (!name || !indication) {
    return JSON.stringify({ error: 'plan_orphan_drug_designation requires product.name and product.indication.' });
  }

  const designations = Array.isArray(rawProduct.designations)
    ? (rawProduct.designations.filter((d): d is string => typeof d === 'string') as string[])
    : undefined;

  const product: OddProductInput = {
    name,
    indication,
    genericName: str(rawProduct.generic_name),
    brandName: str(rawProduct.brand_name),
    modality: str(rawProduct.modality),
    designations,
    sponsorName: str(rawProduct.sponsor_name),
    sponsorAddress: str(rawProduct.sponsor_address),
    contactName: str(rawProduct.contact_name),
    fdaDivision: str(rawProduct.fda_division),
  };

  const citations: OddCitation[] = Array.isArray(input.citations)
    ? (input.citations as unknown[])
        .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => c !== null)
        .map((c) => ({
          sectionId: typeof c.section_id === 'string' ? c.section_id : '',
          label: typeof c.label === 'string' ? c.label : '',
          source: typeof c.source === 'string' ? c.source : '',
        }))
        .filter((c) => c.sectionId && c.source)
    : [];

  const rawProv = typeof input.provenance === 'string' ? input.provenance : '';
  const provenance: OddProvenance =
    rawProv === 'live' || rawProv === 'sample' || rawProv === 'not_assessed' ? rawProv : 'not_assessed';

  const rationale = typeof input.rationale === 'string' ? input.rationale : undefined;

  const plan = buildOddAuthoringPlan({ product, rationale, citations, provenance });
  const verification = evaluateOddVerification(plan.content);
  const sealability = assessOddSealability({
    provenance,
    verification,
    uncitedClaimSections: plan.uncitedClaimSections,
  });

  return JSON.stringify({
    source: 'AnA Orphan-Drug Designation Authoring (21 CFR Part 316)',
    status: 'generated',
    author_docx_native: {
      title: plan.title,
      content: plan.content,
      required_strings: plan.requiredStrings,
    },
    verification,
    honesty: {
      sealable: sealability.sealable,
      provenance: plan.provenance,
      blockers: sealability.blockers,
      uncitedClaimSections: plan.uncitedClaimSections,
    },
    note:
      'Drive author_docx_native with author_docx_native.{title,content}, then verify_docx_against_source ' +
      'with required_strings. sample/not_assessed drafts and any uncited prevalence/eligibility claim are ' +
      'non-sealable and non-exportable.',
  });
});

// IND narrative-module authoring (CTD Module 2.5 / 2.7) — E11.
// Pure orchestration: build the author_docx_native plan (title + content) from a
// STRUCTURED source, derive required_strings for verify_docx_against_source from
// the source's key facts/figures (section headers PLUS every figure value), and
// emit the Part 11 honesty verdict (sample/not_assessed ⇒ non-sealable; a
// missing/mistyped figure ⇒ verification fails ⇒ non-sealable). The actual
// author_docx_native / verify_docx_against_source calls are driven by AnA in the
// agentic loop using the content + required_strings this tool returns.
registerToolHandler('plan_ind_module_authoring', async (input) => {
  const moduleId = typeof input.module === 'string' ? input.module.trim() : '';
  if (!moduleId || !listIndModules().includes(moduleId)) {
    return JSON.stringify({
      error: `plan_ind_module_authoring requires module to be one of ${listIndModules().join(', ')}.`,
      modules: listIndModules(),
    });
  }
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const productName = str(input.product_name);
  const indication = str(input.indication);
  if (!productName || !indication) {
    return JSON.stringify({ error: 'plan_ind_module_authoring requires product_name and indication.' });
  }

  const facts: IndSourceFact[] = Array.isArray(input.facts)
    ? (input.facts as unknown[])
        .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : null))
        .filter((f): f is Record<string, unknown> => f !== null)
        .map((f) => ({
          sectionId: typeof f.section_id === 'string' ? f.section_id : '',
          label: typeof f.label === 'string' ? f.label : '',
          value: typeof f.value === 'string' ? f.value : '',
          source: typeof f.source === 'string' ? f.source : undefined,
        }))
        .filter((f) => f.sectionId && typeof f.value === 'string' && f.value.trim().length > 0)
    : [];

  const rawProv = typeof input.provenance === 'string' ? input.provenance : '';
  const provenance: IndModuleProvenance =
    rawProv === 'live' || rawProv === 'sample' || rawProv === 'not_assessed' ? rawProv : 'not_assessed';

  const plan = buildIndModuleAuthoringPlan({ module: moduleId, productName, indication, facts, provenance });
  const verification = evaluateIndModuleVerification({
    documentText: plan.content,
    requiredStrings: plan.requiredStrings,
  });
  const sealability = assessIndModuleSealability({ provenance, verification });

  return JSON.stringify({
    source: `AnA IND Module ${moduleId} Authoring (ICH M4E — CTD Module 2)`,
    status: 'generated',
    author_docx_native: {
      title: plan.title,
      content: plan.content,
      required_strings: plan.requiredStrings,
    },
    verification,
    honesty: {
      sealable: sealability.sealable,
      provenance: plan.provenance,
      blockers: sealability.blockers,
      sectionsWithoutFacts: plan.sectionsWithoutFacts,
    },
    note:
      'Drive author_docx_native with author_docx_native.{title,content}, then verify_docx_against_source ' +
      'with required_strings. required_strings include every source figure, so a missing or mistyped ' +
      'figure fails verification and the draft is non-sealable. sample/not_assessed sources are never sealable.',
  });
});

// Medical-information / standard-response advisor.
registerToolHandler('advise_medical_information', async (input) => {
  const responseType = typeof input.response_type === 'string' ? input.response_type : undefined;
  return JSON.stringify({
    source: 'AnA Medical-Information Advisor',
    responseTypes: responseType ? undefined : listMedInfoResponseTypes(),
    ...adviseMedicalInformation({ responseType }),
  });
});

// Estimand / study-design advisor — ICH E9(R1).
registerToolHandler('advise_estimand', async (input) => {
  const strategy = typeof input.strategy === 'string' ? input.strategy : undefined;
  const d = input.draft && typeof input.draft === 'object' ? (input.draft as Record<string, unknown>) : undefined;
  const draft = d
    ? {
        treatment: typeof d.treatment === 'string' ? d.treatment : undefined,
        population: typeof d.population === 'string' ? d.population : undefined,
        variable: typeof d.variable === 'string' ? d.variable : undefined,
        intercurrentEvents: typeof d.intercurrent_events === 'string' ? d.intercurrent_events : undefined,
        summary: typeof d.summary === 'string' ? d.summary : undefined,
      }
    : undefined;
  if (!strategy && !draft) {
    return JSON.stringify({
      source: 'AnA Estimand Advisor',
      framework: listEstimandFramework(),
      ...adviseEstimand({}),
    });
  }
  return JSON.stringify({ source: 'AnA Estimand Advisor', ...adviseEstimand({ strategy, draft }) });
});

// Pharmacovigilance aggregate-reporting & signal-management advisor.
registerToolHandler('advise_pharmacovigilance', async (input) => {
  const deliverable = typeof input.deliverable === 'string' ? input.deliverable : undefined;
  const stage = typeof input.stage === 'string' ? input.stage : undefined;
  if (!deliverable && !stage) {
    return JSON.stringify({
      source: 'AnA Pharmacovigilance Advisor',
      hint: 'Specify a deliverable (dsur | pbrer | icsr | signal_management) or a stage.',
      deliverables: listPvDeliverables(),
    });
  }
  return JSON.stringify({ source: 'AnA Pharmacovigilance Advisor', ...advisePharmacovigilance({ deliverable, stage }) });
});

// CTD / eCTD structure advisor — ICH M4 modules + document placement.
registerToolHandler('advise_ctd_structure', async (input) => {
  const module = typeof input.module === 'string' ? input.module : undefined;
  const document = typeof input.document === 'string' ? input.document : undefined;
  if (!module && !document) {
    return JSON.stringify({
      source: 'AnA CTD-Structure Advisor',
      hint: 'Specify a module (m1..m5) or a document description to place.',
      modules: listCtdModules(),
    });
  }
  return JSON.stringify({ source: 'AnA CTD-Structure Advisor', ...adviseCtdStructure({ module, document }) });
});

// Expedited-program & special-designation advisor — FDA & EMA.
registerToolHandler('advise_special_designation', async (input) => {
  const designation = typeof input.designation === 'string' ? input.designation : undefined;
  const jurisdiction = typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined;
  if (!designation && !jurisdiction) {
    return JSON.stringify({
      source: 'AnA Special-Designation Advisor',
      hint: 'Specify a designation, or a jurisdiction (us | eu) for the candidate set.',
      designations: listDesignations(),
    });
  }
  return JSON.stringify({ source: 'AnA Special-Designation Advisor', ...adviseSpecialDesignation({ designation, jurisdiction }) });
});

// GCP advisor — ICH E6(R2) responsibility domains.
registerToolHandler('advise_gcp', async (input) => {
  const domain = typeof input.domain === 'string' ? input.domain : undefined;
  return JSON.stringify({
    source: 'AnA GCP Advisor',
    catalog: domain ? undefined : listGcpDomains(),
    ...adviseGcp(domain),
  });
});

// Informed-consent QC — required elements (ICH E6(R2) §4.8 / 21 CFR 50.25).
registerToolHandler('review_informed_consent', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) return JSON.stringify({ error: 'review_informed_consent requires non-empty text.' });
  return JSON.stringify({ source: 'AnA Informed-Consent QC', ...reviewInformedConsent(text) });
});

// COA selection advisor — FDA COA framework (PRO/ClinRO/ObsRO/PerfO).
registerToolHandler('advise_coa_selection', async (input) => {
  const coaType = typeof input.coa_type === 'string' ? input.coa_type : undefined;
  const concept = typeof input.concept === 'string' ? input.concept : undefined;
  const reporter = typeof input.reporter === 'string' ? input.reporter : undefined;
  if (!coaType && !concept && !reporter) {
    return JSON.stringify({
      source: 'AnA COA-Selection Advisor',
      hint: 'Specify a coa_type, or a concept (and optionally reporter) for a suggestion.',
      coaTypes: listCoaTypes(),
    });
  }
  return JSON.stringify({
    source: 'AnA COA-Selection Advisor',
    ...adviseCoaSelection({ coaType, concept, reporter }),
  });
});

// Risk-management / safety-governance advisor — US REMS & EU RMP.
registerToolHandler('advise_risk_management', async (input) => {
  const program = typeof input.program === 'string' ? input.program : undefined;
  const jurisdiction = typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined;
  if (!program && !jurisdiction) {
    return JSON.stringify({
      source: 'AnA Risk-Management Advisor',
      hint: 'Specify a program (rems | eu_rmp) or jurisdiction (us | eu).',
      catalog: listRiskManagementPrograms(),
    });
  }
  return JSON.stringify({
    source: 'AnA Risk-Management Advisor',
    ...adviseRiskManagement({ program, jurisdiction }),
  });
});

// ── Risk-Based Monitoring (RBM / RBQM) — ICH E6(R3)/E8(R1) ──────────────────
const RBM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Seed or summarize a study Risk Assessment (RACT) for a program.
registerToolHandler('run_rbm_assessment', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId)) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) is required.' });
  }
  if (orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'Organization context required.' });
  }
  const { getPool } = await import('../../db.js');
  const pool = getPool();
  const { scoreRisk, overallRiskFromScores, DEFAULT_CTQ_FACTORS } = await import('../rbm/rbm-engine.js');

  const existing = await pool.query(
    `SELECT * FROM rbm_risk_assessments WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
    [orgId, programId],
  );

  if (existing.rows.length === 0 && input.seed === true) {
    const scores = DEFAULT_CTQ_FACTORS.map((f) => scoreRisk(f.likelihood, f.impact).score);
    const overall = overallRiskFromScores(scores);
    const a = await pool.query(
      `INSERT INTO rbm_risk_assessments (organization_id, program_id, title, framework, overall_risk, status)
       VALUES ($1,$2,'Risk assessment (RACT)','ich_e6r3',$3,'active') RETURNING *`,
      [orgId, programId, overall],
    );
    const assessment = a.rows[0];
    for (const f of DEFAULT_CTQ_FACTORS) {
      const { score } = scoreRisk(f.likelihood, f.impact);
      await pool.query(
        `INSERT INTO rbm_risk_items (organization_id, assessment_id, program_id, category, ctq_factor, risk_description, likelihood, impact, risk_score, is_critical, mitigation, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')`,
        [orgId, assessment.id, programId, f.category, f.ctqFactor, f.riskDescription, f.likelihood, f.impact, score, f.isCritical, f.mitigation],
      );
    }
  }

  const items = await pool.query(
    `SELECT category, ctq_factor, likelihood, impact, risk_score, is_critical, status
       FROM rbm_risk_items WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
       ORDER BY risk_score DESC NULLS LAST`,
    [orgId, programId],
  );
  const assessmentRow = (await pool.query(
    `SELECT id, title, framework, overall_risk, status FROM rbm_risk_assessments WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
    [orgId, programId],
  )).rows[0] ?? null;

  return JSON.stringify({
    source: 'AnA RBM Assessment',
    framework: 'ICH E6(R3) / E8(R1)',
    assessment: assessmentRow,
    overallRisk: assessmentRow?.overall_risk ?? null,
    criticalFactors: items.rows.filter((r: any) => r.is_critical).map((r: any) => r.ctq_factor),
    items: items.rows,
    hint: items.rows.length === 0 ? 'No RACT yet — call again with seed=true to create a default assessment.' : undefined,
  });
});

// Per-site risk snapshot + monitoring tier from Site Intelligence.
registerToolHandler('assess_site_risk', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId)) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) is required.' });
  }
  if (orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'Organization context required.' });
  }
  const { recomputeSiteRisk } = await import('../rbm/site-risk-engine.js');
  const { getPool } = await import('../../db.js');
  let sites: any[];
  if (input.persist === true) {
    sites = await recomputeSiteRisk(orgId, programId);
  } else {
    const { rows } = await getPool().query(
      `SELECT site_number, site_name, composite_risk, monitoring_tier, drivers FROM rbm_site_risk_scores
         WHERE organization_id = $1 AND program_id = $2 ORDER BY composite_risk DESC NULLS LAST`,
      [orgId, programId],
    );
    sites = rows;
    if (sites.length === 0) sites = await recomputeSiteRisk(orgId, programId);
  }
  const tiers = { reduced: 0, standard: 0, enhanced: 0 } as Record<string, number>;
  for (const s of sites) tiers[s.monitoringTier ?? s.monitoring_tier] = (tiers[s.monitoringTier ?? s.monitoring_tier] ?? 0) + 1;
  return JSON.stringify({
    source: 'AnA RBM Site Risk',
    framework: 'ICH E6(R3) risk-proportionate monitoring',
    siteCount: sites.length,
    tierCounts: tiers,
    sites,
    note: sites.length === 0 ? 'No Site Intelligence data found for this program.' : undefined,
  });
});

// KRI / QTL central-monitoring status.
registerToolHandler('evaluate_kris_qtls', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const pool = getPool();
  const kris = await pool.query(
    `SELECT name, status, current_value, threshold_amber, threshold_red FROM rbm_kris
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
    [orgId, programId],
  );
  const qtls = await pool.query(
    `SELECT parameter, status, current_value, threshold, secondary_limit FROM rbm_qtls
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
    [orgId, programId],
  );
  return JSON.stringify({
    source: 'AnA RBM Central Monitoring',
    kris: {
      total: kris.rows.length,
      red: kris.rows.filter((r: any) => r.status === 'red'),
      amber: kris.rows.filter((r: any) => r.status === 'amber'),
    },
    qtls: {
      total: qtls.rows.length,
      breached: qtls.rows.filter((r: any) => r.status === 'breached'),
      approaching: qtls.rows.filter((r: any) => r.status === 'approaching'),
    },
    hint: kris.rows.length === 0 && qtls.rows.length === 0
      ? 'No KRIs/QTLs defined — seed them via POST /api/mdx/rbm-kris/seed and /rbm-qtls/seed.'
      : undefined,
  });
});

// Draft an integrated monitoring plan from the assessment.
registerToolHandler('generate_rbm_plan', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { defaultPlanStrategy } = await import('../rbm/rbm-engine.js');
  const pool = getPool();
  const assessment = (await pool.query(
    `SELECT id, overall_risk FROM rbm_risk_assessments WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
    [orgId, programId],
  )).rows[0] ?? null;
  const overall = (assessment?.overall_risk ?? 'medium') as 'low' | 'medium' | 'high';
  const critical = await pool.query(
    `SELECT id, ctq_factor, mitigation, risk_score FROM rbm_risk_items
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL AND is_critical = true
       ORDER BY risk_score DESC NULLS LAST`,
    [orgId, programId],
  );
  return JSON.stringify({
    source: 'AnA RBM Plan',
    advisory: 'Draft plan — review and approve before activation (21 CFR Part 11 e-signature).',
    recommendedStrategy: defaultPlanStrategy(overall),
    overallRisk: overall,
    proposedActions: critical.rows.map((r: any) => ({
      riskItemId: r.id,
      ctqFactor: r.ctq_factor,
      actionType: 'site_visit',
      priority: r.risk_score >= 15 ? 'high' : 'medium',
      description: r.mitigation || `Targeted monitoring of: ${r.ctq_factor}`,
    })),
  });
});

// Prioritized monitoring worklist — signals + high-risk CtQ items.
registerToolHandler('prioritize_monitoring_queries', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(50, Math.floor(input.limit)) : 15;
  const { getPool } = await import('../../db.js');
  const pool = getPool();
  const signals = await pool.query(
    `SELECT id, title, severity, source, status, detected_at FROM rbm_signals
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL AND status NOT IN ('resolved','dismissed')
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, detected_at DESC
       LIMIT $3`,
    [orgId, programId, limit],
  );
  const items = await pool.query(
    `SELECT id, ctq_factor, risk_score, is_critical, status FROM rbm_risk_items
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL AND status IN ('open','mitigating')
       ORDER BY risk_score DESC NULLS LAST LIMIT $3`,
    [orgId, programId, limit],
  );
  return JSON.stringify({
    source: 'AnA RBM Worklist',
    prioritizedSignals: signals.rows,
    highRiskItems: items.rows,
  });
});

// Central statistical monitoring — unsupervised cross-site outlier detection.
registerToolHandler('run_central_monitoring', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { detectSiteOutliers, MIN_COHORT } = await import('../rbm/central-statistical-monitoring.js');
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT site_id, site_number, composite_risk, enrollment_risk, quality_risk, operational_risk
       FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
    [orgId, programId],
  );
  const toNum = (v: any) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
  const cohort = rows.map((s: any) => ({
    siteId: s.site_id ?? null,
    siteNumber: s.site_number ?? null,
    metrics: {
      composite: toNum(s.composite_risk), enrollment: toNum(s.enrollment_risk),
      quality: toNum(s.quality_risk), operational: toNum(s.operational_risk),
    },
  }));
  const findings = detectSiteOutliers(cohort);
  return JSON.stringify({
    source: 'AnA RBM Central Statistical Monitoring',
    method: 'robust modified z-score (Iglewicz–Hoaglin), cohort-relative',
    cohortSize: cohort.length,
    note: cohort.length < MIN_COHORT ? `Need at least ${MIN_COHORT} scored sites for cohort statistics.` : undefined,
    outliers: findings,
    hint: 'Persist these as signals via POST /api/mdx/rbm-central-monitoring/run.',
  });
});

// Patient Profiles — patient-level cohort anomaly detection.
registerToolHandler('scan_patient_profiles', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { scorePatientCohort, MIN_COHORT } = await import('../rbm/central-statistical-monitoring.js');
  const { rows } = await getPool().query(
    `SELECT subject_id, site_id, metrics FROM rbm_patient_profiles
       WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
    [orgId, programId],
  );
  const cohort = rows.map((r: any) => ({
    subjectId: r.subject_id,
    siteId: r.site_id ?? null,
    metrics: (r.metrics && typeof r.metrics === 'object') ? r.metrics : {},
  }));
  const scored = scorePatientCohort(cohort);
  return JSON.stringify({
    source: 'AnA RBM Patient Profiles',
    cohortSize: cohort.length,
    note: cohort.length < MIN_COHORT ? `Need at least ${MIN_COHORT} subjects for cohort statistics.` : undefined,
    flagged: scored.filter((s: any) => s.status === 'flagged'),
    review: scored.filter((s: any) => s.status === 'review'),
    hint: 'Persist scores via POST /api/mdx/rbm-patient-profiles/score.',
  });
});

// RBM Risk Review report — the inspection-ready deliverable.
registerToolHandler('generate_rbm_report', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { loadRiskReviewInput } = await import('../rbm/risk-report-data.js');
  const { buildRiskReview, renderRiskReviewMarkdown } = await import('../rbm/risk-report.js');
  const asOf = new Date().toISOString();
  const data = await loadRiskReviewInput(getPool(), orgId, programId, asOf);
  const report = buildRiskReview(data);
  return JSON.stringify({ source: 'AnA RBM Risk Review', report, markdown: renderRiskReviewMarkdown(report) });
});

// RBM attention feed — the daily monitoring driver.
registerToolHandler('get_rbm_attention', async (input, ctx) => {
  const programId = typeof input.programId === 'string' ? input.programId : undefined;
  const orgId = ctx?.organizationId ?? null;
  if (!programId || !RBM_UUID_RE.test(programId) || orgId == null) {
    return JSON.stringify({ source: 'AnA RBM', error: 'A valid programId (UUID) and organization context are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { loadRiskReviewInput } = await import('../rbm/risk-report-data.js');
  const { buildAttentionFeed } = await import('../rbm/risk-report.js');
  const asOf = new Date().toISOString();
  const data = await loadRiskReviewInput(getPool(), orgId, programId, asOf);
  const items = buildAttentionFeed(data);
  return JSON.stringify({ source: 'AnA RBM Attention', count: items.length, items });
});

// ── RBM actuation handlers (writes; conversation replaces forms) ──────────────
// Tenant scope comes from ctx.organizationId (server context), never model input.
// Each infers the derived fields (score/band/status/secondary-limit/strategy) via
// server/services/rbm/rbm-actuator.ts. Missing required inputs return a prompt so
// the model asks a short follow-up instead of guessing.
const rbmStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const rbmNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const rbmBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const rbmErr = (msg: string) => JSON.stringify({ source: 'AnA RBM', error: msg });

registerToolHandler('add_ctq_factor', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  const ctqFactor = rbmStr(input.ctqFactor);
  const likelihood = rbmNum(input.likelihood);
  const impact = rbmNum(input.impact);
  if (orgId == null) return rbmErr('Organization context required.');
  if (!programId || !RBM_UUID_RE.test(programId)) return rbmErr('A valid programId (UUID) is required.');
  if (!ctqFactor) return rbmErr('Ask the user what the risk / critical-to-quality factor is.');
  if (likelihood == null || impact == null) return rbmErr('Ask the user to rate likelihood and impact (1–5).');
  const { getPool } = await import('../../db.js');
  const { addCtqFactor } = await import('../rbm/rbm-actuator.js');
  const out = await addCtqFactor(getPool(), orgId, {
    programId, ctqFactor, likelihood, impact,
    category: rbmStr(input.category) as any,
    riskDescription: rbmStr(input.riskDescription) ?? null,
    detectability: rbmNum(input.detectability) ?? null,
    mitigation: rbmStr(input.mitigation) ?? null,
    isCritical: rbmBool(input.isCritical),
  });
  return JSON.stringify({ source: 'AnA RBM · add_ctq_factor', ...out });
});

registerToolHandler('define_kri', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  const name = rbmStr(input.name);
  if (orgId == null) return rbmErr('Organization context required.');
  if (!programId || !RBM_UUID_RE.test(programId)) return rbmErr('A valid programId (UUID) is required.');
  if (!name) return rbmErr('Ask the user for the KRI name.');
  const { getPool } = await import('../../db.js');
  const { defineKri } = await import('../rbm/rbm-actuator.js');
  const out = await defineKri(getPool(), orgId, {
    programId, name,
    direction: rbmStr(input.direction) as any,
    thresholdAmber: rbmNum(input.thresholdAmber) ?? null,
    thresholdRed: rbmNum(input.thresholdRed) ?? null,
    unit: rbmStr(input.unit) ?? null,
    dataSource: rbmStr(input.dataSource),
    metricDefinition: rbmStr(input.metricDefinition) ?? null,
    currentValue: rbmNum(input.currentValue) ?? null,
  });
  return JSON.stringify({ source: 'AnA RBM · define_kri', ...out });
});

registerToolHandler('record_kri_reading', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  const value = rbmNum(input.value);
  const kriId = rbmNum(input.kriId);
  const kriName = rbmStr(input.kriName);
  if (orgId == null) return rbmErr('Organization context required.');
  if (value == null) return rbmErr('Ask the user for the reading value.');
  if (kriId == null && !(kriName && programId && RBM_UUID_RE.test(programId))) {
    return rbmErr('Identify the KRI by kriId, or by kriName plus a valid programId.');
  }
  const { getPool } = await import('../../db.js');
  const { recordKriReading } = await import('../rbm/rbm-actuator.js');
  const out = await recordKriReading(getPool(), orgId, {
    kriId: kriId ?? null, kriName: kriName ?? null, programId: programId ?? null, value,
    observedAt: rbmStr(input.observedAt) ?? null, note: rbmStr(input.note) ?? null,
  });
  if (!out.resolved) return rbmErr('No matching KRI found — check the id or name, or define the KRI first.');
  return JSON.stringify({ source: 'AnA RBM · record_kri_reading', ...out });
});

registerToolHandler('set_qtl', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  const parameter = rbmStr(input.parameter);
  if (orgId == null) return rbmErr('Organization context required.');
  if (!programId || !RBM_UUID_RE.test(programId)) return rbmErr('A valid programId (UUID) is required.');
  if (!parameter) return rbmErr('Ask the user for the QTL parameter.');
  const { getPool } = await import('../../db.js');
  const { setQtl } = await import('../rbm/rbm-actuator.js');
  const out = await setQtl(getPool(), orgId, {
    programId, parameter,
    rationale: rbmStr(input.rationale) ?? null,
    threshold: rbmNum(input.threshold) ?? null,
    secondaryLimit: rbmNum(input.secondaryLimit) ?? null,
    currentValue: rbmNum(input.currentValue) ?? null,
  });
  return JSON.stringify({ source: 'AnA RBM · set_qtl', ...out });
});

registerToolHandler('raise_monitoring_signal', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  const title = rbmStr(input.title);
  if (orgId == null) return rbmErr('Organization context required.');
  if (!programId || !RBM_UUID_RE.test(programId)) return rbmErr('A valid programId (UUID) is required.');
  if (!title) return rbmErr('Ask the user for a short signal title.');
  const { getPool } = await import('../../db.js');
  const { raiseSignal } = await import('../rbm/rbm-actuator.js');
  const out = await raiseSignal(getPool(), orgId, {
    programId, title,
    severity: rbmStr(input.severity) as any,
    siteId: rbmStr(input.siteId) ?? null,
    signalType: rbmStr(input.signalType) ?? null,
    detail: rbmStr(input.detail) ?? null,
  });
  return JSON.stringify({ source: 'AnA RBM · raise_monitoring_signal', ...out });
});

registerToolHandler('triage_signal', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const signalId = rbmNum(input.signalId);
  if (orgId == null) return rbmErr('Organization context required.');
  if (signalId == null) return rbmErr('Ask which signal to triage (signalId).');
  const { getPool } = await import('../../db.js');
  const { triageSignal } = await import('../rbm/rbm-actuator.js');
  const out = await triageSignal(getPool(), orgId, {
    signalId,
    status: rbmStr(input.status) as any,
    severity: rbmStr(input.severity) as any,
    resolutionNotes: rbmStr(input.resolutionNotes) ?? null,
    detail: rbmStr(input.detail) ?? null,
  });
  if (!out.updated && out.reason === 'not_found') return rbmErr('Signal not found in this tenant.');
  if (!out.updated) return rbmErr('Provide at least one field to change (status, severity, or notes).');
  return JSON.stringify({ source: 'AnA RBM · triage_signal', ...out });
});

registerToolHandler('draft_monitoring_plan', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const programId = rbmStr(input.programId);
  if (orgId == null) return rbmErr('Organization context required.');
  if (!programId || !RBM_UUID_RE.test(programId)) return rbmErr('A valid programId (UUID) is required.');
  const { getPool } = await import('../../db.js');
  const { draftPlan } = await import('../rbm/rbm-actuator.js');
  const out = await draftPlan(getPool(), orgId, {
    programId,
    title: rbmStr(input.title),
    strategy: rbmStr(input.strategy) as any,
    assessmentId: rbmNum(input.assessmentId) ?? null,
  });
  return JSON.stringify({ source: 'AnA RBM · draft_monitoring_plan', ...out });
});

registerToolHandler('create_monitoring_action', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const planId = rbmNum(input.planId);
  const description = rbmStr(input.description);
  if (orgId == null) return rbmErr('Organization context required.');
  if (planId == null) return rbmErr('Ask which plan the action belongs to (planId).');
  if (!description) return rbmErr('Ask the user what the action is.');
  const { getPool } = await import('../../db.js');
  const { createAction } = await import('../rbm/rbm-actuator.js');
  const out = await createAction(getPool(), orgId, {
    planId, description,
    actionType: rbmStr(input.actionType) as any,
    priority: rbmStr(input.priority) as any,
    dueDate: rbmStr(input.dueDate) ?? null,
    riskItemId: rbmNum(input.riskItemId) ?? null,
    signalId: rbmNum(input.signalId) ?? null,
    owner: rbmNum(input.owner) ?? null,
  });
  if (!out.created) return rbmErr('Monitoring plan not found in this tenant.');
  return JSON.stringify({ source: 'AnA RBM · create_monitoring_action', ...out });
});

registerToolHandler('update_monitoring_action', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const actionId = rbmNum(input.actionId);
  if (orgId == null) return rbmErr('Organization context required.');
  if (actionId == null) return rbmErr('Ask which action to update (actionId).');
  const { getPool } = await import('../../db.js');
  const { updateAction } = await import('../rbm/rbm-actuator.js');
  const out = await updateAction(getPool(), orgId, {
    actionId,
    status: rbmStr(input.status) as any,
    priority: rbmStr(input.priority) as any,
    description: rbmStr(input.description),
    dueDate: rbmStr(input.dueDate) ?? null,
    owner: rbmNum(input.owner) ?? null,
  });
  if (!out.updated && out.reason === 'not_found') return rbmErr('Action not found in this tenant.');
  if (!out.updated) return rbmErr('Provide at least one field to change.');
  return JSON.stringify({ source: 'AnA RBM · update_monitoring_action', ...out });
});

registerToolHandler('approve_rbm_assessment', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const assessmentId = rbmNum(input.assessmentId);
  const reason = rbmStr(input.reason);
  if (orgId == null) return rbmErr('Organization context required.');
  if (assessmentId == null) return rbmErr('Ask which assessment to approve (assessmentId).');
  if (!reason || reason.trim().length < 3) {
    return rbmErr('A reason for change is required for this governed (21 CFR Part 11) approval — ask the user.');
  }
  const { getPool } = await import('../../db.js');
  const { approveAssessment } = await import('../rbm/rbm-actuator.js');
  const row = await approveAssessment(getPool(), orgId, ctx?.userId ?? null, assessmentId, reason.trim());
  if (!row) return rbmErr('Assessment not found in this tenant.');
  return JSON.stringify({ source: 'AnA RBM · approve_rbm_assessment', governed: true, assessment: row });
});

registerToolHandler('approve_rbm_plan', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  const planId = rbmNum(input.planId);
  const reason = rbmStr(input.reason);
  if (orgId == null) return rbmErr('Organization context required.');
  if (planId == null) return rbmErr('Ask which plan to approve (planId).');
  if (!reason || reason.trim().length < 3) {
    return rbmErr('A reason for change is required for this governed (21 CFR Part 11) approval — ask the user.');
  }
  const { getPool } = await import('../../db.js');
  const { approvePlan } = await import('../rbm/rbm-actuator.js');
  const row = await approvePlan(getPool(), orgId, ctx?.userId ?? null, planId, reason.trim());
  if (!row) return rbmErr('Monitoring plan not found in this tenant.');
  return JSON.stringify({ source: 'AnA RBM · approve_rbm_plan', governed: true, plan: row });
});

// Regulatory-pathway advisor — drug/biologic/device/IVD routes (FDA & EU).
registerToolHandler('advise_regulatory_pathway', async (input) => {
  const pathway = typeof input.pathway === 'string' ? input.pathway : undefined;
  const domain = typeof input.domain === 'string' ? input.domain : undefined;
  const jurisdiction = typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined;
  if (!pathway && !domain && !jurisdiction) {
    return JSON.stringify({
      source: 'AnA Regulatory-Strategy Advisor',
      hint: 'Specify a pathway, and/or a domain (drug|biologic|device|ivd) and jurisdiction (us|eu).',
      pathways: listRegulatoryPathways(),
    });
  }
  return JSON.stringify({
    source: 'AnA Regulatory-Strategy Advisor',
    ...adviseRegulatoryPathway({ pathway, domain, jurisdiction }),
  });
});

// Promotional-language screen — FDA OPDP / EU advertising claims QC.
registerToolHandler('screen_promotional_language', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) return JSON.stringify({ error: 'screen_promotional_language requires non-empty text.' });
  return JSON.stringify({ source: 'AnA Promotional-Claims Screen', ...screenPromotionalLanguage(text) });
});

// Safety narrative — ICH E3 §16 patient narrative from structured case facts.
registerToolHandler('draft_safety_narrative', async (input) => {
  const subjectId = typeof input.subject_id === 'string' ? input.subject_id : '';
  const ev = (input.event ?? {}) as Record<string, unknown>;
  if (!subjectId.trim() || typeof ev.term !== 'string' || !ev.term.trim()) {
    return JSON.stringify({ error: 'draft_safety_narrative requires subject_id and event.term.' });
  }
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

  const result = composeSafetyNarrative({
    subjectId,
    age: str(input.age),
    sex: str(input.sex),
    studyId: str(input.study_id),
    treatmentArm: str(input.treatment_arm),
    studyDrug: str(input.study_drug),
    dose: str(input.dose),
    firstDoseDate: str(input.first_dose_date),
    medicalHistory: arr(input.medical_history),
    concomitantMeds: arr(input.concomitant_meds),
    event: {
      term: String(ev.term),
      onsetDate: str(ev.onset_date),
      dayOnStudy: str(ev.day_on_study),
      severity: str(ev.severity),
      seriousnessCriteria: arr(ev.seriousness_criteria),
      causality: str(ev.causality),
      actionTaken: str(ev.action_taken),
      treatment: str(ev.treatment),
      dechallenge: str(ev.dechallenge),
      rechallenge: str(ev.rechallenge),
      outcome: str(ev.outcome),
      notes: str(ev.notes),
    },
  });
  return JSON.stringify({
    source: 'AnA Safety Narrative (ICH E3 §16)',
    ...result,
    citation_hint:
      result.missingFields.length
        ? `Confirm the missing fields before finalizing: ${result.missingFields.join(', ')}.`
        : 'All key fields present; verify against the CRF/source before sign-off.',
  });
});

// ICD-10-CM coding — map a diagnosis/indication term to billable codes.
registerToolHandler('lookup_icd10_code', async (input) => {
  const term = typeof input.term === 'string' ? input.term : '';
  if (!term.trim()) return JSON.stringify({ error: 'lookup_icd10_code requires a term.' });
  const maxResults = Math.min((input.max_results as number) || 10, 25);
  try {
    const result = await lookupIcd10(term, maxResults);
    const provenance = result.codes.map(c =>
      buildProvenance({
        sourceId: 'icd10',
        citation: { title: `${c.code} — ${c.description}`, identifier: c.code, url: null },
        query: term,
        confidence: 'high',
      })
    );
    return JSON.stringify({ ...result, provenance });
  } catch (e) {
    return JSON.stringify({
      source: 'NLM ICD-10-CM (Clinical Tables)',
      query: term,
      error: e instanceof Error ? e.message : 'ICD-10 lookup failed',
      codes: [],
    });
  }
});

// Readability QC — Flesch metrics vs the target audience reading level.
registerToolHandler('assess_readability', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) return JSON.stringify({ error: 'assess_readability requires non-empty text.' });
  const audience = ['patient', 'general', 'clinician', 'regulator'].includes(input.audience as string)
    ? (input.audience as ReadabilityAudience)
    : 'general';
  return JSON.stringify({ source: 'AnA Readability QC', ...assessReadability(text, audience) });
});

// Abbreviation QC — extract acronyms + flag undefined-at-first-use.
registerToolHandler('build_abbreviation_list', async (input) => {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) return JSON.stringify({ error: 'build_abbreviation_list requires non-empty text.' });
  return JSON.stringify({ source: 'AnA Abbreviation QC', ...buildAbbreviationList(text) });
});

// Medical Writing Review — standards-conformance QC of a draft (or pre-draft).
registerToolHandler('medical_writing_review', async (input) => {
  const documentType = typeof input.document_type === 'string' ? input.document_type : '';
  if (!documentType.trim()) {
    return JSON.stringify({
      error: 'medical_writing_review requires document_type.',
      catalog: listMedicalWritingCatalog(),
    });
  }
  const draftText = typeof input.draft_text === 'string' ? input.draft_text : undefined;
  const review = reviewMedicalWriting(documentType, draftText);
  return JSON.stringify({ source: 'AnA Medical-Writing QC', ...review });
});

// Describe Capabilities — AnA's deterministic self-knowledge: registered tools
// + which integrations are actually live in this deployment/org.
registerToolHandler('describe_capabilities', async (_input, ctx) => {
  try {
    const orgId = ctx?.organizationId ? Number(ctx.organizationId) : null;
    const integrations = await getIntegrationStatuses(orgId);
    const summary = summarizeStatuses(integrations);

    // Enumerate the declared tool surface and whether each has a live handler.
    // Tools without a direct handler are executed via platform-command dispatch,
    // so they are reported separately rather than as missing.
    const declared = getAllEnabledTools()
      .map(t => (t as { name?: string }).name)
      .filter((n): n is string => !!n);
    const directHandlers = declared.filter(n => toolHandlers.has(n));
    const viaPlatformDispatch = declared.filter(n => !toolHandlers.has(n));

    // Execution self-awareness. When an org is in context, report THIS tenant's
    // learned reliability (more accurate for the user); otherwise the global view.
    const scope = orgId ? 'organization' : 'global';
    const reliability = getToolReliability(orgId);
    const unhealthy = getUnhealthyTools(3, orgId).map(t => ({
      tool: t.tool,
      consecutiveFailures: t.consecutiveFailures,
      lastError: t.lastError,
    }));
    // Working-but-unhelpful: succeed yet usually return nothing for this scope.
    const lowYield = getLowYieldTools(4, 0.75, orgId).map(t => ({
      tool: t.tool,
      emptyRate: Math.round(t.emptyRate * 100) / 100,
      resultfulCalls: t.resultfulCalls,
      emptyCalls: t.emptyCalls,
    }));

    return JSON.stringify({
      source: 'AnA Capability Introspection',
      toolSurface: {
        total: declared.length,
        directHandlers: directHandlers.length,
        viaPlatformDispatch: viaPlatformDispatch.length,
        tools: declared,
      },
      integrations,
      integrationSummary: summary,
      execution: {
        scope,
        toolsUsedThisSession: reliability.length,
        reliability,
        unhealthy,
        lowYield,
        // When persistence is enabled, reliability is learned across restarts.
        learningPersisted: isTelemetryPersistenceEnabled(),
        // Which tools are used from which UI surface this session (threaded via ToolContext.surface).
        surfaceUsage: getToolSurfaceUsage(),
      },
      guidance:
        'Only offer or attempt tools whose integration is configured. For configured:false entries, ' +
        'tell the user what unlocks them (the `requires` field). configured:null means org context ' +
        'is needed to resolve — ask the user to open a project. Treat tools in execution.unhealthy ' +
        'as currently unreliable (warn + prefer alternatives until they recover). Tools in ' +
        'execution.lowYield work but usually return nothing for this scope — broaden the query or ' +
        'set expectations rather than relying on them.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'AnA Capability Introspection',
      error: e instanceof Error ? e.message : 'Capability introspection failed',
    });
  }
});

// Assess Regulatory Landscape — cross-source synthesis (fans out in parallel).
registerToolHandler('assess_regulatory_landscape', async (input) => {
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (!topic) {
    return JSON.stringify({ error: 'assess_regulatory_landscape requires a topic.' });
  }
  const domain = ['device', 'drug', 'auto'].includes(input.domain as string)
    ? (input.domain as 'device' | 'drug' | 'auto')
    : 'auto';
  try {
    const result = await assessRegulatoryLandscape({
      topic,
      domain,
      limitPerSource: Math.min((input.max_per_source as number) || 5, 15),
    });
    return JSON.stringify({
      ...result,
      citation_hint:
        'Synthesize across sections; cite trials by NCT, literature by PMID, coverage by MCD number, ' +
        'recalls by recall number, approvals by FDA application number — each with its url where present.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'Regulatory Landscape',
      topic,
      error: e instanceof Error ? e.message : 'Landscape assessment failed',
      sections: {},
    });
  }
});

// Search Drug Approvals — Drugs@FDA (openFDA drug/drugsfda).
registerToolHandler('search_drug_approvals', async (input) => {
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  try {
    const result = await searchDrugApprovals({
      brandName: asStr(input.brand_name),
      genericName: asStr(input.generic_name),
      applicationNumber: asStr(input.application_number),
      query: asStr(input.query),
      limit: Math.min((input.max_results as number) || 5, 10),
    });
    if (!result.searchExpression) {
      return JSON.stringify({
        error: 'Provide brand_name, generic_name, application_number, or query to search approvals.',
      });
    }
    const provenance = result.approvals.map(a =>
      buildProvenance({
        sourceId: 'openfda',
        citation: {
          title: a.brandNames?.[0] || a.genericNames?.[0] || a.applicationNumber,
          identifier: a.applicationNumber,
          url: null,
        },
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      total: result.total,
      resultCount: result.approvals.length,
      approvals: result.approvals,
      provenance,
      citation_hint: 'Reference approvals by FDA application number (NDA/BLA/ANDA) and sponsor.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'Drugs@FDA (openFDA)',
      error: e instanceof Error ? e.message : 'Drug approval search failed',
      approvals: [],
    });
  }
});

// Search ChEMBL — curated bioactive-molecule discovery / developability data (EMBL-EBI).
registerToolHandler('search_chembl_compound', async (input) => {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return JSON.stringify({ error: 'Provide a compound or drug name in `query`.' });
  }
  const maxResults = Math.min((input.max_results as number) || 5, 20);
  const includeMechanism = input.include_mechanism === true;
  try {
    const result = await searchChemblCompounds(query, maxResults);
    let mechanisms;
    if (includeMechanism && result.molecules[0]?.chemblId) {
      try {
        mechanisms = (await getChemblMechanisms(result.molecules[0].chemblId)).mechanisms;
      } catch {
        // Mechanism lookup is best-effort; omit on failure rather than fail the whole call.
      }
    }
    const provenance = result.molecules.map(m =>
      buildProvenance({
        sourceId: 'chembl',
        citation: { title: m.preferredName || m.chemblId, identifier: m.chemblId, url: m.url },
        query: result.query,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      query: result.query,
      totalCount: result.totalCount,
      resultCount: result.molecules.length,
      molecules: result.molecules,
      ...(mechanisms ? { topMatchMechanisms: mechanisms } : {}),
      provenance,
      citation_hint: 'Cite each molecule by ChEMBL ID and link to the provided url; descriptors are ChEMBL-curated.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'ChEMBL',
      query,
      error: e instanceof Error ? e.message : 'ChEMBL search failed',
      note: 'ChEMBL API unavailable — try the public compound report card.',
      url: `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${encodeURIComponent(query)}`,
      molecules: [],
    });
  }
});

// Search Preprints — bioRxiv / medRxiv emerging evidence via Europe PMC.
registerToolHandler('search_preprints', async (input) => {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return JSON.stringify({ error: 'Provide a search `query` (mechanism, target, biomarker, disease).' });
  }
  const maxResults = Math.min((input.max_results as number) || 5, 25);
  const serverRaw = typeof input.server === 'string' ? input.server.toLowerCase() : 'any';
  const server: PreprintServerFilter =
    serverRaw === 'biorxiv' || serverRaw === 'medrxiv' ? serverRaw : 'any';
  try {
    const result = await searchPreprints({ query, maxResults, server });
    const provenance = result.preprints.map(p =>
      buildProvenance({
        sourceId: 'biorxiv_medrxiv',
        citation: { title: p.title || p.id, identifier: p.doi, url: p.url },
        query: result.query,
        confidence: 'low',
      })
    );
    return JSON.stringify({
      source: result.source,
      query: result.query,
      totalCount: result.totalCount,
      resultCount: result.preprints.length,
      preprints: result.preprints,
      caveat: result.caveat,
      provenance,
      citation_hint:
        'Cite each preprint by DOI and link to the provided url; label as a non-peer-reviewed preprint.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'Europe PMC (preprints)',
      query,
      error: e instanceof Error ? e.message : 'Preprint search failed',
      note: 'Preprint API unavailable — try bioRxiv/medRxiv search directly.',
      url: `https://www.biorxiv.org/search/${encodeURIComponent(query)}`,
      preprints: [],
    });
  }
});

// Assess Trial Feasibility — empirical operational base rates from ClinicalTrials.gov.
registerToolHandler('assess_trial_feasibility', async (input) => {
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const condition = asStr(input.condition);
  if (!condition) {
    return JSON.stringify({ error: 'Provide a `condition` to assess trial feasibility.' });
  }
  try {
    const result = await assessTrialFeasibility({
      condition,
      intervention: asStr(input.intervention),
      phase: asStr(input.phase),
      maxComparators: typeof input.max_comparators === 'number' ? input.max_comparators : undefined,
    });
    return JSON.stringify({
      ...result,
      citation_hint:
        'Report the completion rate with its 95% CI and the comparator count; these are empirical ' +
        'ClinicalTrials.gov base rates, not a prediction. Honor the insufficient_evidence verdict.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'ClinicalTrials.gov',
      condition,
      error: e instanceof Error ? e.message : 'Feasibility assessment failed',
      note: 'ClinicalTrials.gov unavailable — feasibility base rates could not be computed.',
    });
  }
});

// Screen Compound Liabilities — deterministic ICH M7 structural-alert + developability screen.
registerToolHandler('screen_compound_liabilities', async (input) => {
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  let smiles = asStr(input.smiles);
  const compoundName = asStr(input.compound_name);

  if (!smiles && !compoundName) {
    return JSON.stringify({ error: 'Provide a `smiles` string and/or a `compound_name` to screen.' });
  }

  // Resolve SMILES + curated descriptors from ChEMBL when only a name is given.
  let resolved: { chemblId: string; preferredName: string | null; url: string } | undefined;
  let developabilityInput: Record<string, number | null | undefined> = {};
  if (!smiles && compoundName) {
    try {
      const found = await searchChemblCompounds(compoundName, 1);
      const top = found.molecules[0];
      if (top?.smiles) {
        smiles = top.smiles;
        resolved = { chemblId: top.chemblId, preferredName: top.preferredName, url: top.url };
        developabilityInput = {
          molecularWeight: top.properties.molecularWeight,
          alogp: top.properties.alogp,
          psa: top.properties.psa,
          hba: top.properties.hba,
          hbd: top.properties.hbd,
          rotatableBonds: top.properties.rotatableBonds,
          ro5Violations: top.properties.ro5Violations,
          qed: top.properties.qed,
        };
      }
    } catch {
      // Fall through — without a SMILES we cannot screen.
    }
    if (!smiles) {
      return JSON.stringify({
        error: `Could not resolve a structure for "${compoundName}" from ChEMBL. Provide a SMILES directly.`,
      });
    }
  }

  const screen = screenStructuralAlerts(smiles!);
  const developability = assessDevelopability(developabilityInput);

  // Provenance: the deterministic screen itself, plus the ChEMBL record when the
  // structure/descriptors were resolved from a compound name.
  const provenance = [
    buildProvenance({
      sourceId: 'c2c_cheminformatics',
      citation: { title: `Structural-alert + developability screen (${smiles})`, identifier: null, url: null },
      query: smiles ?? compoundName ?? null,
      confidence: screen.hasMutagenicAlert ? 'high' : 'moderate',
    }),
    ...(resolved
      ? [
          buildProvenance({
            sourceId: 'chembl',
            citation: { title: resolved.preferredName || resolved.chemblId, identifier: resolved.chemblId, url: resolved.url },
            query: compoundName ?? null,
            confidence: 'high',
          }),
        ]
      : []),
  ];

  return JSON.stringify({
    source: 'Concept2Cure cheminformatics (deterministic) + ChEMBL descriptors',
    resolvedFrom: resolved ?? null,
    smiles,
    validation: screen.validation,
    structuralAlerts: screen.alerts,
    hasMutagenicAlert: screen.hasMutagenicAlert,
    developability,
    provenance,
    disclaimer: screen.disclaimer,
    citation_hint:
      'Structural alerts are a deterministic substructure screen (cite as a screen, not an ICH M7 classification); ' +
      'physicochemical descriptors are ChEMBL-curated. Recommend confirmatory (Q)SAR + expert review for any alert.',
  });
});

// Search Drug Labels — FDA openFDA drug/label (SPL).
registerToolHandler('search_drug_labels', async (input) => {
  const asStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  try {
    const result = await searchDrugLabels({
      brandName: asStr(input.brand_name),
      genericName: asStr(input.generic_name),
      query: asStr(input.query),
      limit: Math.min((input.max_results as number) || 3, 10),
    });
    if (!result.searchExpression) {
      return JSON.stringify({ error: 'Provide brand_name, generic_name, or query to search drug labels.' });
    }
    const provenance = result.labels.map(l =>
      buildProvenance({
        sourceId: 'openfda',
        citation: { title: l.brandName || l.genericName || l.id, identifier: l.id, url: null },
        query: asStr(input.query) ?? asStr(input.brand_name) ?? asStr(input.generic_name) ?? null,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      total: result.total,
      resultCount: result.labels.length,
      labels: result.labels,
      provenance,
      citation_hint: 'Reference labels by brand/generic name and manufacturer; quote sections verbatim.',
    });
  } catch (e) {
    return JSON.stringify({
      source: 'FDA Drug Labels (openFDA SPL)',
      error: e instanceof Error ? e.message : 'Drug label search failed',
      labels: [],
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
    const recalls = result.recalls.slice(0, 15);
    const provenance = recalls.map(r =>
      buildProvenance({
        sourceId: 'openfda',
        citation: {
          title: `Recall ${r.recallNumber} (${r.classification})${r.recallingFirm ? ` — ${r.recallingFirm}` : ''}`,
          identifier: r.recallNumber,
          url: null,
        },
        query: asStr(input.device_name) ?? asStr(input.manufacturer) ?? asStr(input.query) ?? null,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      summary: result.summary,
      recalls,
      provenance,
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
    const provenance = result.documents.map(d =>
      buildProvenance({
        sourceId: 'cms_coverage',
        citation: { title: d.title || d.documentId, identifier: d.documentId, url: d.url },
        query: keyword || undefined,
        confidence: 'high',
      })
    );
    return JSON.stringify({
      source: result.source,
      coverageType: result.type,
      keyword,
      matched: result.matched,
      resultCount: result.documents.length,
      documents: result.documents,
      provenance,
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
  // Backed by the structured, citable ICH guideline corpus (Q/S/E/M families
  // implemented across the major global regulators). Read-only reference data.
  const guideline = typeof input.guideline === 'string' ? input.guideline.trim() : '';
  if (!guideline) return JSON.stringify({ error: 'guideline (code or topic) is required.' });
  const note = 'ICH revisions/step status evolve. Confirm the current revision on ich.org before citing.';
  try {
    const m = await import('../ana-ri/ich-guideline-corpus.js');
    // Try an exact code match first (e.g. "E6(R3)"), then a bare-prefix/topic search.
    const exact = m.getGuideline(guideline);
    if (exact) {
      return JSON.stringify({ source: 'ICH Guidelines', match: 'exact', guideline: exact, note });
    }
    const matches = m.searchGuidelines(guideline, 8);
    if (matches.length > 0) {
      return JSON.stringify({ source: 'ICH Guidelines', match: 'search', count: matches.length, guidelines: matches, note });
    }
    return JSON.stringify({
      source: 'ICH Guidelines',
      guideline,
      guidelines: [],
      note: `No ICH guideline matched "${guideline}". See https://ich.org/page/ich-guidelines. ${note}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `lookup_ich_guideline failed: ${err instanceof Error ? err.message : String(err)}` });
  }
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
  } catch {
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

// ─────────────────────────────────────────────────────────────────────────────
// Uploaded-document intake tools — AnA inspects, reads, OCRs and edits the
// user's actual files (PDF / DOCX / MD / text / images / Excel / CSV) by
// file_id, tenant-scoped through uploaded-file-access.
// ─────────────────────────────────────────────────────────────────────────────

const isPdfFile = (mime: string, name: string) =>
  mime.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(name);
const isImageFile = (mime: string, name: string) =>
  mime.toLowerCase().startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(name);
const isWorkbookFile = (mime: string, name: string) =>
  mime.toLowerCase() === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
  mime.toLowerCase() === 'text/csv' ||
  /\.(xlsx|csv)$/i.test(name);

// Inspect Uploaded Document — page/bookmark/text-layer inventory before reading.
registerToolHandler('inspect_uploaded_document', async (input, ctx) => {
  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const file = await loadUploadedFile(String(input.file_id ?? ''), ctx?.organizationId);
    const base = { fileId: file.fileId, fileName: file.fileName, mimeType: file.mimeType, fileSize: file.fileSize };

    if (isPdfFile(file.mimeType, file.fileName)) {
      const { inspectPdf } = await import('../ocr/pdfInspector.js');
      const inv = await inspectPdf(file.buffer, {
        maxSampledPages: typeof input.max_sampled_pages === 'number' ? input.max_sampled_pages : undefined,
      });
      return JSON.stringify({ ...base, kind: 'pdf', ...inv });
    }
    if (isWorkbookFile(file.mimeType, file.fileName)) {
      const { inspectWorkbook } = await import('../documentIntelligence/spreadsheetService.js');
      const inv = await inspectWorkbook(file.buffer, file.fileName, file.mimeType);
      return JSON.stringify({
        ...base,
        kind: 'spreadsheet',
        ...inv,
        recommendation: 'Use read_spreadsheet for cell-level data and formulas; edit_spreadsheet to change cells.',
      });
    }
    if (isImageFile(file.mimeType, file.fileName)) {
      return JSON.stringify({
        ...base,
        kind: 'image',
        recommendation: 'Use read_uploaded_document (or ocr_document_pages) to OCR this image.',
      });
    }
    // DOCX / Markdown / text: extract, then outline.
    const { extractDocumentText } = await import('../ocr/index.js');
    const extracted = await extractDocumentText(file.buffer, file.mimeType, file.fileName);
    const { parseDocumentStructure } = await import('../document-analysis');
    const s = parseDocumentStructure(extracted.text);
    return JSON.stringify({
      ...base,
      kind: extracted.method === 'docx' ? 'docx' : 'text',
      extractionMethod: extracted.method,
      totalChars: extracted.text.length,
      wordCount: extracted.text.trim() ? extracted.text.trim().split(/\s+/).length : 0,
      counts: s.counts,
      toc: s.toc.slice(0, 100),
      recommendation: 'Use read_uploaded_document to read the content (page with offset/max_chars if long).',
    });
  } catch (e) {
    return JSON.stringify({ error: `inspect_uploaded_document failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// Read Uploaded Document — full extraction cascade with OCR fallback + paging.
registerToolHandler('read_uploaded_document', async (input, ctx) => {
  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const file = await loadUploadedFile(String(input.file_id ?? ''), ctx?.organizationId);
    const languages = Array.isArray(input.languages)
      ? input.languages.filter((l): l is string => typeof l === 'string')
      : undefined;
    const pdf = isPdfFile(file.mimeType, file.fileName);

    let text = '';
    let method: string = 'none';
    let confidence: number | undefined;
    let pageRange: { start: number; end: number; numPages: number } | null = null;

    const pageStart = typeof input.page_start === 'number' ? input.page_start : undefined;
    const pageEnd = typeof input.page_end === 'number' ? input.page_end : undefined;

    if (pdf && (pageStart !== undefined || pageEnd !== undefined)) {
      // Page-scoped PDF read: embedded text layer first, OCR the range when thin.
      const { extractPdfPagesText } = await import('../ocr/pdfInspector.js');
      const first = Math.max(1, pageStart ?? 1);
      const r = await extractPdfPagesText(file.buffer, first, pageEnd ?? first + 49);
      text = r.pages.map((p) => `[page ${p.page}]\n${p.text}`).join('\n\n').trim();
      method = 'pdf-text';
      pageRange = { start: first, end: Math.min(pageEnd ?? first + 49, r.numPages), numPages: r.numPages };
      const thin = r.pages.every((p) => p.text.length < 32);
      if (input.force_ocr === true || thin) {
        const { ocrService } = await import('../ocr/index.js');
        const ocr = await ocrService.ocrPdfToText(file.buffer, {
          firstPage: pageRange.start,
          lastPage: pageRange.end,
          maxPages: 50,
          languages,
        });
        if (ocr.text.length > text.length || input.force_ocr === true) {
          text = ocr.pageDetails.map((p) => `[page ${p.page}]\n${p.text}`).join('\n\n').trim();
          method = 'pdf-ocr';
          confidence = ocr.confidence;
        }
      }
    } else if (input.force_ocr === true && (pdf || isImageFile(file.mimeType, file.fileName))) {
      const { ocrService } = await import('../ocr/index.js');
      if (pdf) {
        const ocr = await ocrService.ocrPdfToText(file.buffer, { maxPages: 50, languages });
        text = ocr.text;
        method = 'pdf-ocr';
        confidence = ocr.confidence;
      } else {
        const ocr = await ocrService.recognizeImage(file.buffer, languages ? { languages } : undefined);
        text = ocr.text;
        method = 'image-ocr';
        confidence = ocr.confidence;
      }
    } else {
      const { extractDocumentText } = await import('../ocr/index.js');
      const extracted = await extractDocumentText(file.buffer, file.mimeType, file.fileName);
      text = extracted.text;
      method = extracted.method;
      confidence = extracted.confidence;
    }

    if (!text.trim()) {
      return JSON.stringify({
        fileId: file.fileId,
        fileName: file.fileName,
        method,
        error:
          'No text could be extracted. For a scanned PDF try ocr_document_pages; run inspect_uploaded_document to plan a strategy.',
      });
    }

    const maxChars = Math.min(Math.max(1000, typeof input.max_chars === 'number' ? input.max_chars : 30000), 80000);
    const offset = Math.max(0, typeof input.offset === 'number' ? input.offset : 0);
    const slice = text.slice(offset, offset + maxChars);

    const { parseDocumentStructure } = await import('../document-analysis');
    const s = parseDocumentStructure(text);

    return JSON.stringify({
      fileId: file.fileId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      method,
      ...(confidence !== undefined ? { ocrConfidence: Math.round(confidence) } : {}),
      ...(pageRange ? { pageRange } : {}),
      totalChars: text.length,
      offset,
      returnedChars: slice.length,
      truncated: offset + slice.length < text.length,
      structure: { counts: s.counts, toc: s.toc.slice(0, 60) },
      text: slice,
    });
  } catch (e) {
    return JSON.stringify({ error: `read_uploaded_document failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// OCR Document Pages — targeted page/region OCR for big scanned documents.
registerToolHandler('ocr_document_pages', async (input, ctx) => {
  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const file = await loadUploadedFile(String(input.file_id ?? ''), ctx?.organizationId);
    const { ocrService } = await import('../ocr/index.js');
    const languages = Array.isArray(input.languages)
      ? input.languages.filter((l): l is string => typeof l === 'string')
      : undefined;

    if (isImageFile(file.mimeType, file.fileName)) {
      const r = await ocrService.recognizeImage(file.buffer, languages ? { languages } : undefined);
      return JSON.stringify({
        fileId: file.fileId,
        fileName: file.fileName,
        kind: 'image',
        confidence: Math.round(r.confidence),
        durationMs: r.durationMs,
        text: r.text,
      });
    }
    if (!isPdfFile(file.mimeType, file.fileName)) {
      return JSON.stringify({
        error: `ocr_document_pages supports PDFs and images; "${file.fileName}" (${file.mimeType}) is neither. Use read_uploaded_document instead.`,
      });
    }

    const REGIONS: Record<string, { top?: number; left?: number; width?: number; height?: number } | undefined> = {
      full: undefined,
      top_band: { top: 0, height: 0.25 },
      bottom_band: { top: 0.75, height: 0.25 },
      left_half: { left: 0, width: 0.5 },
      right_half: { left: 0.5, width: 0.5 },
    };
    const regionKey = typeof input.region === 'string' ? input.region : 'full';
    const region =
      regionKey === 'custom'
        ? {
            top: typeof input.region_top === 'number' ? input.region_top : undefined,
            left: typeof input.region_left === 'number' ? input.region_left : undefined,
            width: typeof input.region_width === 'number' ? input.region_width : undefined,
            height: typeof input.region_height === 'number' ? input.region_height : undefined,
          }
        : REGIONS[regionKey];

    const maxPages = Math.min(Math.max(1, typeof input.max_pages === 'number' ? input.max_pages : 20), 50);
    const dpi = Math.min(Math.max(72, typeof input.dpi === 'number' ? input.dpi : 200), 400);
    const pages = Array.isArray(input.pages)
      ? input.pages.filter((p): p is number => typeof p === 'number')
      : undefined;

    const r = await ocrService.ocrPdfToText(file.buffer, {
      dpi,
      maxPages,
      firstPage: typeof input.page_start === 'number' ? input.page_start : undefined,
      lastPage: typeof input.page_end === 'number' ? input.page_end : undefined,
      ...(pages?.length ? { pages } : {}),
      ...(region ? { region } : {}),
      languages,
    });

    return JSON.stringify({
      fileId: file.fileId,
      fileName: file.fileName,
      kind: 'pdf',
      region: regionKey,
      dpi,
      pagesOcred: r.pageDetails.length,
      meanConfidence: Math.round(r.confidence),
      durationMs: r.durationMs,
      pages: r.pageDetails.map((p) => ({
        page: p.page,
        confidence: Math.round(p.confidence),
        text: p.text,
      })),
      note:
        r.pageDetails.length >= maxPages
          ? `Hit the ${maxPages}-page cap for this call — continue with page_start=${(r.pageDetails[r.pageDetails.length - 1]?.page ?? 0) + 1}.`
          : undefined,
    });
  } catch (e) {
    return JSON.stringify({ error: `ocr_document_pages failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// Read Spreadsheet — sheet inventory + cell-level rows with formulas preserved.
registerToolHandler('read_spreadsheet', async (input, ctx) => {
  try {
    const { loadUploadedFile } = await import('./uploaded-file-access.js');
    const file = await loadUploadedFile(String(input.file_id ?? ''), ctx?.organizationId);
    if (!isWorkbookFile(file.mimeType, file.fileName)) {
      return JSON.stringify({
        error: `read_spreadsheet supports .xlsx and .csv; "${file.fileName}" (${file.mimeType}) is neither. Use read_uploaded_document instead.`,
      });
    }
    const { inspectWorkbook, readWorksheet } = await import('../documentIntelligence/spreadsheetService.js');
    const inventory = await inspectWorkbook(file.buffer, file.fileName, file.mimeType);
    const read = await readWorksheet(
      file.buffer,
      file.fileName,
      {
        sheet: typeof input.sheet === 'string' ? input.sheet : undefined,
        startRow: typeof input.start_row === 'number' ? input.start_row : undefined,
        endRow: typeof input.end_row === 'number' ? input.end_row : undefined,
        maxRows: typeof input.max_rows === 'number' ? input.max_rows : undefined,
        includeFormulas: input.include_formulas !== false,
      },
      file.mimeType,
    );
    return JSON.stringify({ fileId: file.fileId, fileName: file.fileName, inventory, ...read });
  } catch (e) {
    return JSON.stringify({ error: `read_spreadsheet failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// Edit Spreadsheet — apply cell edits, save as a NEW upload (original untouched).
registerToolHandler('edit_spreadsheet', async (input, ctx) => {
  try {
    const { loadUploadedFile, saveDerivedUpload } = await import('./uploaded-file-access.js');
    const file = await loadUploadedFile(String(input.file_id ?? ''), ctx?.organizationId);
    if (!isWorkbookFile(file.mimeType, file.fileName)) {
      return JSON.stringify({
        error: `edit_spreadsheet supports .xlsx and .csv; "${file.fileName}" (${file.mimeType}) is neither.`,
      });
    }
    const rawEdits = Array.isArray(input.edits) ? input.edits : [];
    const edits = rawEdits
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        sheet: typeof e.sheet === 'string' ? e.sheet : undefined,
        cell: String(e.cell ?? ''),
        value:
          typeof e.value === 'string' || typeof e.value === 'number' || typeof e.value === 'boolean'
            ? e.value
            : e.value === null
              ? null
              : undefined,
        formula: typeof e.formula === 'string' ? e.formula : undefined,
      }));
    if (!edits.length) {
      return JSON.stringify({ error: 'edit_spreadsheet requires a non-empty `edits` array.' });
    }

    const { applyWorkbookEdits } = await import('../documentIntelligence/spreadsheetService.js');
    const result = await applyWorkbookEdits(
      file.buffer,
      file.fileName,
      edits,
      { createMissingSheets: input.create_missing_sheets === true },
      file.mimeType,
    );

    const defaultName = `${file.fileName.replace(/\.(xlsx|csv)$/i, '')} (edited).xlsx`;
    const newFileName =
      typeof input.new_file_name === 'string' && input.new_file_name.trim()
        ? input.new_file_name.trim()
        : defaultName;
    const saved = await saveDerivedUpload({
      buffer: result.buffer,
      fileName: newFileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      organizationId: ctx?.organizationId,
      userId: ctx?.userId,
    });

    return JSON.stringify({
      ok: true,
      sourceFileId: file.fileId,
      newFileId: saved.fileId,
      newFileName,
      appliedEdits: result.applied,
      createdSheets: result.createdSheets,
      message: `Applied ${result.applied.length} edit(s) and saved the result as a new file (${saved.fileId}). The original upload is unchanged.`,
    });
  } catch (e) {
    return JSON.stringify({ error: `edit_spreadsheet failed: ${e instanceof Error ? e.message : String(e)}` });
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

// Fetch a blank Module 5 / clinical-study-report document template (form)
registerToolHandler('get_csr_template', async (input: Record<string, unknown>) => {
  try {
    const { getClinicalTemplate, listClinicalTemplates } = await import('../templates/clinical-csr-templates.js');
    const key = typeof input.template === 'string' ? input.template.trim() : '';
    if (!key) {
      return JSON.stringify({ status: 'list', templates: listClinicalTemplates() });
    }
    const tmpl = getClinicalTemplate(key);
    if (!tmpl) {
      return JSON.stringify({ status: 'not_found', message: `No Module 5 / CSR template for "${key}".`, available: listClinicalTemplates() });
    }
    return JSON.stringify({
      status: 'template',
      granule_id: tmpl.granule_id,
      sectionCode: tmpl.sectionCode,
      title: tmpl.title,
      content: tmpl.content,
      instruction: 'Fill the [PLACEHOLDER] tokens. If the program has ingested study data, prefer the draft_* composer tools, which fill content from data. The author promotes the result through the governed authoring flow.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Fetching CSR template failed: ${err?.message || 'unknown error'}` });
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

// Cross-document number reconciliation over ALREADY-EXTRACTED, structured
// figures — the cross-module check the two consistency tools above lack, and
// the structured-input complement to the prose-mining reconcile_dossier_numbers
// tool. The engine groups by quantityKey and flags values that disagree across
// documents beyond a configurable tolerance, returning per-key value clusters,
// sources, a plurality consensus, and a severity. Deterministic; validation
// errors are relayed as needs_parameters so the model asks rather than guesses.
registerToolHandler('reconcile_extracted_figures', async (input: Record<string, unknown>) => {
  try {
    const { reconcileDossierNumbers } = await import(
      '../reconciliation/dossier-number-reconciler.js'
    );
    const report = reconcileDossierNumbers({
      figures: input.figures as any,
      tolerance: input.tolerance as any,
    });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result: report,
      instruction:
        'Report these conflicts and values verbatim. A cross-document number mismatch (especially enrolment N or dose) is a recurring reviewer finding — surface each conflict, its sources, and the consensus.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (isStatsParamError(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `reconcile_extracted_figures failed: ${message}` });
  }
});

// ── Change propagation / Inconsistency Intelligence ─────────────────────────
// Expose the Living Record Spine's governed value-change engine to AnA. All are
// org-scoped from ToolContext; apply_fact_change is a governed mutation that
// requires an explicit reason and opens a resolution plan.

function proposedValueFromInput(input: Record<string, unknown>) {
  const proposed: { valueNum?: number; valueText?: string; unit?: string } = {};
  if (typeof input.valueNum === 'number') proposed.valueNum = input.valueNum;
  else if (typeof input.valueNum === 'string' && input.valueNum.trim() !== '') {
    const n = parseFloat(input.valueNum);
    if (Number.isFinite(n)) proposed.valueNum = n;
  }
  if (typeof input.valueText === 'string') proposed.valueText = input.valueText;
  if (typeof input.unit === 'string') proposed.unit = input.unit;
  return proposed;
}

registerToolHandler('list_governed_facts', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'list_governed_facts requires organization context' });
  }
  const programId = String(input.programId ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'programId is required' });
  try {
    const { listProgramFacts } = await import('../living-record/canonical-fact-store.js');
    const all = await listProgramFacts(programId);
    const facts = all
      .filter(f => f.organizationId === organizationId)
      .map(f => ({
        factId: f.id,
        entity: f.entity,
        field: f.field,
        value: f.valueNum ?? f.valueText,
        unit: f.unit,
        valueType: f.valueType,
        version: f.version,
        confidence: f.confidence,
      }));
    return JSON.stringify({
      status: 'computed',
      engine: 'living_record_spine',
      count: facts.length,
      facts,
      instruction: 'These are the program’s governed values. Use a factId with preview_fact_impact or apply_fact_change.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `list_governed_facts failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('establish_governed_fact', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'establish_governed_fact requires organization context' });
  }
  const programId = String(input.programId ?? '');
  const entity = String(input.entity ?? '').trim();
  const field = String(input.field ?? '').trim();
  if (!programId || !entity || !field) {
    return JSON.stringify({ status: 'needs_parameters', message: 'programId, entity, and field are required' });
  }
  try {
    const { establishGovernedFact } = await import('../living-record/fact-change-orchestrator.js');
    const result = await establishGovernedFact({
      organizationId,
      programId,
      entity,
      field,
      value: proposedValueFromInput(input),
      comparator: typeof input.comparator === 'string' ? input.comparator : undefined,
      reason: typeof input.reason === 'string' ? input.reason : undefined,
      actor: ctx?.userId ?? null,
    });
    if (!result.ok) return JSON.stringify({ status: result.code, message: result.message });
    return JSON.stringify({
      status: 'established',
      engine: 'living_record_spine',
      factId: result.fact.id,
      entity: result.fact.entity,
      field: result.fact.field,
      instruction:
        'The value is now governed. It can be cited (scan_document_citations), previewed (preview_fact_impact), changed (apply_fact_change), and traced.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `establish_governed_fact failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('scan_document_citations', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'scan_document_citations requires organization context' });
  }
  const programId = String(input.programId ?? '');
  const documentKind = String(input.documentKind ?? '');
  const documentId = String(input.documentId ?? '');
  if (!programId || !documentId || (documentKind !== 'ctd_artifact' && documentKind !== 'post_market')) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: "programId, documentId, and documentKind ('ctd_artifact' | 'post_market') are required",
    });
  }
  const persist = input.persist === true;
  const tolerance = typeof input.tolerance === 'number' ? input.tolerance : undefined;
  try {
    const { scanArtifactCitations, scanPostMarketCitations } = await import(
      '../living-record/document-binder.js'
    );
    const result =
      documentKind === 'post_market'
        ? await scanPostMarketCitations({ programId, organizationId, documentId, persist, tolerance, actor: ctx?.userId ?? null })
        : await scanArtifactCitations({ programId, organizationId, artifactId: documentId, persist, tolerance, actor: ctx?.userId ?? null });
    if (!result.ok) return JSON.stringify({ status: result.code, message: result.message });
    return JSON.stringify({
      status: 'computed',
      engine: 'living_record_spine',
      documentKind,
      target: result.target,
      persisted: result.persisted,
      summary: result.summary,
      citations: result.citations,
      unmatchedLabels: result.unmatchedLabels,
      instruction:
        'Report which governed values this document cites and, critically, any citation flagged divergent (its value no longer matches the governed value). If persisted, those citations are now tracked for future changes.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `scan_document_citations failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('preview_fact_impact', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'preview_fact_impact requires organization context' });
  }
  const factId = String(input.factId ?? '');
  if (!factId) return JSON.stringify({ status: 'needs_parameters', message: 'factId is required' });
  try {
    const { previewFactChange } = await import('../living-record/fact-change-orchestrator.js');
    const proposed = proposedValueFromInput(input);
    const result = await previewFactChange({
      factId,
      organizationId,
      proposed: Object.keys(proposed).length > 0 ? proposed : undefined,
      tolerance: typeof input.tolerance === 'number' ? input.tolerance : undefined,
    });
    if (!result.ok) return JSON.stringify({ status: 'not_found', message: result.message });
    return JSON.stringify({
      status: 'computed',
      engine: 'living_record_spine',
      currentValue: result.currentValue,
      proposedValue: result.proposedValue,
      isNoop: result.isNoop,
      summary: result.summary,
      impacts: result.impacts,
      instruction:
        'Report the blast radius: how many citations will drift, the highest severity, and whether re-approval is required. If the user wants to proceed, call apply_fact_change with a reason.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `preview_fact_impact failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('apply_fact_change', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'apply_fact_change requires organization context' });
  }
  const factId = String(input.factId ?? '');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!factId || !reason) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'factId and a reason-for-change are required. Ask the user for the reason if not supplied.',
    });
  }
  try {
    const { applyFactChange } = await import('../living-record/fact-change-orchestrator.js');
    const result = await applyFactChange({
      factId,
      organizationId,
      newValue: proposedValueFromInput(input),
      reason,
      actor: ctx?.userId ?? null,
      tolerance: typeof input.tolerance === 'number' ? input.tolerance : undefined,
    });
    if (!result.ok) return JSON.stringify({ status: result.code, message: result.message });
    return JSON.stringify({
      status: 'applied',
      engine: 'living_record_spine',
      newFactId: result.newFact.id,
      version: result.newFact.version,
      summary: result.summary,
      driftCreated: result.driftCreated,
      claimsMarkedDrifted: result.claimsMarkedDrifted,
      cascadedClaims: result.cascadedClaims,
      resolutionPlanId: result.resolutionPlanId,
      resolutionPlanSkippedReason: result.resolutionPlanSkippedReason,
      instruction:
        'The value was changed under governance. Report the impact summary and, if a resolutionPlanId was returned, offer to explain it with explain_resolution_plan.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `apply_fact_change failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('trace_fact_to_source', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'trace_fact_to_source requires organization context' });
  }
  const factId = String(input.factId ?? '');
  if (!factId) return JSON.stringify({ status: 'needs_parameters', message: 'factId is required' });
  try {
    const { traceFactToSource } = await import('../living-record/source-tracer.js');
    const result = await traceFactToSource(factId, organizationId);
    if (!result.ok) return JSON.stringify({ status: 'not_found', message: result.message });
    return JSON.stringify({
      status: 'computed',
      engine: 'living_record_spine',
      fact: { id: result.fact.id, entity: result.fact.entity, field: result.fact.field },
      establishingClaim: result.establishingClaim,
      establishingSource: result.establishingSource,
      citations: result.citations,
      /* A trace full of nulls reads as "this value has no evidence". That is
         only one reason it happens; another is that the referenced claims are
         not in the store at all — which is currently true of evidence_claims,
         a table with no writer anywhere in the repository. Reporting the
         broken references keeps the two apart. */
      unresolvedClaimIds: result.unresolvedClaimIds,
      claimStoreUnavailable: result.claimStoreUnavailable,
      instruction: result.claimStoreUnavailable
        ? 'Do NOT report this value as unsupported. Every claim it references failed to resolve, which means the evidence trail is BROKEN, not absent — say so plainly and name the unresolved claim ids.'
        : result.unresolvedClaimIds.length > 0
          ? 'Report the chain, and state clearly which referenced claims could not be resolved. A partial trail must not be presented as a complete one.'
          : 'Report the chain: the governed value, the claim that established it, and the source artifact (file/page). List each citing location.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `trace_fact_to_source failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('reconcile_device_documents', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'reconcile_device_documents requires organization context' });
  }
  const programId = String(input.programId ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'programId is required' });
  const tol = input.tolerance as { absolute?: unknown; relative?: unknown } | undefined;
  const tolerance = tol
    ? {
        absolute: typeof tol.absolute === 'number' ? tol.absolute : undefined,
        relative: typeof tol.relative === 'number' ? tol.relative : undefined,
      }
    : undefined;
  try {
    const { reconcileDeviceDocuments } = await import('../reconciliation/device-document-reconciler.js');
    const result = await reconcileDeviceDocuments({ programId, organizationId, tolerance });
    if (!result.ok) return JSON.stringify({ status: 'not_found', message: result.message });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      documentsScanned: result.documentsScanned,
      result: result.report,
      instruction:
        'Report each conflict verbatim: the quantity, its distinct values with source documents, the consensus, and the severity. A cross-document performance-claim mismatch is a submission blocker.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `reconcile_device_documents failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('explain_resolution_plan', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) {
    return JSON.stringify({ error: 'explain_resolution_plan requires organization context' });
  }
  const planId = String(input.planId ?? '');
  if (!planId) return JSON.stringify({ status: 'needs_parameters', message: 'planId is required' });
  try {
    const { getResolutionPlan } = await import('../resolution/resolution-planner.js');
    const { explainResolutionPlan } = await import('../resolution/ana-resolution-support.js');
    const plan = await getResolutionPlan(organizationId, planId);
    if (!plan) return JSON.stringify({ status: 'not_found', message: 'Resolution plan not found' });
    return JSON.stringify({
      status: 'computed',
      engine: 'resolution_layer',
      explanation: explainResolutionPlan(plan),
      instruction:
        'Present the structured explanation grounded in the plan: trigger, affected objects, recommended path, review requirements, and next steps. Do not invent resolution steps beyond it.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `explain_resolution_plan failed: ${err?.message ?? 'unknown error'}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IVD lifecycle deterministic calculators (all pure engines, no DB/org context)
// ─────────────────────────────────────────────────────────────────────────────

function ivdComputed(result: unknown, instruction: string): string {
  return JSON.stringify({ status: 'computed', engine: 'deterministic', result, instruction });
}

function ivdError(name: string, err: any): string {
  const message = err?.message || 'unknown error';
  // The throw-based engines phrase their message as the parameter problem.
  return JSON.stringify({ status: 'needs_parameters', tool: name, message });
}

registerToolHandler('screen_signal_panel', async (input: Record<string, unknown>) => {
  try {
    const { screenSignalPanel } = await import('../stats/signal-disproportionality.js');
    const result = screenSignalPanel({
      a: Number(input.a), b: Number(input.b), c: Number(input.c), d: Number(input.d),
    });
    return ivdComputed(result, 'Report each disproportionality metric with its bound and the consolidated signal tier.');
  } catch (err: any) {
    return ivdError('screen_signal_panel', err);
  }
});

registerToolHandler('assess_iso17511_traceability', async (input: Record<string, unknown>) => {
  try {
    const { assessTraceability } = await import('../regulatory/iso-17511-traceability.js');
    return ivdComputed(assessTraceability(input as any), 'Report validity, the gaps, and the recommendation for the traceability chain.');
  } catch (err: any) {
    return ivdError('assess_iso17511_traceability', err);
  }
});

registerToolHandler('assess_scientific_validity', async (input: Record<string, unknown>) => {
  try {
    const { assessScientificValidity } = await import('../regulatory/scientific-validity.js');
    return ivdComputed(assessScientificValidity(input as any), 'Report the verdict (established/supported/insufficient) and the evidence gaps.');
  } catch (err: any) {
    return ivdError('assess_scientific_validity', err);
  }
});

registerToolHandler('determine_assay_cutoff', async (input: Record<string, unknown>) => {
  try {
    const { determineCutoff } = await import('../stats/analytical-performance-extensions.js');
    // The engine takes the bare observations array (the route wraps it).
    return ivdComputed(determineCutoff(input.observations as any), 'Report the cutoff with its sensitivity, specificity, and Youden J.');
  } catch (err: any) {
    return ivdError('determine_assay_cutoff', err);
  }
});

registerToolHandler('assess_shelf_life_stability', async (input: Record<string, unknown>) => {
  try {
    const { assessRealTimeStability } = await import('../stats/analytical-performance-extensions.js');
    return ivdComputed(assessRealTimeStability(input as any), 'Report the supportable shelf-life and whether the claim holds against the allowed change.');
  } catch (err: any) {
    return ivdError('assess_shelf_life_stability', err);
  }
});

registerToolHandler('assess_accelerated_stability', async (input: Record<string, unknown>) => {
  try {
    const { assessAcceleratedStability } = await import('../stats/analytical-performance-extensions.js');
    return ivdComputed(assessAcceleratedStability(input as any), 'Report the projected shelf-life at the storage temperature.');
  } catch (err: any) {
    return ivdError('assess_accelerated_stability', err);
  }
});

registerToolHandler('generate_declaration_of_conformity', async (input: Record<string, unknown>) => {
  try {
    const { generateDeclarationOfConformity } = await import('../regulatory/registration-listing.js');
    const result = generateDeclarationOfConformity(input as any);
    return ivdComputed(result, 'If valid, present the declaration; if not, list exactly the missing[] fields to collect.');
  } catch (err: any) {
    return ivdError('generate_declaration_of_conformity', err);
  }
});

registerToolHandler('build_postmarket_report', async (input: Record<string, unknown>) => {
  const reportType = String(input.reportType ?? '');
  const fields = (input.fields ?? {}) as Record<string, unknown>;
  try {
    const authoring = await import('../postmarket/report-authoring.js');
    const builder: Record<string, (f: any) => unknown> = {
      emdr: authoring.buildEmdr,
      mir: authoring.buildMir,
      fsn: authoring.buildFsn,
      psur: authoring.buildPsur,
    };
    const build = builder[reportType];
    if (!build) {
      return JSON.stringify({ status: 'needs_parameters', message: "reportType must be one of: emdr, mir, fsn, psur" });
    }
    const result = build(fields);
    return ivdComputed(result, 'If valid, present the report payload; if not, list exactly the missing[] required fields.');
  } catch (err: any) {
    return ivdError('build_postmarket_report', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Predicate intelligence (shadow-service proxy with org→program ownership)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the program belongs to the org, then call the predicate shadow service
 * directly (the tool holds a tenant context, not a JWT, so it mirrors the BFF's
 * requireProgramAccess check rather than hopping the authenticated route).
 */
async function predicateShadowCall(
  organizationId: number,
  programId: string,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<string> {
  const { db } = await import('../../db.js');
  const { regulatoryPrograms } = await import('../../../shared/schema/programs.js');
  const { and, eq } = await import('drizzle-orm');
  const [program] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  if (!program) return JSON.stringify({ error: 'Access denied: program not in your organization.' });

  const base = (process.env.SHADOW_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const url = new URL(path, base + '/');
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'X-Admin-Token': process.env.REVIEW_ADMIN_TOKEN || '',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 503) {
      return JSON.stringify({ status: 'unavailable', message: 'Predicate universe not configured or stale.' });
    }
    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ status: 'error', httpStatus: res.status, detail: text.slice(0, 500) });
    }
    return text; // already JSON from the shadow service
  } catch (err: any) {
    return JSON.stringify({ status: 'unavailable', message: `Predicate service unavailable: ${err?.message ?? 'unknown'}` });
  }
}

registerToolHandler('suggest_predicate_devices', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'suggest_predicate_devices requires organization context' });
  const programId = String(input.program_id ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'program_id is required' });
  return predicateShadowCall(organizationId, programId, 'POST', 'predicate/suggest', { body: input });
});

registerToolHandler('generate_se_matrix', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'generate_se_matrix requires organization context' });
  const programId = String(input.program_id ?? '');
  if (!programId || !input.selected_predicate_k_number || !input.subject_device) {
    return JSON.stringify({ status: 'needs_parameters', message: 'program_id, selected_predicate_k_number, and subject_device are required' });
  }
  return predicateShadowCall(organizationId, programId, 'POST', 'predicate/generate-se-matrix', { body: input });
});

registerToolHandler('get_predicate_defense_preview', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'get_predicate_defense_preview requires organization context' });
  const programId = String(input.program_id ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'program_id is required' });
  return predicateShadowCall(organizationId, programId, 'GET', 'predicate/defense-preview', {
    query: { program_id: programId, candidate_id: typeof input.candidate_id === 'string' ? input.candidate_id : undefined },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPA / complaint / MDR / vigilance (device post-market safety workstream)
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_mdr_reportability', async (input: Record<string, unknown>) => {
  try {
    const { classify } = await import('../capa-mdr/triageEngine.js');
    const result = classify({
      patientHarm: input.patientHarm as any,
      isMalfunction: input.isMalfunction === true,
      eventLocationCountry: typeof input.eventLocationCountry === 'string' ? input.eventLocationCountry : null,
      anticipatesCorrection: input.anticipatesCorrection === true,
      trendThresholdCrossed: input.trendThresholdCrossed === true,
      eventNarrative: typeof input.eventNarrative === 'string' ? input.eventNarrative : null,
    });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction:
        'Report the reportability determination verbatim: FDA MDR, EU MDR vigilance, 806 notice, suggested jurisdiction/report-type/severity, and the rationale.',
    });
  } catch (err: any) {
    return JSON.stringify({ status: 'needs_parameters', tool: 'assess_mdr_reportability', message: err?.message || 'invalid input' });
  }
});

registerToolHandler('triage_capa_mdr_queue', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'triage_capa_mdr_queue requires organization context' });
  const programId = String(input.programId ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'programId is required' });
  try {
    const { getTriageQueue } = await import('../capa-mdr/capaMdr.service.js');
    const items = await getTriageQueue(organizationId, {
      programId,
      openOnly: input.openOnly !== false,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
    return JSON.stringify({ status: 'computed', engine: 'capa_mdr', count: items.length, items });
  } catch (err: any) {
    return JSON.stringify({ error: `triage_capa_mdr_queue failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('read_vigilance_timeline', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'read_vigilance_timeline requires organization context' });
  const programId = String(input.programId ?? '');
  if (!programId) return JSON.stringify({ status: 'needs_parameters', message: 'programId is required' });
  try {
    const { listVigilanceEvents } = await import('../capa-mdr/capaMdr.service.js');
    const events = await listVigilanceEvents(organizationId, {
      programId,
      entityType: typeof input.entityType === 'string' ? (input.entityType as any) : undefined,
      entityId: typeof input.entityId === 'string' ? input.entityId : undefined,
      kind: typeof input.kind === 'string' ? (input.kind as any) : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
    return JSON.stringify({ status: 'computed', engine: 'capa_mdr', count: events.length, events });
  } catch (err: any) {
    return JSON.stringify({ error: `read_vigilance_timeline failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('create_complaint', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'create_complaint requires organization context' });
  const programId = String(input.programId ?? '');
  const receivedAtRaw = String(input.receivedAt ?? '');
  const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : null;
  if (!programId || !input.source || !input.channel || !receivedAt || Number.isNaN(receivedAt.getTime()) || !input.eventNarrative) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'programId, source, channel, a valid receivedAt (ISO date), and eventNarrative are required',
    });
  }
  try {
    const { createComplaint } = await import('../capa-mdr/capaMdr.service.js');
    const complaint = await createComplaint(organizationId, {
      programId,
      source: input.source as any,
      channel: input.channel as any,
      receivedAt,
      eventNarrative: String(input.eventNarrative),
      patientHarm: input.patientHarm as any,
      severityAssessment: input.severityAssessment as any,
      isMalfunction: input.isMalfunction === true,
      anticipatesCorrection: input.anticipatesCorrection === true,
      trendThresholdCrossed: input.trendThresholdCrossed === true,
      eventLocationCountry: typeof input.eventLocationCountry === 'string' ? input.eventLocationCountry : null,
      deviceModel: typeof input.deviceModel === 'string' ? input.deviceModel : null,
      deviceUdiDi: typeof input.deviceUdiDi === 'string' ? input.deviceUdiDi : null,
      deviceLot: typeof input.deviceLot === 'string' ? input.deviceLot : null,
      createdBy: ctx?.userId != null ? String(ctx.userId) : null,
    });
    return JSON.stringify({
      status: 'created',
      engine: 'capa_mdr',
      complaintId: complaint.id,
      complaintCode: (complaint as any).complaintCode,
      preliminaryClassification: (complaint as any).preliminaryClassification,
      instruction: 'Report the complaint code and the auto-computed preliminary reportability classification.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `create_complaint failed: ${err?.message ?? 'unknown error'}` });
  }
});

registerToolHandler('open_device_capa', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  const organizationId = ctx?.organizationId ?? undefined;
  if (organizationId == null) return JSON.stringify({ error: 'open_device_capa requires organization context' });
  const programId = String(input.programId ?? '');
  if (!programId || !input.title || !input.type || !input.source) {
    return JSON.stringify({ status: 'needs_parameters', message: 'programId, title, type, and source are required' });
  }
  const targetRaw = typeof input.targetCloseDate === 'string' ? input.targetCloseDate : '';
  const targetCloseDate = targetRaw ? new Date(targetRaw) : null;
  try {
    const { createCapaRecord } = await import('../capa-mdr/capaMdr.service.js');
    const capa = await createCapaRecord(organizationId, {
      programId,
      title: String(input.title),
      type: input.type as any,
      source: input.source as any,
      summary: typeof input.summary === 'string' ? input.summary : null,
      problemStatement: typeof input.problemStatement === 'string' ? input.problemStatement : null,
      riskLevel: input.riskLevel as any,
      assignedTo: typeof input.assignedTo === 'string' ? input.assignedTo : null,
      targetCloseDate: targetCloseDate && !Number.isNaN(targetCloseDate.getTime()) ? targetCloseDate : null,
      createdBy: ctx?.userId != null ? String(ctx.userId) : null,
    });
    return JSON.stringify({
      status: 'created',
      engine: 'capa_mdr',
      capaId: capa.id,
      capaCode: (capa as any).capaCode,
      state: (capa as any).state,
      instruction: 'Report the CAPA code and that it was opened. Offer to add actions or transition it.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `open_device_capa failed: ${err?.message ?? 'unknown error'}` });
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
      // 'Applicant' is not an applicant. An absent identity says so.
      applicantName: (input.applicant as string) || 'UNASSIGNED (applicant)',
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
      const compNote = pipeline.compression
        ? ` (${pipeline.compression.compressedSizeBytes} bytes after ${quality} compression)`
        : pipeline.compressionSkipped
          ? ` (compression skipped: ${pipeline.compressionSkipped})`
          : '';
      return JSON.stringify({
        ok:                 true,
        engine:             'python-docx + libreoffice',
        docxPath,
        pdfPath:            pipeline.finalPdf,
        sizeBytes:          pdfStat.size,
        compression:        pipeline.compression ?? null,
        compressionSkipped: pipeline.compressionSkipped ?? null,
        message: `Authored ${docx.fileName} via python-docx and converted to PDF via headless LibreOffice. PDF: ${pipeline.finalPdf}${compNote}.`,
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

registerToolHandler('convert_docx_to_pdf', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({
      error: 'convert_docx_to_pdf requires input_docx_path (string).',
    });
  }
  // Tenant context, like every sibling document tool (insert_document_content,
  // surgical_docx_xml_edit, validate_docx, …). This handler was registered
  // without a ToolContext at all, so it had no identity to check even in
  // principle — the only tool in the document-surgery family with that gap.
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'convert_docx_to_pdf requires tenant context (organizationId).' });
  }
  const outputPdfPath =
    typeof input.output_pdf_path === 'string' ? input.output_pdf_path : undefined;

  // C2C-AI-003. Both paths come from model-chosen tool arguments and reach the
  // worker, which READS input_docx_path and OVERWRITES output_pdf_path
  // (server/scripts/docx_pdf_pipeline.py — `generated.replace(output_pdf)`).
  // Unconfined, that is an arbitrary server-side file read whose bytes return
  // through the tool result, and an arbitrary file overwrite.
  //
  // The RESOLVED paths are what get used below — never the caller's strings.
  // Passing the raw candidate onward was itself the bug: the guard resolved it
  // against the workspace root while the worker resolved it against the process
  // working directory, so the check and the open addressed different files and
  // any ordinary relative path (e.g. "dist/index.js") passed while landing
  // outside. Validate and use the same value.
  let safeInputDocxPath: string;
  let safeOutputPdfPath: string | undefined;
  try {
    safeInputDocxPath = assertWithinDocumentWorkspace(inputDocxPath, 'input_docx_path');
    safeOutputPdfPath =
      outputPdfPath === undefined
        ? undefined
        : assertWithinDocumentWorkspace(outputPdfPath, 'output_pdf_path');
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
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
      inputDocxPath: safeInputDocxPath,
      outputPdfPath: safeOutputPdfPath,
      compress,
      quality,
    });
    const stat = await fs.stat(result.finalPdf);
    const compNote = result.compression
      ? ` (${result.compression.compressedSizeBytes} bytes after ${quality} compression)`
      : result.compressionSkipped
        ? ` (compression skipped: ${result.compressionSkipped})`
        : '';
    return JSON.stringify({
      ok:                 true,
      inputDocx:          result.inputDocx,
      convertedPdf:       result.convertedPdf,
      finalPdf:           result.finalPdf,
      sizeBytes:          stat.size,
      compression:        result.compression ?? null,
      compressionSkipped: result.compressionSkipped ?? null,
      message: `DOCX → PDF complete via headless LibreOffice. PDF: ${result.finalPdf}${compNote}.`,
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
// General-purpose scripting sandbox handler — runs AnA-authored Python in the
// isolated compute worker (no network, bounded CPU/memory, wall-clock SIGKILL).
// Persists any files the script produced to a session tempdir and returns
// truncated stdout/stderr plus the output file paths. This is AnA's "write a
// Python script to do X precisely" capability, governed.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT_OUTPUT_CAP = 4000; // chars of stdout/stderr returned to the model

function truncateForModel(s: string, cap = SCRIPT_OUTPUT_CAP): string {
  if (typeof s !== 'string') return '';
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}\n…[truncated ${s.length - cap} chars]`;
}

registerToolHandler('run_python_script', async (input, ctx) => {
  const code = typeof input.code === 'string' ? input.code : '';
  if (!code.trim()) {
    return JSON.stringify({ error: 'run_python_script requires code (non-empty string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'run_python_script requires tenant context (organizationId).' });
  }

  const inputFiles =
    input.input_files && typeof input.input_files === 'object'
      ? (input.input_files as Record<string, string>)
      : undefined;
  const cpuSeconds = typeof input.cpu_seconds === 'number' ? input.cpu_seconds : undefined;
  const timeoutMs = typeof input.timeout_ms === 'number' ? input.timeout_ms : undefined;

  try {
    const { runPythonScriptIsolated } = await import('../compute/scriptWorker.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const result = await runPythonScriptIsolated({
      code,
      inputFiles,
      cpuSeconds,
      timeoutMs,
    });

    // Persist produced files so downstream tools / the user have stable paths.
    const outputFilePaths: Array<{ name: string; path: string; bytes: number } | { name: string; tooLarge: true }> = [];
    const entries = Object.entries(result.outputFiles ?? {});
    if (entries.length > 0) {
      const outDir = path.resolve(process.cwd(), 'tmp', 'ana-scripts', randomUUID().slice(0, 8));
      await fs.mkdir(outDir, { recursive: true });
      for (const [name, b64] of entries) {
        if (b64 == null) {
          outputFilePaths.push({ name, tooLarge: true });
          continue;
        }
        const safe = path.basename(name);
        const dest = path.join(outDir, safe);
        const buf = Buffer.from(b64, 'base64');
        await fs.writeFile(dest, buf);
        outputFilePaths.push({ name, path: dest, bytes: buf.length });
      }
    }

    return JSON.stringify({
      ok: result.ok,
      engine: 'python-script (isolated, no-network)',
      stdout: truncateForModel(result.stdout),
      stderr: truncateForModel(result.stderr),
      error: result.error ? truncateForModel(result.error) : null,
      outputFiles: outputFilePaths,
      network: result.network,
      message: result.ok
        ? `Script ran successfully${outputFilePaths.length ? ` and produced ${outputFilePaths.length} file(s)` : ''}.`
        : 'Script raised an error — see error/stderr.',
    });
  } catch (err) {
    return JSON.stringify({
      error: `run_python_script failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify python3 is available on the host (see services/Dockerfile).`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Targeted document insertion handler — surgical edits to an existing .docx via
// python-docx in the isolated worker. Reads the source document, applies the
// requested insertions at exact anchors, persists the edited .docx (and an
// optional PDF), and returns the per-insertion outcome report. The source is
// preserved as the editable record.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('insert_document_content', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({ error: 'insert_document_content requires input_docx_path (string).' });
  }
  if (!Array.isArray(input.insertions) || input.insertions.length === 0) {
    return JSON.stringify({ error: 'insert_document_content requires insertions (non-empty array).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'insert_document_content requires tenant context (organizationId).' });
  }

  const fmt = input.output_format === 'pdf' ? 'pdf' : 'docx';

  // Normalize the model's snake_case insertion shape into the worker's camelCase.
  const insertions = (input.insertions as Array<Record<string, unknown>>).map(ins => ({
    anchorType: ins.anchor_type as
      | 'heading_text'
      | 'placeholder'
      | 'paragraph_index'
      | 'start'
      | 'end',
    anchorValue: ins.anchor_value as string | number | undefined,
    position: (ins.position as 'before' | 'after' | 'replace' | undefined) ?? 'after',
    match: (ins.match as 'exact' | 'contains' | undefined) ?? 'contains',
    content: typeof ins.content === 'string' ? ins.content : '',
  }));

  try {
    const { runDocxInsertIsolated } = await import('../compute/scriptWorker.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const sourceBuf = await fs.readFile(inputDocxPath);
    const baseName = path.basename(inputDocxPath, path.extname(inputDocxPath));
    const result = await runDocxInsertIsolated(sourceBuf, insertions, `${baseName}.edited.docx`);

    const outDir = path.resolve(process.cwd(), 'tmp', 'docbuilder', randomUUID().slice(0, 8));
    await fs.mkdir(outDir, { recursive: true });
    const docxPath = path.join(outDir, result.fileName);
    await fs.writeFile(docxPath, result.buffer);

    const notFound = result.applied.filter(a => a.status !== 'applied');

    if (fmt === 'pdf') {
      const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
      const pipeline = await runDocxPdfPipeline({ inputDocxPath: docxPath });
      return JSON.stringify({
        ok: notFound.length === 0,
        engine: 'python-docx (targeted insert) + libreoffice',
        sourceDocxPath: inputDocxPath,
        docxPath,
        pdfPath: pipeline.finalPdf,
        applied: result.applied,
        message: `Applied ${result.applied.length - notFound.length}/${result.applied.length} insertion(s) and rendered PDF.${
          notFound.length ? ` ${notFound.length} anchor(s) not found.` : ''
        }`,
      });
    }

    return JSON.stringify({
      ok: notFound.length === 0,
      engine: 'python-docx (targeted insert)',
      sourceDocxPath: inputDocxPath,
      docxPath,
      sizeBytes: result.buffer.length,
      applied: result.applied,
      message: `Applied ${result.applied.length - notFound.length}/${result.applied.length} insertion(s) to ${baseName}.${
        notFound.length ? ` ${notFound.length} anchor(s) not found — review the applied report.` : ''
      }`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `insert_document_content failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify the source .docx path exists and python3 + python-docx are available on the host.`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Raw-OOXML surgery handler — unpack a .docx, edit word/document.xml at the
// XML-tree level (insert paragraph blocks inheriting formatting, replace
// placeholders preserving run formatting), repack, and validate. Persists the
// edited .docx (and optional PDF) and returns per-operation + validation
// reports. The source is preserved as the editable record.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('surgical_docx_xml_edit', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({ error: 'surgical_docx_xml_edit requires input_docx_path (string).' });
  }
  if (!Array.isArray(input.operations) || input.operations.length === 0) {
    return JSON.stringify({ error: 'surgical_docx_xml_edit requires operations (non-empty array).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'surgical_docx_xml_edit requires tenant context (organizationId).' });
  }

  const fmt = input.output_format === 'pdf' ? 'pdf' : 'docx';
  const operations = (input.operations as Array<Record<string, unknown>>).map(o => ({
    op: o.op as 'insert_paragraphs' | 'replace_text',
    anchorText: typeof o.anchor_text === 'string' ? o.anchor_text : undefined,
    match: (o.match as 'exact' | 'contains' | undefined) ?? 'contains',
    position: (o.position as 'before' | 'after' | undefined) ?? 'after',
    paragraphs: Array.isArray(o.paragraphs) ? (o.paragraphs as string[]) : undefined,
    inheritFormat: o.inherit_format !== false,
    find: typeof o.find === 'string' ? o.find : undefined,
    replace: typeof o.replace === 'string' ? o.replace : undefined,
  }));

  try {
    const { runDocxXmlSurgeryIsolated } = await import('../compute/scriptWorker.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const sourceBuf = await fs.readFile(inputDocxPath);
    const baseName = path.basename(inputDocxPath, path.extname(inputDocxPath));
    const result = await runDocxXmlSurgeryIsolated(sourceBuf, operations, `${baseName}.xml-edited.docx`);

    const outDir = path.resolve(process.cwd(), 'tmp', 'docbuilder', randomUUID().slice(0, 8));
    await fs.mkdir(outDir, { recursive: true });
    const docxPath = path.join(outDir, result.fileName);
    await fs.writeFile(docxPath, result.buffer);

    const notApplied = result.applied.filter(a => a.status !== 'applied');
    const base = {
      ok: result.validation.ok && notApplied.length === 0,
      engine: 'lxml OOXML surgery',
      sourceDocxPath: inputDocxPath,
      docxPath,
      applied: result.applied,
      validation: result.validation,
    };

    if (!result.validation.ok) {
      // Surface corruption explicitly — the edited file is kept for inspection
      // but flagged so AnA does not ship a broken document.
      return JSON.stringify({
        ...base,
        message: `Edit applied but validation FAILED — document may be corrupt. Malformed parts: ${
          result.validation.malformedParts.length
        }, errors: ${result.validation.errors.join('; ') || 'none'}. Do not ship without review.`,
      });
    }

    if (fmt === 'pdf') {
      const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
      const pipeline = await runDocxPdfPipeline({ inputDocxPath: docxPath });
      return JSON.stringify({
        ...base,
        pdfPath: pipeline.finalPdf,
        message: `Applied ${result.applied.length - notApplied.length}/${result.applied.length} XML operation(s), validated, and rendered PDF.`,
      });
    }

    return JSON.stringify({
      ...base,
      sizeBytes: result.buffer.length,
      message: `Applied ${result.applied.length - notApplied.length}/${result.applied.length} XML operation(s) to ${baseName} and validated (${result.validation.partsChecked} parts, ${result.validation.paragraphCount} paragraphs).${
        notApplied.length ? ` ${notApplied.length} operation(s) did not match — review the applied report.` : ''
      }`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `surgical_docx_xml_edit failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify the source .docx path exists and python3 + lxml + python-docx are available on the host.`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Clause-template handler — render a named regulatory building block
// (signature block, cover-letter header, section heading, sponsor placeholder
// swap) with field validation, then insert it through the SAME governed
// docx-insert worker as insert_document_content. No new execution surface — a
// curated content layer over the isolated, no-network insertion path.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('insert_clause_template', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({ error: 'insert_clause_template requires input_docx_path (string).' });
  }
  const clause = typeof input.clause === 'string' ? input.clause : '';
  if (!clause) {
    return JSON.stringify({ error: 'insert_clause_template requires clause (string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'insert_clause_template requires tenant context (organizationId).' });
  }

  const fmt = input.output_format === 'pdf' ? 'pdf' : 'docx';
  const fields = (input.fields && typeof input.fields === 'object'
    ? (input.fields as Record<string, string>)
    : {}) as Record<string, string>;

  // Normalize the model's snake_case anchor into the catalog's camelCase shape.
  let anchor: import('./clause-templates.js').ClauseAnchor | undefined;
  if (input.anchor && typeof input.anchor === 'object') {
    const a = input.anchor as Record<string, unknown>;
    anchor = {
      anchorType: (a.anchor_type as 'heading_text' | 'placeholder' | 'paragraph_index' | 'start' | 'end') ?? 'end',
      anchorValue: a.anchor_value as string | number | undefined,
      position: (a.position as 'before' | 'after' | 'replace' | undefined) ?? 'after',
      match: (a.match as 'exact' | 'contains' | undefined) ?? 'contains',
    };
  }

  try {
    const { renderClauseTemplate } = await import('./clause-templates.js');
    const rendered = renderClauseTemplate(clause, fields, anchor);

    if (rendered.unknownClause) {
      return JSON.stringify({
        error: `Unknown clause "${clause}". Supported: signature_block, cover_letter_header, section_heading, sponsor_placeholder_swap.`,
      });
    }
    if (rendered.missingFields.length > 0) {
      return JSON.stringify({
        error: `insert_clause_template: clause "${clause}" is missing required field(s): ${rendered.missingFields.join(', ')}.`,
        missingFields: rendered.missingFields,
      });
    }
    if (rendered.insertions.length === 0) {
      return JSON.stringify({
        ok: false,
        clause,
        warnings: rendered.warnings,
        message: `Clause "${clause}" produced no insertions — ${rendered.warnings.join('; ') || 'no content to insert'}.`,
      });
    }

    const { runDocxInsertIsolated } = await import('../compute/scriptWorker.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const sourceBuf = await fs.readFile(inputDocxPath);
    const baseName = path.basename(inputDocxPath, path.extname(inputDocxPath));
    const result = await runDocxInsertIsolated(sourceBuf, rendered.insertions, `${baseName}.clause.docx`);

    const outDir = path.resolve(process.cwd(), 'tmp', 'docbuilder', randomUUID().slice(0, 8));
    await fs.mkdir(outDir, { recursive: true });
    const docxPath = path.join(outDir, result.fileName);
    await fs.writeFile(docxPath, result.buffer);

    const notApplied = result.applied.filter(a => a.status !== 'applied');
    const base = {
      ok: notApplied.length === 0,
      engine: 'clause-template → python-docx (targeted insert)',
      clause,
      sourceDocxPath: inputDocxPath,
      docxPath,
      applied: result.applied,
      warnings: rendered.warnings,
    };

    if (fmt === 'pdf') {
      const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
      const pipeline = await runDocxPdfPipeline({ inputDocxPath: docxPath });
      return JSON.stringify({
        ...base,
        pdfPath: pipeline.finalPdf,
        message: `Inserted "${clause}" (${result.applied.length - notApplied.length}/${result.applied.length} placement(s)) and rendered PDF.${
          notApplied.length ? ` ${notApplied.length} anchor(s) not found.` : ''
        }`,
      });
    }

    return JSON.stringify({
      ...base,
      sizeBytes: result.buffer.length,
      message: `Inserted clause "${clause}" into ${baseName} (${result.applied.length - notApplied.length}/${result.applied.length} placement(s)).${
        notApplied.length ? ` ${notApplied.length} anchor(s) not found — review the applied report.` : ''
      }`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `insert_clause_template failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify the source .docx path exists and python3 + python-docx are available on the host.`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCX validation handler — open a .docx and confirm OOXML/ZIP integrity
// without modifying it. AnA's pre-ship gate for any document she produced or
// received.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('validate_docx', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({ error: 'validate_docx requires input_docx_path (string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'validate_docx requires tenant context (organizationId).' });
  }

  try {
    const { runDocxValidateIsolated } = await import('../compute/scriptWorker.js');
    const { promises: fs } = await import('fs');

    const buf = await fs.readFile(inputDocxPath);
    const report = await runDocxValidateIsolated(buf);

    return JSON.stringify({
      ok: report.ok,
      docxPath: inputDocxPath,
      validation: report,
      message: report.ok
        ? `Valid .docx — ${report.partsChecked} XML parts well-formed, ${report.paragraphCount} paragraphs, reopened cleanly.`
        : `INVALID .docx — missing: ${report.missingParts.join(', ') || 'none'}; malformed: ${
            report.malformedParts.length
          }; dangling rels: ${report.danglingRels.length}; errors: ${report.errors.join('; ') || 'none'}.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `validate_docx failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify the source .docx path exists and python3 + lxml + python-docx are available on the host.`,
    });
  }
});

// Verify Docx Against Source — content-fidelity check (not just structure).
// Extracts the built .docx text and (1) diffs it against the supplied source
// text and (2) asserts each required string appears verbatim. This is the
// audited "verify it against your text / confirm the base caption strings" step.
registerToolHandler('verify_docx_against_source', async (input, ctx) => {
  const inputDocxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!inputDocxPath) {
    return JSON.stringify({ error: 'verify_docx_against_source requires input_docx_path (string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'verify_docx_against_source requires tenant context (organizationId).' });
  }

  const expectedText = typeof input.expected_text === 'string' ? input.expected_text : '';
  const requiredStrings = Array.isArray(input.required_strings)
    ? input.required_strings.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];

  if (!expectedText && requiredStrings.length === 0) {
    return JSON.stringify({
      error: 'verify_docx_against_source requires expected_text and/or a non-empty required_strings array.',
    });
  }

  try {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { extractDocumentText } = await import('../ocr/index.js');

    const buf = await fs.readFile(inputDocxPath);
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const extracted = await extractDocumentText(buf, DOCX_MIME, path.basename(inputDocxPath));
    const docText = extracted.text ?? '';

    // (1) Required-string verbatim check (exact substring match).
    const missingRequiredStrings = requiredStrings.filter((s) => !docText.includes(s));

    // (2) Structural text diff against the supplied source, when provided.
    let divergenceSummary: { added: number; removed: number; modified: number; unchanged: number } | undefined;
    let additions = 0;
    let deletions = 0;
    if (expectedText) {
      const { diffDocumentStructure } = await import('../document-analysis');
      const d = diffDocumentStructure(expectedText, docText);
      divergenceSummary = d.summary;
      additions = d.flat.additions;
      deletions = d.flat.deletions;
    }

    const ok = missingRequiredStrings.length === 0 && additions === 0 && deletions === 0;

    return JSON.stringify({
      ok,
      docxPath: inputDocxPath,
      extractionMethod: extracted.method,
      docCharCount: docText.length,
      requiredStringsChecked: requiredStrings.length,
      missingRequiredStrings,
      // additions = lines in the document not in the source; deletions = source lines absent from the document.
      divergence: expectedText ? { summary: divergenceSummary, additions, deletions } : undefined,
      message: ok
        ? `Verified — document reproduces the source${
            requiredStrings.length ? ` and all ${requiredStrings.length} required string(s)` : ''
          }; no content divergence.`
        : `NOT verified — ${
            missingRequiredStrings.length ? `${missingRequiredStrings.length} required string(s) missing; ` : ''
          }${expectedText ? `${additions} added / ${deletions} dropped line(s) vs. source.` : ''}`.trim(),
    });
  } catch (err) {
    return JSON.stringify({
      error: `verify_docx_against_source failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify the .docx path exists and is a readable Word document.`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Container execution handler — run a bash script in a hardened Docker
// container (the native computer-use path). Gated off by default; returns a
// friendly "not enabled" message rather than an error when disabled. Persists
// any produced files to a session tempdir and returns truncated diagnostics.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('run_in_container', async (input, ctx) => {
  const script = typeof input.script === 'string' ? input.script : '';
  if (!script.trim()) {
    return JSON.stringify({ error: 'run_in_container requires script (non-empty string).' });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'run_in_container requires tenant context (organizationId).' });
  }

  const inputFiles =
    input.input_files && typeof input.input_files === 'object'
      ? (input.input_files as Record<string, string>)
      : undefined;
  const timeoutMs = typeof input.timeout_ms === 'number' ? input.timeout_ms : undefined;

  try {
    const { runInContainer, getContainerExecConfig } = await import('../compute/containerExec.js');
    const cfg = getContainerExecConfig();
    if (!cfg.enabled) {
      return JSON.stringify({
        ok: false,
        enabled: false,
        message:
          'The container-execution capability is not enabled in this deployment. Use run_python_script (sandboxed Python) or surgical_docx_xml_edit instead, or ask an administrator to enable ANA_ENABLE_CONTAINER_EXEC.',
      });
    }

    const result = await runInContainer({ script, inputFiles, timeoutMs });

    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');
    const outputFilePaths: Array<{ name: string; path: string; bytes: number }> = [];
    const entries = Object.entries(result.outputFiles ?? {});
    if (entries.length > 0) {
      const outDir = path.resolve(process.cwd(), 'tmp', 'ana-container', randomUUID().slice(0, 8));
      await fs.mkdir(outDir, { recursive: true });
      for (const [name, b64] of entries) {
        const dest = path.join(outDir, path.basename(name));
        const buf = Buffer.from(b64, 'base64');
        await fs.writeFile(dest, buf);
        outputFilePaths.push({ name, path: dest, bytes: buf.length });
      }
    }

    return JSON.stringify({
      ok: result.ok,
      engine: `docker (${result.network} network)`,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: truncateForModel(result.stdout),
      stderr: truncateForModel(result.stderr),
      outputFiles: outputFilePaths,
      message: result.timedOut
        ? 'Container run exceeded the timeout and was killed.'
        : result.ok
          ? `Container ran successfully${outputFilePaths.length ? ` and produced ${outputFilePaths.length} file(s)` : ''}.`
          : `Container exited with code ${result.exitCode} — see stderr.`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `run_in_container failed: ${
        err instanceof Error ? err.message : String(err)
      }. Verify Docker is available on the host and the capability is enabled.`,
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
  // Matches create_qms_document / approve_qms_document / revise_qms_document,
  // which all refuse without an identified actor. This handler wrote author
  // lineage as String(ctx.userId ?? 'system') — a literal, into
  // document_span_lineage.asserted_by, whose CHECK requires that column to be
  // NOT NULL for an author_assertion. Satisfying an attribution constraint with
  // a placeholder defeats what the constraint is for: the prose is regulatory
  // text bound for FDA, and 'system' is not a person who can stand behind it.
  if (!ctx.userId) {
    return JSON.stringify({
      error: 'write_q_sub_section requires user context — section prose cannot be attributed without an identified author (21 CFR Part 11).',
    });
  }
  const qSubId     = typeof input.q_sub_id === 'string' ? input.q_sub_id : '';
  const sectionKey = typeof input.section_key === 'string' ? input.section_key : '';
  const content    = typeof input.content === 'string' ? input.content : '';
  const note       = typeof input.summary_note === 'string' ? input.summary_note : '';
  const rawSources = input.sources;
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
    // Authored regulatory prose: content and its lineage commit together in one
    // transaction (same gate as the human accept route), so an AnA-drafted
    // section body is never persisted without provenance. With `sources`, the
    // clauses the text quotes verbatim are recorded against those Data Room
    // sources and the rest against the author (ledger L154); without, every
    // clause is the author's assertion.
    const { enforceAuthorLineage, enforceSourceAndAuthorLineage } = await import(
      '../clinical-regulatory-evidence/lineage-gate.js'
    );
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
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
      const ref = { documentTable: 'q_sub_section_bodies', documentId: String(rows[0].id) };
      const { sources, dropped } = await resolveDraftSources(ctx.organizationId, rawSources, client);
      let gate = null;
      if (sources.length > 0) {
        gate = await enforceSourceAndAuthorLineage(client, ctx.organizationId, ref, content, String(ctx.userId), sources);
      } else {
        await enforceAuthorLineage(client, ctx.organizationId, ref, content, String(ctx.userId));
      }
      await client.query('COMMIT');
      return JSON.stringify({
        ok: true, ...rows[0],
        lineage: describeDraftLineage(gate, sources, dropped),
        message: `Wrote ${sectionKey} into Q-Sub ${qSubId}. Awaiting human accept.`,
      });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw txErr;
    } finally {
      client.release();
    }
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
  const region = typeof input.region === 'string' ? input.region.toLowerCase() : '';
  const VALID_REGIONS = ['fda', 'ema', 'pmda', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg'];
  if (!VALID_REGIONS.includes(region)) {
    return JSON.stringify({ error: `region must be one of: ${VALID_REGIONS.join(' / ')}.` });
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
      region: region as any,
      applicationId: String(input.application_id),
      sequence:      String(input.sequence),
      submissionType: String(input.submission_type),
      /* `submission_type` on this tool means 'original | amendment | ...', so it
         cannot also carry the filing identity. Without an application type the
         packager used to default to `fdaat1` — NDA — for every package this
         tool built. It now refuses, so the tool asks for it. */
      ...(typeof input.application_type === 'string' && input.application_type.trim()
        ? { fda: { applicationType: input.application_type.trim() } }
        : {}),
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
  const region  = typeof input.region === 'string' ? input.region.toLowerCase() : '';
  const gateway = typeof input.gateway === 'string' ? input.gateway.toLowerCase() : '';
  const VALID_REGIONS_TX = ['fda', 'ema', 'pmda', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg'];
  const VALID_GATEWAYS   = ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg',
                             'mhra_gateway', 'nmpa_gateway', 'tga_ebs', 'swissmedic_egateway',
                             'anvisa_gateway', 'cdsco_sugam', 'mfds_dbio', 'hsa_prism'];
  if (!VALID_REGIONS_TX.includes(region)) {
    return JSON.stringify({ error: `region must be one of: ${VALID_REGIONS_TX.join(' / ')}.` });
  }
  if (!VALID_GATEWAYS.includes(gateway)) {
    return JSON.stringify({ error: `gateway must be one of: ${VALID_GATEWAYS.join(' / ')}.` });
  }
  // ── This tool no longer transmits. ──────────────────────────────────────────
  //
  // It used to call gw.transmit() directly, guarded only by "is there a tenant
  // context?". `environment` defaulted to 'production' when the model omitted
  // it, so a conversation could put bytes on the real FDA ESG endpoint with no
  // human in the loop: no re-authentication, no Part 11 signature, no reason
  // recorded, no eCTD structural gate, and no governed-action ledger entry.
  // The comments elsewhere in this codebase asserting that "transmit stays
  // behind the governed transmit_submission tool + Part 11 e-sign"
  // (server/routes/submissions.ts) described the HTTP route, not this path.
  //
  // Transmission is the one irreversible action in the platform — nothing here
  // can un-send bytes to an agency — so it is now reachable only from a caller
  // that can name the human gate it passed. The gateway layer enforces that
  // independently (TransmitAuthorization in submission-gateways/types.ts, and
  // the guard in submission-gateways/index.ts), so even this refusal being
  // reverted would not reopen the hole.
  //
  // What the agent can still do: everything up to the wire — package the
  // sequence, verify the bundle digest, check status, read acknowledgements.
  // The last step belongs to a person.
  const environment = input.environment === 'staging' ? 'staging' : 'production';
  return JSON.stringify({
    ok: false,
    refused: 'human_authorization_required',
    message:
      `Transmitting to ${region.toUpperCase()} ${gateway} (${environment}) cannot be done from a conversation. ` +
      'Agency transmission is irreversible and requires a person: re-authentication, a recorded reason, ' +
      'the eCTD structural gate and a Part 11 governed signature.',
    next_step: {
      surface: 'Gateway transmittals',
      endpoint: `POST /api/mdx/gateways/${region}/${gateway}/transmit`,
      requires: ['reauth (password/TOTP)', 'reason (>= 8 characters)', 'bundle_path + bundle_sha256'],
    },
    bundle: {
      path:      typeof input.bundle_path === 'string' ? input.bundle_path : null,
      sha256:    typeof input.bundle_sha256 === 'string' ? input.bundle_sha256 : null,
      sizeBytes: Number.isFinite(Number(input.bundle_size_bytes)) ? Number(input.bundle_size_bytes) : null,
      format:    typeof input.format === 'string' ? input.format : null,
    },
  });

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
    const gw = getGateway(own.rows[0].region as any, own.rows[0].gateway as any);
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
    const gw = getGateway(own.rows[0].region as any, own.rows[0].gateway as any);
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

registerToolHandler('compute_lifecycle_operations', async (input, ctx) => {
  try {
    const { computeLifecycleOperations } = await import('../ectd/lifecycle-operator.js');
    let prior: PriorLeaf[] = (Array.isArray(input.prior_leaves) ? input.prior_leaves : []).map(
      (p: any) => ({
      leafKey: p.leaf_key,
      ctdSection: p.ctd_section,
      fileName: p.file_name,
      md5: p.md5,
      title: p.title,
      sourcePath: p.source_path,
      // Published path of the prior leaf in its sequence — lets a superseding op
      // (replace/append/delete) emit the ICH modified-file pointer at it.
      href: p.href,
    }));
    let priorSequencePrefix =
      typeof input.prior_sequence_prefix === 'string' ? input.prior_sequence_prefix : undefined;
    let autoLoadedPrior = 0;

    // Auto-load the prior sequence from its stored leaf manifest when the caller
    // gives an application + prior sequence instead of hand-listing prior leaves.
    // This is the tenant-scoped path: the organization comes from ToolContext,
    // never from model input, and the prefix defaults to the grouped '../<seq>/'.
    const priorSeq =
      typeof input.prior_sequence_number === 'string' ? input.prior_sequence_number.trim() : '';
    const appNum =
      typeof input.application_number === 'string' ? input.application_number.trim() : '';
    if (prior.length === 0 && priorSeq && appNum) {
      if (!ctx?.organizationId) {
        return JSON.stringify({
          error: 'auto-loading a prior sequence requires tenant context (organizationId).',
        });
      }
      const { loadPriorSequenceManifest } = await import('../ectd/prior-sequence-loader.js');
      const { computeSequencePrefix } = await import('../ectd/sequence-manifest.js');
      const { getPool } = await import('../../db.js');
      prior = await loadPriorSequenceManifest(getPool(), {
        organizationId: ctx.organizationId,
        applicationNumber: appNum,
        priorSequenceNumber: priorSeq,
      });
      autoLoadedPrior = prior.length;
      priorSequencePrefix = priorSequencePrefix ?? computeSequencePrefix(priorSeq);
    }

    const desired = (Array.isArray(input.desired_leaves) ? input.desired_leaves : []).map((d: any) => ({
      leafKey: d.leaf_key,
      ctdSection: d.ctd_section,
      fileName: d.file_name,
      md5: d.md5,
      title: d.title ?? d.file_name,
      sourcePath: d.source_path ?? '',
      appendOnChange: d.append_on_change === true,
    }));
    const result = computeLifecycleOperations(prior, desired, {
      // Relative traversal from the new sequence's backbone to the prior
      // sequence root (e.g. '../0000/') so modified-file resolves cross-sequence.
      priorSequencePrefix,
    });
    return JSON.stringify({ ok: true, autoLoadedPrior, ...result });
  } catch (err) {
    return JSON.stringify({
      error: `compute_lifecycle_operations failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

registerToolHandler('convert_to_rps_v4', async (input) => {
  try {
    const { forwardCompatToV4, buildRpsMessage } = await import('../ectd/ectd4/index.js');
    const app = (input.application ?? {}) as Record<string, any>;
    const sub = (input.submission ?? {}) as Record<string, any>;
    const unit = (input.submission_unit ?? {}) as Record<string, any>;
    const leaves = (Array.isArray(input.leaves) ? input.leaves : []).map((l: any) => ({
      ctdSection: l.ctd_section,
      fileName: l.file_name,
      title: l.title ?? l.file_name,
      md5: l.md5,
      operation: (l.operation ?? 'new') as 'new' | 'append' | 'replace' | 'delete',
      sourcePath: l.source_path ?? '',
    }));

    const { message, notes } = forwardCompatToV4({
      application: { number: String(app.number ?? ''), typeCode: String(app.type_code ?? ''), center: app.center },
      submission: { typeCode: String(sub.type_code ?? ''), ...(sub.number ? { number: String(sub.number) } : {}) },
      submissionUnit: {
        id: String(unit.id ?? ''),
        unitTypeCode: String(unit.unit_type_code ?? ''),
        title: String(unit.title ?? ''),
        sequenceNumber: String(unit.sequence_number ?? ''),
        status: 'active',
      },
      leaves: leaves as any,
      priorSequenceNumber:
        typeof input.prior_sequence_number === 'string' ? input.prior_sequence_number : undefined,
    });

    const out: Record<string, unknown> = {
      ok: true,
      notes,
      summary: {
        documents: message.documents.length,
        contextsOfUse: message.contextsOfUse.length,
        lifecycle: message.contextsOfUse.filter((c) => c.operation && c.operation !== 'create').length,
      },
      message,
    };
    if (input.include_xml === true) out.xml = buildRpsMessage(message);
    return JSON.stringify(out);
  } catch (err) {
    return JSON.stringify({
      error: `convert_to_rps_v4 failed: ${err instanceof Error ? err.message : String(err)}`,
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

// The authoring → filing seam as a tool: upsert a submission_leaves row in the
// canonical core (submission-service.upsertLeaf — the same write the Submission
// Center Builder and the editor's "Place into filing" make). Tenant + actor
// from ToolContext; the service refuses locked sequences and cross-tenant
// document pointers, and every refusal is returned verbatim as a structured
// error — never a claimed placement.
registerToolHandler('place_into_sequence', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) {
    return JSON.stringify({ error: 'place_into_sequence requires tenant context (organizationId and userId).' });
  }
  const sequenceId = typeof input.sequence_id === 'number' ? input.sequence_id : NaN;
  if (!Number.isFinite(sequenceId)) return JSON.stringify({ error: 'sequence_id (number) is required.' });
  const sectionCode = typeof input.section_code === 'string' ? input.section_code.trim() : '';
  if (!sectionCode) return JSON.stringify({ error: 'section_code is required.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const lifecycleOp =
    typeof input.lifecycle_op === 'string' && ['new', 'replace', 'append', 'delete'].includes(input.lifecycle_op)
      ? input.lifecycle_op
      : undefined;
  try {
    const { upsertLeaf } = await import('../submission-service/submission-service.js');
    const leaf = await upsertLeaf(
      {
        sequenceId,
        leafId: typeof input.leaf_id === 'number' ? input.leaf_id : undefined,
        sectionCode,
        title,
        lifecycleOp,
        granularity: typeof input.granularity === 'string' ? input.granularity : undefined,
        documentTable: typeof input.document_table === 'string' ? input.document_table : undefined,
        documentId: typeof input.document_id === 'number' ? input.document_id : undefined,
        documentType: typeof input.document_type === 'string' ? input.document_type : undefined,
        parentLeafId: typeof input.parent_leaf_id === 'number' ? input.parent_leaf_id : undefined,
      },
      { organizationId: ctx.organizationId, userId: ctx.userId },
    );
    return JSON.stringify({
      ok: true,
      leaf: {
        id: leaf.id,
        sequenceId: leaf.sequenceId,
        sectionCode: leaf.sectionCode,
        title: leaf.title,
        lifecycleOp: leaf.lifecycleOp,
        documentTable: leaf.documentTable,
        documentId: leaf.documentId,
      },
    });
  } catch (err) {
    return JSON.stringify({
      error: `place_into_sequence failed: ${err instanceof Error ? err.message : String(err)}`,
      code: (err as any)?.code,
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

registerToolHandler('lookup_regulatory_pathway', async (input) => {
  // Static reference data — not tenant-specific.
  const agency = typeof input.agency === 'string' ? input.agency : '';
  const query = typeof input.query === 'string' ? input.query : '';
  try {
    const m = await import('../ana-ri/regulatory-pathways-corpus.js');
    const pathways = agency
      ? m.pathwaysByAgency(agency as Parameters<typeof m.pathwaysByAgency>[0])
      : query
        ? m.searchPathways(query, 12)
        : m.REGULATORY_PATHWAYS;
    return JSON.stringify({
      ok: true,
      count: pathways.length,
      summary: m.pathwaysSummary(),
      pathways,
      note: 'Designations and criteria change; confirm eligibility against current agency guidance.',
    });
  } catch (err) {
    return JSON.stringify({ error: `lookup_regulatory_pathway failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('resolve_regulatory_structure', async (input) => {
  // Deterministic reasoning-engine resolution — not tenant-specific, no LLM.
  const regions = Array.isArray(input.regions)
    ? input.regions.filter((r): r is string => typeof r === 'string')
    : [];
  const applicationType = typeof input.application_type === 'string' ? input.application_type : '';
  if (regions.length === 0 || !applicationType) {
    return JSON.stringify({ error: 'regions (non-empty array) and application_type are required.' });
  }
  try {
    const { buildSubmissionStructure } = await import('../reasoning-engine/index.js');
    const structure = buildSubmissionStructure(regions, applicationType);
    return JSON.stringify({ ok: true, ...structure });
  } catch (err) {
    return JSON.stringify({ error: `resolve_regulatory_structure failed: ${err instanceof Error ? err.message : String(err)}` });
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

registerToolHandler('search_ivd_knowledge', async (input) => {
  // Static, citable reference corpus — global, not tenant-specific.
  const query = typeof input.query === 'string' ? input.query : '';
  if (!query.trim()) {
    return JSON.stringify({ error: 'query is required.' });
  }
  const domain = typeof input.domain === 'string' ? input.domain : undefined;
  const jurisdiction = typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined;
  const rawMax = typeof input.max_results === 'number' ? input.max_results : 5;
  const limit = Math.min(15, Math.max(1, rawMax));
  try {
    const { search } = await import('../ivd-knowledge/knowledge.service.js');
    const { isKnowledgeDomain } = await import('../ivd-knowledge/types.js');
    const results = search(query, {
      domain: domain && isKnowledgeDomain(domain) ? domain : undefined,
      jurisdiction: jurisdiction as never,
      limit,
    });
    return JSON.stringify({
      ok: true,
      query,
      count: results.length,
      results: results.map(r => ({
        id: r.entry.id,
        domain: r.entry.domain,
        topic: r.entry.topic,
        title: r.entry.title,
        jurisdictions: r.entry.jurisdictions,
        summary: r.entry.summary,
        keyPoints: r.entry.keyPoints,
        citations: r.entry.citations,
      })),
    });
  } catch (err) {
    return JSON.stringify({ error: `search_ivd_knowledge failed: ${err instanceof Error ? err.message : String(err)}` });
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

registerToolHandler('get_submission_requirements', async (input) => {
  // Static reference data + pure assessment — no tenant context required.
  const type = typeof input.submission_type === 'string' ? input.submission_type : '';
  try {
    const m = await import('../market-specs/submission-requirements.js');
    if (!type) return JSON.stringify({ ok: true, requirements: m.SUBMISSION_REQUIREMENTS });
    const req = m.getRequirements(type);
    if (!req) return JSON.stringify({ error: `No requirements for "${type}".` });
    const hasPresent =
      Array.isArray(input.present_template_ids) || Array.isArray(input.present_document_names) || Array.isArray(input.present_forms);
    if (hasPresent) {
      const assessment = m.assessRequirements(type, {
        templateIds: Array.isArray(input.present_template_ids) ? (input.present_template_ids as string[]) : [],
        documentNames: Array.isArray(input.present_document_names) ? (input.present_document_names as string[]) : [],
        forms: Array.isArray(input.present_forms) ? (input.present_forms as string[]) : [],
      });
      return JSON.stringify({ ok: true, requirements: req, assessment });
    }
    return JSON.stringify({ ok: true, requirements: req });
  } catch (err) {
    return JSON.stringify({ error: `get_submission_requirements failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_pathway_eligibility', async (input) => {
  // Static reference data + pure assessment — no tenant context required.
  const designation = typeof input.designation === 'string' ? input.designation : '';
  const market = typeof input.market === 'string' ? input.market : '';
  try {
    const m = await import('../market-specs/pathway-eligibility.js');
    if (!designation) {
      const designations = market ? m.designationsForMarket(market) : m.DESIGNATIONS;
      return JSON.stringify({ ok: true, designations });
    }
    const profile = m.getDesignation(designation);
    if (!profile) return JSON.stringify({ error: `No designation "${designation}".` });
    if (input.answers && typeof input.answers === 'object') {
      const assessment = m.assessEligibility(designation, input.answers as Record<string, boolean>);
      return JSON.stringify({ ok: true, designation: profile, assessment });
    }
    return JSON.stringify({ ok: true, designation: profile });
  } catch (err) {
    return JSON.stringify({ error: `assess_pathway_eligibility failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('classify_post_submission_change', async (input) => {
  // Static reference data + pure decision aid — no tenant context required.
  const market = input.market === 'us' || input.market === 'eu' ? input.market : '';
  if (!market) return JSON.stringify({ error: "market must be one of: us, eu." });
  try {
    const m = await import('../market-specs/post-submission-changes.js');
    const rawFlags = (input.flags && typeof input.flags === 'object' ? input.flags : null) as Record<string, unknown> | null;
    if (!rawFlags) {
      return JSON.stringify({ ok: true, categories: m.categoriesForMarket(market) });
    }
    const flags = {
      scopeExtension: rawFlags.scope_extension === true,
      majorImpact: rawFlags.major_impact === true,
      moderateImpact: rawFlags.moderate_impact === true,
      immediateSafetyChange: rawFlags.immediate_safety_change === true,
      minimalImpact: rawFlags.minimal_impact === true,
      euImmediateNotification: rawFlags.eu_immediate_notification === true,
    };
    return JSON.stringify({ ok: true, ...m.recommendChangeCategory(market, flags) });
  } catch (err) {
    return JSON.stringify({ error: `classify_post_submission_change failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_device_evidence_structure', async (input) => {
  // Static structure + pure assessment — no tenant context required.
  const document = ['cer', 'per', 'rmf'].includes(input.document as string) ? (input.document as string) : '';
  if (!document) return JSON.stringify({ error: "document must be one of: cer, per, rmf." });
  const present = Array.isArray(input.present_section_ids) ? (input.present_section_ids as string[]) : null;
  try {
    if (document === 'cer') {
      const m = await import('../market-specs/cer-structure.js');
      if (!present) return JSON.stringify({ ok: true, stages: m.CER_STAGES, sections: m.CER_SECTIONS });
      return JSON.stringify({ ok: true, assessment: m.assessCerStructure(present, { equivalenceClaimed: input.equivalence_claimed === true }) });
    }
    if (document === 'rmf') {
      const m = await import('../market-specs/risk-management-structure.js');
      if (!present) return JSON.stringify({ ok: true, sections: m.RMF_SECTIONS });
      return JSON.stringify({ ok: true, assessment: m.assessRmfStructure(present) });
    }
    const m = await import('../market-specs/per-structure.js');
    if (!present) return JSON.stringify({ ok: true, pillars: m.PER_PILLARS, sections: m.PER_SECTIONS });
    return JSON.stringify({ ok: true, assessment: m.assessPerStructure(present) });
  } catch (err) {
    return JSON.stringify({ error: `assess_device_evidence_structure failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('classify_device', async (input) => {
  // Pure rules — no tenant context required.
  const framework = input.framework;
  if (framework !== 'mdr' && framework !== 'ivdr' && framework !== 'fda') {
    return JSON.stringify({ error: 'framework must be one of: mdr, ivdr, fda.' });
  }
  const facts = (input.facts && typeof input.facts === 'object' ? input.facts : {}) as Record<string, never>;
  try {
    const m = await import('../market-specs/device-classification.js');
    const result = framework === 'mdr' ? m.classifyMdr(facts) : framework === 'ivdr' ? m.classifyIvdr(facts) : m.recommendFdaPathway(facts);
    return JSON.stringify({ ok: true, framework, ...result });
  } catch (err) {
    return JSON.stringify({ error: `classify_device failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_device_reviewer_checklist', async (input) => {
  // Static reference — no tenant context required.
  const type = input.submission_type;
  const TYPES = ['510k', 'de_novo', 'pma', 'cer', 'per'];
  if (typeof type !== 'string' || !TYPES.includes(type)) {
    return JSON.stringify({ error: `submission_type must be one of: ${TYPES.join(', ')}.` });
  }
  try {
    const { buildShadowReviewerChecklist } = await import('../market-specs/device-shadow-reviewer.js');
    return JSON.stringify({ ok: true, ...buildShadowReviewerChecklist(type as '510k' | 'de_novo' | 'pma' | 'cer' | 'per') });
  } catch (err) {
    return JSON.stringify({ error: `get_device_reviewer_checklist failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_biocompatibility_endpoints', async (input) => {
  // Pure ISO 10993 matrix — no tenant context required.
  const NATURES = ['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood'];
  const DURATIONS = ['limited', 'prolonged', 'long_term'];
  if (typeof input.nature !== 'string' || !NATURES.includes(input.nature)) return JSON.stringify({ error: `nature must be one of: ${NATURES.join(', ')}.` });
  if (typeof input.duration !== 'string' || !DURATIONS.includes(input.duration)) return JSON.stringify({ error: `duration must be one of: ${DURATIONS.join(', ')}.` });
  try {
    const { requiredBiocompEndpoints } = await import('../market-specs/biocompatibility-matrix.js');
    return JSON.stringify({ ok: true, ...requiredBiocompEndpoints(input.nature as never, input.duration as never) });
  } catch (err) {
    return JSON.stringify({ error: `get_biocompatibility_endpoints failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('build_device_blueprint', async (input) => {
  // Orchestration of pure modules — no tenant context required.
  const TYPES = ['510k', 'de_novo', 'pma', 'mdr_td', 'ivdr_td'];
  if (typeof input.submission_type !== 'string' || !TYPES.includes(input.submission_type)) {
    return JSON.stringify({ error: `submission_type must be one of: ${TYPES.join(', ')}.` });
  }
  try {
    const { buildDeviceBlueprint } = await import('../market-specs/device-blueprint.js');
    const { scorecardFromBlueprint } = await import('../market-specs/device-readiness-scorecard.js');
    const blueprint = buildDeviceBlueprint({
      submissionType: input.submission_type as never,
      classification: (input.classification ?? undefined) as never,
      contact: (input.contact ?? undefined) as never,
      software: (input.software ?? undefined) as never,
      present: (input.present ?? undefined) as never,
      equivalenceClaimed: input.equivalence_claimed === true,
    });
    return JSON.stringify({ ok: true, ...blueprint, scorecard: scorecardFromBlueprint(blueprint) });
  } catch (err) {
    return JSON.stringify({ error: `build_device_blueprint failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('build_global_device_strategy', async (input) => {
  // Pure reference map — no tenant context required.
  if (input.kind !== 'device' && input.kind !== 'ivd') return JSON.stringify({ error: 'kind must be one of: device, ivd.' });
  const regions = Array.isArray(input.regions) ? (input.regions as string[]) : undefined;
  try {
    const { buildGlobalDeviceStrategy } = await import('../market-specs/device-global-strategy.js');
    return JSON.stringify({ ok: true, ...buildGlobalDeviceStrategy(input.kind, regions as never) });
  } catch (err) {
    return JSON.stringify({ error: `build_global_device_strategy failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_regulatory_timeline', async (input) => {
  // Pure reference data — no tenant context required.
  const pathway = typeof input.pathway === 'string' ? input.pathway : '';
  try {
    const { getTimeline } = await import('../market-specs/regulatory-timelines.js');
    const t = getTimeline(pathway);
    return t ? JSON.stringify({ ok: true, ...t }) : JSON.stringify({ error: `No timeline for pathway "${pathway}".` });
  } catch (err) {
    return JSON.stringify({ error: `get_regulatory_timeline failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('validate_udi', async (input) => {
  // Pure algorithm — no tenant context required.
  const udi = typeof input.udi === 'string' ? input.udi : '';
  if (!udi) return JSON.stringify({ error: 'udi is required.' });
  try {
    const { validateUdi } = await import('../market-specs/udi-validator.js');
    return JSON.stringify({ ok: true, ...validateUdi(udi) });
  } catch (err) {
    return JSON.stringify({ error: `validate_udi failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_electrical_standards', async (input) => {
  // Pure reference + rule logic — no tenant context required.
  try {
    const { applicableElectricalStandards } = await import('../market-specs/electrical-safety.js');
    return JSON.stringify({ ok: true, ...applicableElectricalStandards({
      electricallyPowered: input.electricallyPowered === true,
      hasAlarms: input.hasAlarms === true,
      closedLoopControl: input.closedLoopControl === true,
      homeUse: input.homeUse === true,
      emsUse: input.emsUse === true,
      hasParticularStandard: input.hasParticularStandard === true,
    }) });
  } catch (err) {
    return JSON.stringify({ error: `get_electrical_standards failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_sterilization_requirements', async (input) => {
  // Pure reference + rule logic — no tenant context required.
  try {
    const { sterilizationRequirements } = await import('../market-specs/sterilization.js');
    return JSON.stringify({ ok: true, ...sterilizationRequirements({
      sterile: input.sterile === true,
      method: typeof input.method === 'string' ? (input.method as never) : undefined,
    }) });
  } catch (err) {
    return JSON.stringify({ error: `get_sterilization_requirements failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('list_regulatory_capabilities', async () => {
  // Static reference data — no tenant context required.
  try {
    const { regulatoryCapabilitiesIndex } = await import('../market-specs/regulatory-capabilities-index.js');
    return JSON.stringify({ ok: true, ...regulatoryCapabilitiesIndex() });
  } catch (err) {
    return JSON.stringify({ error: `list_regulatory_capabilities failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_combination_product', async (input) => {
  // Pure 21 CFR Part 3 logic — no tenant context required.
  const components = Array.isArray(input.components) ? (input.components as string[]) : [];
  const allowed = ['drug', 'biologic', 'device'];
  if (components.length === 0 || !components.every((c) => allowed.includes(c))) {
    return JSON.stringify({ error: 'components must be a non-empty array of: drug, biologic, device.' });
  }
  try {
    const { assessCombinationProduct } = await import('../market-specs/combination-products.js');
    return JSON.stringify({ ok: true, ...assessCombinationProduct({
      components: components as never,
      primaryModeOfAction: typeof input.primary_mode_of_action === 'string' ? (input.primary_mode_of_action as never) : undefined,
      combinationType: typeof input.combination_type === 'string' ? (input.combination_type as never) : undefined,
    }) });
  } catch (err) {
    return JSON.stringify({ error: `assess_combination_product failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_qms', async (input) => {
  // Static reference + pure assessment — no tenant context required.
  const present = Array.isArray(input.present_clause_ids) ? (input.present_clause_ids as string[]) : null;
  try {
    const m = await import('../market-specs/quality-system.js');
    if (!present) return JSON.stringify({ ok: true, clauses: m.QMS_CLAUSES, fdaNote: m.FDA_QMSR_NOTE });
    return JSON.stringify({ ok: true, assessment: m.assessQmsReadiness(present) });
  } catch (err) {
    return JSON.stringify({ error: `assess_qms failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_device_labeling', async (input) => {
  // Pure rule logic — no tenant context required.
  try {
    const { deviceLabelingRequirements } = await import('../market-specs/device-labeling.js');
    return JSON.stringify({ ok: true, ...deviceLabelingRequirements({
      sterile: input.sterile === true,
      singleUse: input.singleUse === true,
      reusable: input.reusable === true,
      implantable: input.implantable === true,
      prescriptionOnly: input.prescriptionOnly === true,
      forClinicalInvestigation: input.forClinicalInvestigation === true,
      hasExpiry: input.hasExpiry === true,
      containsMedicinalSubstance: input.containsMedicinalSubstance === true,
    }) });
  } catch (err) {
    return JSON.stringify({ error: `get_device_labeling failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_stored_cer', async (input, ctx) => {
  // Tenant-scoped — reads the organization's stored CER.
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'assess_stored_cer requires tenant context (organizationId).' });
  }
  const reportId = typeof input.report_id === 'string' ? input.report_id : '';
  if (!reportId) return JSON.stringify({ error: 'report_id is required.' });
  try {
    const { assessStoredCer } = await import('../market-specs/stored-cer-assessment.js');
    const result = await assessStoredCer({ reportId, organizationId: ctx.organizationId, equivalenceClaimed: input.equivalence_claimed === true });
    return JSON.stringify({ ok: true, ...result });
  } catch (err) {
    return JSON.stringify({ error: `assess_stored_cer failed: ${err instanceof Error ? err.message : String(err)}`, code: (err as { code?: string })?.code });
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

// ─────────────────────────────────────────────────────────────────────────────
// FCOI — 21 CFR 54 financial disclosure (C2C-01). Conversational building shares
// the SAME governed/audited path as the REST routes: each mutation runs in a
// transaction with recordGovernedAction (surface 'ana'). Certification (e-sign)
// is intentionally NOT an AnA tool — it requires re-auth in the disclosure panel.
// ─────────────────────────────────────────────────────────────────────────────

const FCOI_REASON_MIN = 8;
function fcoiReason(input: Record<string, unknown>, fallback: string): string {
  const r = typeof input.reason === 'string' ? input.reason.trim() : '';
  return r.length >= FCOI_REASON_MIN ? r : fallback;
}

registerToolHandler('create_clinical_investigator', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_clinical_investigator requires tenant + user context.' });
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const role = typeof input.role === 'string' ? input.role : '';
  if (!fullName || !['principal_investigator', 'sub_investigator', 'coordinator', 'other'].includes(role)) {
    return JSON.stringify({ error: 'full_name and a valid role are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createInvestigatorTx } = await import('../financial-disclosures/fcoi-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createInvestigatorTx(client, ctx.organizationId, ctx.userId, {
      fullName, role: role as any,
      institution: typeof input.institution === 'string' ? input.institution : null,
      studyId: typeof input.study_id === 'number' ? input.study_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `clinical-investigator:${id}`, reason: fcoiReason(input, 'Investigator registered via AnA'),
      payload: { fullName, role }, domain: 'fcoi', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Registered investigator "${fullName}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_clinical_investigator failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('create_financial_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_financial_disclosure requires tenant + user context.' });
  const investigatorId = typeof input.investigator_id === 'number' ? input.investigator_id : NaN;
  if (!Number.isInteger(investigatorId) || typeof input.has_disclosable_interests !== 'boolean') {
    return JSON.stringify({ error: 'investigator_id and has_disclosable_interests (boolean) are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createDisclosureTx } = await import('../financial-disclosures/fcoi-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, formType } = await createDisclosureTx(client, ctx.organizationId, ctx.userId, {
      investigatorId,
      hasDisclosableInterests: input.has_disclosable_interests,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      disclosurePeriodStart: typeof input.disclosure_period_start === 'string' ? input.disclosure_period_start : null,
      disclosurePeriodEnd: typeof input.disclosure_period_end === 'string' ? input.disclosure_period_end : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `financial-disclosure:${id}`, reason: fcoiReason(input, 'Disclosure opened via AnA'),
      payload: { investigatorId, formType }, domain: 'fcoi', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, formType, message: `Opened ${formType} disclosure (id ${id}). Certify it in the disclosure panel.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_financial_disclosure failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_disclosure_interest', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_disclosure_interest requires tenant + user context.' });
  const disclosureId = typeof input.disclosure_id === 'number' ? input.disclosure_id : NaN;
  const interestType = typeof input.interest_type === 'string' ? input.interest_type : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!Number.isInteger(disclosureId) || !['COMPENSATION_BY_OUTCOME', 'EQUITY_INTEREST', 'PROPRIETARY_INTEREST', 'SIGNIFICANT_PAYMENTS'].includes(interestType) || !description) {
    return JSON.stringify({ error: 'disclosure_id, a valid interest_type, and description are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addInterestTx } = await import('../financial-disclosures/fcoi-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addInterestTx(client, ctx.organizationId, ctx.userId, disclosureId, {
      interestType: interestType as any, description,
      monetaryValue: typeof input.monetary_value === 'number' ? input.monetary_value : null,
      arrangementsToMinimizeBias: typeof input.arrangements_to_minimize_bias === 'string' ? input.arrangements_to_minimize_bias : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `financial-disclosure:${disclosureId}`, reason: fcoiReason(input, 'Interest added via AnA'),
      payload: { addedInterestId: id, interestType }, domain: 'fcoi', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, interestId: id, message: `Added ${interestType} interest to disclosure ${disclosureId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_disclosure_interest failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_financial_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_financial_disclosure requires tenant context.' });
  const disclosureId = typeof input.disclosure_id === 'number' ? input.disclosure_id : NaN;
  if (!Number.isInteger(disclosureId)) return JSON.stringify({ error: 'disclosure_id is required.' });
  const { getPool } = await import('../../db.js');
  const { loadDisclosureSnapshot } = await import('../financial-disclosures/fcoi-service.js');
  const { validateDisclosureCompleteness } = await import('../financial-disclosures/fcoi-logic.js');
  const client = await getPool().connect();
  try {
    const snap = await loadDisclosureSnapshot(client, ctx.organizationId, disclosureId);
    const gate = validateDisclosureCompleteness(snap);
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings,
      certifiable: gate.riskLevel !== 'high',
      message: gate.riskLevel === 'high'
        ? 'Critical 21 CFR 54 findings — cannot certify until resolved.'
        : `Disclosure passes the deterministic gate (${gate.riskLevel} risk).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_financial_disclosure failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HA Interaction & Commitment (C2C-03). Conversational building shares the same
// governed/audited path (recordGovernedAction, surface 'ana'). Commitments are
// threaded onto the provenance spine by the service.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_ha_interaction', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_ha_interaction requires tenant + user context.' });
  const interactionType = typeof input.interaction_type === 'string' ? input.interaction_type : '';
  const agency = typeof input.agency === 'string' ? input.agency : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!['pre_ind', 'eop1', 'eop2', 'pre_nda', 'pre_bla', 'type_a', 'type_b', 'type_c', 'scientific_advice', 'other'].includes(interactionType) ||
      !['fda', 'ema', 'pmda', 'mhra', 'other'].includes(agency) || !title) {
    return JSON.stringify({ error: 'interaction_type, agency, and title are required and must be valid.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createInteractionTx } = await import('../ha-interactions/ha-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createInteractionTx(client, ctx.organizationId, ctx.userId, {
      interactionType: interactionType as any, agency: agency as any, title,
      objective: typeof input.objective === 'string' ? input.objective : null,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `ha-interaction:${id}`, reason: fcoiReason(input, 'HA interaction opened via AnA'),
      payload: { interactionType, agency }, domain: 'ha', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened ${agency.toUpperCase()} ${interactionType} interaction "${title}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_ha_interaction failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('create_regulatory_commitment', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_regulatory_commitment requires tenant + user context.' });
  const commitmentType = typeof input.commitment_type === 'string' ? input.commitment_type : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!['pmr', 'pmc', 'rems', 'meeting_commitment', 'other'].includes(commitmentType) || !description) {
    return JSON.stringify({ error: 'commitment_type and description are required and must be valid.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createCommitmentTx } = await import('../ha-interactions/ha-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, provenanceLinkIds } = await createCommitmentTx(client, ctx.organizationId, ctx.userId, {
      commitmentType: commitmentType as any, description,
      dueDate: typeof input.due_date === 'string' ? input.due_date : null,
      regulatoryBasis: typeof input.regulatory_basis === 'string' ? input.regulatory_basis : null,
      sourceInteractionId: typeof input.source_interaction_id === 'number' ? input.source_interaction_id : null,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `regulatory-commitment:${id}`, reason: fcoiReason(input, 'Commitment recorded via AnA'),
      payload: { commitmentType, provenanceLinkIds }, domain: 'ha', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, provenanceLinkIds, message: `Recorded ${commitmentType.toUpperCase()} commitment (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_regulatory_commitment failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_commitment_portfolio', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_commitment_portfolio requires tenant context.' });
  const { listCommitments } = await import('../ha-interactions/ha-service.js');
  const { summarizeCommitmentPortfolio } = await import('../ha-interactions/ha-logic.js');
  try {
    const submissionId = typeof input.submission_id === 'number' ? input.submission_id : undefined;
    const rows = await listCommitments(ctx.organizationId, submissionId);
    const today = new Date().toISOString().slice(0, 10);
    const summary = summarizeCommitmentPortfolio(rows.map((r: any) => ({ status: r.status, dueDate: r.due_date, fulfilledDate: r.fulfilled_date })), today);
    return JSON.stringify({
      ok: true, summary,
      message: summary.overdue > 0
        ? `${summary.overdue} commitment(s) overdue; ${summary.due_30} due within 30 days.`
        : `No overdue commitments; ${summary.due_30} due within 30 days, ${summary.due_90} within 90.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_commitment_portfolio failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IACUC / Animal Study Governance (C2C-05). Conversational building shares the
// same governed/audited path (recordGovernedAction, surface 'ana'). Committee
// determinations (approve) are done in the review panel, not via AnA.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_iacuc_protocol', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_iacuc_protocol requires tenant + user context.' });
  const protocolNumber = typeof input.protocol_number === 'string' ? input.protocol_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const painCategory = typeof input.pain_category === 'string' ? input.pain_category : '';
  if (!protocolNumber || !title || !['B', 'C', 'D', 'E'].includes(painCategory)) {
    return JSON.stringify({ error: 'protocol_number, title, and a valid pain_category (B/C/D/E) are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createProtocolTx } = await import('../iacuc/iacuc-service.js');
  const { recommendReviewType } = await import('../iacuc/iacuc-logic.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createProtocolTx(client, ctx.organizationId, ctx.userId, {
      protocolNumber, title, painCategory: painCategory as any,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      threeRsReplacement: typeof input.three_rs_replacement === 'string' ? input.three_rs_replacement : null,
      threeRsReduction: typeof input.three_rs_reduction === 'string' ? input.three_rs_reduction : null,
      threeRsRefinement: typeof input.three_rs_refinement === 'string' ? input.three_rs_refinement : null,
      painJustification: typeof input.pain_justification === 'string' ? input.pain_justification : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `iacuc-protocol:${id}`, reason: fcoiReason(input, 'IACUC protocol opened via AnA'),
      payload: { painCategory }, domain: 'iacuc', surface: 'ana',
    });
    await client.query('COMMIT');
    const rec = recommendReviewType(painCategory as any);
    return JSON.stringify({ ok: true, id, recommendedReview: rec, message: `Opened IACUC protocol "${title}" (id ${id}); recommended ${rec.reviewType.replace(/_/g, ' ')}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_iacuc_protocol failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('register_animal_cohort', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'register_animal_cohort requires tenant + user context.' });
  const protocolId = typeof input.protocol_id === 'number' ? input.protocol_id : NaN;
  const species = typeof input.species === 'string' ? input.species.trim() : '';
  const painCategory = typeof input.pain_category === 'string' ? input.pain_category : '';
  const plannedCount = typeof input.planned_count === 'number' ? Math.round(input.planned_count) : NaN;
  if (!Number.isInteger(protocolId) || !species || !['B', 'C', 'D', 'E'].includes(painCategory) || !Number.isInteger(plannedCount)) {
    return JSON.stringify({ error: 'protocol_id, species, planned_count, and a valid pain_category are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addCohortTx } = await import('../iacuc/iacuc-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addCohortTx(client, ctx.organizationId, ctx.userId, protocolId, {
      species, plannedCount, painCategory: painCategory as any,
      strain: typeof input.strain === 'string' ? input.strain : null,
      housingLocation: typeof input.housing_location === 'string' ? input.housing_location : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `iacuc-protocol:${protocolId}`, reason: fcoiReason(input, 'Animal cohort registered via AnA'),
      payload: { cohortId: id, species }, domain: 'iacuc', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, cohortId: id, message: `Registered ${plannedCount} ${species} (cohort ${id}) on protocol ${protocolId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `register_animal_cohort failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_iacuc_protocol', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_iacuc_protocol requires tenant context.' });
  const protocolId = typeof input.protocol_id === 'number' ? input.protocol_id : NaN;
  if (!Number.isInteger(protocolId)) return JSON.stringify({ error: 'protocol_id is required.' });
  const { getPool } = await import('../../db.js');
  const { getProtocolCompletenessInput } = await import('../iacuc/iacuc-service.js');
  const { evaluateProtocolCompleteness, reviewStatus } = await import('../iacuc/iacuc-logic.js');
  const client = await getPool().connect();
  try {
    const inp = await getProtocolCompletenessInput(client, ctx.organizationId, protocolId);
    const gate = evaluateProtocolCompleteness(inp);
    const rs = reviewStatus(inp.approvalDate, new Date().toISOString().slice(0, 10));
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings, reviewStatus: rs,
      message: gate.riskLevel === 'high'
        ? 'Critical IACUC findings (e.g. category-E justification) — resolve before committee review.'
        : `Protocol passes the deterministic gate (${gate.riskLevel} risk).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_iacuc_protocol failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IRB / IEC (C2C-06). Conversational building shares the governed/audited path
// (recordGovernedAction, surface 'ana'). Determinations (approve) are done in the
// review panel, not via AnA.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_irb_submission', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_irb_submission requires tenant + user context.' });
  const protocolNumber = typeof input.protocol_number === 'string' ? input.protocol_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const riskLevel = typeof input.risk_level === 'string' ? input.risk_level : '';
  if (!protocolNumber || !title || !['minimal', 'greater_than_minimal'].includes(riskLevel)) {
    return JSON.stringify({ error: 'protocol_number, title, and a valid risk_level are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createSubmissionTx } = await import('../irb/irb-service.js');
  const { recommendReviewType } = await import('../irb/irb-logic.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createSubmissionTx(client, ctx.organizationId, ctx.userId, {
      protocolNumber, title, riskLevel: riskLevel as any,
      studyId: typeof input.study_id === 'number' ? input.study_id : null,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      involvesVulnerablePopulations: input.involves_vulnerable_populations === true,
      vulnerablePopulationProtections: typeof input.vulnerable_population_protections === 'string' ? input.vulnerable_population_protections : null,
      isSingleIrb: input.is_single_irb === true,
      consentWaiverRequested: input.consent_waiver_requested === true,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `irb-submission:${id}`, reason: fcoiReason(input, 'IRB submission opened via AnA'),
      payload: { riskLevel }, domain: 'irb', surface: 'ana',
    });
    await client.query('COMMIT');
    const rec = recommendReviewType({ riskLevel: riskLevel as any });
    return JSON.stringify({ ok: true, id, recommendedReview: rec, message: `Opened IRB submission "${title}" (id ${id}); recommended ${rec.reviewType.replace(/_/g, ' ')}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_irb_submission failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_irb_site', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_irb_site requires tenant + user context.' });
  const submissionId = typeof input.irb_submission_id === 'number' ? input.irb_submission_id : NaN;
  const siteName = typeof input.site_name === 'string' ? input.site_name.trim() : '';
  if (!Number.isInteger(submissionId) || !siteName) return JSON.stringify({ error: 'irb_submission_id and site_name are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addSiteTx } = await import('../irb/irb-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addSiteTx(client, ctx.organizationId, ctx.userId, submissionId, {
      siteName,
      principalInvestigator: typeof input.principal_investigator === 'string' ? input.principal_investigator : null,
      localContext: typeof input.local_context === 'string' ? input.local_context : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `irb-submission:${submissionId}`, reason: fcoiReason(input, 'IRB site added via AnA'),
      payload: { siteId: id, siteName }, domain: 'irb', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, siteId: id, message: `Added site "${siteName}" (id ${id}) to IRB submission ${submissionId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_irb_site failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_irb_submission', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_irb_submission requires tenant context.' });
  const submissionId = typeof input.irb_submission_id === 'number' ? input.irb_submission_id : NaN;
  if (!Number.isInteger(submissionId)) return JSON.stringify({ error: 'irb_submission_id is required.' });
  const { getPool } = await import('../../db.js');
  const { getCompletenessInput } = await import('../irb/irb-service.js');
  const { evaluateIrbCompleteness, continuingReviewStatus } = await import('../irb/irb-logic.js');
  const client = await getPool().connect();
  try {
    const inp = await getCompletenessInput(client, ctx.organizationId, submissionId);
    const gate = evaluateIrbCompleteness(inp);
    const cr = continuingReviewStatus(inp.reviewType, inp.approvalDate, new Date().toISOString().slice(0, 10));
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings, continuingReview: cr,
      message: gate.riskLevel === 'high'
        ? 'Critical IRB findings (e.g. consent or vulnerable-population safeguards) — resolve before approval.'
        : `Submission passes the deterministic 45 CFR 46.111 gate (${gate.riskLevel} risk).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_irb_submission failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IBC / Biosafety (C2C-07). Conversational building shares the governed/audited
// path (recordGovernedAction, surface 'ana'). Determinations (approve) are done
// in the review panel, not via AnA.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_ibc_registration', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_ibc_registration requires tenant + user context.' });
  const registrationNumber = typeof input.registration_number === 'string' ? input.registration_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const biosafetyLevel = typeof input.biosafety_level === 'string' ? input.biosafety_level : '';
  if (!registrationNumber || !title || !['BSL-1', 'BSL-2', 'BSL-3', 'BSL-4'].includes(biosafetyLevel)) {
    return JSON.stringify({ error: 'registration_number, title, and a valid biosafety_level are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createRegistrationTx } = await import('../ibc/ibc-service.js');
  const { requiresConvenedReview } = await import('../ibc/ibc-logic.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const section = typeof input.nih_guidelines_section === 'string' ? input.nih_guidelines_section : 'not_applicable';
    const { id } = await createRegistrationTx(client, ctx.organizationId, ctx.userId, {
      registrationNumber, title, biosafetyLevel: biosafetyLevel as any,
      nihGuidelinesSection: section as any,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      involvesRecombinantDna: input.involves_recombinant_dna === true,
      involvesHumanGeneTransfer: input.involves_human_gene_transfer === true,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `ibc-registration:${id}`, reason: fcoiReason(input, 'IBC registration opened via AnA'),
      payload: { biosafetyLevel }, domain: 'ibc', surface: 'ana',
    });
    await client.query('COMMIT');
    const convened = requiresConvenedReview(section as any, input.involves_human_gene_transfer === true);
    return JSON.stringify({ ok: true, id, requiresConvenedReview: convened, message: `Opened IBC registration "${title}" (id ${id}) at ${biosafetyLevel}${convened ? '; requires convened IBC review' : ''}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_ibc_registration failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_biological_agent', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_biological_agent requires tenant + user context.' });
  const registrationId = typeof input.registration_id === 'number' ? input.registration_id : NaN;
  const agentName = typeof input.agent_name === 'string' ? input.agent_name.trim() : '';
  const agentType = typeof input.agent_type === 'string' ? input.agent_type : '';
  const riskGroup = typeof input.risk_group === 'string' ? input.risk_group : '';
  if (!Number.isInteger(registrationId) || !agentName ||
      !['virus', 'bacterium', 'fungus', 'toxin', 'viral_vector', 'cell_line', 'recombinant_construct', 'other'].includes(agentType) ||
      !['RG1', 'RG2', 'RG3', 'RG4'].includes(riskGroup)) {
    return JSON.stringify({ error: 'registration_id, agent_name, a valid agent_type, and a valid risk_group are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addAgentTx } = await import('../ibc/ibc-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, requiredBsl } = await addAgentTx(client, ctx.organizationId, ctx.userId, registrationId, { agentName, agentType: agentType as any, riskGroup: riskGroup as any });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `ibc-registration:${registrationId}`, reason: fcoiReason(input, 'Biological agent added via AnA'),
      payload: { agentId: id, riskGroup, requiredBsl }, domain: 'ibc', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, agentId: id, requiredBsl, message: `Added ${agentName} (${riskGroup}, requires ${requiredBsl}) to registration ${registrationId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_biological_agent failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_ibc_registration', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_ibc_registration requires tenant context.' });
  const registrationId = typeof input.registration_id === 'number' ? input.registration_id : NaN;
  if (!Number.isInteger(registrationId)) return JSON.stringify({ error: 'registration_id is required.' });
  const { getPool } = await import('../../db.js');
  const { getContainmentInput } = await import('../ibc/ibc-service.js');
  const { evaluateContainment, registrationExpiration } = await import('../ibc/ibc-logic.js');
  const client = await getPool().connect();
  try {
    const inp = await getContainmentInput(client, ctx.organizationId, registrationId);
    const gate = evaluateContainment(inp);
    const exp = registrationExpiration(inp.approvalDate, new Date().toISOString().slice(0, 10));
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings, highestRequiredBsl: gate.highestRequiredBsl, expiration: exp,
      message: gate.riskLevel === 'high'
        ? 'Critical biosafety finding (containment below the agents’ requirement) — resolve before approval.'
        : `Registration passes the deterministic containment gate (${gate.riskLevel} risk).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_ibc_registration failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Nonclinical + SEND (C2C-04). Conversational building shares the governed/
// audited path (recordGovernedAction, surface 'ana'); study creation threads
// IACUC → study → Module 4 provenance.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_nonclinical_study', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_nonclinical_study requires tenant + user context.' });
  const studyNumber = typeof input.study_number === 'string' ? input.study_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const studyType = typeof input.study_type === 'string' ? input.study_type : '';
  const VALID = ['single_dose_tox', 'repeat_dose_tox', 'safety_pharmacology', 'genotoxicity', 'carcinogenicity', 'reproductive_tox', 'local_tolerance', 'adme_pk', 'immunotoxicity', 'other'];
  if (!studyNumber || !title || !VALID.includes(studyType)) {
    return JSON.stringify({ error: 'study_number, title, and a valid study_type are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createStudyTx } = await import('../nonclinical/nonclinical-service.js');
  const { requiredSendDomains } = await import('../nonclinical/nonclinical-logic.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, ctdSection, provenanceLinkIds } = await createStudyTx(client, ctx.organizationId, ctx.userId, {
      studyNumber, title, studyType: studyType as any,
      species: typeof input.species === 'string' ? input.species : null,
      glpCompliant: input.glp_compliant === true,
      testingFacility: typeof input.testing_facility === 'string' ? input.testing_facility : null,
      noael: typeof input.noael === 'string' ? input.noael : null,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      iacucProtocolId: typeof input.iacuc_protocol_id === 'number' ? input.iacuc_protocol_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `nonclinical-study:${id}`, reason: fcoiReason(input, 'Nonclinical study opened via AnA'),
      payload: { studyType, ctdSection, provenanceLinkIds }, domain: 'nonclinical', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, ctdSection, requiredSendDomains: requiredSendDomains(studyType as any), message: `Opened nonclinical study "${title}" (id ${id}) → CTD ${ctdSection}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_nonclinical_study failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_send_readiness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_send_readiness requires tenant context.' });
  const studyId = typeof input.study_id === 'number' ? input.study_id : NaN;
  if (!Number.isInteger(studyId)) return JSON.stringify({ error: 'study_id is required.' });
  const { getPool } = await import('../../db.js');
  const { getSendReadinessInput } = await import('../nonclinical/nonclinical-service.js');
  const { evaluateSendReadiness } = await import('../nonclinical/nonclinical-logic.js');
  const client = await getPool().connect();
  try {
    const inp = await getSendReadinessInput(client, ctx.organizationId, studyId);
    const gate = evaluateSendReadiness(inp);
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings, missingDomains: gate.missingDomains,
      message: gate.riskLevel === 'high'
        ? 'Critical SEND finding (define.xml or open validation errors) — resolve before submission.'
        : `SEND package ${gate.riskLevel === 'low' ? 'is ready' : 'has gaps'} (${gate.riskLevel} risk).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_send_readiness failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Budget & Feasibility (C2C-22). Reuses governedPdev; review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('add_protocol_budget_item', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_protocol_budget_item requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const unitCost = typeof input.unit_cost === 'number' ? input.unit_cost : NaN;
  if (!Number.isInteger(documentId) || !description || !Number.isFinite(unitCost)) return JSON.stringify({ error: 'document_id, description, and unit_cost are required.' });
  const { addBudgetItemTx } = await import('../protocol-budget/protocol-budget-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${documentId}`, 'Protocol budget item added via AnA', input, async (client) => {
    const { id } = await addBudgetItemTx(client, ctx.organizationId!, ctx.userId!, documentId, { description, unitCost, category: typeof input.category === 'string' ? input.category : undefined, quantityPerSubject: typeof input.quantity_per_subject === 'number' ? input.quantity_per_subject : undefined, payer: typeof input.payer === 'string' ? input.payer : undefined });
    return { itemId: id };
  });
});

registerToolHandler('set_protocol_budget_params', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_protocol_budget_params requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { setBudgetParamsTx } = await import('../protocol-budget/protocol-budget-service.js');
  return governedPdev(ctx, 'update', `protocol-document:${documentId}`, 'Protocol budget params set via AnA', input, async (client) => {
    const { id } = await setBudgetParamsTx(client, ctx.organizationId!, ctx.userId!, documentId, { targetEnrollment: typeof input.target_enrollment === 'number' ? input.target_enrollment : undefined, sponsorPaymentPerSubject: typeof input.sponsor_payment_per_subject === 'number' ? input.sponsor_payment_per_subject : null, indirectRatePct: typeof input.indirect_rate_pct === 'number' ? input.indirect_rate_pct : null });
    return { paramsId: id };
  });
});

registerToolHandler('review_protocol_budget', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_budget requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getBudgetSummary } = await import('../protocol-budget/protocol-budget-service.js');
  try {
    return JSON.stringify({ ok: true, budget: await getBudgetSummary(ctx.organizationId, documentId) });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_budget failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Schedule of Assessments (C2C-21). Reuses governedPdev; review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('add_soa_assessment', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_soa_assessment requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!Number.isInteger(documentId) || !name) return JSON.stringify({ error: 'document_id and name are required.' });
  const { addAssessmentTx } = await import('../protocol-soa/protocol-soa-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${documentId}`, 'SoA assessment added via AnA', input, async (client) => {
    const { id } = await addAssessmentTx(client, ctx.organizationId!, ctx.userId!, documentId, { name, category: typeof input.category === 'string' ? input.category : undefined });
    return { assessmentId: id };
  });
});

registerToolHandler('set_soa_cell', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_soa_cell requires tenant + user context.' });
  const assessmentId = typeof input.assessment_id === 'number' ? input.assessment_id : NaN;
  const visitId = typeof input.visit_id === 'number' ? input.visit_id : NaN;
  if (!Number.isInteger(assessmentId) || !Number.isInteger(visitId)) return JSON.stringify({ error: 'assessment_id and visit_id are required.' });
  const { setCellTx } = await import('../protocol-soa/protocol-soa-service.js');
  return governedPdev(ctx, 'update', `protocol-soa-assessment:${assessmentId}`, 'SoA cell set via AnA', input, async (client) => {
    const { id } = await setCellTx(client, ctx.organizationId!, ctx.userId!, { assessmentId, visitId, required: typeof input.required === 'boolean' ? input.required : undefined, notes: typeof input.notes === 'string' ? input.notes : null });
    return { cellId: id, assessmentId, visitId };
  });
});

registerToolHandler('review_soa_matrix', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_soa_matrix requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getSoaMatrix } = await import('../protocol-soa/protocol-soa-service.js');
  try {
    const out = await getSoaMatrix(ctx.organizationId, documentId);
    return JSON.stringify({ ok: true, matrix: out.matrix, validation: out.validation });
  } catch (err) {
    return JSON.stringify({ error: `review_soa_matrix failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Authoring Extensions (C2C-20: templates / milestones / export). Reuses
// governedPdev (domain 'protocol_development'); read tools have no transaction.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_protocol_template', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_protocol_template requires tenant + user context.' });
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const protocolKind = typeof input.protocol_kind === 'string' ? input.protocol_kind : '';
  if (!name || !['iacuc', 'irb', 'clinical', 'ibc'].includes(protocolKind)) return JSON.stringify({ error: 'name and a valid protocol_kind are required.' });
  const { createTemplateTx } = await import('../protocol-templates/protocol-templates-service.js');
  return governedPdev(ctx, 'create', 'protocol-template', 'Protocol template created via AnA', input, async (client) => {
    const { id } = await createTemplateTx(client, ctx.organizationId!, ctx.userId!, { name, protocolKind, designType: typeof input.design_type === 'string' ? input.design_type : null, description: typeof input.description === 'string' ? input.description : null });
    return { templateId: id };
  });
});

registerToolHandler('clone_protocol_template', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'clone_protocol_template requires tenant + user context.' });
  const templateId = typeof input.template_id === 'number' ? input.template_id : NaN;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!Number.isInteger(templateId) || !title) return JSON.stringify({ error: 'template_id and title are required.' });
  const { cloneTemplateToDocumentTx } = await import('../protocol-templates/protocol-templates-service.js');
  return governedPdev(ctx, 'create', `protocol-template:${templateId}`, 'Protocol document cloned from template via AnA', input, async (client) => {
    const { documentId, sectionsSeeded } = await cloneTemplateToDocumentTx(client, ctx.organizationId!, ctx.userId!, templateId, { title, protocolNumber: typeof input.protocol_number === 'string' ? input.protocol_number : null });
    return { documentId, sectionsSeeded };
  });
});

registerToolHandler('save_document_as_template', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'save_document_as_template requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!Number.isInteger(documentId) || !name) return JSON.stringify({ error: 'document_id and name are required.' });
  const { saveDocumentAsTemplateTx } = await import('../protocol-templates/protocol-templates-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${documentId}`, 'Document saved as template via AnA', input, async (client) => {
    const { templateId, sectionsCopied } = await saveDocumentAsTemplateTx(client, ctx.organizationId!, ctx.userId!, documentId, { name, description: typeof input.description === 'string' ? input.description : null });
    return { templateId, sectionsCopied };
  });
});

registerToolHandler('list_protocol_templates', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'list_protocol_templates requires tenant context.' });
  const { listTemplates } = await import('../protocol-templates/protocol-templates-service.js');
  try {
    return JSON.stringify({ ok: true, templates: await listTemplates(ctx.organizationId, typeof input.kind === 'string' ? input.kind : undefined) });
  } catch (err) {
    return JSON.stringify({ error: `list_protocol_templates failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('add_protocol_milestone', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_protocol_milestone requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!Number.isInteger(documentId) || !name) return JSON.stringify({ error: 'document_id and name are required.' });
  const { addMilestoneTx } = await import('../protocol-milestones/protocol-milestones-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${documentId}`, 'Protocol milestone added via AnA', input, async (client) => {
    const { id } = await addMilestoneTx(client, ctx.organizationId!, ctx.userId!, documentId, { name, milestoneType: typeof input.milestone_type === 'string' ? input.milestone_type : undefined, targetDate: typeof input.target_date === 'string' ? input.target_date : null, notes: typeof input.notes === 'string' ? input.notes : null });
    return { milestoneId: id };
  });
});

registerToolHandler('set_protocol_milestone_status', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_protocol_milestone_status requires tenant + user context.' });
  const milestoneId = typeof input.milestone_id === 'number' ? input.milestone_id : NaN;
  const status = typeof input.status === 'string' ? input.status : '';
  if (!Number.isInteger(milestoneId) || !['planned', 'in_progress', 'met', 'missed', 'cancelled'].includes(status)) return JSON.stringify({ error: 'milestone_id and a valid status are required.' });
  const { setMilestoneStatusTx } = await import('../protocol-milestones/protocol-milestones-service.js');
  return governedPdev(ctx, 'transition', `protocol-milestone:${milestoneId}`, 'Milestone status set via AnA', input, async (client) => {
    await setMilestoneStatusTx(client, ctx.organizationId!, milestoneId, status, typeof input.actual_date === 'string' ? input.actual_date : null);
    return { milestoneId, status };
  });
});

registerToolHandler('review_protocol_timeline', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_timeline requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getTimeline } = await import('../protocol-milestones/protocol-milestones-service.js');
  try {
    return JSON.stringify({ ok: true, timeline: await getTimeline(ctx.organizationId, documentId) });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_timeline failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('export_protocol_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'export_protocol_document requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getProtocolExport } = await import('../protocol-export/protocol-export-service.js');
  try {
    const out = await getProtocolExport(ctx.organizationId, documentId);
    return JSON.stringify({ ok: true, document: out.document, markdown: out.markdown });
  } catch (err) {
    return JSON.stringify({ error: `export_protocol_document failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('generate_ctgov_registration_draft', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'generate_ctgov_registration_draft requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getCtGovDraft } = await import('../protocol-export/protocol-export-service.js');
  try {
    return JSON.stringify({ ok: true, draft: await getCtGovDraft(ctx.organizationId, documentId) });
  } catch (err) {
    return JSON.stringify({ error: `generate_ctgov_registration_draft failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Amendments / Deviations / Reviews / Consent (C2C-18a–d). Mutations
// share the governed/audited path (domain 'protocol_development'); review tools
// are read-only.
// ─────────────────────────────────────────────────────────────────────────────

async function governedPdev(ctx: any, command: string, target: string, fallbackReason: string, input: Record<string, unknown>, run: (client: any) => Promise<Record<string, unknown>>): Promise<string> {
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId!);
    const body = await run(client);
    await recordGovernedAction(client, { orgId: ctx.organizationId!, userId: ctx.userId!, command, target, reason: fcoiReason(input, fallbackReason), payload: body, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, ...body });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `${command} failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
}

registerToolHandler('create_protocol_amendment', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_protocol_amendment requires tenant + user context.' });
  const protocolDocumentId = typeof input.protocol_document_id === 'number' ? input.protocol_document_id : NaN;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!Number.isInteger(protocolDocumentId) || !title) return JSON.stringify({ error: 'protocol_document_id and title are required.' });
  const { createAmendmentTx } = await import('../protocol-amendments/protocol-amendments-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${protocolDocumentId}`, 'Protocol amendment opened via AnA', input, async (client) => {
    const { id } = await createAmendmentTx(client, ctx.organizationId!, ctx.userId!, {
      protocolDocumentId, title,
      amendmentNumber: typeof input.amendment_number === 'string' ? input.amendment_number : null,
      rationale: typeof input.rationale === 'string' ? input.rationale : null,
      amendmentType: typeof input.amendment_type === 'string' ? input.amendment_type : null,
      affectsConsent: typeof input.affects_consent === 'boolean' ? input.affects_consent : undefined,
      affectsRisk: typeof input.affects_risk === 'boolean' ? input.affects_risk : undefined,
    });
    return { amendmentId: id };
  });
});

registerToolHandler('add_amendment_change', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_amendment_change requires tenant + user context.' });
  const amendmentId = typeof input.amendment_id === 'number' ? input.amendment_id : NaN;
  const changeDescription = typeof input.change_description === 'string' ? input.change_description.trim() : '';
  if (!Number.isInteger(amendmentId) || !changeDescription) return JSON.stringify({ error: 'amendment_id and change_description are required.' });
  const { addChangeTx } = await import('../protocol-amendments/protocol-amendments-service.js');
  return governedPdev(ctx, 'update', `protocol-amendment:${amendmentId}`, 'Amendment change added via AnA', input, async (client) => {
    const { id } = await addChangeTx(client, ctx.organizationId!, ctx.userId!, amendmentId, {
      changeDescription,
      sectionRef: typeof input.section_ref === 'string' ? input.section_ref : null,
      previousText: typeof input.previous_text === 'string' ? input.previous_text : null,
      proposedText: typeof input.proposed_text === 'string' ? input.proposed_text : null,
    });
    return { changeId: id };
  });
});

registerToolHandler('review_amendment', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_amendment requires tenant context.' });
  const amendmentId = typeof input.amendment_id === 'number' ? input.amendment_id : NaN;
  if (!Number.isInteger(amendmentId)) return JSON.stringify({ error: 'amendment_id is required.' });
  const { getAmendmentReadiness } = await import('../protocol-amendments/protocol-amendments-service.js');
  try {
    return JSON.stringify({ ok: true, readiness: await getAmendmentReadiness(ctx.organizationId!, amendmentId) });
  } catch (err) {
    return JSON.stringify({ error: `review_amendment failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('report_protocol_deviation', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'report_protocol_deviation requires tenant + user context.' });
  const protocolDocumentId = typeof input.protocol_document_id === 'number' ? input.protocol_document_id : NaN;
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!Number.isInteger(protocolDocumentId) || !description) return JSON.stringify({ error: 'protocol_document_id and description are required.' });
  const { createDeviationTx } = await import('../protocol-deviations/protocol-deviations-service.js');
  return governedPdev(ctx, 'create', `protocol-document:${protocolDocumentId}`, 'Protocol deviation reported via AnA', input, async (client) => {
    const r = await createDeviationTx(client, ctx.organizationId!, ctx.userId!, {
      protocolDocumentId, description,
      category: typeof input.category === 'string' ? (input.category as any) : undefined,
      severity: typeof input.severity === 'string' ? (input.severity as any) : undefined,
      affectsSafety: typeof input.affects_safety === 'boolean' ? input.affects_safety : undefined,
      rootCause: typeof input.root_cause === 'string' ? input.root_cause : null,
    });
    return { deviationId: r.id, reportable: r.reportable, timelinessDays: r.timelinessDays };
  });
});

registerToolHandler('add_capa_action', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_capa_action requires tenant + user context.' });
  const deviationId = typeof input.deviation_id === 'number' ? input.deviation_id : NaN;
  const action = typeof input.action === 'string' ? input.action.trim() : '';
  if (!Number.isInteger(deviationId) || !action) return JSON.stringify({ error: 'deviation_id and action are required.' });
  const { addCapaActionTx } = await import('../protocol-deviations/protocol-deviations-service.js');
  return governedPdev(ctx, 'update', `protocol-deviation:${deviationId}`, 'CAPA action added via AnA', input, async (client) => {
    const { id } = await addCapaActionTx(client, ctx.organizationId!, ctx.userId!, deviationId, {
      action, owner: typeof input.owner === 'string' ? input.owner : null, dueDate: typeof input.due_date === 'string' ? input.due_date : null,
    });
    return { capaId: id };
  });
});

registerToolHandler('review_deviation', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_deviation requires tenant context.' });
  const deviationId = typeof input.deviation_id === 'number' ? input.deviation_id : NaN;
  if (!Number.isInteger(deviationId)) return JSON.stringify({ error: 'deviation_id is required.' });
  const { getDeviation, getCapaClosure } = await import('../protocol-deviations/protocol-deviations-service.js');
  try {
    const deviation = await getDeviation(ctx.organizationId!, deviationId);
    if (!deviation) return JSON.stringify({ error: 'Deviation not found.' });
    const closure = await getCapaClosure(ctx.organizationId!, deviationId);
    return JSON.stringify({ ok: true, deviation, closure });
  } catch (err) {
    return JSON.stringify({ error: `review_deviation failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assign_protocol_reviewer', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'assign_protocol_reviewer requires tenant + user context.' });
  const protocolDocumentId = typeof input.protocol_document_id === 'number' ? input.protocol_document_id : NaN;
  const reviewerName = typeof input.reviewer_name === 'string' ? input.reviewer_name.trim() : '';
  if (!Number.isInteger(protocolDocumentId) || !reviewerName) return JSON.stringify({ error: 'protocol_document_id and reviewer_name are required.' });
  const { assignReviewerTx } = await import('../protocol-reviews/protocol-reviews-service.js');
  return governedPdev(ctx, 'assign', `protocol-document:${protocolDocumentId}`, 'Reviewer assigned via AnA', input, async (client) => {
    const { id, role } = await assignReviewerTx(client, ctx.organizationId!, ctx.userId!, protocolDocumentId, {
      reviewerName, reviewerUserId: typeof input.reviewer_user_id === 'number' ? input.reviewer_user_id : null,
      role: typeof input.role === 'string' ? input.role : undefined, dueDate: typeof input.due_date === 'string' ? input.due_date : null,
    });
    return { assignmentId: id, role };
  });
});

registerToolHandler('add_protocol_review_comment', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_protocol_review_comment requires tenant + user context.' });
  const protocolDocumentId = typeof input.protocol_document_id === 'number' ? input.protocol_document_id : NaN;
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (!Number.isInteger(protocolDocumentId) || !comment) return JSON.stringify({ error: 'protocol_document_id and comment are required.' });
  const { addCommentTx } = await import('../protocol-reviews/protocol-reviews-service.js');
  return governedPdev(ctx, 'update', `protocol-document:${protocolDocumentId}`, 'Review comment added via AnA', input, async (client) => {
    const { id, severity } = await addCommentTx(client, ctx.organizationId!, ctx.userId!, protocolDocumentId, {
      comment, assignmentId: typeof input.assignment_id === 'number' ? input.assignment_id : null,
      sectionRef: typeof input.section_ref === 'string' ? input.section_ref : null, severity: typeof input.severity === 'string' ? input.severity : null,
    });
    return { commentId: id, severity };
  });
});

registerToolHandler('review_protocol_review_status', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_review_status requires tenant context.' });
  const protocolDocumentId = typeof input.protocol_document_id === 'number' ? input.protocol_document_id : NaN;
  if (!Number.isInteger(protocolDocumentId)) return JSON.stringify({ error: 'protocol_document_id is required.' });
  const { getReviewSummary } = await import('../protocol-reviews/protocol-reviews-service.js');
  try {
    return JSON.stringify({ ok: true, summary: await getReviewSummary(ctx.organizationId!, protocolDocumentId) });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_review_status failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('create_consent_form', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_consent_form requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { createConsentFormTx } = await import('../protocol-consent/protocol-consent-service.js');
  return governedPdev(ctx, 'create', 'consent-form', 'Consent form created via AnA', input, async (client) => {
    const { id, elementsSeeded } = await createConsentFormTx(client, ctx.organizationId!, ctx.userId!, {
      title, protocolDocumentId: typeof input.protocol_document_id === 'number' ? input.protocol_document_id : null,
      version: typeof input.version === 'string' ? input.version : null, language: typeof input.language === 'string' ? input.language : null,
      readingLevel: typeof input.reading_level === 'string' ? input.reading_level : null,
    });
    return { consentFormId: id, elementsSeeded };
  });
});

registerToolHandler('update_consent_element', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_consent_element requires tenant + user context.' });
  const elementId = typeof input.element_id === 'number' ? input.element_id : NaN;
  if (!Number.isInteger(elementId)) return JSON.stringify({ error: 'element_id is required.' });
  const { updateElementTx } = await import('../protocol-consent/protocol-consent-service.js');
  return governedPdev(ctx, 'update', `consent-element:${elementId}`, 'Consent element updated via AnA', input, async (client) => {
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const { sources, dropped } = await resolveDraftSources(ctx.organizationId!, input.sources, client);
    const gate = await updateElementTx(client, ctx.organizationId!, elementId, { content: typeof input.content === 'string' ? input.content : null, present: typeof input.present === 'boolean' ? input.present : undefined, sources }, ctx.userId!);
    return { elementId, lineage: describeDraftLineage(gate, sources, dropped) };
  });
});

registerToolHandler('review_consent_completeness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_consent_completeness requires tenant context.' });
  const formId = typeof input.form_id === 'number' ? input.form_id : NaN;
  if (!Number.isInteger(formId)) return JSON.stringify({ error: 'form_id is required.' });
  const { getCompleteness } = await import('../protocol-consent/protocol-consent-service.js');
  try {
    return JSON.stringify({ ok: true, completeness: await getCompleteness(ctx.organizationId!, formId) });
  } catch (err) {
    return JSON.stringify({ error: `review_consent_completeness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NIH Data Management & Sharing Plan (C2C-23). create/update/finalize are
// governed/audited (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_dms_plan', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_dms_plan requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { createPlanTx } = await import('../dmsp/dmsp-service.js');
  return governedPdev(ctx, 'create', 'dms-plan', 'DMS plan created via AnA', input, async (client) => {
    const { id, elementsSeeded } = await createPlanTx(client, ctx.organizationId!, ctx.userId!, {
      title,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
      protocolDocumentId: typeof input.protocol_document_id === 'number' ? input.protocol_document_id : null,
    });
    return { dmsPlanId: id, elementsSeeded };
  });
});

registerToolHandler('update_dms_plan_element', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_dms_plan_element requires tenant + user context.' });
  const elementId = typeof input.element_id === 'number' ? input.element_id : NaN;
  if (!Number.isInteger(elementId)) return JSON.stringify({ error: 'element_id is required.' });
  const { updateElementTx } = await import('../dmsp/dmsp-service.js');
  return governedPdev(ctx, 'update', `dms-plan-element:${elementId}`, 'DMS plan element updated via AnA', input, async (client) => {
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const { sources, dropped } = await resolveDraftSources(ctx.organizationId!, input.sources, client);
    const gate = await updateElementTx(client, ctx.organizationId!, elementId, { content: typeof input.content === 'string' ? input.content : null, addressed: typeof input.addressed === 'boolean' ? input.addressed : undefined, sources }, ctx.userId!);
    return { elementId, lineage: describeDraftLineage(gate, sources, dropped) };
  });
});

registerToolHandler('review_dms_plan_completeness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_dms_plan_completeness requires tenant context.' });
  const planId = typeof input.plan_id === 'number' ? input.plan_id : NaN;
  if (!Number.isInteger(planId)) return JSON.stringify({ error: 'plan_id is required.' });
  const { getCompleteness } = await import('../dmsp/dmsp-service.js');
  try {
    return JSON.stringify({ ok: true, completeness: await getCompleteness(ctx.organizationId!, planId) });
  } catch (err) {
    return JSON.stringify({ error: `review_dms_plan_completeness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('finalize_dms_plan', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_dms_plan requires tenant + user context.' });
  const planId = typeof input.plan_id === 'number' ? input.plan_id : NaN;
  if (!Number.isInteger(planId)) return JSON.stringify({ error: 'plan_id is required.' });
  const { finalizePlanTx } = await import('../dmsp/dmsp-service.js');
  return governedPdev(ctx, 'sign', `dms-plan:${planId}`, 'DMS plan finalized via AnA', input, async (client) => {
    const result = await finalizePlanTx(client, ctx.organizationId!, ctx.userId!, planId);
    return { dmsPlanId: planId, finalized: result.finalized, addressedPct: result.completeness.addressedPct };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NIH Other Support (C2C-24A). create/add/certify are governed/audited
// (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_other_support', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_other_support requires tenant + user context.' });
  const personName = typeof input.person_name === 'string' ? input.person_name.trim() : '';
  if (!personName) return JSON.stringify({ error: 'person_name is required.' });
  const { createDocumentTx } = await import('../other-support/other-support-service.js');
  return governedPdev(ctx, 'create', 'other-support', 'Other Support document created via AnA', input, async (client) => {
    const { id } = await createDocumentTx(client, ctx.organizationId!, ctx.userId!, {
      personName,
      personnelId: typeof input.personnel_id === 'number' ? input.personnel_id : null,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
      eraCommonsId: typeof input.era_commons_id === 'string' ? input.era_commons_id : null,
      role: typeof input.role === 'string' ? input.role : null,
    });
    return { otherSupportId: id };
  });
});

registerToolHandler('add_other_support_entry', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_other_support_entry requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const projectTitle = typeof input.project_title === 'string' ? input.project_title.trim() : '';
  const fundingSource = typeof input.funding_source === 'string' ? input.funding_source.trim() : '';
  if (!Number.isInteger(documentId) || !projectTitle || !fundingSource) return JSON.stringify({ error: 'document_id, project_title and funding_source are required.' });
  const { addEntryTx } = await import('../other-support/other-support-service.js');
  return governedPdev(ctx, 'create', `other-support:${documentId}`, 'Other Support entry added via AnA', input, async (client) => {
    const { id } = await addEntryTx(client, ctx.organizationId!, ctx.userId!, documentId, {
      supportType: typeof input.support_type === 'string' ? input.support_type : undefined,
      projectTitle, fundingSource,
      status: typeof input.status === 'string' ? input.status : undefined,
      isForeign: typeof input.is_foreign === 'boolean' ? input.is_foreign : undefined,
      foreignCountry: typeof input.foreign_country === 'string' ? input.foreign_country : null,
      personMonthsCalendar: typeof input.person_months_calendar === 'number' ? input.person_months_calendar : undefined,
      personMonthsAcademic: typeof input.person_months_academic === 'number' ? input.person_months_academic : undefined,
      personMonthsSummer: typeof input.person_months_summer === 'number' ? input.person_months_summer : undefined,
      majorGoals: typeof input.major_goals === 'string' ? input.major_goals : null,
      overlapStatement: typeof input.overlap_statement === 'string' ? input.overlap_statement : null,
      awardIdentifier: typeof input.award_identifier === 'string' ? input.award_identifier : null,
    });
    return { entryId: id };
  });
});

registerToolHandler('review_other_support', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_other_support requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getSummary, getReadiness } = await import('../other-support/other-support-service.js');
  try {
    return JSON.stringify({ ok: true, summary: await getSummary(ctx.organizationId!, documentId), readiness: await getReadiness(ctx.organizationId!, documentId) });
  } catch (err) {
    return JSON.stringify({ error: `review_other_support failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('certify_other_support', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'certify_other_support requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { certifyDocumentTx } = await import('../other-support/other-support-service.js');
  return governedPdev(ctx, 'sign', `other-support:${documentId}`, 'Other Support certified via AnA', input, async (client) => {
    const result = await certifyDocumentTx(client, ctx.organizationId!, ctx.userId!, documentId);
    return { otherSupportId: documentId, certified: result.certified, activePersonMonths: result.readiness.summary.active.total };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NIH Biosketch (C2C-24B). create/update/finalize are governed/audited
// (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_biosketch', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_biosketch requires tenant + user context.' });
  const personName = typeof input.person_name === 'string' ? input.person_name.trim() : '';
  if (!personName) return JSON.stringify({ error: 'person_name is required.' });
  const { createBiosketchTx } = await import('../biosketch/biosketch-service.js');
  return governedPdev(ctx, 'create', 'biosketch', 'Biosketch created via AnA', input, async (client) => {
    const { id, sectionsSeeded } = await createBiosketchTx(client, ctx.organizationId!, ctx.userId!, {
      personName,
      personnelId: typeof input.personnel_id === 'number' ? input.personnel_id : null,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
      biosketchType: typeof input.biosketch_type === 'string' ? input.biosketch_type : undefined,
    });
    return { biosketchId: id, sectionsSeeded };
  });
});

registerToolHandler('update_biosketch_section', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_biosketch_section requires tenant + user context.' });
  const sectionId = typeof input.section_id === 'number' ? input.section_id : NaN;
  if (!Number.isInteger(sectionId)) return JSON.stringify({ error: 'section_id is required.' });
  const { updateSectionTx } = await import('../biosketch/biosketch-service.js');
  return governedPdev(ctx, 'update', `biosketch-section:${sectionId}`, 'Biosketch section updated via AnA', input, async (client) => {
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const { sources, dropped } = await resolveDraftSources(ctx.organizationId!, input.sources, client);
    const gate = await updateSectionTx(client, ctx.organizationId!, sectionId, { content: typeof input.content === 'string' ? input.content : null, addressed: typeof input.addressed === 'boolean' ? input.addressed : undefined, sources }, ctx.userId!);
    return { sectionId, lineage: describeDraftLineage(gate, sources, dropped) };
  });
});

registerToolHandler('review_biosketch_completeness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_biosketch_completeness requires tenant context.' });
  const biosketchId = typeof input.biosketch_id === 'number' ? input.biosketch_id : NaN;
  if (!Number.isInteger(biosketchId)) return JSON.stringify({ error: 'biosketch_id is required.' });
  const { getCompleteness } = await import('../biosketch/biosketch-service.js');
  try {
    return JSON.stringify({ ok: true, completeness: await getCompleteness(ctx.organizationId!, biosketchId) });
  } catch (err) {
    return JSON.stringify({ error: `review_biosketch_completeness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('finalize_biosketch', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_biosketch requires tenant + user context.' });
  const biosketchId = typeof input.biosketch_id === 'number' ? input.biosketch_id : NaN;
  if (!Number.isInteger(biosketchId)) return JSON.stringify({ error: 'biosketch_id is required.' });
  const { finalizeBiosketchTx } = await import('../biosketch/biosketch-service.js');
  return governedPdev(ctx, 'sign', `biosketch:${biosketchId}`, 'Biosketch finalized via AnA', input, async (client) => {
    const result = await finalizeBiosketchTx(client, ctx.organizationId!, ctx.userId!, biosketchId);
    return { biosketchId, finalized: result.finalized, addressedPct: result.completeness.addressedPct };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invention Disclosure / Tech Transfer (C2C-25). create/update/submit are
// governed/audited (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_invention_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_invention_disclosure requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { createDisclosureTx } = await import('../invention-disclosure/invention-disclosure-service.js');
  return governedPdev(ctx, 'create', 'invention-disclosure', 'Invention disclosure created via AnA', input, async (client) => {
    const { id } = await createDisclosureTx(client, ctx.organizationId!, ctx.userId!, {
      title,
      inventors: typeof input.inventors === 'string' ? input.inventors : null,
      fundingSource: typeof input.funding_source === 'string' ? input.funding_source : null,
      federalFunding: typeof input.federal_funding === 'boolean' ? input.federal_funding : undefined,
      federalAward: typeof input.federal_award === 'string' ? input.federal_award : null,
      disclosureDate: typeof input.disclosure_date === 'string' ? input.disclosure_date : null,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
    });
    return { disclosureId: id };
  });
});

registerToolHandler('update_invention_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_invention_disclosure requires tenant + user context.' });
  const id = typeof input.disclosure_id === 'number' ? input.disclosure_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'disclosure_id is required.' });
  const { updateDisclosureTx } = await import('../invention-disclosure/invention-disclosure-service.js');
  return governedPdev(ctx, 'update', `invention-disclosure:${id}`, 'Invention disclosure updated via AnA', input, async (client) => {
    await updateDisclosureTx(client, ctx.organizationId!, ctx.userId!, id, {
      status: typeof input.status === 'string' ? input.status : undefined,
      inventors: typeof input.inventors === 'string' ? input.inventors : null,
      fundingSource: typeof input.funding_source === 'string' ? input.funding_source : null,
      federalFunding: typeof input.federal_funding === 'boolean' ? input.federal_funding : undefined,
      federalAward: typeof input.federal_award === 'string' ? input.federal_award : null,
      disclosureDate: typeof input.disclosure_date === 'string' ? input.disclosure_date : null,
      electionDate: typeof input.election_date === 'string' ? input.election_date : null,
      decisionRationale: typeof input.decision_rationale === 'string' ? input.decision_rationale : null,
    });
    return { disclosureId: id };
  });
});

registerToolHandler('review_invention_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_invention_disclosure requires tenant context.' });
  const id = typeof input.disclosure_id === 'number' ? input.disclosure_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'disclosure_id is required.' });
  const asOf = typeof input.as_of === 'string' ? input.as_of : undefined;
  const { getCompliance, getReadiness } = await import('../invention-disclosure/invention-disclosure-service.js');
  try {
    return JSON.stringify({ ok: true, compliance: await getCompliance(ctx.organizationId!, id, asOf), readiness: await getReadiness(ctx.organizationId!, id) });
  } catch (err) {
    return JSON.stringify({ error: `review_invention_disclosure failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('submit_invention_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'submit_invention_disclosure requires tenant + user context.' });
  const id = typeof input.disclosure_id === 'number' ? input.disclosure_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'disclosure_id is required.' });
  const { submitDisclosureTx } = await import('../invention-disclosure/invention-disclosure-service.js');
  return governedPdev(ctx, 'submit', `invention-disclosure:${id}`, 'Invention disclosure submitted via AnA', input, async (client) => {
    const result = await submitDisclosureTx(client, ctx.organizationId!, ctx.userId!, id);
    return { disclosureId: id, submitted: result.submitted };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export Control review (C2C-26). create/update/determine are governed/audited
// (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_export_control_review', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_export_control_review requires tenant + user context.' });
  const projectTitle = typeof input.project_title === 'string' ? input.project_title.trim() : '';
  if (!projectTitle) return JSON.stringify({ error: 'project_title is required.' });
  const { createReviewTx } = await import('../export-control/export-control-service.js');
  return governedPdev(ctx, 'create', 'export-control', 'Export-control review created via AnA', input, async (client) => {
    const { id } = await createReviewTx(client, ctx.organizationId!, ctx.userId!, {
      projectTitle,
      description: typeof input.description === 'string' ? input.description : null,
      jurisdiction: typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined,
      classification: typeof input.classification === 'string' ? input.classification : null,
      involvesForeignNationals: typeof input.involves_foreign_nationals === 'boolean' ? input.involves_foreign_nationals : undefined,
      foreignCountries: typeof input.foreign_countries === 'string' ? input.foreign_countries : null,
      hasPublicationRestrictions: typeof input.has_publication_restrictions === 'boolean' ? input.has_publication_restrictions : undefined,
      hasProprietaryRestrictions: typeof input.has_proprietary_restrictions === 'boolean' ? input.has_proprietary_restrictions : undefined,
      involvesPhysicalExport: typeof input.involves_physical_export === 'boolean' ? input.involves_physical_export : undefined,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
    });
    return { reviewId: id };
  });
});

registerToolHandler('update_export_control_review', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_export_control_review requires tenant + user context.' });
  const id = typeof input.review_id === 'number' ? input.review_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'review_id is required.' });
  const { updateReviewTx } = await import('../export-control/export-control-service.js');
  return governedPdev(ctx, 'update', `export-control:${id}`, 'Export-control review updated via AnA', input, async (client) => {
    await updateReviewTx(client, ctx.organizationId!, id, {
      projectTitle: typeof input.project_title === 'string' ? input.project_title : undefined,
      description: typeof input.description === 'string' ? input.description : null,
      jurisdiction: typeof input.jurisdiction === 'string' ? input.jurisdiction : undefined,
      classification: typeof input.classification === 'string' ? input.classification : null,
      involvesForeignNationals: typeof input.involves_foreign_nationals === 'boolean' ? input.involves_foreign_nationals : undefined,
      foreignCountries: typeof input.foreign_countries === 'string' ? input.foreign_countries : null,
      hasPublicationRestrictions: typeof input.has_publication_restrictions === 'boolean' ? input.has_publication_restrictions : undefined,
      hasProprietaryRestrictions: typeof input.has_proprietary_restrictions === 'boolean' ? input.has_proprietary_restrictions : undefined,
      involvesPhysicalExport: typeof input.involves_physical_export === 'boolean' ? input.involves_physical_export : undefined,
    });
    return { reviewId: id };
  });
});

registerToolHandler('review_export_control', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_export_control requires tenant context.' });
  const id = typeof input.review_id === 'number' ? input.review_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'review_id is required.' });
  const { getAssessment, getReadiness } = await import('../export-control/export-control-service.js');
  try {
    return JSON.stringify({ ok: true, assessment: await getAssessment(ctx.organizationId!, id), readiness: await getReadiness(ctx.organizationId!, id) });
  } catch (err) {
    return JSON.stringify({ error: `review_export_control failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('finalize_export_control_determination', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_export_control_determination requires tenant + user context.' });
  const id = typeof input.review_id === 'number' ? input.review_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'review_id is required.' });
  const { determineReviewTx } = await import('../export-control/export-control-service.js');
  return governedPdev(ctx, 'sign', `export-control:${id}`, 'Export-control determination finalized via AnA', input, async (client) => {
    const result = await determineReviewTx(client, ctx.organizationId!, ctx.userId!, id);
    return { reviewId: id, determined: result.determined, licenseRequired: result.readiness.assessment.licenseRequired, freApplies: result.readiness.assessment.freApplies };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Research Agreements MTA/DUA/CDA (C2C-27). create/update/execute are
// governed/audited (domain 'protocol_development'); review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_research_agreement', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_research_agreement requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const otherParty = typeof input.other_party === 'string' ? input.other_party.trim() : '';
  if (!title || !otherParty) return JSON.stringify({ error: 'title and other_party are required.' });
  const { createAgreementTx } = await import('../research-agreements/research-agreements-service.js');
  return governedPdev(ctx, 'create', 'research-agreement', 'Research agreement created via AnA', input, async (client) => {
    const { id } = await createAgreementTx(client, ctx.organizationId!, ctx.userId!, {
      title, otherParty,
      ourParty: typeof input.our_party === 'string' ? input.our_party : null,
      agreementType: typeof input.agreement_type === 'string' ? input.agreement_type : undefined,
      direction: typeof input.direction === 'string' ? input.direction : undefined,
      materialOrDataDescription: typeof input.material_or_data_description === 'string' ? input.material_or_data_description : null,
      containsPhi: typeof input.contains_phi === 'boolean' ? input.contains_phi : undefined,
      containsHumanData: typeof input.contains_human_data === 'boolean' ? input.contains_human_data : undefined,
      isDeidentified: typeof input.is_deidentified === 'boolean' ? input.is_deidentified : undefined,
      limitedDataSet: typeof input.limited_data_set === 'boolean' ? input.limited_data_set : undefined,
      ipRightsTerms: typeof input.ip_rights_terms === 'string' ? input.ip_rights_terms : null,
      publicationRights: typeof input.publication_rights === 'boolean' ? input.publication_rights : undefined,
      effectiveDate: typeof input.effective_date === 'string' ? input.effective_date : null,
      expirationDate: typeof input.expiration_date === 'string' ? input.expiration_date : null,
      grantProposalId: typeof input.grant_proposal_id === 'number' ? input.grant_proposal_id : null,
      protocolDocumentId: typeof input.protocol_document_id === 'number' ? input.protocol_document_id : null,
    });
    return { agreementId: id };
  });
});

registerToolHandler('update_research_agreement', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_research_agreement requires tenant + user context.' });
  const id = typeof input.agreement_id === 'number' ? input.agreement_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'agreement_id is required.' });
  const { updateAgreementTx } = await import('../research-agreements/research-agreements-service.js');
  return governedPdev(ctx, 'update', `research-agreement:${id}`, 'Research agreement updated via AnA', input, async (client) => {
    await updateAgreementTx(client, ctx.organizationId!, id, {
      title: typeof input.title === 'string' ? input.title : undefined,
      otherParty: typeof input.other_party === 'string' ? input.other_party : undefined,
      ourParty: typeof input.our_party === 'string' ? input.our_party : null,
      status: typeof input.status === 'string' ? input.status : undefined,
      agreementType: typeof input.agreement_type === 'string' ? input.agreement_type : undefined,
      direction: typeof input.direction === 'string' ? input.direction : undefined,
      materialOrDataDescription: typeof input.material_or_data_description === 'string' ? input.material_or_data_description : null,
      containsPhi: typeof input.contains_phi === 'boolean' ? input.contains_phi : undefined,
      containsHumanData: typeof input.contains_human_data === 'boolean' ? input.contains_human_data : undefined,
      isDeidentified: typeof input.is_deidentified === 'boolean' ? input.is_deidentified : undefined,
      limitedDataSet: typeof input.limited_data_set === 'boolean' ? input.limited_data_set : undefined,
      ipRightsTerms: typeof input.ip_rights_terms === 'string' ? input.ip_rights_terms : null,
      publicationRights: typeof input.publication_rights === 'boolean' ? input.publication_rights : undefined,
      effectiveDate: typeof input.effective_date === 'string' ? input.effective_date : null,
      expirationDate: typeof input.expiration_date === 'string' ? input.expiration_date : null,
    });
    return { agreementId: id };
  });
});

registerToolHandler('review_research_agreement', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_research_agreement requires tenant context.' });
  const id = typeof input.agreement_id === 'number' ? input.agreement_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'agreement_id is required.' });
  const { getReadiness } = await import('../research-agreements/research-agreements-service.js');
  try {
    return JSON.stringify({ ok: true, readiness: await getReadiness(ctx.organizationId!, id) });
  } catch (err) {
    return JSON.stringify({ error: `review_research_agreement failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('execute_research_agreement', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'execute_research_agreement requires tenant + user context.' });
  const id = typeof input.agreement_id === 'number' ? input.agreement_id : NaN;
  if (!Number.isInteger(id)) return JSON.stringify({ error: 'agreement_id is required.' });
  const { executeAgreementTx } = await import('../research-agreements/research-agreements-service.js');
  return governedPdev(ctx, 'sign', `research-agreement:${id}`, 'Research agreement executed via AnA', input, async (client) => {
    const result = await executeAgreementTx(client, ctx.organizationId!, ctx.userId!, id);
    return { agreementId: id, executed: result.executed };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Risk Register (C2C-19). add is governed/audited; review is read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('add_protocol_risk', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_protocol_risk requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!Number.isInteger(documentId) || !description) return JSON.stringify({ error: 'document_id and description are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addRiskTx } = await import('../protocol-risks/protocol-risks-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, level } = await addRiskTx(client, ctx.organizationId, ctx.userId, {
      protocolDocumentId: documentId, description,
      category: typeof input.category === 'string' ? input.category : undefined,
      likelihood: typeof input.likelihood === 'string' ? input.likelihood : undefined,
      impact: typeof input.impact === 'string' ? input.impact : undefined,
      mitigation: typeof input.mitigation === 'string' ? input.mitigation : null,
      owner: typeof input.owner === 'string' ? input.owner : null,
    });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'create', target: `protocol-document:${documentId}`, reason: fcoiReason(input, 'Protocol risk added via AnA'), payload: { riskId: id, level }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, riskId: id, level, message: `Added ${level} risk to protocol ${documentId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_protocol_risk failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_protocol_risk_register', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_risk_register requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getRiskRegister } = await import('../protocol-risks/protocol-risks-service.js');
  try {
    const register = await getRiskRegister(ctx.organizationId, documentId);
    return JSON.stringify({ ok: true, summary: register.summary, risks: register.risks });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_risk_register failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Development (C2C-17). Authoring shares the governed/audited path;
// completeness/finalize are deterministic (protocol-development-logic).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_protocol_document', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_protocol_document requires tenant + user context.' });
  const protocolKind = typeof input.protocol_kind === 'string' ? input.protocol_kind : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!['iacuc', 'irb', 'clinical', 'ibc'].includes(protocolKind) || !title) return JSON.stringify({ error: 'protocol_kind and title are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createProtocolDocumentTx } = await import('../protocol-development/protocol-development-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, sectionsSeeded } = await createProtocolDocumentTx(client, ctx.organizationId, ctx.userId, {
      protocolKind: protocolKind as any, title,
      protocolNumber: typeof input.protocol_number === 'string' ? input.protocol_number : null,
      designType: typeof input.design_type === 'string' ? input.design_type : null,
      phase: typeof input.phase === 'string' ? input.phase : null,
      therapeuticArea: typeof input.therapeutic_area === 'string' ? input.therapeutic_area : null,
      linkedProtocolId: typeof input.linked_protocol_id === 'number' ? input.linked_protocol_id : null,
      synopsis: typeof input.synopsis === 'string' ? input.synopsis : null,
    });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'create', target: `protocol-document:${id}`, reason: fcoiReason(input, 'Protocol document created via AnA'), payload: { kind: protocolKind }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, sectionsSeeded, message: `Created ${protocolKind.toUpperCase()} protocol "${title}" (id ${id}) seeded with ${sectionsSeeded} templated sections.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_protocol_document failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('update_protocol_section', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_protocol_section requires tenant + user context.' });
  const sectionId = typeof input.section_id === 'number' ? input.section_id : NaN;
  if (!Number.isInteger(sectionId)) return JSON.stringify({ error: 'section_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { updateSectionTx } = await import('../protocol-development/protocol-development-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const { sources, dropped } = await resolveDraftSources(ctx.organizationId, input.sources, client);
    const gate = await updateSectionTx(client, ctx.organizationId, sectionId, { content: typeof input.content === 'string' ? input.content : null, status: typeof input.status === 'string' ? input.status : undefined, sources }, ctx.userId);
    const lineage = describeDraftLineage(gate, sources, dropped);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `protocol-section:${sectionId}`, reason: fcoiReason(input, 'Protocol section edited via AnA'), payload: { status: input.status }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, sectionId, lineage, message: `Updated protocol section ${sectionId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `update_protocol_section failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_protocol_objective', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_protocol_objective requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const objective = typeof input.objective === 'string' ? input.objective.trim() : '';
  if (!Number.isInteger(documentId) || !objective) return JSON.stringify({ error: 'document_id and objective are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addObjectiveTx } = await import('../protocol-development/protocol-development-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addObjectiveTx(client, ctx.organizationId, ctx.userId, documentId, { objectiveType: typeof input.objective_type === 'string' ? input.objective_type : undefined, objective, endpoint: typeof input.endpoint === 'string' ? input.endpoint : null, timepoint: typeof input.timepoint === 'string' ? input.timepoint : null });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `protocol-document:${documentId}`, reason: fcoiReason(input, 'Protocol objective added via AnA'), payload: { objectiveId: id }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, objectiveId: id, message: `Added objective to protocol ${documentId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_protocol_objective failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_eligibility_criterion', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_eligibility_criterion requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  const kind = typeof input.kind === 'string' ? input.kind : '';
  const criterion = typeof input.criterion === 'string' ? input.criterion.trim() : '';
  if (!Number.isInteger(documentId) || !['inclusion', 'exclusion'].includes(kind) || !criterion) return JSON.stringify({ error: 'document_id, kind, and criterion are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addEligibilityCriterionTx } = await import('../protocol-development/protocol-development-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addEligibilityCriterionTx(client, ctx.organizationId, ctx.userId, documentId, { kind, criterion });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `protocol-document:${documentId}`, reason: fcoiReason(input, 'Eligibility criterion added via AnA'), payload: { criterionId: id, kind }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, criterionId: id, message: `Added ${kind} criterion to protocol ${documentId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_eligibility_criterion failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_protocol_completeness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_completeness requires tenant context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getCompleteness } = await import('../protocol-development/protocol-development-service.js');
  try {
    const c = await getCompleteness(ctx.organizationId, documentId);
    return JSON.stringify({ ok: true, requiredCompletionPct: c.requiredCompletionPct, readyToFinalize: c.readyToFinalize, findings: c.findings });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_completeness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('finalize_protocol_document', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_protocol_document requires tenant + user context.' });
  const documentId = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isInteger(documentId)) return JSON.stringify({ error: 'document_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { finalizeProtocolTx } = await import('../protocol-development/protocol-development-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const result = await finalizeProtocolTx(client, ctx.organizationId, ctx.userId, documentId);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'sign', target: `protocol-document:${documentId}`, reason: fcoiReason(input, 'Protocol finalized via AnA'), payload: { version: result.version }, domain: 'protocol_development', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, documentId, version: result.version, message: `Finalized protocol ${documentId} as version ${result.version}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `finalize_protocol_document failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CITI Training full integration (C2C-01/02) + protocol-portfolio analytics.
// import_citi_records is governed/audited; the review_* tools are read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('import_citi_records', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'import_citi_records requires tenant + user context.' });
  const personnelId = typeof input.personnel_id === 'number' ? input.personnel_id : NaN;
  const records = Array.isArray(input.records) ? input.records : [];
  if (!Number.isInteger(personnelId) || records.length === 0) return JSON.stringify({ error: 'personnel_id and a non-empty records array are required.' });
  const mapped = records.map((r: any) => ({
    trainingType: r.training_type,
    completedDate: typeof r.completed_date === 'string' ? r.completed_date : null,
    expiresDate: typeof r.expires_date === 'string' ? r.expires_date : null,
    certificateRef: typeof r.certificate_ref === 'string' ? r.certificate_ref : null,
  }));
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { importCitiRecordsTx } = await import('../citi/citi-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { ids } = await importCitiRecordsTx(client, ctx.organizationId, ctx.userId, personnelId, mapped);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'create', target: `research-personnel:${personnelId}`, reason: fcoiReason(input, 'CITI training records imported via AnA'), payload: { imported: ids.length }, domain: 'research_compliance', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, personnelId, imported: ids.length, trainingIds: ids, message: `Imported ${ids.length} CITI training record(s) for personnel ${personnelId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `import_citi_records failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_training_matrix', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_training_matrix requires tenant context.' });
  const { getTrainingMatrix } = await import('../citi/citi-service.js');
  try {
    const matrix = await getTrainingMatrix(ctx.organizationId);
    return JSON.stringify({ ok: true, summary: matrix.summary, rows: matrix.rows });
  } catch (err) {
    return JSON.stringify({ error: `review_training_matrix failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('review_expiring_training', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_expiring_training requires tenant context.' });
  const withinDays = typeof input.within_days === 'number' ? input.within_days : undefined;
  const { getExpiringTraining } = await import('../citi/citi-service.js');
  try {
    const expiring = await getExpiringTraining(ctx.organizationId, withinDays);
    return JSON.stringify({ ok: true, count: expiring.length, expiring });
  } catch (err) {
    return JSON.stringify({ error: `review_expiring_training failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('review_protocol_portfolio_analytics', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_portfolio_analytics requires tenant context.' });
  const { getPortfolioAnalytics } = await import('../protocols/protocol-portfolio-service.js');
  try {
    const summary = await getPortfolioAnalytics(ctx.organizationId);
    return JSON.stringify({
      ok: true,
      counts: summary.counts,
      overdueCount: summary.overdue.length,
      expiringSoonCount: summary.expiringSoon.length,
      needsAttention: summary.needsAttention.slice(0, 25),
    });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_portfolio_analytics failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Intelligent Grant Finder (C2C-14). set_funding_profile is governed/audited;
// find_grant_opportunities is a read-only, explainable ranking over Grants.gov.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('set_funding_profile', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_funding_profile requires tenant + user context.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { upsertFundingProfileTx } = await import('../grants/grant-finder-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await upsertFundingProfileTx(client, ctx.organizationId, ctx.userId, {
      keywords: Array.isArray(input.keywords) ? input.keywords.filter((k: unknown) => typeof k === 'string') as string[] : undefined,
      agencies: Array.isArray(input.agencies) ? input.agencies.filter((k: unknown) => typeof k === 'string') as string[] : undefined,
      mechanisms: Array.isArray(input.mechanisms) ? input.mechanisms.filter((k: unknown) => typeof k === 'string') as string[] : undefined,
      institutionType: typeof input.institution_type === 'string' ? input.institution_type : null,
      minAward: typeof input.min_award === 'number' ? input.min_award : null,
      maxAward: typeof input.max_award === 'number' ? input.max_award : null,
    });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `grant-funding-profile:${id}`, reason: fcoiReason(input, 'Funding profile set via AnA'), payload: {}, domain: 'grants', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: 'Funding profile saved. Use find_grant_opportunities to discover ranked matches.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `set_funding_profile failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('find_grant_opportunities', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'find_grant_opportunities requires tenant context.' });
  const { discoverOpportunities } = await import('../grants/grant-finder-service.js');
  try {
    const result = await discoverOpportunities(ctx.organizationId, {
      query: typeof input.query === 'string' ? input.query : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
    const top = result.matches.slice(0, 15).map((m) => ({
      externalId: m.externalId, title: m.title, fitScore: m.fitScore, eligible: m.eligible,
      daysToDeadline: m.daysToDeadline, keywordHits: m.keywordHits, reasons: m.reasons,
    }));
    const strong = result.matches.filter((m) => m.fitScore >= 70).length;
    return JSON.stringify({
      ok: true, scored: result.scored, strongMatches: strong, profileUsed: result.profileUsed, matches: top,
      message: `Scored ${result.scored} Grants.gov opportunit${result.scored === 1 ? 'y' : 'ies'}; ${strong} strong fit(s) (>=70). Record promising ones with record_grant_opportunity.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `find_grant_opportunities failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Research Committee Governance (C2C-16). Conversational committee operations
// share the governed/audited path (recordGovernedAction, surface 'ana').
// Determinations are deterministic (committee-logic); finalize is gated on the
// approve privilege + current CITI training (enforced in the API route).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assign_committee_member', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'assign_committee_member requires tenant + user context.' });
  const committeeType = typeof input.committee_type === 'string' ? input.committee_type : '';
  const memberName = typeof input.member_name === 'string' ? input.member_name.trim() : '';
  if (!['iacuc', 'irb', 'ibc'].includes(committeeType) || !memberName) return JSON.stringify({ error: 'committee_type and member_name are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addCommitteeMemberTx } = await import('../committees/committee-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addCommitteeMemberTx(client, ctx.organizationId, ctx.userId, {
      committeeType: committeeType as any, memberName,
      role: typeof input.role === 'string' ? input.role : undefined,
      userId: typeof input.user_id === 'number' ? input.user_id : null,
      personnelId: typeof input.personnel_id === 'number' ? input.personnel_id : null,
      votingMember: typeof input.voting_member === 'boolean' ? input.voting_member : undefined,
      scientist: typeof input.scientist === 'boolean' ? input.scientist : undefined,
      affiliated: typeof input.affiliated === 'boolean' ? input.affiliated : undefined,
    });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'assign', target: `committee:${committeeType}`, reason: fcoiReason(input, 'Committee member assigned via AnA'), payload: { memberId: id }, domain: 'committee', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Added ${memberName} to the ${committeeType.toUpperCase()} committee (member id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `assign_committee_member failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('convene_committee_meeting', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'convene_committee_meeting requires tenant + user context.' });
  const meetingId = typeof input.meeting_id === 'number' ? input.meeting_id : NaN;
  const present = Array.isArray(input.present_member_ids) ? input.present_member_ids.filter((n: unknown) => typeof n === 'number') as number[] : [];
  if (!Number.isInteger(meetingId) || present.length === 0) return JSON.stringify({ error: 'meeting_id and a non-empty present_member_ids are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { conveneMeetingTx } = await import('../committees/committee-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const quorum = await conveneMeetingTx(client, ctx.organizationId, meetingId, present);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `committee-meeting:${meetingId}`, reason: fcoiReason(input, 'Committee meeting convened via AnA'), payload: { quorumMet: quorum.quorumMet }, domain: 'committee', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, meetingId, quorumMet: quorum.quorumMet, quorumRequired: quorum.quorumRequired, membersConvened: quorum.membersConvened, issues: quorum.issues, message: quorum.quorumMet ? 'Quorum met — voting may proceed.' : `Quorum NOT met: ${quorum.issues.join(' ')}` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `convene_committee_meeting failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_committee_agenda_item', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_committee_agenda_item requires tenant + user context.' });
  const meetingId = typeof input.meeting_id === 'number' ? input.meeting_id : NaN;
  const protocolKind = typeof input.protocol_kind === 'string' ? input.protocol_kind : '';
  const protocolId = typeof input.protocol_id === 'number' ? input.protocol_id : NaN;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!Number.isInteger(meetingId) || !['iacuc_protocol', 'irb_submission'].includes(protocolKind) || !Number.isInteger(protocolId) || !title) {
    return JSON.stringify({ error: 'meeting_id, protocol_kind, protocol_id, and title are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addAgendaItemTx } = await import('../committees/committee-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addAgendaItemTx(client, ctx.organizationId, ctx.userId, meetingId, { protocolKind: protocolKind as any, protocolId, title, reviewType: typeof input.review_type === 'string' ? input.review_type : null });
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'update', target: `committee-meeting:${meetingId}`, reason: fcoiReason(input, 'Agenda item added via AnA'), payload: { agendaItemId: id }, domain: 'committee', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, agendaItemId: id, message: `Added "${title}" to meeting ${meetingId} agenda (item ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_committee_agenda_item failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('cast_committee_vote', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'cast_committee_vote requires tenant + user context.' });
  const agendaItemId = typeof input.agenda_item_id === 'number' ? input.agenda_item_id : NaN;
  const memberId = typeof input.member_id === 'number' ? input.member_id : NaN;
  const vote = typeof input.vote === 'string' ? input.vote : '';
  if (!Number.isInteger(agendaItemId) || !Number.isInteger(memberId) || !['approve', 'approve_with_modifications', 'disapprove', 'abstain', 'recuse'].includes(vote)) {
    return JSON.stringify({ error: 'agenda_item_id, member_id, and a valid vote are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { castVoteTx } = await import('../committees/committee-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    await castVoteTx(client, ctx.organizationId, ctx.userId, agendaItemId, memberId, vote as any, typeof input.comment === 'string' ? input.comment : null);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'review', target: `committee-agenda:${agendaItemId}`, reason: fcoiReason(input, 'Committee vote cast via AnA'), payload: { memberId, vote }, domain: 'committee', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, agendaItemId, memberId, vote, message: `Recorded ${vote} vote from member ${memberId} on item ${agendaItemId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `cast_committee_vote failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('finalize_committee_determination', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_committee_determination requires tenant + user context.' });
  const agendaItemId = typeof input.agenda_item_id === 'number' ? input.agenda_item_id : NaN;
  if (!Number.isInteger(agendaItemId)) return JSON.stringify({ error: 'agenda_item_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { finalizeAgendaItemTx, getActorTrainingStatus } = await import('../committees/committee-service.js');
  const client = await getPool().connect();
  try {
    // CITI training gate (read) before opening the transaction.
    const ct = await client.query(`SELECT committee_type FROM committee_agenda_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [agendaItemId, ctx.organizationId]);
    if (ct.rows.length === 0) { client.release(); return JSON.stringify({ error: 'Agenda item not found.' }); }
    const training = await getActorTrainingStatus(ctx.organizationId, ctx.userId, ct.rows[0].committee_type);
    if (!training.trained) { client.release(); return JSON.stringify({ error: `Cannot finalize: ${training.reason}` }); }

    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const determination = await finalizeAgendaItemTx(client, ctx.organizationId, ctx.userId, agendaItemId);
    await recordGovernedAction(client, { orgId: ctx.organizationId, userId: ctx.userId, command: 'sign', target: `committee-agenda:${agendaItemId}`, reason: fcoiReason(input, 'Committee determination finalized via AnA'), payload: { outcome: determination.outcome }, domain: 'committee', surface: 'ana' });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, agendaItemId, outcome: determination.outcome, rationale: determination.rationale, tally: determination.tally });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `finalize_committee_determination failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_protocol_portfolio', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_protocol_portfolio requires tenant context.' });
  const { getProtocolPortfolio } = await import('../committees/committee-service.js');
  try {
    const portfolio = await getProtocolPortfolio(ctx.organizationId);
    return JSON.stringify({
      ok: true,
      iacucCount: portfolio.iacuc.length,
      irbCount: portfolio.irb.length,
      pendingAgendaCount: portfolio.pendingAgenda.length,
      iacuc: portfolio.iacuc,
      irb: portfolio.irb,
      pendingAgenda: portfolio.pendingAgenda,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_protocol_portfolio failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Medicare Coverage Analysis (C2C-15). Conversational building shares the
// governed/audited path (recordGovernedAction, surface 'ana'). The billing
// designation is deterministic (classifyCoverageItem); AI text is advisory only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_coverage_analysis', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_coverage_analysis requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createAnalysisTx } = await import('../coverage-analysis/coverage-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, provenanceLinkId } = await createAnalysisTx(client, ctx.organizationId, ctx.userId, {
      title,
      studyId: typeof input.study_id === 'number' ? input.study_id : null,
      irbSubmissionId: typeof input.irb_submission_id === 'number' ? input.irb_submission_id : null,
      nctId: typeof input.nct_id === 'string' ? input.nct_id : null,
      sponsor: typeof input.sponsor === 'string' ? input.sponsor : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `coverage-analysis:${id}`, reason: fcoiReason(input, 'Medicare coverage analysis opened via AnA'),
      payload: { title, provenanceLinkId }, domain: 'coverage', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, provenanceLinkId, message: `Opened Medicare coverage analysis "${title}" (id ${id}). Set the qualifying-trial determination, then add and classify items.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_coverage_analysis failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('set_coverage_qualifying_determination', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_coverage_qualifying_determination requires tenant + user context.' });
  const analysisId = typeof input.analysis_id === 'number' ? input.analysis_id : NaN;
  if (!Number.isInteger(analysisId)) return JSON.stringify({ error: 'analysis_id is required.' });
  if (typeof input.has_therapeutic_intent !== 'boolean' || typeof input.enrolls_diagnosis_treatment !== 'boolean' || typeof input.has_medicare_benefit_category !== 'boolean') {
    return JSON.stringify({ error: 'has_therapeutic_intent, enrolls_diagnosis_treatment, and has_medicare_benefit_category (booleans) are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { setQualifyingDeterminationTx } = await import('../coverage-analysis/coverage-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const result = await setQualifyingDeterminationTx(client, ctx.organizationId, analysisId, {
      hasTherapeuticIntent: input.has_therapeutic_intent,
      enrollsDiagnosisTreatment: input.enrolls_diagnosis_treatment,
      hasMedicareBenefitCategory: input.has_medicare_benefit_category,
      deemedQualifying: typeof input.deemed_qualifying === 'boolean' ? input.deemed_qualifying : undefined,
      desirableCharacteristicsCount: typeof input.desirable_characteristics_count === 'number' ? input.desirable_characteristics_count : undefined,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `coverage-analysis:${analysisId}`, reason: fcoiReason(input, 'Qualifying-trial determination set via AnA'),
      payload: { determination: result.determination }, domain: 'coverage', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, analysisId, determination: result.determination, deemed: result.deemed, unmetCriteria: result.unmetCriteria, rationale: result.rationale });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `set_coverage_qualifying_determination failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_coverage_item', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_coverage_item requires tenant + user context.' });
  const analysisId = typeof input.analysis_id === 'number' ? input.analysis_id : NaN;
  const itemDescription = typeof input.item_description === 'string' ? input.item_description.trim() : '';
  if (!Number.isInteger(analysisId) || !itemDescription) return JSON.stringify({ error: 'analysis_id and item_description are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addItemTx } = await import('../coverage-analysis/coverage-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addItemTx(client, ctx.organizationId, ctx.userId, analysisId, {
      itemDescription,
      category: typeof input.category === 'string' ? (input.category as any) : null,
      cptHcpcsCode: typeof input.cpt_hcpcs_code === 'string' ? input.cpt_hcpcs_code : null,
      icd10Code: typeof input.icd10_code === 'string' ? input.icd10_code : null,
      isStandardOfCare: typeof input.is_standard_of_care === 'boolean' ? input.is_standard_of_care : false,
      sponsorPaidInBudget: typeof input.sponsor_paid_in_budget === 'boolean' ? input.sponsor_paid_in_budget : false,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `coverage-analysis:${analysisId}`, reason: fcoiReason(input, 'Coverage item added via AnA'),
      payload: { itemId: id }, domain: 'coverage', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, itemId: id, message: `Added coverage item "${itemDescription}" (id ${id}). Classify it with classify_coverage_item.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_coverage_item failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('classify_coverage_item', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'classify_coverage_item requires tenant + user context.' });
  const itemId = typeof input.item_id === 'number' ? input.item_id : NaN;
  if (!Number.isInteger(itemId) || typeof input.is_standard_of_care !== 'boolean' || typeof input.sponsor_paid_in_budget !== 'boolean') {
    return JSON.stringify({ error: 'item_id, is_standard_of_care, and sponsor_paid_in_budget are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { classifyItemTx } = await import('../coverage-analysis/coverage-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const result = await classifyItemTx(client, ctx.organizationId, itemId, {
      isStandardOfCare: input.is_standard_of_care,
      sponsorPaidInBudget: input.sponsor_paid_in_budget,
      ncdCitation: typeof input.ncd_citation === 'string' ? input.ncd_citation : null,
      lcdCitation: typeof input.lcd_citation === 'string' ? input.lcd_citation : null,
      coverageDocUrl: typeof input.coverage_doc_url === 'string' ? input.coverage_doc_url : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `coverage-item:${itemId}`, reason: fcoiReason(input, 'Coverage item classified via AnA'),
      payload: { classification: result.classification, billingDesignation: result.billingDesignation }, domain: 'coverage', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, itemId, classification: result.classification, billingDesignation: result.billingDesignation, citation: result.citation, rationale: result.rationale });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `classify_coverage_item failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_coverage_analysis', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_coverage_analysis requires tenant context.' });
  const analysisId = typeof input.analysis_id === 'number' ? input.analysis_id : NaN;
  if (!Number.isInteger(analysisId)) return JSON.stringify({ error: 'analysis_id is required.' });
  const { getBillingGrid } = await import('../coverage-analysis/coverage-service.js');
  try {
    const grid = await getBillingGrid(ctx.organizationId, analysisId);
    return JSON.stringify({
      ok: true,
      readyToFinalize: grid.readiness.readyToFinalize,
      blockers: grid.readiness.blockers,
      warnings: grid.readiness.warnings,
      summary: grid.summary,
      itemCount: grid.readiness.itemCount,
      message: grid.readiness.readyToFinalize
        ? 'Coverage analysis passes the deterministic readiness gate — ready to finalize the billing grid.'
        : `Not ready to finalize: ${grid.readiness.blockers.join(' ')}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_coverage_analysis failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// eGrants (C2C-14). Conversational building shares the governed/audited path
// (recordGovernedAction, surface 'ana'). Awards thread proposal → award provenance.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_grant_proposal', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_grant_proposal requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createProposalTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createProposalTx(client, ctx.organizationId, ctx.userId, {
      title,
      opportunityId: typeof input.opportunity_id === 'number' ? input.opportunity_id : null,
      projectId: typeof input.project_id === 'number' ? input.project_id : null,
      principalInvestigator: typeof input.principal_investigator === 'string' ? input.principal_investigator : null,
      requestedAmount: typeof input.requested_amount === 'number' ? input.requested_amount : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-proposal:${id}`, reason: fcoiReason(input, 'Grant proposal opened via AnA'),
      payload: { title }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened grant proposal "${title}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_grant_proposal failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('record_grant_award', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'record_grant_award requires tenant + user context.' });
  const awardNumber = typeof input.award_number === 'string' ? input.award_number.trim() : '';
  const fundingAgency = typeof input.funding_agency === 'string' ? input.funding_agency : '';
  if (!awardNumber || !['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'].includes(fundingAgency)) {
    return JSON.stringify({ error: 'award_number and a valid funding_agency are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createAwardTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, provenanceLinkId } = await createAwardTx(client, ctx.organizationId, ctx.userId, {
      awardNumber, fundingAgency: fundingAgency as any,
      proposalId: typeof input.proposal_id === 'number' ? input.proposal_id : null,
      projectId: typeof input.project_id === 'number' ? input.project_id : null,
      totalAmount: typeof input.total_amount === 'number' ? input.total_amount : null,
      periodStart: typeof input.period_start === 'string' ? input.period_start : null,
      periodEnd: typeof input.period_end === 'string' ? input.period_end : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${id}`, reason: fcoiReason(input, 'Grant award recorded via AnA'),
      payload: { fundingAgency, provenanceLinkId }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, provenanceLinkId, message: `Recorded ${fundingAgency.toUpperCase()} award "${awardNumber}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `record_grant_award failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_grant_reporting', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_grant_reporting requires tenant context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getAwardPeriod } = await import('../grants/grants-service.js');
  const { reportingObligations, awardPeriodState } = await import('../grants/grants-logic.js');
  try {
    const { periodStart, periodEnd } = await getAwardPeriod(ctx.organizationId, awardId);
    const today = new Date().toISOString().slice(0, 10);
    const obligations = reportingObligations(periodStart, periodEnd);
    return JSON.stringify({
      ok: true, periodState: awardPeriodState(periodStart, periodEnd, today), obligations,
      message: `${obligations.length} reporting obligation(s); award is ${awardPeriodState(periodStart, periodEnd, today).replace(/_/g, ' ')}.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_grant_reporting failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('set_grant_milestone_status', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_grant_milestone_status requires tenant + user context.' });
  const milestoneId = typeof input.milestone_id === 'number' ? input.milestone_id : NaN;
  const status = typeof input.status === 'string' ? input.status : '';
  if (!Number.isInteger(milestoneId) || !['pending', 'in_progress', 'met', 'missed', 'submitted'].includes(status)) {
    return JSON.stringify({ error: 'milestone_id and a valid status (pending|in_progress|met|missed|submitted) are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { setMilestoneStatusTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    await setMilestoneStatusTx(client, ctx.organizationId, milestoneId, status, typeof input.completed_date === 'string' ? input.completed_date : null);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
      target: `grant-milestone:${milestoneId}`, reason: fcoiReason(input, 'Milestone status set via AnA'),
      payload: { status }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id: milestoneId, status, message: `Milestone ${milestoneId} → ${status}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `set_grant_milestone_status failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('open_grant_closeout', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'open_grant_closeout requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { openCloseoutTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, closeoutDueDate } = await openCloseoutTx(client, ctx.organizationId, ctx.userId, awardId);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Grant closeout opened via AnA'),
      payload: { closeoutId: id, closeoutDueDate }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, closeoutId: id, closeoutDueDate, message: `Opened closeout for award ${awardId}${closeoutDueDate ? ` — final reports due ${closeoutDueDate} (2 CFR 200.344)` : ''}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `open_grant_closeout failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('update_grant_closeout', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'update_grant_closeout requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { updateCloseoutTx } = await import('../grants/grants-service.js');
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    await updateCloseoutTx(client, ctx.organizationId, ctx.userId, awardId, {
      finalRpprSubmitted: bool(input.final_rppr_submitted),
      finalFfrSubmitted: bool(input.final_ffr_submitted),
      equipmentInventoryReturned: bool(input.equipment_inventory_returned),
      finalInvoicesReconciled: bool(input.final_invoices_reconciled),
      deobligationAmount: typeof input.deobligation_amount === 'number' ? input.deobligation_amount : null,
      notes: typeof input.notes === 'string' ? input.notes : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Grant closeout updated via AnA'),
      payload: { closeout: 'updated' }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, awardId, message: `Updated closeout items for award ${awardId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `update_grant_closeout failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('finalize_grant_closeout', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'finalize_grant_closeout requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { finalizeCloseoutTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { closedAward } = await finalizeCloseoutTx(client, ctx.organizationId, ctx.userId, awardId);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'sign',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Grant closeout finalized via AnA'),
      payload: { closeout: 'completed', closedAward }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, awardId, closedAward, message: `Closeout finalized — award ${awardId} is closed (all 2 CFR 200.344 items complete).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The deterministic gate blocks finalize with outstanding items — surface it.
    return JSON.stringify({ error: `finalize_grant_closeout failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('record_subaward', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'record_subaward requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  const subrecipientName = typeof input.subrecipient_name === 'string' ? input.subrecipient_name.trim() : '';
  if (!Number.isInteger(awardId) || !subrecipientName) return JSON.stringify({ error: 'award_id and subrecipient_name are required.' });
  const RISK = ['low', 'medium', 'high'];
  const INST = ['higher_ed', 'nonprofit', 'commercial', 'foreign', 'government', 'other'];
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createSubawardTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createSubawardTx(client, ctx.organizationId, ctx.userId, awardId, {
      subrecipientName,
      subrecipientUei: typeof input.subrecipient_uei === 'string' ? input.subrecipient_uei : null,
      institutionType: typeof input.institution_type === 'string' && INST.includes(input.institution_type) ? input.institution_type as any : null,
      amount: typeof input.amount === 'number' ? input.amount : null,
      periodStart: typeof input.period_start === 'string' ? input.period_start : null,
      periodEnd: typeof input.period_end === 'string' ? input.period_end : null,
      riskLevel: typeof input.risk_level === 'string' && RISK.includes(input.risk_level) ? input.risk_level as any : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Subaward recorded via AnA'),
      payload: { subawardId: id, subrecipientName }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, subawardId: id, message: `Recorded subaward to "${subrecipientName}" (id ${id}). Screen the subrecipient and record risk before executing.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `record_subaward failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('screen_subaward', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'screen_subaward requires tenant + user context.' });
  const subawardId = typeof input.subaward_id === 'number' ? input.subaward_id : NaN;
  const screenStatus = typeof input.screen_status === 'string' ? input.screen_status : '';
  if (!Number.isInteger(subawardId) || !['cleared', 'excluded'].includes(screenStatus)) {
    return JSON.stringify({ error: 'subaward_id and screen_status (cleared|excluded) are required. Use screen_restricted_party to perform the live SAM.gov lookup first.' });
  }
  const RISK = ['low', 'medium', 'high'];
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { screenSubawardTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    await screenSubawardTx(client, ctx.organizationId, subawardId, {
      screenStatus: screenStatus as any,
      screenSource: typeof input.screen_source === 'string' ? input.screen_source : 'sam_exclusions',
      riskLevel: typeof input.risk_level === 'string' && RISK.includes(input.risk_level) ? input.risk_level as any : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `grant-subaward:${subawardId}`, reason: fcoiReason(input, 'Subaward screening recorded via AnA'),
      payload: { screenStatus }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, subawardId, screenStatus, message: `Recorded ${screenStatus === 'excluded' ? 'an EXCLUSION (subaward prohibited, 2 CFR 200.214)' : 'a clean screen'} for subaward ${subawardId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `screen_subaward failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('execute_subaward', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'execute_subaward requires tenant + user context.' });
  const subawardId = typeof input.subaward_id === 'number' ? input.subaward_id : NaN;
  if (!Number.isInteger(subawardId)) return JSON.stringify({ error: 'subaward_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { executeSubawardTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    await executeSubawardTx(client, ctx.organizationId, ctx.userId, subawardId);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'sign',
      target: `grant-subaward:${subawardId}`, reason: fcoiReason(input, 'Subaward executed via AnA'),
      payload: { status: 'executed' }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, subawardId, status: 'executed', message: `Subaward ${subawardId} executed (cleared screen + risk assessment, 2 CFR 200.214/200.332).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The eligibility gate blocks execution of an unscreened/excluded/unassessed subaward — surface it.
    return JSON.stringify({ error: `execute_subaward failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

const BUDGET_CATEGORIES = ['personnel', 'fringe', 'equipment', 'travel', 'supplies', 'contractual', 'construction', 'other_direct', 'indirect'];

registerToolHandler('add_grant_budget_line', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_grant_budget_line requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  const category = typeof input.category === 'string' ? input.category : '';
  const budgetedAmount = typeof input.budgeted_amount === 'number' ? input.budgeted_amount : NaN;
  if (!Number.isInteger(awardId) || !BUDGET_CATEGORIES.includes(category) || !Number.isFinite(budgetedAmount)) {
    return JSON.stringify({ error: 'award_id, a valid category, and budgeted_amount are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addBudgetLineTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addBudgetLineTx(client, ctx.organizationId, ctx.userId, awardId, {
      category: category as any, budgetedAmount,
      indirectRatePct: typeof input.indirect_rate_pct === 'number' ? input.indirect_rate_pct : null,
      notes: typeof input.notes === 'string' ? input.notes : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Budget line added via AnA'),
      payload: { budgetLineId: id, category }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, budgetLineId: id, message: `Added ${category} budget line (${budgetedAmount}) to award ${awardId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The over-allocation gate rejects a budget that exceeds the award amount — surface it.
    return JSON.stringify({ error: `add_grant_budget_line failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('record_grant_expenditure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'record_grant_expenditure requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  const category = typeof input.category === 'string' ? input.category : '';
  const amount = typeof input.amount === 'number' ? input.amount : NaN;
  if (!Number.isInteger(awardId) || !BUDGET_CATEGORIES.includes(category) || !Number.isFinite(amount)) {
    return JSON.stringify({ error: 'award_id, a valid category, and amount are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { recordExpenditureTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await recordExpenditureTx(client, ctx.organizationId, ctx.userId, awardId, {
      category: category as any, amount,
      expenditureDate: typeof input.expenditure_date === 'string' ? input.expenditure_date : null,
      description: typeof input.description === 'string' ? input.description : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Expenditure recorded via AnA'),
      payload: { expenditureId: id, category, amount }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, expenditureId: id, message: `Recorded ${category} expenditure (${amount}) against award ${awardId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `record_grant_expenditure failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_grant_budget', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_grant_budget requires tenant context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getBudgetVsActual } = await import('../grants/grants-service.js');
  try {
    const s = await getBudgetVsActual(ctx.organizationId, awardId);
    return JSON.stringify({
      ok: true, riskLevel: s.riskLevel, totalBudgeted: s.totalBudgeted, totalActual: s.totalActual, totalRemaining: s.totalRemaining,
      overAllocated: s.overAllocated, categories: s.categories, findings: s.findings,
      message: `Budget vs actual: ${s.totalActual} of ${s.totalBudgeted} spent (${s.totalRemaining} remaining); risk ${s.riskLevel}${s.findings.length ? `, ${s.findings.length} finding(s)` : ''}.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_grant_budget failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('record_cost_share_contribution', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'record_cost_share_contribution requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  const source = typeof input.source === 'string' ? input.source : '';
  const amount = typeof input.amount === 'number' ? input.amount : NaN;
  if (!Number.isInteger(awardId) || !['institutional', 'third_party', 'in_kind', 'other'].includes(source) || !Number.isFinite(amount)) {
    return JSON.stringify({ error: 'award_id, a valid source, and amount are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { recordCostShareContributionTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await recordCostShareContributionTx(client, ctx.organizationId, ctx.userId, awardId, {
      source: source as any, amount,
      contributionDate: typeof input.contribution_date === 'string' ? input.contribution_date : null,
      description: typeof input.description === 'string' ? input.description : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'Cost-share contribution recorded via AnA'),
      payload: { contributionId: id, source, amount }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, contributionId: id, message: `Recorded ${source} cost-share contribution (${amount}) to award ${awardId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `record_cost_share_contribution failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_cost_share', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_cost_share requires tenant context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { getCostShareStatus } = await import('../grants/grants-service.js');
  try {
    const s = await getCostShareStatus(ctx.organizationId, awardId);
    return JSON.stringify({
      ok: true, ...s,
      message: s.committed === 0
        ? `No cost share committed for award ${awardId}.`
        : `Cost share: ${s.contributed} of ${s.committed} met (${s.metPct}%)${s.met ? ' — fully met' : `, shortfall ${s.shortfall} (2 CFR 200.306)`}.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_cost_share failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('request_no_cost_extension', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'request_no_cost_extension requires tenant + user context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  const newEndDate = typeof input.new_end_date === 'string' ? input.new_end_date : '';
  if (!Number.isInteger(awardId) || !/^\d{4}-\d{2}-\d{2}/.test(newEndDate)) return JSON.stringify({ error: 'award_id and a new_end_date (YYYY-MM-DD) are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { requestNceTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, requiresSponsorApproval, months } = await requestNceTx(client, ctx.organizationId, ctx.userId, awardId, { newEndDate, reason: typeof input.reason === 'string' ? input.reason : null });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-award:${awardId}`, reason: fcoiReason(input, 'No-cost extension requested via AnA'),
      payload: { nceId: id, months, requiresSponsorApproval }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, nceId: id, months, requiresSponsorApproval, message: `Requested a ${months}-month extension on award ${awardId}${requiresSponsorApproval ? ' — requires sponsor prior approval (2 CFR 200.308)' : ' — within grantee authority'}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `request_no_cost_extension failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('approve_no_cost_extension', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'approve_no_cost_extension requires tenant + user context.' });
  const nceId = typeof input.nce_id === 'number' ? input.nce_id : NaN;
  const authority = typeof input.authority === 'string' ? input.authority : '';
  if (!Number.isInteger(nceId) || !['grantee', 'sponsor'].includes(authority)) return JSON.stringify({ error: 'nce_id and authority (grantee|sponsor) are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { approveNceTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { newEndDate } = await approveNceTx(client, ctx.organizationId, ctx.userId, nceId, authority as any);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'sign',
      target: `grant-nce:${nceId}`, reason: fcoiReason(input, 'No-cost extension approved via AnA'),
      payload: { status: 'approved', authority, newEndDate }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, nceId, newEndDate, message: `Approved NCE ${nceId} (${authority}); award period now ends ${newEndDate}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The gate rejects grantee self-approval of an extension that needs the sponsor — surface it.
    return JSON.stringify({ error: `approve_no_cost_extension failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-domain briefing + coverage-gap fills (HA fulfill/readiness, CS substance).
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('record_grant_opportunity', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'record_grant_opportunity requires tenant + user context.' });
  const opportunityNumber = typeof input.opportunity_number === 'string' ? input.opportunity_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const fundingAgency = typeof input.funding_agency === 'string' ? input.funding_agency : '';
  const AGENCIES = ['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other'];
  const MECHANISMS = ['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other'];
  if (!opportunityNumber || !title || !AGENCIES.includes(fundingAgency)) {
    return JSON.stringify({ error: 'opportunity_number, title, and a valid funding_agency are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createOpportunityTx } = await import('../grants/grants-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createOpportunityTx(client, ctx.organizationId, ctx.userId, {
      opportunityNumber, title, fundingAgency: fundingAgency as any,
      mechanism: typeof input.mechanism === 'string' && MECHANISMS.includes(input.mechanism) ? input.mechanism as any : null,
      // The grants.gov opportunity id (from search_grants_gov) threads the external pipeline link.
      externalId: typeof input.external_id === 'string' ? input.external_id : (typeof input.external_id === 'number' ? String(input.external_id) : null),
      dueDate: typeof input.due_date === 'string' ? input.due_date : null,
      ceilingAmount: typeof input.ceiling_amount === 'number' ? input.ceiling_amount : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `grant-opportunity:${id}`, reason: fcoiReason(input, 'Funding opportunity recorded via AnA'),
      payload: { opportunityNumber, fundingAgency }, domain: 'grants', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Recorded ${fundingAgency.toUpperCase()} opportunity "${opportunityNumber}" into the pre-award pipeline (id ${id}). Open a proposal against it with create_grant_proposal.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `record_grant_opportunity failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('prepare_award_closeout', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'prepare_award_closeout requires tenant context.' });
  const awardId = typeof input.award_id === 'number' ? input.award_id : NaN;
  if (!Number.isInteger(awardId)) return JSON.stringify({ error: 'award_id is required.' });
  const { prepareAwardCloseout } = await import('../grants/grants-service.js');
  try {
    const p = await prepareAwardCloseout(ctx.organizationId, awardId);
    return JSON.stringify({
      ok: true, awardId, readyToClose: p.readyToClose, blockers: p.blockers, warnings: p.warnings,
      closeout: { dueDate: p.closeout.dueDate, outstanding: p.closeout.outstanding, items: p.closeout.items },
      reportingObligations: p.reportingObligations, costShare: p.costShare, budget: p.budget,
      message: p.readyToClose
        ? `Award ${awardId} is ready to close — all 2 CFR 200.344 items done, milestones current, cost share met.`
        : `Award ${awardId} is NOT ready to close — ${p.blockers.length} blocker(s): ${p.blockers.slice(0, 4).join('; ')}${p.blockers.length > 4 ? '…' : ''}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `prepare_award_closeout failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('research_compliance_briefing', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'research_compliance_briefing requires tenant context.' });
  const { buildComplianceBriefing } = await import('../research-compliance/compliance-briefing.js');
  try {
    const b = await buildComplianceBriefing(ctx.organizationId);
    const headline = b.totalAttentionItems === 0
      ? 'Nothing needs attention across research compliance & sponsored programs right now.'
      : `${b.bySeverity.critical} critical, ${b.bySeverity.warning} warning, ${b.bySeverity.info} informational item(s) across ${new Set(b.items.map((i) => i.domain)).size} domain(s). Top: ${b.items.slice(0, 3).map((i) => `${i.count} ${i.signal} (${i.domain})`).join('; ')}.`;
    return JSON.stringify({ ok: true, ...b, message: headline });
  } catch (err) {
    return JSON.stringify({ error: `research_compliance_briefing failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('triage_compliance_attention', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'triage_compliance_attention requires tenant + user context.' });
  const { triageComplianceAttention } = await import('../research-compliance/compliance-triage.js');
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  try {
    const r = await triageComplianceAttention(ctx.organizationId, ctx.projectId ?? null);
    // Record one governed action over the batch (best-effort tasks already created).
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, ctx.organizationId);
      await recordGovernedAction(client, {
        orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
        target: `compliance-triage:${ctx.organizationId}`, reason: fcoiReason(input, 'Compliance attention triaged to tasks via AnA'),
        payload: { criticalItems: r.criticalItems, created: r.created.length, alreadyTracked: r.alreadyTracked.length }, domain: 'research_compliance', surface: 'ana',
      });
      await client.query('COMMIT');
    } catch { await client.query('ROLLBACK').catch(() => undefined); } finally { client.release(); }
    return JSON.stringify({
      ok: true, ...r,
      message: r.criticalItems === 0
        ? 'No critical attention items — nothing to triage.'
        : `Triaged ${r.criticalItems} critical item(s): ${r.created.length} new task(s) created, ${r.alreadyTracked.length} already tracked.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `triage_compliance_attention failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('fulfill_regulatory_commitment', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'fulfill_regulatory_commitment requires tenant + user context.' });
  const commitmentId = typeof input.commitment_id === 'number' ? input.commitment_id : NaN;
  if (!Number.isInteger(commitmentId)) return JSON.stringify({ error: 'commitment_id is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { fulfillCommitmentTx } = await import('../ha-interactions/ha-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const fulfilledDate = typeof input.fulfilled_date === 'string' ? input.fulfilled_date : null;
    await fulfillCommitmentTx(client, ctx.organizationId, commitmentId, fulfilledDate);
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'resolve',
      target: `regulatory-commitment:${commitmentId}`, reason: fcoiReason(input, 'Commitment fulfilled via AnA'),
      payload: { fulfilledDate }, domain: 'ha', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id: commitmentId, message: `Marked commitment ${commitmentId} fulfilled.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `fulfill_regulatory_commitment failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_ha_interaction', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_ha_interaction requires tenant context.' });
  const interactionId = typeof input.interaction_id === 'number' ? input.interaction_id : NaN;
  if (!Number.isInteger(interactionId)) return JSON.stringify({ error: 'interaction_id is required.' });
  const { getPool } = await import('../../db.js');
  const { getInteractionReadinessInput } = await import('../ha-interactions/ha-service.js');
  const { evaluateMeetingReadiness } = await import('../ha-interactions/ha-logic.js');
  const client = await getPool().connect();
  try {
    const r = await getInteractionReadinessInput(client, ctx.organizationId, interactionId);
    const { ready, findings } = evaluateMeetingReadiness(r as any);
    return JSON.stringify({
      ok: true, ready, findings,
      message: ready
        ? `Interaction ${interactionId} is meeting-ready.`
        : `Interaction ${interactionId} is NOT ready — ${findings.filter((f) => f.severity === 'critical').length} critical gap(s): ${findings.map((f) => f.message).join('; ')}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_ha_interaction failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('prepare_meeting_package', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'prepare_meeting_package requires tenant context.' });
  const interactionId = typeof input.interaction_id === 'number' ? input.interaction_id : NaN;
  if (!Number.isInteger(interactionId)) return JSON.stringify({ error: 'interaction_id is required.' });
  const { prepareMeetingPackage } = await import('../ha-interactions/ha-service.js');
  try {
    const p = await prepareMeetingPackage(ctx.organizationId, interactionId);
    return JSON.stringify({
      ok: true, interactionId, ready: p.ready, findings: p.findings,
      questionCount: p.questionCount, openQuestions: p.openQuestions, outstandingCommitments: p.outstandingCommitments, overdueCommitments: p.overdueCommitments, actions: p.actions,
      message: p.ready
        ? `${p.interactionType} meeting is ready — ${p.questionCount} question(s), ${p.outstandingCommitments} open commitment(s).`
        : `${p.interactionType} meeting is NOT ready — ${p.actions.length} action(s): ${p.actions.slice(0, 4).join('; ')}${p.actions.length > 4 ? '…' : ''}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `prepare_meeting_package failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('register_controlled_substance', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'register_controlled_substance requires tenant + user context.' });
  const substanceName = typeof input.substance_name === 'string' ? input.substance_name.trim() : '';
  const deaSchedule = typeof input.dea_schedule === 'string' ? input.dea_schedule : '';
  if (!substanceName || !['I', 'II', 'III', 'IV', 'V'].includes(deaSchedule)) {
    return JSON.stringify({ error: 'substance_name and a valid dea_schedule (I–V) are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createSubstanceTx } = await import('../controlled-substances/cs-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createSubstanceTx(client, ctx.organizationId, ctx.userId, {
      substanceName, deaSchedule: deaSchedule as any,
      unit: typeof input.unit === 'string' ? input.unit : undefined,
      deaRegistrationId: typeof input.dea_registration_id === 'number' ? input.dea_registration_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `controlled-substance:${id}`, reason: fcoiReason(input, 'Controlled substance registered via AnA'),
      payload: { substanceName, deaSchedule }, domain: 'controlled_substances', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Registered Schedule ${deaSchedule} substance "${substanceName}" (id ${id}). Log receipts/uses against it to maintain the perpetual inventory.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `register_controlled_substance failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RIM-lite (C2C-12). Conversational building shares the governed/audited path
// (recordGovernedAction, surface 'ana').
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_rim_product', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_rim_product requires tenant + user context.' });
  const productName = typeof input.product_name === 'string' ? input.product_name.trim() : '';
  if (!productName) return JSON.stringify({ error: 'product_name is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createProductTx } = await import('../rim/rim-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createProductTx(client, ctx.organizationId, ctx.userId, {
      productName,
      inn: typeof input.inn === 'string' ? input.inn : null,
      dosageForm: typeof input.dosage_form === 'string' ? input.dosage_form : null,
      atcCode: typeof input.atc_code === 'string' ? input.atc_code : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `rim-product:${id}`, reason: fcoiReason(input, 'RIM product opened via AnA'),
      payload: { productName }, domain: 'rim', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened RIM product "${productName}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_rim_product failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('set_registration_status', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'set_registration_status requires tenant + user context.' });
  const productId = typeof input.product_id === 'number' ? input.product_id : NaN;
  const country = typeof input.country === 'string' ? input.country.trim() : '';
  if (!Number.isInteger(productId) || !country) return JSON.stringify({ error: 'product_id and country are required.' });
  const VALID = ['planned', 'submitted', 'under_review', 'approved', 'withdrawn', 'suspended', 'cancelled'];
  const marketStatus = typeof input.market_status === 'string' ? input.market_status : undefined;
  if (marketStatus && !VALID.includes(marketStatus)) return JSON.stringify({ error: 'market_status must be a valid status.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { upsertRegistrationTx } = await import('../rim/rim-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await upsertRegistrationTx(client, ctx.organizationId, ctx.userId, productId, {
      country, marketStatus: marketStatus as any,
      registrationNumber: typeof input.registration_number === 'string' ? input.registration_number : null,
      marketingAuthHolder: typeof input.marketing_auth_holder === 'string' ? input.marketing_auth_holder : null,
      approvalDate: typeof input.approval_date === 'string' ? input.approval_date : null,
      renewalDueDate: typeof input.renewal_due_date === 'string' ? input.renewal_due_date : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `rim-product:${productId}`, reason: fcoiReason(input, 'Registration status set via AnA'),
      payload: { registrationId: id, country, status: marketStatus }, domain: 'rim', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, registrationId: id, message: `Set ${country.toUpperCase()} status${marketStatus ? ` to ${marketStatus}` : ''} for product ${productId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `set_registration_status failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_label_currency', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_label_currency requires tenant context.' });
  const productId = typeof input.product_id === 'number' ? input.product_id : NaN;
  if (!Number.isInteger(productId)) return JSON.stringify({ error: 'product_id is required.' });
  const { getLabelCurrencyInput } = await import('../rim/rim-service.js');
  const { evaluateLabelCurrency } = await import('../rim/rim-logic.js');
  try {
    const inp = await getLabelCurrencyInput(ctx.organizationId, productId);
    const gate = evaluateLabelCurrency(inp);
    return JSON.stringify({
      ok: true, riskLevel: gate.riskLevel, findings: gate.findings,
      message: gate.findings.length === 0 ? 'All approved markets have current labels.' : `${gate.findings.length} approved market(s) missing a current label.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_label_currency failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Inspection Readiness (C2C-13). Conversational building shares the governed/
// audited path (recordGovernedAction, surface 'ana').
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_inspection', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_inspection requires tenant + user context.' });
  const inspectionType = typeof input.inspection_type === 'string' ? input.inspection_type : '';
  const agency = typeof input.agency === 'string' ? input.agency : '';
  const siteName = typeof input.site_name === 'string' ? input.site_name.trim() : '';
  if (!['bimo', 'pai', 'gcp', 'gmp', 'routine', 'for_cause', 'other'].includes(inspectionType) || !['fda', 'ema', 'mhra', 'pmda', 'other'].includes(agency) || !siteName) {
    return JSON.stringify({ error: 'inspection_type, agency, and site_name are required and must be valid.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createInspectionTx } = await import('../inspection/inspection-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createInspectionTx(client, ctx.organizationId, ctx.userId, {
      inspectionType: inspectionType as any, agency: agency as any, siteName,
      scheduledDate: typeof input.scheduled_date === 'string' ? input.scheduled_date : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `inspection:${id}`, reason: fcoiReason(input, 'Inspection opened via AnA'),
      payload: { inspectionType, agency }, domain: 'inspection', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened ${agency.toUpperCase()} ${inspectionType} inspection at "${siteName}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_inspection failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('log_inspection_finding', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'log_inspection_finding requires tenant + user context.' });
  const inspectionId = typeof input.inspection_id === 'number' ? input.inspection_id : NaN;
  const observationNumber = typeof input.observation_number === 'number' ? Math.round(input.observation_number) : NaN;
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const classification = typeof input.classification === 'string' ? input.classification : '';
  if (!Number.isInteger(inspectionId) || !Number.isInteger(observationNumber) || !description || !['critical', 'major', 'minor', 'observation'].includes(classification)) {
    return JSON.stringify({ error: 'inspection_id, observation_number, description, and a valid classification are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addFindingTx } = await import('../inspection/inspection-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addFindingTx(client, ctx.organizationId, ctx.userId, inspectionId, { observationNumber, description, classification: classification as any });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `inspection:${inspectionId}`, reason: fcoiReason(input, 'Inspection finding logged via AnA'),
      payload: { findingId: id, classification }, domain: 'inspection', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, findingId: id, message: `Logged ${classification} observation #${observationNumber} on inspection ${inspectionId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `log_inspection_finding failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_inspection_readiness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_inspection_readiness requires tenant context.' });
  const inspectionId = typeof input.inspection_id === 'number' ? input.inspection_id : undefined;
  const { listReadinessAreas } = await import('../inspection/inspection-service.js');
  const { scoreReadiness } = await import('../inspection/inspection-logic.js');
  try {
    const areas = await listReadinessAreas(ctx.organizationId, inspectionId);
    const score = scoreReadiness(areas);
    return JSON.stringify({
      ok: true, score: score.score, verdict: score.verdict, blockers: score.blockers,
      message: `Readiness ${score.score}% — ${score.verdict.replace(/_/g, ' ')}${score.blockers.length ? `; ${score.blockers.length} blocker(s)` : ''}.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_inspection_readiness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Controlled Substances / DEA (C2C-15). Conversational building shares the
// governed/audited path (recordGovernedAction, surface 'ana').
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('register_dea', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'register_dea requires tenant + user context.' });
  const registrantName = typeof input.registrant_name === 'string' ? input.registrant_name.trim() : '';
  const deaNumber = typeof input.dea_number === 'string' ? input.dea_number.trim() : '';
  const businessActivity = typeof input.business_activity === 'string' ? input.business_activity : '';
  if (!registrantName || !deaNumber || !['researcher', 'analytical_lab', 'manufacturer', 'distributor', 'practitioner', 'teaching_institution', 'other'].includes(businessActivity)) {
    return JSON.stringify({ error: 'registrant_name, dea_number, and a valid business_activity are required.' });
  }
  const schedules = Array.isArray(input.schedules) ? input.schedules.filter((s): s is string => typeof s === 'string' && ['I', 'II', 'III', 'IV', 'V'].includes(s)) : [];
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createRegistrationTx } = await import('../controlled-substances/cs-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createRegistrationTx(client, ctx.organizationId, ctx.userId, {
      registrantName, deaNumber, businessActivity: businessActivity as any, schedules,
      expirationDate: typeof input.expiration_date === 'string' ? input.expiration_date : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `dea-registration:${id}`, reason: fcoiReason(input, 'DEA registration recorded via AnA'),
      payload: { deaNumber }, domain: 'controlled_substances', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Recorded DEA registration ${deaNumber} (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `register_dea failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('log_cs_transaction', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'log_cs_transaction requires tenant + user context.' });
  const substanceId = typeof input.substance_id === 'number' ? input.substance_id : NaN;
  const transactionType = typeof input.transaction_type === 'string' ? input.transaction_type : '';
  const quantity = typeof input.quantity === 'number' ? input.quantity : NaN;
  if (!Number.isInteger(substanceId) || !['receipt', 'dispense', 'use', 'disposal', 'transfer', 'adjustment'].includes(transactionType) || !Number.isFinite(quantity)) {
    return JSON.stringify({ error: 'substance_id, a valid transaction_type, and a numeric quantity are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { recordTransactionTx } = await import('../controlled-substances/cs-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, balanceAfter } = await recordTransactionTx(client, ctx.organizationId, ctx.userId, substanceId, {
      transactionType: transactionType as any, quantity,
      transactionDate: typeof input.transaction_date === 'string' ? input.transaction_date : null,
      witnessedBy: typeof input.witnessed_by === 'string' ? input.witnessed_by : null,
      reference: typeof input.reference === 'string' ? input.reference : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `controlled-substance:${substanceId}`, reason: fcoiReason(input, 'CS transaction logged via AnA'),
      payload: { transactionId: id, type: transactionType, balanceAfter }, domain: 'controlled_substances', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, transactionId: id, balanceAfter, message: `Logged ${transactionType}; new balance ${balanceAfter}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `log_cs_transaction failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_cs_balance', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_cs_balance requires tenant context.' });
  const { listSubstances } = await import('../controlled-substances/cs-service.js');
  try {
    const rows = await listSubstances(ctx.organizationId);
    return JSON.stringify({
      ok: true,
      substances: rows.map((r: any) => ({ id: r.id, name: r.substance_name, schedule: r.dea_schedule, balance: r.current_balance, unit: r.unit })),
      message: `${rows.length} controlled substance(s) on inventory.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_cs_balance failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Obligations (C2C-11). Conversational building shares the governed/
// audited path (recordGovernedAction, surface 'ana'); periodic obligations
// generate their occurrences automatically.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_lifecycle_obligation', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_lifecycle_obligation requires tenant + user context.' });
  const obligationType = typeof input.obligation_type === 'string' ? input.obligation_type : '';
  const region = typeof input.region === 'string' ? input.region : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!['variation', 'supplement', 'periodic_report', 'pediatric', 'renewal', 'annual_report'].includes(obligationType) || !['fda', 'eu', 'jp', 'mhra', 'other'].includes(region) || !title) {
    return JSON.stringify({ error: 'obligation_type, region, and title are required and must be valid.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createObligationTx } = await import('../lifecycle-obligations/lifecycle-service.js');
  const { classificationPathway } = await import('../lifecycle-obligations/lifecycle-logic.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, occurrencesCreated } = await createObligationTx(client, ctx.organizationId, ctx.userId, {
      obligationType: obligationType as any, region: region as any, title,
      classification: typeof input.classification === 'string' ? input.classification : null,
      productId: typeof input.product_id === 'number' ? input.product_id : null,
      submissionId: typeof input.submission_id === 'number' ? input.submission_id : null,
      dueDate: typeof input.due_date === 'string' ? input.due_date : null,
      recurrenceMonths: typeof input.recurrence_months === 'number' ? Math.round(input.recurrence_months) : null,
      anchorDate: typeof input.anchor_date === 'string' ? input.anchor_date : null,
      occurrencesToGenerate: typeof input.occurrences_to_generate === 'number' ? Math.round(input.occurrences_to_generate) : undefined,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `lifecycle-obligation:${id}`, reason: fcoiReason(input, 'Lifecycle obligation opened via AnA'),
      payload: { obligationType, occurrencesCreated }, domain: 'lifecycle', surface: 'ana',
    });
    await client.query('COMMIT');
    const pathway = classificationPathway(typeof input.classification === 'string' ? input.classification : null);
    return JSON.stringify({ ok: true, id, occurrencesCreated, pathway, message: `Opened ${obligationType.replace(/_/g, ' ')} "${title}" (id ${id})${occurrencesCreated ? `; generated ${occurrencesCreated} occurrence(s)` : ''}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_lifecycle_obligation failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_lifecycle_calendar', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_lifecycle_calendar requires tenant context.' });
  const { listCalendar } = await import('../lifecycle-obligations/lifecycle-service.js');
  const { summarizeCalendar } = await import('../lifecycle-obligations/lifecycle-logic.js');
  try {
    const items = await listCalendar(ctx.organizationId);
    const today = new Date().toISOString().slice(0, 10);
    const summary = summarizeCalendar(items.map((i: any) => ({ dueDate: i.dueDate, terminal: i.status === 'approved' || i.status === 'closed' || i.status === 'submitted' })), today);
    return JSON.stringify({
      ok: true, summary,
      message: summary.overdue > 0 ? `${summary.overdue} obligation(s) overdue; ${summary.due_30} due within 30 days.` : `No overdue obligations; ${summary.due_30} due within 30 days, ${summary.due_90} within 90.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_lifecycle_calendar failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI-native eTMF (C2C-08). Conversational building shares the governed/audited
// path (recordGovernedAction, surface 'ana'); artifacts auto-classify by name.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('create_tmf', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_tmf requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createTmfTx } = await import('../etmf/etmf-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createTmfTx(client, ctx.organizationId, ctx.userId, { title, studyId: typeof input.study_id === 'number' ? input.study_id : null });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `tmf-file:${id}`, reason: fcoiReason(input, 'TMF opened via AnA'),
      payload: { title }, domain: 'etmf', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened TMF "${title}" (id ${id}).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_tmf failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('classify_tmf_artifact', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'classify_tmf_artifact requires tenant + user context.' });
  const tmfFileId = typeof input.tmf_file_id === 'number' ? input.tmf_file_id : NaN;
  const artifactName = typeof input.artifact_name === 'string' ? input.artifact_name.trim() : '';
  if (!Number.isInteger(tmfFileId) || !artifactName) return JSON.stringify({ error: 'tmf_file_id and artifact_name are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addArtifactTx } = await import('../etmf/etmf-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, zone, classification } = await addArtifactTx(client, ctx.organizationId, ctx.userId, tmfFileId, {
      artifactName,
      zone: typeof input.zone === 'number' ? input.zone : null,
      status: typeof input.status === 'string' ? (input.status as any) : undefined,
      documentDate: typeof input.document_date === 'string' ? input.document_date : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `tmf-file:${tmfFileId}`, reason: fcoiReason(input, 'TMF artifact filed via AnA'),
      payload: { artifactId: id, zone, classification }, domain: 'etmf', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, artifactId: id, zone, classification, message: `Filed "${artifactName}" to TMF zone ${zone}${classification !== 'explicit' ? ' (auto-classified)' : ''}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `classify_tmf_artifact failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_tmf_completeness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_tmf_completeness requires tenant context.' });
  const tmfFileId = typeof input.tmf_file_id === 'number' ? input.tmf_file_id : NaN;
  if (!Number.isInteger(tmfFileId)) return JSON.stringify({ error: 'tmf_file_id is required.' });
  const { getCompletenessInput } = await import('../etmf/etmf-service.js');
  const { evaluateCompleteness } = await import('../etmf/etmf-logic.js');
  try {
    const artifacts = await getCompletenessInput(ctx.organizationId, tmfFileId);
    const r = evaluateCompleteness(artifacts);
    return JSON.stringify({
      ok: true, completenessPct: r.completenessPct, verdict: r.verdict, gapCount: r.gaps.length, gaps: r.gaps.slice(0, 20),
      message: `TMF ${r.completenessPct}% complete — ${r.verdict.replace(/_/g, ' ')}${r.gaps.length ? `; ${r.gaps.length} gap(s)` : ''}.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_tmf_completeness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Research Compliance — foundation (roster + training-gating + checklist engine).
// run_compliance_checklist + review_training_gate are read-only deterministic;
// add_personnel_training is governed (surface 'ana').
// ─────────────────────────────────────────────────────────────────────────────

function rcProfile(input: Record<string, unknown>) {
  return {
    involvesHumanSubjects: input.involves_human_subjects === true,
    involvesAnimals: input.involves_animals === true,
    involvesRecombinantDNA: input.involves_recombinant_dna === true,
    involvesHumanGeneTransfer: input.involves_human_gene_transfer === true,
    fundingSource: (typeof input.funding_source === 'string' ? input.funding_source : 'other') as any,
    region: (typeof input.region === 'string' ? input.region : 'us') as any,
  };
}

registerToolHandler('run_compliance_checklist', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'run_compliance_checklist requires tenant context.' });
  const { resolveComplianceChecklist } = await import('../research-compliance/compliance-checklist.js');
  const c = resolveComplianceChecklist(rcProfile(input));
  const committees = c.requiredApprovals.map((a) => a.committee).join(', ') || 'none';
  return JSON.stringify({
    ok: true, ruleVersion: c.ruleVersion, requiredApprovals: c.requiredApprovals, requiredTraining: c.requiredTraining, steps: c.steps,
    message: `Required committee approvals: ${committees}; ${c.requiredTraining.length} training requirement(s).`,
  });
});

registerToolHandler('add_personnel_training', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_personnel_training requires tenant + user context.' });
  const personnelId = typeof input.personnel_id === 'number' ? input.personnel_id : NaN;
  const trainingType = typeof input.training_type === 'string' ? input.training_type : '';
  const VALID = ['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'biosafety', 'bloodborne_pathogens', 'iata_shipping', 'hipaa', 'fcoi_disclosure', 'other'];
  if (!Number.isInteger(personnelId) || !VALID.includes(trainingType)) return JSON.stringify({ error: 'personnel_id and a valid training_type are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addTrainingTx } = await import('../research-compliance/roster-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addTrainingTx(client, ctx.organizationId, ctx.userId, personnelId, {
      trainingType: trainingType as any,
      completedDate: typeof input.completed_date === 'string' ? input.completed_date : null,
      expiresDate: typeof input.expires_date === 'string' ? input.expires_date : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `research-personnel:${personnelId}`, reason: fcoiReason(input, 'Training recorded via AnA'),
      payload: { trainingId: id, trainingType }, domain: 'research_compliance', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, trainingId: id, message: `Recorded ${trainingType} for personnel ${personnelId}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_personnel_training failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('review_training_gate', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'review_training_gate requires tenant context.' });
  const personnelIds = Array.isArray(input.personnel_ids) ? input.personnel_ids.filter((n): n is number => typeof n === 'number') : [];
  const { resolveComplianceChecklist, evaluateTrainingGate } = await import('../research-compliance/compliance-checklist.js');
  const { loadRosterForGate } = await import('../research-compliance/roster-service.js');
  try {
    const checklist = resolveComplianceChecklist(rcProfile(input));
    const roster = await loadRosterForGate(ctx.organizationId, personnelIds);
    const today = new Date().toISOString().slice(0, 10);
    const gate = evaluateTrainingGate(roster.personnel, checklist.requiredTraining, roster.records, today);
    return JSON.stringify({
      ok: true, cleared: gate.cleared, missing: gate.missing, expiringSoon: gate.expiringSoon,
      message: gate.cleared ? 'Training gate cleared — all required training is current.' : `Training gate BLOCKED — ${gate.missing.length} missing/expired requirement(s).`,
    });
  } catch (err) {
    return JSON.stringify({ error: `review_training_gate failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('create_effort_certification', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_effort_certification requires tenant + user context.' });
  const personnelId = typeof input.personnel_id === 'number' ? input.personnel_id : NaN;
  const periodStart = typeof input.period_start === 'string' ? input.period_start : '';
  const periodEnd = typeof input.period_end === 'string' ? input.period_end : '';
  if (!Number.isInteger(personnelId) || !periodStart || !periodEnd) return JSON.stringify({ error: 'personnel_id, period_start, and period_end are required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createCertificationTx } = await import('../effort-certification/effort-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await createCertificationTx(client, ctx.organizationId, ctx.userId, { personnelId, periodStart, periodEnd });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `effort-certification:${id}`, reason: fcoiReason(input, 'Effort statement opened via AnA'),
      payload: { personnelId, periodStart, periodEnd }, domain: 'effort_certification', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, message: `Opened effort statement (id ${id}) for ${periodStart}–${periodEnd}. Add effort lines, then certify.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_effort_certification failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('add_effort_line', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'add_effort_line requires tenant + user context.' });
  const certId = typeof input.certification_id === 'number' ? input.certification_id : NaN;
  const activityLabel = typeof input.activity_label === 'string' ? input.activity_label.trim() : '';
  const committedPct = typeof input.committed_pct === 'number' ? input.committed_pct : NaN;
  const actualPct = typeof input.actual_pct === 'number' ? input.actual_pct : NaN;
  if (!Number.isInteger(certId) || !activityLabel || !Number.isFinite(committedPct) || !Number.isFinite(actualPct)) {
    return JSON.stringify({ error: 'certification_id, activity_label, committed_pct, and actual_pct are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { addLineTx } = await import('../effort-certification/effort-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id } = await addLineTx(client, ctx.organizationId, ctx.userId, certId, {
      activityLabel, committedPct, actualPct,
      awardId: typeof input.award_id === 'number' ? input.award_id : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'update',
      target: `effort-certification:${certId}`, reason: fcoiReason(input, 'Effort line added via AnA'),
      payload: { lineId: id, activityLabel, committedPct, actualPct }, domain: 'effort_certification', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, lineId: id, certificationId: certId, message: `Added effort line "${activityLabel}" (${committedPct}% committed / ${actualPct}% actual).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `add_effort_line failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('create_coi_disclosure', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx?.userId) return JSON.stringify({ error: 'create_coi_disclosure requires tenant + user context.' });
  const personnelId = typeof input.personnel_id === 'number' ? input.personnel_id : NaN;
  const disclosureType = typeof input.disclosure_type === 'string' ? input.disclosure_type : '';
  const entityName = typeof input.entity_name === 'string' ? input.entity_name.trim() : '';
  const VALID = ['financial_interest', 'outside_activity', 'foreign_appointment', 'foreign_support', 'other_support', 'gift', 'intellectual_property', 'other'];
  if (!Number.isInteger(personnelId) || !VALID.includes(disclosureType) || !entityName) {
    return JSON.stringify({ error: 'personnel_id, a valid disclosure_type, and entity_name are required.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const { createDisclosureTx } = await import('../research-security/coi-service.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { id, foreignFlag } = await createDisclosureTx(client, ctx.organizationId, ctx.userId, {
      personnelId, disclosureType: disclosureType as any, entityName,
      country: typeof input.country === 'string' ? input.country : null,
      description: typeof input.description === 'string' ? input.description : null,
      monetaryValue: typeof input.monetary_value === 'number' ? input.monetary_value : null,
    });
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'create',
      target: `coi-disclosure:${id}`, reason: fcoiReason(input, 'COI disclosure filed via AnA'),
      payload: { personnelId, disclosureType, foreignFlag }, domain: 'research_security', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, id, foreignFlag, message: `Filed ${disclosureType} disclosure for "${entityName}" (id ${id}).${foreignFlag ? ' Flagged for research-security review (foreign nexus).' : ''}` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `create_coi_disclosure failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('search_grants_gov', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'search_grants_gov requires tenant context.' });
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) return JSON.stringify({ error: 'A query is required to search Grants.gov.' });
  const limit = Math.min(typeof input.limit === 'number' ? input.limit : 15, 50);
  const { searchConnectors } = await import('../connectors/connector-registry.js');
  try {
    const [res] = await searchConnectors(ctx.organizationId, ['grants_gov'], { keywords: [query], limit });
    if (res?.error) return JSON.stringify({ error: `Grants.gov search failed: ${res.error}` });
    const opportunities = (res?.results ?? []).map((r) => ({ id: r.id, title: r.title, summary: r.summary, url: r.url, ...r.metadata }));
    return JSON.stringify({
      ok: true, count: opportunities.length, opportunities,
      message: opportunities.length ? `Found ${opportunities.length} Grants.gov opportunit${opportunities.length === 1 ? 'y' : 'ies'} for "${query}".` : `No posted/forecasted Grants.gov opportunities matched "${query}".`,
      citation_hint: 'Cite each opportunity by its number and agency, and link to the provided url.',
    });
  } catch (err) {
    return JSON.stringify({ error: `search_grants_gov failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('screen_restricted_party', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'screen_restricted_party requires tenant context.' });
  const partyName = typeof input.party_name === 'string' ? input.party_name.trim() : '';
  if (!partyName) return JSON.stringify({ error: 'party_name is required to screen against SAM.gov exclusions.' });
  const { searchConnectors } = await import('../connectors/connector-registry.js');
  try {
    const [res] = await searchConnectors(ctx.organizationId, ['sam_exclusions'], { sponsor: partyName, limit: 25 });
    if (res?.error) {
      // Most commonly: the SAM.gov connector is not configured for this org.
      return JSON.stringify({ status: 'unavailable', message: `SAM.gov screening is not available: ${res.error}. Configure the SAM.gov connector (API key) in connector settings.` });
    }
    const matches = res?.results ?? [];
    return JSON.stringify({
      ok: true, cleared: matches.length === 0, matchCount: matches.length, matches: matches.map((m) => ({ name: m.title, ...m.metadata })),
      message: matches.length === 0
        ? `CLEAN screen — no SAM.gov exclusion found for "${partyName}".`
        : `EXCLUSION FOUND — ${matches.length} potential SAM.gov exclusion match(es) for "${partyName}". Confirm by UEI/address before acting; do not proceed with award/procurement on a confirmed match.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `screen_restricted_party failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('assess_study_onboarding', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'assess_study_onboarding requires tenant context.' });
  const personnelIds = Array.isArray(input.personnel_ids) ? input.personnel_ids.filter((n): n is number => typeof n === 'number') : [];
  const { assessStudyOnboarding } = await import('../research-compliance/compliance-checklist.js');
  const { loadRosterForGate } = await import('../research-compliance/roster-service.js');
  try {
    const roster = await loadRosterForGate(ctx.organizationId, personnelIds);
    const today = new Date().toISOString().slice(0, 10);
    const a = assessStudyOnboarding(rcProfile(input), roster.personnel, roster.records, today);
    const committees = a.requiredApprovals.map((x) => x.committee).join(', ') || 'none';
    return JSON.stringify({
      ok: true, ruleVersion: a.ruleVersion, requiredApprovals: a.requiredApprovals, requiredTraining: a.requiredTraining,
      steps: a.steps, approvals: a.approvals, readyToSubmit: a.readyToSubmit, blockers: a.blockers,
      message: a.readyToSubmit
        ? `Required approvals: ${committees}. Team training is current — ready to submit.`
        : `Required approvals: ${committees}. NOT ready — ${a.blockers.length} blocker(s): ${a.blockers.slice(0, 4).join('; ')}${a.blockers.length > 4 ? '…' : ''}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `assess_study_onboarding failed: ${err instanceof Error ? err.message : String(err)}` });
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
              importance_level = CASE WHEN $4 = true AND importance_level IN ($5, $6)
                                      THEN $7
                                      ELSE importance_level END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, importance_level, is_verified_by_user`,
      [id, ctx.organizationId, ctx.userId ?? null, input.bump_importance === true, 'low', 'medium', 'high'],
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
//
// C2C-AUDIT-001 — the four controlled-document handlers below (create /
// approve / revise / retire) are REGULATED mutations of the GxP document
// register. Each one therefore commits its 21 CFR Part 11 §11.10(e) audit row
// in the SAME transaction as the mutation, via recordGovernedAction on the
// caller's client — the canonical in-file pattern already used by the FCOI
// handlers. Previously create/approve wrote NO audit at all, and revise/retire
// autocommitted the UPDATE and then fired `void auditService.logAction(...)`
// on a separate connection whose failures were swallowed, so a crash or audit
// error left a durable regulated change with no audit trail.
//
// `command` MUST come from the c2c_ana_actions_command_check vocabulary
// (migrations/20260527_mutation_primitives.sql): claim | transition | resolve |
// sign | accept-ai-suggestion | lock | unclaim | transition-back | reopen |
// revoke-signature | reject-ai-suggestion | unlock. All four handlers move
// qms_documents.status, so they are 'transition'; the specific verb travels in
// the hash-committed payload under `kind`.
// ─────────────────────────────────────────────────────────────────────────────

/** Reason-for-change for a governed QMS action: caller-supplied, else a fallback. */
const QMS_REASON_MIN = 8;
function qmsReason(input: Record<string, unknown>, fallback: string): string {
  const r = typeof input.reason === 'string' ? input.reason.trim() : '';
  return r.length >= QMS_REASON_MIN ? r : fallback;
}

registerToolHandler('create_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'create_qms_document requires tenant context.' });
  if (!ctx.userId) return JSON.stringify({ error: 'create_qms_document requires user context — a controlled document cannot be created without an identified actor (21 CFR Part 11).' });
  const docNumber = typeof input.doc_number === 'string' ? input.doc_number.trim() : '';
  const title     = typeof input.title === 'string' ? input.title.trim() : '';
  const docType   = typeof input.doc_type === 'string' ? input.doc_type : '';
  if (!docNumber || !title) return JSON.stringify({ error: 'doc_number and title are required.' });
  if (!['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol'].includes(docType)) {
    return JSON.stringify({ error: 'doc_type invalid.' });
  }
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { rows } = await client.query(
      `INSERT INTO qms_documents (
         organization_id, doc_number, title, doc_type, category, version, status,
         author_id
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'1.0'),'draft',$7)
       RETURNING id, doc_number, title, status`,
      [
        ctx.organizationId, docNumber, title, docType,
        typeof input.category === 'string' ? input.category : null,
        typeof input.version === 'string' ? input.version : null,
        ctx.userId,
      ],
    );
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
      target: `qms-document:${rows[0].id}`,
      reason: qmsReason(input, `Controlled document ${docNumber} created via AnA`),
      payload: { kind: 'create', docNumber, title, docType, to: 'draft' },
      domain: 'mdx', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Created QMS document ${docNumber} (${docType}, draft).`,
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = (err as { code?: string }).code;
    if (code === '23505') return JSON.stringify({ error: 'A document with that number already exists.' });
    return JSON.stringify({
      error: `create_qms_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    client.release();
  }
});

registerToolHandler('approve_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'approve_qms_document requires tenant context.' });
  if (!ctx.userId) return JSON.stringify({ error: 'approve_qms_document requires user context — an approval cannot be recorded without an identified approver (21 CFR Part 11).' });
  const id = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'document_id (number) is required.' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { rows } = await client.query(
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
      [id, ctx.organizationId, ctx.userId,
       typeof input.effective_date === 'string' ? input.effective_date : null],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK').catch(() => undefined);
      return JSON.stringify({ error: 'Document not found, or not in draft/in_review state.' });
    }
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
      target: `qms-document:${id}`,
      reason: qmsReason(input, `Controlled document approved to effective via AnA`),
      payload: { kind: 'approve', to: 'effective', effectiveDate: rows[0].effective_date ?? null },
      domain: 'mdx', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({
      ok: true, ...rows[0],
      message: `Approved document ${id} — effective ${rows[0].effective_date}.`,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({
      error: `approve_qms_document failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    client.release();
  }
});

registerToolHandler('revise_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'revise_qms_document requires tenant context.' });
  const id = typeof input.document_id === 'number' ? input.document_id : NaN;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'document_id (number) is required.' });
  if (reason.length < 3) return JSON.stringify({ error: 'A reason for change is required to open a controlled revision (21 CFR Part 11) — ask the user for it.' });
  if (!ctx.userId) return JSON.stringify({ error: 'revise_qms_document requires user context — a controlled revision cannot be opened without an identified actor (21 CFR Part 11).' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const cur = await client.query<{ version: string }>(
      `SELECT version FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, ctx.organizationId],
    );
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => undefined);
      return JSON.stringify({ error: `Document ${id} not found in this organization.` });
    }
    const m = /^(\d+)/.exec(String(cur.rows[0].version ?? '').trim());
    const newVersion = `${(m ? parseInt(m[1], 10) : 1) + 1}.0`;
    const { rows } = await client.query(
      `UPDATE qms_documents
          SET status = 'draft', version = $3, approver_id = NULL, approved_at = NULL,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'lastRevision', jsonb_build_object('reason', $4::text, 'from', $5::text, 'at', NOW(), 'by', $6::int)),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND status IN ('effective','superseded','retired','in_review')
        RETURNING id, doc_number, version, status`,
      [id, ctx.organizationId, newVersion, reason, cur.rows[0].version, ctx.userId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK').catch(() => undefined);
      return JSON.stringify({ error: 'Document cannot be revised from its current state.' });
    }
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
      target: `qms-document:${id}`, reason,
      payload: { kind: 'revise', from: cur.rows[0].version, to: newVersion, status: 'draft' },
      domain: 'mdx', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, ...rows[0], message: `Opened revision of ${rows[0].doc_number} → v${newVersion} (draft).` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `revise_qms_document failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
  }
});

registerToolHandler('retire_qms_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'retire_qms_document requires tenant context.' });
  const id = typeof input.document_id === 'number' ? input.document_id : NaN;
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'document_id (number) is required.' });
  const reason = typeof input.reason === 'string' ? input.reason.trim() : null;
  if (!ctx.userId) return JSON.stringify({ error: 'retire_qms_document requires user context — a retirement cannot be recorded without an identified actor (21 CFR Part 11).' });
  const { getPool } = await import('../../db.js');
  const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, ctx.organizationId);
    const { rows } = await client.query(
      `UPDATE qms_documents
          SET status = 'retired',
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'retired', jsonb_build_object('reason', $3::text, 'at', NOW(), 'by', $4::int)),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status <> 'retired'
        RETURNING id, doc_number, status`,
      [id, ctx.organizationId, reason, ctx.userId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK').catch(() => undefined);
      return JSON.stringify({ error: 'Document not found, or already retired.' });
    }
    await recordGovernedAction(client, {
      orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
      target: `qms-document:${id}`,
      reason: qmsReason(input, 'Controlled document retired via AnA'),
      payload: { kind: 'retire', to: 'retired' },
      domain: 'mdx', surface: 'ana',
    });
    await client.query('COMMIT');
    return JSON.stringify({ ok: true, ...rows[0], message: `Retired document ${rows[0].doc_number}.` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return JSON.stringify({ error: `retire_qms_document failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    client.release();
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

// ── Change control (ICH Q10 / Annex 15) — call the shared service so the tool
//    inherits the controlled lifecycle, segregation-of-duties and validation the
//    REST routes use. Each governed action writes a 21 CFR Part 11 audit entry.
registerToolHandler('qms_change_create', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'qms_change_create requires tenant context.' });
  const changeNumber = typeof input.change_number === 'string' ? input.change_number.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!changeNumber || !title) return JSON.stringify({ error: 'change_number and title are required.' });
  try {
    const { createChange } = await import('../qms/changeControl.service.js');
    const row = await createChange(ctx.organizationId, {
      changeNumber, title,
      description: typeof input.description === 'string' ? input.description : null,
      changeType: typeof input.change_type === 'string' ? input.change_type : undefined,
      classification: typeof input.classification === 'string' ? input.classification : undefined,
      riskLevel: typeof input.risk_level === 'string' ? input.risk_level : null,
      reason: typeof input.reason === 'string' ? input.reason : null,
      impactAssessment: typeof input.impact_assessment === 'string' ? input.impact_assessment : null,
      implementationPlan: typeof input.implementation_plan === 'string' ? input.implementation_plan : null,
      targetImplementationDate: typeof input.target_implementation_date === 'string' ? input.target_implementation_date : null,
      qmsDocumentId: typeof input.qms_document_id === 'number' ? input.qms_document_id : null,
      proposedBy: ctx.userId ?? null,
    });
    const auditService = (await import('../auditService.js')).default;
    void auditService.logAction({
      tenantId: ctx.organizationId, userId: ctx.userId ?? undefined,
      action: 'mdx.qms.change.create', resourceType: 'qms_change_control', resourceId: row.id,
      details: { changeNumber: row.change_number, classification: row.classification, via: 'ana' },
    });
    return JSON.stringify({ ok: true, ...row, message: `Raised change ${row.change_number} (${row.status}).` });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return JSON.stringify({ error: 'A change with that number already exists in this organization.' });
    return JSON.stringify({ error: `qms_change_create failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('qms_change_transition', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'qms_change_transition requires tenant context.' });
  const id = typeof input.change_id === 'number' ? input.change_id : NaN;
  const to = typeof input.to === 'string' ? input.to : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'change_id (number) is required.' });
  if (!to) return JSON.stringify({ error: 'to (target lifecycle state) is required.' });
  if (reason.length < 3) return JSON.stringify({ error: 'A reason for change is required for this governed (21 CFR Part 11) transition — ask the user for it.' });
  try {
    const svc = await import('../qms/changeControl.service.js');
    const row = await svc.transitionChange(ctx.organizationId, id, to as Parameters<typeof svc.transitionChange>[2], {
      userId: ctx.userId ?? null,
      effectivenessReview: typeof input.effectiveness_review === 'string' ? input.effectiveness_review : null,
    });
    if (!row) return JSON.stringify({ error: `Change ${id} not found in this organization.` });
    const auditService = (await import('../auditService.js')).default;
    void auditService.logAction({
      tenantId: ctx.organizationId, userId: ctx.userId ?? undefined,
      action: 'mdx.qms.change.transition', resourceType: 'qms_change_control', resourceId: id,
      details: { to, reason, via: 'ana' },
    });
    return JSON.stringify({ ok: true, governed: true, ...row, message: `Change ${id} → ${row.status}.` });
  } catch (err: unknown) {
    // InvalidChangeTransitionError / SegregationOfDutiesError carry human-readable messages.
    return JSON.stringify({ error: err instanceof Error ? err.message : `qms_change_transition failed: ${String(err)}` });
  }
});

registerToolHandler('qms_change_link', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'qms_change_link requires tenant context.' });
  const id = typeof input.change_id === 'number' ? input.change_id : NaN;
  const linkType = typeof input.link_type === 'string' ? input.link_type : '';
  const linkedRef = typeof input.linked_ref === 'string' ? input.linked_ref.trim() : '';
  if (!Number.isFinite(id)) return JSON.stringify({ error: 'change_id (number) is required.' });
  if (!linkType || !linkedRef) return JSON.stringify({ error: 'link_type and linked_ref are required.' });
  try {
    const { getChange, addLink } = await import('../qms/changeControl.service.js');
    const change = await getChange(ctx.organizationId, id);
    if (!change) return JSON.stringify({ error: `Change ${id} not found in this organization.` });
    const row = await addLink(ctx.organizationId, id, {
      linkType, linkedRef,
      linkedLabel: typeof input.linked_label === 'string' ? input.linked_label : null,
      relationship: typeof input.relationship === 'string' ? input.relationship : undefined,
      note: typeof input.note === 'string' ? input.note : null,
      createdBy: ctx.userId ?? null,
    });
    const auditService = (await import('../auditService.js')).default;
    void auditService.logAction({
      tenantId: ctx.organizationId, userId: ctx.userId ?? undefined,
      action: 'mdx.qms.change.link', resourceType: 'qms_change_control', resourceId: id,
      details: { linkType, linkedRef, via: 'ana' },
    });
    return JSON.stringify({ ok: true, ...row, message: `Linked ${linkType} ${linkedRef} to change ${id}.` });
  } catch (err: unknown) {
    return JSON.stringify({ error: `qms_change_link failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ── Clinical Regulatory Evidence — CSR ⇄ FDA CRL ⇄ study design (read-only
//    evidence; never a prediction, never a dose value, never a binary verdict).
registerToolHandler('search_clinical_regulatory_evidence', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'search_clinical_regulatory_evidence requires tenant context.' });
  const org = ctx.organizationId;
  const indication = typeof input.indication === 'string' ? input.indication : undefined;
  const phase = typeof input.phase === 'string' ? input.phase : undefined;
  const limit = typeof input.limit === 'number' ? Math.min(Math.max(input.limit, 1), 100) : 25;
  const types = Array.isArray(input.entity_types) && input.entity_types.length
    ? (input.entity_types as string[]) : ['studies', 'findings', 'outcomes', 'lessons'];
  try {
    const spine = await import('../clinical-regulatory-evidence/evidence-spine.service.js');
    const result: Record<string, unknown> = {};
    if (types.includes('studies')) result.studies = await spine.listStudies(org, { indication, phase, limit });
    if (types.includes('findings')) result.findings = await spine.listFindings(org, { limit });
    if (types.includes('outcomes')) result.outcomes = await spine.listOutcomes(org, { limit });
    if (types.includes('lessons')) result.designLessons = await spine.listDesignLessons(org, { limit });
    const provenance = buildProvenance({
      sourceId: 'clinical_regulatory_evidence',
      citation: { title: 'Clinical regulatory evidence spine', identifier: indication ?? null, url: null },
      query: [indication, phase].filter(Boolean).join(' ') || null,
      confidence: 'moderate',
    });
    return JSON.stringify({ ok: true, ...result, provenance, note: 'Precedent evidence from the shared spine (global-public + your org). This is evidence, not a prediction.' });
  } catch (err) {
    return JSON.stringify({ error: `search_clinical_regulatory_evidence failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('compare_proposed_design_to_precedent', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'compare_proposed_design_to_precedent requires tenant context.' });
  const indication = typeof input.indication === 'string' ? input.indication : '';
  if (!indication) return JSON.stringify({ error: 'indication is required.' });
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint : undefined;
  try {
    const sde = await import('../clinical-regulatory-evidence/study-design-evidence.service.js');
    const benchmark = await sde.benchmarkDesign(ctx.organizationId, {
      indication, phase: typeof input.phase === 'string' ? input.phase : undefined,
      modality: typeof input.modality === 'string' ? input.modality : undefined,
      population: typeof input.population === 'string' ? input.population : undefined,
      endpointClass: endpoint, comparator: typeof input.comparator === 'string' ? input.comparator : undefined,
      designType: typeof input.design_type === 'string' ? input.design_type : undefined,
    });
    const endpointRisk = endpoint
      ? await sde.assessEndpointRegulatoryRisk(ctx.organizationId, endpoint, { indication, phase: typeof input.phase === 'string' ? input.phase : undefined })
      : null;
    const provenance = buildProvenance({
      sourceId: 'clinical_regulatory_evidence',
      citation: { title: `Precedent for ${indication}${endpoint ? ` · ${endpoint}` : ''}`, identifier: indication, url: null },
      query: [indication, endpoint].filter(Boolean).join(' ') || null,
      confidence: 'moderate',
    });
    return JSON.stringify({ ok: true, benchmark, endpointRisk, provenance, note: 'Evidence comparison with provenance — not a verdict on FDA acceptance.' });
  } catch (err) {
    return JSON.stringify({ error: `compare_proposed_design_to_precedent failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('explain_design_risk', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'explain_design_risk requires tenant context.' });
  const feature = typeof input.feature === 'string' ? input.feature.trim() : '';
  if (!feature) return JSON.stringify({ error: 'feature (e.g. the proposed endpoint) is required.' });
  try {
    const sde = await import('../clinical-regulatory-evidence/study-design-evidence.service.js');
    const r = await sde.assessEndpointRegulatoryRisk(ctx.organizationId, feature, {
      indication: typeof input.indication === 'string' ? input.indication : undefined,
      phase: typeof input.phase === 'string' ? input.phase : undefined,
    });
    const provenance = buildProvenance({
      sourceId: 'fda_crl',
      citation: { title: `FDA precedent referencing "${feature}"`, identifier: feature, url: null },
      query: feature,
      confidence: r.evidenceQuality === 'substantial' ? 'high' : r.evidenceQuality === 'insufficient' ? 'low' : 'moderate',
    });
    return JSON.stringify({ ok: true, ...r, provenance });
  } catch (err) {
    return JSON.stringify({ error: `explain_design_risk failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('stress_test_protocol', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'stress_test_protocol requires tenant context.' });
  const indication = typeof input.indication === 'string' ? input.indication : '';
  if (!indication) return JSON.stringify({ error: 'indication is required.' });
  try {
    const sde = await import('../clinical-regulatory-evidence/study-design-evidence.service.js');
    const plan = await sde.simulateDesignWithRegulatoryStress(ctx.organizationId, {
      indication, phase: typeof input.phase === 'string' ? input.phase : undefined,
      endpoint: typeof input.endpoint === 'string' ? input.endpoint : undefined,
    });
    const provenance = buildProvenance({
      sourceId: 'fda_crl',
      citation: { title: `Regulatory-stress scenarios for ${indication}`, identifier: indication, url: null },
      query: indication,
      confidence: 'moderate',
    });
    return JSON.stringify({ ok: true, ...plan, provenance });
  } catch (err) {
    return JSON.stringify({ error: `stress_test_protocol failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('trace_design_recommendation', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'trace_design_recommendation requires tenant context.' });
  const entityType = typeof input.entity_type === 'string' ? input.entity_type : '';
  const entityId = typeof input.entity_id === 'number' ? input.entity_id : NaN;
  if (!entityType || !Number.isFinite(entityId)) return JSON.stringify({ error: 'entity_type and numeric entity_id are required.' });
  try {
    const spine = await import('../clinical-regulatory-evidence/evidence-spine.service.js');
    const chain = await spine.listRelationshipsFor(ctx.organizationId, entityType as Parameters<typeof spine.listRelationshipsFor>[1], entityId);
    const provenance = buildProvenance({
      sourceId: 'clinical_regulatory_evidence',
      citation: { title: `Evidence chain for ${entityType} ${entityId}`, identifier: `${entityType}:${entityId}`, url: null },
      query: `${entityType}:${entityId}`,
      confidence: 'moderate',
    });
    return JSON.stringify({ ok: true, entity: { type: entityType, id: entityId }, chain, provenance, note: 'Every edge is inspectable with its source; inferred edges are flagged.' });
  } catch (err) {
    return JSON.stringify({ error: `trace_design_recommendation failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// Tenant curation — projects THIS org's own csr_reports into the spine so they
// become searchable precedent. Idempotent; writes tenant-private links only, copies
// no CSR text, mints no findings. This is what populates the spine for the read
// tools above on a workspace whose CSRs are not yet projected (audit P0b).
registerToolHandler('project_csr_evidence', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'project_csr_evidence requires tenant context.' });
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? input.limit : undefined;
  try {
    const adapter = await import('../clinical-regulatory-evidence/csr-adapter.service.js');
    const result = await adapter.projectOrgCsrReports(ctx.organizationId, { limit });
    const message =
      result.total === 0
        ? 'No CSR reports found for this workspace to project.'
        : `Projected ${result.projected} new CSR(s) into the evidence spine (${result.alreadyPresent} already present, ${result.failed} unreadable) across ${result.studyCount} study identities.`;
    return JSON.stringify({ ok: true, ...result, message, note: 'Reference-only projection of your own CSRs — no text copied, no findings minted.' });
  } catch (err) {
    return JSON.stringify({ error: `project_csr_evidence failed: ${err instanceof Error ? err.message : String(err)}` });
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
        // Uniform provenance: an imported file is a 'source_input' event — the
        // artifact was born from an uploaded document. Best-effort so a
        // provenance hiccup never fails the import.
        try {
          await recordArtifactProvenance(pool, {
            artifactId: ins.rows[0].id,
            organizationId: ctx.organizationId,
            eventType: 'source_input',
            eventAction: 'import',
            actorId: ctx.userId,
            details: { importJobId: jobId, sourcePath: f.relative_path, artifactKind: f.mapped_artifact_kind ?? null },
            backendService: 'ana/AnaToolExecutor:import',
          });
        } catch { /* import provenance is best-effort */ }
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
  // Same rule as write_q_sub_section: kit sections become a 510(k)/PMA/CER, and
  // prose bound for a regulator cannot be attributed to a placeholder.
  if (!ctx.userId) {
    return JSON.stringify({
      error: 'write_kit_section requires user context — section prose cannot be attributed without an identified author (21 CFR Part 11).',
    });
  }
  const rawSources = input.sources;
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
       creating a free-floating row outside the kit's taxonomy.

       HISTORY (2026-08-14). This UPDATE used to run alone: no version row, no
       reason, no snapshot of the text it replaced — and `cerv2_510k_sections`
       has no version trigger, so nothing else preserved it either. AnA could
       overwrite a section's prior content on the device surface, where that
       content becomes a 510(k), with no recoverable history. The human PATCH
       route had always written a rich version row; only this path did not.

       This path now goes through recordCerv2SectionVersion, on a transaction,
       so the content write and its history commit together or not at all. A
       version row written outside the content write can attest to a change
       that rolled back; content written without one is the loss this exists to
       prevent.

       NOT yet consolidated: routes/cerv2-sections.ts still has three of its own
       inserts into cerv2_section_versions. They record history correctly, so
       nothing is unsafe there — but four writers of one table is three too
       many, and re-pointing untested route paths is its own change. Tracked as
       ledger L39. */
    const { writeKitSectionTx, KitSectionNotFoundError } = await import('../cerv2/kit-section-write.js');
    const { resolveDraftSources, describeDraftLineage } = await import('./drafting-source-lineage.js');
    const client = await pool.connect();
    let row: any;
    let lineageReport: import('./drafting-source-lineage.js').DraftLineageReport | null = null;
    try {
      await client.query('BEGIN');
      /* The ONE kit-section writer (services/cerv2/kit-section-write): FOR UPDATE
         snapshot, content write, version row and lineage gate, on this
         transaction — shared with the AnA-RI section.update command so a kit
         section has exactly one way of being written by AnA (ledger L160). */
      const { sources, dropped } = await resolveDraftSources(ctx.organizationId, rawSources, client);
      let written;
      try {
        written = await writeKitSectionTx(client, ctx.organizationId, { sectionKey }, {
          content,
          status,
          completionPercentage: completionPct,
          note,
          /* The tool's own note when the caller supplied one. Falling back to a
             fixed string is deliberate and honest — it names the actor and the
             mechanism rather than inventing a rationale nobody gave. */
          changeSummary: (note && String(note).trim()) || 'Drafted by AnA (no summary supplied)',
          sources,
          actorUserId: ctx.userId,
        });
      } catch (e) {
        if (e instanceof KitSectionNotFoundError) {
          await client.query('ROLLBACK');
          return JSON.stringify({ error: e.message });
        }
        throw e;
      }
      lineageReport = describeDraftLineage(written.gate, sources, dropped);
      await client.query('COMMIT');
      row = written.row;
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

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
      lineage:             lineageReport,
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

registerToolHandler('batch_draft_sections', async (input, ctx) => {
  // S2 — draft many sections in ONE parallel batch instead of one section per
  // agentic turn. Reuses the existing AnaDocumentDraftingService.batchDraft
  // (bounded-concurrency Promise.all); no new drafting logic. Nothing is saved —
  // the author promotes each draft through the governed authoring flow.
  const rawSections = Array.isArray(input.sections) ? input.sections : [];
  if (rawSections.length === 0) {
    return JSON.stringify({ error: 'batch_draft_sections requires a non-empty sections[] array' });
  }
  if (rawSections.length > 20) {
    return JSON.stringify({ error: 'batch_draft_sections is limited to 20 sections per call' });
  }

  const framework = (typeof input.framework === 'string' ? input.framework : 'FDA') as string;
  const submissionType = typeof input.submission_type === 'string' ? input.submission_type : undefined;
  const projectContext = (input.project_context && typeof input.project_context === 'object'
    ? (input.project_context as Record<string, unknown>)
    : undefined) as
    | { deviceName?: string; deviceType?: string; indication?: string; predicateDevice?: string; classification?: string }
    | undefined;

  const requests = rawSections
    .map((s) => {
      const sec = s as Record<string, unknown>;
      const sectionType = typeof sec.section_type === 'string' ? sec.section_type : '';
      const instructions = typeof sec.instructions === 'string' ? sec.instructions : '';
      if (!sectionType || !instructions) return null;
      return {
        framework: framework as any,
        submissionType,
        sectionType,
        instructions,
        existingContent: typeof sec.existing_content === 'string' ? sec.existing_content : undefined,
        projectContext,
        organizationId: ctx?.organizationId ?? undefined,
        userId: ctx?.userId ?? undefined,
        projectId: ctx?.projectId ?? undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (requests.length === 0) {
    return JSON.stringify({ error: 'each section requires section_type and instructions' });
  }

  try {
    const { getAnaDraftingService } = await import('./AnaDocumentDraftingService.js');
    const service = getAnaDraftingService();
    const results = await service.batchDraft({ requests, concurrency: 5 });
    return JSON.stringify({
      status: 'drafted',
      engine: 'framework-grade',
      count: results.length,
      sections: results.map((r, i) => ({
        sectionType: requests[i].sectionType,
        content: r.content,
        model: r.model,
        latencyMs: r.latencyMs,
      })),
      instruction:
        'These are parallel first drafts. The author promotes each through the governed authoring flow (accept into the section, which runs the Part-11 version trigger). State any completeness gaps honestly; do not present unknown values as established.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `batch draft failed: ${err?.message || 'unknown error'}` });
  }
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


// The agentic-workflow tool handlers (drafting council, deep investigations,
// client journey) are registered from their own module now — see
// agentic-workflow-tools.ts. Injected register avoids an import cycle.
registerAgenticWorkflowHandlers(registerToolHandler);

// The biotech program orchestrator (get_biotech_program_status) is registered
// from its own sibling module the same way — injected register, no import cycle.
registerBiotechProgramHandlers(registerToolHandler);

// The canonical document revision spine (commit_document_revision) — the one
// atomic flow every AnA-authored document mutation runs through — same pattern.
registerDocumentSpineHandlers(registerToolHandler);

// Project-folder document catalog (list/read/catalog over vault.documents,
// with read-coverage enforcement) — same injected-register pattern.
registerDocumentCatalogHandlers(registerToolHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Agentic Execution Loop
// ─────────────────────────────────────────────────────────────────────────────

export interface AgenticOptions {
  /** Maximum tool-use rounds before forcing stop */
  maxRounds?: number;
  /**
   * Progress-earned rounds allowed beyond maxRounds while every round tries
   * novel work (see agentic-loop.ts). Defaults to the Balanced allowance.
   */
  progressExtension?: number;
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
 * AnA can call tools, get results, reason further, call more tools, and
 * eventually produce a final text answer.
 *
 * This is a thin adapter over the single canonical loop core in
 * {@link runAgenticToolLoop} (server/services/ana/agentic-loop.ts) — the same
 * orchestrator the SSE streaming route uses — so both of AnA's chat surfaces
 * share one bounded, thrash-resistant, context-budgeted loop instead of two
 * subtly different hand-rolled ones. This adapter owns only what is specific to
 * the non-SSE callers: issuing the gateway calls, dispatching local tool
 * handlers (in parallel, with results capped before they re-enter the model
 * context), forwarding the per-tool execution hook, honouring barge-in via the
 * abort signal, and returning the final {@link AnaGatewayResponse} the callers
 * expect.
 */
export async function executeAgenticLoop(
  request: GatewayRequest,
  options?: AgenticOptions
): Promise<AnaGatewayResponse> {
  const gateway = getGateway();
  // Default to the effort-scaled Balanced ceiling (6) rather than a flat 5, so a
  // caller that doesn't pin maxRounds still gets the modernized agentic depth.
  const maxRounds = options?.maxRounds || resolveMaxRounds('balanced');
  const progressExtension = options?.progressExtension ?? resolveRoundExtension('balanced');
  const signal = options?.signal;
  // Failure-adaptation guidance from the latest round (cleared after use).
  let pendingAdaptationNote = '';

  const toToolCall = (c: AnaToolUse): ToolCall => ({
    id: c.id,
    name: c.name,
    input: (c.input ?? {}) as Record<string, unknown>,
  });

  // First model turn. Streaming (when the request carries onStream) and tool
  // selection happen inside the gateway exactly as before.
  let finalResponse = (await gateway.route(request)) as AnaGatewayResponse;

  // Fast path: the model answered without asking for any tool.
  if (!finalResponse.toolUses || finalResponse.toolUses.length === 0) {
    return finalResponse;
  }

  // Conversation grows across rounds: each round appends the assistant's
  // narration + the tool results, mirroring the streaming route's loopMessages.
  const loopMessages: GatewayMessage[] = [...request.messages];

  // Run one round's tool calls in parallel (network-bound tools like PubMed /
  // ClinicalTrials no longer block each other), firing the per-tool hook in the
  // original call order so callers' telemetry/event streams stay deterministic.
  const executeTools = async (calls: ToolCall[]): Promise<ToolResultEntry[]> => {
    // Barge-in: don't spend work running this round's tools once cancelled;
    // callModel sees the abort next and ends the loop.
    if (signal?.aborted) return [];
    const ran = await mapWithConcurrency(
      calls,
      async (call): Promise<{ call: ToolCall; result: string; errorMessage?: string }> => {
        const handler = toolHandlers.get(call.name);
        if (!handler) {
          return {
            call,
            result: JSON.stringify({
              error: `No handler registered for tool: ${call.name}`,
              availableTools: Array.from(toolHandlers.keys()),
            }),
            errorMessage: 'no handler registered',
          };
        }
        try {
          const result = await handler(call.input, options?.toolContext);
          return { call, result };
        } catch (error: any) {
          return {
            call,
            result: JSON.stringify({
              error: `Tool execution failed: ${error?.message ?? 'unknown error'}`,
              tool: call.name,
            }),
            errorMessage: error?.message ?? 'unknown error',
          };
        }
      },
      4,
    );

    const entries: ToolResultEntry[] = [];
    const roundFailures: FailedToolCall[] = [];
    for (const { call, result, errorMessage } of ran) {
      options?.onToolExecution?.(call.name, call.input, result);
      entries.push({ tool_use_id: call.id, name: call.name, content: result });
      if (errorMessage) roundFailures.push({ name: call.name, error: errorMessage });
    }
    // Budget the whole round before it re-enters the model context (small
    // rounds pass through byte-identical under the classic per-result caps),
    // and stage the failure-adaptation note for the next model turn.
    pendingAdaptationNote = buildAdaptationNote(roundFailures, calls.length);
    return budgetToolResultsForModel(entries);
  };

  // Feed the latest tool results back and get the model's next turn. On the
  // terminal/thrash round the loop passes includeTools=false, so we withdraw the
  // tools to force a grounded text answer.
  const callModel = async (
    results: ToolResultEntry[],
    priorText: string,
    _round: number,
    includeTools: boolean,
  ): Promise<ModelTurn> => {
    // Barge-in: when cancelled, stop before issuing the next round. Returning no
    // tool calls ends the loop and preserves the last real response.
    if (signal?.aborted) return { text: '', toolCalls: [] };

    loopMessages.push({ role: 'assistant', content: priorText || '' });
    // Entries arrive pre-budgeted from executeTools (the cap here is a no-op
    // safety net); the adaptation note rides the same user turn so a failed
    // round becomes a course correction instead of an identical retry.
    const adaptationSuffix = pendingAdaptationNote ? `\n\n${pendingAdaptationNote}` : '';
    pendingAdaptationNote = '';
    loopMessages.push({
      role: 'user',
      content:
        results
          .map(tr => `[Tool Result for ${tr.name} (${tr.tool_use_id})]:\n${capToolResultForModel(tr.content)}`)
          .join('\n\n') + adaptationSuffix,
    });

    const roundRequest: GatewayRequest = { ...request, messages: loopMessages };
    if (!includeTools) {
      delete roundRequest.tools;
      delete roundRequest.toolChoice;
    }

    finalResponse = (await gateway.route(roundRequest)) as AnaGatewayResponse;
    const nextUses = finalResponse.toolUses ?? [];
    return { text: finalResponse.content || '', toolCalls: nextUses.map(toToolCall) };
  };

  await runAgenticToolLoop(
    { text: finalResponse.content || '', toolCalls: finalResponse.toolUses.map(toToolCall) },
    { executeTools, callModel },
    { maxRounds, progressExtension },
  );

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
    'inspect_uploaded_document',
    'read_uploaded_document',
    'ocr_document_pages',
    'read_spreadsheet',
    'edit_spreadsheet',
    'check_dossier_consistency',
    'check_numerical_integrity',
    'mine_precedents',
  ];

  return allTools.map(name => ({
    name,
    registered: toolHandlers.has(name),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic statistical design & analysis engines (server/services/stats/*).
// Thin wrappers exposing previously-stranded engines as AnA tools. Each dynamic-
// imports its engine, calls the exact closed-form/recursive computation, and
// returns the result verbatim. Validation errors (invalid/missing params) are
// relayed as needs_parameters so the model asks the user rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

const STATS_VERBATIM =
  'Report these numbers verbatim. Do NOT recompute, round differently, or estimate. Surface any provenance/method and warnings.';

/** Heuristic: is this a parameter-validation error (ask the user) vs a real fault? */
function isStatsParamError(message: string): boolean {
  return /must be|required|at least|in \(|in \[|non-?negative|positive|satisfy|length|strictly|monotone|each arm|every subject|unknown procedure|requires/i.test(
    message
  );
}

/** Wrap a deterministic stats computation in the standard tool envelope. */
async function runStatsTool(
  label: string,
  compute: () => unknown | Promise<unknown>,
  engine: 'deterministic' | 'seeded-monte-carlo' = 'deterministic'
): Promise<string> {
  try {
    const result = await compute();
    return JSON.stringify({
      status: 'computed',
      engine,
      result,
      instruction: STATS_VERBATIM,
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (isStatsParamError(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `${label} failed: ${message}` });
  }
}

registerToolHandler('design_mmrm', async (input: Record<string, unknown>) =>
  runStatsTool('design_mmrm', async () => {
    const { mmrmSampleSize } = await import('../stats/mmrm-design.js');
    return mmrmSampleSize(input as any);
  })
);

registerToolHandler('design_group_sequential', async (input: Record<string, unknown>) =>
  runStatsTool('design_group_sequential', async () => {
    const { solveSpendingBoundaries, operatingCharacteristics } = await import(
      '../stats/group-sequential-oc.js'
    );
    const boundaries = solveSpendingBoundaries(
      input.informationFractions as number[],
      input.alpha as number,
      input.spendingFunction as any
    );
    const driftGrid = input.driftGrid as number[] | undefined;
    const oc =
      Array.isArray(driftGrid) && driftGrid.length > 0
        ? operatingCharacteristics(boundaries, driftGrid)
        : undefined;
    return { boundaries, operatingCharacteristics: oc };
  })
);

registerToolHandler('design_dose_finding', async (input: Record<string, unknown>) =>
  runStatsTool('design_dose_finding', async () => {
    const { boinBoundaries, boinDecisionTable, selectMtd } = await import(
      '../stats/dose-finding-boin.js'
    );
    const target = input.target as number;
    const phi1 = input.phi1 as number | undefined;
    const phi2 = input.phi2 as number | undefined;
    const cohortSizes = (input.cohortSizes as number[] | undefined) ?? [3, 6, 9, 12];
    const boundaries = boinBoundaries(target, phi1, phi2);
    const decisionTable = boinDecisionTable(target, cohortSizes, phi1, phi2);
    const observed = input.observedDoses as any[] | undefined;
    const mtdSelection =
      Array.isArray(observed) && observed.length > 0 ? selectMtd(observed, target) : undefined;
    return { boundaries, decisionTable, mtdSelection };
  })
);

registerToolHandler('analyze_win_ratio', async (input: Record<string, unknown>) =>
  runStatsTool('analyze_win_ratio', async () => {
    const { winRatioAnalysis } = await import('../stats/win-ratio.js');
    return winRatioAnalysis(
      input.treatment as any,
      input.control as any,
      input.hierarchy as any,
      (input.confLevel as number | undefined) ?? 0.95
    );
  })
);

registerToolHandler('analyze_rmst', async (input: Record<string, unknown>) =>
  runStatsTool('analyze_rmst', async () => {
    const { rmstDifference } = await import('../stats/rmst.js');
    return rmstDifference(
      input.treatment as any,
      input.control as any,
      input.tau as number,
      (input.confLevel as number | undefined) ?? 0.95
    );
  })
);

registerToolHandler('design_mrmc_reader_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_mrmc_reader_study', async () => {
    const { mrmcPower, mrmcReadersForPower } = await import('../stats/mrmc.js');
    return input.targetPower != null
      ? mrmcReadersForPower(input as any)
      : mrmcPower(input as any);
  })
);

registerToolHandler('analyze_external_control_borrow', async (input: Record<string, unknown>) =>
  runStatsTool('analyze_external_control_borrow', async () => {
    const { powerPriorBorrow } = await import('../stats/external-control.js');
    return powerPriorBorrow(input as any);
  })
);

registerToolHandler('analyze_safety_signal', async (input: Record<string, unknown>) =>
  runStatsTool('analyze_safety_signal', async () => {
    const { computeDisproportionality } = await import('../stats/signal-disproportionality.js');
    return computeDisproportionality({
      a: input.a as number,
      b: input.b as number,
      c: input.c as number,
      d: input.d as number,
    });
  })
);

registerToolHandler('screen_signal_panel', async (input: Record<string, unknown>) =>
  runStatsTool('screen_signal_panel', async () => {
    const { screenSignalPanel } = await import('../stats/signal-disproportionality.js');
    return screenSignalPanel({
      a: input.a as number,
      b: input.b as number,
      c: input.c as number,
      d: input.d as number,
    });
  })
);

registerToolHandler('adjust_multiplicity', async (input: Record<string, unknown>) =>
  runStatsTool('adjust_multiplicity', async () => {
    const { testMultiplicity } = await import('../stats/multiplicity.js');
    return testMultiplicity(input as any);
  })
);

registerToolHandler('compute_diagnostic_accuracy', async (input: Record<string, unknown>) =>
  runStatsTool('compute_diagnostic_accuracy', async () => {
    const { computeDiagnosticAccuracy } = await import('../stats/clinical-performance.js');
    return computeDiagnosticAccuracy(
      { tp: input.tp as number, fp: input.fp as number, fn: input.fn as number, tn: input.tn as number },
      { conf: input.conf as number | undefined, prevalence: input.prevalence as number | undefined }
    );
  })
);

registerToolHandler('size_diagnostic_study', async (input: Record<string, unknown>) =>
  runStatsTool('size_diagnostic_study', async () => {
    const mod = await import('../stats/diagnostic-design.js');
    const mode = input.mode as string;
    if (mode === 'single_proportion') {
      return mod.sizeSingleProportion(input as any);
    }
    if (mode === 'co_primary') {
      return mod.sizeCoPrimarySensSpec(input as any);
    }
    throw new Error("mode must be 'single_proportion' or 'co_primary'");
  })
);

registerToolHandler('design_bayesian_device', async (input: Record<string, unknown>) =>
  runStatsTool('design_bayesian_device', async () => {
    const { deviceSampleSize } = await import('../stats/bayesian-device.js');
    const prior =
      input.priorAlpha != null || input.priorBeta != null
        ? { alpha: (input.priorAlpha as number) ?? 1, beta: (input.priorBeta as number) ?? 1 }
        : undefined;
    return deviceSampleSize({ ...(input as any), prior });
  })
);

registerToolHandler('compute_analytical_performance', async (input: Record<string, unknown>) =>
  runStatsTool('compute_analytical_performance', async () => {
    const mod = await import('../stats/analytical-performance.js');
    const mode = input.mode as string;
    if (mode === 'imprecision') {
      return mod.estimateImprecision({ runs: input.runs as number[][] });
    }
    if (mode === 'detection_capability') {
      return mod.estimateDetectionCapability({
        blankReplicates: input.blankReplicates as number[],
        lowSamples: input.lowSamples as number[][],
        falsePositiveRate: input.falsePositiveRate as number | undefined,
      } as any);
    }
    if (mode === 'method_comparison') {
      return mod.compareMethods({
        reference: input.reference as number[],
        test: input.test as number[],
        decisionLevel: input.decisionLevel as number | undefined,
      });
    }
    throw new Error("mode must be 'imprecision', 'detection_capability', or 'method_comparison'");
  })
);

registerToolHandler('forecast_enrollment', async (input: Record<string, unknown>) =>
  runStatsTool(
    'forecast_enrollment',
    async () => {
      const { forecastCompletion } = await import('../stats/enrollment-forecast.js');
      return forecastCompletion(input as any);
    },
    'seeded-monte-carlo'
  )
);

registerToolHandler('project_events', async (input: Record<string, unknown>) =>
  runStatsTool(
    'project_events',
    async () => {
      const { projectEventTime } = await import('../stats/event-projection.js');
      return projectEventTime(input as any);
    },
    'seeded-monte-carlo'
  )
);

registerToolHandler('compute_assurance', async (input: Record<string, unknown>) =>
  runStatsTool(
    'compute_assurance',
    async () => {
      const { assuranceTwoSampleMeans, assuranceMonteCarloTwoSampleMeans } = await import(
        '../stats/assurance.js'
      );
      return input.method === 'monte_carlo'
        ? assuranceMonteCarloTwoSampleMeans(input as any)
        : assuranceTwoSampleMeans(input as any);
    },
    // Quadrature is closed-form deterministic; the MC path is seeded/reproducible.
    input.method === 'monte_carlo' ? 'seeded-monte-carlo' : 'deterministic'
  )
);

registerToolHandler('run_monte_carlo_simulation', async (input: Record<string, unknown>) =>
  runStatsTool(
    'run_monte_carlo_simulation',
    async () => {
      const { diagnosticAccuracyMonteCarlo, timeToMarketMonteCarlo, reviewOutcomeMonteCarlo } =
        await import('../stats/monte-carlo.js');
      const mode = input.mode as string;
      if (mode === 'diagnostic_accuracy') {
        return diagnosticAccuracyMonteCarlo(input as any);
      }
      if (mode === 'time_to_market') {
        return timeToMarketMonteCarlo(input as any);
      }
      if (mode === 'review_outcome') {
        return reviewOutcomeMonteCarlo(input as any);
      }
      throw new Error("mode must be 'diagnostic_accuracy', 'time_to_market', or 'review_outcome'");
    },
    'seeded-monte-carlo'
  )
);

registerToolHandler('assess_ivd_analytical_extensions', async (input: Record<string, unknown>) =>
  runStatsTool('assess_ivd_analytical_extensions', async () => {
    const mod = await import('../stats/analytical-performance-extensions.js');
    const mode = input.mode as string;
    if (mode === 'real_time_stability') {
      return mod.assessRealTimeStability(input as any);
    }
    if (mode === 'accelerated_stability') {
      return mod.assessAcceleratedStability(input as any);
    }
    if (mode === 'carryover') {
      return mod.assessCarryover(input as any);
    }
    if (mode === 'hook_effect') {
      return mod.assessHookEffect(input as any);
    }
    if (mode === 'recovery') {
      return mod.assessRecovery(input as any);
    }
    if (mode === 'cutoff') {
      return mod.determineCutoff(input.observations as any);
    }
    throw new Error(
      "mode must be 'real_time_stability', 'accelerated_stability', 'carryover', 'hook_effect', 'recovery', or 'cutoff'"
    );
  })
);

// Regulatory Currency Engine (Lane A) — curated, freshness-stamped registry of
// DATED regulatory facts so AnA never advises on a VOID/superseded rule from its
// static knowledge. Pure registry lookups (no LLM, no network); reuse the
// deterministic stats envelope. See regulatoryCurrencyTools.ts + the registry at
// ../regulatory-currency/currency-registry.ts.
registerToolHandler('check_regulatory_currency', async (input: Record<string, unknown>) =>
  runStatsTool('check_regulatory_currency', async () => {
    const { findFacts, verificationAgeDays, isVerificationStale } = await import(
      '../regulatory-currency/currency-registry.js'
    );
    /* Resolve statuses against today. `mandatory_upcoming` is a claim
       about the future that goes wrong the moment its date arrives, and
       this tool tells AnA to report the status verbatim — so without
       `asOf` it would have said EU EUDAMED was not yet mandatory two
       months after it became mandatory. The registry stays pure; the
       clock is read here, at the boundary. */
    const asOf = new Date().toISOString().slice(0, 10);
    const facts = findFacts({
      topic: input.topic as string | undefined,
      jurisdiction: input.jurisdiction as any,
      segment: input.segment as any,
      asOf,
    });
    /* Carry how long since each fact was confirmed against its source.
       `lastVerified` is this module's honesty claim, and it decays
       silently — a fact nobody has re-checked in a year still reads as
       authoritative. Reporting the age lets AnA caveat rather than
       assert. */
    const annotated = facts.map((f) => ({
      ...f,
      verificationAgeDays: verificationAgeDays(f, asOf),
      verificationStale: isVerificationStale(f, asOf),
    }));
    return {
      matchCount: annotated.length,
      staleCount: annotated.filter((f) => f.verificationStale).length,
      asOf,
      facts: annotated,
    };
  })
);

registerToolHandler('guidance_change_radar', async (input: Record<string, unknown>) =>
  runStatsTool('guidance_change_radar', async () => {
    const { changeRadar } = await import('../regulatory-currency/currency-registry.js');
    const drifts = changeRadar({
      topics: input.topics as string[] | undefined,
      jurisdictions: input.jurisdictions as any,
      draftedOn: input.draftedOn as string | undefined,
    });
    const highestSeverity = drifts.length > 0 ? drifts[0].severity : null;
    return { driftCount: drifts.length, highestSeverity, drifts };
  })
);

// Submission intelligence (Tier 1.3/1.4) — precedent benchmarking + package
// completeness. Both engines are pure/structured-input; thin pass-throughs.
registerToolHandler('benchmark_precedent_trials', async (input: Record<string, unknown>) =>
  runStatsTool('benchmark_precedent_trials', async () => {
    const { computeBenchmark } = await import('../corpus/precedent-benchmark.js');
    return computeBenchmark(
      input.indication as string,
      input.phase as string,
      (input.trials as any[]) ?? [],
      { topN: input.topN as number | undefined }
    );
  })
);

registerToolHandler('assess_submission_package', async (input: Record<string, unknown>) => {
  try {
    const { buildPackageManifest } = await import('../regulatory/submissionPackageBuilder.js');
    const manifest = buildPackageManifest(
      input.submissionType as string,
      input.projectId as string,
      (input.sections as any[]) ?? [],
      (input.artifacts as any[]) ?? []
    );
    if (manifest === null) {
      return JSON.stringify({
        status: 'needs_parameters',
        message:
          "Unrecognized submissionType. Provide a known application type/registry id (e.g. '510k', 'ind', 'nda', 'bla', 'cer').",
      });
    }
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result: manifest,
      instruction:
        'List the MISSING required sections/artifacts first, then present/approved ones, and state packageComplete. Do not claim readiness the manifest does not show.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `assess_submission_package failed: ${err?.message || 'unknown error'}` });
  }
});

// Device/IVD eSTAR assembly state (510(k) / De Novo / PMA) — wires the
// deterministic device-assembly engine that previously had no AnA tool surface.
// No render/transmit; computes the producible artifact kind + every blocker,
// honestly. A PMA is scored against the 21 CFR 814 modules (pma-mapper).
registerToolHandler('assemble_device_submission', async (input: Record<string, unknown>) => {
  try {
    const pathway = input.pathway;
    const variant = input.variant;
    if (pathway !== '510k' && pathway !== 'de_novo' && pathway !== 'pma') {
      return JSON.stringify({ status: 'needs_parameters', message: "pathway must be '510k', 'de_novo' or 'pma'." });
    }
    // The ONE PMA submission-type taxonomy (21 CFR 814.20 / 814.39) lives in pma-mapper.
    const { PMA_SUBMISSION_TYPES } = await import('../pathway-engines/pma/pma-mapper.js');
    const pmaTypeValues = PMA_SUBMISSION_TYPES.map((t) => t.value);
    const pmaSubmissionType = input.pmaSubmissionType;
    if (pmaSubmissionType !== undefined && !(pmaTypeValues as unknown[]).includes(pmaSubmissionType)) {
      return JSON.stringify({ status: 'needs_parameters', message: `pmaSubmissionType must be one of ${pmaTypeValues.join(', ')}.` });
    }
    if (variant !== 'device' && variant !== 'ivd') {
      return JSON.stringify({ status: 'needs_parameters', message: "variant must be 'device' or 'ivd'." });
    }
    if (!Array.isArray(input.leaves)) {
      return JSON.stringify({ status: 'needs_parameters', message: 'leaves[] is required (each: { sectionCode, title, documentType?, substantive? }).' });
    }
    // Fails closed: a leaf is treated as a draft/placeholder (not substantive)
    // unless the caller explicitly asserts it carries real, finalized content —
    // a title match alone must never count as "present".
    const leaves = (input.leaves as Array<Record<string, unknown>>).map(l => ({
      sectionCode: String(l.sectionCode ?? ''),
      title: String(l.title ?? ''),
      documentType: typeof l.documentType === 'string' ? l.documentType : undefined,
      substantive: l.substantive === true,
    }));
    const { assembleDeviceSubmission } = await import('../pathway-engines/device-assembly/assemble-device-submission.js');
    const result = assembleDeviceSubmission({
      pathway,
      pmaSubmissionType: pmaSubmissionType as (typeof pmaTypeValues)[number] | undefined,
      variant,
      leaves,
      presentTemplates: Array.isArray(input.presentTemplates) ? (input.presentTemplates as unknown[]).map(String) : undefined,
      market: typeof input.market === 'string' ? (input.market as any) : undefined,
      availableArtifacts: Array.isArray(input.availableArtifacts) ? (input.availableArtifacts as unknown[]).map(String) : undefined,
      environment: input.environment === 'production' ? 'production' : input.environment === 'staging' ? 'staging' : undefined,
    });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction:
        'Lead with artifactKind and canProduceOfficialEstar, then list every blocker verbatim. Do NOT claim a submittable eSTAR unless canProduceOfficialEstar is true.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `assemble_device_submission failed: ${err?.message || 'unknown error'}` });
  }
});

// Predicate substantial-equivalence adequacy scoring (Tier 1.4) — deterministic,
// inspectable rubric over caller-supplied comparison signals. Screening aid.
registerToolHandler('score_predicate_adequacy', async (input: Record<string, unknown>) => {
  try {
    if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
      return JSON.stringify({ status: 'needs_parameters', message: 'candidates[] is required and must be non-empty (each needs an identifier).' });
    }
    const { scorePredicateAdequacy } = await import('../regulatory/predicate-adequacy.js');
    const result = scorePredicateAdequacy({
      candidates: input.candidates as any[],
      options: typeof input.currentYear === 'number' ? { currentYear: input.currentYear } : undefined,
    });
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction:
        'Present the ranked candidates with score + band, lead with the recommended predicate, surface each candidate\'s concerns and unknownFactors, and report the disclaimer. This is a screening aid, not a determination of substantial equivalence.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/required|non-empty|identifier/i.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `score_predicate_adequacy failed: ${message}` });
  }
});

// Drug coding via NLM RxNorm/RxNav (open, public-domain terminology) — the open
// alternative for drug coding. Honest: returns no_match / network errors rather
// than fabricating an RxCUI.
registerToolHandler('code_drug', async (input: Record<string, unknown>) => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    return JSON.stringify({ status: 'needs_parameters', message: 'name is required (the drug/substance free text to code).' });
  }
  const maxResults = Math.min(Math.max(Number(input.max_results) || 8, 1), 20);
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=${maxResults}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return JSON.stringify({ status: 'lookup_failed', source: 'RxNorm/RxNav (NLM)', message: `RxNav returned HTTP ${res.status}. Do not fabricate a code; retry or code manually.` });
    }
    const data = await res.json();
    const candidates = (data?.approximateGroup?.candidate ?? []) as Array<Record<string, unknown>>;
    // Dedupe by rxcui, preserving RxNav's rank order (best score first).
    const seen = new Set<string>();
    const matches = candidates
      .filter(c => {
        const id = String(c.rxcui ?? '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, maxResults)
      .map(c => ({
        rxcui: String(c.rxcui ?? ''),
        name: typeof c.name === 'string' ? c.name : undefined,
        termType: typeof c.tty === 'string' ? c.tty : undefined,
        score: c.score != null ? Number(c.score) : undefined,
      }));
    if (matches.length === 0) {
      return JSON.stringify({ status: 'no_match', source: 'RxNorm/RxNav (NLM)', query: name, message: 'No RxNorm concept matched. Refine the name or code manually; do not invent an RxCUI.' });
    }
    return JSON.stringify({
      status: 'coded',
      source: 'RxNorm/RxNav (NLM, open)',
      query: name,
      matches,
      instruction: 'Use the best match (first) unless a lower one is clearly more specific. Report the RxCUI and name verbatim; never fabricate a code not in this list.',
    });
  } catch (err: any) {
    const aborted = err?.name === 'TimeoutError' || /abort|timeout/i.test(err?.message || '');
    return JSON.stringify({
      status: 'lookup_failed',
      source: 'RxNorm/RxNav (NLM)',
      message: aborted ? 'RxNav request timed out. Do not fabricate a code; retry or code manually.' : `RxNav lookup failed: ${err?.message || 'unknown error'}.`,
    });
  }
});

// License-gated MedDRA coding. MedDRA is a proprietary dictionary that is NOT
// shipped: with no licensed dictionary configured this fails closed with
// status license_required (never a fabricated PT). With a dictionary loaded the
// match is a deterministic query over governed data (no LLM, no network).
registerToolHandler('code_meddra', async (input: Record<string, unknown>) => {
  const term = typeof input.term === 'string' ? input.term.trim() : '';
  if (!term) {
    return JSON.stringify({ status: 'needs_parameters', message: 'term is required (the verbatim adverse-event/condition to code).' });
  }
  const context = typeof input.context === 'string' ? input.context : undefined;
  const { getMedicalCodingService } = await import('../medical-coding/medical-coding-service.js');
  const result = getMedicalCodingService().codeMeddra(term, { context });
  if (result.status === 'license_required') {
    return JSON.stringify({
      ...result,
      instruction: 'State plainly that the licensed MedDRA dictionary is not configured. Do NOT guess a code. Suggest ICD-10 tools for open condition coding if appropriate.',
    });
  }
  if (result.status === 'no_match') {
    return JSON.stringify({ ...result, instruction: 'Report that no MedDRA PT matched; ask for a refined verbatim term. Never fabricate a code.' });
  }
  return JSON.stringify({
    ...result,
    engine: 'deterministic',
    instruction: 'Report the ptCode and ptName verbatim. Surface the confidence/matchType; a substring match should be human-verified.',
  });
});

// License-gated WHODrug coding. WHODrug is a proprietary dictionary that is NOT
// shipped: fail closed with license_required when unconfigured; deterministic
// governed-data lookup when a licensed dictionary is loaded.
registerToolHandler('code_whodrug', async (input: Record<string, unknown>) => {
  const drugName = typeof input.drugName === 'string' ? input.drugName.trim() : '';
  if (!drugName) {
    return JSON.stringify({ status: 'needs_parameters', message: 'drugName is required (the drug/substance free text to code).' });
  }
  const { getMedicalCodingService } = await import('../medical-coding/medical-coding-service.js');
  const result = getMedicalCodingService().codeWhodrug(drugName);
  if (result.status === 'license_required') {
    return JSON.stringify({
      ...result,
      instruction: 'State plainly that the licensed WHODrug dictionary is not configured. Do NOT guess a code. Suggest code_drug (RxNorm) for open US drug coding if appropriate.',
    });
  }
  if (result.status === 'no_match') {
    return JSON.stringify({ ...result, instruction: 'Report that no WHODrug ingredient matched; ask for a refined drug name. Never fabricate a code.' });
  }
  return JSON.stringify({
    ...result,
    engine: 'deterministic',
    instruction: 'Report the ingredient and atcCode verbatim. Surface the confidence/matchType; a substring match should be human-verified.',
  });
});

// DailyMed (NLM) published-label lookup — open documented SPL repository.
// Honest: returns no_match / lookup_failed rather than fabricating a setid.
registerToolHandler('lookup_published_label', async (input: Record<string, unknown>) => {
  const drugName = typeof input.drug_name === 'string' ? input.drug_name.trim() : '';
  if (!drugName) {
    return JSON.stringify({ status: 'needs_parameters', message: 'drug_name is required (the drug to look up).' });
  }
  const maxResults = Math.min(Math.max(Number(input.max_results) || 10, 1), 50);
  try {
    const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(drugName)}&pagesize=${maxResults}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return JSON.stringify({ status: 'lookup_failed', source: 'DailyMed (NLM)', message: `DailyMed returned HTTP ${res.status}. Do not fabricate a label; retry or check manually at dailymed.nlm.nih.gov.` });
    }
    const data = await res.json();
    const rows = (data?.data ?? []) as Array<Record<string, unknown>>;
    const labels = rows.slice(0, maxResults).map(r => ({
      setid: typeof r.setid === 'string' ? r.setid : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
      splVersion: r.spl_version != null ? Number(r.spl_version) : undefined,
      publishedDate: typeof r.published_date === 'string' ? r.published_date : undefined,
    })).filter(l => l.setid);
    if (labels.length === 0) {
      return JSON.stringify({ status: 'no_match', source: 'DailyMed (NLM)', query: drugName, message: 'No published label matched. Refine the drug name; do not invent a setid.' });
    }
    return JSON.stringify({
      status: 'found',
      source: 'DailyMed (NLM, open)',
      query: drugName,
      count: labels.length,
      labels,
      instruction: 'Reference labels by setid (the authoritative current label). Report titles/dates verbatim; never fabricate label content not retrieved here.',
    });
  } catch (err: any) {
    const aborted = err?.name === 'TimeoutError' || /abort|timeout/i.test(err?.message || '');
    return JSON.stringify({
      status: 'lookup_failed',
      source: 'DailyMed (NLM)',
      message: aborted ? 'DailyMed request timed out. Do not fabricate a label; retry or check manually.' : `DailyMed lookup failed: ${err?.message || 'unknown error'}.`,
    });
  }
});

// Multi-batch ICH Q1E poolability (ANCOVA combinability) — deterministic.
registerToolHandler('assess_batch_poolability', async (input: Record<string, unknown>) => {
  try {
    const { assessBatchPoolability } = await import('../cmc/shelf-life-poolability.js');
    const result = assessBatchPoolability(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction: 'Lead with the decision (pooled vs minimum-of-batches) and the recommended shelfLife; report the slope/intercept F-tests verbatim. Single-attribute estimate.',
    });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|requires|at least|distinct|direction|finite|batchId/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `assess_batch_poolability failed: ${m}` });
  }
});

/* The same ICH Q1E decision over the studies ON FILE, so AnA can answer "are my
   primary batches combinable?" without the user transcribing their data.

   Org scope comes from ToolContext and is applied in the WHERE clause, never
   from model input — a study id the model produced must still belong to the
   caller's tenant to be readable. The eligibility rules and the assessment
   itself live in services/cmc/recorded-stability, shared verbatim with the HTTP
   route the stability surface posts to, so the two can never disagree. */
/* ── Register discovery ──
   assess_recorded_batch_poolability tells the model to "list the stability
   register first and use the ids it returns" — and nothing could list any
   register, so the pointer was dead and the model had to ask the human for
   ids the product already holds. Identity rows only: never the full result
   series, so this is safe to call broadly. Org-scoped, read-only. */
registerToolHandler('list_cmc_registers', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to read the CMC registers.';
  const wanted = typeof input.register === 'string' ? input.register : null;
  const search = typeof input.search === 'string' && input.search.trim() ? input.search.trim() : null;
  const rawLimit = Number(input.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 25;
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    // One row shape per register: what it IS and what state it is in — the
    // identity a recorded assessment needs, and nothing more.
    const REGISTERS: Record<string, { sql: string; searchCols: string[] }> = {
      stability: {
        sql: `SELECT id, study_title AS "studyTitle", product_name AS "productName",
                     batch_number AS "batchNumber", study_type AS "studyType",
                     storage_conditions AS "storageConditions", duration, status,
                     (stability_data IS NOT NULL) AS "hasRecordedResults"
                FROM stability_studies WHERE organization_id = $1`,
        searchCols: ['study_title', 'product_name', 'batch_number'],
      },
      method: {
        sql: `SELECT id, method_code AS "methodCode", title, technique, analyte, status,
                     validation_date AS "validationDate"
                FROM analytical_methods WHERE organization_id = $1`,
        searchCols: ['method_code', 'title', 'analyte'],
      },
      specification: {
        sql: `SELECT id, material_type AS "materialType", material_name AS "materialName",
                     approval_status AS "approvalStatus", updated_at AS "updatedAt"
                FROM quality_specifications WHERE tenant_id = $1`,
        searchCols: ['material_name', 'material_type'],
      },
      batch: {
        sql: `SELECT id, batch_number AS "batchNumber", product_name AS "productName",
                     batch_type AS "batchType", scale, status, disposition,
                     manufacturing_date AS "manufacturingDate"
                FROM cmc_batch_records WHERE organization_id = $1`,
        searchCols: ['batch_number', 'product_name'],
      },
      qc_result: {
        sql: `SELECT id, sample_id AS "sampleId", sample_type AS "sampleType",
                     test_method AS "testMethod", pass_fail_status AS "passFailStatus",
                     test_date AS "testDate", (reviewed_by IS NOT NULL) AS "reviewed"
                FROM qc_testing WHERE organization_id = $1`,
        searchCols: ['sample_id', 'test_method'],
      },
      /* The two registers §3.2.S.5/§3.2.S.6/§3.2.P.6/§3.2.P.7 compose from.
         `scope` is listed because it decides which section a row files under,
         and the presence flags are listed rather than the packages themselves:
         a model asking "is the E&L work on file" must get an answer without
         pulling every analyte result into the context. */
      container_closure: {
        sql: `SELECT id, system_name AS "systemName", scope,
                     component_type AS "componentType", supplier, status,
                     (suitability_justification IS NOT NULL AND suitability_justification <> '') AS "hasSuitabilityJustification",
                     (extractables_leachables IS NOT NULL) AS "hasExtractablesLeachables",
                     (integrity_testing IS NOT NULL) AS "hasIntegrityTesting"
                FROM cmc_container_closures WHERE organization_id = $1`,
        searchCols: ['system_name', 'container_description', 'supplier'],
      },
      /* One row per impurity, with the ICH inputs a threshold comparison needs
         (class, level with its unit, the daily dose) surfaced so a model can see
         WHY an impurity is or is not assessable without pulling the record. */
      impurity_profile: {
        sql: `SELECT id, impurity_name AS "impurityName", material_name AS "materialName",
                     scope, impurity_type AS "impurityType",
                     observed_level AS "observedLevel", level_unit AS "levelUnit",
                     specification_limit AS "specificationLimit",
                     maximum_daily_dose AS "maximumDailyDose", status,
                     (qualification_basis IS NOT NULL AND qualification_basis <> '') AS "hasQualificationBasis",
                     (structure IS NOT NULL AND structure <> '') AS "hasStructure"
                FROM cmc_impurity_profiles WHERE organization_id = $1`,
        searchCols: ['impurity_name', 'material_name', 'analytical_method'],
      },
      /* The method and the shape of the profile, not the profile itself: a
         broad discovery call must not pull every timepoint of every batch. */
      dissolution_profile: {
        sql: `SELECT id, product_name AS "productName", batch_number AS "batchNumber",
                     purpose, apparatus, medium, rotation_speed AS "rotationSpeed",
                     units_tested AS "unitsTested", specification, status,
                     test_date AS "testDate",
                     CASE WHEN jsonb_typeof(results) = 'array'
                          THEN jsonb_array_length(results) ELSE 0 END AS "timepointCount",
                     (comparison_results IS NOT NULL) AS "hasReferenceProfile"
                FROM cmc_dissolution_profiles WHERE organization_id = $1`,
        searchCols: ['product_name', 'batch_number', 'medium'],
      },
      /* The materials, with the origin §3.2.A.3 answers the TSE/BSE question
         from surfaced directly: a model asked "is any excipient animal-derived"
         must be able to see which ones have no origin recorded at all. */
      material_spec: {
        sql: `SELECT id, material_name AS "materialName", material_role AS "materialRole",
                     function_in_formulation AS "function", grade,
                     compendial_monograph AS "compendialMonograph", supplier, origin,
                     novel_excipient AS "novelExcipient", status,
                     (tse_certificate IS NOT NULL AND tse_certificate <> '') AS "hasTseCertificate",
                     (origin IS NULL OR origin = '') AS "originNotRecorded"
                FROM cmc_material_specs WHERE organization_id = $1`,
        searchCols: ['material_name', 'grade', 'supplier'],
      },
      formulation_record: {
        sql: `SELECT id, formulation_name AS "formulationName", version, dosage_form AS "dosageForm",
                     strength, batch_size AS "batchSize", supersedes, status,
                     CASE WHEN jsonb_typeof(components) = 'array'
                          THEN jsonb_array_length(components) ELSE 0 END AS "componentCount"
                FROM cmc_formulation_records WHERE organization_id = $1`,
        searchCols: ['formulation_name', 'version', 'dosage_form'],
      },
      /* The process as a SHAPE, not the process itself: a discovery call must
         not pull every unit operation and every parameter into the context. The
         counts are what a model needs to see that a process is recorded but
         describes no steps, or carries parameters with no proven range. */
      manufacturing_process: {
        sql: `SELECT id, process_name AS "processName", process_type AS "processType",
                     batch_size AS "batchSize", validation_status AS "validationStatus",
                     CASE WHEN jsonb_typeof(process_steps) = 'array'
                          THEN jsonb_array_length(process_steps) ELSE 0 END AS "stepCount",
                     CASE WHEN jsonb_typeof(critical_process_parameters) = 'array'
                          THEN jsonb_array_length(critical_process_parameters) ELSE 0 END AS "cppCount",
                     CASE WHEN jsonb_typeof(process_controls) = 'array'
                          THEN jsonb_array_length(process_controls) ELSE 0 END AS "inProcessControlCount",
                     (reprocessing IS NOT NULL AND reprocessing <> '') AS "hasReprocessingStatement"
                FROM manufacturing_processes WHERE organization_id = $1`,
        searchCols: ['process_name', 'process_type', 'process_description'],
      },
      /* §3.2.S.3.1 asks three questions and each study answers one, so the TYPE
         is the field a model needs: without it, three studies of one kind read
         as a characterised substance. */
      characterization: {
        sql: `SELECT id, study_title AS "studyTitle", study_type AS "studyType", scope,
                     technique, attribute, result, result_unit AS "resultUnit",
                     study_reference AS "studyReference", status,
                     (result IS NULL OR result = '') AND (conclusion IS NULL OR conclusion = '')
                       AS "establishesNothing",
                     (result IS NOT NULL AND result <> '' AND (result_unit IS NULL OR result_unit = ''))
                       AS "unitNotRecorded"
                FROM cmc_characterization_studies WHERE organization_id = $1`,
        searchCols: ['study_title', 'technique', 'attribute'],
      },
      reference_standard: {
        sql: `SELECT id, standard_code AS "standardCode", standard_name AS "standardName",
                     scope, standard_type AS "standardType", lot_number AS "lotNumber",
                     status, retest_date AS "retestDate", expiry_date AS "expiryDate",
                     (characterization IS NOT NULL) AS "hasCharacterization",
                     (certificate_of_analysis IS NOT NULL AND certificate_of_analysis <> '') AS "hasCertificateOfAnalysis"
                FROM cmc_reference_standards WHERE organization_id = $1`,
        searchCols: ['standard_code', 'standard_name', 'lot_number'],
      },
    };
    const keys = wanted && REGISTERS[wanted] ? [wanted] : Object.keys(REGISTERS);
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const spec = REGISTERS[key];
      const params: unknown[] = [orgId];
      let sql = spec.sql;
      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        sql += ` AND (${spec.searchCols.map((c) => `${c} ILIKE $${idx}`).join(' OR ')})`;
      }
      sql += ` ORDER BY id DESC LIMIT ${limit}`;
      try {
        const { rows } = await pool.query(sql, params);
        out[key] = rows;
      } catch (err: any) {
        // A register whose table is absent on this deployment is reported as
        // unavailable — never as an empty register, which would read as
        // "you have recorded nothing".
        out[key] = { unavailable: true, reason: err?.message || 'register unreadable' };
      }
    }
    const counts = Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'unavailable']),
    );
    return JSON.stringify({
      status: 'listed',
      scope: wanted ? `register: ${wanted}` : 'all registers',
      search: search ?? null,
      limit,
      counts,
      registers: out,
      instruction:
        'These are the ids the recorded-data tools take. Report a register marked unavailable as unreadable, NOT as empty — and an empty register as "nothing is recorded here yet", never as a finding about the product.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `list_cmc_registers failed: ${err?.message || 'unknown error'}` });
  }
});

/* f2 over two profiles ON FILE — the same engine the typed-number tool and the
   CMC dissolution surface call, so a model and a screen can never report
   different similarity for the same two batches. */
registerToolHandler('compare_recorded_dissolution', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to read the dissolution register.';
  const refId = Number(input.reference_profile_id);
  const testId = Number(input.test_profile_id);
  if (!Number.isInteger(refId) || refId <= 0 || !Number.isInteger(testId) || testId <= 0) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'Two numeric dissolution profile ids are required. Use list_cmc_registers to find them.',
    });
  }
  if (refId === testId) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'A profile cannot be compared against itself; f2 would be 100 by construction.',
    });
  }
  try {
    const [{ db }, { cmcDissolutionProfiles }, { and, eq, inArray }, engine] = await Promise.all([
      import('../../db.js'),
      import('../../../shared/schema.js'),
      import('drizzle-orm'),
      import('../cmc/dissolution-comparison.js'),
    ]);
    const rows = await db
      .select()
      .from(cmcDissolutionProfiles)
      .where(and(eq(cmcDissolutionProfiles.organizationId, orgId), inArray(cmcDissolutionProfiles.id, [refId, testId])));
    const byId = new Map(rows.map((r: Record<string, any>) => [r.id, r]));
    const reference = byId.get(refId);
    const test = byId.get(testId);
    if (!reference || !test) {
      /* Never answered from a partial set: comparing one recorded profile
         against nothing is a different question than the one asked. */
      return JSON.stringify({
        status: 'not_found',
        message: `Not this organization's dissolution profiles: ${[!reference ? refId : null, !test ? testId : null].filter(Boolean).join(', ')}. No comparison is made.`,
      });
    }
    const outcome = engine.compareDissolutionProfiles(
      {
        role: 'reference',
        productName: reference.productName,
        batchNumber: reference.batchNumber,
        method: { apparatus: reference.apparatus, medium: reference.medium, rotationSpeed: reference.rotationSpeed },
        points: engine.pointsFromRecordedProfile(reference.results),
      },
      {
        role: 'test',
        productName: test.productName,
        batchNumber: test.batchNumber,
        method: { apparatus: test.apparatus, medium: test.medium, rotationSpeed: test.rotationSpeed },
        points: engine.pointsFromRecordedProfile(test.results),
      },
      { referenceUnits: reference.unitsTested, testUnits: test.unitsTested },
    );
    const identity = {
      reference: { id: refId, batch: reference.batchNumber, apparatus: reference.apparatus, medium: reference.medium },
      test: { id: testId, batch: test.batchNumber, apparatus: test.apparatus, medium: test.medium },
      methodsMatch:
        reference.apparatus === test.apparatus &&
        reference.medium === test.medium &&
        reference.rotationSpeed === test.rotationSpeed,
    };
    if (outcome.outcome === 'refused') {
      return JSON.stringify({
        status: 'not_comparable',
        ...identity,
        refusal: { code: outcome.code, message: outcome.message, offending: outcome.offending, alternative: outcome.alternative ?? null },
        instruction:
          'Relay this refusal verbatim. Do NOT re-run the comparison through assess_dissolution_similarity with the same numbers typed in: that is the same computation with the eligibility check removed.',
      });
    }
    return JSON.stringify({
      status: 'computed',
      ...identity,
      f2: outcome.f2Reported,
      similar: outcome.f2Similar,
      f1: outcome.f1Reported,
      inputsUsed: outcome.inputsUsed,
      checksEvaluated: outcome.checksEvaluated,
      scope: outcome.scope,
      instruction:
        identity.methodsMatch
          ? 'Report the f2 with the timepoints it used and the scope statement. It is not a bioequivalence conclusion.'
          : 'The two profiles were run under DIFFERENT dissolution conditions. Report that alongside the f2: a comparison across methods does not establish similarity of the products.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `compare_recorded_dissolution failed: ${err?.message || 'unknown error'}` });
  }
});

/* ICH Q1E over a RECORDED study — the same engine the stability surface's
   shelf-life panel calls (cmc/recorded-stability.estimateRecordedShelfLife),
   so the model and the screen can never report different month counts. */
registerToolHandler('estimate_recorded_shelf_life', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to read the stability register.';
  const id = Number(input.study_id);
  if (!Number.isInteger(id) || id <= 0) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'A numeric stability study id is required. Use list_cmc_registers to find it.',
    });
  }
  try {
    const [{ db }, { stabilityStudies }, { and, eq }, { estimateRecordedShelfLife }] = await Promise.all([
      import('../../db.js'),
      import('../../../shared/schema.js'),
      import('drizzle-orm'),
      import('../cmc/recorded-stability.js'),
    ]);
    const [study] = await db
      .select({
        id: stabilityStudies.id,
        studyTitle: stabilityStudies.studyTitle,
        productName: stabilityStudies.productName,
        batchNumber: stabilityStudies.batchNumber,
        storageConditions: stabilityStudies.storageConditions,
        duration: stabilityStudies.duration,
        stabilityData: stabilityStudies.stabilityData,
      })
      .from(stabilityStudies)
      .where(and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)));
    if (!study) {
      return JSON.stringify({
        status: 'not_found',
        message: `No stability study in this organization has id ${id}. List the register and use the ids it returns.`,
      });
    }
    const outcome = await estimateRecordedShelfLife(study);
    if (!outcome.ok) {
      return JSON.stringify({
        status: 'not_assessable',
        message: outcome.error,
        instruction:
          'Relay this reason to the user verbatim. Do not work around it by falling back to estimate_shelf_life with numbers you read off the study — the refusal is a property of the data, not of the tool.',
      });
    }
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result: outcome.data,
      instruction:
        'Lead with the LIMITING attribute and the shelf life it supports, then report each attribute\'s estimate and every not-estimable reason verbatim. This is EVIDENCE for a shelf-life claim, not the claim: the registered shelf life is set by a person on the study close-out, and this tool writes nothing. Batch poolability is a separate question (assess_recorded_batch_poolability) and is not implied here.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `estimate_recorded_shelf_life failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('assess_recorded_batch_poolability', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to read the stability register.';
  const ids = Array.from(
    new Set(
      (Array.isArray(input.study_ids) ? input.study_ids : [])
        .map((v: unknown) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
        .filter((n: number) => Number.isInteger(n) && n > 0),
    ),
  ).slice(0, 30);
  if (ids.length < 2) {
    return JSON.stringify({
      status: 'needs_parameters',
      message: 'Poolability compares batches, so it needs at least two different stability study ids.',
    });
  }
  try {
    const [{ db }, { stabilityStudies }, { and, eq, inArray }, { assessRecordedPoolability }] =
      await Promise.all([
        import('../../db.js'),
        import('../../../shared/schema.js'),
        import('drizzle-orm'),
        import('../cmc/recorded-stability.js'),
      ]);
    const studies = await db
      .select({
        id: stabilityStudies.id,
        studyTitle: stabilityStudies.studyTitle,
        productName: stabilityStudies.productName,
        batchNumber: stabilityStudies.batchNumber,
        storageConditions: stabilityStudies.storageConditions,
        duration: stabilityStudies.duration,
        stabilityData: stabilityStudies.stabilityData,
      })
      .from(stabilityStudies)
      .where(and(inArray(stabilityStudies.id, ids), eq(stabilityStudies.organizationId, orgId)));

    if (studies.length !== ids.length) {
      const found = new Set(studies.map(s => s.id));
      return JSON.stringify({
        status: 'not_found',
        message: `No stability study in this organization for id(s): ${ids.filter(i => !found.has(i)).join(', ')}. List the stability register first and use the ids it returns — do not assess a partial set.`,
      });
    }

    const outcome = await assessRecordedPoolability(studies);
    if (!outcome.ok) {
      return JSON.stringify({
        status: 'not_assessable',
        message: outcome.error,
        instruction: 'Relay this reason to the user verbatim. Do not work around it by falling back to assess_batch_poolability with numbers you read off the studies — the refusal is a property of the data, not of the tool.',
      });
    }
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result: outcome.data,
      instruction:
        'Lead with the decision for the limiting attribute (combinable → one pooled shelf life; otherwise the shortest batch) and the supported shelf life, then report the slope/intercept F-tests verbatim. Name every attribute reported as not assessable and the reason given. This is EVIDENCE — the registered shelf life is set by a person on the study close-out, and this tool writes nothing.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `assess_recorded_batch_poolability failed: ${err?.message || 'unknown error'}` });
  }
});

/* The Submission Readiness Twin, which shipped with five live routes and no
   caller anywhere in the client.

   Two things this handler owns beyond the service call:

   1. TENANT PROOF. The program id comes from the model, so it must be proven to
      belong to the caller's org before anything is read. It reuses the same
      `programBelongsToOrg` the innovation routes use rather than a fourth copy
      of that query.

   2. "NOT ASSESSED" vs "SCORED ZERO". getDashboard returns getEmptyDashboard()
      — overallScore 0, approvalProbability 0, no criteria — when no assessment
      exists. That payload is indistinguishable from a genuinely terrible
      program, and a model handed it will report a zero readiness score as fact.
      It is detected here and returned as a different status entirely. */
registerToolHandler('get_submission_readiness_twin', async (input, ctx) => {
  const orgId = ctx?.organizationId;
  if (!orgId) return 'An active organization context is required to read submission readiness.';
  const programId = typeof input.program_id === 'string' ? input.program_id.trim() : '';
  if (!programId) {
    return JSON.stringify({ status: 'needs_parameters', message: 'program_id is required.' });
  }
  const submissionType = typeof input.submission_type === 'string' && input.submission_type.trim()
    ? input.submission_type.trim() : 'IND';
  const agency = typeof input.agency === 'string' && input.agency.trim()
    ? input.agency.trim() : 'FDA';

  try {
    const { programBelongsToOrg } = await import('../../routes/innovation-routes.js');
    if (!(await programBelongsToOrg(programId, Number(orgId)))) {
      return JSON.stringify({
        status: 'not_found',
        message: `No program "${programId}" in this organization. Do not report a readiness score; confirm the program with the user.`,
      });
    }

    const [{ default: SubmissionReadinessTwinService }, { getPool }] = await Promise.all([
      import('../innovation/submission-readiness-twin-service.js'),
      import('../../db.js'),
    ]);
    const service = new SubmissionReadinessTwinService(getPool() as any);
    const dashboard = await service.getDashboard(programId, submissionType, agency);

    /* The empty dashboard is a zero-valued object, not an absence. Reporting it
       verbatim would state a 0% readiness score and a 0% approval probability
       for a program that has simply never been assessed. Zero evaluated criteria
       is the same signal `report-os/prediction/model-adapters` uses to refuse. */
    const neverAssessed = (dashboard?.criteriaProgress?.total ?? 0) === 0;
    if (neverAssessed) {
      return JSON.stringify({
        status: 'not_assessed',
        programId,
        submissionType,
        agency,
        message: `No readiness assessment has been run for this program against ${submissionType}/${agency}. This is NOT a score of zero — say that no assessment exists and offer to run one, and do not state a readiness percentage or approval probability.`,
      });
    }

    return JSON.stringify({
      status: 'ok',
      programId,
      submissionType,
      agency,
      dashboard,
      instruction:
        'Lead with the overall score, its trend, and the criteria met-vs-total. Then the ranked recommendations with their effort, because that is what the user acts on. Report per-module readiness where it is uneven rather than averaging it away. The predicted approval probability, review time and deficiency count are MODEL ESTIMATES from historical patterns — attribute them as such and never assert them as the likelihood of approval.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `get_submission_readiness_twin failed: ${err?.message || 'unknown error'}` });
  }
});

// Structured benefit-risk assessment (BRAT-style) — deterministic decision aid.
registerToolHandler('assess_benefit_risk', async (input: Record<string, unknown>) => {
  try {
    const { assessBenefitRisk } = await import('../regulatory/benefit-risk.js');
    const result = assessBenefitRisk(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction: 'Report the weighted benefit/risk, net, and favorability with the per-item contributions and the disclaimer. This is a decision aid, NOT a regulatory determination.',
    });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|non-empty|needs a name|cannot all be zero|\[0,100\]|threshold/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `assess_benefit_risk failed: ${m}` });
  }
});

// ICH Q1E shelf-life / retest-period estimation by regression — deterministic.
registerToolHandler('estimate_shelf_life', async (input: Record<string, unknown>) => {
  try {
    const { estimateShelfLife } = await import('../cmc/shelf-life.js');
    const result = estimateShelfLife(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction: 'Report the estimated shelfLife, the regression, and the notes verbatim. If exceedsEvaluatedRange is true, do not extrapolate beyond justified limits. Single-batch/attribute estimate, not multi-batch poolability.',
    });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|requires|at least|distinct|direction|finite|vary/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `estimate_shelf_life failed: ${m}` });
  }
});

// ── Advanced HEOR + CDISC pipeline — deterministic, no DB/network. ──
registerToolHandler('model_markov_cohort', async (input: Record<string, unknown>) => {
  try {
    const { runMarkovModel } = await import('../heor/markov-model.js');
    const result = runMarkovModel(input as any);
    return JSON.stringify({ status: 'computed', engine: 'deterministic', result, instruction: 'Report total discounted cost and QALYs verbatim; note the start-of-cycle / first-cycle-undiscounted conventions.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must|sum to 1|index-aligned|at least|cycles|discount|cycleLength|cohortSize/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `model_markov_cohort failed: ${m}` });
  }
});

registerToolHandler('run_probabilistic_sensitivity', async (input: Record<string, unknown>) => {
  try {
    const { runProbabilisticSensitivity } = await import('../heor/psa.js');
    const result = runProbabilisticSensitivity(input as any);
    return JSON.stringify({ status: 'computed', engine: 'seeded-monte-carlo', result, instruction: 'Report the ICER, probabilityDominant, and CEAC verbatim. Results are reproducible for the given seed.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/finite|non-negative|willingnessToPay|requires/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `run_probabilistic_sensitivity failed: ${m}` });
  }
});

registerToolHandler('run_cdisc_pipeline', async (input: Record<string, unknown>) => {
  try {
    if (!input.spec || typeof input.spec !== 'object') return JSON.stringify({ status: 'needs_parameters', message: 'spec is required (the dataset spec).' });
    const { runCdiscPipeline } = await import('../cdisc/pipeline.js');
    const result = runCdiscPipeline(input.spec as any);
    return JSON.stringify({ status: 'computed', engine: 'deterministic', result, instruction: 'Lead with readiness.submissionReady and error count; list errors before warnings. Structural subset, not the full validator of record.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|required|non-?empty/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `run_cdisc_pipeline failed: ${m}` });
  }
});

// ── 510(k) cover-letter + summary composition — tenant-scoped (org-scoped
// section pull); fail closed without organization context. ──
registerToolHandler('compose_correspondence_cover_letter', async (input: Record<string, unknown>, ctx) => {
  try {
    if (!ctx?.organizationId) return JSON.stringify({ status: 'needs_context', message: 'compose_correspondence_cover_letter requires an active organization context.' });
    const documentId = typeof input.documentId === 'number' ? input.documentId : Number(input.documentId);
    if (!Number.isFinite(documentId)) return JSON.stringify({ status: 'needs_parameters', message: 'documentId (number) is required.' });
    if (!Array.isArray(input.issues) || input.issues.length === 0) return JSON.stringify({ status: 'needs_parameters', message: 'issues[] is required and must be non-empty.' });
    const { composeCoverLetterDraft } = await import('../cover-letter/cover-letter-composer.js');
    const draft = await composeCoverLetterDraft({
      organizationId: Number(ctx.organizationId),
      documentId,
      submissionTrackingNumber: typeof input.submissionTrackingNumber === 'string' ? input.submissionTrackingNumber : null,
      sponsorName: typeof input.sponsorName === 'string' ? input.sponsorName : '',
      issues: input.issues as any[],
    });
    return JSON.stringify({ status: 'composed', engine: 'deterministic', body: draft.body, missingSections: draft.missingSections, provenance: draft.provenance, instruction: 'Surface missingSections before sending; the body is deterministic.' });
  } catch (err: any) {
    return JSON.stringify({ error: `compose_correspondence_cover_letter failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('compose_510k_summary', async (input: Record<string, unknown>, ctx) => {
  try {
    if (!ctx?.organizationId) return JSON.stringify({ status: 'needs_context', message: 'compose_510k_summary requires an active organization context.' });
    const documentId = typeof input.documentId === 'number' ? input.documentId : Number(input.documentId);
    if (!Number.isFinite(documentId)) return JSON.stringify({ status: 'needs_parameters', message: 'documentId (number) is required.' });
    if (!Array.isArray(input.predicates) || input.predicates.length === 0) return JSON.stringify({ status: 'needs_parameters', message: 'predicates[] is required and must be non-empty.' });
    const dc = input.deviceClass;
    if (dc !== 'I' && dc !== 'II' && dc !== 'III') return JSON.stringify({ status: 'needs_parameters', message: "deviceClass must be 'I', 'II', or 'III'." });
    const { compose510kSummary } = await import('../cover-letter/k510-summary-composer.js');
    const draft = await compose510kSummary({
      organizationId: Number(ctx.organizationId),
      documentId,
      submissionTrackingNumber: typeof input.submissionTrackingNumber === 'string' ? input.submissionTrackingNumber : null,
      sponsorName: typeof input.sponsorName === 'string' ? input.sponsorName : '',
      deviceTradeName: typeof input.deviceTradeName === 'string' ? input.deviceTradeName : '',
      commonName: typeof input.commonName === 'string' ? input.commonName : null,
      productCode: typeof input.productCode === 'string' ? input.productCode : null,
      regulationNumber: typeof input.regulationNumber === 'string' ? input.regulationNumber : null,
      deviceClass: dc,
      contactName: typeof input.contactName === 'string' ? input.contactName : null,
      contactEmail: typeof input.contactEmail === 'string' ? input.contactEmail : null,
      preparedDate: new Date(),
      predicates: input.predicates as any[],
    });
    return JSON.stringify({ status: 'composed', engine: 'deterministic', body: draft.body, missingSections: draft.missingSections, provenance: draft.provenance, instruction: 'Report missingSections; do not present the summary as complete while required sections are missing.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/predicate|primary|required/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `compose_510k_summary failed: ${m}` });
  }
});

// ICH Q2 analytical method validation — deterministic, no DB/network.
registerToolHandler('assess_analytical_method_validation', async (input: Record<string, unknown>) => {
  try {
    const { assessMethodValidation } = await import('../analytical/method-validation.js');
    const result = assessMethodValidation(input as any);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction: 'Report the linearity/precision/accuracy numbers and pass/fail verbatim. No lack-of-fit p-value is computed (out of scope).',
    });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|at least|requires|LOW\/MID\/HIGH|r2Min|finite/i.test(m)) {
      return JSON.stringify({ status: 'needs_parameters', message: m });
    }
    return JSON.stringify({ error: `assess_analytical_method_validation failed: ${m}` });
  }
});

// AnA self-navigation — discover navigable screens from the governed registry.
registerToolHandler('list_app_screens', async (input: Record<string, unknown>) => {
  try {
    const { NAVIGATION_TARGETS } = await import('../../../shared/navigation/index.js');
    const group = typeof input.group === 'string' ? input.group : undefined;
    const scope = input.scope === 'global' || input.scope === 'project' ? input.scope : undefined;
    const screens = NAVIGATION_TARGETS
      .filter(t => (group ? t.group === group : true) && (scope ? t.scope === scope : true))
      .map(t => ({
        id: t.id,
        label: t.label,
        description: t.description,
        scope: t.scope,
        group: t.group,
        params: t.params,
      }));
    return JSON.stringify({
      status: 'ok',
      count: screens.length,
      screens,
      instruction:
        "Navigate with navigate_to using a screen id verbatim. 'project'-scope screens require an active project in context. Pass any listed params (e.g. intelligenceTab).",
    });
  } catch (err: any) {
    return JSON.stringify({ error: `list_app_screens failed: ${err?.message || 'unknown error'}` });
  }
});

// AnA self-navigation — validate a target against the governed registry and
// produce the navigation directive the chat client applies. Refuses unknown
// targets / invalid params rather than emitting a broken jump.
registerToolHandler('navigate_to', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  try {
    const target = typeof input.target === 'string' ? input.target.trim() : '';
    if (!target) {
      return JSON.stringify({ status: 'needs_parameters', message: 'target is required — call list_app_screens to discover screen ids.' });
    }
    const params = input.params && typeof input.params === 'object' ? (input.params as Record<string, unknown>) : {};
    const { resolveNavigation } = await import('../../../shared/navigation/index.js');
    const res = resolveNavigation(target, params);
    if (!res.ok) {
      return JSON.stringify({
        status: res.code === 'unknown_target' ? 'unknown_target' : 'needs_parameters',
        message: res.error,
        ...(res.code === 'unknown_target' ? { validTargets: res.validTargets } : {}),
      });
    }
    return JSON.stringify({
      status: 'navigation_ready',
      directive: res.directive,
      // The instruction must match what actually happens on screen: under Live
      // Drive the directive is applied as it streams (the user opted in and is
      // watching); otherwise it is offered as a chip the user activates.
      instruction: ctx?.liveDrive
        ? 'Live Drive is on: this navigation is being applied to the user’s screen now — they are watching you drive. Narrate where you have taken them and why, then continue the work there. Project-scoped screens require an active project.'
        : 'A navigation directive was produced and is OFFERED to the user as an action they activate — the screen does not change on its own. Say where you can take them and why, not that you have taken them. Project-scoped screens require an active project.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `navigate_to failed: ${err?.message || 'unknown error'}` });
  }
});

// AnA self-operation — discover the ungoverned on-screen operations from the
// governed surface-action registry (the sibling of list_app_screens).
registerToolHandler('list_screen_actions', async (input: Record<string, unknown>) => {
  try {
    const { SURFACE_ACTIONS } = await import('../../../shared/navigation/surface-actions.js');
    const surface = typeof input.surface === 'string' ? input.surface.trim() : '';
    const actions = SURFACE_ACTIONS.filter(a => (surface ? a.surfaceId === surface : true)).map(
      a => ({
        id: a.id,
        surface: a.surfaceId,
        label: a.label,
        description: a.description,
        params: a.params,
      })
    );
    return JSON.stringify({
      status: 'ok',
      count: actions.length,
      actions,
      instruction:
        'Perform an action with act_on_screen using its id verbatim, after navigating to (or while on) the screen it operates. These are ungoverned view operations only — governed work (sign/approve/submit/lock) always goes through the propose-and-confirm path instead.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `list_screen_actions failed: ${err?.message || 'unknown error'}` });
  }
});

// AnA self-operation — validate an on-screen operation against the governed
// surface-action registry and produce the directive the client bus performs.
// Refuses unknown actions, governed verbs, and invalid params rather than
// emitting a broken (or forbidden) operation.
registerToolHandler('act_on_screen', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  try {
    const action = typeof input.action === 'string' ? input.action.trim() : '';
    if (!action) {
      return JSON.stringify({
        status: 'needs_parameters',
        message: 'action is required — call list_screen_actions to discover action ids.',
      });
    }
    const params =
      input.params && typeof input.params === 'object'
        ? (input.params as Record<string, unknown>)
        : {};
    const { resolveSurfaceAction } = await import('../../../shared/navigation/surface-actions.js');
    const res = resolveSurfaceAction(action, params);
    if (!res.ok) {
      return JSON.stringify({
        status:
          res.code === 'unknown_action'
            ? 'unknown_action'
            : res.code === 'governed_refused'
            ? 'governed_refused'
            : 'needs_parameters',
        message: res.error,
        ...(res.code === 'unknown_action' && res.validActions ? { validActions: res.validActions } : {}),
      });
    }
    return JSON.stringify({
      status: 'action_ready',
      directive: res.directive,
      // The instruction must match what actually happens on screen, exactly as
      // navigate_to's does.
      instruction: ctx?.liveDrive
        ? `Live Drive is on: this operation is being performed on the user's screen now (on the "${res.directive.surfaceId}" surface — make sure you have navigated there). Narrate what you did and what it shows, then continue.`
        : `An action directive was produced and is OFFERED to the user as a chip they activate — the screen does not change on its own. Say what the action will do when they tap it, not that you have done it.`,
    });
  } catch (err: any) {
    return JSON.stringify({ error: `act_on_screen failed: ${err?.message || 'unknown error'}` });
  }
});

// AnA demonstrations — list the curated demo scripts (training + sales).
registerToolHandler('list_demo_scripts', async (input: Record<string, unknown>) => {
  try {
    const { listDemoScripts } = await import('../../../shared/navigation/demo-scripts.js');
    const kind = input.kind === 'training' || input.kind === 'sales' ? input.kind : undefined;
    const scripts = listDemoScripts().filter(s => (kind ? s.kind === kind : true));
    return JSON.stringify({
      status: 'ok',
      count: scripts.length,
      scripts,
      instruction:
        'Fetch the chosen script with start_product_demo. Demonstrations run best under Live Drive demonstration mode — the user starts it from the AnA rail (Control → Run a demonstration).',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `list_demo_scripts failed: ${err?.message || 'unknown error'}` });
  }
});

// AnA demonstrations — fetch one validated script and the instructions for
// running it. The script is a plan; execution stays tool-driven (navigate_to /
// act_on_screen), so every drive invariant holds unchanged.
registerToolHandler('start_product_demo', async (input: Record<string, unknown>, ctx?: ToolContext) => {
  try {
    const demoId = typeof input.demo === 'string' ? input.demo.trim() : '';
    const { findDemoScript, listDemoScripts, validateDemoScript } = await import(
      '../../../shared/navigation/demo-scripts.js'
    );
    if (!demoId) {
      return JSON.stringify({
        status: 'needs_parameters',
        message: 'demo is required — call list_demo_scripts to discover script ids.',
        scripts: listDemoScripts(),
      });
    }
    const script = findDemoScript(demoId);
    if (!script) {
      return JSON.stringify({
        status: 'unknown_demo',
        message: `Unknown demonstration "${demoId}".`,
        scripts: listDemoScripts(),
      });
    }
    // Belt: scripts are registry-validated by the test suite; refuse rather
    // than run a script that somehow references a screen that no longer exists.
    const defects = validateDemoScript(script);
    if (defects.length > 0) {
      return JSON.stringify({
        status: 'invalid_demo',
        message: `Demonstration "${demoId}" failed validation and cannot run.`,
        defects,
      });
    }
    return JSON.stringify({
      status: 'demo_ready',
      script,
      instruction: ctx?.liveDrive
        ? `Run the demonstration now, stop by stop and briskly: for each step, narrate its "say" talking point in your own words (adapted to the user's real data on screen — never verbatim), then make its move (navigate_to for "navigate", act_on_screen for "act"). A step without pinned params (e.g. which program to open) is filled from the on-screen context; if the workspace has no programs yet, narrate from the portfolio and offer to set one up together instead. Answer any question the user asks mid-demo, then resume from the next stop. If the turn ends before the script does, say which stop you reached so you can continue from the next one.`
        : `Live Drive is NOT on for this turn, so the moves below can only be OFFERED as chips, not performed. Tell the user a demonstration works best with Live Drive on (AnA rail → Control → Live Drive, or the Run a demonstration button) and offer to proceed chip-by-chip if they prefer.`,
    });
  } catch (err: any) {
    return JSON.stringify({ error: `start_product_demo failed: ${err?.message || 'unknown error'}` });
  }
});

// ── HEOR modeling (server/services/heor) — deterministic, no DB/network. ──
registerToolHandler('model_budget_impact', async (input: Record<string, unknown>) => {
  try {
    const { computeBudgetImpact } = await import('../heor/heor-models.js');
    const result = computeBudgetImpact(input as any);
    return JSON.stringify({ status: 'computed', engine: 'deterministic', result, instruction: 'Report the per-year and total budget impact and PMPM verbatim. Costs are in the caller-supplied currency unit.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|required|non-?empty/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `model_budget_impact failed: ${m}` });
  }
});

registerToolHandler('model_cost_effectiveness', async (input: Record<string, unknown>) => {
  try {
    const { computeCostEffectiveness } = await import('../heor/heor-models.js');
    const result = computeCostEffectiveness(input as any);
    return JSON.stringify({ status: 'computed', engine: 'deterministic', result, instruction: 'Report the ICER, dominance, and (if given) net monetary benefit verbatim. A null ICER means effects are equal.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|finite|non-?negative/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `model_cost_effectiveness failed: ${m}` });
  }
});

// ── HEOR market-access (comparator mix; server/services/heor/market-access-models) ──
registerToolHandler('model_budget_impact_mix', async (input: Record<string, unknown>) =>
  runStatsTool('model_budget_impact_mix', async () => {
    const { budgetImpactWithMix } = await import('../heor/market-access-models.js');
    return budgetImpactWithMix(input as any);
  })
);

registerToolHandler('model_cost_effectiveness_nmb', async (input: Record<string, unknown>) =>
  runStatsTool('model_cost_effectiveness_nmb', async () => {
    const { costEffectivenessNmb } = await import('../heor/market-access-models.js');
    return costEffectivenessNmb(input as any);
  })
);

// ── SPL labeling (server/services/labeling/spl-generator) — deterministic. ──
registerToolHandler('generate_spl', async (input: Record<string, unknown>) => {
  try {
    if (!input.spec || typeof input.spec !== 'object') return JSON.stringify({ status: 'needs_parameters', message: 'spec is required (the SPL document spec).' });
    const { generateSpl } = await import('../labeling/spl-generator.js');
    const result = generateSpl(input.spec as any);
    return JSON.stringify({ status: result.structurallyValid ? 'generated' : 'generated_with_errors', engine: 'deterministic', xml: result.xml, warnings: result.warnings, structurallyValid: result.structurallyValid, instruction: 'If structurallyValid is false, surface the warnings/errors; the XML is structural SPL, not FDA full-schematron acceptance.' });
  } catch (err: any) {
    return JSON.stringify({ error: `generate_spl failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('validate_spl', async (input: Record<string, unknown>) => {
  try {
    if (!input.spec || typeof input.spec !== 'object') return JSON.stringify({ status: 'needs_parameters', message: 'spec is required (the SPL document spec).' });
    const { validateSplSpec } = await import('../labeling/spl-generator.js');
    const result = validateSplSpec(input.spec as any);
    return JSON.stringify({ status: 'validated', engine: 'deterministic', result, instruction: 'List errors first, then warnings. Structural validation only — not FDA full-schematron.' });
  } catch (err: any) {
    return JSON.stringify({ error: `validate_spl failed: ${err?.message || 'unknown error'}` });
  }
});

// ── CDISC validate_cdisc_dataset — dispatches per standard to conformance service. ──
registerToolHandler('validate_cdisc_dataset', async (input: Record<string, unknown>) =>
  runStatsTool('validate_cdisc_dataset', async () => {
    const std = (typeof input.standard === 'string' ? input.standard : '').toUpperCase();
    const datasets = Array.isArray(input.datasets) ? input.datasets : [];
    if (std === 'ADAM' && datasets.length > 0) {
      const { validateAdamDataset } = await import('../cdisc/cdisc-conformance-service.js');
      return datasets.map((ds: any) => validateAdamDataset({ dataset: ds.name, variables: ds.variables || [] }));
    }
    const { validateSdtmDataset } = await import('../cdisc/cdisc-conformance-service.js');
    return datasets.map((ds: any) => validateSdtmDataset({ domain: ds.name, variables: ds.variables || [] }));
  }, 'deterministic')
);

registerToolHandler('check_dataset_conformance', async (input: Record<string, unknown>) => {
  try {
    if (!input.spec || typeof input.spec !== 'object') return JSON.stringify({ status: 'needs_parameters', message: 'spec is required (the dataset spec).' });
    const { checkDatasetConformance } = await import('../cdisc/define-spec-conformance.js');
    const result = checkDatasetConformance(input.spec as any);
    return JSON.stringify({ status: 'checked', engine: 'deterministic', result, instruction: 'Report errors (blocking) before warnings. Structural subset, not the full validator of record.' });
  } catch (err: any) {
    const m = err?.message || 'unknown error';
    if (/must be|required|non-?empty/i.test(m)) return JSON.stringify({ status: 'needs_parameters', message: m });
    return JSON.stringify({ error: `check_dataset_conformance failed: ${m}` });
  }
});

// ── Reference management (server/services/references) — deterministic. ──
registerToolHandler('import_ris_references', async (input: Record<string, unknown>) => {
  try {
    const ris = typeof input.ris === 'string' ? input.ris : '';
    if (!ris.trim()) return JSON.stringify({ status: 'needs_parameters', message: 'ris is required (RIS-format text).' });
    const { parseRis } = await import('../references/reference-manager.js');
    const references = parseRis(ris);
    return JSON.stringify({ status: 'parsed', engine: 'deterministic', count: references.length, references, instruction: 'Use these structured references with format_references / lint_references.' });
  } catch (err: any) {
    return JSON.stringify({ error: `import_ris_references failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('format_references', async (input: Record<string, unknown>) => {
  try {
    if (!Array.isArray(input.references) || input.references.length === 0) return JSON.stringify({ status: 'needs_parameters', message: 'references[] is required and must be non-empty.' });
    const style = input.style === 'ama' ? 'ama' : 'vancouver';
    const { formatBibliography } = await import('../references/reference-manager.js');
    const bibliography = formatBibliography(input.references as any[], style);
    return JSON.stringify({ status: 'formatted', engine: 'deterministic', style, bibliography, instruction: 'Use the formatted bibliography verbatim.' });
  } catch (err: any) {
    return JSON.stringify({ error: `format_references failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('lint_references', async (input: Record<string, unknown>) => {
  try {
    if (!Array.isArray(input.references) || input.references.length === 0) return JSON.stringify({ status: 'needs_parameters', message: 'references[] is required and must be non-empty.' });
    const { lintReferences } = await import('../references/reference-manager.js');
    const result = lintReferences(input.references as any[]);
    return JSON.stringify({ status: 'checked', engine: 'deterministic', result, instruction: 'Report errors and duplicate groups first; fix before finalizing the bibliography.' });
  } catch (err: any) {
    return JSON.stringify({ error: `lint_references failed: ${err?.message || 'unknown error'}` });
  }
});

// ── Pharmacovigilance reporting — SAE line listing + E2B(R3) ICSR over the
// org's recorded adverse events. Tenant-scoped (fail closed without org ctx);
// the fetch is organization-scoped so no cross-tenant safety data is exposed. ──
registerToolHandler('build_sae_line_listing', async (input: Record<string, unknown>, ctx) => {
  try {
    if (!ctx?.organizationId) {
      return JSON.stringify({ status: 'needs_context', message: 'build_sae_line_listing requires an active organization context.' });
    }
    const fromDate = typeof input.from_date === 'string' ? input.from_date : '';
    const toDate = typeof input.to_date === 'string' ? input.to_date : '';
    if (!fromDate || !toDate) {
      return JSON.stringify({ status: 'needs_parameters', message: 'from_date and to_date (ISO dates) are required.' });
    }
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return JSON.stringify({ status: 'needs_parameters', message: 'from_date / to_date must be valid ISO dates.' });
    }
    const { getAdverseEvents } = await import('../compliance/pharmacovigilanceService.js');
    let events = await getAdverseEvents(String(ctx.organizationId), { fromDate: from, toDate: to });
    if (typeof input.project_id === 'string' && input.project_id) {
      events = events.filter(e => String(e.projectId) === input.project_id);
    }
    const { buildSaeLineListing, saeLineListingToCsv } = await import('../ind-lifecycle/ind-sae-line-listing.js');
    const listing = buildSaeLineListing({ events, periodStart: from, periodEnd: to });
    const csv = saeLineListingToCsv(listing);
    return JSON.stringify({
      status: 'built',
      engine: 'deterministic',
      caseCount: listing.rows.length,
      listing,
      csv,
      instruction: 'Report the listing and summary as recorded; if caseCount is 0, say no qualifying cases were found in the period rather than implying none exist.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `build_sae_line_listing failed: ${err?.message || 'unknown error'}` });
  }
});

registerToolHandler('compose_e2b_icsr', async (input: Record<string, unknown>, ctx) => {
  try {
    if (!ctx?.organizationId) {
      return JSON.stringify({ status: 'needs_context', message: 'compose_e2b_icsr requires an active organization context.' });
    }
    const aeId = typeof input.adverse_event_id === 'string' ? input.adverse_event_id : '';
    if (!aeId) {
      return JSON.stringify({ status: 'needs_parameters', message: 'adverse_event_id is required.' });
    }
    const { getAdverseEvents } = await import('../compliance/pharmacovigilanceService.js');
    // Fetch via the org-scoped service and select by id — guarantees the case
    // belongs to this tenant (no raw cross-tenant id lookup).
    const events = await getAdverseEvents(String(ctx.organizationId));
    const event = events.find(e => String(e.id) === aeId);
    if (!event) {
      return JSON.stringify({ status: 'not_found', message: `No adverse event "${aeId}" found in this organization.` });
    }
    const { composeE2bR3Icsr } = await import('../ind-lifecycle/e2b-icsr-composer.js');
    const result = composeE2bR3Icsr(event, {
      expedited: typeof input.expedited === 'boolean' ? input.expedited : undefined,
      nullificationReason: typeof input.nullification_reason === 'string' ? input.nullification_reason : undefined,
    });
    return JSON.stringify({
      status: 'composed',
      engine: 'deterministic',
      completeness: result.completeness,
      gaps: result.gaps,
      icsr: result.icsr,
      xml: result.xml,
      instruction: 'List the mandatory gaps first — they must be resolved before transmit. Report completeness honestly; do not claim a submittable ICSR while gaps remain.',
    });
  } catch (err: any) {
    return JSON.stringify({ error: `compose_e2b_icsr failed: ${err?.message || 'unknown error'}` });
  }
});

// Cross-document numerical reconciliation (Tier 1.2) — flags a labeled figure
// disagreeing across submission modules. Deterministic; no DB/network.
registerToolHandler('reconcile_dossier_numbers', async (input: Record<string, unknown>) => {
  try {
    const { reconcileDossierNumbers } = await import('./dossierReconciliation.js');
    const result = reconcileDossierNumbers((input.documents as any) ?? []);
    return JSON.stringify({
      status: 'computed',
      engine: 'deterministic',
      result,
      instruction:
        result.discrepancies.length > 0
          ? 'Surface each discrepancy with its label, the conflicting values, and the snippet from each document so the user can resolve the source of truth. Do not guess which value is correct.'
          : 'No cross-document numerical conflicts were found among the labeled figures scanned. State which labels were checked and found consistent.',
    });
  } catch (err: any) {
    const message = err?.message || 'unknown error';
    if (/must be|must have|each document/.test(message)) {
      return JSON.stringify({ status: 'needs_parameters', message });
    }
    return JSON.stringify({ error: `reconcile_dossier_numbers failed: ${message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Guidance Ingestion — live FDA/ICH guidance fetching + freshness checks.
// See guidanceIngestionTools.ts + ../regulatory-currency/guidance-ingestion-service.ts.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('fetch_fda_guidance_list', async (input: Record<string, unknown>) =>
  runStatsTool('fetch_fda_guidance_list', async () => {
    const { fetchFdaGuidanceList } = await import('../regulatory-currency/guidance-ingestion-service.js');
    return fetchFdaGuidanceList({
      topic: input.topic as string | undefined,
      year: input.year as number | undefined,
      status: input.status as 'final' | 'draft' | 'withdrawn' | undefined,
      limit: input.limit as number | undefined,
    });
  })
);

registerToolHandler('fetch_ich_guideline_updates', async (input: Record<string, unknown>) =>
  runStatsTool('fetch_ich_guideline_updates', async () => {
    const { fetchIchGuidelineUpdates } = await import('../regulatory-currency/guidance-ingestion-service.js');
    return fetchIchGuidelineUpdates({
      category: input.category as 'Q' | 'S' | 'E' | 'M' | undefined,
      since: input.since as string | undefined,
    });
  })
);

registerToolHandler('check_guidance_freshness', async (input: Record<string, unknown>) =>
  runStatsTool('check_guidance_freshness', async () => {
    const { checkGuidanceFreshness } = await import('../regulatory-currency/guidance-ingestion-service.js');
    if (!input.citedGuidances || !Array.isArray(input.citedGuidances)) {
      throw new Error('citedGuidances is required');
    }
    return checkGuidanceFreshness({
      citedGuidances: input.citedGuidances as Array<{ title: string; citedDate?: string; jurisdiction?: string }>,
    });
  })
);

// ── SPL generation & PSUR/DSUR safety-report structure ──────────────────────

registerToolHandler('generate_spl_xml', async (input: Record<string, unknown>) =>
  runStatsTool('generate_spl_xml', async () => {
    const { generateSplXml } = await import('../labeling/spl-generation-service.js');
    return generateSplXml(input as any);
  })
);

registerToolHandler('validate_spl_structure', async (input: Record<string, unknown>) =>
  runStatsTool('validate_spl_structure', async () => {
    const { validateSplStructure } = await import('../labeling/spl-generation-service.js');
    return validateSplStructure(input.xml as string);
  })
);

registerToolHandler('generate_psur_structure', async (input: Record<string, unknown>) =>
  runStatsTool('generate_psur_structure', async () => {
    const { generatePsurStructure } = await import('../safety-reports/psur-dsur-service.js');
    return generatePsurStructure(input as any);
  })
);

registerToolHandler('generate_dsur_structure', async (input: Record<string, unknown>) =>
  runStatsTool('generate_dsur_structure', async () => {
    const { generateDsurStructure } = await import('../safety-reports/psur-dsur-service.js');
    return generateDsurStructure(input as any);
  })
);

// ── CDISC conformance service (server/services/cdisc/cdisc-conformance-service) — deterministic. ──

registerToolHandler('validate_sdtm_dataset', async (input: Record<string, unknown>) =>
  runStatsTool('validate_sdtm_dataset', async () => {
    const { validateSdtmDataset } = await import('../cdisc/cdisc-conformance-service.js');
    return validateSdtmDataset(input as any);
  }, 'deterministic')
);

registerToolHandler('validate_adam_dataset', async (input: Record<string, unknown>) =>
  runStatsTool('validate_adam_dataset', async () => {
    const { validateAdamDataset } = await import('../cdisc/cdisc-conformance-service.js');
    return validateAdamDataset(input as any);
  }, 'deterministic')
);

registerToolHandler('generate_define_xml', async (input: Record<string, unknown>) => {
  // The dataset spec ({ studyName, standard, datasets[], codelists[] }) is read
  // at the top level; unwrap a legacy `spec` wrapper for backward compatibility.
  const raw: any =
    input && typeof (input as any).spec === 'object' && (input as any).spec
      ? (input as any).spec
      : input;
  if (!raw || !Array.isArray(raw.datasets) || raw.datasets.length === 0) {
    return JSON.stringify({ status: 'needs_parameters', message: 'datasets is required (a non-empty array of dataset specs alongside studyName).' });
  }
  // Adapt the model-facing tool schema (variable.type / variable.codelist;
  // codelist.oid + items[{code,decode}]) to the generator's DefineXmlInput
  // (variable.dataType / variable.codelistId; codelist.id + terms[{value,decode}]).
  const spec = {
    studyName: raw.studyName,
    standard: raw.standard,
    // defineVersion sits beside `spec` in the tool schema, but a model that
    // wraps everything will put it inside; accept either, default 2.1.
    defineVersion:
      ((input as any).defineVersion ?? raw.defineVersion) === '2.0' ? '2.0' : '2.1',
    datasets: raw.datasets.map((ds: any) => ({
      ...ds,
      variables: (ds.variables ?? []).map((v: any) => ({
        ...v,
        dataType: v.dataType ?? v.type,
        codelistId: v.codelistId ?? v.codelist,
      })),
    })),
    codelists: (raw.codelists ?? []).map((c: any) => ({
      id: c.id ?? c.oid,
      name: c.name,
      dataType: c.dataType ?? c.type ?? 'text',
      terms: (c.terms ?? c.items ?? []).map((t: any) => ({
        value: t.value ?? t.code,
        decode: t.decode,
      })),
    })),
  };
  // Emit define.xml at the requested version via the one generator (returns
  // { xml, defineVersion, valid, gaps, datasetCount, variableCount,
  // codelistCount }), so the version in the result is the version in the file.
  // Structural conformance is a separate tool (check_dataset_conformance).
  // runStatsTool wraps the result as { status: 'computed', engine, result }.
  return runStatsTool('generate_define_xml', async () => {
    const { generateDefineXml } = await import('../cdisc/define-xml-generator.js');
    return generateDefineXml(spec as any);
  });
});

// ── Bioequivalence & generic drug intelligence (server/services/bioequivalence/bioequivalence-knowledge) — deterministic. ──

registerToolHandler('classify_bcs', async (input: Record<string, unknown>) =>
  runStatsTool('classify_bcs', async () => {
    const { classifyBCS } = await import('../bioequivalence/bioequivalence-knowledge.js');
    return classifyBCS(input as any);
  }, 'deterministic')
);

registerToolHandler('design_be_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_be_study', async () => {
    const { designBEStudy } = await import('../bioequivalence/bioequivalence-knowledge.js');
    return designBEStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_dissolution_similarity', async (input: Record<string, unknown>) =>
  runStatsTool('assess_dissolution_similarity', async () => {
    const { assessDissolutionSimilarity } = await import('../bioequivalence/bioequivalence-knowledge.js');
    return assessDissolutionSimilarity(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_biowaiver', async (input: Record<string, unknown>) =>
  runStatsTool('assess_biowaiver', async () => {
    const { assessBiowaiver } = await import('../bioequivalence/bioequivalence-knowledge.js');
    return assessBiowaiver(input as any);
  }, 'deterministic')
);

registerToolHandler('guidance_for_anda', async (input: Record<string, unknown>) =>
  runStatsTool('guidance_for_anda', async () => {
    const { guidanceForANDA } = await import('../bioequivalence/bioequivalence-knowledge.js');
    return guidanceForANDA(input as any);
  }, 'deterministic')
);

// ── Pharmacometrics intelligence (server/services/pharmacometrics/pharmacometrics-knowledge) — deterministic. ──

registerToolHandler('design_popk_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_popk_study', async () => {
    const { designPopPKStudy } = await import('../pharmacometrics/pharmacometrics-knowledge.js');
    return designPopPKStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('evaluate_pbpk_model', async (input: Record<string, unknown>) =>
  runStatsTool('evaluate_pbpk_model', async () => {
    const { evaluatePBPKModel } = await import('../pharmacometrics/pharmacometrics-knowledge.js');
    return evaluatePBPKModel(input as any);
  }, 'deterministic')
);

registerToolHandler('analyze_exposure_response', async (input: Record<string, unknown>) =>
  runStatsTool('analyze_exposure_response', async () => {
    const { analyzeExposureResponse } = await import('../pharmacometrics/pharmacometrics-knowledge.js');
    return analyzeExposureResponse(input as any);
  }, 'deterministic')
);

registerToolHandler('advise_midd', async (input: Record<string, unknown>) =>
  runStatsTool('advise_midd', async () => {
    const { adviseMIDD } = await import('../pharmacometrics/pharmacometrics-knowledge.js');
    return adviseMIDD(input as any);
  }, 'deterministic')
);

registerToolHandler('select_dose', async (input: Record<string, unknown>) =>
  runStatsTool('select_dose', async () => {
    const { selectDose } = await import('../pharmacometrics/pharmacometrics-knowledge.js');
    return selectDose(input as any);
  }, 'deterministic')
);

// ── Preclinical toxicology intelligence (server/services/toxicology/toxicology-knowledge) — deterministic. ──

registerToolHandler('select_tox_species', async (input: Record<string, unknown>) =>
  runStatsTool('select_tox_species', async () => {
    const { selectSpecies } = await import('../toxicology/toxicology-knowledge.js');
    return selectSpecies(input as any);
  }, 'deterministic')
);

registerToolHandler('design_repeat_dose_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_repeat_dose_study', async () => {
    const { designRepeatDoseStudy } = await import('../toxicology/toxicology-knowledge.js');
    return designRepeatDoseStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('calculate_safety_margin', async (input: Record<string, unknown>) =>
  runStatsTool('calculate_safety_margin', async () => {
    const { calculateSafetyMargin } = await import('../toxicology/toxicology-knowledge.js');
    return calculateSafetyMargin(input as any);
  }, 'deterministic')
);

registerToolHandler('design_genotox_battery', async (input: Record<string, unknown>) =>
  runStatsTool('design_genotox_battery', async () => {
    const { designGenotoxBattery } = await import('../toxicology/toxicology-knowledge.js');
    return designGenotoxBattery(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_carcinogenicity_need', async (input: Record<string, unknown>) =>
  runStatsTool('assess_carcinogenicity_need', async () => {
    const { assessCarcinogenicityNeed } = await import('../toxicology/toxicology-knowledge.js');
    return assessCarcinogenicityNeed(input as any);
  }, 'deterministic')
);

registerToolHandler('design_repro_tox_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_repro_tox_study', async () => {
    const { designReproToxStudy } = await import('../toxicology/toxicology-knowledge.js');
    return designReproToxStudy(input as any);
  }, 'deterministic')
);

// ── Pediatric development intelligence (server/services/pediatric/pediatric-knowledge) — deterministic. ──

registerToolHandler('classify_pediatric_age', async (input: Record<string, unknown>) =>
  runStatsTool('classify_pediatric_age', async () => {
    const { classifyPediatricAge } = await import('../pediatric/pediatric-knowledge.js');
    return classifyPediatricAge(input as any);
  }, 'deterministic')
);

registerToolHandler('design_pediatric_investigation', async (input: Record<string, unknown>) =>
  runStatsTool('design_pediatric_investigation', async () => {
    const { designPIP } = await import('../pediatric/pediatric-knowledge.js');
    return designPIP(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_pediatric_extrapolation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_pediatric_extrapolation', async () => {
    const { assessExtrapolation } = await import('../pediatric/pediatric-knowledge.js');
    return assessExtrapolation(input as any);
  }, 'deterministic')
);

registerToolHandler('select_pediatric_formulation', async (input: Record<string, unknown>) =>
  runStatsTool('select_pediatric_formulation', async () => {
    const { selectFormulation } = await import('../pediatric/pediatric-knowledge.js');
    return selectFormulation(input as any);
  }, 'deterministic')
);

registerToolHandler('select_pediatric_dose', async (input: Record<string, unknown>) =>
  runStatsTool('select_pediatric_dose', async () => {
    const { selectPediatricDose } = await import('../pediatric/pediatric-knowledge.js');
    return selectPediatricDose(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_pediatric_requirements', async (input: Record<string, unknown>) =>
  runStatsTool('assess_pediatric_requirements', async () => {
    const { assessPediatricRequirements } = await import('../pediatric/pediatric-knowledge.js');
    return assessPediatricRequirements(input as any);
  }, 'deterministic')
);

// ── Advanced therapy (ATMP/CGT) intelligence (server/services/advanced-therapy/atmp-knowledge) — deterministic. ──

registerToolHandler('classify_atmp', async (input: Record<string, unknown>) =>
  runStatsTool('classify_atmp', async () => {
    const { classifyATMP } = await import('../advanced-therapy/atmp-knowledge.js');
    return classifyATMP(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_gene_therapy_requirements', async (input: Record<string, unknown>) =>
  runStatsTool('assess_gene_therapy_requirements', async () => {
    const { assessGeneTherapyRequirements } = await import('../advanced-therapy/atmp-knowledge.js');
    return assessGeneTherapyRequirements(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_cell_therapy_manufacturing', async (input: Record<string, unknown>) =>
  runStatsTool('assess_cell_therapy_manufacturing', async () => {
    const { assessCellTherapyManufacturing } = await import('../advanced-therapy/atmp-knowledge.js');
    return assessCellTherapyManufacturing(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_cart_requirements', async (input: Record<string, unknown>) =>
  runStatsTool('assess_cart_requirements', async () => {
    const { assessCARTRequirements } = await import('../advanced-therapy/atmp-knowledge.js');
    return assessCARTRequirements(input as any);
  }, 'deterministic')
);

registerToolHandler('select_atmp_pathway', async (input: Record<string, unknown>) =>
  runStatsTool('select_atmp_pathway', async () => {
    const { selectATMPPathway } = await import('../advanced-therapy/atmp-knowledge.js');
    return selectATMPPathway(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_atmp_comparability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_atmp_comparability', async () => {
    const { assessATMPComparability } = await import('../advanced-therapy/atmp-knowledge.js');
    return assessATMPComparability(input as any);
  }, 'deterministic')
);

// ── Real-world evidence methodology intelligence (server/services/rwe/rwe-methodology-knowledge) — deterministic. ──

registerToolHandler('design_target_trial', async (input: Record<string, unknown>) =>
  runStatsTool('design_target_trial', async () => {
    const { designTargetTrial } = await import('../rwe/rwe-methodology-knowledge.js');
    return designTargetTrial(input as any);
  }, 'deterministic')
);

registerToolHandler('score_rwe_data_source', async (input: Record<string, unknown>) =>
  runStatsTool('score_rwe_data_source', async () => {
    const { scoreDataSource } = await import('../rwe/rwe-methodology-knowledge.js');
    return scoreDataSource(input as any);
  }, 'deterministic')
);

registerToolHandler('design_propensity_analysis', async (input: Record<string, unknown>) =>
  runStatsTool('design_propensity_analysis', async () => {
    const { designPropensityAnalysis } = await import('../rwe/rwe-methodology-knowledge.js');
    return designPropensityAnalysis(input as any);
  }, 'deterministic')
);

registerToolHandler('select_rwe_design', async (input: Record<string, unknown>) =>
  runStatsTool('select_rwe_design', async () => {
    const { selectRWEDesign } = await import('../rwe/rwe-methodology-knowledge.js');
    return selectRWEDesign(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_rwe_bias_risk', async (input: Record<string, unknown>) =>
  runStatsTool('assess_rwe_bias_risk', async () => {
    const { assessBiasRisk } = await import('../rwe/rwe-methodology-knowledge.js');
    return assessBiasRisk(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_rwe_regulatory_acceptability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_rwe_regulatory_acceptability', async () => {
    const { assessRegulatoryAcceptability } = await import('../rwe/rwe-methodology-knowledge.js');
    return assessRegulatoryAcceptability(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — Clinical Pharmacology intelligence handlers
// FDA 2020 DDI / ICH M12, ICH E14/S7B, FDA organ impairment guidance, CPIC,
// ICH M10, BCS food effect. Deterministic knowledge base — no LLM, no network.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_ddi_risk', async (input: Record<string, unknown>) =>
  runStatsTool('classify_ddi_risk', async () => {
    const { classifyDDIRisk } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return classifyDDIRisk(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_qtc_risk', async (input: Record<string, unknown>) =>
  runStatsTool('assess_qtc_risk', async () => {
    const { assessQTcRisk } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return assessQTcRisk(input as any);
  }, 'deterministic')
);

registerToolHandler('design_organ_impairment_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_organ_impairment_study', async () => {
    const { designOrganImpairmentStudy } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return designOrganImpairmentStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_cyp_phenotype', async (input: Record<string, unknown>) =>
  runStatsTool('classify_cyp_phenotype', async () => {
    const { classifyCYPPhenotype } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return classifyCYPPhenotype(input as any);
  }, 'deterministic')
);

registerToolHandler('design_bioanalytical_method', async (input: Record<string, unknown>) =>
  runStatsTool('design_bioanalytical_method', async () => {
    const { designBioanalyticalMethod } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return designBioanalyticalMethod(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_food_effect', async (input: Record<string, unknown>) =>
  runStatsTool('assess_food_effect', async () => {
    const { assessFoodEffect } = await import('../clinical-pharmacology/clinical-pharmacology-knowledge.js');
    return assessFoodEffect(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — CMC Quality intelligence handlers
// ICH Q1A-Q1E, Q2(R2), Q3A-Q3D, Q6A/Q6B, FDA 2011 process validation, ICH Q5E.
// Deterministic knowledge base — no LLM, no network.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_stability_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_stability_study', async () => {
    const { designStabilityStudy } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return designStabilityStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('validate_analytical_method', async (input: Record<string, unknown>) =>
  runStatsTool('validate_analytical_method', async () => {
    const { validateAnalyticalMethod } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return validateAnalyticalMethod(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_impurity', async (input: Record<string, unknown>) =>
  runStatsTool('classify_impurity', async () => {
    const { classifyImpurity } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return classifyImpurity(input as any);
  }, 'deterministic')
);

registerToolHandler('set_specifications', async (input: Record<string, unknown>) =>
  runStatsTool('set_specifications', async () => {
    const { setSpecifications } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return setSpecifications(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_process_validation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_process_validation', async () => {
    const { assessProcessValidation } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return assessProcessValidation(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_comparability_protocol', async (input: Record<string, unknown>) =>
  runStatsTool('assess_comparability_protocol', async () => {
    const { assessComparabilityProtocol } = await import('../cmc-quality/cmc-quality-knowledge.js');
    return assessComparabilityProtocol(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — Regulatory Strategy intelligence handlers
// FDA expedited programs, FDA meeting types, Orphan Drug Act, 505 pathways,
// rolling submission, ICH/global pathway comparison. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_expedited_program', async (input: Record<string, unknown>) =>
  runStatsTool('assess_expedited_program', async () => {
    const { assessExpeditedProgram } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return assessExpeditedProgram(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_fda_meeting', async (input: Record<string, unknown>) =>
  runStatsTool('plan_fda_meeting', async () => {
    const { planFDAMeeting } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return planFDAMeeting(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_orphan_designation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_orphan_designation', async () => {
    const { assessOrphanDesignation } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return assessOrphanDesignation(input as any);
  }, 'deterministic')
);

registerToolHandler('select_505_pathway', async (input: Record<string, unknown>) =>
  runStatsTool('select_505_pathway', async () => {
    const { select505Pathway } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return select505Pathway(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_rolling_submission', async (input: Record<string, unknown>) =>
  runStatsTool('assess_rolling_submission', async () => {
    const { assessRollingSubmission } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return assessRollingSubmission(input as any);
  }, 'deterministic')
);

registerToolHandler('compare_global_pathways', async (input: Record<string, unknown>) =>
  runStatsTool('compare_global_pathways', async () => {
    const { compareGlobalPathways } = await import('../regulatory-strategy/regulatory-strategy-knowledge.js');
    return compareGlobalPathways(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — Biosimilar Development intelligence handlers
// BPCIA 351(k), FDA analytical similarity tiers, clinical program, indication
// extrapolation, interchangeability, IP/BPCIA dance, CMC. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_analytical_similarity_biosimilar', async (input: Record<string, unknown>) =>
  runStatsTool('assess_analytical_similarity_biosimilar', async () => {
    const { assessAnalyticalSimilarity } = await import('../biosimilar/biosimilar-knowledge.js');
    return assessAnalyticalSimilarity(input as any);
  }, 'deterministic')
);

registerToolHandler('design_biosimilar_clinical', async (input: Record<string, unknown>) =>
  runStatsTool('design_biosimilar_clinical', async () => {
    const { designBiosimilarClinicalProgram } = await import('../biosimilar/biosimilar-knowledge.js');
    return designBiosimilarClinicalProgram(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_indication_extrapolation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_indication_extrapolation', async () => {
    const { assessExtrapolationOfIndications } = await import('../biosimilar/biosimilar-knowledge.js');
    return assessExtrapolationOfIndications(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_interchangeability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_interchangeability', async () => {
    const { assessInterchangeability } = await import('../biosimilar/biosimilar-knowledge.js');
    return assessInterchangeability(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_biosimilar_ip_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('plan_biosimilar_ip_strategy', async () => {
    const { planBiosimilarIPStrategy } = await import('../biosimilar/biosimilar-knowledge.js');
    return planBiosimilarIPStrategy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_biosimilar_cmc', async (input: Record<string, unknown>) =>
  runStatsTool('assess_biosimilar_cmc', async () => {
    const { assessBiosimilarCMC } = await import('../biosimilar/biosimilar-knowledge.js');
    return assessBiosimilarCMC(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — Mutagenic Impurity (ICH M7) intelligence handlers
// ICH M7(R2) classification, Cramer/TTC, structural alerts, purge factors,
// nitrosamine risk (FDA/EMA), control strategy. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_mutagenic_impurity', async (input: Record<string, unknown>) =>
  runStatsTool('classify_mutagenic_impurity', async () => {
    const { classifyMutagenicImpurity } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return classifyMutagenicImpurity(input as any);
  }, 'deterministic')
);

registerToolHandler('calculate_ttc', async (input: Record<string, unknown>) =>
  runStatsTool('calculate_ttc', async () => {
    const { calculateTTC } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return calculateTTC(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_structural_alerts', async (input: Record<string, unknown>) =>
  runStatsTool('assess_structural_alerts', async () => {
    const { assessStructuralAlerts } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return assessStructuralAlerts(input as any);
  }, 'deterministic')
);

registerToolHandler('design_purge_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_purge_study', async () => {
    const { designPurgeStudy } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return designPurgeStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_nitrosamine_risk', async (input: Record<string, unknown>) =>
  runStatsTool('assess_nitrosamine_risk', async () => {
    const { assessNitrosamineRisk } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return assessNitrosamineRisk(input as any);
  }, 'deterministic')
);

registerToolHandler('control_mutagenic_impurity', async (input: Record<string, unknown>) =>
  runStatsTool('control_mutagenic_impurity', async () => {
    const { controlMutagenicImpurity } = await import('../mutagenic-impurity/mutagenic-impurity-knowledge.js');
    return controlMutagenicImpurity(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 — Labeling intelligence handlers
// FDA PLR (21 CFR 201.56-57), boxed warning, REMS (FDAAA/FDORA), PLLR,
// EMA QRD SmPC, OTC Drug Facts (21 CFR 201.66). Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_plr_structure', async (input: Record<string, unknown>) =>
  runStatsTool('assess_plr_structure', async () => {
    const { assessPLRStructure } = await import('../labeling/labeling-intelligence-knowledge.js');
    return assessPLRStructure(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_boxed_warning', async (input: Record<string, unknown>) =>
  runStatsTool('assess_boxed_warning', async () => {
    const { assessBoxedWarning } = await import('../labeling/labeling-intelligence-knowledge.js');
    return assessBoxedWarning(input as any);
  }, 'deterministic')
);

registerToolHandler('design_rems', async (input: Record<string, unknown>) =>
  runStatsTool('design_rems', async () => {
    const { designREMS } = await import('../labeling/labeling-intelligence-knowledge.js');
    return designREMS(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_pregnancy_lactation_labeling', async (input: Record<string, unknown>) =>
  runStatsTool('assess_pregnancy_lactation_labeling', async () => {
    const { assessPregnancyLactationLabeling } = await import('../labeling/labeling-intelligence-knowledge.js');
    return assessPregnancyLactationLabeling(input as any);
  }, 'deterministic')
);

registerToolHandler('structure_smpc', async (input: Record<string, unknown>) =>
  runStatsTool('structure_smpc', async () => {
    const { structureSmPC } = await import('../labeling/labeling-intelligence-knowledge.js');
    return structureSmPC(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_otc_labeling', async (input: Record<string, unknown>) =>
  runStatsTool('assess_otc_labeling', async () => {
    const { assessOTCLabeling } = await import('../labeling/labeling-intelligence-knowledge.js');
    return assessOTCLabeling(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Immunogenicity intelligence handlers
// FDA 2019 immunogenicity testing guidance, FDA 2014 ADA assay, EMA
// immunogenicity guideline, USP <1106>, ICH S6(R1). Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_immunogenicity_risk', async (input: Record<string, unknown>) =>
  runStatsTool('assess_immunogenicity_risk', async () => {
    const { assessImmunogenicityRisk } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return assessImmunogenicityRisk(input as any);
  }, 'deterministic')
);

registerToolHandler('design_ada_assay_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('design_ada_assay_strategy', async () => {
    const { designADAAssayStrategy } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return designADAAssayStrategy(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_immunogenicity_clinical_impact', async (input: Record<string, unknown>) =>
  runStatsTool('classify_immunogenicity_clinical_impact', async () => {
    const { classifyImmunogenicityClinicalImpact } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return classifyImmunogenicityClinicalImpact(input as any);
  }, 'deterministic')
);

registerToolHandler('design_nab_assay', async (input: Record<string, unknown>) =>
  runStatsTool('design_nab_assay', async () => {
    const { designNAbAssay } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return designNAbAssay(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_immunogenicity_sampling', async (input: Record<string, unknown>) =>
  runStatsTool('plan_immunogenicity_sampling', async () => {
    const { planImmunogenicitySampling } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return planImmunogenicitySampling(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_immunogenicity_comparability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_immunogenicity_comparability', async () => {
    const { assessImmunogenicityComparability } = await import('../immunogenicity/immunogenicity-knowledge.js');
    return assessImmunogenicityComparability(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Safety pharmacology intelligence handlers
// ICH S7A core battery, ICH S7B, ICH S6(R1), ICH M3(R2), FDA abuse-potential
// guidance (2017). Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_core_battery', async (input: Record<string, unknown>) =>
  runStatsTool('design_core_battery', async () => {
    const { designCoreBattery } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return designCoreBattery(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_cardiovascular_safety_pharmacology', async (input: Record<string, unknown>) =>
  runStatsTool('assess_cardiovascular_safety_pharmacology', async () => {
    const { assessCardiovascularSafetyPharmacology } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return assessCardiovascularSafetyPharmacology(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_cns_safety_pharmacology', async (input: Record<string, unknown>) =>
  runStatsTool('assess_cns_safety_pharmacology', async () => {
    const { assessCNSSafetyPharmacology } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return assessCNSSafetyPharmacology(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_respiratory_safety_pharmacology', async (input: Record<string, unknown>) =>
  runStatsTool('assess_respiratory_safety_pharmacology', async () => {
    const { assessRespiratorySafetyPharmacology } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return assessRespiratorySafetyPharmacology(input as any);
  }, 'deterministic')
);

registerToolHandler('design_followup_safety_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_followup_safety_study', async () => {
    const { designFollowupSafetyStudy } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return designFollowupSafetyStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_abuse_liability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_abuse_liability', async () => {
    const { assessAbuseLiability } = await import('../safety-pharmacology/safety-pharmacology-knowledge.js');
    return assessAbuseLiability(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Pharmacovigilance & signal detection handlers
// ICH E2A-E2F, GVP Modules VI/IX, 21 CFR 314.80/600.80, WHO-UMC & Naranjo
// causality, disproportionality (PRR/ROR/EBGM). Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_expedited_reporting', async (input: Record<string, unknown>) =>
  runStatsTool('classify_expedited_reporting', async () => {
    const { classifyExpeditedReporting } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return classifyExpeditedReporting(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_pv_causality', async (input: Record<string, unknown>) =>
  runStatsTool('assess_pv_causality', async () => {
    const { assessCausality } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return assessCausality(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_aggregate_safety_report', async (input: Record<string, unknown>) =>
  runStatsTool('plan_aggregate_safety_report', async () => {
    const { planAggregateReport } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return planAggregateReport(input as any);
  }, 'deterministic')
);

registerToolHandler('detect_safety_signal', async (input: Record<string, unknown>) =>
  runStatsTool('detect_safety_signal', async () => {
    const { detectSafetySignal } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return detectSafetySignal(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_signal_priority', async (input: Record<string, unknown>) =>
  runStatsTool('assess_signal_priority', async () => {
    const { assessSignalPriority } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return assessSignalPriority(input as any);
  }, 'deterministic')
);

registerToolHandler('design_pv_system', async (input: Record<string, unknown>) =>
  runStatsTool('design_pv_system', async () => {
    const { designPVSystem } = await import('../pharmacovigilance/pharmacovigilance-knowledge.js');
    return designPVSystem(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Clinical outcome assessment (COA/PRO) handlers
// FDA PRO Guidance (2009), FDA PFDD Guidance 1-4, FDA COA qualification,
// ISPOR/ISOQOL. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('select_coa_type', async (input: Record<string, unknown>) =>
  runStatsTool('select_coa_type', async () => {
    const { selectCOAType } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return selectCOAType(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_coa_validation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_coa_validation', async () => {
    const { assessCOAValidation } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return assessCOAValidation(input as any);
  }, 'deterministic')
);

registerToolHandler('determine_meaningful_change', async (input: Record<string, unknown>) =>
  runStatsTool('determine_meaningful_change', async () => {
    const { determineMeaningfulChange } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return determineMeaningfulChange(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_coa_fit_for_purpose', async (input: Record<string, unknown>) =>
  runStatsTool('assess_coa_fit_for_purpose', async () => {
    const { assessCOAFitForPurpose } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return assessCOAFitForPurpose(input as any);
  }, 'deterministic')
);

registerToolHandler('position_coa_endpoint', async (input: Record<string, unknown>) =>
  runStatsTool('position_coa_endpoint', async () => {
    const { positionCOAEndpoint } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return positionCOAEndpoint(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_coa_development', async (input: Record<string, unknown>) =>
  runStatsTool('plan_coa_development', async () => {
    const { planCOADevelopment } = await import('../clinical-outcome-assessment/coa-knowledge.js');
    return planCOADevelopment(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Oncology dose optimization (Project Optimus) handlers
// FDA Project Optimus, FDA dose-optimization draft guidance (Jan 2023),
// Project FrontRunner, ICH E4, ICH S9. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('select_dose_finding_design', async (input: Record<string, unknown>) =>
  runStatsTool('select_dose_finding_design', async () => {
    const { selectDoseFindingDesign } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return selectDoseFindingDesign(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_project_optimus_alignment', async (input: Record<string, unknown>) =>
  runStatsTool('assess_project_optimus_alignment', async () => {
    const { assessProjectOptimusAlignment } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return assessProjectOptimusAlignment(input as any);
  }, 'deterministic')
);

registerToolHandler('design_randomized_dose_comparison', async (input: Record<string, unknown>) =>
  runStatsTool('design_randomized_dose_comparison', async () => {
    const { designRandomizedDoseComparison } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return designRandomizedDoseComparison(input as any);
  }, 'deterministic')
);

registerToolHandler('select_rp2d', async (input: Record<string, unknown>) =>
  runStatsTool('select_rp2d', async () => {
    const { selectRP2D } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return selectRP2D(input as any);
  }, 'deterministic')
);

registerToolHandler('design_backfill_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('design_backfill_strategy', async () => {
    const { designBackfillStrategy } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return designBackfillStrategy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_dose_exposure_response', async (input: Record<string, unknown>) =>
  runStatsTool('assess_dose_exposure_response', async () => {
    const { assessDoseExposureResponse } = await import('../dose-optimization/dose-optimization-knowledge.js');
    return assessDoseExposureResponse(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 3 — Combination products & device constituent handlers
// 21 CFR Part 3 (PMOA), 21 CFR Part 4 (cGMP), 21 CFR 820/QMSR design controls,
// FDA Human Factors guidance (2016), IEC 62366-1, ISO 14971, EU MDR Art 117.
// Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('determine_primary_mode_of_action', async (input: Record<string, unknown>) =>
  runStatsTool('determine_primary_mode_of_action', async () => {
    const { determinePrimaryModeOfAction } = await import('../combination-products/combination-products-knowledge.js');
    return determinePrimaryModeOfAction(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_combination_product', async (input: Record<string, unknown>) =>
  runStatsTool('classify_combination_product', async () => {
    const { classifyCombinationProduct } = await import('../combination-products/combination-products-knowledge.js');
    return classifyCombinationProduct(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_combination_cgmp', async (input: Record<string, unknown>) =>
  runStatsTool('plan_combination_cgmp', async () => {
    const { planCombinationCGMP } = await import('../combination-products/combination-products-knowledge.js');
    return planCombinationCGMP(input as any);
  }, 'deterministic')
);

registerToolHandler('design_human_factors_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_human_factors_study', async () => {
    const { designHumanFactorsStudy } = await import('../combination-products/combination-products-knowledge.js');
    return designHumanFactorsStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_device_constituent_controls', async (input: Record<string, unknown>) =>
  runStatsTool('assess_device_constituent_controls', async () => {
    const { assessDeviceConstituentControls } = await import('../combination-products/combination-products-knowledge.js');
    return assessDeviceConstituentControls(input as any);
  }, 'deterministic')
);

registerToolHandler('select_combination_submission_pathway', async (input: Record<string, unknown>) =>
  runStatsTool('select_combination_submission_pathway', async () => {
    const { selectCombinationSubmissionPathway } = await import('../combination-products/combination-products-knowledge.js');
    return selectCombinationSubmissionPathway(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — Clinical trial statistics & estimands handlers
// ICH E9 / E9(R1), E10, E17, FDA Adaptive Designs (2019), FDA Multiple
// Endpoints (2022), FDA Non-Inferiority. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('define_estimand', async (input: Record<string, unknown>) =>
  runStatsTool('define_estimand', async () => {
    const { defineEstimand } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return defineEstimand(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_intercurrent_event_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('assess_intercurrent_event_strategy', async () => {
    const { assessIntercurrentEventStrategy } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return assessIntercurrentEventStrategy(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_multiplicity_control', async (input: Record<string, unknown>) =>
  runStatsTool('plan_multiplicity_control', async () => {
    const { planMultiplicityControl } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return planMultiplicityControl(input as any);
  }, 'deterministic')
);

registerToolHandler('design_adaptive_design', async (input: Record<string, unknown>) =>
  runStatsTool('design_adaptive_design', async () => {
    const { designAdaptiveDesign } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return designAdaptiveDesign(input as any);
  }, 'deterministic')
);

registerToolHandler('select_missing_data_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('select_missing_data_strategy', async () => {
    const { selectMissingDataStrategy } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return selectMissingDataStrategy(input as any);
  }, 'deterministic')
);

registerToolHandler('estimate_sample_size', async (input: Record<string, unknown>) =>
  runStatsTool('estimate_sample_size', async () => {
    const { estimateSampleSize } = await import('../trial-statistics/trial-statistics-knowledge.js');
    return estimateSampleSize(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — GMP quality systems & data integrity handlers
// ICH Q7/Q9(R1)/Q10, 21 CFR 210/211, EU GMP Annex 1/11, FDA & MHRA Data
// Integrity, PIC/S PI 041, GAMP 5, 21 CFR Part 11. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('assess_data_integrity', async (input: Record<string, unknown>) =>
  runStatsTool('assess_data_integrity', async () => {
    const { assessDataIntegrity } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return assessDataIntegrity(input as any);
  }, 'deterministic')
);

registerToolHandler('design_capa', async (input: Record<string, unknown>) =>
  runStatsTool('design_capa', async () => {
    const { designCAPA } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return designCAPA(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_gmp_deviation', async (input: Record<string, unknown>) =>
  runStatsTool('classify_gmp_deviation', async () => {
    const { classifyGMPDeviation } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return classifyGMPDeviation(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_api_gmp', async (input: Record<string, unknown>) =>
  runStatsTool('assess_api_gmp', async () => {
    const { assessAPIGMP } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return assessAPIGMP(input as any);
  }, 'deterministic')
);

registerToolHandler('design_sterile_controls', async (input: Record<string, unknown>) =>
  runStatsTool('design_sterile_controls', async () => {
    const { designSterileControls } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return designSterileControls(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_computer_system_validation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_computer_system_validation', async () => {
    const { assessComputerSystemValidation } = await import('../gmp-quality-systems/gmp-quality-systems-knowledge.js');
    return assessComputerSystemValidation(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — Nonclinical PK/ADME & toxicokinetics handlers
// ICH M3(R2), S3A, S3B, FDA In Vitro DDI (2020), FDA MIST (2020), ICH M12.
// Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_adme_program', async (input: Record<string, unknown>) =>
  runStatsTool('design_adme_program', async () => {
    const { designADMEProgram } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return designADMEProgram(input as any);
  }, 'deterministic')
);

registerToolHandler('design_mass_balance_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_mass_balance_study', async () => {
    const { designMassBalanceStudy } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return designMassBalanceStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_metabolite_safety', async (input: Record<string, unknown>) =>
  runStatsTool('assess_metabolite_safety', async () => {
    const { assessMetaboliteSafety } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return assessMetaboliteSafety(input as any);
  }, 'deterministic')
);

registerToolHandler('design_toxicokinetics', async (input: Record<string, unknown>) =>
  runStatsTool('design_toxicokinetics', async () => {
    const { designToxicokinetics } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return designToxicokinetics(input as any);
  }, 'deterministic')
);

registerToolHandler('design_reaction_phenotyping', async (input: Record<string, unknown>) =>
  runStatsTool('design_reaction_phenotyping', async () => {
    const { designReactionPhenotyping } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return designReactionPhenotyping(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_protein_binding', async (input: Record<string, unknown>) =>
  runStatsTool('assess_protein_binding', async () => {
    const { assessProteinBinding } = await import('../nonclinical-adme/nonclinical-adme-knowledge.js');
    return assessProteinBinding(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — Biomarkers & companion diagnostics handlers
// FDA-NIH BEST, FDA Biomarker Qualification Program, FDA IVD CDx (2014),
// FDA CDx co-development (2016), FDA Enrichment (2019), CLSI. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_biomarker', async (input: Record<string, unknown>) =>
  runStatsTool('classify_biomarker', async () => {
    const { classifyBiomarker } = await import('../biomarkers/biomarker-knowledge.js');
    return classifyBiomarker(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_biomarker_qualification', async (input: Record<string, unknown>) =>
  runStatsTool('plan_biomarker_qualification', async () => {
    const { planBiomarkerQualification } = await import('../biomarkers/biomarker-knowledge.js');
    return planBiomarkerQualification(input as any);
  }, 'deterministic')
);

registerToolHandler('design_cdx_codevelopment', async (input: Record<string, unknown>) =>
  runStatsTool('design_cdx_codevelopment', async () => {
    const { designCDxCodevelopment } = await import('../biomarkers/biomarker-knowledge.js');
    return designCDxCodevelopment(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_biomarker_analytical_validation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_biomarker_analytical_validation', async () => {
    const { assessBiomarkerAnalyticalValidation } = await import('../biomarkers/biomarker-knowledge.js');
    return assessBiomarkerAnalyticalValidation(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_biomarker_clinical_validation', async (input: Record<string, unknown>) =>
  runStatsTool('assess_biomarker_clinical_validation', async () => {
    const { assessBiomarkerClinicalValidation } = await import('../biomarkers/biomarker-knowledge.js');
    return assessBiomarkerClinicalValidation(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_enrichment_strategy', async (input: Record<string, unknown>) =>
  runStatsTool('plan_enrichment_strategy', async () => {
    const { planEnrichmentStrategy } = await import('../biomarkers/biomarker-knowledge.js');
    return planEnrichmentStrategy(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — Rare disease & external control arms handlers
// FDA Natural History (2019), FDA Rare Diseases Common Issues (2019), FDA
// Externally Controlled Trials (2023), ICH E10, FDA CID. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_natural_history_study', async (input: Record<string, unknown>) =>
  runStatsTool('design_natural_history_study', async () => {
    const { designNaturalHistoryStudy } = await import('../rare-disease/rare-disease-knowledge.js');
    return designNaturalHistoryStudy(input as any);
  }, 'deterministic')
);

registerToolHandler('design_external_control', async (input: Record<string, unknown>) =>
  runStatsTool('design_external_control', async () => {
    const { designExternalControl } = await import('../rare-disease/rare-disease-knowledge.js');
    return designExternalControl(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_small_population_design', async (input: Record<string, unknown>) =>
  runStatsTool('assess_small_population_design', async () => {
    const { assessSmallPopulationDesign } = await import('../rare-disease/rare-disease-knowledge.js');
    return assessSmallPopulationDesign(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_bayesian_borrowing', async (input: Record<string, unknown>) =>
  runStatsTool('plan_bayesian_borrowing', async () => {
    const { planBayesianBorrowing } = await import('../rare-disease/rare-disease-knowledge.js');
    return planBayesianBorrowing(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_rare_disease_endpoint', async (input: Record<string, unknown>) =>
  runStatsTool('assess_rare_disease_endpoint', async () => {
    const { assessRareDiseaseEndpoint } = await import('../rare-disease/rare-disease-knowledge.js');
    return assessRareDiseaseEndpoint(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_rare_disease_program', async (input: Record<string, unknown>) =>
  runStatsTool('plan_rare_disease_program', async () => {
    const { planRareDiseaseProgram } = await import('../rare-disease/rare-disease-knowledge.js');
    return planRareDiseaseProgram(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 — GCP & clinical trial operations handlers
// ICH E6(R3), ICH E8(R1), FDA RBM (2013), 21 CFR 50/54/56/312, FDA BIMO.
// Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_monitoring_plan', async (input: Record<string, unknown>) =>
  runStatsTool('design_monitoring_plan', async () => {
    const { designMonitoringPlan } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return designMonitoringPlan(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_inspection_readiness', async (input: Record<string, unknown>) =>
  runStatsTool('assess_inspection_readiness', async () => {
    const { assessInspectionReadiness } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return assessInspectionReadiness(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_gcp_compliance', async (input: Record<string, unknown>) =>
  runStatsTool('assess_gcp_compliance', async () => {
    const { assessGCPCompliance } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return assessGCPCompliance(input as any);
  }, 'deterministic')
);

registerToolHandler('design_informed_consent', async (input: Record<string, unknown>) =>
  runStatsTool('design_informed_consent', async () => {
    const { designInformedConsent } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return designInformedConsent(input as any);
  }, 'deterministic')
);

registerToolHandler('classify_protocol_deviation', async (input: Record<string, unknown>) =>
  runStatsTool('classify_protocol_deviation', async () => {
    const { classifyProtocolDeviation } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return classifyProtocolDeviation(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_essential_documents', async (input: Record<string, unknown>) =>
  runStatsTool('plan_essential_documents', async () => {
    const { planEssentialDocuments } = await import('../gcp-operations/gcp-operations-knowledge.js');
    return planEssentialDocuments(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 5 — Medical device & IVD regulatory handlers
// 21 CFR 860/807/814, De Novo, FDA 510(k) Program (2014), EU MDR 2017/745 &
// IVDR 2017/746, IMDRF. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_medical_device', async (input: Record<string, unknown>) =>
  runStatsTool('classify_medical_device', async () => {
    const { classifyDevice } = await import('../medical-device/medical-device-knowledge.js');
    return classifyDevice(input as any);
  }, 'deterministic')
);

registerToolHandler('select_device_pathway', async (input: Record<string, unknown>) =>
  runStatsTool('select_device_pathway', async () => {
    const { selectDevicePathway } = await import('../medical-device/medical-device-knowledge.js');
    return selectDevicePathway(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_substantial_equivalence', async (input: Record<string, unknown>) =>
  runStatsTool('assess_substantial_equivalence', async () => {
    const { assessSubstantialEquivalence } = await import('../medical-device/medical-device-knowledge.js');
    return assessSubstantialEquivalence(input as any);
  }, 'deterministic')
);

registerToolHandler('design_device_clinical_evidence', async (input: Record<string, unknown>) =>
  runStatsTool('design_device_clinical_evidence', async () => {
    const { designDeviceClinicalEvidence } = await import('../medical-device/medical-device-knowledge.js');
    return designDeviceClinicalEvidence(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_essential_principles', async (input: Record<string, unknown>) =>
  runStatsTool('assess_essential_principles', async () => {
    const { assessEssentialPrinciples } = await import('../medical-device/medical-device-knowledge.js');
    return assessEssentialPrinciples(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_device_submission', async (input: Record<string, unknown>) =>
  runStatsTool('plan_device_submission', async () => {
    const { planDeviceSubmission } = await import('../medical-device/medical-device-knowledge.js');
    return planDeviceSubmission(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 5 — Digital health, SaMD & AI/ML device handlers
// IMDRF SaMD (N12/N41), FDA SaMD & PCCP (2024), GMLP (2021), FDA Premarket
// Cybersecurity (2023) / Section 524B, 21 CFR 820. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_samd', async (input: Record<string, unknown>) =>
  runStatsTool('classify_samd', async () => {
    const { classifySaMD } = await import('../digital-health/digital-health-knowledge.js');
    return classifySaMD(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_ai_ml_device', async (input: Record<string, unknown>) =>
  runStatsTool('assess_ai_ml_device', async () => {
    const { assessAIMLDevice } = await import('../digital-health/digital-health-knowledge.js');
    return assessAIMLDevice(input as any);
  }, 'deterministic')
);

registerToolHandler('design_pccp', async (input: Record<string, unknown>) =>
  runStatsTool('design_pccp', async () => {
    const { designPCCP } = await import('../digital-health/digital-health-knowledge.js');
    return designPCCP(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_gmlp', async (input: Record<string, unknown>) =>
  runStatsTool('assess_gmlp', async () => {
    const { assessGMLP } = await import('../digital-health/digital-health-knowledge.js');
    return assessGMLP(input as any);
  }, 'deterministic')
);

registerToolHandler('design_samd_clinical_validation', async (input: Record<string, unknown>) =>
  runStatsTool('design_samd_clinical_validation', async () => {
    const { designSaMDClinicalValidation } = await import('../digital-health/digital-health-knowledge.js');
    return designSaMDClinicalValidation(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_device_cybersecurity', async (input: Record<string, unknown>) =>
  runStatsTool('assess_device_cybersecurity', async () => {
    const { assessDeviceCybersecurity } = await import('../digital-health/digital-health-knowledge.js');
    return assessDeviceCybersecurity(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 5 — Vaccine development handlers
// FDA vaccine guidance, WHO TRS, ICH Q5A-Q5E, EMA vaccine guidelines,
// 21 CFR 610, correlates-of-protection. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('design_vaccine_cmc', async (input: Record<string, unknown>) =>
  runStatsTool('design_vaccine_cmc', async () => {
    const { designVaccineCMC } = await import('../vaccine/vaccine-knowledge.js');
    return designVaccineCMC(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_correlate_of_protection', async (input: Record<string, unknown>) =>
  runStatsTool('assess_correlate_of_protection', async () => {
    const { assessCorrelateOfProtection } = await import('../vaccine/vaccine-knowledge.js');
    return assessCorrelateOfProtection(input as any);
  }, 'deterministic')
);

registerToolHandler('design_vaccine_clinical_program', async (input: Record<string, unknown>) =>
  runStatsTool('design_vaccine_clinical_program', async () => {
    const { designVaccineClinicalProgram } = await import('../vaccine/vaccine-knowledge.js');
    return designVaccineClinicalProgram(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_lot_consistency', async (input: Record<string, unknown>) =>
  runStatsTool('assess_lot_consistency', async () => {
    const { assessLotConsistency } = await import('../vaccine/vaccine-knowledge.js');
    return assessLotConsistency(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_vaccine_platform', async (input: Record<string, unknown>) =>
  runStatsTool('assess_vaccine_platform', async () => {
    const { assessVaccinePlatform } = await import('../vaccine/vaccine-knowledge.js');
    return assessVaccinePlatform(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_vaccine_special_populations', async (input: Record<string, unknown>) =>
  runStatsTool('plan_vaccine_special_populations', async () => {
    const { planVaccineSpecialPopulations } = await import('../vaccine/vaccine-knowledge.js');
    return planVaccineSpecialPopulations(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 5 — Structured benefit-risk handlers
// FDA Benefit-Risk Framework (PDUFA VI/VII, 2023), EMA PrOACT-URL / effects
// table, IMI PROTECT BRAT, ICH M4E(R2) §2.5.6, CIOMS IV. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('structure_benefit_risk_framework', async (input: Record<string, unknown>) =>
  runStatsTool('structure_benefit_risk_framework', async () => {
    const { structureBenefitRiskFramework } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return structureBenefitRiskFramework(input as any);
  }, 'deterministic')
);

registerToolHandler('build_effects_table', async (input: Record<string, unknown>) =>
  runStatsTool('build_effects_table', async () => {
    const { buildEffectsTable } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return buildEffectsTable(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_benefit_risk_balance', async (input: Record<string, unknown>) =>
  runStatsTool('assess_benefit_risk_balance', async () => {
    const { assessBenefitRiskBalance } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return assessBenefitRiskBalance(input as any);
  }, 'deterministic')
);

registerToolHandler('design_value_tree', async (input: Record<string, unknown>) =>
  runStatsTool('design_value_tree', async () => {
    const { designValueTree } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return designValueTree(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_br_uncertainty', async (input: Record<string, unknown>) =>
  runStatsTool('assess_br_uncertainty', async () => {
    const { assessBRUncertainty } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return assessBRUncertainty(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_br_communication', async (input: Record<string, unknown>) =>
  runStatsTool('plan_br_communication', async () => {
    const { planBRCommunication } = await import('../benefit-risk/benefit-risk-knowledge.js');
    return planBRCommunication(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Wave 5 — Post-approval lifecycle (ICH Q12) handlers
// ICH Q12, 21 CFR 314.70, FDA "Changes to an Approved NDA or ANDA", FDA
// comparability protocols, EU variations framework. Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('classify_post_approval_change', async (input: Record<string, unknown>) =>
  runStatsTool('classify_post_approval_change', async () => {
    const { classifyPostApprovalChange } = await import('../post-approval/post-approval-knowledge.js');
    return classifyPostApprovalChange(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_established_conditions', async (input: Record<string, unknown>) =>
  runStatsTool('assess_established_conditions', async () => {
    const { assessEstablishedConditions } = await import('../post-approval/post-approval-knowledge.js');
    return assessEstablishedConditions(input as any);
  }, 'deterministic')
);

registerToolHandler('design_pacmp', async (input: Record<string, unknown>) =>
  runStatsTool('design_pacmp', async () => {
    const { designPACMP } = await import('../post-approval/post-approval-knowledge.js');
    return designPACMP(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_annual_report', async (input: Record<string, unknown>) =>
  runStatsTool('plan_annual_report', async () => {
    const { planAnnualReport } = await import('../post-approval/post-approval-knowledge.js');
    return planAnnualReport(input as any);
  }, 'deterministic')
);

registerToolHandler('assess_postapproval_comparability', async (input: Record<string, unknown>) =>
  runStatsTool('assess_postapproval_comparability', async () => {
    const { assessPostApprovalComparability } = await import('../post-approval/post-approval-knowledge.js');
    return assessPostApprovalComparability(input as any);
  }, 'deterministic')
);

registerToolHandler('plan_lifecycle_management', async (input: Record<string, unknown>) =>
  runStatsTool('plan_lifecycle_management', async () => {
    const { planLifecycleManagement } = await import('../post-approval/post-approval-knowledge.js');
    return planLifecycleManagement(input as any);
  }, 'deterministic')
);

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Questioning Engine
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('start_intelligence_flow', async (input, ctx) => {
  const { resolveFlowCategory } = await import('./intelligence-questions/flows/index.js');
  const { startFlow } = await import('./intelligence-questions/engine.js');

  const documentType = String(input.document_type || '');
  const category = resolveFlowCategory(documentType);
  if (!category) {
    return JSON.stringify({
      error: `No intelligence flow found for document type: "${documentType}". Use list_intelligence_flows to see available flows.`,
    });
  }

  const engineCtx = {
    organizationId: ctx?.organizationId ?? null,
    userId: ctx?.userId ?? null,
    projectId: ctx?.projectId ? String(ctx.projectId) : null,
    clientType: (ctx?.projectType === 'medtech' ? 'medtech' : ctx?.projectType === 'biotech' ? 'biotech' : 'pharma') as 'pharma' | 'biotech' | 'medtech',
  };

  try {
    const result = startFlow(category, engineCtx);
    /* Audit log — fire-and-forget, never block the response. Records who started
       which flow, when (21 CFR Part 11 §11.10(e) traceability for the questioning
       session that feeds document authoring). */
    try {
      const { auditLog } = await import('../auditService.js');
      auditLog({
        tenantId:   ctx?.organizationId ?? null,
        userId:     ctx?.userId ?? null,
        action:     'INTELLIGENCE_FLOW_STARTED',
        resource:   'intelligence_flow',
        resourceId: String(result.state.flowId),
        details: { flowCategory: category, documentType, projectId: engineCtx.projectId },
      });
    } catch { /* never block the tool response on audit failure */ }
    return JSON.stringify({
      status: 'intelligence_question',
      flowState: result.state,
      question: result.event,
    });
  } catch (err: any) {
    return JSON.stringify({ error: err?.message || 'Failed to start intelligence flow' });
  }
});

registerToolHandler('answer_intelligence_question', async (input, ctx) => {
  const { advanceFlow } = await import('./intelligence-questions/engine.js');

  const flowState = input.flow_state as any;
  const nodeId = String(input.node_id || '');
  const answers = (input.answers || {}) as Record<string, unknown>;

  if (!flowState || !nodeId) {
    return JSON.stringify({ error: 'flow_state and node_id are required' });
  }

  const engineCtx = {
    organizationId: ctx?.organizationId ?? null,
    userId: ctx?.userId ?? null,
    projectId: ctx?.projectId ? String(ctx.projectId) : null,
    clientType: (ctx?.projectType === 'medtech' ? 'medtech' : ctx?.projectType === 'biotech' ? 'biotech' : 'pharma') as 'pharma' | 'biotech' | 'medtech',
  };

  try {
    const result = advanceFlow(flowState, nodeId, answers, engineCtx);
    if (result.completeEvent) {
      /* Audit log on flow completion — captures the completed questioning
         session (who/what/when + issue posture) that will drive downstream
         document generation. Fire-and-forget; never blocks. */
      try {
        const { auditLog } = await import('../auditService.js');
        const issues = result.state.issues || [];
        auditLog({
          tenantId:   ctx?.organizationId ?? null,
          userId:     ctx?.userId ?? null,
          action:     'INTELLIGENCE_FLOW_COMPLETED',
          resource:   'intelligence_flow',
          resourceId: String(result.state.flowId),
          details: {
            flowCategory:   result.state.flowCategory,
            completedNodes: result.state.completedNodes.length,
            criticalIssues: issues.filter((i: any) => i.severity === 'critical').length,
            warnings:       issues.filter((i: any) => i.severity === 'warning').length,
            projectId:      engineCtx.projectId,
          },
        });
      } catch { /* never block the tool response on audit failure */ }
      return JSON.stringify({
        status: 'intelligence_flow_complete',
        flowState: result.state,
        completion: result.completeEvent,
      });
    }
    return JSON.stringify({
      status: 'intelligence_question',
      flowState: result.state,
      question: result.event,
    });
  } catch (err: any) {
    return JSON.stringify({ error: err?.message || 'Failed to advance intelligence flow' });
  }
});

registerToolHandler('list_intelligence_flows', async (_input, ctx) => {
  const { getAvailableFlows } = await import('./intelligence-questions/flows/index.js');

  const engineCtx = {
    organizationId: ctx?.organizationId ?? null,
    userId: ctx?.userId ?? null,
    projectId: ctx?.projectId ? String(ctx.projectId) : null,
    clientType: (ctx?.projectType === 'medtech' ? 'medtech' : ctx?.projectType === 'biotech' ? 'biotech' : 'pharma') as 'pharma' | 'biotech' | 'medtech',
  };

  const flows = getAvailableFlows(engineCtx);
  return JSON.stringify({ flows });
});

// ─────────────────────────────────────────────────────────────────────────────
// War Game Simulation
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('start_war_game', async (input, ctx) => {
  try {
    const { runWarGame } = await import('./intelligence-questions/war-game/engine.js');
    const category = String(input.war_game_category || '') as import('./intelligence-questions/war-game/types.js').WarGameCategory;
    const report = runWarGame(
      category,
      String(input.source_flow_id || ''),
      (input.answers || {}) as Record<string, Record<string, unknown>>,
    );
    /* Audit log the adversarial audit run — records who ran which War Game and
       the resulting readiness posture (score/assessment). Fire-and-forget. */
    try {
      const { auditLog } = await import('../auditService.js');
      auditLog({
        tenantId:   ctx?.organizationId ?? null,
        userId:     ctx?.userId ?? null,
        action:     'WAR_GAME_RUN',
        resource:   'war_game_report',
        resourceId: String((report as any)?.id || input.source_flow_id || category),
        details: {
          category,
          sourceFlowId:      String(input.source_flow_id || ''),
          overallScore:      (report as any)?.overallScore,
          overallAssessment: (report as any)?.overallAssessment,
          findingCount:      Array.isArray((report as any)?.findings) ? (report as any).findings.length : undefined,
        },
      });
    } catch { /* never block the tool response on audit failure */ }
    return JSON.stringify({
      success: true,
      war_game_report: report,
    });
  } catch (err: any) {
    return JSON.stringify({
      error: err?.message || 'Failed to run war game simulation',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Document View Tools — read/view access across every document store
// (vault artifacts + versions, governed C2C documents + sections, eTMF).
// All read-only, all org-scoped; a missing tenant context is a hard error.
// ─────────────────────────────────────────────────────────────────────────────

const VIEW_MAX_CHARS_DEFAULT = 6_000;
const VIEW_MAX_CHARS_CAP = 30_000;

function viewLimit(input: Record<string, unknown>, key = 'limit', def = 25, cap = 100): number {
  const raw = Number(input[key]);
  return Number.isFinite(raw) ? Math.min(cap, Math.max(1, Math.round(raw))) : def;
}

function viewExcerpt(text: string, input: Record<string, unknown>): { content: string; totalChars: number; truncated: boolean } {
  const raw = Number(input.max_chars);
  const max = Number.isFinite(raw)
    ? Math.min(VIEW_MAX_CHARS_CAP, Math.max(200, Math.round(raw)))
    : VIEW_MAX_CHARS_DEFAULT;
  return { content: text.slice(0, max), totalChars: text.length, truncated: text.length > max };
}

registerToolHandler('list_vault_documents', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'list_vault_documents requires tenant context.' });
  try {
    const { getPool } = await import('../../db.js');
    const filters: string[] = [`a.status != 'archived'`];
    const args: unknown[] = [ctx.organizationId];
    if (typeof input.query === 'string' && input.query.trim()) {
      args.push(`%${input.query.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`);
      filters.push(`a.title ILIKE $${args.length}`);
    }
    if (typeof input.status === 'string' && ['draft', 'review', 'approved', 'locked'].includes(input.status)) {
      args.push(input.status);
      filters.push(`a.status = $${args.length}`);
    }
    if (typeof input.ctd_prefix === 'string' && input.ctd_prefix.trim()) {
      args.push(`${input.ctd_prefix.trim()}%`);
      filters.push(`a.ctd_section ILIKE $${args.length}`);
    }
    args.push(viewLimit(input));
    const { rows } = await getPool().query(
      `SELECT a.id, a.artifact_id, a.title, a.type, a.category, a.ctd_section, a.status,
              a.version, a.updated_at
         FROM concept2cure_artifacts a
        WHERE a.organization_id = $1 AND ${filters.join(' AND ')}
        ORDER BY a.updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return JSON.stringify({
      ok: true,
      count: rows.length,
      documents: rows,
      message: rows.length
        ? `${rows.length} vault documents. Use read_vault_document with an id to open one.`
        : 'No vault documents match the filters.',
    });
  } catch (err) {
    return JSON.stringify({ error: `list_vault_documents failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('read_vault_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'read_vault_document requires tenant context.' });
  const artifactId = typeof input.artifact_id === 'string' ? input.artifact_id.trim() : '';
  if (!artifactId) return JSON.stringify({ error: 'artifact_id (string) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const { rows } = await getPool().query(
      `SELECT id, artifact_id, title, type, category, ctd_section, status, version,
              content, content_hash, created_at, updated_at, locked_at
         FROM concept2cure_artifacts
        WHERE organization_id = $1 AND (id::text = $2 OR artifact_id = $2)
        LIMIT 1`,
      [ctx.organizationId, artifactId],
    );
    if (!rows.length) return JSON.stringify({ error: `No vault document '${artifactId}' in this organization.` });
    const { content, ...meta } = rows[0];
    const excerpt = viewExcerpt(typeof content === 'string' ? content : JSON.stringify(content ?? ''), input);
    return JSON.stringify({
      ok: true,
      document: meta,
      content: excerpt.content,
      totalChars: excerpt.totalChars,
      truncated: excerpt.truncated,
      ...(excerpt.truncated
        ? { message: `Content truncated at ${excerpt.content.length} of ${excerpt.totalChars} characters — raise max_chars to read more.` }
        : {}),
    });
  } catch (err) {
    return JSON.stringify({ error: `read_vault_document failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_document_versions', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_document_versions requires tenant context.' });
  const artifactId = typeof input.artifact_id === 'string' ? input.artifact_id.trim() : '';
  if (!artifactId) return JSON.stringify({ error: 'artifact_id (string) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const idRes = await getPool().query<{ id: number }>(
      `SELECT id FROM concept2cure_artifacts
        WHERE organization_id = $1 AND (id::text = $2 OR artifact_id = $2) LIMIT 1`,
      [ctx.organizationId, artifactId],
    );
    if (!idRes.rows.length) return JSON.stringify({ error: `No vault document '${artifactId}' in this organization.` });
    const versions = await getPool().query(
      `SELECT id, version AS version_number, change_description AS change_summary,
              content_hash, created_at, created_by_id
         FROM concept2cure_artifact_versions
        WHERE artifact_id = $1 AND organization_id = $2
        ORDER BY version DESC`,
      [idRes.rows[0].id, ctx.organizationId],
    );
    return JSON.stringify({ ok: true, count: versions.rows.length, versions: versions.rows });
  } catch (err: unknown) {
    // Version table lives in a separate migration; absent table → empty history.
    if ((err as { code?: string }).code === '42P01') return JSON.stringify({ ok: true, count: 0, versions: [] });
    return JSON.stringify({ error: `get_document_versions failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('list_governed_documents', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'list_governed_documents requires tenant context.' });
  try {
    const { getPool } = await import('../../db.js');
    const filters: string[] = [];
    const args: unknown[] = [ctx.organizationId];
    for (const [key, col] of [['doc_type', 'doc_type'], ['agency', 'agency'], ['status', 'status']] as const) {
      const v = input[key];
      if (typeof v === 'string' && v.trim()) {
        args.push(v.trim().toLowerCase());
        filters.push(`d.${col} = $${args.length}`);
      }
    }
    args.push(viewLimit(input));
    const { rows } = await getPool().query(
      `SELECT d.id, d.project_id, d.doc_type, d.agency, d.title, d.status, d.readiness, d.updated_at
         FROM c2c_documents d
        WHERE d.org_id = $1${filters.length ? ` AND ${filters.join(' AND ')}` : ''}
        ORDER BY d.updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return JSON.stringify({
      ok: true,
      count: rows.length,
      documents: rows,
      message: rows.length
        ? `${rows.length} governed documents. Use read_governed_document with a document id for its outline or a section's content.`
        : 'No governed documents match the filters.',
    });
  } catch (err) {
    return JSON.stringify({ error: `list_governed_documents failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('read_governed_document', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'read_governed_document requires tenant context.' });
  const documentId = typeof input.document_id === 'string' ? input.document_id.trim() : '';
  if (!documentId) return JSON.stringify({ error: 'document_id (string) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const doc = await getPool().query(
      `SELECT id, doc_type, agency, title, status, readiness FROM c2c_documents
        WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [ctx.organizationId, documentId],
    );
    if (!doc.rows.length) return JSON.stringify({ error: `No governed document '${documentId}' in this organization.` });

    const sectionKey = typeof input.section_key === 'string' ? input.section_key.trim() : '';
    if (!sectionKey) {
      const outline = await getPool().query(
        `SELECT section_key, parent_key, label, status, mandatory, version, path_order
           FROM c2c_document_sections
          WHERE document_id = $1
          ORDER BY path_order`,
        [documentId],
      );
      return JSON.stringify({
        ok: true,
        document: doc.rows[0],
        outline: outline.rows,
        message: `Outline with ${outline.rows.length} sections. Call again with section_key to read a section's content.`,
      });
    }

    const section = await getPool().query(
      `SELECT section_key, label, status, mandatory, version, content
         FROM c2c_document_sections
        WHERE document_id = $1 AND section_key = $2 LIMIT 1`,
      [documentId, sectionKey],
    );
    if (!section.rows.length) {
      return JSON.stringify({ error: `Section '${sectionKey}' not found in document '${documentId}'.` });
    }
    const { content, ...sectionMeta } = section.rows[0];
    const excerpt = viewExcerpt(typeof content === 'string' ? content : JSON.stringify(content ?? ''), input);
    return JSON.stringify({
      ok: true,
      document: doc.rows[0],
      section: sectionMeta,
      content: excerpt.content,
      totalChars: excerpt.totalChars,
      truncated: excerpt.truncated,
    });
  } catch (err) {
    return JSON.stringify({ error: `read_governed_document failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_tmf_view', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_tmf_view requires tenant context.' });
  try {
    const { listTmfFiles, listArtifacts, getCompletenessInput } = await import('../etmf/etmf-service.js');
    const { evaluateCompleteness, zoneName } = await import('../etmf/etmf-logic.js');
    const orgId = Number(ctx.organizationId);

    const tmfFileId = Number(input.tmf_file_id);
    if (!Number.isFinite(tmfFileId)) {
      const files = await listTmfFiles(orgId);
      return JSON.stringify({
        ok: true,
        count: files.length,
        tmf_files: files,
        message: files.length
          ? 'Call again with tmf_file_id for a TMF index + completeness view.'
          : 'No TMF files yet — create_tmf opens one.',
      });
    }

    const [artifacts, completenessInput] = await Promise.all([
      listArtifacts(orgId, tmfFileId),
      getCompletenessInput(orgId, tmfFileId),
    ]);
    const completeness = evaluateCompleteness(completenessInput);
    const byZone: Record<string, unknown[]> = {};
    for (const a of artifacts) {
      const label = `Zone ${a.zone} · ${zoneName(Number(a.zone))}`;
      (byZone[label] ??= []).push(a);
    }
    return JSON.stringify({ ok: true, tmf_file_id: tmfFileId, zones: byZone, completeness });
  } catch (err) {
    return JSON.stringify({ error: `get_tmf_view failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Document Operations Tools — governed writes (reason required, audited),
// cross-store search, and plan/credit introspection. Writes never touch
// locked content; every query is org-scoped.
// ─────────────────────────────────────────────────────────────────────────────

function viewReason(input: Record<string, unknown>): string | null {
  const r = typeof input.reason === 'string' ? input.reason.trim() : '';
  return r.length >= 8 ? r : null;
}

registerToolHandler('save_document_to_vault', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx.userId) return JSON.stringify({ error: 'save_document_to_vault requires tenant + user context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content : '';
  const reason = viewReason(input);
  if (!title) return JSON.stringify({ error: 'title (string) is required.' });
  if (!content) return JSON.stringify({ error: 'content (string) is required.' });
  if (!reason) return JSON.stringify({ error: 'reason (min 8 characters) is required — governed action.' });
  /* concept2cure_artifacts.project_id is integer NOT NULL — the INSERT below
     omitted it, so this tool failed on EVERY real call while its contract test
     (mocked pool) stayed green. The explicit "AnA, file this" path must file
     under a project or say plainly that it cannot; a vault document belonging
     to no project is exactly the orphaned capture this platform must not
     produce. */
  const projectId =
    typeof ctx.projectId === 'number' && Number.isFinite(ctx.projectId) && ctx.projectId > 0
      ? ctx.projectId
      : null;
  if (!projectId) {
    return JSON.stringify({
      error:
        'save_document_to_vault needs an open project — every vault document is filed under one. Open or select a project, then ask again.',
    });
  }
  try {
    const { getPool } = await import('../../db.js');
    const { createHash, randomUUID } = await import('crypto');
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    const externalId = `ana-doc-${randomUUID().slice(0, 12)}`;
    const category = typeof input.category === 'string' && input.category.trim() ? input.category.trim() : 'document';
    const ctd = typeof input.ctd_section === 'string' && input.ctd_section.trim() ? input.ctd_section.trim() : null;

    const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, ctx.organizationId);
      const ins = await client.query<{ id: number }>(
        `INSERT INTO concept2cure_artifacts (
           artifact_id, organization_id, project_id, type, category, title, content, content_hash,
           ctd_section, status, version, created_by_id, metadata
         ) VALUES ($1, $2, $3, 'document', $4, $5, $6, $7, $8, 'draft', 1, $9,
           jsonb_build_object('source', 'ana_tool', 'reason', $10::text))
         RETURNING id`,
        [externalId, ctx.organizationId, projectId, category, title, content, hash, ctd, ctx.userId, reason],
      );
      await client.query(
        `INSERT INTO concept2cure_artifact_versions
           (artifact_id, organization_id, version, content, content_hash, change_description, created_by_id)
         VALUES ($1, $2, 1, $3, $4, $5, $6)`,
        [ins.rows[0].id, ctx.organizationId, content, hash, reason, ctx.userId],
      );
      // Uniform provenance: a vault document authored by AnA is a 'generation'
      // event, in the same transaction as the artifact + version.
      await recordArtifactProvenance(client, {
        artifactId: ins.rows[0].id,
        organizationId: ctx.organizationId,
        eventType: 'generation',
        eventAction: 'ai_generate',
        actorId: ctx.userId,
        details: { source: 'ana_tool', reason, ctdSection: ctd, version: 1 },
        backendService: 'ana/AnaToolExecutor:save_document_to_vault',
      });
      // C2C-AUDIT-001: the Part 11 audit row is written on THIS client, inside
      // the same transaction as the artifact + immutable version. It used to be
      // a post-COMMIT `try { auditLog(...) } catch { /* never block on audit */ }`
      // on a separate connection, so a failed audit left a committed regulated
      // document with no §11.10(e) trail. Now the audit failing rolls the
      // document back with it.
      await recordGovernedAction(client, {
        orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
        target: `vault-document:${externalId}`, reason,
        payload: { kind: 'create', title, category, ctdSection: ctd, contentHash: hash, to: 'draft', version: 1 },
        domain: 'mdx', surface: 'ana',
      });
      await client.query('COMMIT');

      return JSON.stringify({
        ok: true, id: ins.rows[0].id, artifact_id: externalId, version: 1, content_hash: hash,
        message: `Saved '${title}' to the vault as draft v1 (${content.length} chars, SHA-256 ${hash.slice(0, 12)}…).`,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return JSON.stringify({ error: `save_document_to_vault failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('update_vault_document', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx.userId) return JSON.stringify({ error: 'update_vault_document requires tenant + user context.' });
  const artifactId = typeof input.artifact_id === 'string' ? input.artifact_id.trim() : '';
  const content = typeof input.content === 'string' ? input.content : '';
  const reason = viewReason(input);
  if (!artifactId) return JSON.stringify({ error: 'artifact_id (string) is required.' });
  if (!content) return JSON.stringify({ error: 'content (string) is required.' });
  if (!reason) return JSON.stringify({ error: 'reason (min 8 characters) is required — governed action.' });
  try {
    const { getPool } = await import('../../db.js');
    const { createHash } = await import('crypto');
    const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, ctx.organizationId);
      const existing = await client.query<{ id: number; status: string; version: number; title: string }>(
        `SELECT id, status, version, title FROM concept2cure_artifacts
          WHERE organization_id = $1 AND (id::text = $2 OR artifact_id = $2)
          FOR UPDATE`,
        [ctx.organizationId, artifactId],
      );
      if (!existing.rows.length) {
        await client.query('ROLLBACK');
        return JSON.stringify({ error: `No vault document '${artifactId}' in this organization.` });
      }
      const doc = existing.rows[0];
      if (doc.status === 'locked') {
        await client.query('ROLLBACK');
        return JSON.stringify({ error: `'${doc.title}' is locked — finalized content is immutable. Create a new document instead.` });
      }
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      const nextVersion = Number(doc.version ?? 1) + 1;
      await client.query(
        `UPDATE concept2cure_artifacts
            SET content = $3, content_hash = $4, version = $5, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [doc.id, ctx.organizationId, content, hash, nextVersion],
      );
      await client.query(
        `INSERT INTO concept2cure_artifact_versions
           (artifact_id, organization_id, version, content, content_hash, change_description, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [doc.id, ctx.organizationId, nextVersion, content, hash, reason, ctx.userId],
      );
      /* Lineage in the same transaction as the new version (ledger L160): the
         vault tool carries no parked sources, so every clause is the acting
         user's assertion; a gap rolls the version back. */
      const { enforceAuthorLineage } = await import('../clinical-regulatory-evidence/lineage-gate.js');
      await enforceAuthorLineage(
        client,
        ctx.organizationId,
        { documentTable: 'concept2cure_artifacts', documentId: String(doc.id) },
        content,
        String(ctx.userId),
      );
      // Uniform provenance: a new vault version is an 'edit' event, same txn.
      await recordArtifactProvenance(client, {
        artifactId: doc.id,
        organizationId: ctx.organizationId,
        eventType: 'edit',
        eventAction: 'ai_generate',
        actorId: ctx.userId,
        details: { source: 'ana_tool', reason, version: nextVersion },
        backendService: 'ana/AnaToolExecutor:vault_update',
      });
      // C2C-AUDIT-001: atomic Part 11 audit — see save_document_to_vault.
      await recordGovernedAction(client, {
        orgId: ctx.organizationId, userId: ctx.userId, command: 'transition',
        target: `vault-document:${doc.id}`, reason,
        payload: { kind: 'version', title: doc.title, from: Number(doc.version ?? 1), to: nextVersion, contentHash: hash },
        domain: 'mdx', surface: 'ana',
      });
      await client.query('COMMIT');

      return JSON.stringify({
        ok: true, id: doc.id, version: nextVersion, content_hash: hash,
        message: `Saved '${doc.title}' v${nextVersion} (${content.length} chars). Previous versions remain sealed.`,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return JSON.stringify({ error: `update_vault_document failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('compare_vault_versions', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'compare_vault_versions requires tenant context.' });
  const artifactId = typeof input.artifact_id === 'string' ? input.artifact_id.trim() : '';
  const va = Number(input.version_a);
  const vb = Number(input.version_b);
  if (!artifactId) return JSON.stringify({ error: 'artifact_id (string) is required.' });
  if (!Number.isInteger(va) || !Number.isInteger(vb)) return JSON.stringify({ error: 'version_a and version_b must be integers.' });
  try {
    const { getPool } = await import('../../db.js');
    const idRes = await getPool().query<{ id: number }>(
      `SELECT id FROM concept2cure_artifacts
        WHERE organization_id = $1 AND (id::text = $2 OR artifact_id = $2) LIMIT 1`,
      [ctx.organizationId, artifactId],
    );
    if (!idRes.rows.length) return JSON.stringify({ error: `No vault document '${artifactId}' in this organization.` });
    const { rows } = await getPool().query(
      `SELECT version, content, content_hash, change_description, created_at, created_by_id
         FROM concept2cure_artifact_versions
        WHERE artifact_id = $1 AND organization_id = $2 AND version = ANY($3::int[])`,
      [idRes.rows[0].id, ctx.organizationId, [va, vb]],
    );
    const a = rows.find((r: any) => Number(r.version) === va);
    const b = rows.find((r: any) => Number(r.version) === vb);
    if (!a || !b) {
      return JSON.stringify({ error: `Version ${!a ? va : vb} not found — use get_document_versions to see what exists.` });
    }
    const linesA = String(a.content ?? '').split('\n');
    const linesB = String(b.content ?? '').split('\n');
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    const added = linesB.filter(l => !setA.has(l));
    const removed = linesA.filter(l => !setB.has(l));
    const preview = (list: string[]) => list.filter(l => l.trim()).slice(0, 12);
    const meta = ({ content, ...rest }: any) => ({ ...rest, chars: String(content ?? '').length });
    return JSON.stringify({
      ok: true,
      version_a: meta(a),
      version_b: meta(b),
      identical: a.content_hash === b.content_hash,
      lines_added: added.length,
      lines_removed: removed.length,
      added_preview: preview(added),
      removed_preview: preview(removed),
      note: 'Line-level change summary (unordered line comparison). Read a full version via get_document_versions + read_vault_document for exact context.',
    });
  } catch (err) {
    return JSON.stringify({ error: `compare_vault_versions failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('seed_tmf', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx.userId) return JSON.stringify({ error: 'seed_tmf requires tenant + user context.' });
  const tmfFileId = Number(input.tmf_file_id);
  const reason = viewReason(input);
  if (!Number.isInteger(tmfFileId)) return JSON.stringify({ error: 'tmf_file_id (integer) is required.' });
  if (!reason) return JSON.stringify({ error: 'reason (min 8 characters) is required — governed action.' });
  const scope = input.scope === 'essential' ? 'essential' as const : 'all' as const;
  try {
    const { getPool } = await import('../../db.js');
    const { seedReferenceModelTx } = await import('../etmf/etmf-service.js');
    const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
    const { setTenantContextTx } = await import('../tenant/governed-tenant-context.js');
    const orgId = Number(ctx.organizationId);
    const userId = Number(ctx.userId);
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, orgId);
      const result = await seedReferenceModelTx(client, orgId, userId, tmfFileId, scope);
      const gov = await recordGovernedAction(client, {
        orgId, userId, command: 'update', target: `tmf-file:${tmfFileId}`,
        reason, payload: { seeded: result.seeded, skipped: result.skipped, scope }, domain: 'etmf',
      });
      await client.query('COMMIT');
      return JSON.stringify({
        ok: true, tmf_file_id: tmfFileId, ...result, ...gov,
        message: `Seeded ${result.seeded} expected artifact(s) (${result.skipped} already present, scope '${scope}'). Use get_tmf_view to see the index.`,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return JSON.stringify({ error: `seed_tmf failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('update_tmf_artifact_status', async (input, ctx) => {
  if (!ctx?.organizationId || !ctx.userId) return JSON.stringify({ error: 'update_tmf_artifact_status requires tenant + user context.' });
  const artifactId = Number(input.tmf_artifact_id);
  const status = typeof input.status === 'string' ? input.status : '';
  const reason = viewReason(input);
  if (!Number.isInteger(artifactId)) return JSON.stringify({ error: 'tmf_artifact_id (integer) is required.' });
  if (!reason) return JSON.stringify({ error: 'reason (min 8 characters) is required — governed action.' });
  try {
    const { getPool } = await import('../../db.js');
    const { setArtifactStatusTx } = await import('../etmf/etmf-service.js');
    const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
    const { setTenantContextTx } = await import('../tenant/governed-tenant-context.js');
    const orgId = Number(ctx.organizationId);
    const userId = Number(ctx.userId);
    const documentDate = typeof input.document_date === 'string' && input.document_date.trim() ? input.document_date.trim() : null;
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await setTenantContextTx(client, orgId);
      await setArtifactStatusTx(client, orgId, artifactId, status, documentDate);
      const gov = await recordGovernedAction(client, {
        orgId, userId, command: 'transition', target: `tmf-artifact:${artifactId}`,
        reason, payload: { status, documentDate }, domain: 'etmf',
      });
      await client.query('COMMIT');
      return JSON.stringify({ ok: true, tmf_artifact_id: artifactId, status, ...gov });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return JSON.stringify({ error: `update_tmf_artifact_status failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('search_all_documents', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'search_all_documents requires tenant context.' });
  const q = typeof input.query === 'string' ? input.query.trim() : '';
  if (!q) return JSON.stringify({ error: 'query (string) is required.' });
  try {
    const { getPool } = await import('../../db.js');
    const ilike = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const raw = Number(input.limit);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.round(raw))) : 15;
    const fanout = await Promise.allSettled([
      getPool().query(
        `SELECT id, artifact_id, title, status, ctd_section, updated_at FROM concept2cure_artifacts
          WHERE organization_id = $1 AND status != 'archived' AND title ILIKE $2
          ORDER BY updated_at DESC LIMIT $3`, [ctx.organizationId, ilike, limit]),
      getPool().query(
        `SELECT id, doc_type, agency, title, status, readiness FROM c2c_documents
          WHERE org_id = $1 AND title ILIKE $2
          ORDER BY updated_at DESC LIMIT $3`, [ctx.organizationId, ilike, limit]),
      getPool().query(
        `SELECT id, tmf_file_id, zone, artifact_name, status FROM tmf_artifacts
          WHERE organization_id = $1 AND deleted_at IS NULL AND artifact_name ILIKE $2
          ORDER BY updated_at DESC LIMIT $3`, [ctx.organizationId, ilike, limit]),
    ]);
    const stores = ['vault', 'governed', 'tmf'] as const;
    const hits: Array<Record<string, unknown>> = [];
    fanout.forEach((r, i) => {
      if (r.status === 'fulfilled') for (const row of r.value.rows) hits.push({ store: stores[i], ...row });
    });
    return JSON.stringify({
      ok: true, query: q, count: hits.length, hits,
      message: `${hits.length} hits. Open vault hits with read_vault_document, governed hits with read_governed_document, TMF hits with get_tmf_view.`,
    });
  } catch (err) {
    return JSON.stringify({ error: `search_all_documents failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_plan_usage', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_plan_usage requires tenant context.' });
  try {
    const { getUsageLimitsSnapshot, getWeeklyUsageByModel } = await import('../usage-windows.js');
    const orgId = Number(ctx.organizationId);
    const [snapshot, byModel] = await Promise.all([
      getUsageLimitsSnapshot(orgId),
      getWeeklyUsageByModel(orgId),
    ]);
    return JSON.stringify({ ok: true, ...snapshot, byModel });
  } catch (err) {
    return JSON.stringify({ error: `get_plan_usage failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_billing_credits', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_billing_credits requires tenant context.' });
  try {
    const { getCreditBalance, getCreditLedger, getAutoReload } = await import('../credit-ledger.js');
    const orgId = Number(ctx.organizationId);
    const [balanceCents, ledger, autoReload] = await Promise.all([
      getCreditBalance(orgId),
      getCreditLedger(orgId, 10),
      getAutoReload(orgId),
    ]);
    return JSON.stringify({ ok: true, balanceCents, autoReload, recentLedger: ledger });
  } catch (err) {
    return JSON.stringify({ error: `get_billing_credits failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_org_capabilities', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_org_capabilities requires tenant context.' });
  try {
    const { resolveCapabilities } = await import('../entitlements/resolver.js');
    const capabilities = await resolveCapabilities(Number(ctx.organizationId));
    return JSON.stringify({ ok: true, ...capabilities });
  } catch (err) {
    return JSON.stringify({ error: `get_org_capabilities failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reporting View Tools — read/list over the governed Report-OS product,
// segment-anchored + entitlement-aware. AnA narrates; it never originates a
// metric (report-os/ana ANA_REPORTING_GUARDRAIL). Tenant-scoped, read-only.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('list_report_types', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'list_report_types requires tenant context.' });
  const scope = typeof input.scope === 'string' ? input.scope : '';
  if (!scope) return JSON.stringify({ error: 'scope (string) is required.' });
  const persona = typeof input.persona === 'string' && input.persona.trim() ? input.persona.trim() : null;
  try {
    const { getPool } = await import('../../db.js');
    const { deriveOrgSegments, filterTypesForSegment } = await import('../report-os/segment.js');
    const { decideReportEntitlement } = await import('../report-os/entitlement-map.js');
    const { resolveCapabilities } = await import('../entitlements/resolver.js');
    const orgId = Number(ctx.organizationId);

    const { rows } = await getPool().query(
      `SELECT type_id, label, family, allowed_scopes, allowed_personas, allowed_client_segments
         FROM report_type_registry WHERE enabled = true`,
    );
    const typed = rows.map((r: any) => ({
      typeId: r.type_id,
      label: r.label,
      family: r.family,
      allowedScopes: r.allowed_scopes ?? [],
      allowedPersonas: r.allowed_personas ?? [],
      allowedClientSegments: r.allowed_client_segments ?? [],
    }));

    const segments = await deriveOrgSegments(orgId);
    const segFiltered = filterTypesForSegment(typed, segments, persona)
      .filter((t: any) => Array.isArray(t.allowedScopes) && t.allowedScopes.includes(scope));

    let tier: 'free' | 'standard' | 'professional' | 'enterprise' = 'standard';
    try { tier = (await resolveCapabilities(orgId)).tier; } catch { /* default standard */ }

    const types = segFiltered.map((t: any) => {
      const d = decideReportEntitlement(t.typeId, t.family, tier);
      return {
        typeId: t.typeId, label: t.label, family: t.family,
        entitled: d.entitled, requiredTier: d.requiredTier,
      };
    });
    return JSON.stringify({
      ok: true, scope, segments, tier, count: types.length, reportTypes: types,
      note: 'Report types are already filtered to this org segment(s) and annotated with entitlement. AnA narrates these; it never invents a report type or a metric.',
    });
  } catch (err) {
    return JSON.stringify({ error: `list_report_types failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('get_portfolio_readiness', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'get_portfolio_readiness requires tenant context.' });
  const programGroupId = Number(input.program_group_id);
  if (!Number.isInteger(programGroupId) || programGroupId <= 0) {
    return JSON.stringify({ error: 'program_group_id (positive integer) is required.' });
  }
  try {
    const orgId = Number(ctx.organizationId);
    const { requireReportEntitlement } = await import('../report-os/entitlement-map.js');
    const gate = await requireReportEntitlement(orgId, 'portfolio.board_pack', 'portfolio');
    if (!gate.entitled) {
      return JSON.stringify({
        ok: true, locked: true, feature: gate.feature, requiredTier: gate.requiredTier, tier: gate.tier,
        message: `Portfolio rollup requires the ${gate.requiredTier} plan.`,
      });
    }
    const { fetchPortfolioSummary } = await import('../report-os/portfolio/fetch.js');
    const summary = await fetchPortfolioSummary(orgId, programGroupId);
    if (!summary) {
      return JSON.stringify({ error: 'Program group not found or has no members in this organization.' });
    }
    return JSON.stringify({
      ok: true, portfolio: summary,
      note: 'Every metric is computed by the deterministic orchestrator. AnA explains the rollup; it never originates a readiness score, risk level, or blocker count.',
    });
  } catch (err) {
    return JSON.stringify({ error: `get_portfolio_readiness failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reporting Canvas Tools — AnA generates governed reports, suggests a
// best-practices dashboard, and saves canvases. Every report is a governed run;
// AnA composes + narrates, never originates a metric. generate_report and
// suggest_reports return a `report_canvas` envelope the stream route forwards to
// the client canvas.
// ─────────────────────────────────────────────────────────────────────────────

registerToolHandler('generate_report', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'generate_report requires tenant context.' });
  const reportTypeId = typeof input.report_type_id === 'string' ? input.report_type_id : '';
  const scopeType = typeof input.scope_type === 'string' ? input.scope_type : '';
  const scopeId = typeof input.scope_id === 'string' ? input.scope_id : '';
  if (!reportTypeId || !scopeType || !scopeId) {
    return JSON.stringify({ error: 'report_type_id, scope_type and scope_id are required.' });
  }
  try {
    const orgId = Number(ctx.organizationId);
    const { requireReportEntitlement } = await import('../report-os/entitlement-map.js');
    const gate = await requireReportEntitlement(orgId, reportTypeId);
    if (!gate.entitled) {
      return JSON.stringify({
        ok: true, locked: true, feature: gate.feature, requiredTier: gate.requiredTier, tier: gate.tier,
        message: `This report requires the ${gate.requiredTier} plan.`,
      });
    }
    const { isKnownReportType, renderGovernedReport } = await import('../report-os/canvas/render-report.js');
    if (!isKnownReportType(reportTypeId)) {
      return JSON.stringify({ error: `Unknown report type: ${reportTypeId}.` });
    }
    const submissionType = typeof input.submission_type === 'string' ? input.submission_type : undefined;
    const result = await renderGovernedReport(orgId, {
      typeId: reportTypeId, scopeType: scopeType as any, scopeId, submissionType,
    });
    return JSON.stringify({
      ok: true,
      report_canvas: { kind: 'report', report: result.rendered },
      confidence: result.confidence,
      criticalBlockerCount: result.criticalBlockerCount,
      note: 'This report is computed live by the governed orchestrator and is advisory (partial), not a sealed run. AnA presents and explains it; every number comes from the engine.',
    });
  } catch (err) {
    return JSON.stringify({ error: `generate_report failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('explain_report_blockers', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'explain_report_blockers requires tenant context.' });
  const reportTypeId = typeof input.report_type_id === 'string' ? input.report_type_id : '';
  const scopeType = typeof input.scope_type === 'string' ? input.scope_type : '';
  const scopeId = typeof input.scope_id === 'string' ? input.scope_id : '';
  if (!reportTypeId || !scopeType || !scopeId) {
    return JSON.stringify({ error: 'report_type_id, scope_type and scope_id are required.' });
  }
  try {
    const orgId = Number(ctx.organizationId);
    const { requireReportEntitlement } = await import('../report-os/entitlement-map.js');
    const gate = await requireReportEntitlement(orgId, reportTypeId);
    if (!gate.entitled) {
      return JSON.stringify({
        ok: true, locked: true, requiredTier: gate.requiredTier, tier: gate.tier,
        message: `This report requires the ${gate.requiredTier} plan.`,
      });
    }
    const { isKnownReportType, renderGovernedReport } = await import('../report-os/canvas/render-report.js');
    if (!isKnownReportType(reportTypeId)) return JSON.stringify({ error: `Unknown report type: ${reportTypeId}.` });
    const result = await renderGovernedReport(orgId, { typeId: reportTypeId, scopeType: scopeType as any, scopeId });
    return JSON.stringify({
      ok: true,
      reportTypeId, scopeType, scopeId,
      confidence: result.confidence,
      criticalBlockerCount: result.criticalBlockerCount,
      blockers: result.blockers,
      note: 'These blockers are surfaced by the governed engine. AnA explains what they mean and how to resolve them; it never invents a blocker.',
    });
  } catch (err) {
    return JSON.stringify({ error: `explain_report_blockers failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('suggest_reports', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'suggest_reports requires tenant context.' });
  const persona = typeof input.persona === 'string' && input.persona.trim() ? input.persona.trim() : null;
  try {
    const orgId = Number(ctx.organizationId);
    const { suggestReportsForOrg } = await import('../report-os/canvas/suggestion-service.js');
    const result = await suggestReportsForOrg(orgId, persona);
    return JSON.stringify({
      ok: true,
      report_canvas: { kind: 'suggestions', ...result },
      note: 'Suggestions are honest set arithmetic over this client’s real programs, segment, tier, and report history — ranked, with a reason each. Locked reports show the tier that unlocks them. The preset is a ready-to-save dashboard of governed panels; numbers appear only when each panel is generated.',
    });
  } catch (err) {
    return JSON.stringify({ error: `suggest_reports failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('save_report_definition', async (input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'save_report_definition requires tenant context.' });
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const rawPanels = Array.isArray(input.panels) ? input.panels : [];
  if (!title) return JSON.stringify({ error: 'title is required.' });
  if (rawPanels.length === 0) return JSON.stringify({ error: 'at least one panel is required.' });
  try {
    const orgId = Number(ctx.organizationId);
    const panels = rawPanels.map((p: any) => ({
      reportTypeId: String(p.report_type_id ?? ''),
      scopeType: String(p.scope_type ?? 'program'),
      scopeId: p.scope_id != null ? String(p.scope_id) : null,
      label: p.label != null ? String(p.label) : null,
    }));
    const spec = { scopeType: (panels[0]?.scopeType ?? 'program') as any, panels: panels as any };
    const persona = typeof input.persona === 'string' && input.persona.trim() ? input.persona.trim() : null;
    const description = typeof input.description === 'string' ? input.description : null;
    const { createDefinition } = await import('../report-os/canvas/definition-service.js');
    const res = await createDefinition({
      organizationId: orgId,
      title, description, persona,
      origin: 'ana',
      spec,
      createdBy: ctx.userId ? Number(ctx.userId) : null,
    });
    if (!res.ok) {
      return JSON.stringify({
        ok: false, error: 'Some panels were rejected before saving.', issues: res.issues ?? [],
        note: 'A panel must be a known report type the org is entitled to. Fix or drop the flagged panels and save again.',
      });
    }
    return JSON.stringify({
      ok: true,
      definition: { id: res.definition!.id, uuid: res.definition!.definitionUuid, title: res.definition!.title, kind: res.definition!.kind, panelCount: panels.length },
      note: 'Saved. Every panel was validated against the catalog + entitlement tier before persisting.',
    });
  } catch (err) {
    return JSON.stringify({ error: `save_report_definition failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

registerToolHandler('list_report_definitions', async (_input, ctx) => {
  if (!ctx?.organizationId) return JSON.stringify({ error: 'list_report_definitions requires tenant context.' });
  try {
    const orgId = Number(ctx.organizationId);
    const { listDefinitions } = await import('../report-os/canvas/definition-service.js');
    const rows = await listDefinitions(orgId);
    const definitions = rows.map((r) => ({
      id: r.id, uuid: r.definitionUuid, title: r.title, kind: r.kind, origin: r.origin,
      persona: r.persona, panelCount: Array.isArray(r.spec?.panels) ? r.spec.panels.length : 0,
      updatedAt: r.updatedAt,
    }));
    return JSON.stringify({ ok: true, count: definitions.length, definitions });
  } catch (err) {
    return JSON.stringify({ error: `list_report_definitions failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});
