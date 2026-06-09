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
 * INTEGRATION NOTES (human must wire):
 *   - This module is PURE. It performs NO persistence and NO audit writes.
 *   - Expectedness: AdverseEvent carries an optional `expectedness` free-text
 *     field (vs the IB / RSI). This service maps it via `isUnexpected()`. If your
 *     intake does not populate `expectedness`, treat the event as expected=unknown
 *     and have a human/medical reviewer confirm before the clock is relied upon.
 *   - "Suspected" is derived from `causality` (WHO-UMC). definite|probable|possible
 *     => reasonable possibility (suspected); unlikely|unrelated => not suspected.
 *     Confirm this maps to your sponsor SOP for causality-to-suspectedness.
 *   - To actually FILE the report: feed `buildAmendmentIntent(...)` output into the
 *     submission-service (create an ectd_sequences row of type 'amendment' + the
 *     submission_leaves) — TODO(persistence): wire to
 *     server/services/submission-service/submission-service.ts (tenant-scoped,
 *     audited). This service deliberately does not import the DB.
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

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

/** The three mutually-exclusive expedited reporting obligations under 312.32(c). */
export type IndSafetyReportObligation =
  | 'SEVEN_DAY' // 312.32(c)(2): unexpected fatal/life-threatening suspected adverse reaction
  | 'FIFTEEN_DAY' // 312.32(c)(1)(i): serious + unexpected + suspected
  | 'NOT_REPORTABLE'; // expected, non-serious, or not suspected (no individual expedited report)

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
    unexpected: boolean;
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
// Core classification — 21 CFR 312.32(c)
// ---------------------------------------------------------------------------

/**
 * Classify a single adverse event against the IND expedited-reporting rules.
 *
 * Decision order (per 312.32(c)):
 *   1. Must be SUSPECTED (reasonable possibility) AND UNEXPECTED to be an
 *      individual expedited IND Safety Report at all — otherwise NOT_REPORTABLE.
 *   2. If also SERIOUS:
 *        a. fatal OR life-threatening => 7-calendar-day (312.32(c)(2)).
 *        b. otherwise               => 15-calendar-day (312.32(c)(1)(i)).
 *   3. Suspected + unexpected but NOT serious => NOT_REPORTABLE as an individual
 *      expedited report (handled via aggregate/annual reporting, 312.33).
 *
 * Pure: no DB, no side effects, deterministic for a given input + clock.
 */
export function classifyIndSafetyReport(
  event: AdverseEvent,
  now: Date = new Date(),
): IndSafetyClassification {
  const serious = isSerious(event);
  const suspected = isSuspected(event.causality);
  const unexpected = isUnexpected(event.expectedness);
  const fatalOrLT = isFatalOrLifeThreatening(event.seriousnessCriteria);

  const determinations = {
    serious,
    suspected,
    unexpected,
    fatalOrLifeThreatening: fatalOrLT,
  };

  // Gate 1: an individual expedited IND Safety Report requires a SUSPECTED and
  // UNEXPECTED adverse reaction. Anything else is not an individual expedited
  // report.
  if (!suspected || !unexpected) {
    const reason = !suspected
      ? 'no reasonable possibility the drug caused the event (not a suspected adverse reaction)'
      : 'event is expected (listed in the IB / consistent with the RSI)';
    return {
      obligation: 'NOT_REPORTABLE',
      reportingWindowDays: null,
      deadline: null,
      determinations,
      regulatoryBasis: '21 CFR 312.32(a)',
      rationale: `Not an individual expedited IND Safety Report: ${reason}.`,
    };
  }

  // Gate 2: suspected + unexpected but non-serious => aggregate/annual, not
  // individual expedited.
  if (!serious) {
    return {
      obligation: 'NOT_REPORTABLE',
      reportingWindowDays: null,
      deadline: null,
      determinations,
      regulatoryBasis: '21 CFR 312.32(c)(1) / 312.33',
      rationale:
        'Suspected and unexpected but non-serious — not individually expedited; captured in the IND annual report (312.33).',
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
  event: AdverseEvent,
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
        `Case (de-identified patient): ${event.patientId}.`,
        `Country of occurrence: ${event.countryOfOccurrence}.`,
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
        `Onset: ${toIsoDate(event.onsetDate)}. Sponsor awareness (clock-start): ${toIsoDate(event.reportDate)}.`,
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
        `Seriousness criterion: ${event.seriousnessCriteria}.`,
        `Causality (WHO-UMC): ${event.causality} — ${classification.determinations.suspected ? 'suspected (reasonable possibility)' : 'not suspected'}.`,
        `Expectedness: ${classification.determinations.unexpected ? 'unexpected' : 'expected'} vs the Reference Safety Information${event.rsiReference ? ` (${event.rsiReference})` : ''}.`,
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
  if (classification.obligation === 'NOT_REPORTABLE') {
    return null;
  }

  const leaves: AmendmentLeafIntent[] = [
    {
      sectionCode: 'm1.12.4',
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
  event: AdverseEvent,
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
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
