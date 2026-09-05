/**
 * E2B(R3) ICSR composer — 21 CFR 312.32 individual case → ICH E2B(R3) elements.
 *
 * An IND Safety Report (7-/15-day) reaches FDA (FAERS) as an Individual Case
 * Safety Report. `ind-safety-report-service` classifies the 312.32 obligation;
 * this service turns the same intake `AdverseEvent` (+ optional `ICSR` envelope
 * metadata) into the structured ICH E2B(R3) data elements and a deterministic,
 * escaped XML projection keyed by the official E2B(R3) element identifiers
 * (C.1.* case admin, C.2.* primary source, D.* patient, E.i.* reaction,
 * G.k.* drug, H.1 narrative).
 *
 * HONESTY NOTE: this emits the E2B(R3) *data-element projection* — the elements
 * carry their canonical E2B(R3) identifiers so the case is gateway-ready and
 * QC-able — not the full HL7 V3 ICSR transport envelope (batch wrapper / OIDs),
 * which the dispatch gateway adds. The H.1 narrative is composed by the shared
 * deterministic safety-narrative writer (never invents clinical detail), and a
 * completeness report surfaces a missing mandatory element before transmit.
 *
 * The tracked mandatory set is a minimum data set, not the full E2B(R3)
 * mandatory-element list: C.1.1, C.1.3, C.1.8.1, C.2.r.4, D.1, E.i.1.1a,
 * G.k.2.2, H.1, C.5.1.r.1 for a study report, and C.1.11.2 for a
 * nullification. `completeness` and `transmitReady` speak to that set only.
 *
 * Pure / deterministic — no DB, no side effects.
 *
 * @module server/services/ind-lifecycle/e2b-icsr-composer
 */

import type {
  AdverseEvent,
  ICSR,
  SeriousnessCriteria,
  Outcome,
  ReporterType,
} from '../compliance/pharmacovigilanceService';
import { composeSafetyNarrative } from '../ana/safety-narrative';
import { escapeXml } from './ind-ectd-envelope';

// ---------------------------------------------------------------------------
// E2B(R3) controlled-vocabulary mappings (ICH ICSR Implementation Guide)
// ---------------------------------------------------------------------------

/** E.i.7 Outcome of the reaction/event at the time of last observation. */
const OUTCOME_CODE: Record<Outcome, { code: string; meaning: string }> = {
  recovered: { code: '1', meaning: 'recovered/resolved' },
  recovering: { code: '2', meaning: 'recovering/resolving' },
  not_recovered: { code: '3', meaning: 'not recovered/not resolved' },
  fatal: { code: '5', meaning: 'fatal' },
  unknown: { code: '6', meaning: 'unknown' },
};

/** E.i.3.2 seriousness flags — each criterion maps to one E2B element id. */
const SERIOUSNESS_ELEMENT: Record<SeriousnessCriteria, { id: string; label: string }> = {
  death: { id: 'E.i.3.2a', label: 'Results in death' },
  life_threatening: { id: 'E.i.3.2b', label: 'Life threatening' },
  hospitalization: { id: 'E.i.3.2c', label: 'Caused/prolonged hospitalisation' },
  disability: { id: 'E.i.3.2d', label: 'Disabling/incapacitating' },
  congenital_anomaly: { id: 'E.i.3.2e', label: 'Congenital anomaly/birth defect' },
  medically_important: { id: 'E.i.3.2f', label: 'Other medically important condition' },
};

/** C.2.r.4 Qualification of the primary source reporter. */
const REPORTER_QUALIFICATION: Record<ReporterType, { code: string; meaning: string }> = {
  investigator: { code: '1', meaning: 'Physician' },
  healthcare_provider: { code: '3', meaning: 'Other health professional' },
  sponsor: { code: '3', meaning: 'Other health professional' },
  patient: { code: '5', meaning: 'Consumer or other non health professional' },
};

// ---------------------------------------------------------------------------
// Structured E2B(R3) element model
// ---------------------------------------------------------------------------

/** One E2B(R3) data element: its canonical id, a human label, and the value. */
export interface E2bElement {
  id: string;
  label: string;
  value: string;
}

