/**
 * IND Safety Report Service — 21 CFR 312.32
 *
 * Pure (no-DB) classification + document-model assembly for FDA IND Safety
 * Reports. Given an intake AdverseEvent (and optionally its ICSR), this:
 *
 *   1. Classifies the sponsor's expedited reporting obligation per 21 CFR 312.32(c):
 *        - 7-CALENDAR-DAY:  unexpected fatal OR life-threatening suspected adverse
 *                           reaction (312.32(c)(2)).
 *        - 15-CALENDAR-DAY: serious AND unexpected AND suspected (i.e. there is a
 *                           "reasonable possibility" the drug caused the event)
 *                           (312.32(c)(1)(i)).
 *        - NOT REPORTABLE as an individual expedited IND Safety Report: expected,
 *                           non-serious, or not suspected (no reasonable possibility).
 *        - NOT DETERMINED: expectedness was not assessed. No verdict is given —
 *                           neither "reportable" nor "not reportable" — so an
 *                           unassessed event can neither start a clock nor be
 *                           closed as not reportable (P-20, 2026-10-08).
 *   2. Computes the deadline date by delegating to the canonical
 *      `calculateReportingDeadline` from the pharmacovigilance service (FDA region).
 *   3. Builds a structured IND Safety Report document model (a narrative section
 *      tree) for authoring/assembly.
 *   4. Emits an "amendment submission intent" describing the eCTD placement, typed
 *      against the submissions enums (sequence `type` 'amendment'; leaves into
 *      m1.12.4 cover and m5.3.5 as appropriate, lifecycleOp 'new').
 *
 * Regulatory reference: 21 CFR 312.32 — IND safety reporting. "Suspected adverse
 * reaction" (312.32(a)) means there is a reasonable possibility that the drug
 * caused the event; "unexpected" means not listed in the IB / not consistent in
 * specificity or severity with the Reference Safety Information.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES:
 *   - This module is PURE. It performs NO persistence and NO audit writes.
 *   - Expectedness: AdverseEvent carries an optional `expectedness` free-text
 *     field (vs the IB / RSI). This service maps it via `isUnexpected()`. If your
 *     intake does not populate `expectedness`, treat the event as expected=unknown
 *     and have a human/medical reviewer confirm before the clock is relied upon.
 *   - "Suspected" is derived from `causality` (WHO-UMC). definite|probable|possible
 *     => reasonable possibility (suspected); unlikely|unrelated => not suspected.
 *     Confirm this maps to your sponsor SOP for causality-to-suspectedness.
 *   - Persistence is wired in the sibling modules (this service deliberately does
 *     not import the DB). Tracked drafts: ind-safety-report-persistence
 *     .createSafetyReportDraft persists the classification + document model to
 *     ind_safety_reports (org-scoped + audited; POST
 *     /api/ind-lifecycle/submission/:id/safety-reports). eCTD filing:
 *     ind-lifecycle-persistence.persistSafetyReportIntent feeds
 *     `buildAmendmentIntent(...)` output through submission-service (an
 *     ectd_sequences row of type 'amendment' + the submission_leaves,
 *     tenant-scoped + audited; POST /api/ind-lifecycle/safety-report/file).
 *   - calculateReportingDeadline uses calendar-day arithmetic on reportDate (the
 *     clock-start = sponsor awareness date per 312.32(c)). Ensure `reportDate` is
 *     set to the date the sponsor first received the information.
 *   - Aggregate / "previously submitted" context (312.32(c)(1)(i) analysis of
 *     similar events) must be supplied by the caller as `aggregateContext`.
 *
 * @module server/services/ind-lifecycle/ind-safety-report-service
 */

import {
  calculateReportingDeadline,
  type AdverseEvent,
  type ICSR,
  type Causality,
  type SeriousnessCriteria,
  type RegulatoryRegion,
} from '../compliance/pharmacovigilanceService';
import { IND_SAFETY_REPORT_SECTION } from './ind-sequence-validation';

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

/**
 * The three mutually-exclusive expedited reporting obligations under 312.32(c),
 * and the absence of a verdict. NOT_DETERMINED is not an obligation: it says
 * the determination that decides one (expectedness vs the IB / RSI) has not
 * been made — P-20 (product decision 2026-10-08): "When expectedness is not
 * recorded, the expedited-reporting verdict is 'not determined: expectedness
 * not assessed', never 'not reportable'." Its follow-up decision narrows that to
 * where expectedness decides the outcome: a serious, suspected event. A
 * non-serious or not-suspected event is NOT_REPORTABLE on those stated facts.
 */
