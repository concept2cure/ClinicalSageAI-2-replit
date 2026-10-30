/**
 * Therapeutic-area profile registry + prompt renderer (Feature 2.7).
 *
 * Adding a new profile is module-only:
 *   1. Create a new file in this directory exporting a TherapeuticAreaProfile.
 *   2. Add it to PROFILES below.
 *   3. (Optional) extend the TherapeuticAreaId union in types.ts.
 * No migration is needed — projects.therapeutic_area is a free-form
 * string slug that resolves to a profile here at runtime.
 *
 * The renderer turns a profile into a system-prompt context block that
 * can be folded into AnA's prompt assembly. Designed to fit alongside
 * the existing buildMergedContext layers (Global / Local / User /
 * Capabilities / Wisdom / ScopedRules).
 *
 * @module server/services/ana/therapeutic-area-profiles
 */

import { oncologyProfile } from './oncology.js';
import { rareDiseaseProfile } from './rare-disease.js';
import { neurologyProfile } from './neurology.js';
import { immunologyProfile } from './immunology.js';
import { allergyProfile } from './allergy.js';
import { cardiologyProfile } from './cardiology.js';
import { dentalProfile } from './dental.js';
import { dermatologyProfile } from './dermatology.js';
import { endocrinologyProfile } from './endocrinology.js';
import { gastroenterologyProfile } from './gastroenterology.js';
import { geneCellTherapyProfile } from './gene-cell-therapy.js';
import { hematologyProfile } from './hematology.js';
import { infectiousDiseaseProfile } from './infectious-disease.js';
import { metabolicProfile } from './metabolic.js';
import { musculoskeletalProfile } from './musculoskeletal.js';
import { nephrologyProfile } from './nephrology.js';
import { obstetricsGynecologyProfile } from './obstetrics-gynecology.js';
import { ophthalmologyProfile } from './ophthalmology.js';
import { otherProfile } from './other.js';
import { painProfile } from './pain.js';
import { psychiatryProfile } from './psychiatry.js';
import { respiratoryProfile } from './respiratory.js';
import { transplantProfile } from './transplant.js';
import { urologyProfile } from './urology.js';
import { vaccinesProfile } from './vaccines.js';
import { normalizeModality } from '../../../../shared/regulatory/modality.js';
import { normalizeClinicalPhase } from '../../../../shared/constants/domain/aliases.js';
import { CLINICAL_PHASES } from '../../../../shared/constants/domain/clinical-phases.js';
import { checkGuidanceFreshness, type FreshnessResultItem } from '../../regulatory-currency/guidance-ingestion-service.js';
import { REGULATORY_FACTS, isVerificationStale, verificationAgeDays } from '../../regulatory-currency/currency-registry.js';
import type {
  TherapeuticAreaId,
  TherapeuticAreaProfile,
  ContextRule,
  GuidanceRef,
  PathwayHint,
  ProfileDocumentKind,
  ProfileProductContext,
} from './types.js';

export type {
  TherapeuticAreaId,
  TherapeuticAreaProfile,
  ContextRule,
  GuidanceRef,
  PathwayHint,
  ProfileDocumentKind,
  ProfileProductContext,
};

/**
 * Canonical registry. Slug → profile.
 */
const PROFILES: ReadonlyMap<string, TherapeuticAreaProfile> = new Map<
  string,
  TherapeuticAreaProfile
