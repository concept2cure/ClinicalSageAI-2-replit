/**
 * Contextual protocol rule packs — MDX-STUDY-02.
 *
 * One evaluation engine over a protocol draft, with the rules that apply selected
 * from the study archetype. Changing the archetype changes the outline and the
 * guidance; it does not change modules and it does not change navigation.
 *
 * This produces the content the AnA rail beside the document needs: what is
 * missing, what a reviewer will challenge, where the statistics are shaky, and
 * where the draft contradicts itself.
 *
 * ── The one rule this engine holds to itself ─────────────────────────────────
 *
 * Every finding is derived from the draft, never asserted about it. A finding
 * says "section X is empty" or "the text uses sensitivity/specificity while the
 * comparator is not a reference standard" — things checkable from what the author
 * wrote. It never says "your sample size is too small" or "this endpoint is
 * inappropriate", because the engine cannot know the clinical context that would
 * justify either, and a confident wrong criticism costs more than a missing one:
 * it teaches the author to dismiss the rail.
 *
 * Where a rule can only raise a question, it raises a question. `consideration`
 * findings are phrased as prompts, not verdicts.
 *
 * ── The limit, stated ────────────────────────────────────────────────────────
 *
 * The content-derived rules are KEYWORD HEURISTICS over authored text. They check
 * that something was said, not that it was thought about. Two consequences worth
 * knowing before trusting a clean rail:
 *
 *   - An author who copies the archetype's suggested statistical methods verbatim
 *     clears the rules that look for those words. For software_clinical_validation
 *     the suggestions name "independent", "subgroup" and "locked", so adopting
 *     them clears all three of its rules without a word of the author's own. That
 *     is not a loophole to close by making the matching stricter — "non-parametric
 *     per EP17" IS a stated method — but it does mean a clean rail is evidence
 *     the protocol is addressed, not evidence it is right.
 *   - An incidental mention counts. A protocol that says "lot" in passing
 *     satisfies the lot-design rule.
 *
 * Both are recorded in the tests. The alternative — natural-language
 * understanding of a regulatory protocol — is a different system, and pretending
 * these rules are that system is how a reviewer ends up trusting a green check
 * over reading the document.
 *
 * Pure — no DB, no server imports. The Study Design Center persists the draft;
 * this only reads it.
 *
 * @module shared/regulatory/mdx-protocol-rules
 */

import {
  getArchetype, type StudyArchetype, type EvidenceClass,
} from './mdx-study-archetypes';

/** How much a finding should block progress. */
export type FindingSeverity =
  /** The protocol cannot be filed with this outstanding. */
  | 'blocker'
  /** A reviewer will very likely challenge this. */
  | 'weakness'
  /** Worth a decision, but the answer may legitimately be "not applicable". */
  | 'consideration';

export type FindingKind =
  | 'missing_section'
  | 'unanswered_design_question'
  | 'missing_acceptance_criterion'
  | 'missing_statistical_method'
  | 'statistical_concern'
  | 'reviewer_challenge'
  | 'evidence_gap'
  | 'contradiction'
  | 'guidance_depth';

export interface ProtocolFinding {
  /** Stable rule id, so a finding can be dismissed and stay dismissed. */
  rule: string;
  kind: FindingKind;
  severity: FindingSeverity;
  title: string;
  /** Why it matters, in terms of what a reviewer does with it. */
  detail: string;
  /** The protocol section this attaches to, when it attaches to one. */
  section?: string;
}

export interface ProtocolDraft {
  archetypeId: string;
  /** Section title → authored content. A section absent or blank is unwritten. */
  sections: Record<string, string>;
  /** Design question → the author's answer. */
  answers: Record<string, string>;
  acceptanceCriteria: string[];
  statisticalMethods: string[];
  /** Null when not yet determined — distinct from zero. */
  sampleSize: number | null;
  markets: string[];
  filingTypes: string[];
  /** Supporting plans the author says exist. */
  supportingPlans: string[];
}

export interface ProtocolEvaluation {
  archetype: StudyArchetype | null;
  /** The outline for this archetype, in authoring order. */
  outline: { section: string; written: boolean }[];
  findings: ProtocolFinding[];
  /** Sections written / sections required. Null when the archetype is unknown. */
  completeness: { written: number; required: number } | null;
  /** Filing sections this study feeds, for the rail's "supports" line. */
  supportsFilings: string[];
}

