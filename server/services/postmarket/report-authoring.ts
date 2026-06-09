/**
 * Post-market regulatory report authoring/serialization.
 *
 * Pure and deterministic. Closes the audit gaps "vigilance authoring is
 * missing" and "PSUR authoring workflow — none": the platform could detect
 * signals and transmit via the EUDAMED gateway, but had no way to construct the
 * eMDR (FDA 3500A), EU MIR, FSN/FSCA, or PSUR payloads.
 *
 * These builders produce structured, validated payloads ready to render or to
 * hand to the existing submission gateways. They do not transmit.
 *
 * Backbone:
 *   - FDA Form 3500A / 21 CFR 803 — Medical Device Report (eMDR)
 *   - EU MDR/IVDR Manufacturer Incident Report (MIR) form v7.2
 *   - EU MDR Art. 89 / IVDR Art. 84 — Field Safety Notice (FSN/FSCA)
 *   - EU MDR Art. 86 / IVDR Art. 81 — PSUR
 */

export interface BuildResult<T> {
  valid: boolean;
  /** Required fields that are missing or invalid. */
  missing: string[];
  payload: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// eMDR (FDA Form 3500A)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmdrInput {
  reportType: 'initial' | 'supplemental' | 'followup';
  manufacturerName: string;
  deviceBrandName: string;
  deviceModel?: string;
  udiDi?: string;
  eventType: 'death' | 'serious_injury' | 'malfunction';
  eventDate?: string; // ISO
  becameAwareDate: string; // ISO — starts the reportability clock
  eventDescription: string;
  patientOutcome?: string;
  fdaProductCode?: string;
}

export interface EmdrPayload {
  form: 'FDA-3500A';
  reportType: EmdrInput['reportType'];
  sections: {
    deviceInformation: Record<string, unknown>;
    eventInformation: Record<string, unknown>;
    manufacturerInformation: Record<string, unknown>;
  };
}

/** Build an FDA eMDR (3500A) payload from complaint/MDR data. */
export function buildEmdr(input: EmdrInput): BuildResult<EmdrPayload> {
  const missing: string[] = [];
  if (!input.manufacturerName) missing.push('manufacturerName');
  if (!input.deviceBrandName) missing.push('deviceBrandName');
  if (!input.becameAwareDate) missing.push('becameAwareDate');
  if (!input.eventDescription || input.eventDescription.trim().length === 0) {
    missing.push('eventDescription');
  }

  const payload: EmdrPayload = {
    form: 'FDA-3500A',
    reportType: input.reportType,
    sections: {
      deviceInformation: {
        brandName: input.deviceBrandName,
        model: input.deviceModel ?? null,
        udiDi: input.udiDi ?? null,
        fdaProductCode: input.fdaProductCode ?? null,
      },
      eventInformation: {
        eventType: input.eventType,
        eventDate: input.eventDate ?? null,
        becameAwareDate: input.becameAwareDate,
        description: input.eventDescription,
        patientOutcome: input.patientOutcome ?? null,
      },
      manufacturerInformation: {
        name: input.manufacturerName,
      },
    },
  };
  return { valid: missing.length === 0, missing, payload };
}

// ─────────────────────────────────────────────────────────────────────────────
// EU Manufacturer Incident Report (MIR)
// ─────────────────────────────────────────────────────────────────────────────

export interface MirInput {
  manufacturerName: string;
  authorisedRepresentative?: string;
  basicUdiDi?: string;
  deviceName: string;
  incidentType: 'serious_incident' | 'fsca';
  incidentDate?: string;
  becameAwareDate: string;
  incidentDescription: string;
  /** ISO 3166 country where the incident occurred. */
  incidentCountry?: string;
  riskClass?: string;
}

export interface MirPayload {
  form: 'EU-MIR-v7.2';
  administrativeInformation: Record<string, unknown>;
  incidentInformation: Record<string, unknown>;
}

