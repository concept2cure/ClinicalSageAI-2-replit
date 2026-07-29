/**
 * Region-specific clinical-trial design rules.
 *
 * Given a study design and the agencies a sponsor intends to file with, this
 * engine returns the region-specific design requirements that apply and whether
 * the design meets them — bridging strategy and ethnic-sensitivity (ICH E5),
 * multi-regional consistency (ICH E17), local-subject representation, thorough
 * QT in the regional population (ICH E14), post-Brexit UK separation, Swiss and
 * Brazilian local-submission requirements, Project Orbis eligibility, and the
 * FDA diversity action plan.
 *
 * It complements `cross-jurisdictional-intelligence.ts` (which maps divergences
 * between agencies) by evaluating one concrete design against each agency's
 * rules and emitting the established ValidationResult-style findings
 * (error / warning / info + recommendation), each carrying a retrievable
 * guidance citation.
 *
 * The ruleset is codified, deterministic, and unit-tested. Full-text ingestion
 * of the underlying guidance corpus is a separate data-ops dependency (see
 * workstream #1); here the guidance is retrievable as structured citations.
 *
 * Pure and deterministic. No fabrication: a rule that does not apply to a design
 * is reported as not-applicable rather than guessed.
 */

import { buildProvenance, type StatsProvenance } from './stats/computation-provenance';

export type Agency = 'FDA' | 'EMA' | 'PMDA' | 'MHRA' | 'NMPA' | 'Swissmedic' | 'ANVISA';

export type Severity = 'error' | 'warning' | 'info';
export type RuleStatus = 'met' | 'unmet' | 'attention' | 'not-applicable';

/** Agencies that participate in FDA's Project Orbis for concurrent oncology review. */
export const PROJECT_ORBIS_AGENCIES: Agency[] = [
  'FDA', 'MHRA', 'Swissmedic', 'ANVISA',
];

export interface RegionDesignInput {
  /** Agencies the sponsor intends to file with. */
  targetAgencies: Agency[];
  phase?: '1' | '2' | '3' | '4';
  /** Whether the program is a single multi-regional clinical trial (MRCT). */
  multiRegional?: boolean;
  /** Per-agency representation of that region's subjects in the program. */
  localRepresentation?: Partial<Record<Agency, { included: boolean; fraction?: number }>>;
  /** Whether an ICH E5 ethnic-sensitivity (intrinsic/extrinsic) assessment is planned. */
  ethnicSensitivityAssessed?: boolean;
  /** Whether an ICH E17 regional consistency assessment is pre-specified. */
  regionalConsistencyPlan?: boolean;
  /** Whether a thorough QT/QTc evaluation is included. */
  thoroughQt?: boolean;
  /** Whether QT data are collected in the regional (e.g. Japanese / Chinese) population. */
  qtInRegionalPopulation?: boolean;
  /** Whether an FDA diversity action plan is in place (pivotal trials). */
  diversityPlan?: boolean;
  /** Per-agency local sponsor / legal representative arranged. */
  localSponsorRepresentative?: Partial<Record<Agency, boolean>>;
  /** Whether a reliance pathway (Access Consortium / Project Orbis) is being used. */
  usesReliancePathway?: boolean;
  /** Oncology indication (relevant to Project Orbis eligibility). */
  oncology?: boolean;
}

export interface GuidanceRef {
  source: string;
  reference: string;
  note: string;
}

export interface RegionRuleCatalogEntry {
  id: string;
  agency: Agency | 'ALL';
  title: string;
  topic: 'bridging' | 'ethnic-sensitivity' | 'mrct' | 'local-data' | 'qt'
    | 'jurisdiction' | 'local-representation' | 'reliance' | 'diversity';
  defaultSeverity: Severity;
  guidance: GuidanceRef;
}

interface RegionRule extends RegionRuleCatalogEntry {
  applies(input: RegionDesignInput): boolean;
  evaluate(input: RegionDesignInput): { status: RuleStatus; message: string; recommendation: string };
}

export interface RegionFinding {
  ruleId: string;
  agency: Agency | 'ALL';
  title: string;
  topic: RegionRuleCatalogEntry['topic'];
  status: RuleStatus;
  severity: Severity;
  message: string;
  recommendation: string;
  guidance: GuidanceRef;
}