>([
  ['oncology', oncologyProfile],
  ['oncology-hematology', oncologyProfile],
  ['rare-disease', rareDiseaseProfile],
  ['rare', rareDiseaseProfile],
  ['orphan', rareDiseaseProfile],
  ['neurology', neurologyProfile],
  ['cns', neurologyProfile],
  ['neurodegenerative', neurologyProfile],
  ['immunology', immunologyProfile],
  ['autoimmune', immunologyProfile],
  ['allergy', allergyProfile],
  ['allergology', allergyProfile],
  ['immunotherapy', allergyProfile],
  ['cardiology', cardiologyProfile],
  ['cardiovascular', cardiologyProfile],
  ['cardio', cardiologyProfile],
  ['dental', dentalProfile],
  ['oral-health', dentalProfile],
  ['dentistry', dentalProfile],
  ['dermatology', dermatologyProfile],
  ['derm', dermatologyProfile],
  ['skin', dermatologyProfile],
  ['endocrinology', endocrinologyProfile],
  ['endocrine', endocrinologyProfile],
  ['gastroenterology', gastroenterologyProfile],
  ['gi', gastroenterologyProfile],
  ['hepatology', gastroenterologyProfile],
  ['gene-cell-therapy', geneCellTherapyProfile],
  ['gene-therapy', geneCellTherapyProfile],
  ['cell-therapy', geneCellTherapyProfile],
  ['cgt', geneCellTherapyProfile],
  ['atmp', geneCellTherapyProfile],
  ['hematology', hematologyProfile],
  ['heme', hematologyProfile],
  ['haematology', hematologyProfile],
  ['infectious-disease', infectiousDiseaseProfile],
  ['infection', infectiousDiseaseProfile],
  ['id', infectiousDiseaseProfile],
  ['antiviral', infectiousDiseaseProfile],
  ['antibacterial', infectiousDiseaseProfile],
  ['metabolic', metabolicProfile],
  ['metabolism', metabolicProfile],
  ['diabetes', metabolicProfile],
  ['obesity', metabolicProfile],
  ['musculoskeletal', musculoskeletalProfile],
  ['rheumatology', musculoskeletalProfile],
  ['msk', musculoskeletalProfile],
  ['nephrology', nephrologyProfile],
  ['renal', nephrologyProfile],
  ['kidney', nephrologyProfile],
  ['obstetrics-gynecology', obstetricsGynecologyProfile],
  ['obgyn', obstetricsGynecologyProfile],
  ['ob-gyn', obstetricsGynecologyProfile],
  ['womens-health', obstetricsGynecologyProfile],
  ['ophthalmology', ophthalmologyProfile],
  ['ophthalmic', ophthalmologyProfile],
  ['eye', ophthalmologyProfile],
  ['retina', ophthalmologyProfile],
  ['other', otherProfile],
  ['general', otherProfile],
  ['cross-cutting', otherProfile],
  ['default', otherProfile],
  ['pain', painProfile],
  ['analgesia', painProfile],
  ['analgesic', painProfile],
  ['psychiatry', psychiatryProfile],
  ['psychiatric', psychiatryProfile],
  ['mental-health', psychiatryProfile],
  ['respiratory', respiratoryProfile],
  ['pulmonary', respiratoryProfile],
  ['pulmonology', respiratoryProfile],
  ['transplant', transplantProfile],
  ['transplantation', transplantProfile],
  ['urology', urologyProfile],
  ['urologic', urologyProfile],
  ['vaccines', vaccinesProfile],
  ['vaccine', vaccinesProfile],
  ['immunization', vaccinesProfile],
]);

/**
 * Resolve a free-form slug to a profile. Case-insensitive, trims spaces,
 * normalizes hyphens. Returns null when the slug isn't registered.
 */
export function getProfile(
  slug: string | null | undefined
): TherapeuticAreaProfile | null {
  if (!slug) return null;
  const normalized = String(slug)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return PROFILES.get(normalized) ?? null;
}

/**
 * List every distinct profile (deduplicated by id, since multiple slugs
 * can alias to the same profile).
 */