/** An empty draft for an archetype, so a caller can start from the right shape. */
export function emptyDraft(archetypeId: string): ProtocolDraft {
  return {
    archetypeId, sections: {}, answers: {}, acceptanceCriteria: [],
    statisticalMethods: [], sampleSize: null, markets: [], filingTypes: [],
    supportingPlans: [],
  };
}

const written = (v: string | undefined): boolean => typeof v === 'string' && v.trim().length > 0;

/** All authored text, lowercased, for the text-derived rules. */
function draftText(draft: ProtocolDraft): string {
  return [
    ...Object.values(draft.sections),
    ...Object.values(draft.answers),
    ...draft.acceptanceCriteria,
    ...draft.statisticalMethods,
  ].join('\n').toLowerCase();
}

// ── Rule packs ───────────────────────────────────────────────────────────────
//
// A pack is a function over (archetype, draft, text) returning findings. Packs
// are selected by evidence class and by archetype id, so an archetype picks up
// the general rules for its class plus anything specific to it.

type Rule = (a: StudyArchetype, d: ProtocolDraft, text: string) => ProtocolFinding[];

/** Applies to every archetype: is the thing actually written. */
const completenessRules: Rule = (a, d) => {
  const out: ProtocolFinding[] = [];

  for (const section of a.protocolSections) {
    if (!written(d.sections[section])) {
      out.push({
        rule: 'core.section_missing',
        kind: 'missing_section',
        severity: 'blocker',
        section,
        title: `"${section}" is not written`,
        detail:
          `This archetype requires it, and a reviewer reads the protocol against the `
          + `structure they expect. An absent section reads as an omission rather than `
          + `as "not applicable" — if it genuinely does not apply, say so in it.`,
      });
    }
  }

  for (const q of a.designQuestions) {
    if (!written(d.answers[q])) {
      out.push({
        rule: 'core.design_question_unanswered',
        kind: 'unanswered_design_question',
        severity: 'weakness',
        title: 'Unanswered design question',
        detail: q,
      });
    }
  }

  if (d.acceptanceCriteria.length === 0) {
    out.push({
      rule: 'core.no_acceptance_criteria',
      kind: 'missing_acceptance_criterion',
      severity: 'blocker',
      section: 'Acceptance criteria',
      title: 'No acceptance criterion is stated',
      detail:
        'A study without a pre-specified acceptance criterion cannot pass or fail — the '
        + 'result becomes whatever it turns out to be, which is the definition of a '
        + 'post-hoc claim. State it before conduct, with the justification.',
    });
  }

  if (d.statisticalMethods.length === 0) {
    out.push({
      rule: 'core.no_statistical_method',
      kind: 'missing_statistical_method',
      severity: 'blocker',
      section: 'Statistical analysis',
      title: 'No statistical method is stated',
      detail: a.statisticalMethods.length > 0
        ? `This archetype normally uses: ${a.statisticalMethods.join('; ')}.`
        : 'State how the endpoint will be estimated and how uncertainty will be reported.',
    });
  }

  for (const plan of a.requiredSupportingPlans) {
    if (!d.supportingPlans.some(p => p.toLowerCase().includes(plan.toLowerCase().split(' ')[0]))) {
      out.push({
        rule: 'core.supporting_plan_missing',
        kind: 'evidence_gap',
        severity: 'weakness',
        title: `Supporting plan not recorded: ${plan}`,
        detail:
          'This archetype expects it alongside the protocol. A filing that references a '
          + 'plan which does not exist is a finding at review, not at submission.',
      });
    }
  }

  // Say plainly when the guidance itself is a frame rather than a specification.
  if (a.detail === 'outline') {
    out.push({
      rule: 'core.outline_depth',
      kind: 'guidance_depth',
      severity: 'consideration',
      title: 'Guidance for this archetype is outline-level',
      detail:
        'The section list and questions here are a starting frame, not a reviewed '
        + 'specification for this study type. Treat the outline as a floor and expect to '
        + 'add what this specific study needs.',
    });
  }

  return out;
};

