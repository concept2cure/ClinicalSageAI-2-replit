/**
 * The elements of informed consent — the one record (D2, 2026-10-15).
 *
 * Before this, four copies answered "what must my consent form contain?":
 *   - server/services/ana/gcp-consent.ts (review_informed_consent);
 *   - server/services/gcp-operations/gcp-operations-knowledge.ts
 *     (design_informed_consent), which cited "21 CFR 50.25(b)(7)–(9)" —
 *     paragraphs that do not exist; that content is 45 CFR 46.116(c)(7)–(9);
 *   - the IND war-game auditor's prose list, numbered against 50.25(a) wrongly;
 *   - the protocol-development question flow's partial prose list.
 * Two AnA tools gave different element sets and citations in the same chat.
 *
 * Applicability is part of the record, because it decides what a review may
 * call "missing":
 *   - `required`: 21 CFR 50.25(a) / 45 CFR 46.116(b), every form;
 *   - `when_appropriate`: 21 CFR 50.25(b) / 45 CFR 46.116(c)(1)–(6);
 *   - `applicable_clinical_trial`: 21 CFR 50.25(c), only for an applicable
 *     clinical trial (42 U.S.C. 282(j)) — unknown ACT status is a question,
 *     not a missing element;
 *   - `common_rule`: elements that exist only in the revised Common Rule
 *     (45 CFR 46.116), for HHS-conducted or -supported research.
 *
 * Every citation is recall: eCFR and ich.org were not reachable from the build
 * environment. CONSENT_ELEMENTS_BASIS says so wherever the record is shown.
 * The wording patterns are a reading aid — "not found" means the wording was
 * not found, never that the form is deficient.
 *
 * @module shared/regulatory/informed-consent-elements
 */
import type { RegulatoryBasis } from './regulatory-basis';
import { e6r3Ref } from './ich-e6r3';

export type ConsentApplicability = 'required' | 'when_appropriate' | 'applicable_clinical_trial' | 'common_rule';

export interface InformedConsentElement {
  id: string;
  /** Short label. */
  label: string;
  /** What the form must say, in full. */
  statement: string;
  /** 21 CFR 50.25 paragraph, when FDA requires it. */
  cfr50?: string;
  /** 45 CFR 46.116 paragraph, when the Common Rule requires it. */
  hhs46?: string;
  applicability: ConsentApplicability;
  /** Every pattern must occur in the text for the wording to be found. */
  all: RegExp[];
}

export const CONSENT_ELEMENTS_BASIS: RegulatoryBasis = {
  ref: `21 CFR 50.25; 45 CFR 46.116; ${e6r3Ref({ kind: 'annex1', section: '2.8' })}`,
  confidence: 'recall',
  note: 'Paragraph citations are recall: not checked against eCFR or the ICH text from this environment.',
};

type Cites = { cfr50?: string; hhs46?: string };
const r = (id: string, label: string, statement: string, applicability: ConsentApplicability,
  ...[cites, all]: [Cites, RegExp[]]): InformedConsentElement =>
  ({ id, label, statement, applicability, ...cites, all });

