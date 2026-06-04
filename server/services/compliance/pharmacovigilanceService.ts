/**
 * Pharmacovigilance Service
 *
 * Implements safety reporting and pharmacovigilance foundations required by
 * all global regulatory markets. Covers adverse event intake, expedited
 * reporting timelines, ICSR generation, periodic safety reporting, signal
 * detection, and risk management planning.
 *
 * Regulatory references:
 * - ICH E2A: Clinical Safety Data Management (Definitions & Standards)
 * - ICH E2B(R3): Individual Case Safety Report (ICSR) Specification
 * - ICH E2C(R2): Periodic Benefit-Risk Evaluation Report (PBRER)
 * - ICH E2D: Post-Approval Safety Data Management
 * - ICH E2E: Pharmacovigilance Planning
 * - ICH E2F: Development Safety Update Report (DSUR)
 * - 21 CFR 312.32 (FDA IND Safety Reporting)
 * - 21 CFR 314.80 (FDA Postmarketing Reporting)
 * - EU Regulation 726/2004 Art. 107 (EudraVigilance)
 * - PMDA PAFSC Notification No. 0328-1 (Japan)
 * - NMPA ADR Reporting Measures (China)
 * - Health Canada: Food and Drug Regulations C.01.017
 *
 * @module pharmacovigilanceService
 */

import { pool } from '../../db';
import { randomUUID } from 'crypto';

import { createScopedLogger } from '../../utils/logger.js';
import { computeAuditChain, hashPayload } from '../audit/chain.js';

const logger = createScopedLogger('pharmacovigilanceService');

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Adverse event classification per ICH E2A / ICH E2D */
export type EventType = 'AE' | 'SAE' | 'SUSAR' | 'AESI';

/** Seriousness criteria per ICH E2A Section III */
export type SeriousnessCriteria =
  | 'death'
  | 'life_threatening'
  | 'hospitalization'
  | 'disability'
  | 'congenital_anomaly'
  | 'medically_important';

/** WHO-UMC causality categories */
export type Causality =
  | 'definite'
  | 'probable'
  | 'possible'
  | 'unlikely'
  | 'unrelated';

/** Patient outcome per ICH E2B(R3) */
export type Outcome =
  | 'recovered'
  | 'recovering'
  | 'not_recovered'
  | 'fatal'
  | 'unknown';

/** Person filing the report */
export type ReporterType =
  | 'investigator'
  | 'sponsor'
  | 'patient'
  | 'healthcare_provider';

/** Regulatory regions with specific pharmacovigilance requirements */
export type RegulatoryRegion =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'NMPA'
  | 'Health_Canada';

/**
 * Adverse Event record.
 *
 * Captures all data elements required for safety reporting to major
 * regulatory authorities per ICH E2B(R3) and regional requirements.
 */
export interface AdverseEvent {
  id: string;
  organizationId: string;
  projectId: string;
  /** Classification: AE, SAE, SUSAR (Suspected Unexpected Serious Adverse Reaction), or AESI (Adverse Event of Special Interest) */
  eventType: EventType;
  /** De-identified patient identifier */
  patientId: string;
  eventDescription: string;
  /** Date the adverse event first manifested */
  onsetDate: Date;
  /** Date the event was reported to the sponsor */
  reportDate: Date;
  /** ICH E2A seriousness criterion that qualifies this event */
  seriousnessCriteria: SeriousnessCriteria;
  /** WHO-UMC causality assessment */
  causality: Causality;
  outcome: Outcome;
  reporterType: ReporterType;
  /** ISO 3166-1 alpha-2 country code */
  countryOfOccurrence: string;
  /** Calculated deadline for regulatory submission */
  regulatoryReportingDeadline: Date;
  /** Whether the event has been filed with the relevant authority */
  reportedToAuthorities: boolean;
  /** Whether the event meets criteria for expedited (clock-start) reporting */
  expeditedReportRequired: boolean;
  // ── E2B(R3) intake detail (optional) ──────────────────────────────────────
  /** MedDRA reaction Preferred Term + code (and System Organ Class). */
  reactionPt?: string | null;
  reactionPtCode?: string | null;
  reactionSoc?: string | null;
  reactionSocCode?: string | null;
  /** Suspect product details. */
  suspectProduct?: string | null;
  suspectProductStrength?: string | null;
  suspectProductRoute?: string | null;
  suspectProductDose?: string | null;
  /** Expectedness vs the Reference Safety Information. */
  expectedness?: string | null;
  rsiReference?: string | null;
  /** Reporter / source. */
  reporterName?: string | null;
  reporterContact?: string | null;
  reporterOrganization?: string | null;
  /** Free-text case narrative. */
  narrative?: string | null;
  createdAt: Date;
}

/**
 * Individual Case Safety Report per ICH E2B(R3).
 *
 * An ICSR is the structured electronic transmission format used to report
 * individual adverse event cases between sponsors, regulatory authorities,
 * and the WHO Collaborating Centre (Uppsala Monitoring Centre).
 */