/** IVD analytical performance. */
const ivdAnalyticalRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];

  if (!/(medical decision point|clinical decision|cutoff|cut-off)/.test(text)) {
    out.push({
      rule: 'ivd.no_decision_point',
      kind: 'reviewer_challenge',
      severity: 'weakness',
      title: 'No medical decision point is referenced',
      detail:
        'Analytical performance is judged against where the result changes a clinical '
        + 'decision. A reviewer will ask why the tested concentrations were chosen; '
        + '"across the range" is not an answer if nothing sits near the decision point.',
    });
  }

  if (!/(lot|reagent lot)/.test(text)) {
    out.push({
      rule: 'ivd.no_lot_design',
      kind: 'evidence_gap',
      severity: 'weakness',
      section: 'Lot design',
      title: 'No reagent lot design is described',
      detail:
        'Lot-to-lot variability is a routine source of failure after launch, and a '
        + 'single-lot study cannot see it. State how many lots and why that is enough.',
    });
  }

  if (a.id === 'lob_lod_loq' && !/(parametric|non-parametric|nonparametric)/.test(text)) {
    out.push({
      rule: 'ivd.lod_method_unstated',
      kind: 'statistical_concern',
      severity: 'weakness',
      title: 'LoB/LoD estimation approach is not stated',
      detail:
        'CLSI EP17 offers a parametric and a non-parametric route, and they give different '
        + 'answers on the same data. State which, and why the distributional assumption '
        + 'holds if parametric.',
    });
  }

  if (a.id === 'interference' && !/(allowable|acceptable).{0,20}bias|bias.{0,20}(limit|criterion)/.test(text)) {
    out.push({
      rule: 'ivd.interference_no_bias_limit',
      kind: 'reviewer_challenge',
      severity: 'weakness',
      title: 'No clinically allowable bias is defined',
      detail:
        'Interference is only meaningful against a threshold. Without one, any observed '
        + 'bias can be argued either way after the fact.',
    });
  }

  return out;
};

/** IVD clinical performance. */
const ivdClinicalRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];

  // The most common diagnostic-statistics error, and it is checkable: an
  // agreement study whose text claims accuracy.
  if (a.id === 'ppa_npa_opa' && /(clinical sensitivity|clinical specificity)/.test(text)) {
    out.push({
      rule: 'ivd.agreement_claimed_as_accuracy',
      kind: 'contradiction',
      severity: 'blocker',
      title: 'Agreement study describes its results as sensitivity and specificity',
      detail:
        'This archetype compares against a comparator method, not a reference standard '
        + 'that establishes true disease status. What it can report is positive and '
        + 'negative percent agreement. Calling it sensitivity/specificity claims accuracy '
        + 'the design cannot support, and a reviewer will say so.',
    });
  }

  if (!/(discordan|adjudicat)/.test(text)) {
    out.push({
      rule: 'ivd.no_discordant_plan',
      kind: 'evidence_gap',
      severity: 'weakness',
      title: 'No discordant-result handling is described',
      detail:
        'Discordant results are where the interesting evidence is, and resolving them '
        + 'after seeing which way they fall is post-hoc. Pre-specify the adjudication.',
    });
  }

  if (a.id === 'roc_cutoff' && !/(independent|validation set|hold-?out|separate)/.test(text)) {
    out.push({
      rule: 'ivd.cutoff_not_independently_validated',
      kind: 'statistical_concern',
      severity: 'blocker',
      title: 'Cutoff may be derived and validated on the same specimens',
      detail:
        'Performance measured on the data the threshold was chosen from is optimistic by '
        + 'construction. Either validate on an independent set, or report the estimate as '
        + 'the training-set estimate it is.',
    });
  }

  if (/(banked|retrospective|archived)/.test(text) && !/(selection bias|spectrum|consecutive)/.test(text)) {
    out.push({
      rule: 'ivd.banked_without_bias_treatment',
      kind: 'reviewer_challenge',
      severity: 'weakness',
      title: 'Banked specimens used without addressing selection bias',
      detail:
        'Specimens that survived in a biobank are not a random sample of the intended use '
        + 'population. State how the selection was made and what spectrum it produces.',
    });
  }

  return out;
};