/** The structured E2B(R3) ICSR, grouped by the E2B section letters. */
export interface E2bIcsr {
  /** C.1 — case safety report identification + admin. */
  caseAdmin: E2bElement[];
  /** C.2 — primary source(s) of the information. */
  primarySource: E2bElement[];
  /** D — patient characteristics (de-identified). */
  patient: E2bElement[];
  /** E.i — reaction(s)/event(s), including seriousness + outcome. */
  reaction: E2bElement[];
  /** G.k — suspect drug information. */
  drug: E2bElement[];
  /** H.1 — case narrative (composed by the shared safety-narrative writer). */
  narrative: E2bElement;
}

/** A mandatory E2B(R3) element that was not populated from the intake. */
export interface E2bGap {
  id: string;
  label: string;
}

export interface E2bIcsrResult {
  icsr: E2bIcsr;
  /** Deterministic, escaped XML projection keyed by E2B(R3) element ids. */
  xml: string;
  /** Mandatory elements that could not be populated — resolve before transmit. */
  gaps: E2bGap[];
  /** 0..1 fraction of the tracked mandatory elements that are populated. */
  completeness: number;
  /** Report lifecycle stage (from the ICSR envelope; defaults to 'initial'). */
  lifecycle: ICSR['icsrType'];
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function isoDate(d: Date | string | undefined | null): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function isoDateTime(d: Date | string | undefined | null): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** C.1.3 Type of report — ICH E2B(R3) codes. Unknown or absent stays empty and is a gap. */
const REPORT_TYPE_CODE: Record<string, string> = {
  spontaneous: '1 (spontaneous report)',
  '1': '1 (spontaneous report)',
  study: '2 (report from study)',
  '2': '2 (report from study)',
  other: '3 (other)',
  '3': '3 (other)',
  literature: '4 (not available to sender (unknown))',
  unknown: '4 (not available to sender (unknown))',
  '4': '4 (not available to sender (unknown))',
};


/**
 * Compose the E2B(R3) ICSR data elements from an intake adverse event and the
 * optional ICSR transport metadata.
 *
 * Handles the report lifecycle via `icsr.icsrType` (C.1.* admin):
 *   - initial      — first transmission of the case.
 *   - follow_up    — a new version carrying updated information; the worldwide
 *                    unique id (C.1.8.1) is stable and C.1.5 reflects the most
 *                    recent information date.
 *   - nullification— the case was sent in error / is invalid; C.1.11.1 marks it
 *                    a nullification and C.1.11.2 carries the (mandatory) reason.
 *
 * @param event   the intake AdverseEvent (dates may be Date or ISO strings)
 * @param options icsr — ICSR envelope metadata (worldwide id, type, sender);
 *                expedited — whether the case is expedited-reportable (C.1.7);
 *                nullificationReason — C.1.11.2 (required when nullifying);
 *                mostRecentInfoDate — C.1.5 (defaults to the report date);
 *                now — creation timestamp (defaults to current time)
 */
export function composeE2bR3Icsr(
  event: AdverseEvent,
  options: {
    /**
     * ICSR envelope metadata. `reporterCountry` (C.2.r.3) and
     * `studyRegistrationNumber` (C.5.1.r.1) are carried here because the
     * intake AdverseEvent has no field for either.
     */
    icsr?: (Partial<ICSR> & { reporterCountry?: string | null; studyRegistrationNumber?: string | null }) | null;
    expedited?: boolean;
    nullificationReason?: string;
    mostRecentInfoDate?: Date | string;
    now?: Date;
  } = {},
): E2bIcsrResult {
  const { icsr = null, expedited, nullificationReason, mostRecentInfoDate, now = new Date() } = options;

  const reporterQual = REPORTER_QUALIFICATION[event.reporterType];
  const outcome = OUTCOME_CODE[event.outcome];
  const seriousness = SERIOUSNESS_ELEMENT[event.seriousnessCriteria];
  // C.1.7: prefer the explicit option; fall back to the intake flag.
  const isExpedited = typeof expedited === 'boolean' ? expedited : event.expeditedReportRequired;
  // Report lifecycle stage (C.1.* admin). Defaults to an initial report.
  const lifecycle = icsr?.icsrType ?? 'initial';
  const isNullification = lifecycle === 'nullification';
  const reportTypeCode = REPORT_TYPE_CODE[String(icsr?.reportType ?? '').trim().toLowerCase()] ?? '';
  const isStudyReport = reportTypeCode.startsWith('2');
  const studyRegistration = icsr?.studyRegistrationNumber?.trim() ?? '';

  const caseAdmin: E2bElement[] = [
    { id: 'C.1.1', label: "Sender's safety report unique identifier", value: event.id },
    { id: 'C.1.2', label: 'Date of creation', value: isoDateTime(now) },
    // C.1.3 from the case. This was the constant '2 (report from study)' for
    // every ICSR, spontaneous and literature reports included.
    { id: 'C.1.3', label: 'Type of report', value: reportTypeCode },
    { id: 'C.1.4', label: 'Date report was first received from source', value: isoDate(event.reportDate) },
    { id: 'C.1.5', label: 'Date of most recent information', value: isoDate(mostRecentInfoDate ?? event.reportDate) },
    { id: 'C.1.7', label: 'Fulfils local criteria for an expedited report', value: isExpedited ? '1 (Yes)' : '2 (No)' },
    { id: 'C.1.8.1', label: 'Worldwide unique case identification number', value: icsr?.worldwideUniqueId ?? '' },
    { id: 'C.1.8.2', label: 'First sender of this case', value: icsr?.senderType === 'regulatory_authority' ? '1 (Regulator)' : '2 (Other)' },
    // C.5.1.r.1 — the study a study report arose from; mandatory when C.1.3 is a study report.
    ...(isStudyReport ? [{ id: 'C.5.1.r.1', label: 'Study registration number', value: studyRegistration }] : []),
    // C.1.11 — report nullification/amendment (only emitted for a nullification).
    ...(isNullification
      ? [
          { id: 'C.1.11.1', label: 'Report nullification / amendment', value: '1 (Nullification)' },
          { id: 'C.1.11.2', label: 'Reason for nullification / amendment', value: nullificationReason ?? '' },
        ]
      : []),
  ];

  const primarySource: E2bElement[] = [
    { id: 'C.2.r.1.1', label: 'Reporter name', value: event.reporterName ?? '' },
    // The reporter's country, not the country the event occurred in: that is
    // E.i.9 below. countryOfOccurrence used to be emitted under this label.
    { id: 'C.2.r.3', label: "Reporter's country code", value: icsr?.reporterCountry?.trim() ?? '' },
    { id: 'C.2.r.4', label: 'Qualification', value: reporterQual ? `${reporterQual.code} (${reporterQual.meaning})` : '' },
    { id: 'C.2.r.5', label: 'Primary source for regulatory purposes', value: '1 (Yes)' },
  ];

  const patient: E2bElement[] = [
    { id: 'D.1', label: 'Patient (de-identified identifier)', value: event.patientId },
  ];

  const reaction: E2bElement[] = [
    { id: 'E.i.1.1a', label: 'Reaction/event (reported term)', value: event.reactionPt ?? event.eventDescription },
    { id: 'E.i.2.1b', label: 'Reaction/event (MedDRA PT code)', value: event.reactionPtCode ?? '' },
    { id: 'E.i.4', label: 'Date of start of reaction/event', value: isoDate(event.onsetDate) },
    { id: seriousness.id, label: seriousness.label, value: '1 (Yes)' },
    { id: 'E.i.7', label: 'Outcome of reaction/event at last observation', value: `${outcome.code} (${outcome.meaning})` },
    { id: 'E.i.9', label: 'Identification of the country where the reaction/event occurred', value: event.countryOfOccurrence ?? '' },
  ];

  const drug: E2bElement[] = [
    { id: 'G.k.1', label: 'Characterisation of drug role', value: '1 (Suspect)' },
    { id: 'G.k.2.2', label: 'Medicinal product name (reported)', value: event.suspectProduct ?? '' },
    { id: 'G.k.4.r.1a', label: 'Dose (number)', value: event.suspectProductDose ?? '' },
    { id: 'G.k.4.r.10.2a', label: 'Route of administration', value: event.suspectProductRoute ?? '' },
  ];

  const narrativeText = composeSafetyNarrative({
    subjectId: event.patientId,
    studyId: event.projectId,
    studyDrug: event.suspectProduct ?? undefined,
    dose: event.suspectProductDose ?? undefined,
    firstDoseDate: undefined,
    event: {
      term: event.reactionPt ?? event.eventDescription,
      onsetDate: isoDate(event.onsetDate) || undefined,
      seriousnessCriteria: [seriousness.label],
      causality: event.causality,
      outcome: outcome.meaning,
      notes: event.narrative ?? undefined,
    },
  }).narrative;

  const narrative: E2bElement = {
    id: 'H.1',
    label: 'Case narrative including clinical course, therapeutic measures, outcome',
    value: narrativeText,
  };

  const icsrModel: E2bIcsr = { caseAdmin, primarySource, patient, reaction, drug, narrative };

  // Mandatory E2B(R3) minimum-data-set elements we track for completeness.
  const mandatory: Array<{ id: string; label: string; value: string }> = [
    { id: 'C.1.1', label: "Sender's safety report unique identifier", value: event.id },
    { id: 'C.1.3', label: 'Type of report', value: reportTypeCode },
    { id: 'C.1.8.1', label: 'Worldwide unique case identification number', value: icsr?.worldwideUniqueId ?? '' },
    { id: 'C.2.r.4', label: 'Reporter qualification', value: reporterQual ? reporterQual.code : '' },
    ...(isStudyReport ? [{ id: 'C.5.1.r.1', label: 'Study registration number', value: studyRegistration }] : []),
    { id: 'D.1', label: 'Patient (identifier)', value: event.patientId },
    { id: 'E.i.1.1a', label: 'Reaction/event term', value: event.reactionPt ?? event.eventDescription },
    { id: 'G.k.2.2', label: 'Suspect medicinal product name', value: event.suspectProduct ?? '' },
    { id: 'H.1', label: 'Case narrative', value: narrativeText },
    // A nullification is invalid without its reason (C.1.11.2).
    ...(isNullification
      ? [{ id: 'C.1.11.2', label: 'Reason for nullification', value: nullificationReason ?? '' }]
      : []),
  ];
  const gaps: E2bGap[] = mandatory.filter((m) => !m.value || m.value.trim() === '').map((m) => ({ id: m.id, label: m.label }));
  const completeness = (mandatory.length - gaps.length) / mandatory.length;

  return { icsr: icsrModel, xml: serializeE2bXml(icsrModel), gaps, completeness, lifecycle };
}

// ---------------------------------------------------------------------------
// XML projection (escaped, deterministic)
// ---------------------------------------------------------------------------

function elementXml(e: E2bElement, indent: string): string {
  // Skip empty optional values to keep the projection clean; mandatory gaps are
  // surfaced separately via `gaps`.
  if (e.value === undefined || e.value === null || e.value === '') return '';
  return `${indent}<element id="${escapeXml(e.id)}" label="${escapeXml(e.label)}">${escapeXml(e.value)}</element>\n`;
}

function groupXml(tag: string, items: E2bElement[], indent: string): string {
  const inner = items.map((e) => elementXml(e, indent + '  ')).join('');
  if (!inner) return '';
  return `${indent}<${tag}>\n${inner}${indent}</${tag}>\n`;
}

/**
 * Serialize the E2B(R3) element model to escaped XML keyed by the canonical
 * element ids. Deterministic — stable element ordering, no timestamps beyond
 * those carried in the model.
 */
export function serializeE2bXml(icsr: E2bIcsr): string {
  const i = '  ';
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<ichicsr standard="E2B(R3)" projection="data-elements">\n';
  out += `${i}<safetyreport>\n`;
  out += groupXml('caseAdministration', icsr.caseAdmin, i + i);
  out += groupXml('primarySource', icsr.primarySource, i + i);
  out += groupXml('patient', icsr.patient, i + i);
  out += groupXml('reaction', icsr.reaction, i + i);
  out += groupXml('drug', icsr.drug, i + i);
  out += groupXml('narrative', [icsr.narrative], i + i);
  out += `${i}</safetyreport>\n`;
  out += '</ichicsr>\n';
  return out;
}