export function listProfiles(): TherapeuticAreaProfile[] {
  const seen = new Set<TherapeuticAreaId>();
  const out: TherapeuticAreaProfile[] = [];
  for (const profile of PROFILES.values()) {
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Return every accepted slug (canonical + aliases). Useful for input
 * validation in routes that set the area on a project.
 */
export function listAcceptedSlugs(): string[] {
  return Array.from(PROFILES.keys()).sort();
}

// ─── Prompt renderer ─────────────────────────────────────────────────

export interface RenderProfileOptions {
  /**
   * Optional CTD section the user is currently authoring. Used to
   * filter section/module-scoped rules to the relevant ones first
   * (others still appear, just lower in the context block).
   */
  activeCtdSection?: string | null;
  /**
   * Optional submission pathway (accelerated_approval, breakthrough_therapy,
   * orphan_drug, ...). When supplied, the matching pathwayHint is bubbled
   * to the top of the context block.
   */
  activePathway?: PathwayHint['pathway'];
  /**
   * Optional limit on bullets per section to keep prompt budget bounded.
   * Default 8.
   */
  maxBulletsPerSection?: number;
  /** Keep nested section drafts to matching/always rules; no section means always only. */
  onlyApplicableRules?: boolean;
  /** Disambiguates an E3 heading from a CTD heading; never inferred from therapeutic area. */
  documentKind?: ProfileDocumentKind;
  /** Advisory product facts; recorded labels do not establish qualified evidence. */
  productContext?: ProfileProductContext;
  /** Writing jurisdiction, when known, for the existing dated-registry lookup. */
  jurisdiction?: string;
  /** ISO date for the existing currency check; not a historical qualification receipt. */
  asOf?: string;
}

/**
 * Render a profile as a markdown-ish context block suitable for
 * inclusion in a system prompt. Compact, no decoration, deterministic
 * order. The submission-chat handler + section-generation flows can
 * inject this verbatim.
 */
export function renderProfileForPrompt(
  profile: TherapeuticAreaProfile,
  options: RenderProfileOptions = {}
): string {
  const requestedMax = options.maxBulletsPerSection ?? 8;
  const max = Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 8;
  const activeSection = options.activeCtdSection?.trim() || null;
  const product = productFacts(options.productContext);

  const lines: string[] = [];
  lines.push(
    `## Therapeutic Area Context — ${profile.displayName}`,
    `> ${profile.description}`,
    ''
  );
  lines.push('Section selection is advisory; clinical applicability remains undetermined unless explicit indexed conditions resolve it. Neither a label nor a structural match establishes qualified evidence.');
  if (options.productContext) {
    lines.push(`Product context (${options.productContext.source === 'recorded' ? 'recorded' : 'declared'} advisory, not evidence): ${JSON.stringify(product)}.`);
  } else {
    lines.push('Phase, modality and population: undetermined.');
  }
  lines.push('');

  lines.push(...pathwayBlock(profile, options.activePathway));

  // Context rules — relevant ones first, then the rest.
  const scopedRules = options.onlyApplicableRules
    ? profile.contextRules.filter(rule => contextRuleMatchesSection(rule, activeSection))
    : profile.contextRules;
  const assessed = sortContextRules(scopedRules, activeSection)
    .map(rule => ({ rule, applicability: ruleApplicability(rule, product) }));
  const rules = assessed.filter(item => item.applicability !== 'not-applicable').map(item => item.rule);
  const selectedRules = rules.slice(0, max);
  const excluded = assessed.filter(item => item.applicability === 'not-applicable').map(item => item.rule.id);
  if (excluded.length) lines.push(`Advisory rules not applicable to supplied indexed conditions: ${excluded.join(', ')}. This is not a legal waiver.`, '');
  lines.push(...bulletBlock('Context Rules', selectedRules.map(rule =>
    `[${rule.severity}] [applicability ${ruleApplicability(rule, product)}] ${rule.instruction}${rule.guidanceRef ? ` (${rule.guidanceRef})` : ''}`), max));
  lines.push(...bulletBlock('Risk Factors', profile.riskFactors, max));
  lines.push(...bulletBlock('Reviewer Expectations', profile.reviewerExpectations, max));

  // Statistical considerations — only inject when authoring stat-relevant sections.
  const wantStat = clinicalConsiderationsApply(activeSection, options);
  if (wantStat) {
    lines.push(...bulletBlock('Statistical Considerations', profile.statisticalConsiderations, max));
    lines.push(...bulletBlock('Endpoint Considerations', profile.endpointConsiderations, max));
  }

  // Common gaps — terse; full registry is loaded via gap-classifier.
  const commonGaps = options.onlyApplicableRules
    ? profile.commonGaps.filter(gap => activeSection && (activeSection === gap.ctdSection ||
      (gap.prefix && activeSection.startsWith(`${gap.ctdSection}.`))))
    : profile.commonGaps;
  const selectedGaps = commonGaps.slice(0, max);

  // A source cited by this section's selected rules/gaps outranks general
  // background. The existing order remains the deterministic fallback.
  const cited = [...selectedRules.map(rule => rule.guidanceRef), ...selectedGaps.map(gap => gap.guidanceRef)]
    .filter((ref): ref is string => !!ref);
  lines.push(...guidanceBlock(profile.guidanceRefs, cited, options, max));
  lines.push(...bulletBlock('Common Gaps in This Therapeutic Area', selectedGaps.map(g =>
    `[${g.severity}] §${g.ctdSection}: ${g.description}`), max));
  return lines.join('\n').trimEnd() + '\n';
}

function bulletBlock(title: string, bullets: readonly string[], max: number): string[] {
  const selected = bullets.slice(0, max);
  return selected.length ? [`### ${title}`, ...selected.map(text => `- ${text}`), ''] : [];
}

function pathwayBlock(profile: TherapeuticAreaProfile, pathway: RenderProfileOptions['activePathway']): string[] {
  const hint = pathway ? profile.pathwayHints.find(item => item.pathway === pathway) : undefined;
  return hint ? [`### Active Pathway: ${hint.pathway}`, `- Applicability: ${hint.applicability}`,
    `- Impacted sections: ${hint.impactedSections.join(', ')}`, `- Reviewer notes: ${hint.reviewerNotes}`, ''] : [];
}

function guidanceBlock(refs: GuidanceRef[], cited: string[], options: RenderProfileOptions, max: number): string[] {
  const references = refs.map((reference, index) => ({ reference, index,
    relevant: cited.some(citation => referenceCited(reference, citation)) }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.index - b.index)
    .slice(0, max);
  if (!references.length) return [];
  return ['### Key Guidance References',
    'Dated-registry checks do not establish applicability or scientific source qualification; unresolved references need primary-source review.',
    ...references.flatMap(({ reference: g }) => [`- [${g.authority}] ${g.code} — ${g.title}`,
      `    Why: ${g.why}`, `    ${referenceCurrency(g, options)}`]), ''];
}

/** Clinical arrays belong to scientific clinical documents, not a disease-specific CMC or tox section. */
function clinicalConsiderationsApply(section: string | null, options: RenderProfileOptions): boolean {
  if (section && /^(?:2\.(?:4|6)|[34])(?:\.|$)/.test(section)) return false;
  if (section && /^(?:2\.5|2\.7\.[34]|5\.3\.[45])(?:\.|$)/.test(section)) return true;
  if (options.documentKind === 'protocol') return true;
  if (options.documentKind === 'csr') return !section || /^(?:2|9|10|11|12|13)(?:\.|$)/.test(section);
  if (!section) return !options.onlyApplicableRules;
  // Retain the original bare E3 9/11 contract only when the caller supplied no document kind.
  return !options.documentKind && /^(?:9|11)(?:\.|$)/.test(section);
}

function factLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const label = value.trim().slice(0, 200);
  return !label || /^(?:unknown|unassessed|undetermined|unspecified|not recorded|not provided|n\/a)$/i.test(label) ? null : label;
}

function productFacts(context: ProfileProductContext | undefined) {
  return { phase: factLabel(context?.phase), modality: normalizeModality(factLabel(context?.modality)),
    population: factLabel(context?.population) };
}

/** Only canonical known phase/modality mismatches can exclude; free-text populations remain uncertain. */
function ruleApplicability(rule: ContextRule, facts: ReturnType<typeof productFacts>): 'conditional' | 'not-applicable' | 'undetermined' {
  const conditions = rule.applicability;
  if (!conditions) return 'undetermined';
  const states = [
    indexedMatch(conditions.phases, facts.phase, canonicalPhase),
    indexedMatch(conditions.modalities, facts.modality, normalizeModality),
    // The record has free-text populations, not a canonical population ontology.
    // An unmatched spelling is uncertainty, never evidence of incompatibility.
    conditions.populations?.length ? (facts.population && conditions.populations.some(value =>
      value.toLowerCase().trim() === facts.population!.toLowerCase().trim()) ? 'match' : 'unknown') : 'unindexed',
  ];
  if (states.includes('mismatch')) return 'not-applicable';
  return states.includes('match') && !states.includes('unknown') ? 'conditional' : 'undetermined';
}

function canonicalPhase(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const canonical = CLINICAL_PHASES.find(phase => phase.value === key)?.value ?? normalizeClinicalPhase(key);
  return typeof canonical === 'string' && CLINICAL_PHASES.some(phase => phase.value === canonical) ? canonical : null;
}

function indexedMatch(allowed: readonly string[] | undefined, actual: string | null,
  normalize: (value: string | null | undefined) => string | null): 'match' | 'mismatch' | 'unknown' | 'unindexed' {
  if (!allowed?.length) return 'unindexed';
  const value = normalize(actual);
  const choices = allowed.map(normalize);
  if (!value || choices.includes(null)) return 'unknown';
  return choices.includes(value) ? 'match' : 'mismatch';
}

function referenceCited(reference: GuidanceRef, citation: string): boolean {
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cited = ` ${normalize(citation)} `;
  return [reference.code, reference.title].some(value => {
    const label = normalize(value);
    return label.length >= 5 && cited.includes(` ${label} `);
  });
}

/** Currency comes only from existing dated registries; a matched title is never source qualification. */
function referenceCurrency(reference: GuidanceRef, options: RenderProfileOptions): string {
  const authorityJurisdiction: Partial<Record<GuidanceRef['authority'], string>> = {
    FDA: 'US', EMA: 'EU', PMDA: 'JP', HC: 'CA', ICH: 'ICH', NMPA: 'CN',
  };
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const jurisdiction = options.jurisdiction ?? authorityJurisdiction[reference.authority];
  // The identifier can name a specific annex while the display title names
  // the whole guideline. Resolve that identifier first, so the generic title
  // cannot silently select the base guideline's different effective date.
  let result = checkGuidanceFreshness({ asOf, citedGuidances: [{ title: reference.code, jurisdiction }] }).results[0];
  if (result.verification === 'unverified') {
    result = checkGuidanceFreshness({ asOf, citedGuidances: [{ title: `${reference.code} ${reference.title}`, jurisdiction }] }).results[0];
  }
  if (result.verification === 'unverified') return `currency unresolved: unverified. ${result.warning}`;
  const parts = [`Registry currency as of ${asOf}: identified; current=${String(result.current)} (does not establish applicability).`];
  if (result.latestKnownDate) parts.push(`Latest known registry date: ${result.latestKnownDate}.`);
  parts.push(...currencyBasis(result.basis, asOf));
  if (result.warning) parts.push(result.warning);
  return parts.join(' ');
}

function currencyBasis(basis: FreshnessResultItem['basis'], asOf: string): string[] {
  if (!basis) return ['source verification unresolved: no registry basis.'];
  const parts = [`Basis: ${basis.registry}/${basis.id}.`];
  if (basis.sourceUrl) parts.push(`Source: ${basis.sourceUrl}.`);
  if (basis.lastVerified) parts.push(`Last verified: ${basis.lastVerified}.`);
  const fact = basis.registry === 'currency_registry' ? REGULATORY_FACTS.find(entry => entry.id === basis.id) : undefined;
  const age = fact ? verificationAgeDays(fact, asOf) : null;
  if (!fact || age === null || age < 0 || isVerificationStale(fact, asOf)) {
    parts.push('source verification unresolved: missing, future-dated or outside the registry verification interval.');
  }
  return parts;
}

/** Applicability is structural scope only; a matching rule is still advisory. */
function contextRuleMatchesSection(rule: ContextRule, section: string | null): boolean {
  if (rule.scope === 'always') return true;
  if (!section || !rule.appliesTo) return false;
  if (rule.scope === 'section') return section === rule.appliesTo || section.startsWith(`${rule.appliesTo}.`);
  return section.split('.')[0] === rule.appliesTo.replace(/[^\d]/g, '');
}

/**
 * Pure: sort context rules so the ones matching the active CTD section
 * (or its module prefix) bubble to the top, then 'always' rules, then
 * the rest. Within each tier, sort critical → info.
 */
export function sortContextRules(
  rules: ContextRule[],
  activeCtdSection: string | null
): ContextRule[] {
  const SEV: Record<string, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };

  function tier(rule: ContextRule): number {
    if (!activeCtdSection) {
      return rule.scope === 'always' ? 0 : 1;
    }
    if (rule.scope === 'section' && rule.appliesTo) {
      if (
        activeCtdSection === rule.appliesTo ||
        activeCtdSection.startsWith(rule.appliesTo + '.')
      ) {
        return 0;
      }
    }
    if (rule.scope === 'module' && rule.appliesTo) {
      const moduleNum = rule.appliesTo.replace(/[^\d]/g, '');
      if (activeCtdSection.startsWith(moduleNum)) return 0;
    }
    if (rule.scope === 'always') return 1;
    return 2;
  }

  return [...rules].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    return SEV[a.severity] - SEV[b.severity];
  });
}

/**
 * Pure: compose extra retrieval keywords from a profile so the citation
 * engine can boost in-area passages. Caller folds these into the
 * embedding-search query.
 */
export function profileRetrievalBoost(
  profile: TherapeuticAreaProfile
): string {
  return profile.retrievalKeywords.slice(0, 12).join(' ');
}