export interface ICSR {
  id: string;
  adverseEventId: string;
  /** Report lifecycle stage */
  icsrType: 'initial' | 'follow_up' | 'nullification';
  senderType: 'sponsor' | 'regulatory_authority';
  receiverType: 'regulatory_authority' | 'who_collaborating_centre';
  transmissionDate: Date;
  /** E2B version — R3 is the current ICH standard */
  e2bVersion: string;
  /** Globally unique case identifier per ICH E2B(R3) C.1.8.1 */
  worldwideUniqueId: string;
  reportType: string;
  seriousness: SeriousnessCriteria;
  organizationId: string;
}

/**
 * Periodic Safety Report.
 *
 * Covers the family of periodic aggregate safety reports required at
 * different lifecycle stages:
 * - DSUR: During clinical development (ICH E2F)
 * - PSUR: Post-authorisation (EMA Regulation)
 * - PBRER: Periodic Benefit-Risk Evaluation (ICH E2C(R2))
 * - PADER: Periodic Adverse Drug Experience Report (FDA)
 */
export interface PeriodicSafetyReport {
  id: string;
  organizationId: string;
  projectId: string;
  reportType: 'DSUR' | 'PSUR' | 'PBRER' | 'PADER';
  periodStart: Date;
  periodEnd: Date;
  status: 'draft' | 'in_review' | 'submitted';
  /** List of regulatory authorities the report is submitted to */
  submittedTo: string[];
  dueDate: Date;
  submittedAt: Date | null;
}

/**
 * Safety Signal per ICH E2E and GVP Module IX.
 *
 * A safety signal is information on a new or known adverse event that
 * warrants further investigation. Signal management is a core
 * pharmacovigilance activity.
 */
export interface SafetySignal {
  id: string;
  organizationId: string;
  projectId: string;
  signalSource: 'spontaneous' | 'clinical_trial' | 'literature' | 'registry';
  description: string;
  detectedAt: Date;
  evaluationStatus: 'new' | 'under_evaluation' | 'confirmed' | 'refuted' | 'closed';
  /** Regulatory action taken or recommended */
  action:
    | 'label_update'
    | 'rems'
    | 'dear_doctor'
    | 'withdrawal'
    | 'none';
  riskBenefitAssessment: string;
}

/**
 * Risk Management Plan per ICH E2E and EU GVP Module V.
 *
 * An RMP documents the safety profile of a product, outlines activities
 * to further characterise risks, and describes measures to minimise them.
 */