/** Human factors and CLIA waiver. */
const usabilityRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];

  if (a.id === 'lay_user' || a.id === 'untrained_operator') {
    if (/(train|demonstrat|coach|instruct the participant)/.test(text)
      && !/(no training|without training|not trained|training is a|prohibit)/.test(text)) {
      out.push({
        rule: 'usability.training_mentioned',
        kind: 'contradiction',
        severity: 'blocker',
        title: 'Training appears in a study whose subject is the labeling',
        detail:
          'The claim under test is that an untrained user succeeds from the labeling alone. '
          + 'Any training, demonstration or prompting invalidates that for the participant '
          + 'who received it. If the mention is a prohibition, say so explicitly.',
      });
    }
    if (!/(observ|non-interfer|noninterfer)/.test(text)) {
      out.push({
        rule: 'usability.no_observer_protocol',
        kind: 'evidence_gap',
        severity: 'weakness',
        title: 'No observer non-interference protocol',
        detail:
          'An observer who answers a question has trained the participant. State how '
          + 'non-interference is enforced and recorded.',
      });
    }
  }

  if (a.id === 'human_factors_validation') {
    if (!/(15|fifteen)/.test(text)) {
      out.push({
        rule: 'usability.participant_count',
        kind: 'reviewer_challenge',
        severity: 'consideration',
        title: 'Participant count per user group is not evident',
        detail:
          'FDA human-factors guidance expects at least 15 participants per distinct user '
          + 'group. If a group is smaller for a stated reason, say what it is — the number '
          + 'is a convention, not a power calculation.',
      });
    }
    if (!/(root cause|root-cause)/.test(text)) {
      out.push({
        rule: 'usability.no_root_cause',
        kind: 'evidence_gap',
        severity: 'weakness',
        title: 'No root-cause approach for use errors',
        detail:
          'A use error count is not the finding; why it happened is. Validation is assessed '
          + 'on whether each error was root-caused and either mitigated or justified.',
      });
    }
    if (!/(final|production-equivalent|production equivalent)/.test(text)) {
      out.push({
        rule: 'usability.not_final_design',
        kind: 'reviewer_challenge',
        severity: 'weakness',
        title: 'Not stated that the final design and labeling are under test',
        detail:
          'Validation on anything but the final production-equivalent design and final '
          + 'labeling does not validate what ships.',
      });
    }
  }

  return out;
};

/** Device clinical investigation. */
const deviceClinicalRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];

  if (d.sampleSize == null && !/(sample size|powered|power calculation)/.test(text)) {
    out.push({
      rule: 'device.no_sample_size_basis',
      kind: 'statistical_concern',
      severity: 'blocker',
      title: 'No sample size or its basis is stated',
      detail:
        'A clinical investigation needs the number and the assumptions it rests on — '
        + 'effect size, variance, power, dropout. Without them the study cannot be shown '
        + 'to be capable of answering its own question.',
    });
  }

  if (!/(randomi|control|comparator|objective performance)/.test(text)) {
    out.push({
      rule: 'device.no_control_strategy',
      kind: 'reviewer_challenge',
      severity: 'weakness',
      title: 'No control or comparator strategy is described',
      detail:
        'A single-arm result invites the question of what it is being compared against. '
        + 'If a control is genuinely not feasible, the justification belongs in the protocol.',
    });
  }

  if (!/(stopping|suspension|halt)/.test(text)) {
    out.push({
      rule: 'device.no_stopping_rules',
      kind: 'evidence_gap',
      severity: 'weakness',
      section: 'Suspension and stopping criteria',
      title: 'No stopping or suspension criteria',
      detail:
        'ISO 14155 expects the conditions under which the investigation pauses. Deciding '
        + 'them while a safety signal is emerging is deciding them under pressure.',
    });
  }

  if (!/(adverse device effect|adverse event|ade|sae)/.test(text)) {
    out.push({
      rule: 'device.no_adverse_effect_handling',
      kind: 'evidence_gap',
      severity: 'blocker',
      section: 'Adverse device effects',
      title: 'No adverse device effect definitions or reporting',
      detail:
        'Definitions and reporting timelines have to be in the protocol; agreeing them '
        + 'after the first event is not a plan.',
    });
  }

  return out;
};