export type IndSafetyReportObligation =
  | 'SEVEN_DAY' // 312.32(c)(2): unexpected fatal/life-threatening suspected adverse reaction
  | 'FIFTEEN_DAY' // 312.32(c)(1)(i): serious + unexpected + suspected
  | 'NOT_REPORTABLE' // expected, non-serious, or not suspected (no individual expedited report)
  | 'NOT_DETERMINED'; // serious + suspected, expectedness not assessed — no verdict (P-20)

/**
 * An intake event as the safety-report engine reads it: the AdverseEvent, plus
 * an onset date the person stated explicitly as unknown (P-20). A blank onset
 * is refused; `onsetDateUnknown` is the only way to state that it is not known.
 */
export type IndSafetyEvent = AdverseEvent & { onsetDateUnknown?: boolean };

/** FDA is the only region 312.32 applies to; pinned for clarity. */
const IND_REGION: RegulatoryRegion = 'FDA';

/** Result of classifying an event against 21 CFR 312.32(c). */
export interface IndSafetyClassification {
  obligation: IndSafetyReportObligation;
  /** Calendar-day window (7 or 15); null when NOT_REPORTABLE as an individual report. */
  reportingWindowDays: 7 | 15 | null;
  /** Deadline date (from calculateReportingDeadline), or null when NOT_REPORTABLE. */
  deadline: Date | null;
  /** Derived determinations that drove the classification (auditable rationale). */
  determinations: {
    serious: boolean;
    suspected: boolean;
    /** Null when expectedness was not recorded — never inferred either way (P-20). */
    unexpected: boolean | null;
    /**
     * Whether an expectedness determination was recorded at all. `unexpected`
     * is false both when the reviewer marked the event expected and when no
     * one has assessed it; only the first is a finding.
     */
    expectednessRecorded: boolean;
    fatalOrLifeThreatening: boolean;
  };
  /** The 21 CFR citation that governs this outcome. */
  regulatoryBasis: string;
  /** Human-readable rationale string (one line, for the report header / audit). */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Derivation helpers (pure)
// ---------------------------------------------------------------------------

/**
 * "Serious" per ICH E2A / 312.32(a). Any of the qualifying seriousness criteria
 * makes an event serious. The intake model always carries one criterion; a
 * non-serious AE is conveyed via eventType === 'AE' (it has no serious flag),
 * so we treat eventType 'AE' as non-serious and SAE/SUSAR/AESI as serious.
 */
export function isSerious(event: Pick<AdverseEvent, 'eventType'>): boolean {
  return event.eventType !== 'AE';
}

/**
 * "Suspected adverse reaction" per 312.32(a): a reasonable possibility that the
 * drug caused the event. Mapped from WHO-UMC causality.
 */
export function isSuspected(causality: Causality): boolean {
  return causality === 'definite' || causality === 'probable' || causality === 'possible';
}

/**
 * "Unexpected" per 312.32(a): not listed in the IB / not consistent with the RSI.
 * Derived from the optional free-text `expectedness` field. When the field is
 * absent or ambiguous we conservatively return false (treat as expected) so the
 * clock is never STARTED on an unconfirmed determination — the medical reviewer
 * must affirmatively mark "unexpected" for expedited reporting. See INTEGRATION
 * NOTES.
 */
export function isUnexpected(expectedness: string | null | undefined): boolean {
  if (!expectedness) return false;
  const v = expectedness.trim().toLowerCase();
  // Affirmative "unexpected" / "not listed" wording starts the clock.
  if (v.includes('unexpected') || v.includes('not listed') || v.includes('unlisted')) {
    return true;
  }
  // Explicit "expected" / "listed" wording => expected.
  return false;
}

/** Fatal or life-threatening per the seriousness criterion (312.32(c)(2)). */
export function isFatalOrLifeThreatening(criteria: SeriousnessCriteria): boolean {
  return criteria === 'death' || criteria === 'life_threatening';
}

// ---------------------------------------------------------------------------
// What the person must state — nothing regulated is assumed
// ---------------------------------------------------------------------------

/* QA 2026-10-08 (j7). The intake card posted SAE / death / definite /
   recovered for selects nobody touched, and this service classified and
   printed them. An absent awareness date fell through to
   calculateReportingDeadline's `reportDate = new Date()` default (a clock
   started today), and an absent onset date threw from toISOString (HTTP 500).
   The engine now refuses an event whose determinations or dates were not
   stated, naming each one, before anything is classified. */
const EVENT_TYPE_VALUES = ['AE', 'SAE', 'SUSAR', 'AESI'] as const;
const SERIOUSNESS_VALUES = ['death', 'life_threatening', 'hospitalization', 'disability', 'congenital_anomaly', 'medically_important'] as const;
const CAUSALITY_VALUES = ['definite', 'probable', 'possible', 'unlikely', 'unrelated'] as const;
const OUTCOME_VALUES = ['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown'] as const;

/** The refusal: code VALIDATION is what the lifecycle routes answer as 400. */
export class IndSafetyReportIncompleteError extends Error {
  readonly code = 'VALIDATION';
  constructor(public readonly missingFields: string[]) {
    super(
      `The IND safety report cannot be assembled until these are stated: ${missingFields.join('; ')}. ` +
        'Nothing is assumed for a field left blank.',
    );
    this.name = 'IndSafetyReportIncompleteError';
  }
}

const isValidDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/**
 * The determinations and dates the person has not stated (or stated outside
 * the enum), as reader-facing names. Empty exactly when the event can be
 * classified without assuming anything. A non-serious AE carries no
 * seriousness criterion, so none is required of it.
 */
export function unstatedSafetyReportFields(event: Partial<IndSafetyEvent>): string[] {
  const missing: string[] = [];
  const oneOf = (v: unknown, values: readonly string[], name: string) => {
    if (typeof v !== 'string' || v.trim() === '') missing.push(name);
    else if (!values.includes(v)) missing.push(`${name} ("${v}" is not one of ${values.join(', ')})`);
  };
  oneOf(event.eventType, EVENT_TYPE_VALUES, 'event type');
  if (event.eventType !== 'AE') oneOf(event.seriousnessCriteria, SERIOUSNESS_VALUES, 'seriousness criterion (ICH E2A)');
  oneOf(event.causality, CAUSALITY_VALUES, 'causality (WHO-UMC)');
  oneOf(event.outcome, OUTCOME_VALUES, 'outcome');
  // P-20: a date, or explicitly unknown; a blank is refused, and both at once
  // is refused rather than resolved on the person's behalf.
  const onsetUnknown = event.onsetDateUnknown === true;
  if (onsetUnknown && isValidDate(event.onsetDate)) missing.push('onset date (stated both as a date and as unknown — state one)');
  else if (!onsetUnknown && !isValidDate(event.onsetDate)) missing.push('onset date (a date, or stated as unknown)');
  if (!isValidDate(event.reportDate)) missing.push('sponsor awareness date (clock start)');
  return missing;
}

function assertStated(event: IndSafetyEvent): void {
  const missing = unstatedSafetyReportFields(event);
  if (missing.length > 0) throw new IndSafetyReportIncompleteError(missing);
}

// ---------------------------------------------------------------------------
// Core classification — 21 CFR 312.32(c)
// ---------------------------------------------------------------------------

/**
 * The verdict for an event that is not suspected, or not serious, on those
 * stated facts (P-20 follow-up, 2026-10-08). A not-suspected event (312.32(a):
 * no reasonable possibility) and a non-serious one (312.32(c)(1)) are not
 * expedited whatever the IB / RSI says, so "not determined" would withhold a
 * verdict the stated facts give. The rationale names those facts and says
 * expectedness was not needed for it; nothing is inferred about expectedness
 * (`unexpected` stays null when it was not recorded).
 */
function notExpeditedOnStatedFacts(
  event: IndSafetyEvent,
  determinations: IndSafetyClassification['determinations'],
): IndSafetyClassification {
  const { suspected, serious, expectednessRecorded, unexpected } = determinations;
  const base = { obligation: 'NOT_REPORTABLE' as const, reportingWindowDays: null, deadline: null, determinations };
  // A recorded expectedness keeps the existing wording for this case.
  if (expectednessRecorded && suspected && !serious && unexpected) {
    return {
      ...base,
      regulatoryBasis: '21 CFR 312.32(c)(1) / 312.33',
      rationale:
        'Suspected and unexpected but non-serious — not individually expedited; captured in the IND annual report (312.33).',
    };
  }
  const facts: string[] = [];
  if (!suspected) {
    facts.push(
      `no reasonable possibility the drug caused the event (causality stated as ${event.causality}: not a suspected adverse reaction)`,
    );
  }
  if (!serious) facts.push('the event is recorded as non-serious');
  const expectednessNote = expectednessRecorded ? '' : ' Expectedness is not recorded; it does not change this verdict.';
  return {
    ...base,
    regulatoryBasis: suspected ? '21 CFR 312.32(c)(1) / 312.33' : '21 CFR 312.32(a)',
    rationale: `Not an individual expedited IND Safety Report on the stated facts: ${facts.join('; ')}.${expectednessNote}`,
  };
}

/**
 * Classify a single adverse event against the IND expedited-reporting rules.
 *
 * Decision order (per 312.32(c)):
 *   1. NOT SUSPECTED (no reasonable possibility) or NOT SERIOUS => NOT_REPORTABLE
 *      as an individual expedited report, on those stated facts, whether or not
 *      expectedness was recorded (a suspected, unexpected, non-serious reaction
 *      goes to aggregate/annual reporting, 312.33).
 *   2. Serious and suspected with expectedness NOT RECORDED => NOT_DETERMINED:
 *      expectedness decides the outcome, and nobody has assessed it (P-20).
 *   3. Serious and suspected but EXPECTED => NOT_REPORTABLE.
 *   4. Serious, suspected and UNEXPECTED:
 *        a. fatal OR life-threatening => 7-calendar-day (312.32(c)(2)).
 *        b. otherwise               => 15-calendar-day (312.32(c)(1)(i)).
 *
 * Pure: no DB, no side effects, deterministic for a given input + clock.
 * Throws IndSafetyReportIncompleteError (code VALIDATION) when a determination
 * or date was not stated — see unstatedSafetyReportFields.
 */
export function classifyIndSafetyReport(
  event: IndSafetyEvent,
  now: Date = new Date(),
): IndSafetyClassification {
  assertStated(event);
  const serious = isSerious(event);
  const suspected = isSuspected(event.causality);
  const expectednessRecorded = typeof event.expectedness === 'string' && event.expectedness.trim().length > 0;
  const unexpected = expectednessRecorded ? isUnexpected(event.expectedness) : null;
  const fatalOrLT = isFatalOrLifeThreatening(event.seriousnessCriteria);

  const determinations = {
    serious,
    suspected,
    unexpected,
    expectednessRecorded,
    fatalOrLifeThreatening: fatalOrLT,
  };

  // Gate 0 (P-20 follow-up, 2026-10-08): a stated fact that rules out an
  // individual expedited report decides the verdict without expectedness.
  if (!suspected || !serious) return notExpeditedOnStatedFacts(event, determinations);

  // Gate 1 (P-20, 2026-10-08): for a serious, suspected event expectedness
  // decides the outcome, and with it not recorded there is no verdict. It used
  // to read NOT_REPORTABLE ("not an individual expedited report"), which closes
  // a case nobody assessed against the IB / RSI — and a reviewer reading "not
  // reportable" has no reason to look again before the 15-day clock that may
  // already be running.
  if (!expectednessRecorded) {
    return {
      obligation: 'NOT_DETERMINED',
      reportingWindowDays: null,
      deadline: null,
      determinations,
      regulatoryBasis: '21 CFR 312.32(a)',
      rationale:
        'Not determined: expectedness not assessed. No determination against the IB / Reference Safety Information has been recorded, ' +
        'so whether this is an expedited IND safety report cannot be decided. Record expectedness to obtain a verdict.',
    };
  }

  // Gate 2: a serious, suspected event recorded as EXPECTED (listed in the IB /
  // consistent with the RSI) is not an individual expedited report.
  if (!unexpected) {
    return {
      obligation: 'NOT_REPORTABLE',
      reportingWindowDays: null,
      deadline: null,
      determinations,
      regulatoryBasis: '21 CFR 312.32(a)',
      rationale: 'Not an individual expedited IND Safety Report: event is expected (listed in the IB / consistent with the RSI).',
    };
  }

  // Serious + suspected + unexpected => expedited.
  if (fatalOrLT) {
    return {
      obligation: 'SEVEN_DAY',
      reportingWindowDays: 7,
      deadline: calculateReportingDeadline(
        event.eventType,
        event.seriousnessCriteria,
        IND_REGION,
        event.reportDate,
      ),
      determinations,
      regulatoryBasis: '21 CFR 312.32(c)(2)',
      rationale:
        'Unexpected fatal or life-threatening suspected adverse reaction — 7-calendar-day IND Safety Report.',
    };
  }

  return {
    obligation: 'FIFTEEN_DAY',
    reportingWindowDays: 15,
    deadline: calculateReportingDeadline(
      event.eventType,
      event.seriousnessCriteria,
      IND_REGION,
      event.reportDate,
    ),
    determinations,
    regulatoryBasis: '21 CFR 312.32(c)(1)(i)',
    rationale:
      'Serious, unexpected suspected adverse reaction — 15-calendar-day IND Safety Report.',
  };
}

// ---------------------------------------------------------------------------
// IND Safety Report document model (narrative section tree)
// ---------------------------------------------------------------------------

/** A node in the IND Safety Report narrative tree. */
export interface IndSafetyReportSection {
  /** Stable key for the section (used by authoring/assembly). */
  key: string;
  heading: string;
  /** Narrative body (may be empty when authored later). */
  body: string;
  children?: IndSafetyReportSection[];
}

/** Aggregate / previously-reported context the caller supplies (312.32(c)(1)(i)). */
export interface AggregateContext {
  /** Number of similar suspected adverse reactions previously observed. */
  similarEventCount?: number;
  /** Brief sponsor analysis of whether the events, in aggregate, change the risk profile. */
  aggregateAnalysis?: string;
  /** References to prior IND Safety Reports for the same reaction. */
  priorReportIds?: string[];
}

/* An identifier the person did not enter is an explicit gap, like the other
   placeholders in the report — it printed the word "undefined" (QA
   2026-10-08, j7). */
function statedOrGap(v: unknown): string {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '[to be completed]';
}

/* A non-serious AE carries no seriousness criterion; the report says so
   rather than printing an absent value. */
function seriousnessLine(event: AdverseEvent): string {
  return event.seriousnessCriteria
    ? `Seriousness criterion: ${event.seriousnessCriteria}.`
    : 'Seriousness criterion: none — non-serious adverse event.';
}

/* Expectedness is optional on intake; when nobody recorded it the report says
   so rather than asserting "expected" on the reviewer's behalf. */
function expectednessLine(event: IndSafetyEvent, classification: IndSafetyClassification): string {
  if (!classification.determinations.expectednessRecorded) {
    return 'Expectedness: not recorded — no determination against the Reference Safety Information has been made.';
  }
  const verdict = classification.determinations.unexpected ? 'unexpected' : 'expected';
  return `Expectedness: ${verdict} vs the Reference Safety Information${event.rsiReference ? ` (${event.rsiReference})` : ''}.`;
}

/** The full structured IND Safety Report document model. */
export interface IndSafetyReportDocument {
  reportType: 'IND_SAFETY_REPORT';
  obligation: IndSafetyReportObligation;
  classification: IndSafetyClassification;
  /** FDA Form 3500A (MedWatch) / E2B(R3) backing identifiers, if known. */
  caseReference: {
    adverseEventId: string;
    icsrWorldwideUniqueId: string | null;
    organizationId: string;
    projectId: string;
  };
  sections: IndSafetyReportSection[];
}

/**
 * Build the structured IND Safety Report document model from an event,
 * its classification, optional ICSR, and caller-supplied aggregate context.
 * Pure / deterministic. Narrative bodies are pre-filled from intake fields
 * where available; authors complete the remainder.
 */
export function buildIndSafetyReportDocument(
  event: IndSafetyEvent,
  classification: IndSafetyClassification,
  options: { icsr?: ICSR | null; aggregateContext?: AggregateContext } = {},
): IndSafetyReportDocument {
  const { icsr = null, aggregateContext = {} } = options;

  const sections: IndSafetyReportSection[] = [
    {
      key: 'identification',
      heading: 'Identification',
      body: [
        `IND Safety Report (${labelForObligation(classification.obligation)}).`,
        `Regulatory basis: ${classification.regulatoryBasis}.`,
        icsr?.worldwideUniqueId ? `ICSR worldwide unique ID: ${icsr.worldwideUniqueId}.` : '',
        `Case (de-identified patient): ${statedOrGap(event.patientId)}.`,
        `Country of occurrence: ${statedOrGap(event.countryOfOccurrence)}.`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      key: 'description_of_event',
      heading: 'Description of the Adverse Event',
      body: [
        event.eventDescription,
        event.reactionPt ? `MedDRA PT: ${event.reactionPt}${event.reactionPtCode ? ` (${event.reactionPtCode})` : ''}.` : '',
        event.reactionSoc ? `SOC: ${event.reactionSoc}.` : '',
        `Onset: ${onsetText(event)}. Sponsor awareness (clock-start): ${toIsoDate(event.reportDate)}.`,
        event.narrative ?? '',
      ]
        .filter(Boolean)
        .join(' '),
      children: [
        {
          key: 'suspect_product',
          heading: 'Suspect Product',
          body: [
            event.suspectProduct ? `Product: ${event.suspectProduct}.` : 'Product: [to be completed].',
            event.suspectProductStrength ? `Strength: ${event.suspectProductStrength}.` : '',
            event.suspectProductDose ? `Dose: ${event.suspectProductDose}.` : '',
            event.suspectProductRoute ? `Route: ${event.suspectProductRoute}.` : '',
          ]
            .filter(Boolean)
            .join(' '),
        },
      ],
    },
    {
      key: 'assessment',
      heading: 'Assessment of Causality and Expectedness',
      body: [
        seriousnessLine(event),
        `Causality (WHO-UMC): ${event.causality} — ${classification.determinations.suspected ? 'suspected (reasonable possibility)' : 'not suspected'}.`,
        expectednessLine(event, classification),
        `Outcome: ${event.outcome}.`,
        classification.rationale,
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      key: 'action_taken',
      heading: 'Action Taken',
      body: '[Action taken with the study drug and any changes to the protocol, IB, or informed consent — to be completed by the sponsor.]',
    },
    {
      key: 'sponsor_analysis',
      heading: 'Sponsor Analysis',
      body: aggregateContext.aggregateAnalysis
        ? aggregateContext.aggregateAnalysis
        : '[Sponsor analysis of the significance of this finding for the safety of the investigational drug — to be completed.]',
    },
    {
      key: 'aggregate_context',
      heading: 'Aggregate Context (Previously Reported Similar Events)',
      body: [
        typeof aggregateContext.similarEventCount === 'number'
          ? `Similar suspected adverse reactions previously observed: ${aggregateContext.similarEventCount}.`
          : 'Similar suspected adverse reactions previously observed: [to be completed].',
        aggregateContext.priorReportIds && aggregateContext.priorReportIds.length > 0
          ? `Prior IND Safety Reports: ${aggregateContext.priorReportIds.join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
  ];

  return {
    reportType: 'IND_SAFETY_REPORT',
    obligation: classification.obligation,
    classification,
    caseReference: {
      adverseEventId: event.id,
      icsrWorldwideUniqueId: icsr?.worldwideUniqueId ?? null,
      organizationId: event.organizationId,
      projectId: event.projectId,
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// Amendment submission intent (eCTD placement) — typed vs submissions enums
// ---------------------------------------------------------------------------

/**
 * eCTD sequence `type` literal — REUSED from shared/schema/submissions.ts
 * ectdSequences.type comment (original|amendment|response|variation|annual|withdrawal).
 */
export type EctdSequenceType =
  | 'original'
  | 'amendment'
  | 'response'
  | 'variation'
  | 'annual'
  | 'withdrawal';

/**
 * Leaf lifecycle operation — REUSED from submissionLeaves.lifecycleOp comment
 * (new|replace|append|delete).
 */
export type LeafLifecycleOp = 'new' | 'replace' | 'append' | 'delete';

/** A planned eCTD leaf (maps 1:1 to a future submission_leaves row). */
export interface AmendmentLeafIntent {
  /** CTD section code, e.g. 'm1.12.4' (cover/safety report) or 'm5.3.5'. */
  sectionCode: string;
  title: string;
  granularity: string | null;
  lifecycleOp: LeafLifecycleOp;
  /** Classifier hint for pathway leaf→slot matching. */
  documentType: string;
}

/**
 * The "amendment submission intent" — a planning object describing WHERE this
 * IND Safety Report goes in the eCTD, typed against the submissions enums. The
 * human/submission-service consumes this to create the ectd_sequences +
 * submission_leaves rows (see INTEGRATION NOTES).
 */
export interface IndSafetyReportAmendmentIntent {
  /** Always 'amendment' for an IND Safety Report filing. */
  sequenceType: EctdSequenceType;
  region: 'fda';
  /** Lifecycle stage on the parent submission this drives (submissions.lifecycleStage). */
  lifecycleStage: 'amendment';
  /** The obligation that triggered this intent (for the cover letter / scheduling). */
  obligation: IndSafetyReportObligation;
  deadline: Date | null;
  leaves: AmendmentLeafIntent[];
  /** Free-text note for the cover letter. */
  note: string;
}

/**
 * Build the amendment submission intent for an IND Safety Report.
 *
 * Placement (FDA eCTD, Module 1 regional + Module 5 clinical):
 *   - m1.12.4  : the IND Safety Report itself + cover correspondence (Module 1
 *                US regional, safety reports). Always present, lifecycleOp 'new'.
 *   - m5.3.5   : the CIOMS / E2B narrative (reports of postmarketing / clinical
 *                safety experience) — included when an ICSR backs the case.
 *
 * Returns null when the event is NOT_REPORTABLE (no individual amendment).
 * Pure / deterministic.
 */
export function buildAmendmentIntent(
  classification: IndSafetyClassification,
  options: { hasIcsr?: boolean } = {},
): IndSafetyReportAmendmentIntent | null {
  // No individual report: not reportable, or no verdict yet (P-20).
  if (classification.obligation === 'NOT_REPORTABLE' || classification.obligation === 'NOT_DETERMINED') {
    return null;
  }

  const leaves: AmendmentLeafIntent[] = [
    {
      // The sequence validator requires the report at this same placement.
      sectionCode: IND_SAFETY_REPORT_SECTION,
      title: `IND Safety Report — ${labelForObligation(classification.obligation)}`,
      granularity: 'leaf',
      lifecycleOp: 'new',
      documentType: 'ind_safety_report',
    },
  ];

  if (options.hasIcsr) {
    leaves.push({
      sectionCode: 'm5.3.5',
      title: 'Individual Case Safety Report narrative (CIOMS / E2B)',
      granularity: 'leaf',
      lifecycleOp: 'new',
      documentType: 'icsr_narrative',
    });
  }

  return {
    sequenceType: 'amendment',
    region: 'fda',
    lifecycleStage: 'amendment',
    obligation: classification.obligation,
    deadline: classification.deadline,
    leaves,
    note: `${labelForObligation(classification.obligation)} IND Safety Report per ${classification.regulatoryBasis}. ${classification.rationale}`,
  };
}

// ---------------------------------------------------------------------------
// Convenience: one-shot classify + assemble
// ---------------------------------------------------------------------------

/** Full pipeline result for a single event. */
export interface IndSafetyReportResult {
  classification: IndSafetyClassification;
  document: IndSafetyReportDocument;
  amendmentIntent: IndSafetyReportAmendmentIntent | null;
}

/**
 * Classify an event, build its document model, and produce the amendment intent
 * in one call. Pure / deterministic.
 */
export function assembleIndSafetyReport(
  event: IndSafetyEvent,
  options: { icsr?: ICSR | null; aggregateContext?: AggregateContext; now?: Date } = {},
): IndSafetyReportResult {
  const classification = classifyIndSafetyReport(event, options.now);
  const document = buildIndSafetyReportDocument(event, classification, {
    icsr: options.icsr ?? null,
    aggregateContext: options.aggregateContext,
  });
  const amendmentIntent = buildAmendmentIntent(classification, {
    hasIcsr: Boolean(options.icsr),
  });
  return { classification, document, amendmentIntent };
}

// ---------------------------------------------------------------------------
// Local helpers (pure)
// ---------------------------------------------------------------------------

function labelForObligation(o: IndSafetyReportObligation): string {
  switch (o) {
    case 'SEVEN_DAY':
      return '7-calendar-day';
    case 'FIFTEEN_DAY':
      return '15-calendar-day';
    case 'NOT_REPORTABLE':
      return 'not individually reportable';
    case 'NOT_DETERMINED':
      return 'not determined: expectedness not assessed';
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The onset as the person stated it: a date, or explicitly unknown (P-20). */
function onsetText(event: IndSafetyEvent): string {
  return event.onsetDateUnknown === true ? 'unknown (stated as unknown)' : toIsoDate(event.onsetDate);
}