export interface RiskManagementPlan {
  id: string;
  organizationId: string;
  projectId: string;
  version: string;
  /** Known, characterised risks with supporting evidence */
  identifiedRisks: string[];
  /** Risks suggested by nonclinical or limited clinical data */
  potentialRisks: string[];
  /** Safety-relevant gaps in knowledge */
  missingInformation: string[];
  /** Pharmacovigilance activities */
  pharmacovigilanceActivities: {
    routine: string[];
    additional: string[];
  };
  /** Risk minimisation measures */
  riskMinimizationMeasures: {
    routine: string[];
    additional: string[];
  };
  status: 'draft' | 'submitted' | 'approved';
  region: RegulatoryRegion;
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export interface AdverseEventFilters {
  eventType?: EventType;
  seriousnessCriteria?: SeriousnessCriteria;
  reportedToAuthorities?: boolean;
  expeditedReportRequired?: boolean;
  fromDate?: Date;
  toDate?: Date;
}

// ---------------------------------------------------------------------------
// Expedited Reporting Timelines
// ---------------------------------------------------------------------------

/**
 * Calculate the regulatory reporting deadline for an adverse event.
 *
 * Each region defines its own expedited reporting windows:
 *
 * | Region        | Fatal / Life-Threatening | Other SAE |
 * |---------------|--------------------------|-----------|
 * | FDA           | 7 calendar days          | 15 days   |
 * | EMA           | 7 calendar days          | 15 days   |
 * | PMDA (Japan)  | 7 days (first notice 72h)| 15 days   |
 * | NMPA (China)  | 7 calendar days          | 15 days   |
 * | Health Canada | 7 calendar days          | 15 days   |
 *
 * References:
 * - 21 CFR 312.32(c)(2) — FDA 7-day telephone/fax, 15-day written
 * - EU Regulation 726/2004 Art. 107, EudraVigilance rules
 * - PMDA PAFSC Notification No. 0328-1
 * - NMPA Adverse Drug Reaction Reporting Measures Art. 29
 * - Health Canada Food and Drug Regulations C.01.017
 *
 * @param eventType - AE, SAE, SUSAR, or AESI
 * @param seriousnessCriteria - Seriousness qualifier
 * @param region - Target regulatory region
 * @param reportDate - Date the event was first reported (clock-start)
 * @returns The deadline Date by which the report must be submitted
 */
export function calculateReportingDeadline(
  eventType: EventType,
  seriousnessCriteria: SeriousnessCriteria,
  region: RegulatoryRegion,
  reportDate: Date = new Date(),
): Date {
  const deadline = new Date(reportDate);
  const isFatalOrLifeThreatening =
    seriousnessCriteria === 'death' || seriousnessCriteria === 'life_threatening';

  // Non-serious AEs do not trigger expedited reporting
  if (eventType === 'AE') {
    // Default 90-day aggregate window for non-serious AEs
    deadline.setDate(deadline.getDate() + 90);
    return deadline;
  }

  switch (region) {
    case 'FDA':
      // 21 CFR 312.32(c)(2): 7 days for fatal/life-threatening, 15 days for other SAEs
      deadline.setDate(deadline.getDate() + (isFatalOrLifeThreatening ? 7 : 15));
      break;

    case 'EMA':
      // EudraVigilance: 7 days for fatal/life-threatening, 15 days for other SAEs
      deadline.setDate(deadline.getDate() + (isFatalOrLifeThreatening ? 7 : 15));
      break;

    case 'PMDA':
      // PMDA: 7 days for fatal, 15 days standard; first report within 72 hours
      // The returned deadline is the *final* report deadline. The 72-hour
      // first-notification obligation is handled at the workflow layer.
      deadline.setDate(deadline.getDate() + (isFatalOrLifeThreatening ? 7 : 15));
      break;

    case 'NMPA':
      // NMPA: 7 days for fatal, 15 days standard
      deadline.setDate(deadline.getDate() + (isFatalOrLifeThreatening ? 7 : 15));
      break;

    case 'Health_Canada':
      // Health Canada C.01.017: 7 days for fatal, 15 days standard
      deadline.setDate(deadline.getDate() + (isFatalOrLifeThreatening ? 7 : 15));
      break;

    default:
      // Conservative fallback — 15 calendar days
      deadline.setDate(deadline.getDate() + 15);
      break;
  }

  return deadline;
}

/**
 * Determine whether an adverse event requires expedited (clock-start) reporting.
 *
 * Per ICH E2A and regional guidance, expedited reports are required for:
 * - All SAEs, SUSARs, and AESIs
 * - Non-serious AEs do NOT trigger expedited reporting
 *
 * @param eventType - The classification of the event
 * @returns true if expedited reporting is required
 */
function requiresExpeditedReport(eventType: EventType): boolean {
  return eventType === 'SAE' || eventType === 'SUSAR' || eventType === 'AESI';
}

// ---------------------------------------------------------------------------
// 1. Adverse Event Intake
// ---------------------------------------------------------------------------

/**
 * Report a new adverse event and persist it to the database.
 *
 * Automatically calculates the regulatory reporting deadline based on the
 * event severity and the country of occurrence mapped to a regulatory region.
 * Sets the expedited report flag per ICH E2A criteria.
 *
 * @param event - Partial adverse event data (id & computed fields may be omitted)
 * @returns The persisted AdverseEvent record
 */
export async function reportAdverseEvent(
  event: Omit<AdverseEvent, 'id' | 'regulatoryReportingDeadline' | 'expeditedReportRequired' | 'createdAt'>,
): Promise<AdverseEvent> {
  const id = generateUUID();
  const createdAt = new Date();
  const expeditedReportRequired = requiresExpeditedReport(event.eventType);

  // Map country to primary regulatory region for deadline calculation
  const region = mapCountryToRegion(event.countryOfOccurrence);
  const regulatoryReportingDeadline = calculateReportingDeadline(
    event.eventType,
    event.seriousnessCriteria,
    region,
    event.reportDate,
  );

  const adverseEvent: AdverseEvent = {
    ...event,
    id,
    regulatoryReportingDeadline,
    expeditedReportRequired,
    createdAt,
  };

  try {
    if (!pool) {
      logger.warn('Database pool not available — returning in-memory record');
      return adverseEvent;
    }

    await pool.query(
      `INSERT INTO adverse_events (
        id, organization_id, project_id, event_type, patient_id,
        event_description, onset_date, report_date, seriousness_criteria,
        causality, outcome, reporter_type, country_of_occurrence,
        regulatory_reporting_deadline, reported_to_authorities,
        expedited_report_required, created_at,
        reaction_pt, reaction_pt_code, reaction_soc, reaction_soc_code,
        suspect_product, suspect_product_strength, suspect_product_route, suspect_product_dose,
        expectedness, rsi_reference, reporter_name, reporter_contact, reporter_organization, narrative
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        adverseEvent.id,
        adverseEvent.organizationId,
        adverseEvent.projectId,
        adverseEvent.eventType,
        adverseEvent.patientId,
        adverseEvent.eventDescription,
        adverseEvent.onsetDate,
        adverseEvent.reportDate,
        adverseEvent.seriousnessCriteria,
        adverseEvent.causality,
        adverseEvent.outcome,
        adverseEvent.reporterType,
        adverseEvent.countryOfOccurrence,
        adverseEvent.regulatoryReportingDeadline,
        adverseEvent.reportedToAuthorities,
        adverseEvent.expeditedReportRequired,
        adverseEvent.createdAt,
        adverseEvent.reactionPt ?? null,
        adverseEvent.reactionPtCode ?? null,
        adverseEvent.reactionSoc ?? null,
        adverseEvent.reactionSocCode ?? null,
        adverseEvent.suspectProduct ?? null,
        adverseEvent.suspectProductStrength ?? null,
        adverseEvent.suspectProductRoute ?? null,
        adverseEvent.suspectProductDose ?? null,
        adverseEvent.expectedness ?? null,
        adverseEvent.rsiReference ?? null,
        adverseEvent.reporterName ?? null,
        adverseEvent.reporterContact ?? null,
        adverseEvent.reporterOrganization ?? null,
        adverseEvent.narrative ?? null,
      ],
    );

    return adverseEvent;
  } catch (error: any) {
    // Graceful handling when the table does not yet exist
    if (error?.code === '42P01') {
      logger.warn('adverse_events table does not exist — returning in-memory record');
      return adverseEvent;
    }
    throw error;
  }
}

/**
 * Retrieve adverse events for an organisation, optionally filtered.
 *
 * @param organizationId - The organisation whose events to retrieve
 * @param filters - Optional filters (event type, seriousness, date range, etc.)
 * @returns Array of matching AdverseEvent records
 */
export async function getAdverseEvents(
  organizationId: string,
  filters: AdverseEventFilters = {},
): Promise<AdverseEvent[]> {
  try {
    if (!pool) {
      logger.warn('Database pool not available');
      return [];
    }

    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIdx = 2;

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIdx++}`);
      params.push(filters.eventType);
    }
    if (filters.seriousnessCriteria) {
      conditions.push(`seriousness_criteria = $${paramIdx++}`);
      params.push(filters.seriousnessCriteria);
    }
    if (filters.reportedToAuthorities !== undefined) {
      conditions.push(`reported_to_authorities = $${paramIdx++}`);
      params.push(filters.reportedToAuthorities);
    }
    if (filters.expeditedReportRequired !== undefined) {
      conditions.push(`expedited_report_required = $${paramIdx++}`);
      params.push(filters.expeditedReportRequired);
    }
    if (filters.fromDate) {
      conditions.push(`report_date >= $${paramIdx++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`report_date <= $${paramIdx++}`);
      params.push(filters.toDate);
    }

    const whereClause = conditions.join(' AND ');
    const result = await pool.query(
      `SELECT * FROM adverse_events WHERE ${whereClause} ORDER BY report_date DESC`,
      params,
    );

    return result.rows.map(mapRowToAdverseEvent);
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('adverse_events table does not exist');
      return [];
    }
    throw error;
  }
}

/**
 * Retrieve all adverse events whose regulatory reporting deadline has passed
 * and that have not yet been reported to authorities.
 *
 * @param organizationId - The organisation to check
 * @returns Array of overdue AdverseEvent records
 */
export async function getOverdueReports(organizationId: string): Promise<AdverseEvent[]> {
  try {
    if (!pool) {
      logger.warn('Database pool not available');
      return [];
    }

    const result = await pool.query(
      `SELECT * FROM adverse_events
       WHERE organization_id = $1
         AND reported_to_authorities = false
         AND regulatory_reporting_deadline < NOW()
       ORDER BY regulatory_reporting_deadline ASC`,
      [organizationId],
    );

    return result.rows.map(mapRowToAdverseEvent);
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('adverse_events table does not exist');
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 3. ICSR Generation (ICH E2B(R3))
// ---------------------------------------------------------------------------

/**
 * Generate an Individual Case Safety Report (ICSR) from an existing
 * adverse event record.
 *
 * The ICSR follows the ICH E2B(R3) specification and includes a
 * worldwide unique case identifier per C.1.8.1.
 *
 * @param adverseEventId - ID of the source adverse event
 * @returns The generated ICSR record
 */
export async function generateICSR(adverseEventId: string): Promise<ICSR> {
  // Fetch the source adverse event
  let adverseEvent: AdverseEvent | null = null;

  try {
    if (pool) {
      const result = await pool.query(
        'SELECT * FROM adverse_events WHERE id = $1',
        [adverseEventId],
      );
      if (result.rows.length > 0) {
        adverseEvent = mapRowToAdverseEvent(result.rows[0]);
      }
    }
  } catch (error: any) {
    if (error?.code !== '42P01') {
      throw error;
    }
    logger.warn('adverse_events table does not exist — generating ICSR from minimal data');
  }

  const icsr: ICSR = {
    id: generateUUID(),
    adverseEventId,
    icsrType: 'initial',
    senderType: 'sponsor',
    receiverType: 'regulatory_authority',
    transmissionDate: new Date(),
    e2bVersion: 'R3',
    worldwideUniqueId: generateWorldwideUniqueId(),
    reportType: adverseEvent ? adverseEvent.eventType : 'SAE',
    seriousness: adverseEvent ? adverseEvent.seriousnessCriteria : 'medically_important',
    organizationId: adverseEvent ? adverseEvent.organizationId : '',
  };

  try {
    if (pool) {
      await pool.query(
        `INSERT INTO icsrs (
          id, adverse_event_id, icsr_type, sender_type, receiver_type,
          transmission_date, e2b_version, worldwide_unique_id,
          report_type, seriousness, organization_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          icsr.id,
          icsr.adverseEventId,
          icsr.icsrType,
          icsr.senderType,
          icsr.receiverType,
          icsr.transmissionDate,
          icsr.e2bVersion,
          icsr.worldwideUniqueId,
          icsr.reportType,
          icsr.seriousness,
          icsr.organizationId,
        ],
      );
    }
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('icsrs table does not exist — returning in-memory record');
    } else {
      throw error;
    }
  }

  return icsr;
}