/** Software as a medical device. */
const softwareRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];

  if (!/(independent|held out|hold-?out|not used in training|separate from training)/.test(text)) {
    out.push({
      rule: 'samd.validation_set_independence',
      kind: 'statistical_concern',
      severity: 'blocker',
      title: 'Validation-set independence from development data is not stated',
      detail:
        'Any overlap between development and validation data makes the performance '
        + 'estimate optimistic and unquantifiably so. State the provenance and the '
        + 'separation, and who attests to it.',
    });
  }

  if (!/(subgroup|demographic|generaliz)/.test(text)) {
    out.push({
      rule: 'samd.no_subgroup_analysis',
      kind: 'reviewer_challenge',
      severity: 'weakness',
      title: 'No subgroup analysis planned',
      detail:
        'A model can meet its overall metric while degrading for a population. Pre-specify '
        + 'the subgroups and commit to reporting them whether or not they are favourable.',
    });
  }

  if (!/(version|locked|lock)/.test(text)) {
    out.push({
      rule: 'samd.no_locked_version',
      kind: 'evidence_gap',
      severity: 'weakness',
      title: 'The software version under test is not identified as locked',
      detail:
        'A result belongs to a specific build. Without a locked version the evidence '
        + 'cannot be attributed to what ships.',
    });
  }

  return out;
};

/** Postmarket follow-up (PMCF / PMPF). */
const postmarketRules: Rule = (a, d, text) => {
  const out: ProtocolFinding[] = [];
  if (!/(cer|per|performance evaluation|clinical evaluation|periodic)/.test(text)) {
    out.push({
      rule: 'postmarket.no_parent_document_link',
      kind: 'evidence_gap',
      severity: 'weakness',
      title: 'No link to the clinical or performance evaluation it feeds',
      detail:
        'PMCF and PMPF exist to update a parent evaluation. A plan that does not say which '
        + 'document it feeds, and on what cadence, produces data nobody folds back in.',
    });
  }
  return out;
};

/** Which packs apply to an archetype. */
function packsFor(a: StudyArchetype): Rule[] {
  const packs: Rule[] = [completenessRules];
  const cls: EvidenceClass = a.evidenceClass;

  // IVD analytical and clinical are keyed off the archetype's own membership
  // rather than the specialization, because a companion diagnostic and a plain
  // IVD run the same precision study and deserve the same challenges.
  if (cls === 'analytical_performance') packs.push(ivdAnalyticalRules);
  if (cls === 'clinical_performance') packs.push(ivdClinicalRules);
  if (cls === 'usability') packs.push(usabilityRules);
  if (cls === 'clinical_safety_effectiveness') packs.push(deviceClinicalRules);
  if (cls === 'software_validation') packs.push(softwareRules);
  if (cls === 'postmarket') packs.push(postmarketRules);

  return packs;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  blocker: 0, weakness: 1, consideration: 2,
};

/**
 * Evaluate a protocol draft against its archetype.
 *
 * Returns the outline (so the editor can render it), the findings (so the AnA
 * rail can), and completeness. An unknown archetype yields no outline and one
 * finding saying so — inventing a generic outline would produce a protocol shaped
 * like nothing in particular.
 */
export function evaluateProtocol(draft: ProtocolDraft): ProtocolEvaluation {
  const archetype = getArchetype(draft.archetypeId);
  if (!archetype) {
    return {
      archetype: null,
      outline: [],
      completeness: null,
      supportsFilings: [],
      findings: [{
        rule: 'core.unknown_archetype',
        kind: 'guidance_depth',
        severity: 'blocker',
        title: 'No study archetype selected',
        detail:
          'The outline, the design questions and the guidance all come from the archetype. '
          + 'Until one is chosen there is nothing to check this draft against, and a '
          + 'generic outline would be shaped like nothing in particular.',
      }],
    };
  }

  const text = draftText(draft);
  const findings = packsFor(archetype).flatMap(rule => rule(archetype, draft, text));

  findings.sort((x, y) =>
    SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.rule.localeCompare(y.rule));

  const outline = archetype.protocolSections.map(section => ({
    section, written: written(draft.sections[section]),
  }));

  return {
    archetype,
    outline,
    findings,
    completeness: {
      written: outline.filter(o => o.written).length,
      required: outline.length,
    },
    supportsFilings: archetype.supportsFilings,
  };
}

/** Findings that must clear before the protocol can go for approval. */
export function blockers(evaluation: ProtocolEvaluation): ProtocolFinding[] {
  return evaluation.findings.filter(f => f.severity === 'blocker');
}

export default { evaluateProtocol, emptyDraft, blockers };