export const INFORMED_CONSENT_ELEMENTS: readonly InformedConsentElement[] = Object.freeze([
  r('research_statement', 'Statement that the study involves research',
    'A statement that the study involves research.', 'required',
    { cfr50: '21 CFR 50.25(a)(1)', hhs46: '45 CFR 46.116(b)(1)' },
    [/involves research|research (study|project|trial)|this (study|trial) is research|is a research|clinical (trial|investigation)/i]),
  r('purpose', 'Purpose and expected duration of participation',
    'An explanation of the purposes of the research and the expected duration of the subject’s participation.', 'required',
    { cfr50: '21 CFR 50.25(a)(1)', hhs46: '45 CFR 46.116(b)(1)' },
    [/purpose/i, /duration|how long|expected to last|will last|\d+\s*(day|week|month|year)s?/i]),
  r('procedures', 'Description of procedures, identifying any that are experimental',
    'A description of the procedures to be followed, and identification of any procedures which are experimental.', 'required',
    { cfr50: '21 CFR 50.25(a)(1)', hhs46: '45 CFR 46.116(b)(1)' },
    [/procedure|visit|blood|sample|test/i, /experimental|investigational/i]),
  r('risks', 'Reasonably foreseeable risks or discomforts',
    'A description of any reasonably foreseeable risks or discomforts to the subject.', 'required',
    { cfr50: '21 CFR 50.25(a)(2)', hhs46: '45 CFR 46.116(b)(2)' }, [/risk|discomfort|side effect/i]),
  r('benefits', 'Benefits to the subject or others that may reasonably be expected',
    'A description of any benefits to the subject or to others which may reasonably be expected from the research.', 'required',
    { cfr50: '21 CFR 50.25(a)(3)', hhs46: '45 CFR 46.116(b)(3)' }, [/benefit/i]),
  r('alternatives', 'Appropriate alternative procedures or courses of treatment',
    'A disclosure of appropriate alternative procedures or courses of treatment, if any, that might be advantageous to the subject.', 'required',
    { cfr50: '21 CFR 50.25(a)(4)', hhs46: '45 CFR 46.116(b)(4)' }, [/alternative/i]),
  r('confidentiality', 'Extent of confidentiality of records, noting that FDA may inspect the records',
    'A statement describing the extent, if any, to which confidentiality of records identifying the subject will be maintained, and that notes the possibility that the Food and Drug Administration may inspect the records.', 'required',
    { cfr50: '21 CFR 50.25(a)(5)', hhs46: '45 CFR 46.116(b)(5)' },
    [/confidential/i, /(FDA|Food and Drug Administration)[^.]{0,120}inspect|inspect[^.]{0,120}(FDA|Food and Drug Administration)/i]),
  r('compensation_injury', 'For more than minimal risk: compensation and medical treatment if injury occurs',
    'For research involving more than minimal risk, an explanation as to whether any compensation and any medical treatments are available if injury occurs and, if so, what they consist of, or where further information may be obtained.', 'required',
    { cfr50: '21 CFR 50.25(a)(6)', hhs46: '45 CFR 46.116(b)(6)' },
    [/injur/i, /compensat|medical treatment|treatment (is|will be) (available|provided)/i]),
  r('contacts', 'Whom to contact about the research, subjects’ rights, and research-related injury',
    'An explanation of whom to contact for answers to pertinent questions about the research and research subjects’ rights, and whom to contact in the event of a research-related injury to the subject.', 'required',
    { cfr50: '21 CFR 50.25(a)(7)', hhs46: '45 CFR 46.116(b)(7)' },
    [/contact|call|phone|telephone|email/i, /question|rights/i]),
  r('voluntary', 'Participation is voluntary; refusing or withdrawing involves no penalty or loss of benefits',
    'A statement that participation is voluntary, that refusal to participate will involve no penalty or loss of benefits to which the subject is otherwise entitled, and that the subject may discontinue participation at any time without penalty or loss of benefits.', 'required',
    { cfr50: '21 CFR 50.25(a)(8)', hhs46: '45 CFR 46.116(b)(8)' },
    [/voluntary/i, /withdraw|discontinue|stop (taking part|participating)|leave the (study|trial)/i, /penalty|loss of (any )?benefits/i]),
  r('clinicaltrials_gov', 'For an applicable clinical trial: the ClinicalTrials.gov statement',
    'For an applicable clinical trial, the statement: "A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law. This Web site will not include information that can identify you. At most, the Web site will include a summary of the results. You can search this Web site at any time."', 'applicable_clinical_trial',
    { cfr50: '21 CFR 50.25(c)' }, [/clinicaltrials\.gov/i]),
  r('unforeseeable_risks', 'Risks that are currently unforeseeable',
    'A statement that the particular treatment or procedure may involve risks to the subject (or to the embryo or fetus, if the subject is or may become pregnant) which are currently unforeseeable.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(1)', hhs46: '45 CFR 46.116(c)(1)' }, [/unforeseeable|currently unknown|not yet known/i]),
  r('investigator_termination', 'Circumstances in which the investigator may end participation without the subject’s consent',
    'Anticipated circumstances under which the subject’s participation may be terminated by the investigator without regard to the subject’s consent.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(2)', hhs46: '45 CFR 46.116(c)(2)' },
    [/without your (consent|permission|agreement)|(investigator|study doctor|sponsor)[^.]{0,80}(end|stop|terminat|remov|withdraw)/i]),
  r('costs', 'Additional costs to the subject',
    'Any additional costs to the subject that may result from participation in the research.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(3)', hhs46: '45 CFR 46.116(c)(3)' }, [/cost|expense|you will (not )?(have to )?pay/i]),
  r('withdrawal_consequences', 'Consequences of withdrawing, and how to withdraw in an orderly way',
    'The consequences of a subject’s decision to withdraw from the research and procedures for orderly termination of participation by the subject.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(4)', hhs46: '45 CFR 46.116(c)(4)' }, [/consequence|if you (decide to )?(withdraw|leave|stop)/i]),
  r('new_findings', 'Significant new findings will be provided',
    'A statement that significant new findings developed during the course of the research which may relate to the subject’s willingness to continue participation will be provided to the subject.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(5)', hhs46: '45 CFR 46.116(c)(5)' }, [/new (findings|information)/i]),
  r('number_subjects', 'Approximate number of subjects',
    'The approximate number of subjects involved in the study.', 'when_appropriate',
    { cfr50: '21 CFR 50.25(b)(6)', hhs46: '45 CFR 46.116(c)(6)' },
    [/(approximately|about|up to) \d[\d,]*\s+(subjects|participants|people|patients)|number of (subjects|participants)/i]),
  r('key_information', 'A concise key-information summary at the start of the form',
    'A concise and focused presentation of the key information most likely to assist a prospective subject in understanding why one might or might not want to participate, at the beginning of the consent.', 'common_rule',
    { hhs46: '45 CFR 46.116(a)(5)(i)' }, [/key information|key facts|summary of (this|the) (study|research)/i]),
  r('future_use', 'Whether identifiers may be removed and the information or biospecimens used for future research',
    'A statement whether identifiers might be removed from identifiable private information or biospecimens and, after removal, used for future research or distributed to another investigator without additional consent, or that they will not be.', 'common_rule',
    { hhs46: '45 CFR 46.116(b)(9)' }, [/future research|identifiers[^.]{0,80}remov/i]),
  r('commercial_profit', 'Whether biospecimens may be used for commercial profit, and whether the subject will share in it',
    'A statement that the subject’s biospecimens (even if identifiers are removed) may be used for commercial profit and whether the subject will or will not share in this commercial profit.', 'common_rule',
    { hhs46: '45 CFR 46.116(c)(7)' }, [/commercial (profit|use|purposes)/i]),
  r('return_of_results', 'Whether clinically relevant research results will be returned',
    'A statement regarding whether clinically relevant research results, including individual research results, will be disclosed to subjects, and if so, under what conditions.', 'common_rule',
    { hhs46: '45 CFR 46.116(c)(8)' }, [/research results|results[^.]{0,60}(shared|returned|disclosed|told)/i]),
  r('genome_sequencing', 'Whether the research will or might include whole genome sequencing',
    'For research involving biospecimens, whether the research will (if known) or might include whole genome sequencing.', 'common_rule',
    { hhs46: '45 CFR 46.116(c)(9)' }, [/genome sequencing|whole[- ]genome/i]),
]);

/** One element's citation line, FDA first. */
export function consentElementCitation(el: InformedConsentElement): string {
  return [el.cfr50, el.hhs46].filter(Boolean).join('; ');
}

export type ConsentRegime = 'fda' | 'common_rule' | 'both';

/**
 * The elements a form is held to: FDA-regulated (21 CFR 50), Common Rule
 * (45 CFR 46), or both. A `common_rule` element is not an FDA element; a
 * 50.25(c) element applies only to an applicable clinical trial.
 */
export function consentElementsFor(regime: ConsentRegime = 'fda'): InformedConsentElement[] {
  return INFORMED_CONSENT_ELEMENTS.filter((el) => {
    if (regime === 'fda') return Boolean(el.cfr50);
    if (regime === 'common_rule') return Boolean(el.hhs46);
    return true;
  });
}