// ---------------------------------------------------------------------------
// 4. Periodic Safety Reporting
// ---------------------------------------------------------------------------

/**
 * Create a new periodic safety report.
 *
 * Supports the following report types per their respective guidelines:
 * - **DSUR**: Annual during clinical trials (ICH E2F)
 * - **PSUR**: Post-authorisation (EMA GVP Module VII)
 * - **PBRER**: Periodic Benefit-Risk Evaluation (ICH E2C(R2))
 * - **PADER**: Periodic Adverse Drug Experience Report (FDA)
 *
 * @param report - The periodic safety report data (id, status, submittedAt may be omitted)
 * @returns The persisted PeriodicSafetyReport record
 */
export async function createPeriodicReport(
  report: Omit<PeriodicSafetyReport, 'id' | 'status' | 'submittedAt'>,
): Promise<PeriodicSafetyReport> {
  const periodicReport: PeriodicSafetyReport = {
    ...report,
    id: generateUUID(),
    status: 'draft',
    submittedAt: null,
  };

  try {
    if (!pool) {
      logger.warn('Database pool not available — returning in-memory record');
      return periodicReport;
    }

    await pool.query(
      `INSERT INTO periodic_safety_reports (
        id, organization_id, project_id, report_type, period_start,
        period_end, status, submitted_to, due_date, submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        periodicReport.id,
        periodicReport.organizationId,
        periodicReport.projectId,
        periodicReport.reportType,
        periodicReport.periodStart,
        periodicReport.periodEnd,
        periodicReport.status,
        JSON.stringify(periodicReport.submittedTo),
        periodicReport.dueDate,
        periodicReport.submittedAt,
      ],
    );

    return periodicReport;
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('periodic_safety_reports table does not exist — returning in-memory record');
      return periodicReport;
    }
    throw error;
  }
}

/**
 * Retrieve periodic safety reports due within the next 90 days for an
 * organisation.
 *
 * @param organizationId - The organisation to query
 * @returns Array of PeriodicSafetyReport records due within 90 days
 */
export async function getUpcomingReports(organizationId: string): Promise<PeriodicSafetyReport[]> {
  try {
    if (!pool) {
      logger.warn('Database pool not available');
      return [];
    }

    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const result = await pool.query(
      `SELECT * FROM periodic_safety_reports
       WHERE organization_id = $1
         AND due_date <= $2
         AND status != 'submitted'
       ORDER BY due_date ASC`,
      [organizationId, ninetyDaysFromNow],
    );

    return result.rows.map(mapRowToPeriodicReport);
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('periodic_safety_reports table does not exist');
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 5. Signal Detection
// ---------------------------------------------------------------------------

/**
 * Report a new safety signal.
 *
 * Per ICH E2E and EMA GVP Module IX, a signal is information arising from
 * one or multiple sources that suggests a new potentially causal association,
 * or a new aspect of a known association, between an intervention and an
 * event that is judged to be of sufficient likelihood to justify verificatory
 * action.
 *
 * @param signal - The safety signal data (id, detectedAt may be omitted)
 * @returns The persisted SafetySignal record
 */
export async function reportSignal(
  signal: Omit<SafetySignal, 'id' | 'detectedAt'>,
): Promise<SafetySignal> {
  const safetySignal: SafetySignal = {
    ...signal,
    id: generateUUID(),
    detectedAt: new Date(),
  };

  try {
    if (!pool) {
      logger.warn('Database pool not available — returning in-memory record');
      return safetySignal;
    }

    await pool.query(
      `INSERT INTO safety_signals (
        id, organization_id, project_id, signal_source, description,
        detected_at, evaluation_status, action, risk_benefit_assessment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        safetySignal.id,
        safetySignal.organizationId,
        safetySignal.projectId,
        safetySignal.signalSource,
        safetySignal.description,
        safetySignal.detectedAt,
        safetySignal.evaluationStatus,
        safetySignal.action,
        safetySignal.riskBenefitAssessment,
      ],
    );

    return safetySignal;
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('safety_signals table does not exist — returning in-memory record');
      return safetySignal;
    }
    throw error;
  }
}