export interface RegionEvaluationResult {
  /** Findings for rules that apply, grouped per agency (plus ALL/MRCT rules). */
  findings: RegionFinding[];
  /** Findings needing action (unmet or attention), worst-first. */
  issues: RegionFinding[];
  /** Deduplicated, ordered recommendations. */
  recommendations: string[];
  /** True when no error- or warning-severity issue remains. */
  allClear: boolean;
  errorCount: number;
  warningCount: number;
  provenance: StatsProvenance;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasLocalSubjects(input: RegionDesignInput, agency: Agency): boolean {
  const rep = input.localRepresentation?.[agency];
  return !!rep?.included;
}

// ── Rule catalog ─────────────────────────────────────────────────────────────

const RULES: RegionRule[] = [
  {
    id: 'PMDA-E5-BRIDGING',
    agency: 'PMDA',
    title: 'Japanese ethnic sensitivity and bridging strategy',
    topic: 'bridging',
    defaultSeverity: 'error',
    guidance: {
      source: 'ICH E5(R1) / PMDA',
      reference: 'ICH E5(R1) Ethnic Factors; PMDA Basic Principles on Global Clinical Trials (2007)',
      note: 'A bridging strategy or inclusion of Japanese subjects is expected when foreign data are extrapolated to the Japanese population.',
    },
    applies: i => i.targetAgencies.includes('PMDA'),
    evaluate: i => {
      const local = hasLocalSubjects(i, 'PMDA');
      if (local && i.ethnicSensitivityAssessed) {
        return { status: 'met', message: 'Japanese subjects are included and ethnic sensitivity is assessed.', recommendation: '' };
      }
      if (local && !i.ethnicSensitivityAssessed) {
        return { status: 'attention', message: 'Japanese subjects are included but no ethnic-sensitivity assessment is recorded.', recommendation: 'Document an ICH E5 intrinsic/extrinsic ethnic-factor assessment.' };
      }
      return { status: 'unmet', message: 'No Japanese subject representation and no ethnic-sensitivity assessment.', recommendation: 'Plan a bridging study or include Japanese subjects, with an ICH E5 ethnic-factor assessment.' };
    },
  },
  {
    id: 'PMDA-E17-MRCT',
    agency: 'PMDA',
    title: 'Japanese participation in a multi-regional trial',
    topic: 'mrct',
    defaultSeverity: 'warning',
    guidance: {
      source: 'ICH E17 / PMDA',
      reference: 'ICH E17 General Principles for MRCTs (2017); PMDA guidance on Japanese subjects in global trials',
      note: 'Pre-specify Japanese sample-size allocation and a consistency assessment between Japan and the overall population.',
    },
    applies: i => i.targetAgencies.includes('PMDA') && !!i.multiRegional,
    evaluate: i => {
      const ok = hasLocalSubjects(i, 'PMDA') && i.regionalConsistencyPlan;
      return ok
        ? { status: 'met', message: 'Japanese subjects allocated with a pre-specified consistency assessment.', recommendation: '' }
        : { status: 'unmet', message: 'MRCT lacks Japanese allocation or a pre-specified Japan-vs-overall consistency assessment.', recommendation: 'Allocate Japanese subjects and pre-specify an ICH E17 regional consistency assessment.' };
    },
  },
  {
    id: 'NMPA-LOCAL-DATA',
    agency: 'NMPA',
    title: 'Chinese subject data requirement',
    topic: 'local-data',
    defaultSeverity: 'error',
    guidance: {
      source: 'NMPA / ICH E17',
      reference: 'NMPA Technical Guidance on Accepting Overseas Clinical Trial Data (2018); ICH E17',
      note: 'Chinese subject data (within an MRCT or a bridging study) are generally required to support a marketing application.',
    },
    applies: i => i.targetAgencies.includes('NMPA'),
    evaluate: i => {
      return hasLocalSubjects(i, 'NMPA')
        ? { status: 'met', message: 'Chinese subjects are represented in the program.', recommendation: '' }
        : { status: 'unmet', message: 'No Chinese subject representation.', recommendation: 'Include Chinese subjects via an MRCT arm or a bridging study, per NMPA overseas-data guidance.' };
    },
  },
  {
    id: 'NMPA-ETHNIC',
    agency: 'NMPA',
    title: 'Ethnic-sensitivity assessment for China',
    topic: 'ethnic-sensitivity',
    defaultSeverity: 'warning',
    guidance: {
      source: 'ICH E5(R1) / NMPA',
      reference: 'ICH E5(R1); NMPA overseas-data guidance',
      note: 'Assess intrinsic/extrinsic ethnic factors that could affect efficacy or safety in the Chinese population.',
    },
    applies: i => i.targetAgencies.includes('NMPA'),
    evaluate: i => i.ethnicSensitivityAssessed
      ? { status: 'met', message: 'Ethnic-sensitivity assessment is recorded.', recommendation: '' }
      : { status: 'attention', message: 'No ethnic-sensitivity assessment recorded for the Chinese population.', recommendation: 'Document an ICH E5 ethnic-factor assessment.' },
  },
  {
    id: 'REGIONAL-QT',
    agency: 'PMDA',
    title: 'Thorough QT data in the regional population',
    topic: 'qt',
    defaultSeverity: 'info',
    guidance: {
      source: 'ICH E14',
      reference: 'ICH E14 Clinical Evaluation of QT/QTc Prolongation',
      note: 'PMDA and NMPA may expect QT data in the regional population where exposure or metabolism differs.',
    },
    applies: i => (i.targetAgencies.includes('PMDA') || i.targetAgencies.includes('NMPA')) && !!i.thoroughQt,
    evaluate: i => i.qtInRegionalPopulation
      ? { status: 'met', message: 'QT data are collected in the regional population.', recommendation: '' }
      : { status: 'attention', message: 'Thorough QT evaluation does not include the regional population.', recommendation: 'Consider QT/QTc data in the regional (e.g. Japanese/Chinese) population per ICH E14.' },
  },
  {
    id: 'MHRA-POST-BREXIT',
    agency: 'MHRA',
    title: 'UK is a separate jurisdiction post-Brexit',
    topic: 'jurisdiction',
    defaultSeverity: 'info',
    guidance: {
      source: 'MHRA',
      reference: 'MHRA combined review (CTA); UK separation from the EU centralized procedure (from 1 Jan 2021)',
      note: 'A separate UK clinical-trial authorization is required; the Access Consortium and Project Orbis can provide reliance routes.',
    },
    applies: i => i.targetAgencies.includes('MHRA'),
    evaluate: i => i.usesReliancePathway
      ? { status: 'met', message: 'A UK route is planned and a reliance pathway is in use.', recommendation: '' }
      : { status: 'attention', message: 'UK requires a separate authorization from the EU procedure.', recommendation: 'Plan a UK-specific submission; consider the Access Consortium or Project Orbis for reliance.' },
  },
  {
    id: 'SWISSMEDIC-SEPARATE',
    agency: 'Swissmedic',
    title: 'Switzerland is outside the EU/EEA',
    topic: 'jurisdiction',
    defaultSeverity: 'info',
    guidance: {
      source: 'Swissmedic',
      reference: 'Swissmedic authorization; Access Consortium membership',
      note: 'A separate Swiss submission is required; reliance via the Access Consortium or Project Orbis is available.',
    },
    applies: i => i.targetAgencies.includes('Swissmedic'),
    evaluate: i => i.usesReliancePathway
      ? { status: 'met', message: 'A Swiss route is planned and a reliance pathway is in use.', recommendation: '' }
      : { status: 'attention', message: 'Switzerland requires a separate submission from the EU.', recommendation: 'Plan a Swissmedic submission; consider the Access Consortium or Project Orbis.' },
  },
  {
    id: 'ANVISA-LOCAL',
    agency: 'ANVISA',
    title: 'Brazilian local submission and representation',
    topic: 'local-representation',
    defaultSeverity: 'warning',
    guidance: {
      source: 'ANVISA',
      reference: 'ANVISA RDC 9/2015 (clinical trials); local representation requirements',
      note: 'A local legal representative and Portuguese documentation are required for the Brazilian submission.',
    },
    applies: i => i.targetAgencies.includes('ANVISA'),
    evaluate: i => i.localSponsorRepresentative?.ANVISA
      ? { status: 'met', message: 'A Brazilian local representative is arranged.', recommendation: '' }
      : { status: 'unmet', message: 'No Brazilian local representative recorded.', recommendation: 'Arrange a local legal representative and Portuguese documentation per ANVISA RDC 9/2015.' },
  },
  {
    id: 'ORBIS-ELIGIBILITY',
    agency: 'ALL',
    title: 'Project Orbis concurrent oncology review',
    topic: 'reliance',
    defaultSeverity: 'info',
    guidance: {
      source: 'FDA Oncology Center of Excellence',
      reference: 'Project Orbis framework',
      note: 'For oncology products filed with two or more Orbis partners, concurrent submission can shorten review timelines.',
    },
    applies: i => !!i.oncology
      && i.targetAgencies.filter(a => PROJECT_ORBIS_AGENCIES.includes(a)).length >= 2,
    evaluate: i => i.usesReliancePathway
      ? { status: 'met', message: 'A reliance pathway (e.g. Project Orbis) is in use across partner agencies.', recommendation: '' }
      : { status: 'attention', message: 'Two or more Project Orbis partner agencies are targeted for an oncology product.', recommendation: 'Consider Project Orbis for concurrent review across the partner agencies.' },
  },
  {
    id: 'FDA-DIVERSITY',
    agency: 'FDA',
    title: 'FDA diversity action plan for pivotal trials',
    topic: 'diversity',
    defaultSeverity: 'warning',
    guidance: {
      source: 'FDA',
      reference: 'FDA Diversity Action Plan guidance (2024); FDORA section 3601',
      note: 'Pivotal trials should pre-specify enrollment goals for clinically relevant demographic subgroups.',
    },
    applies: i => i.targetAgencies.includes('FDA') && i.phase === '3',
    evaluate: i => i.diversityPlan
      ? { status: 'met', message: 'A diversity action plan with enrollment goals is in place.', recommendation: '' }
      : { status: 'unmet', message: 'No diversity action plan recorded for a phase 3 trial.', recommendation: 'Pre-specify enrollment goals for clinically relevant populations per the FDA diversity action plan guidance.' },
  },
  {
    id: 'ICH-E17-CONSISTENCY',
    agency: 'ALL',
    title: 'Multi-regional consistency assessment',
    topic: 'mrct',
    defaultSeverity: 'warning',
    guidance: {
      source: 'ICH E17',
      reference: 'ICH E17 General Principles for the Planning and Design of MRCTs (2017)',
      note: 'Pre-specify the structural sample-size allocation across regions and the method for assessing consistency of treatment effects.',
    },
    applies: i => !!i.multiRegional && i.targetAgencies.length >= 2,
    evaluate: i => i.regionalConsistencyPlan
      ? { status: 'met', message: 'A regional consistency assessment is pre-specified.', recommendation: '' }
      : { status: 'unmet', message: 'MRCT across multiple agencies without a pre-specified consistency assessment.', recommendation: 'Pre-specify regional allocation and a consistency-of-effect assessment per ICH E17.' },
  },
];

const statusSeverity = (rule: RegionRule, status: RuleStatus): Severity => {
  if (status === 'unmet') return rule.defaultSeverity;
  if (status === 'attention') return rule.defaultSeverity === 'error' ? 'warning' : 'info';
  return 'info';
};

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Evaluate a design against every applicable region rule for the targeted
 * agencies. Deterministic.
 */
export function evaluateRegionRules(input: RegionDesignInput): RegionEvaluationResult {
  if (!Array.isArray(input.targetAgencies) || input.targetAgencies.length === 0) {
    throw new Error('targetAgencies must list at least one agency');
  }

  const findings: RegionFinding[] = [];
  for (const rule of RULES) {
    if (!rule.applies(input)) continue;
    const { status, message, recommendation } = rule.evaluate(input);
    findings.push({
      ruleId: rule.id,
      agency: rule.agency,
      title: rule.title,
      topic: rule.topic,
      status,
      severity: statusSeverity(rule, status),
      message,
      recommendation,
      guidance: rule.guidance,
    });
  }

  const issues = findings
    .filter(f => f.status === 'unmet' || f.status === 'attention')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const recommendations = Array.from(
    new Set(issues.map(f => f.recommendation).filter(r => r.length > 0)),
  );
  const errorCount = findings.filter(f => f.severity === 'error' && f.status !== 'met').length;
  const warningCount = findings.filter(f => f.severity === 'warning' && f.status !== 'met').length;

  return {
    findings,
    issues,
    recommendations,
    allClear: errorCount === 0 && warningCount === 0,
    errorCount,
    warningCount,
    provenance: buildProvenance({
      method: 'regionDesignRules:evaluate',
      seed: 0,
      inputs: input as unknown as Record<string, unknown>,
      note: 'Deterministic region-rule evaluation; reproduces for the same design and agencies.',
    }),
  };
}

/** Retrieve the rule catalog (optionally filtered to one agency) with guidance citations. */
export function listRegionRules(agency?: Agency): RegionRuleCatalogEntry[] {
  return RULES.filter(r => !agency || r.agency === agency || r.agency === 'ALL').map(r => ({
    id: r.id,
    agency: r.agency,
    title: r.title,
    topic: r.topic,
    defaultSeverity: r.defaultSeverity,
    guidance: r.guidance,
  }));
}

/** Retrieve the guidance citations relevant to an agency. */
export function getRegionGuidance(agency: Agency): GuidanceRef[] {
  return listRegionRules(agency).map(r => r.guidance);
}
