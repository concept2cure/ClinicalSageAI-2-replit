/**
 * AnA Capability Registry Service
 *
 * Manages AnA 1.0 RI's self-knowledge: what she can do, how well she does it,
 * and what to recommend for a given project context. Seeds the global capability
 * registry, logs outcomes, computes effectiveness, and builds compressed
 * capability context for prompt injection.
 *
 * Part of the Concept2Cure (C2C) AnA Intelligence System.
 *
 * @module server/services/ana-capability-registry
 */

import { db } from '../db';
import { runWithSystemTenantScope } from '../db/tenantStore';
import { anaCapabilityRegistry, anaOutcomeLog, anaProjectCapabilities } from 'shared/schema/ana-intelligence';
import { eq, and, desc, sql, or, inArray } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger.js';
import { governanceFor } from './ai-governance/risk-tiers';

const logger = createScopedLogger('ana-capability-registry');

// ============================================================
// SEED DATA — 33 Core Capabilities
// ============================================================

export interface SeedCapability {
  capabilityKey: string;
  category: string;
  name: string;
  description: string;
  slashCommand: string | null;
  regulatoryBodiesApplicable: string[];
  projectTypesApplicable: string[];
  documentTypesApplicable: string[];
}

export const SEED_CAPABILITIES: SeedCapability[] = [
  // ── Drafting (8) ──────────────────────────────────────────
  {
    capabilityKey: 'draft-csr',
    category: 'drafting',
    name: 'Draft Clinical Study Report',
    description: 'Generate ICH E3-compliant CSR sections with regulatory-grade language, safety narratives, and statistical interpretation.',
    slashCommand: '/draft-csr',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: ['csr'],
  },
  {
    capabilityKey: 'draft-protocol',
    category: 'drafting',
    name: 'Draft Clinical Protocol',
    description: 'Generate protocol sections including study design, endpoints, eligibility criteria, and statistical analysis plans.',
    slashCommand: '/draft-protocol',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: ['protocol'],
  },
  {
    capabilityKey: 'draft-ib',
    category: 'drafting',
    name: 'Draft Investigator Brochure',
    description: 'Generate IB sections covering nonclinical data, clinical experience, and safety summary with proper cross-referencing.',
    slashCommand: '/draft-ib',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: ['ib'],
  },
  {
    capabilityKey: 'draft-ind-module',
    category: 'drafting',
    name: 'Draft IND Module',
    description: 'Generate CTD Module 2-5 content for IND submissions with FDA-specific formatting and cross-reference structure.',
    slashCommand: '/draft-ind-module',
    regulatoryBodiesApplicable: ['FDA'],
    projectTypesApplicable: ['IND'],
    documentTypesApplicable: ['ind-module', 'ctd-module'],
  },
  {
    capabilityKey: 'draft-nda-section',
    category: 'drafting',
    name: 'Draft NDA Section',
    description: 'Generate NDA/BLA submission sections with complete CTD structure, ISS/ISE summaries, and benefit-risk analysis.',
    slashCommand: '/draft-nda-section',
    regulatoryBodiesApplicable: ['FDA'],
    projectTypesApplicable: ['NDA', 'BLA'],
    documentTypesApplicable: ['nda-section', 'ctd-module'],
  },
  {
    capabilityKey: 'draft-jnda-section',
    category: 'drafting',
    name: 'Draft JNDA Section',
    description:
      'Generate J-NDA (PMDA) submission sections with the Japanese eCTD Module 1 structure, similar-drug selection rationale, and J-RMP, in line with PMDA expectations.',
    slashCommand: '/draft-jnda-section',
    regulatoryBodiesApplicable: ['PMDA'],
    projectTypesApplicable: ['JNDA', 'IND'],
    documentTypesApplicable: ['jnda-section', 'ctd-module'],
  },
  {
    capabilityKey: 'draft-bridging-strategy',
    category: 'drafting',
    name: 'Draft Bridging / Ethnic-Sensitivity Strategy',
    description:
      'Draft a Japan bridging-study strategy and ethnic-sensitivity assessment (ICH E5) to justify the extrapolation of foreign clinical data for a JNDA, including SAKIGAKE eligibility where applicable.',
    slashCommand: '/draft-bridging-strategy',
    regulatoryBodiesApplicable: ['PMDA'],
    projectTypesApplicable: ['JNDA', 'IND'],
    documentTypesApplicable: ['jnda-section', 'ctd-module'],
  },
  {
    capabilityKey: 'draft-510k',
    category: 'drafting',
    name: 'Draft 510(k) Submission',
    description: 'Generate 510(k) substantial equivalence arguments, predicate comparisons, and performance data summaries.',
    slashCommand: '/draft-510k',
    regulatoryBodiesApplicable: ['FDA'],
    projectTypesApplicable: ['510k'],
    documentTypesApplicable: ['510k'],
  },
  {
    capabilityKey: 'draft-regulatory-response',
    category: 'drafting',
    name: 'Draft Regulatory Response',
    description: 'Generate responses to FDA Complete Response Letters, EMA Day 120/180 questions, and Information Requests.',
    slashCommand: '/draft-response',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['regulatory-response', 'crl-response', 'ir-response'],
  },
  {
    capabilityKey: 'draft-cmc',
    category: 'drafting',
    name: 'Draft CMC Documentation',
    description: 'Generate Chemistry, Manufacturing, and Controls sections (Module 3) including drug substance, drug product, and stability data.',
    slashCommand: '/draft-cmc',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: ['cmc', 'ctd-module-3'],
  },

  // ── Compliance (4) ────────────────────────────────────────
  {
    capabilityKey: 'compliance-scan-fda',
    category: 'compliance',
    name: 'FDA Compliance Scan',
    description: 'Scan document against FDA guidance, 21 CFR requirements, and recent FDA feedback patterns for compliance gaps.',
    slashCommand: '/compliance-scan',
    regulatoryBodiesApplicable: ['FDA'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'compliance-scan-ema',
    category: 'compliance',
    name: 'EMA Compliance Scan',
    description: 'Scan document against EMA guidelines, EU regulatory framework, and CHMP assessment patterns.',
    slashCommand: '/compliance-scan',
    regulatoryBodiesApplicable: ['EMA'],
    projectTypesApplicable: ['MAA', 'IND'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'ctd-module'],
  },
  {
    capabilityKey: 'compliance-scan-pmda',
    category: 'compliance',
    name: 'PMDA Compliance Scan',
    description: 'Scan document against PMDA-specific requirements, J-NDA formatting, and Japanese regulatory expectations.',
    slashCommand: '/compliance-scan',
    regulatoryBodiesApplicable: ['PMDA'],
    projectTypesApplicable: ['JNDA', 'IND'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'ctd-module'],
  },
  {
    capabilityKey: 'compliance-scan-multi',
    category: 'compliance',
    name: 'Multi-Agency Compliance Scan',
    description: 'Simultaneous compliance scan across FDA, EMA, and PMDA requirements with delta analysis between agencies.',
    slashCommand: '/compliance-scan-all',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'ctd-module', 'cmc'],
  },

  // ── Analysis (5) ──────────────────────────────────────────
  {
    capabilityKey: 'gap-analysis',
    category: 'analysis',
    name: 'Regulatory Gap Analysis',
    description: 'Identify missing data, incomplete arguments, and regulatory gaps relative to target agency requirements.',
    slashCommand: '/gap-analysis',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'cross-reference-check',
    category: 'analysis',
    name: 'Cross-Reference Validation',
    description: 'Validate cross-references between document sections, ensure data consistency, and flag orphaned references.',
    slashCommand: '/cross-ref-check',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', 'ctd-module'],
  },
  {
    capabilityKey: 'consistency-analysis',
    category: 'analysis',
    name: 'Cross-Section Consistency Analysis',
    description: 'Analyze consistency of claims, numbers, and terminology across document sections and related documents.',
    slashCommand: '/consistency-check',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', 'ctd-module'],
  },
  {
    capabilityKey: 'literature-review',
    category: 'analysis',
    name: 'Literature Review Analysis',
    description: 'Analyze and synthesize published literature for regulatory context, competitive landscape, and evidence gaps.',
    slashCommand: '/literature-review',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'literature-review'],
  },
  {
    capabilityKey: 'predicate-comparison',
    category: 'analysis',
    name: 'Predicate Device Comparison',
    description: 'Compare device characteristics against predicate devices for substantial equivalence arguments.',
    slashCommand: '/predicate-compare',
    regulatoryBodiesApplicable: ['FDA'],
    projectTypesApplicable: ['510k'],
    documentTypesApplicable: ['510k', 'predicate-comparison'],
  },

  {
    capabilityKey: 'render-signature-manifestation',
    category: 'compliance',
    name: 'Render Signature Manifestation (§11.50)',
    description:
      'Produce the human-readable 21 CFR Part 11 §11.50 signature manifestation block — printed name, date/time of signing (UTC), and meaning — plus supporting authentication and signature-id/hash controls, to embed in any rendered (PDF/Word) form of a signed record for inspection readiness.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  // ── Intelligence (4) ──────────────────────────────────────
  {
    capabilityKey: 'assess-output-confidence',
    category: 'intelligence',
    name: 'Honest Confidence Envelope',
    description:
      "Attach honest confidence to any quantitative output — a confidence level + label ('confidence: medium (n=28, freshness: 6 days ago)') from the evidence basis, downgraded when stale and always 'low (insufficient data)' at n=0 — and gate 'final-ready' on missing/stale dependencies with explicit blockers. The platform's 'confidence with its denominator attached' moat as a reusable primitive.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'check-grounding',
    category: 'analysis',
    name: 'Grounding Guarantee Check',
    description:
      "Detect quantitative claims (percentages, p-values, sample sizes, CIs, doses, durations) in drafted text that lack a citation/source marker, with a grounding score — so every number is traced to a source or hedged before it reaches a regulatory reader. Deterministic, no LLM; makes the 'never state a number without a cited source' rule structural.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'scan-regulatory-deficiencies',
    category: 'intelligence',
    name: 'Deterministic Deficiency Scan',
    description:
      "Scan regulatory text against the codified pattern registry (95+ FDA/EMA deficiency and reviewer-trigger patterns) with NO language-model call — pure heuristic matching. Returns each match with severity, the reviewer question it provokes, the regulatory basis, and a concrete remediation. AnA's fast, reproducible reasoning-without-the-LLM surface.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'rim-pattern-detection',
    category: 'intelligence',
    name: 'RIM Pattern Detection',
    description: 'Detect regulatory deficiency patterns, reviewer triggers, and risk signals using the Regulatory Intelligence Model.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'rim-signal-capture',
    category: 'intelligence',
    name: 'RIM Signal Capture',
    description: 'Capture and persist intelligence signals from chat, compliance scans, artifacts, and user feedback.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'rim-judgment-scoring',
    category: 'intelligence',
    name: 'RIM Judgment Scoring',
    description: 'Score content using 6 codified judgment models: evidence sufficiency, defensibility, reviewer sensitivity, claim risk, consistency, submission risk.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'rim-trend-analysis',
    category: 'intelligence',
    name: 'RIM Trend Analysis',
    description: 'Analyze trends in regulatory signals over time to identify improving or declining quality patterns.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },

  // ── Knowledge (3) ─────────────────────────────────────────
  {
    capabilityKey: 'cortex-knowledge-atoms',
    category: 'knowledge',
    name: 'CORTEX Knowledge Atoms',
    description: 'Extract, store, and retrieve knowledge atoms from documents and conversations for persistent project memory.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'cortex-semantic-search',
    category: 'knowledge',
    name: 'CORTEX Semantic Search',
    description: 'Search project knowledge base using semantic similarity to find relevant precedents, data, and prior analyses.',
    slashCommand: '/search',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'remember-document-in-project',
    category: 'knowledge',
    name: 'Remember Document in Project',
    description:
      "Promote a document AnA has read into the project's durable memory (embedded project_memory_entries) so it is automatically recalled in future sessions via the memory assembler and session bootstrap — reusing the real project-ingestion pipeline.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'search-large-document',
    category: 'knowledge',
    name: 'Search Within a Large Document',
    description:
      "Extract a single uploaded document's full text server-side and return only the query-relevant windows (with offsets) plus a heading outline — so AnA can work with documents far larger than the per-turn context cap without dumping the whole file.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'project-knowledge-search-multi',
    category: 'knowledge',
    name: 'Multi-Query Project Knowledge Search',
    description:
      'Run several knowledge-base searches against the active project corpus simultaneously, then merge and de-duplicate into one relevance-ranked passage list — decompose a complex question into sub-queries and gather all the evidence at once instead of searching one angle at a time.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'recall-session-context',
    category: 'knowledge',
    name: 'Recall Session Context',
    description:
      "Rehydrate prior context at the start of a conversation so a session never starts cold — load where we left off (latest thread summary), the most important project and client knowledge atoms (query-independent), and recent lessons from AnA's own past work on this org/project.",
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'cortex-thread-management',
    category: 'knowledge',
    name: 'CORTEX Thread Management',
    description: 'Manage conversation threads with context continuity, memory injection, and intelligent thread summarization.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },

  // ── Prediction (3) ────────────────────────────────────────
  {
    capabilityKey: 'run-submission-premortem',
    category: 'prediction',
    name: 'Submission Pre-Mortem (RTF/CRL)',
    description:
      'Predict what a reviewer is likely to flag BEFORE filing — composing deterministic deficiency/reviewer-trigger detection with the precedent engine into a ranked, remediated, citation-backed readiness verdict. Honest by construction: the risk read always carries its confidence and denominator and degrades to an explicit pattern-only / insufficient-data note rather than a fabricated probability. Helps clients avoid a refuse-to-file or complete-response cycle.',
    slashCommand: '/premortem',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'foresight-timeline',
    category: 'prediction',
    name: 'Foresight Timeline Prediction',
    description: 'Predict submission timelines based on current progress, historical patterns, and regulatory calendar.',
    slashCommand: '/foresight-timeline',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'foresight-risk',
    category: 'prediction',
    name: 'Foresight Risk Prediction',
    description: 'Predict regulatory risks and potential deficiencies based on submission profile and historical outcomes.',
    slashCommand: '/foresight-risk',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'foresight-readiness',
    category: 'prediction',
    name: 'Foresight Readiness Assessment',
    description: 'Assess overall submission readiness across all dimensions: content, quality, compliance, and completeness.',
    slashCommand: '/foresight-readiness',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },

  // ── Submission (3) ────────────────────────────────────────
  {
    capabilityKey: 'submission-readiness',
    category: 'submission',
    name: 'Submission Readiness Check',
    description: 'Comprehensive readiness check across all CTD modules, identifying gaps, risks, and completion status.',
    slashCommand: '/submission-readiness',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'dossier-mapping',
    category: 'submission',
    name: 'Dossier Structure Mapping',
    description: 'Map project documents to CTD dossier structure, identify missing sections, and generate assembly plan.',
    slashCommand: '/dossier-map',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'submission-planning',
    category: 'submission',
    name: 'Submission Planning',
    description: 'Generate submission plan with milestones, dependencies, and agency-specific requirements timeline.',
    slashCommand: '/submission-plan',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },

  // ── Workflow (3) ──────────────────────────────────────────
  {
    capabilityKey: 'authoring-review',
    category: 'workflow',
    name: 'Authoring Review Workflow',
    description: 'Initiate and manage document review cycles with tracked comments, suggested changes, and resolution workflow.',
    slashCommand: '/review',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'authoring-approve',
    category: 'workflow',
    name: 'Authoring Approval Workflow',
    description: 'Manage approval workflow with escalation gating, signature collection, and audit trail for 21 CFR Part 11.',
    slashCommand: '/approve',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'version-management',
    category: 'workflow',
    name: 'Version Management',
    description: 'Track document versions with diff analysis, impact review, and RIM-enriched change assessment.',
    slashCommand: '/versions',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  // ── Document formatting (3) ───────────────────────────────
  {
    capabilityKey: 'extract-template',
    category: 'formatting',
    name: 'Recreate a Template from an Upload',
    description:
      'Read an uploaded Word or PDF document and recreate its formatting as a reusable client template — page size, margins, fonts, brand colours, logo, and running header/footer. Reports an extraction confidence and asks you to confirm before saving.',
    slashCommand: '/extract-template',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'build-template',
    category: 'formatting',
    name: 'Build or Adjust a Client Template',
    description:
      'Create or edit a client formatting template conversationally — set margins, fonts, sizes, colours, header and footer text, and the logo — without touching a settings panel.',
    slashCommand: '/template',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'render-with-template',
    category: 'formatting',
    name: 'Produce Word and PDF in the Client Template',
    description:
      'Render a document as a Microsoft Word (.docx) file and a PDF that match a saved client template exactly — same fonts, margins, logo, header and footer.',
    slashCommand: '/produce',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },

  // ── Compute (2) ───────────────────────────────────────────
  {
    capabilityKey: 'run-python-script',
    category: 'compute',
    name: 'Run Python Script (Sandboxed)',
    description:
      'Write and run Python 3 in an isolated sandbox (no network, bounded CPU/memory, wall-clock timeout) to do something precisely — data transforms, parsing, numerical/biostat checks, generating intermediate artifacts, or bespoke manipulation no structured tool covers. Returns stdout, stderr, and any files the script produced.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'insert-document-content',
    category: 'compute',
    name: 'Targeted Document Insertion',
    description:
      'Make precise, surgical insertions into an existing Word (.docx) document at exact anchors — heading text, placeholder token, paragraph index, or document start/end — inserting before/after or replacing. The governed equivalent of scripting exact edits; preserves the source and returns a per-insertion outcome report.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },

  {
    capabilityKey: 'surgical-docx-xml-edit',
    category: 'compute',
    name: 'Surgical OOXML Document Edit',
    description:
      'Edit an existing Word (.docx) at the raw OOXML/XML level — unpack the archive, locate text anchors in word/document.xml, insert new paragraph blocks inheriting the anchor formatting (fonts, bold/italic, spacing, justification) or replace placeholders preserving run formatting, then repack and validate. The deepest, formatting-faithful document-surgery path.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'insert-clause-template',
    category: 'compute',
    name: 'Insert Regulatory Clause Template',
    description:
      'Insert a named, field-validated regulatory building block into an existing Word (.docx) — signature/approval block, cover-letter header, section heading, or sponsor placeholder swap ({{SPONSOR}}-style tokens). A curated content layer over the governed docx-insert worker: supply the clause key and fields and it renders the block (required-field checks included) and inserts it at the chosen anchor. The productized equivalent of hand-scripting per-document clause helpers.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },
  {
    capabilityKey: 'run-in-container',
    category: 'compute',
    name: 'Run in Hardened Container',
    description:
      'Run a bash script inside a real, hardened Linux container (bash + Python + file tools) — dropped capabilities, no privilege escalation, read-only root fs, resource limits, non-root user, wall-clock timeout, and network off unless explicitly enabled. The native computer-use path for multi-step shell/file workflows. Gated by deployment configuration.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: [],
  },
  {
    capabilityKey: 'validate-docx',
    category: 'compute',
    name: 'Validate Document Integrity',
    description:
      'Validate a Word (.docx) OOXML/ZIP integrity without modifying it — required parts present, every XML part well-formed, relationship targets resolve, python-docx round-trip — to catch silent corruption before a document ships.',
    slashCommand: null,
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['csr', 'protocol', 'ib', 'nda-section', '510k', 'cmc'],
  },

  // ── Commitments (2) ───────────────────────────────────────
  {
    capabilityKey: 'extract-commitments',
    category: 'commitments',
    name: 'Extract Regulatory Commitments',
    description:
      'Find every binding commitment in a document — inbound (PMR, PMC, REMS, EU Annex II / specific obligations / PASS / PAES, PMA conditions, 522 studies) and outbound (the applicant’s own promises) — source-anchored to the exact span, with direction, type, owner, and deadline.',
    slashCommand: '/extract-commitments',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['approval-letter', 'meeting-minutes', 'correspondence', 'submission'],
  },
  {
    capabilityKey: 'track-commitments',
    category: 'commitments',
    name: 'Track Regulatory Commitments',
    description:
      'Track inbound and outbound commitments to closure across the post-approval lifecycle: deadlines, owners, status, and evidence, with governed status changes and an audit trail.',
    slashCommand: '/commitments',
    regulatoryBodiesApplicable: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
    projectTypesApplicable: ['IND', 'NDA', 'BLA', 'MAA', '510k'],
    documentTypesApplicable: ['approval-letter', 'submission'],
  },
];

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Seed the global capability registry with all known AnA capabilities.
 * Uses ON CONFLICT DO NOTHING so it is safe to call on every startup.
 * New capabilities are added; existing ones are left untouched.
 */
export async function seedCapabilityRegistry(): Promise<{ seeded: number; total: number }> {
  // Declared HERE, not by the caller. ana_capability_registry is a global table
  // (no tenant column, no policy), but the pool refuses ANY statement issued
  // with no tenant scope once RLS_ENFORCE=on — the only value production
  // accepts — and this seed runs from startup, in no request and no job. It
  // failed on every production boot ("seeding failed (non-blocking)"), the
  // table stayed empty, and ana-context-router.ts had nothing to route a turn
  // with. Same pattern as template-seeds.ts: the function that needs the scope
  // owns it, so no caller can forget it.
  return runWithSystemTenantScope('ana-capability-registry:seed', () => seedUnscoped());
}

async function seedUnscoped(): Promise<{ seeded: number; total: number }> {
  let seeded = 0;

  for (const cap of SEED_CAPABILITIES) {
    const gov = governanceFor(cap.capabilityKey, cap.category, {
      name: cap.name,
      description: cap.description,
    });
    const result = await db
      .insert(anaCapabilityRegistry)
      .values({
        capabilityKey: cap.capabilityKey,
        category: cap.category,
        name: cap.name,
        description: cap.description,
        slashCommand: cap.slashCommand,
        regulatoryBodiesApplicable: cap.regulatoryBodiesApplicable,
        projectTypesApplicable: cap.projectTypesApplicable,
        documentTypesApplicable: cap.documentTypesApplicable,
        intendedUse: gov.intendedUse,
        riskTier: gov.riskTier,
        humanOversight: gov.humanOversight,
        groundednessThreshold: gov.groundednessThreshold,
        gxpApplicable: gov.gxpApplicable,
      })
      .onConflictDoNothing({ target: anaCapabilityRegistry.capabilityKey })
      .returning({ id: anaCapabilityRegistry.id });

    if (result.length > 0) {
      seeded++;
    }
  }

  // Existing rows are skipped by onConflictDoNothing above, so refresh their
  // governance contract from the code source of truth (governanceFor) too.
  const { updated } = await backfillUnscoped();
  if (updated > 0) {
    logger.info(`Refreshed AI governance contract on ${updated} capabilities`);
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(anaCapabilityRegistry);

  return { seeded, total: countResult?.count ?? 0 };
}

/**
 * Refresh the per-capability governance contract (intended use, risk tier,
 * human oversight, groundedness threshold, GxP applicability) on every row of
 * the registry from the single code source of truth (`governanceFor`). Safe to
 * run repeatedly; brings existing installs up to date when the policy changes.
 */
export async function backfillCapabilityGovernance(): Promise<{ updated: number }> {
  // Own scope for the same reason as the seed: callable from startup or an
  // operator script with no ambient tenant.
  return runWithSystemTenantScope('ana-capability-registry:backfill-governance', () =>
    backfillUnscoped()
  );
}

async function backfillUnscoped(): Promise<{ updated: number }> {
  const rows = await db
    .select({
      id: anaCapabilityRegistry.id,
      capabilityKey: anaCapabilityRegistry.capabilityKey,
      category: anaCapabilityRegistry.category,
      name: anaCapabilityRegistry.name,
      description: anaCapabilityRegistry.description,
    })
    .from(anaCapabilityRegistry);

  let updated = 0;
  for (const row of rows) {
    const gov = governanceFor(row.capabilityKey, row.category, {
      name: row.name,
      description: row.description,
    });
    await db
      .update(anaCapabilityRegistry)
      .set({
        intendedUse: gov.intendedUse,
        riskTier: gov.riskTier,
        humanOversight: gov.humanOversight,
        groundednessThreshold: gov.groundednessThreshold,
        gxpApplicable: gov.gxpApplicable,
        updatedAt: new Date(),
      })
      .where(eq(anaCapabilityRegistry.id, row.id));
    updated++;
  }
  return { updated };
}

/**
 * Build a compressed capability context block (~15 lines of markdown) for
 * prompt injection. Queries active capabilities, filters by regulatory bodies
 * and project type, groups by category, and shows top capabilities per category
 * with success rate.
 *
 * @param projectId - Optional project ID to scope capabilities
 * @param regulatoryBodies - Optional list of regulatory bodies to filter by (e.g. ['FDA', 'EMA'])
 * @param projectType - Optional project type to filter by (e.g. 'NDA', 'IND')
 * @returns Compressed markdown string for context injection
 */
export async function buildAnaCapabilityContext(
  projectId?: number,
  regulatoryBodies?: string[],
  projectType?: string
): Promise<string> {
  // Fetch all active capabilities
  const capabilities = await db
    .select()
    .from(anaCapabilityRegistry)
    .where(eq(anaCapabilityRegistry.isActive, true))
    .orderBy(desc(anaCapabilityRegistry.successCount));

  // Filter by regulatory bodies and project type in application layer
  // (JSON array containment is simpler here than in SQL)
  const filtered = capabilities.filter(cap => {
    if (regulatoryBodies && regulatoryBodies.length > 0) {
      const applicable = cap.regulatoryBodiesApplicable as string[] | null;
      if (applicable && applicable.length > 0) {
        const hasMatch = regulatoryBodies.some(rb => applicable.includes(rb));
        if (!hasMatch) return false;
      }
    }
    if (projectType) {
      const applicable = cap.projectTypesApplicable as string[] | null;
      if (applicable && applicable.length > 0) {
        if (!applicable.includes(projectType)) return false;
      }
    }
    return true;
  });

  // Group by category
  const grouped = new Map<string, typeof filtered>();
  for (const cap of filtered) {
    const list = grouped.get(cap.category) ?? [];
    list.push(cap);
    grouped.set(cap.category, list);
  }

  // Build compressed markdown
  const lines: string[] = ['## AnA Capabilities'];

  const categoryOrder = [
    'drafting', 'compliance', 'analysis', 'intelligence',
    'knowledge', 'prediction', 'submission', 'workflow',
    'formatting', 'compute', 'commitments',
  ];

  for (const cat of categoryOrder) {
    const caps = grouped.get(cat);
    if (!caps || caps.length === 0) continue;

    // Take top 3 per category by usage
    const top = caps.slice(0, 3);
    const capEntries = top.map(c => {
      const total = c.successCount + c.failureCount + c.partialCount;
      const rate = total > 0 ? Math.round((c.successCount / total) * 100) : 0;
      const cmd = c.slashCommand ? ` \`${c.slashCommand}\`` : '';
      const rateStr = total > 5 ? ` (${rate}%)` : '';
      return `${c.name}${cmd}${rateStr}`;
    });

    lines.push(`**${cat}**: ${capEntries.join(' | ')}`);
  }

  if (projectId) {
    lines.push(`_Scoped to project #${projectId}_`);
  }
  if (regulatoryBodies && regulatoryBodies.length > 0) {
    lines.push(`_Agencies: ${regulatoryBodies.join(', ')}_`);
  }

  return lines.join('\n');
}

/**
 * Log an outcome for a capability invocation. Updates both the outcome log
 * and the capability's aggregate counters. Non-blocking: errors are caught
 * and logged, never thrown to the caller.
 *
 * @param params - Outcome details including capability key, action type, and result
 */
export async function logOutcome(params: {
  organizationId: number;
  projectId?: number;
  userId?: number;
  capabilityKey: string;
  actionType: string;
  outcome: 'success' | 'partial' | 'failure';
  qualityScore?: number;
  userFeedback?: string;
  editDelta?: string;
  errorMessage?: string;
  regulatoryBody?: string;
  projectType?: string;
  therapeuticArea?: string;
  documentType?: string;
  sectionCode?: string;
  durationMs?: number;
  tokenCount?: number;
  lessonsLearned?: string;
  inputSummary?: string;
}): Promise<void> {
  try {
    // Insert into outcome log
    await db.insert(anaOutcomeLog).values({
      organizationId: params.organizationId,
      projectId: params.projectId ?? null,
      userId: params.userId ?? null,
      capabilityKey: params.capabilityKey,
      actionType: params.actionType,
      outcome: params.outcome,
      qualityScore: params.qualityScore ?? null,
      userFeedback: params.userFeedback ?? null,
      editDelta: params.editDelta ?? null,
      errorMessage: params.errorMessage ?? null,
      regulatoryBody: params.regulatoryBody ?? null,
      projectType: params.projectType ?? null,
      therapeuticArea: params.therapeuticArea ?? null,
      documentType: params.documentType ?? null,
      sectionCode: params.sectionCode ?? null,
      durationMs: params.durationMs ?? null,
      tokenCount: params.tokenCount ?? null,
      lessonsLearned: params.lessonsLearned ?? null,
      inputSummary: params.inputSummary ?? null,
    });

    // Update aggregate counters on the capability registry
    const counterField =
      params.outcome === 'success'
        ? anaCapabilityRegistry.successCount
        : params.outcome === 'failure'
          ? anaCapabilityRegistry.failureCount
          : anaCapabilityRegistry.partialCount;

    await db
      .update(anaCapabilityRegistry)
      .set({
        [counterField.name]: sql`${counterField} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(anaCapabilityRegistry.capabilityKey, params.capabilityKey));

    // Update avg quality score if provided
    if (params.qualityScore != null) {
      await db
        .update(anaCapabilityRegistry)
        .set({
          avgQualityScore: sql`(
            COALESCE(${anaCapabilityRegistry.avgQualityScore}, 0) *
            (${anaCapabilityRegistry.successCount} + ${anaCapabilityRegistry.failureCount} + ${anaCapabilityRegistry.partialCount} - 1)
            + ${params.qualityScore}
          ) / NULLIF(${anaCapabilityRegistry.successCount} + ${anaCapabilityRegistry.failureCount} + ${anaCapabilityRegistry.partialCount}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(anaCapabilityRegistry.capabilityKey, params.capabilityKey));
    }
  } catch (error) {
    // Non-blocking: log but never throw
    logger.error('Failed to log outcome', { err: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Get effectiveness metrics for a specific capability, optionally filtered
 * by regulatory body and project type.
 *
 * @param capabilityKey - The capability to analyze
 * @param filters - Optional filters for regulatory body and project type
 * @returns Effectiveness metrics including success rate, avg quality, total uses, and trend
 */
export async function getCapabilityEffectiveness(
  capabilityKey: string,
  filters?: { regulatoryBody?: string; projectType?: string }
): Promise<{
  successRate: number;
  avgQuality: number;
  totalUses: number;
  trend: 'improving' | 'stable' | 'declining';
}> {
  // Build filter conditions
  const conditions = [eq(anaOutcomeLog.capabilityKey, capabilityKey)];
  if (filters?.regulatoryBody) {
    conditions.push(eq(anaOutcomeLog.regulatoryBody, filters.regulatoryBody));
  }
  if (filters?.projectType) {
    conditions.push(eq(anaOutcomeLog.projectType, filters.projectType));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  // Aggregate metrics
  const [metrics] = await db
    .select({
      total: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) FILTER (WHERE ${anaOutcomeLog.outcome} = 'success')::int`,
      avgQuality: sql<number>`COALESCE(avg(${anaOutcomeLog.qualityScore}), 0)::real`,
    })
    .from(anaOutcomeLog)
    .where(whereClause!);

  const total = metrics?.total ?? 0;
  const successes = metrics?.successes ?? 0;
  const avgQuality = metrics?.avgQuality ?? 0;
  const successRate = total > 0 ? successes / total : 0;

  // Compute trend: compare last 10 vs previous 10 outcomes
  const recentOutcomes = await db
    .select({
      outcome: anaOutcomeLog.outcome,
      createdAt: anaOutcomeLog.createdAt,
    })
    .from(anaOutcomeLog)
    .where(whereClause!)
    .orderBy(desc(anaOutcomeLog.createdAt))
    .limit(20);

  let trend: 'improving' | 'stable' | 'declining' = 'stable';

  if (recentOutcomes.length >= 10) {
    const recent = recentOutcomes.slice(0, 10);
    const previous = recentOutcomes.slice(10, 20);

    const recentSuccessRate = recent.filter(o => o.outcome === 'success').length / recent.length;
    const previousSuccessRate =
      previous.length > 0
        ? previous.filter(o => o.outcome === 'success').length / previous.length
        : recentSuccessRate;

    const delta = recentSuccessRate - previousSuccessRate;
    if (delta > 0.1) trend = 'improving';
    else if (delta < -0.1) trend = 'declining';
  }

  return {
    successRate: Math.round(successRate * 1000) / 1000,
    avgQuality: Math.round(avgQuality * 10) / 10,
    totalUses: total,
    trend,
  };
}

/**
 * Get recommended capabilities for a given task, ranked by relevance and
 * success rate. Matches capabilities by category overlap, regulatory body,
 * and project type, then sorts by effectiveness.
 *
 * @param taskType - The type of task (maps to capability categories, e.g. 'drafting', 'compliance')
 * @param regulatoryBody - Optional regulatory body context
 * @param projectType - Optional project type context
 * @returns Ranked list of recommended capabilities
 */
export async function getRecommendedCapabilities(
  taskType: string,
  regulatoryBody?: string,
  projectType?: string
): Promise<Array<{
  capabilityKey: string;
  name: string;
  description: string;
  slashCommand: string | null;
  successRate: number;
  totalUses: number;
  relevanceScore: number;
}>> {
  const capabilities = await db
    .select()
    .from(anaCapabilityRegistry)
    .where(eq(anaCapabilityRegistry.isActive, true));

  // Score each capability for relevance
  const scored = capabilities.map(cap => {
    let relevanceScore = 0;

    // Category match (strongest signal)
    if (cap.category === taskType) {
      relevanceScore += 50;
    }

    // Regulatory body match
    if (regulatoryBody) {
      const applicable = cap.regulatoryBodiesApplicable as string[] | null;
      if (applicable?.includes(regulatoryBody)) {
        relevanceScore += 25;
      }
    }

    // Project type match
    if (projectType) {
      const applicable = cap.projectTypesApplicable as string[] | null;
      if (applicable?.includes(projectType)) {
        relevanceScore += 20;
      }
    }

    // Success rate bonus (0-5 points)
    const totalUses = cap.successCount + cap.failureCount + cap.partialCount;
    const successRate = totalUses > 0 ? cap.successCount / totalUses : 0;
    relevanceScore += successRate * 5;

    return {
      capabilityKey: cap.capabilityKey,
      name: cap.name,
      description: cap.description,
      slashCommand: cap.slashCommand,
      successRate: Math.round(successRate * 1000) / 1000,
      totalUses,
      relevanceScore: Math.round(relevanceScore * 10) / 10,
    };
  });

  // Filter out zero-relevance and sort by relevance descending
  return scored
    .filter(s => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Get capabilities that are relevant and enabled for a specific project.
 * Returns from the ana_project_capabilities join table, which tracks
 * per-project capability usage and effectiveness.
 *
 * @param projectId - The project ID to query capabilities for
 * @returns List of project-scoped capabilities with usage and effectiveness data
 */
export async function getProjectCapabilities(
  projectId: number
): Promise<Array<{
  capabilityKey: string;
  name: string;
  description: string;
  slashCommand: string | null;
  category: string;
  enabled: boolean;
  timesUsed: number;
  effectivenessScore: number | null;
  successRate: number | null;
  lastUsedAt: Date | null;
  projectSpecificNotes: string | null;
}>> {
  const results = await db
    .select({
      capabilityKey: anaProjectCapabilities.capabilityKey,
      name: anaCapabilityRegistry.name,
      description: anaCapabilityRegistry.description,
      slashCommand: anaCapabilityRegistry.slashCommand,
      category: anaCapabilityRegistry.category,
      enabled: anaProjectCapabilities.enabled,
      timesUsed: anaProjectCapabilities.timesUsed,
      effectivenessScore: anaProjectCapabilities.effectivenessScore,
      successRate: anaProjectCapabilities.successRate,
      lastUsedAt: anaProjectCapabilities.lastUsedAt,
      projectSpecificNotes: anaProjectCapabilities.projectSpecificNotes,
    })
    .from(anaProjectCapabilities)
    .innerJoin(
      anaCapabilityRegistry,
      eq(anaProjectCapabilities.capabilityKey, anaCapabilityRegistry.capabilityKey)
    )
    .where(
      and(
        eq(anaProjectCapabilities.projectId, projectId),
        eq(anaProjectCapabilities.enabled, true),
        eq(anaCapabilityRegistry.isActive, true)
      )
    )
    .orderBy(desc(anaProjectCapabilities.timesUsed));

  return results;
}