/**
 * Retrieve all safety signals that are pending evaluation for an organisation.
 *
 * Returns signals with evaluation status of 'new' or 'under_evaluation'.
 *
 * @param organizationId - The organisation to query
 * @returns Array of pending SafetySignal records
 */
export async function getPendingSignals(organizationId: string): Promise<SafetySignal[]> {
  try {
    if (!pool) {
      logger.warn('Database pool not available');
      return [];
    }

    const result = await pool.query(
      `SELECT * FROM safety_signals
       WHERE organization_id = $1
         AND evaluation_status IN ('new', 'under_evaluation')
       ORDER BY detected_at DESC`,
      [organizationId],
    );

    return result.rows.map(mapRowToSafetySignal);
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('safety_signals table does not exist');
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 6. Risk Management Plan (RMP)
// ---------------------------------------------------------------------------

/**
 * Create a new Risk Management Plan.
 *
 * Per ICH E2E and EU GVP Module V, an RMP describes the safety profile,
 * pharmacovigilance plan, and risk minimisation measures for a medicinal
 * product. RMPs are mandatory for all new marketing authorisation
 * applications in the EU and recommended in other regions.
 *
 * @param rmp - The RMP data (id may be omitted)
 * @returns The persisted RiskManagementPlan record
 */
export async function createRMP(
  rmp: Omit<RiskManagementPlan, 'id'>,
): Promise<RiskManagementPlan> {
  const plan: RiskManagementPlan = {
    ...rmp,
    id: generateUUID(),
  };

  try {
    if (!pool) {
      logger.warn('Database pool not available — returning in-memory record');
      return plan;
    }

    await pool.query(
      `INSERT INTO risk_management_plans (
        id, organization_id, project_id, version, identified_risks,
        potential_risks, missing_information, pharmacovigilance_activities,
        risk_minimization_measures, status, region
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        plan.id,
        plan.organizationId,
        plan.projectId,
        plan.version,
        JSON.stringify(plan.identifiedRisks),
        JSON.stringify(plan.potentialRisks),
        JSON.stringify(plan.missingInformation),
        JSON.stringify(plan.pharmacovigilanceActivities),
        JSON.stringify(plan.riskMinimizationMeasures),
        plan.status,
        plan.region,
      ],
    );

    return plan;
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('risk_management_plans table does not exist — returning in-memory record');
      return plan;
    }
    throw error;
  }
}

/**
 * Retrieve all Risk Management Plans for a given project.
 *
 * @param projectId - The project whose RMPs to retrieve
 * @returns Array of RiskManagementPlan records, ordered by version descending
 */
export async function getRMPsForProject(projectId: string): Promise<RiskManagementPlan[]> {
  try {
    if (!pool) {
      logger.warn('Database pool not available');
      return [];
    }

    const result = await pool.query(
      `SELECT * FROM risk_management_plans
       WHERE project_id = $1
       ORDER BY version DESC`,
      [projectId],
    );

    return result.rows.map(mapRowToRMP);
  } catch (error: any) {
    if (error?.code === '42P01') {
      logger.warn('risk_management_plans table does not exist');
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Map a country code to its primary regulatory region.
 *
 * Uses ISO 3166-1 alpha-2 codes. Falls back to FDA for unmapped countries
 * as the most conservative baseline.
 */
function mapCountryToRegion(countryCode: string): RegulatoryRegion {
  const upperCode = countryCode.toUpperCase();

  // United States & territories
  if (['US', 'PR', 'GU', 'VI', 'AS'].includes(upperCode)) {
    return 'FDA';
  }

  // European Economic Area (subset — all EU27 + EEA)
  const eeaCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
  ];
  if (eeaCountries.includes(upperCode)) {
    return 'EMA';
  }

  // Japan
  if (upperCode === 'JP') {
    return 'PMDA';
  }

  // China
  if (upperCode === 'CN') {
    return 'NMPA';
  }

  // Canada
  if (upperCode === 'CA') {
    return 'Health_Canada';
  }

  // Default to FDA timelines (most conservative)
  return 'FDA';
}

/** Generate a UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a worldwide unique case identifier per ICH E2B(R3) C.1.8.1.
 *
 * Format: {country}-{sender}-{YYYYMMDD}-{random}
 */
function generateWorldwideUniqueId(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `XX-C2CRI-${datePart}-${randomPart}`;
}

/** Map a database row to an AdverseEvent object */
function mapRowToAdverseEvent(row: any): AdverseEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    eventType: row.event_type,
    patientId: row.patient_id,
    eventDescription: row.event_description,
    onsetDate: new Date(row.onset_date),
    reportDate: new Date(row.report_date),
    seriousnessCriteria: row.seriousness_criteria,
    causality: row.causality,
    outcome: row.outcome,
    reporterType: row.reporter_type,
    countryOfOccurrence: row.country_of_occurrence,
    regulatoryReportingDeadline: new Date(row.regulatory_reporting_deadline),
    reportedToAuthorities: row.reported_to_authorities,
    expeditedReportRequired: row.expedited_report_required,
    reactionPt: row.reaction_pt ?? null,
    reactionPtCode: row.reaction_pt_code ?? null,
    reactionSoc: row.reaction_soc ?? null,
    reactionSocCode: row.reaction_soc_code ?? null,
    suspectProduct: row.suspect_product ?? null,
    suspectProductStrength: row.suspect_product_strength ?? null,
    suspectProductRoute: row.suspect_product_route ?? null,
    suspectProductDose: row.suspect_product_dose ?? null,
    expectedness: row.expectedness ?? null,
    rsiReference: row.rsi_reference ?? null,
    reporterName: row.reporter_name ?? null,
    reporterContact: row.reporter_contact ?? null,
    reporterOrganization: row.reporter_organization ?? null,
    narrative: row.narrative ?? null,
    createdAt: new Date(row.created_at),
  };
}

/** Map a database row to a PeriodicSafetyReport object */
function mapRowToPeriodicReport(row: any): PeriodicSafetyReport {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    reportType: row.report_type,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    status: row.status,
    submittedTo: typeof row.submitted_to === 'string' ? (() => { try { return JSON.parse(row.submitted_to); } catch { return []; } })() : row.submitted_to || [],
    dueDate: new Date(row.due_date),
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
  };
}

/** Map a database row to a SafetySignal object */
function mapRowToSafetySignal(row: any): SafetySignal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    signalSource: row.signal_source,
    description: row.description,
    detectedAt: new Date(row.detected_at),
    evaluationStatus: row.evaluation_status,
    action: row.action,
    riskBenefitAssessment: row.risk_benefit_assessment,
  };
}

/** Map a database row to a RiskManagementPlan object */
function mapRowToRMP(row: any): RiskManagementPlan {
  const parseJSON = (val: any, fallback: any = []) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val || fallback;
  };

  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    version: row.version,
    identifiedRisks: parseJSON(row.identified_risks),
    potentialRisks: parseJSON(row.potential_risks),
    missingInformation: parseJSON(row.missing_information),
    pharmacovigilanceActivities: parseJSON(row.pharmacovigilance_activities, { routine: [], additional: [] }),
    riskMinimizationMeasures: parseJSON(row.risk_minimization_measures, { routine: [], additional: [] }),
    status: row.status,
    region: row.region,
  };
}

// ---------------------------------------------------------------------------
// 7. Reporting clock (expedited 15-day window)
// ---------------------------------------------------------------------------

export interface ReportingClock {
  deadline: string | null;
  daysRemaining: number | null;
  /** True when the expedited window is in its urgent tail (e.g. day 6+ of 15) and not yet breached. */
  day6Flag: boolean;
  breached: boolean;
  status: 'none' | 'on_track' | 'due_soon' | 'day6' | 'breached';
}

/**
 * Compute the expedited-reporting clock for a case from its deadline. Pure (no
 * DB) so it is unit-testable and reusable by the case line-listing + overview.
 * "Day 6 of 15" = the urgent tail of the window: <= (windowDays - 6) days left.
 */
export function computeReportingClock(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
  windowDays = 15,
): ReportingClock {
  if (!deadline) {
    return { deadline: null, daysRemaining: null, day6Flag: false, breached: false, status: 'none' };
  }
  const due = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(due.getTime())) {
    return { deadline: null, daysRemaining: null, day6Flag: false, breached: false, status: 'none' };
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / msPerDay);
  const breached = daysRemaining < 0;
  const day6Flag = !breached && daysRemaining <= windowDays - 6;
  let status: ReportingClock['status'];
  if (breached) status = 'breached';
  else if (day6Flag) status = 'day6';
  else if (daysRemaining <= windowDays - 3) status = 'due_soon';
  else status = 'on_track';
  return { deadline: due.toISOString(), daysRemaining, day6Flag, breached, status };
}

// ---------------------------------------------------------------------------
// 8. MedDRA term lookup (drives the PT picker)
// ---------------------------------------------------------------------------

export interface MeddraTerm {
  ptCode: string;
  ptName: string;
  socCode: string | null;
  socName: string | null;
  lltCode: string | null;
  lltName: string | null;
}

/**
 * Search the MedDRA dictionary (meddra_term_reference) for the case-intake PT
 * picker. Org-scoped (the dictionary is loaded per org). Returns [] when the
 * dictionary table/column is absent or no data is loaded — the licensed MedDRA
 * dictionary must be ingested per org before this returns terms.
 */
export async function searchMeddraTerms(
  organizationId: string,
  query: string,
  limit = 20,
): Promise<MeddraTerm[]> {
  const orgId = Number(organizationId);
  if (!pool || !query || query.trim().length < 2 || !Number.isFinite(orgId)) return [];
  try {
    const result = await pool.query(
      `SELECT pt_code, pt_name, soc_code, soc_name, llt_code, llt_name
         FROM meddra_term_reference
        WHERE organization_id = $1
          AND (pt_name ILIKE $2 OR llt_name ILIKE $2 OR pt_code = $3)
        ORDER BY pt_name ASC
        LIMIT $4`,
      [orgId, `%${query.trim()}%`, query.trim(), Math.min(limit, 100)],
    );
    return result.rows.map((r: any) => ({
      ptCode: r.pt_code,
      ptName: r.pt_name,
      socCode: r.soc_code ?? null,
      socName: r.soc_name ?? null,
      lltCode: r.llt_code ?? null,
      lltName: r.llt_name ?? null,
    }));
  } catch (error: any) {
    if (error?.code === '42P01' || error?.code === '42703') return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 9. Submit case to triage (assigns clock + writes a 21 CFR Part 11 audit)
// ---------------------------------------------------------------------------

export interface CaseTriageResult {
  id: string;
  caseStatus: string;
  submittedAt: string;
  reportingClock: ReportingClock;
  auditWritten: boolean;
}

/**
 * Transition a drafted case to triage: set status, stamp submitter/time, and
 * write a Part 11 audit entry (best-effort, hash-chained). The reporting clock
 * was assigned at case creation (regulatory_reporting_deadline); this returns
 * it for the UI. Throws CASE_NOT_FOUND if no matching case for the org.
 */
export async function submitCaseToTriage(
  organizationId: string,
  userId: string,
  caseId: string,
  reason: string,
): Promise<CaseTriageResult> {
  if (!pool) throw new Error('PV_DB_UNAVAILABLE');
  const submittedAt = new Date();
  let updated: any;
  try {
    const res = await pool.query(
      `UPDATE adverse_events
          SET case_status = 'submitted_to_triage', submitted_by = $1, submitted_at = $2
        WHERE id = $3 AND organization_id = $4
        RETURNING id, case_status, submitted_at, regulatory_reporting_deadline`,
      [userId, submittedAt, caseId, organizationId],
    );
    if (res.rows.length === 0) throw new Error('CASE_NOT_FOUND');
    updated = res.rows[0];
  } catch (error: any) {
    if (error?.code === '42P01') throw new Error('PV_TABLE_MISSING');
    throw error;
  }

  const auditWritten = await writePvAudit({
    organizationId,
    userId,
    action: 'pv.case.submit_to_triage',
    recordId: caseId,
    reason,
    payload: { caseId, caseStatus: 'submitted_to_triage', submittedAt: submittedAt.toISOString() },
  }).catch(() => false);

  return {
    id: updated.id,
    caseStatus: updated.case_status,
    submittedAt: new Date(updated.submitted_at).toISOString(),
    reportingClock: computeReportingClock(updated.regulatory_reporting_deadline),
    auditWritten,
  };
}

/**
 * Best-effort 21 CFR Part 11 audit write into the hash-chained audit_logs
 * ledger. Never throws (returns false on any failure) so it cannot break the
 * operational action. For strict atomic Part 11 capture, route through
 * /api/c2c/actions (recordGovernedAction); this is the PV-service path.
 */
async function writePvAudit(entry: {
  organizationId: string;
  userId: string;
  action: string;
  recordId: string;
  reason: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (!pool) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const occurredAt = new Date().toISOString();
    const payloadHash = hashPayload(entry.payload);
    const actorId = Number.isFinite(Number(entry.userId)) ? Number(entry.userId) : null;
    const tenantId = Number.isFinite(Number(entry.organizationId)) ? Number(entry.organizationId) : null;
    const target = `case:${entry.recordId}`;
    const sha256Chain = await computeAuditChain(client as any, {
      action: entry.action,
      actor_id: actorId,
      target,
      payload_hash: payloadHash,
      occurred_at: occurredAt,
    });
    await client.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, table_name, record_id,
          actor_id, target, target_type, target_id, reason, payload_hash,
          ana_action_id, sha256_chain, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        randomUUID(), tenantId, actorId, entry.action, 'adverse_events', entry.recordId,
        actorId, target, 'case', entry.recordId, entry.reason, payloadHash,
        null, sha256Chain, occurredAt,
      ],
    );
    await client.query('COMMIT');
    return true;
  } catch (error: any) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    logger.warn(`PV audit write failed (best-effort): ${error?.message}`);
    return false;
  } finally {
    client.release();
  }
}