/** Build an EU MDR/IVDR Manufacturer Incident Report (MIR) payload. */
export function buildMir(input: MirInput): BuildResult<MirPayload> {
  const missing: string[] = [];
  if (!input.manufacturerName) missing.push('manufacturerName');
  if (!input.deviceName) missing.push('deviceName');
  if (!input.becameAwareDate) missing.push('becameAwareDate');
  if (!input.incidentDescription || input.incidentDescription.trim().length === 0) {
    missing.push('incidentDescription');
  }
  const payload: MirPayload = {
    form: 'EU-MIR-v7.2',
    administrativeInformation: {
      manufacturer: input.manufacturerName,
      authorisedRepresentative: input.authorisedRepresentative ?? null,
      basicUdiDi: input.basicUdiDi ?? null,
      deviceName: input.deviceName,
      riskClass: input.riskClass ?? null,
    },
    incidentInformation: {
      type: input.incidentType,
      incidentDate: input.incidentDate ?? null,
      becameAwareDate: input.becameAwareDate,
      country: input.incidentCountry ?? null,
      description: input.incidentDescription,
    },
  };
  return { valid: missing.length === 0, missing, payload };
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Safety Notice / Corrective Action (FSN/FSCA)
// ─────────────────────────────────────────────────────────────────────────────

export interface FscaInput {
  manufacturerName: string;
  deviceName: string;
  affectedLots: string[];
  actionType: 'recall' | 'software_update' | 'advisory' | 'modification' | 'return';
  reasonForAction: string;
  riskToHealth: string;
  recommendedUserAction: string;
  contactDetails: string;
}

export interface FscaPayload {
  documentType: 'FSN';
  manufacturer: string;
  device: string;
  affectedLots: string[];
  actionType: FscaInput['actionType'];
  reason: string;
  riskToHealth: string;
  userAction: string;
  contact: string;
}

/** Build a Field Safety Notice (FSN) for an FSCA. */
export function buildFsn(input: FscaInput): BuildResult<FscaPayload> {
  const missing: string[] = [];
  if (!input.manufacturerName) missing.push('manufacturerName');
  if (!input.deviceName) missing.push('deviceName');
  if (input.affectedLots.length === 0) missing.push('affectedLots');
  if (!input.reasonForAction) missing.push('reasonForAction');
  if (!input.riskToHealth) missing.push('riskToHealth');
  if (!input.recommendedUserAction) missing.push('recommendedUserAction');
  if (!input.contactDetails) missing.push('contactDetails');

  const payload: FscaPayload = {
    documentType: 'FSN',
    manufacturer: input.manufacturerName,
    device: input.deviceName,
    affectedLots: input.affectedLots,
    actionType: input.actionType,
    reason: input.reasonForAction,
    riskToHealth: input.riskToHealth,
    userAction: input.recommendedUserAction,
    contact: input.contactDetails,
  };
  return { valid: missing.length === 0, missing, payload };
}

// ─────────────────────────────────────────────────────────────────────────────
// PSUR (Periodic Safety Update Report)
// ─────────────────────────────────────────────────────────────────────────────

export interface PsurInput {
  deviceName: string;
  riskClass: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  unitsSold?: number;
  complaintCount: number;
  seriousIncidentCount: number;
  fscaCount: number;
  /** Disproportionality / trend signals detected in the period. */
  signalsDetected: number;
  benefitRiskConclusion: string;
  capaSummary?: string;
}

export interface PsurPayload {
  documentType: 'PSUR';
  device: string;
  riskClass: string;
  period: { start: string; end: string };
  sections: {
    salesAndExposure: Record<string, unknown>;
    complaintsAndIncidents: Record<string, unknown>;
    correctiveActions: Record<string, unknown>;
    signalEvaluation: Record<string, unknown>;
    benefitRisk: Record<string, unknown>;
  };
  /** Reporting rate (incidents per unit sold) when units are known. */
  incidentRate: number | null;
}

/** Build a PSUR payload (EU MDR Art. 86 / IVDR Art. 81). */
export function buildPsur(input: PsurInput): BuildResult<PsurPayload> {
  const missing: string[] = [];
  if (!input.deviceName) missing.push('deviceName');
  if (!input.reportingPeriodStart) missing.push('reportingPeriodStart');
  if (!input.reportingPeriodEnd) missing.push('reportingPeriodEnd');
  if (!input.benefitRiskConclusion) missing.push('benefitRiskConclusion');
  if (
    input.reportingPeriodStart &&
    input.reportingPeriodEnd &&
    new Date(input.reportingPeriodEnd) <= new Date(input.reportingPeriodStart)
  ) {
    missing.push('reportingPeriodEnd (must be after start)');
  }

  const incidentRate =
    input.unitsSold && input.unitsSold > 0
      ? Math.round((input.seriousIncidentCount / input.unitsSold) * 1e6) / 1e6
      : null;

  const payload: PsurPayload = {
    documentType: 'PSUR',
    device: input.deviceName,
    riskClass: input.riskClass,
    period: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    sections: {
      salesAndExposure: { unitsSold: input.unitsSold ?? null },
      complaintsAndIncidents: {
        complaints: input.complaintCount,
        seriousIncidents: input.seriousIncidentCount,
        fsca: input.fscaCount,
      },
      correctiveActions: { summary: input.capaSummary ?? null },
      signalEvaluation: { signalsDetected: input.signalsDetected },
      benefitRisk: { conclusion: input.benefitRiskConclusion },
    },
    incidentRate,
  };
  return { valid: missing.length === 0, missing, payload };
}
