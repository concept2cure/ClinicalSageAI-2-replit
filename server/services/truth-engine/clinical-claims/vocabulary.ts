/**
 * Vocabulary of the clinical claims engine (design §5): DATA, not logic. Every
 * slot a frame can take is matched from these tables, and growing recall means
 * adding a row here, pinned by a corpus case. A qualifier phrase that matches no
 * row is never read as "overall" (§5.2): it makes the frame incomplete.
 */
import type { PopulationSet } from './types';

/** A vocabulary row: a pattern (case-insensitive unless flagged) and the key it gives. */
export interface Row<K extends string = string> {
  re: RegExp;
  key: K;
}

const ci = (src: string) => new RegExp(src, 'gi');

// ── Study and pool identifiers (C1, C16) ────────────────────────────────────

/** Instrument and lab codes that look like study codes. */
// "LDL-C" never takes the code shape (two to four digits), so LDL/HDL are not listed: "Study LDL-301" is a study (em-22).
const NOT_A_STUDY = /^(?:EASI|PASI|SF|EQ|COVID|ACR|ACQ|PD|HBA|CYP|IL|TNF|HER|VEGF|EGFR|BRAF|KRAS|CTCAE|RECIST|ICH|ISO|ULN|PGI|BMI|GLP|SGLT|DPP|UK|US|EU)-/i;
/** A sponsor study code ("DX-301", "ABC-301", "JK-LTE", "X-201") or a registry number. */
export const STUDY_CODE = /\b(?:NCT\d{8}|[A-Z]{1,5}-(?:\d{2,4}|LTE|OLE|EXT)(?![\w-]))/g;
export const isStudyCode = (s: string): boolean => /^NCT\d{8}$/.test(s) || !NOT_A_STUDY.test(s);
/** "Trial 1", "Study 2": a designation, an identifier only when the source binds it to a code. */
export const DESIGNATION = /\b(Trials?|Studies|Study)\s+(\d{1,2})(?:\s+and\s+(\d{1,2}))?\b(?![\d.-])/g;

/** Words that introduce a pooled scope. */
export const POOL_MARKER = ci(
  String.raw`\b(?:(?:the\s+)?(?:pre-?specified\s+)?pooled\b(?!\s+(?:\w+\s+)?dose\s+groups)|\b(?:ISS|ISE|Integrated\s+Summary\s+of\s+(?:Safety|Efficacy))\b|\bintegrated\s+(?:analysis|safety\s+analys[ie]s|summary)\b|\b(?:Pool|pool)\b|\bacross\s+(?:all\s+)?(?:the\s+)?(?:clinical\s+)?(?:studies|trials)\b|\bIn\s+clinical\s+(?:studies|trials)\b|\bin\s+these\s+trials\b|\b(?:two|three|four|both)\s+(?:\d+-week,?\s+)?(?:randomi[sz]ed,?\s+)?(?:double-blind,?\s+)?(?:placebo-controlled\s+|pivotal\s+|clinical\s+|Phase\s+\d\s+)*(?:studies|trials)\b|\bprogramme\b|\bprogram-wide\b|\bAll-Exposure\b)`,
);

// ── Populations (C2, C3) ────────────────────────────────────────────────────

export const POPULATION_ROWS: Array<Row<PopulationSet>> = [
  { re: ci(String.raw`\bsafety\s+(?:analysis\s+)?(?:population|set)\b|\bSafety\s+Population\b|\bSAF\b|\bsafety\s+data\s+set\b`), key: 'treated' },
  { re: ci(String.raw`\bintent(?:ion)?[\s-]to[\s-]treat(?:\s+\(ITT\))?(?:\s+(?:population|set|analysis\s+set))?\b|\bITT\b(?:\s+(?:population|set))?`), key: 'itt' },
  { re: ci(String.raw`\bfull[\s-]analysis[\s-]set(?:\s+\(FAS\))?|\bFAS\b`), key: 'fas' },
  { re: ci(String.raw`\bmITT\b(?:\s+population)?|\bmodified\s+intent(?:ion)?[\s-]to[\s-]treat\b`), key: 'mitt' },
  { re: ci(String.raw`\bper[\s-]protocol(?:\s+(?:set|population|analysis))?\b|\bPPS?\b(?:\s+(?:set|population))?`), key: 'pp' },
  { re: ci(String.raw`\befficacy(?:-evaluable)?\s+(?:analysis\s+)?(?:set|population)\b|\befficacy-evaluable\b`), key: 'efficacy_evaluable' },
  // The response-evaluable set by its RECIST definition ("in 128 patients with measurable disease at baseline", lu-13).
  { re: ci(String.raw`\b(?:patients|subjects)\s+with\s+measurable\s+disease(?:\s+at\s+baseline)?\b`), key: 'efficacy_evaluable' },
  { re: ci(String.raw`\bPK\s+(?:analysis\s+)?(?:population|set)\b|\bpharmacokinetic\s+(?:population|set)\b`), key: 'pk' },
  { re: ci(String.raw`\brandomi[sz]ed\s+(?:set|analysis\s+set)\b|\ball\s+randomi[sz]ed\s+(?:subjects|patients|participants)\b|\bRandomi[sz]ed\s+Set\b`), key: 'randomized' },
  // "Of the 612 patients randomized in Trial 1, the mean age was …": the opener names the figures' population.
  { re: ci(String.raw`\bOf\s+the\s+\d[\d,. ]*\s+(?:patients|subjects|participants)\s+randomi[sz]ed\b`), key: 'randomized' },
];

/** "(all randomized patients)", "includes all randomized patients", ", all randomised" — not "all randomised subjects with …". */
export const ALL_RANDOMIZED_DEF = ci(String.raw`\ball\s+randomi[sz]ed(?:\s+(?:patients|subjects|participants))?(?=\s*(?:[),;:]|N\s*=|$))`);

// ── Arms (C11, C12) ─────────────────────────────────────────────────────────

/** Arm heads that are a control by name (C12: test vs control). */
export const CONTROL_WORDS = /^(?:placebo|matching placebo|vehicle|control|comparator|active comparator|chemotherapy|standard of care|best supportive care|investigator'?s choice|reference)$/i;
/** Words never an arm name, though they occur where an arm could ("treated with rescue medication"). */
export const NOT_AN_ARM = new Set(
  (
    'the a an any all each both either study treatment trial drug drugs active patients patient subjects subject participants people ' +
    'rescue medication therapy insulin metformin background glucose glucagon oral standard dose doses group groups arm arms total overall ' +
    'combined pooled randomised randomized one two three four five six seven eight nine ten other others it its at least first second ' +
    'this that these those which who whom of in on with for to by from and or not no none safety efficacy analysis population set ' +
    'mild moderate severe events event adverse reactions reaction disease placebo-controlled double-blind open-label extension period ' +
    'week weeks month months day days year years baseline percent cent intensity severity respectively vs versus compared hospital ' +
    'emergency department oxygen surgery dialysis follow-up up primary secondary results superior significantly statistically ' +
    'glycaemic glycemic matching assistance infrequent prolonged reduced demonstrated those these patients subjects investigators ' +
    'number mortality deaths death safety results synopsis report results phase trials studies pivotal amount amounted assessed ' +
    'between among including included exposed exposure duration mean median major outcome measures evaluated diabetes metformin ' +
    'insulin rescue hypoglycaemia hypoglycemia glucose glucagon department therapy means mean retrieved dropouts imputation interval intervals ' +
    'response responses responders complete partial range'
  ).split(/\s+/),
);

// ── Adverse-event measures (C4, C5, C6, C21) ────────────────────────────────

export type EventCategory =
  | 'any'
  | 'serious'
  | 'disc_treatment'
  | 'disc_study'
  | 'disc_unstated'
  | 'interruption'
  | 'dose_reduction'
  | 'fatal'
  | 'grade3-4'
  | 'grade>=3'
  | 'severe';

export interface EventPhrase {
  category: EventCategory;
  basis: 'adverse_event' | 'adverse_reaction';
}

const AE = String.raw`(?:(?:treatment[\s-]emergent\s+)?adverse\s+(?:events?|experiences?)|T?EAEs?|AEs?|adverse\s+reactions?|ADRs?)`;
const AE_OR_AR = AE;
const DRUGWORD = String.raw`(?:study\s+(?:drug|treatment|medication)|treatment|the\s+drug|drug|IMP|investigational\s+(?:medicinal\s+)?product|[A-Za-z][a-z]+(?:mab|nib|tide|stat|lin|mod|zan|bart|clast|tine|gliptin|glitin|glutide|olimab|imab|inab|axel|rone|tinib)|RUXADOLIN|Drug\s+[A-Z])`;
const DISC = String.raw`(?:(?:premature|permanent|permanently)\s+)?discontinu(?:ation|ations|ed|ing)`;
/**
 * EU and British sponsors write "withdrawal of study drug" where US sponsors write "discontinuation of study
 * drug": one measure, two registers (r2 pv-ae-leading-to-withdrawal-*). "Withdrawal FROM THE STUDY" is the other
 * object and keeps its own row, so the two are never folded together.
 */
const WITHDRAW = String.raw`(?:withdrawals?|withdrawn|withdrew|withdrawing)`;
/** "due to", "because of", "owing to", "as a result of": one cause, several registers. */
const CAUSE = String.raw`(?:due\s+to|because\s+of|owing\s+to|as\s+a\s+result\s+of|secondary\s+to)`;
/** What an adverse event can be said to lead to. */
const LEADING = String.raw`(?:leading\s+to|resulting\s+in|that\s+led\s+to|led\s+to)`;
/** A system organ class qualifying the event of a discontinuation ("due to gastrointestinal adverse reactions"). */
const SOC_WORD = String.raw`(?:(?:gastrointestinal|GI)\s+)?`;

/**
 * Event-category phrases, most specific first. Each names what the incidence is
 * of; `basis` from "adverse reaction" (C5). A discontinuation must say of what:
 * treatment / study drug ('disc_treatment') or the study ('disc_study'); with
 * neither it is 'disc_unstated' and incomplete (C6, fs-01, pvs-13).
 */
export const EVENT_ROWS: Array<Row<EventCategory>> = [
  // Discontinuation (or, in EU/British register, withdrawal) of study treatment.
  { re: ci(String.raw`\b${AE_OR_AR}\s+${LEADING}\s+(?:(?:permanent|premature)\s+)?(?:discontinuation|withdrawal)\s+(?:of|from)\s+${DRUGWORD}\b`), key: 'disc_treatment' },
  { re: ci(String.raw`\b${AE_OR_AR}\s+led\s+to\s+(?:(?:permanent|premature)\s+)?(?:discontinuation|withdrawal)\s+(?:of|from)\s+${DRUGWORD}\b`), key: 'disc_treatment' },
  { re: ci(String.raw`\b(?:${DISC}|${WITHDRAW})s?\s+(?:of\s+|from\s+)?${DRUGWORD}\s+${CAUSE}\s+(?:an?\s+)?${SOC_WORD}(?:treatment-emergent\s+)?${AE_OR_AR}\b`), key: 'disc_treatment' },
  { re: ci(String.raw`\b(?:permanently\s+)?(?:discontinued|withdrew\s+from|were\s+withdrawn\s+from)\s+${DRUGWORD}\s+${CAUSE}\s+(?:an?\s+)?${SOC_WORD}${AE_OR_AR}\b`), key: 'disc_treatment' },
  { re: ci(String.raw`\b${AE_OR_AR}\s+leading\s+to\s+(?:discontinuation|withdrawal)\s+(?:of|from)\s+${DRUGWORD}`), key: 'disc_treatment' },
  // Discontinuation from the study.
  { re: ci(String.raw`\b(?:${DISC}\s+from\s+the\s+study|discontinued\s+(?:from\s+)?the\s+study|withdr[ae]w(?:al|n)?\s+from\s+the\s+study)\s+${CAUSE}\s+(?:an?\s+)?${AE_OR_AR}\b`), key: 'disc_study' },
  { re: ci(String.raw`\b${AE_OR_AR}\s+${LEADING}\s+withdrawal\s+from\s+the\s+study\b`), key: 'disc_study' },
  // A discontinuation whose object is not stated.
  { re: ci(String.raw`\b${AE_OR_AR}\s+${LEADING}\s+(?:(?:permanent|premature)\s+)?(?:discontinuation|withdrawal)\b`), key: 'disc_unstated' },
  { re: ci(String.raw`\b(?:${DISC}s?|${WITHDRAW}|permanent\s+discontinuation)\s+${CAUSE}\s+(?:an?\s+)?${AE_OR_AR}\b`), key: 'disc_unstated' },
  // Interruption.
  { re: ci(String.raw`\b${AE_OR_AR}\s+leading\s+to\s+(?:temporary\s+)?(?:dose\s+|dosage\s+|treatment\s+|study\s+drug\s+)?interruption\b|\b(?:temporary\s+)?(?:dose\s+|dosage\s+|treatment\s+)?interruptions?\s+${CAUSE}\s+(?:an?\s+)?${AE_OR_AR}\b`), key: 'interruption' },
  // Dose reduction: a third outcome of an event, and not the incidence of the event (r2 pv-ae-leading-to-dose-reduction).
  { re: ci(String.raw`\b${AE_OR_AR}\s+${LEADING}\s+(?:dose|dosage)\s+reductions?\b|\b(?:dose|dosage)\s+reductions?\s+${CAUSE}\s+(?:an?\s+)?${AE_OR_AR}\b`), key: 'dose_reduction' },
  // Fatal.
  { re: ci(String.raw`(?<!non-)\bfatal\s+(?:serious\s+)?(?:${AE_OR_AR}|SAEs?)\b|\b${AE_OR_AR}\s+${LEADING}\s+death\b|\b${AE_OR_AR}\s+with\s+a\s+fatal\s+outcome\b`), key: 'fatal' },
  // Severity grades: separate categories, never equal to each other (lu-11).
  { re: ci(String.raw`\bGrades?\s+3\s+(?:or|and|-|–|to)\s+4\s+(?:${AE_OR_AR})?`), key: 'grade3-4' },
  { re: ci(String.raw`\bGrade\s*(?:≥|>=)\s*3\s+(?:${AE_OR_AR})?`), key: 'grade>=3' },
  // Serious.
  { re: ci(String.raw`\b(?:at\s+least\s+one\s+|any\s+)?serious\s+(?:treatment[\s-]emergent\s+)?(?:adverse\s+(?:events?|reactions?)|TEAEs?|AEs?)\b|\b(?:any\s+)?SAEs?\b|\bSerious\s+TEAE\b`), key: 'serious' },
  // Any.
  { re: ci(String.raw`\b(?:at\s+least\s+one\s+|any\s+)?(?:treatment[\s-]emergent\s+)?(?:adverse\s+(?:events?|reactions?|experiences?)|T?EAEs?|AEs?)\b`), key: 'any' },
];

export const isAdverseReaction = (phrase: string): boolean => /adverse\s+reactions?|\bADRs?\b/i.test(phrase);

/** System organ classes, folded across "disorders (SOC)", "adverse reactions", "TEAEs", "GI". */
export const SOC_ROWS: Array<Row> = [
  { re: ci(String.raw`\b(?:gastrointestinal|GI)\b(?:\s+disorders)?(?:\s*\(SOC\))?`), key: 'gastrointestinal' },
  { re: ci(String.raw`\bnervous\s+system\s+disorders\b`), key: 'nervous system' },
  { re: ci(String.raw`\binfections\s+and\s+infestations\b`), key: 'infections and infestations' },
];

/** MedDRA UK → US spellings, so a term has one identity (C18). */
const SPELLING: Array<[RegExp, string]> = [
  [/diarrhoea/g, 'diarrhea'],
  [/oedema/g, 'edema'],
  [/haemorrhage/g, 'hemorrhage'],
  [/haemoglobin/g, 'hemoglobin'],
  [/anaemia/g, 'anemia'],
  [/hypoglycaemia/g, 'hypoglycemia'],
  [/hyperglycaemia/g, 'hyperglycemia'],
  [/oesophag/g, 'esophag'],
  [/leukaemia/g, 'leukemia'],
  [/paediatric/g, 'pediatric'],
  [/oestr/g, 'estr'],
  [/faec/g, 'fec'],
];

/** One identity for a preferred term or grouped term: lower case, US spelling, singular. */
export function termKey(phrase: string): string {
  let t = phrase
    .toLowerCase()
    .replace(/\^[a-z]$/, '')
    .replace(/\(pt\)|\(soc\)/g, '')
    .replace(/[^a-z0-9 >=<.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, us] of SPELLING) t = t.replace(re, us);
  t = t.replace(/\binfections\b/, 'infection').replace(/\breactions\b/, 'reaction').replace(/\bevents?\b/, '').trim();
  t = t.replace(/^lymphocyte count decreased$/, 'lymphocytes decreased').replace(/^lymphocyte decreased$/, 'lymphocytes decreased');
  return t;
}

/** Events an exposure-adjusted rate is named for; a paragraph naming exactly one lends it to a clause naming none. */
export const EAIR_NAMED_EVENTS = [/serious\s+infections?/i, /herpes\s+zoster/i];

/**
 * The event an exposure-adjusted rate counts (C21): a named event from `named`, else serious adverse events when
 * the rate's own text (`own`) says so, else any adverse event. One reader for prose and tables.
 */
export function eairEventOf(named: string, own: string = named): Record<string, string> {
  if (/serious\s+infections?/i.test(named)) return { category: 'serious', term: 'infection' };
  if (/herpes\s+zoster/i.test(named)) return { category: 'any', term: 'herpes zoster' };
  if (/SAEs?|serious\s+adverse/i.test(own)) return { category: 'serious' };
  return { category: 'any' };
}

/**
 * A grouped term's identity is its member list (C18): "injection site reactions" defined as "injection site
 * erythema, pain, pruritus and swelling" or "injection site erythema, injection site pain, … and injection site
 * swelling" — members with the term's head words removed, spelling folded, sorted. Two grouped terms compare only
 * when these keys are equal. Null when fewer than two members can be read.
 */
export function groupingKey(term: string, list: string): string | null {
  const name = termKey(term);
  const words = name.split(' ');
  const head = words.length > 1 ? words.slice(0, -1).join(' ') : name;
  const members = list
    .replace(/[.;]\s*$/, '')
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((x) => termKey(x))
    .filter(Boolean)
    .map((m) => (m.startsWith(`${head} `) ? m.slice(head.length + 1) : m));
  const set = [...new Set(members)].sort();
  return set.length >= 2 ? set.join('|') : null;
}

// ── Effect types (C7) ───────────────────────────────────────────────────────

export type EffectType =
  | 'hazard_ratio'
  | 'odds_ratio'
  | 'relative_risk'
  | 'rate_ratio'
  | 'ratio_geometric_ls_means'
  | 'ratio_geometric_means'
  | 'ratio_of_means'
  | 'ls_mean_difference'
  | 'mean_difference'
  | 'risk_difference'
  | 'adjusted_risk_difference'
  | 'km_risk_difference'
  | 'difference'
  | 'rrr';

/**
 * Effect-name phrases. 'difference' is resolved by the endpoint: a continuous
 * endpoint makes it a mean difference, a binary one a risk difference (C7).
 * The LS class: LS mean difference ≡ ETD ≡ adjusted mean difference ≡
 * placebo-adjusted LS mean change ≡ difference in LS mean change.
 */
export const EFFECT_ROWS: Array<Row<EffectType>> = [
  { re: ci(String.raw`\b(?:stratified\s+|unstratified\s+|posterior\s+median\s+)?hazard\s+ratios?\b|\b(?:stratified\s+|unstratified\s+)?HRs?\b`), key: 'hazard_ratio' },
  // "Odds ratio" in any case; the abbreviation "OR" only in capitals, followed by its figure.
  { re: /\b[Oo]dds\s+[Rr]atios?\b|\b[Oo]dds\b(?=[^.;]{0,80}\bOR\b)|\bOR\b(?=\s*[=:]?\s*[\d(])/g, key: 'odds_ratio' },
  { re: /\bOR\b(?=\s+\d)/g, key: 'odds_ratio' },
  { re: ci(String.raw`\brelative\s+risks?\b|\brisk\s+ratios?\b|\bRR\b(?=\s*[=:]?\s*\d)`), key: 'relative_risk' },
  { re: ci(String.raw`\b(?:annuali[sz]ed\s+)?(?:exacerbation\s+)?rate\s+ratios?\b`), key: 'rate_ratio' },
  { re: ci(String.raw`\bratios?\s+of\s+geometric\s+(?:least[\s-]squares?|LS)\s+means\b`), key: 'ratio_geometric_ls_means' },
  { re: ci(String.raw`\bgeometric\s+mean\s+ratios?\b|\bratios?\s+of\s+geometric\s+means\b`), key: 'ratio_geometric_means' },
  { re: ci(String.raw`\bratios?\s+of\s+means\b`), key: 'ratio_of_means' },
  {
    re: ci(
      String.raw`\b(?:LS\s+mean|LSM|least[\s-]squares?\s+mean)\s+diff(?:erence|\.)?\b|\bLS\s+mean\s+diff\b|\b(?:the\s+)?difference\s+in\s+(?:the\s+)?(?:LS|least[\s-]squares?)\s+mean\b|\b(?:estimated\s+)?treatment\s+difference\s*\(ETD\)|\bETDs?\b|\bestimated\s+treatment\s+difference\b|\badjusted\s+mean\s+difference\b|\bplacebo-adjusted\s+(?:LS|least[\s-]squares?)\s+mean\s+(?:percent\s+)?change\b|\btreatment\s+difference\s+(?:versus|vs\.?)\s+\w+\s+in\s+(?:LS|least[\s-]squares?)\s+mean\b|\btreatment\s+difference\s+(?:versus|vs\.?)\s+placebo\s+in\s+LS\b`,
    ),
    key: 'ls_mean_difference',
  },
  { re: ci(String.raw`\bKaplan[\s-]Meier(?:\s+estimated)?\s+(?:absolute\s+)?risk\s+difference\b`), key: 'km_risk_difference' },
  { re: ci(String.raw`\b(?:Cochran[\s-]Mantel[\s-]Haenszel|CMH|adjusted|stratified)\s+(?:risk\s+)?difference\b`), key: 'adjusted_risk_difference' },
  { re: ci(String.raw`\b(?:absolute\s+)?risk\s+difference\b|\bdifference\s+in\s+proportions\b|\bdifference\s+in\s+(?:\w+\s+){0,3}(?:response\s+)?rates?\b|\babsolute\s+reduction\b`), key: 'risk_difference' },
  { re: ci(String.raw`\bplacebo-adjusted\s+(?:mean\s+)?(?:percent\s+)?change\b|\bmean\s+difference\b|\btreatment\s+difference\b|\b(?:unadjusted\s+|key\s+secondary\s+)?difference\b|\bdiff\b`), key: 'difference' },
];

/** "relative increase", "N% reduction in the risk of …": a re-expression, not a figure of its own type. */
export const RELATIVE_CHANGE = ci(String.raw`\brelative\s+(?:increase|reduction)\b`);

// ── Endpoints (§5.1) ────────────────────────────────────────────────────────

export type EndpointKind = 'continuous' | 'binary' | 'tte' | 'count';
export interface EndpointRow {
  re: RegExp;
  id: string;
  kind: EndpointKind;
  unit?: string;
}

/** Seed endpoint vocabulary; an unlisted endpoint never matches another by guess. Most specific first. */
export const ENDPOINT_ROWS: EndpointRow[] = [
  { re: ci(String.raw`\bFEV1\s+AUC\s*0-3\s*h\b|\bFEV1\s+AUC0-3h\b`), id: 'fev1_auc0-3h', kind: 'continuous', unit: 'L' },
  { re: ci(String.raw`\bpre-?(?:bronchodilator|BD)\s+FEV1\b`), id: 'fev1_prebd', kind: 'continuous', unit: 'L' },
  { re: ci(String.raw`\btrough\s+FEV1\b`), id: 'fev1_trough', kind: 'continuous', unit: 'L' },
  { re: ci(String.raw`\bseated\s+trough\s+(?:SBP|systolic\s+blood\s+pressure)\b`), id: 'sbp_trough', kind: 'continuous', unit: 'mmHg' },
  { re: ci(String.raw`\bseated\s+trough\s+(?:DBP|diastolic\s+blood\s+pressure)\b`), id: 'dbp_trough', kind: 'continuous', unit: 'mmHg' },
  { re: ci(String.raw`\bsystolic\s+blood\s+pressure\b|\bSBP\b`), id: 'sbp', kind: 'continuous', unit: 'mmHg' },
  { re: ci(String.raw`\bdiastolic\s+blood\s+pressure\b|\bDBP\b`), id: 'dbp', kind: 'continuous', unit: 'mmHg' },
  { re: ci(String.raw`\bHbA1c\s*<\s*7(?:\.0)?\s*%|\bHbA1c\s+(?:of\s+)?less\s+than\s+7\s*%`), id: 'hba1c<7', kind: 'binary' },
  { re: ci(String.raw`\bHbA1c\b|\bA1C\b|\bglycated\s+ha?emoglobin\b`), id: 'hba1c', kind: 'continuous', unit: '%' },
  { re: ci(String.raw`(?:≥|>=)\s*5\s*%\s+(?:body\s+)?weight\s+(?:loss|reduction)|(?:≥|>=)\s*5\s*%\s+body\s+weight\s+reduction`), id: 'weight_loss>=5pct', kind: 'binary' },
  { re: ci(String.raw`\bbody\s+weight\b|\bweight\b(?=\s+(?:change|LS|results|loss))`), id: 'body_weight', kind: 'continuous', unit: 'kg' },
  { re: ci(String.raw`\bLDL-C\b|\bLDL\s+cholesterol\b`), id: 'ldl_c', kind: 'continuous', unit: '%' },
  { re: ci(String.raw`\burine\s+albumin-to-creatinine\s+ratio\b|\bUACR\b`), id: 'uacr', kind: 'continuous' },
  { re: ci(String.raw`\b24-hour\s+urine\s+protein\b`), id: 'urine_protein_24h', kind: 'continuous', unit: 'g/day' },
  { re: ci(String.raw`\bAUC\s*0-inf\b|\bAUC0-inf\b|\bAUCinf\b|\bAUC\s*0-∞`), id: 'auc0-inf', kind: 'continuous' },
  // Pharmacokinetic parameters (r1 nsf-10..12, nsf-17): each its own endpoint; a GMR names the parameter it is for.
  { re: ci(String.raw`\bAUC\s*0-t\b|\bAUC0-t\b|\bAUClast\b|\bAUC\s*0-last\b`), id: 'auc0-t', kind: 'continuous' },
  { re: ci(String.raw`\bAUC\s*0-(\d+)\s*h?\b|\bAUC0-(\d+)h?\b`), id: 'auc0-24', kind: 'continuous' },
  { re: ci(String.raw`\bAUCtau\b|\bAUC\s*τ\b|\bAUC\s*0-tau\b`), id: 'auc-tau', kind: 'continuous' },
  { re: /\bC\s?max\b|\bCMAX\b/g, id: 'cmax', kind: 'continuous' },
  { re: /\bT\s?max\b/g, id: 'tmax', kind: 'continuous' },
  { re: ci(String.raw`\bMADRS\b`), id: 'madrs', kind: 'continuous' },
  { re: ci(String.raw`\bACQ-5\b`), id: 'acq5', kind: 'continuous' },
  { re: ci(String.raw`\bACQ-7\b|\bAsthma\s+Control\s+Questionnaire\s+\(ACQ-7\)`), id: 'acq7', kind: 'continuous' },
  { re: ci(String.raw`\bPGI-S\b`), id: 'pgi_s', kind: 'continuous' },
  { re: ci(String.raw`\bprogression[\s-]free\s+survival(?:\s*\(PFS\))?|\bPFS\b|\brisk\s+of\s+progression\s+or\s+death\b|\bprogression\s+or\s+death\b`), id: 'pfs', kind: 'tte' },
  { re: ci(String.raw`\boverall\s+survival(?:\s*\(OS\))?|\bOS\b|\brisk\s+of\s+death\b`), id: 'os', kind: 'tte' },
  { re: ci(String.raw`\bduration\s+of\s+response(?:\s*\(DOR\))?|\bDOR\b`), id: 'dor', kind: 'tte' },
  { re: ci(String.raw`\b(?:time\s+to\s+(?:a\s+)?first|risk\s+of\s+a\s+first)\s+(?:moderate\s+or\s+severe\s+)?exacerbation\b|\bTime\s+to\s+First\s+Exacerbation\b`), id: 'ttf_exacerbation', kind: 'tte' },
  { re: ci(String.raw`\b(?:time\s+to\s+first|risk\s+of\s+a\s+first|first)\s+(?:adjudicated\s+)?MACE\b|\bMACE\b|\bmajor\s+adverse\s+cardiovascular\s+events\b`), id: 'mace', kind: 'tte' },
  // Components of a cardiovascular composite, reported side by side (r1 nsf-13).
  { re: ci(String.raw`\b(?:time\s+to\s+(?:a\s+|the\s+)?first\s+|first\s+)?(?:heart\s+failure|HF)\s+hospitali[sz]ations?\b|\bhospitali[sz]ation\s+for\s+heart\s+failure\b|\bHHF\b`), id: 'hf_hospitalisation', kind: 'tte' },
  { re: ci(String.raw`\b(?:time\s+to\s+)?(?:cardiovascular|CV)\s+death\b`), id: 'cv_death', kind: 'tte' },
  { re: ci(String.raw`\b(?:time\s+to\s+first|risk\s+of\s+a\s+first|first)\s+(?:disease\s+)?flare\b|\bdisease\s+flare\b`), id: 'disease_flare', kind: 'tte' },
  { re: ci(String.raw`\btime\s+to\s+first\s+relapse\b`), id: 'relapse', kind: 'tte' },
  { re: ci(String.raw`\bannuali[sz]ed\s+exacerbation\s+rate\b`), id: 'exacerbation_rate', kind: 'count' },
  { re: ci(String.raw`\bACR\s*20\b`), id: 'acr20', kind: 'binary' },
  { re: ci(String.raw`\bACR\s*50\b`), id: 'acr50', kind: 'binary' },
  { re: ci(String.raw`\bACR\s*70\b`), id: 'acr70', kind: 'binary' },
  { re: ci(String.raw`\bEASI[\s-]?75\b`), id: 'easi75', kind: 'binary' },
  { re: ci(String.raw`\bPASI[\s-]?75\b`), id: 'pasi75', kind: 'binary' },
  { re: ci(String.raw`\bPASI[\s-]?90\b`), id: 'pasi90', kind: 'binary' },
  { re: ci(String.raw`\bPASI[\s-]?100\b`), id: 'pasi100', kind: 'binary' },
  { re: ci(String.raw`\bEASI[\s-]?90\b`), id: 'easi90', kind: 'binary' },
  { re: ci(String.raw`\bsPGA\s*(?:score\s+of\s+)?0\s*\/\s*1\b|\bsPGA\s+0\s+or\s+1\b`), id: 'spga01', kind: 'binary' },
  { re: ci(String.raw`\bv?IGA\s*(?:score\s+of\s+)?0\s*\/\s*1\b|\bIGA\s+0\s+or\s+1\b`), id: 'iga01', kind: 'binary' },
  // Patient-reported scales (r1 nsf-14).
  { re: ci(String.raw`\bDLQI\b|\bDermatology\s+Life\s+Quality\s+Index\b`), id: 'dlqi', kind: 'continuous' },
  { re: ci(String.raw`\b(?:itch|pruritus|peak\s+pruritus)\s+NRS\b|\b(?:Peak\s+)?Pruritus\s+Numeric\s+Rating\s+Scale\b`), id: 'itch_nrs', kind: 'continuous' },
  { re: ci(String.raw`\bsustained\s+remission\b`), id: 'sustained_remission', kind: 'binary' },
  { re: ci(String.raw`\bclinical\s+remission\b|\bremission\b`), id: 'clinical_remission', kind: 'binary' },
  { re: ci(String.raw`\b(?:objective|overall)\s+response\s+rate(?:\s*\(ORR\))?|\bORR\b`), id: 'orr', kind: 'binary' },
  { re: ci(String.raw`\bcomplete\s+respon(?:se|ses)\b|\bCR\s+rate\b`), id: 'cr', kind: 'binary' },
  { re: ci(String.raw`\bpartial\s+respon(?:se|ses)\b|\bPR\s+rate\b`), id: 'pr', kind: 'binary' },
  { re: ci(String.raw`\bsustained\s+virologic(?:al)?\s+response\b|\bSVR12\b`), id: 'svr12', kind: 'binary' },
  { re: ci(String.raw`\bclinical\s+cure(?:\s+rate)?\b`), id: 'clinical_cure', kind: 'binary' },
  { re: ci(String.raw`\bmicrobiological\s+eradication\b`), id: 'micro_eradication', kind: 'binary' },
  { re: ci(String.raw`\b(?:proportion\s+of\s+patients\s+with\s+)?treatment\s+failure\b`), id: 'treatment_failure', kind: 'binary' },
  { re: ci(String.raw`\bhealing\s+rate\b`), id: 'healing', kind: 'binary' },
  { re: ci(String.raw`\bcomposite\s+renal\s+endpoint\b`), id: 'composite_renal', kind: 'binary' },
];

/** Endpoint roles stated in the text ("the primary endpoint", "key secondary"); defaultable (C13). */
export const ENDPOINT_ROLE_ROWS: Array<Row> = [
  { re: ci(String.raw`\bkey\s+secondary(?:\s+endpoint)?\b|\(KS\)`), key: 'key_secondary' },
  { re: ci(String.raw`\bprimary\s+(?:efficacy\s+)?endpoint\b|\(P\)`), key: 'primary' },
  { re: ci(String.raw`\bexploratory\s+endpoint\b|\(E\)`), key: 'exploratory' },
  { re: ci(String.raw`\bsecondary\s+endpoint\b`), key: 'secondary' },
];

/** "percent change from baseline": a different transform of the same measurement. */
export const PERCENT_CHANGE = ci(String.raw`\bpercent(?:age)?\s+change\b|\b%\s*change\b`);

// ── Periods, timepoints, subgroups, parts (C14, C17) ───────────────────────

export const PERIOD_ROWS: Array<Row> = [
  { re: ci(String.raw`\b(?:(?:through|up\s+to|until)\s+(?:the\s+)?(?:end\s+of\s+)?|cumulatively\s+through\s+|cumulative\s+through\s+)Week\s+(\d+)\b|\bWeeks?\s+0\s*[–-]\s*(\d+)\b`), key: 'through' },
  // "16-week treatment period" (no double-blind or other qualifier): weeks 0 to 16 of treatment (lu-10).
  { re: ci(String.raw`\b(\d+)-week\s+treatment\s+period\b`), key: 'through' },
  // A sub-window of a period is not the period: "during the first 12 weeks of the placebo-controlled period" is a
  // sub-period rate, never the whole-period one (r2 scope-05, C17).
  { re: ci(String.raw`\b(?:during\s+)?the\s+first\s+(\d+)\s+weeks\s+of\s+(?:the\s+)?(double-blind|placebo-controlled|active-controlled|treatment)\s+(?:treatment\s+)?period\b`), key: 'sub-window' },
  // The stated length of the period is part of it: an incidence over 12 weeks and one over 24 weeks of the same
  // period are different figures (r2 scope-04, scope-06). An unstated length matches a stated one (euc-35).
  { re: ci(String.raw`\b(?:during\s+|in\s+|over\s+)?(?:the\s+)?(?:(\d+)-week\s+)?double-blind(?:\s+treatment)?\s+period\b(?:\s*\((\d+)\s+weeks\))?|\bDouble-blind\s+Period\b`), key: 'double-blind' },
  { re: ci(String.raw`\b(?:during\s+|in\s+|over\s+)?(?:the\s+)?(?:(\d+)-week\s+)?placebo-controlled\s+(?:treatment\s+)?period\b(?:\s*\((\d+)\s+weeks\))?|\bPlacebo-controlled\s+period\b(?:\s*\((\d+)\s+weeks\))?`), key: 'placebo-controlled' },
  { re: ci(String.raw`\bIncluding\s+the\s+open-label\s+extension\b|\bentire\s+treatment\s+period(?:\s+including\s+the\s+long-term\s+extension)?\b`), key: 'entire' },
  { re: ci(String.raw`\b(?:during\s+|in\s+)?(?:the\s+)?open-label\s+extension(?:\s+period)?\b|\b(?:long-term\s+)?extension\s+period\b|\bOpen-Label\s+Extension\b`), key: 'ole' },
  { re: ci(String.raw`\btreatment-emergent\s+deaths?\s*\(onset\s+within\s+(\d+)\s+days\s+of\s+last\s+dose\)|\bwithin\s+(\d+)\s+days\s+of\s+(?:the\s+)?last\s+dose\b`), key: 'treatment-emergent' },
  { re: ci(String.raw`\bpost-treatment\s+follow-up\b|\bfollow-up\s+period\b`), key: 'follow-up' },
  { re: ci(String.raw`\b(?:during\s+)?the\s+first\s+(\d+)\s+months\s+of\s+treatment\b|\b0\s*[–-]\s*(\d+)\s+months\b`), key: 'interval-first' },
  { re: ci(String.raw`>\s*(\d+)\s*[–-]\s*(\d+)\s+months\b`), key: 'interval' },
  { re: ci(String.raw`>\s*(\d+)\s+months\b`), key: 'interval-after' },
  { re: ci(String.raw`\bover\s+the\s+whole\s+exposure\s+period\b|\bwhole\s+exposure\s+period\b`), key: 'whole' },
  { re: ci(String.raw`\brun-in\b`), key: 'run-in' },
  // Hardening r1: windows written as an adjective, an onset bound, a treatment year, a study phase or a protocol version.
  // "post-treatment SAEs" (not "post-treatment follow-up", "post-treatment value" or "Week 12 post-treatment").
  { re: ci(String.raw`\bpost-treatment(?=\s+(?:serious\s+|treatment-emergent\s+)?(?:S?AEs?|TEAEs?|adverse|deaths?|events?)\b)`), key: 'post-treatment' },
  // "SAEs with onset after Week 12", "after Week 24" (a landmark window, never the timepoint Week 24).
  { re: ci(String.raw`\b(?:with\s+)?onset\s+after\s+Week\s+(\d+)\b|\bafter\s+Week\s+(\d+)\b`), key: 'after-week' },
  { re: ci(String.raw`\b(?:with\s+)?onset\s+(?:before|prior\s+to)\s+Week\s+(\d+)\b|\bbefore\s+Week\s+(\d+)\b`), key: 'before-week' },
  // "reported within 30 days after the last dose" (the "of the last dose" form is the treatment-emergent row above).
  { re: ci(String.raw`\bwithin\s+(\d+)\s+days\s+after\s+(?:the\s+)?last\s+dose\b`), key: 'treatment-emergent' },
  // "in the second year of treatment", "during the first year".
  { re: ci(String.raw`\b(?:in|during)\s+(?:the\s+)?(first|second|third|fourth|fifth)\s+year(?:\s+of\s+(?:treatment|the\s+study|therapy))?\b`), key: 'year' },
  // Induction / maintenance designs report per phase (r1 sp-15, sp-16).
  { re: ci(String.raw`\b(?:in\s+|during\s+)?(?:the\s+)?(induction|maintenance|titration|washout|treatment-free|withdrawal)\s+(?:phase|period)\b`), key: 'phase' },
  // A protocol version or an amendment boundary (r1 sp-18, sp-19, sp-34, pv-randomized-after-amendment).
  { re: ci(String.raw`\b(after|before|prior\s+to)\s+(?:the\s+)?(?:protocol\s+)?amendment(?:\s+(\d+))?\b|\bunder\s+the\s+(original)\s+protocol\b`), key: 'amendment' },
];

export const TIMEPOINT_ROWS: Array<Row> = [
  { re: ci(String.raw`\bWeek\s+(\d+)\s+post-treatment\b`), key: 'week-post' },
  { re: ci(String.raw`\b(?:at|to|by)\s+(?:the\s+)?test-of-cure(?:\s+visit)?\b|\b(?:at|to)\s+TOC\b|\btest-of-cure\b|\bTOC\b`), key: 'toc' },
  { re: ci(String.raw`\bWeek\s+(\d+)\b`), key: 'week' },
  { re: ci(String.raw`\bMonth\s+(\d+)\b`), key: 'month' },
  { re: ci(String.raw`\bWeek\s+(\d+)\b`), key: 'week' },
];

export interface SubgroupRow {
  re: RegExp;
  key: (m: RegExpExecArray) => string;
}
const n = (m: RegExpExecArray) => m.slice(1).find((g) => g !== undefined) ?? '';

/** Subgroup phrases → normalised keys; an unlisted qualifier is never overall (§5.2). */
export const SUBGROUP_ROWS: SubgroupRow[] = [
  // An age bound needs "aged"/"age" before it or "years" after it: "P<0.001" and "≥5%" are not ages.
  { re: ci(String.raw`\b(?:aged|age)\s*(?:≥|>=)\s*(\d+)(?:\s*(?:years|yrs))?\b|(?:≥|>=)\s*(\d+)\s*(?:years|yrs)\b|\b(?:aged\s+)?(\d+)\s+years\s+(?:of\s+age\s+)?(?:and|or)\s+older\b|\baged\s+(\d+)\s+years\s+(?:or|and)\s+(?:older|over)\b`), key: (m) => `age>=${n(m)}` },
  { re: ci(String.raw`\b(?:aged|age)\s*<\s*(\d+)(?:\s*(?:years|yrs))?\b|<\s*(\d+)\s*(?:years|yrs)\b|\byounger\s+than\s+(\d+)(?:\s+years)?\b`), key: (m) => `age<${n(m)}` },
  { re: ci(String.raw`\belderly(?:\s+patients)?\s*\((?:≥|>=)\s*(\d+)\s*years\)`), key: (m) => `age>=${n(m)}` },
  { re: ci(String.raw`\belderly\b`), key: () => 'elderly' },
  { re: ci(String.raw`\bp(?:a)?ediatric\b`), key: () => 'pediatric' },
  { re: ci(String.raw`\b(?:women|female)\b`), key: () => 'sex=female' },
  { re: ci(String.raw`\b(?:men|male)\b`), key: () => 'sex=male' },
  { re: ci(String.raw`\bJapanese\b`), key: () => 'region=japan' },
  { re: ci(String.raw`\bAsian\b`), key: () => 'race=asian' },
  { re: ci(String.raw`\bEuropean\s+Economic\s+Area\b|\bEEA\b`), key: () => 'region=eea' },
  { re: ci(String.raw`\bRegion:\s*([A-Z][a-z]+)`), key: (m) => `region=${(m[1] ?? '').toLowerCase()}` },
  { re: ci(String.raw`\bwith\s+(?:moderate\s+|severe\s+|mild\s+)?renal\s+impairment\b`), key: (m) => `raw:${m[0].replace(/^with\s+/i, '').toLowerCase()}` },
  { re: ci(String.raw`\bwith\s+prior\s+myocardial\s+infarction\b`), key: () => 'raw:prior myocardial infarction' },
  // Randomisation strata named as such: ECOG performance status, disease severity, prior lines (r2 scope-18).
  { re: ci(String.raw`\bwith\s+an?\s+ECOG\s+performance\s+status\s+of\s+([0-3])\b|\bECOG\s+(?:PS\s*)?([0-3])\b`), key: (m) => `raw:ecog=${m[1] ?? m[2]}` },
  { re: ci(String.raw`\bwith\s+type\s+2\s+diabetes\b`), key: () => 'raw:type 2 diabetes' },
  { re: ci(String.raw`\bwith\s+(?:moderate\s+|severe\s+)?hepatic\s+impairment\b`), key: (m) => `raw:${m[0].replace(/^with\s+/i, '').toLowerCase()}` },
  // Places named as a place (r1 sp-01..08, sp-32/33, sp-40, pv-randomized-*): "enrolled at sites in Japan", "In North America",
  // "(US patients)", "at EU sites", "in the United States", "from Latin America". The region is the subgroup, whatever
  // preposition introduces it; "Japanese" and "Japan" are one key.
  { re: ci(String.raw`\b(?:North|South|Latin|Central)\s+America(?:n)?\b`), key: (m) => `region=${m[0].toLowerCase().replace(/n$/, '').replace(/\s+/g, '-')}` },
  { re: ci(String.raw`\bAsia-Pacific\b|\bAsia\b(?!n)`), key: (m) => `region=${m[0].toLowerCase()}` },
  { re: ci(String.raw`\b(?:Japan|China|Chinese|Korea|Korean|Taiwan|Taiwanese|India|Canada|Australia|Europe|European)\b(?!\s+Economic\s+Area)`), key: (m) => `region=${REGION_KEY[m[0].toLowerCase()] ?? m[0].toLowerCase()}` },
  { re: /\b(?:United\s+States|USA|US|U\.S\.)(?![\w-])|\b(?:EU|UK)\b|\bUnited\s+Kingdom\b/g, key: (m) => `region=${/^(?:United\s+States|USA|US|U\.S\.)$/.test(m[0]) ? 'us' : /^UK|United/.test(m[0]) ? 'uk' : 'eu'}` },
  // Race named as a subgroup ("In Black or African American patients", r1 sp-12); demographic statements are blanked first.
  { re: ci(String.raw`\bBlack(?:\s+or\s+African\s+American)?\b`), key: () => 'race=black' },
  { re: ci(String.raw`\bWhite\b(?=\s+(?:patients|subjects|participants))`), key: () => 'race=white' },
  // Body weight and immunogenicity strata (r1 sp-09, sp-10).
  { re: ci(String.raw`\bweighing\s+(less|more)\s+than\s+(\d+)\s*kg\b`), key: (m) => `weight${/less/i.test(m[1] ?? '') ? '<' : '>'}${m[2]}kg` },
  { re: ci(String.raw`\b(?:anti-drug\s+antibody|ADA)[\s-]+(positive|negative)\b`), key: (m) => `ada=${(m[1] ?? '').toLowerCase()}` },
  // Background therapy (r1 sp-11, sp-28, sp-47): "on concomitant methotrexate", "on background inhaled corticosteroids",
  // "on metformin monotherapy at screening". "patients on Drug X" is an arm, never matched here.
  { re: ci(String.raw`\bon\s+(?:concomitant|background)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}|\bon\s+[a-z][a-z-]*\s+monotherapy(?:\s+at\s+screening)?`), key: (m) => `raw:${m[0].toLowerCase().replace(/\s+/g, ' ')}` },
];

/** One key for a country and its adjective ("Japanese" ≡ "Japan", as the existing region=japan row). */
const REGION_KEY: Record<string, string> = {
  japan: 'japan',
  chinese: 'china',
  korean: 'korea',
  taiwanese: 'taiwan',
  european: 'europe',
};

/** A sentence that names the whole population, which a special-groups heading requires (C17). */
export const WHOLE_POPULATION = ci(String.raw`\b(?:in\s+the\s+)?overall\s+(?:safety\s+)?population\b|\ball\s+patients\b|\bOverall,|\boverall\s+safety\s+population\b|\bin\s+the\s+ITT\s+population\b|\bin\s+the\s+(?:full\s+analysis\s+set|FAS|safety\s+(?:population|set))\b`);

/** Section headings that put every figure under them in a subgroup context unless the sentence says otherwise. */
export const SUBGROUP_CONTEXT_HEADING = ci(
  String.raw`\b(?:Geriatric\s+Use|Pediatric|Paediatric\s+population|Elderly|Special\s+Groups|Intrinsic\s+Factors|Extrinsic\s+Factors|Sub-?populations|Subgroups?|Age\s+Subgroup|Renal\s+Impairment|Hepatic\s+Impairment)\b`,
);

export const STAGE_ROW = ci(String.raw`\b(?:in\s+)?Stage\s+(\d)\b|\b(?:in\s+)?(?:the\s+)?(first|second|third)\s+stage\b`);

export const PART_ROW = ci(String.raw`\b(?:integrated\s+analysis\s+of\s+)?Parts?\s+([A-D])(?:\s+and\s+([A-D]))?(?:\s+combined)?\b`);

// ── Analysis role, model, estimand, imputation, assessor, ascertainment ────

export const ROLE_ROWS: Array<Row> = [
  { re: ci(String.raw`\b(?:(?:first|second|third|fourth|fifth)\s+)?interim(?:\s+OS)?\s+analysis\b|\bprespecified\s+interim\b`), key: 'interim' },
  // The primary analysis and the final analysis are different occasions with different accrued follow-up: an
  // immature hazard ratio at the primary analysis is not the mature one at the final analysis (r2 scope-11, C14).
  // A figure that states neither is the primary/final occasion ('primary_or_final'), compatible with both.
  { re: ci(String.raw`\b(?:prespecified\s+|pre-specified\s+)?final(?:\s+OS)?\s+analysis\b|\bFinal\s+OS\s+analysis\b`), key: 'final' },
  // "… was consistent with the primary analysis: HR 0.58": a figure set against the primary analysis is not it (sbx-013).
  { re: ci(String.raw`\b(?:was|were|is|are)\s+consistent\s+with\s+the\s+primary\s+analysis\b`), key: 'non_primary' },
  { re: ci(String.raw`(?<!consistent\s+with\s+the\s+)\bprimary\s+(?:MMRM\s+|efficacy\s+|PFS\s+|OS\s+)?analysis\b|(?<!consistent\s+with\s+the\s+)\bPrimary\s+analysis\b|\bprimary\s+estimand\b|\bprimary\s+(?:ITT|FAS|mITT|intent-to-treat)\s+(?:difference|estimate|analysis)\b`), key: 'primary' },
  { re: ci(String.raw`\bsensitivity(?:\s+analys[ie]s)?\b`), key: 'sensitivity' },
  { re: ci(String.raw`\bsupportive\b`), key: 'supportive' },
  { re: ci(String.raw`\bsupplementary(?:\s+(?:analysis|estimand))?\b`), key: 'supplementary' },
  // "the exploratory endpoint of ACQ-5" is the endpoint's role (ENDPOINT_ROLE_ROWS), not an exploratory analysis (em-18).
  { re: ci(String.raw`\bexploratory(?!\s+endpoints?\b)(?:\s+analysis)?\b`), key: 'exploratory' },
  // "at the updated analysis": a later data cut of the same endpoint, never the primary or final analysis (r1 sp-44).
  { re: ci(String.raw`\b(?:the\s+)?updated\s+(?:efficacy\s+|OS\s+|PFS\s+)?analysis\b`), key: 'updated' },
];

/**
 * Analyses named by their method (r1 sp-21, sp-23, sp-24, sp-25, sp-48): each is a different analysis from the one a text
 * states without it. Unlike model and estimand (C13), a method is never defaulted: stated on one side only, the
 * figures are not compared (analysis_differs).
 */
export const METHOD_ROWS: Array<Row> = [
  { re: ci(String.raw`\btipping[\s-]point(?:\s+analys[ie]s)?\b`), key: 'tipping-point' },
  { re: ci(String.raw`\bas[\s-]treated(?:\s+(?:analysis|population|set))?\b`), key: 'as-treated' },
  // The same convention in the words CSR section 12.1 and the ISS actually use (r2 scope-14).
  { re: ci(String.raw`\b(?:summari[sz]ed|analy[sz]ed|reported|presented|grouped)\s+(?:accordingly\s+)?(?:according\s+to|by)\s+(?:the\s+)?treatment\s+(?:actually\s+received|received)\b`), key: 'as-treated' },
  { re: ci(String.raw`\bcensoring\s+(?:patients\s+|subjects\s+)?at\s+(?:the\s+time\s+of\s+)?(?:treatment\s+|study\s+drug\s+)?discontinuation\b|\bcensored\s+at\s+(?:treatment\s+)?discontinuation\b`), key: 'censor-at-discontinuation' },
  { re: ci(String.raw`\bexcluding\s+(?:data|values|measurements)\s+(?:collected\s+)?(?:after|following)\s+(?:the\s+)?(?:initiation\s+of\s+|start\s+of\s+)?rescue(?:\s+(?:medication|therapy|treatment))?\b`), key: 'post-rescue-excluded' },
  { re: ci(String.raw`\b(?:when\s+)?(?:the\s+)?analysis\s+was\s+repeated\b|\brepeated\s+(?:without|excluding|with)\b|\bre-?analys[ie]s\b`), key: 'repeated' },
];

export const MODEL_ROWS: Array<Row> = [
  { re: ci(String.raw`\bunstratified\b|\bwithout\s+stratification(?:\s+factors)?\b`), key: 'unstratified' },
  { re: ci(String.raw`\bstratified\s+Cox(?:\s+(?:proportional[\s-]hazards?\s+)?model)?\b|\bstratified\b(?=\s+(?:HR|hazard|Cox))|\bStratified\s+(?:HR|hazard\s+ratio)\b|\bstratified\s+log-rank\b`), key: 'stratified' },
  { re: ci(String.raw`\bmixed\s+model\s+for\s+repeated\s+measures\b|\bMMRM\b`), key: 'mmrm' },
  { re: ci(String.raw`\bANCOVA\b`), key: 'ancova' },
];

export const ESTIMAND_ROWS: Array<Row> = [
  { re: ci(String.raw`\btreatment[\s-]policy(?:\s+estimand)?\b`), key: 'treatment-policy' },
  { re: ci(String.raw`\bhypothetical(?:\s+estimand)?\b`), key: 'hypothetical' },
  { re: ci(String.raw`\bon-treatment\s+estimand\b`), key: 'on-treatment' },
];

export const IMPUTATION_ROWS: Array<Row> = [
  { re: ci(String.raw`\bnon-responder\s+imputation\b|\bNRI\b`), key: 'nri' },
  { re: ci(String.raw`\bmultiple\s+imputation\s+(?:under\s+a\s+)?jump-to-reference(?:\s+assumption)?\b|\bjump-to-reference\b`), key: 'mi-j2r' },
  { re: ci(String.raw`\bmultiple\s+imputation\s+(?:from|using)\s+retrieved\s+dropouts\b|\bimputed\s+(?:by\s+multiple\s+imputation\s+)?using\s+retrieved\s+dropouts\b|\bretrieved\s+dropouts\b`), key: 'mi-retrieved-dropouts' },
  // "using multiple imputation under a missing-not-at-random assumption" (r1 pv-effect-trailing-sensitivity-method).
  { re: ci(String.raw`\bmultiple\s+imputation\s+(?:under\s+(?:an?\s+)?)?(?:missing[\s-]not[\s-]at[\s-]random|MNAR)(?:\s+assumption)?\b|\bMNAR\b`), key: 'mi-mnar' },
  { re: ci(String.raw`\bmultiple\s+imputation\b`), key: 'mi' },
  // Observed cases: no imputation at all (r1 sp-42).
  { re: ci(String.raw`\b(?:using\s+)?observed\s+cases?(?:\s+\(OC\))?\b`), key: 'observed-cases' },
];

export const ASSESSOR_ROWS: Array<Row<'bicr' | 'investigator'>> = [
  { re: ci(String.raw`\bblinded\s+independent\s+central\s+review(?:\s*\(BICR\))?|\bBICR(?:-assessed)?\b|\bIRC\b|\bindependent\s+review\s+committee\b`), key: 'bicr' },
  { re: ci(String.raw`\binvestigator(?:-assessed|\s+assessment|'s\s+assessment)\b|\bper\s+investigator\b|\bby\s+investigator\b`), key: 'investigator' },
];

export const ASCERTAINMENT_ROWS: Array<Row<'adjudicated' | 'investigator'>> = [
  { re: ci(String.raw`\bconfirmed\s+by\s+adjudication\b|\badjudicated\b|\bCEC-confirmed\b|\bClinical\s+Events\s+Committee\s+confirmed\b|\bthe\s+independent\s+Clinical\s+Events\s+Committee\s+confirmed\b`), key: 'adjudicated' },
  { re: ci(String.raw`\binvestigator-reported\b`), key: 'investigator' },
];

export const CAUSALITY_ROWS: Array<Row<'all' | 'related'>> = [
  { re: ci(String.raw`\bregardless\s+of\s+(?:causality|relationship(?:\s+to\s+study\s+drug)?)\b|\ball-causality\b|\ball\s+TEAEs\s+regardless\b`), key: 'all' },
  { re: ci(String.raw`\b(?:considered\s+(?:by\s+the\s+investigator\s+)?to\s+be\s+)?related\s+to\s+(?:study\s+(?:drug|treatment)|\w+)\b|\btreatment-related\b|\bdrug-related\b`), key: 'related' },
];

// ── Trigger words: fail-closed scope detection (§5.2) ───────────────────────

/**
 * Hardening round 1 (2026-10-05): restrictions the first vocabulary let through as "overall". Each is either classified
 * by a row above (a region, a period, a phase, an amendment, a stage, a background therapy) or, when the row does not
 * cover its wording, left unclassified so the figure is not compared (§5.2). Never read as overall.
 */
const TRIGGER_R1 = [
  // Places and recruitment: "at sites in …", "from site 104", "randomised in <Place>" (a study code is not a place).
  String.raw`sites|site\s+\d+`,
  // Patient characteristics written as a relative clause or a modifier.
  String.raw`those\s+with`,
  String.raw`who\s+were\s+(?!treated|randomi[sz]ed|assigned|dosed|exposed)`,
  String.raw`weighing`,
  String.raw`previously\s+treated\s+with`,
  String.raw`concomitant`,
  String.raw`monotherapy`,
  String.raw`(?:current|former|never|non-)?smokers?`,
  String.raw`na[iï]ve`,
  String.raw`sero(?:positive|negative)`,
  String.raw`[A-Za-z0-9]+-(?:positive|negative|mutant|mutated|high|low|IR|amplified|expressing)`,
  String.raw`\d+L\+?`,
  String.raw`setting`,
  String.raw`responders`,
  String.raw`re-?randomi[sz]ed`,
  String.raw`subsets?`,
  String.raw`these\s+(?:patients|subjects|participants)`,
  String.raw`this\s+(?:subgroup|subpopulation|cohort|population)`,
  // Windows and study stages not in the period rows.
  String.raw`phase(?!\s*[0-9IV])`,
  String.raw`stages?`,
  String.raw`amendments?`,
  String.raw`(?<![-\w])year`,
  String.raw`onset`,
  String.raw`post-treatment`,
  // Event-set restrictions not in the event rows.
  String.raw`excluding`,
  String.raw`except`,
  String.raw`other\s+than`,
  String.raw`not\s+including`,
  String.raw`requiring`,
  String.raw`non-(?:fatal|serious)`,
  // Analyses named by their method.
  String.raw`tipping-point`,
  String.raw`as-treated`,
  String.raw`observed\s+cases`,
  String.raw`imputation`,
  String.raw`censor(?:ed|ing)`,
  String.raw`updated`,
  String.raw`repeated`,
].join('|');

/**
 * A recruitment place written with a capital ("randomised in Brazil", "enrolled at Canadian sites"): case-sensitive, so it
 * cannot live in TRIGGER. A study, trial, part, stage, phase, week or month is not a place.
 */
export const PLACE_TRIGGER = /\b(?:enrolled|randomi[sz]ed|recruited)\s+(?:in|at|from)\s+(?:the\s+)?(?!Study\b|Trial\b|Part\b|Stage\b|Phase\b|Week\b|Month\b|Day\b)[A-Z][a-z]+/g;

/** Any of these in a claim's clause must be classified by a slot vocabulary, else the frame is incomplete. */
export const TRIGGER = ci(
  String.raw`\b(?:aged|age|years|older|younger|elderly|geriatric|p(?:a)?ediatric|adolescents?|child(?:ren)?|infants?|neonat\w*|women|men|female|male|Japanese|Asian|Chinese|European|EEA|region|country|countries|race|white|black|hispanic|ethnic\w*|patients\s+with|subjects\s+with|participants\s+with|with\s+prior|history\s+of|impairment|baseline|subgroups?|subpopulations?|sub-populations?|cohorts?|stratum|strata|period|extension|open-label|follow-up|cumulative(?:ly)?|through|until|cut-?off|interim|sensitivity|supportive|supplementary|exploratory|per-protocol|mITT|evaluable|completers?|pooled|pool|integrated|across|ISS|ISE|programme|program|exposure-adjusted|patient-years|subject-years|person-years|EAIR|EAER|mild|moderate|severe|grade|intensity|severity|resolved|recovered|of\s+them|of\s+these|of\s+those|of\s+all|${TRIGGER_R1})\b`,
);

/** Trailing commentary after a figure; exempt from the trigger rule only when it carries no trigger. */
export const COMMENTARY = ci(
  String.raw`(?:,\s*(?:confirming|corresponding\s+to|supporting|which|with\s+the\s+upper\s+bound|narrowly\s+missing|meeting|favou?ring|using\s+the\s+alpha|consistent\s+with)\b[^;.]*|;\s*none\s+was\b[^.]*|;\s*all\s+deaths\s+are\s+described\b[^.]*|,\s*and\s+no\s+new\s+safety\s+signals\s+were\s+identified|\(\s*Table\s+[\w.-]+\s*\)|\s+—\s*supportive\b)`,
);
