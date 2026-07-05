/**
 * CAPA / complaint / MDR / vigilance tools — expose the device post-market
 * safety workstream (server/services/capa-mdr/*, routes /api/capa-mdr) to AnA.
 *
 * Before these, the entire regulated device post-market surface (complaint
 * intake, MDR reportability under 21 CFR 803 / EU MDR Art 87, CAPA, the
 * vigilance timeline) was invisible to conversation. `assess_mdr_reportability`
 * wraps the PURE deterministic triage classifier; the rest are thin, org-scoped
 * calls over the service. Mutations (create_complaint, open_device_capa) write
 * governed records — the service records the vigilance-timeline event and audit
 * internally.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler). Scoping: org id is
 * an integer (from tool context); programId is a program UUID string.
 *
 * @module server/services/ana/capaMdrTools
 */

import type { AnaTool } from '../ai-gateway/types';

const HARM_LEVELS = ['none', 'malfunction', 'injury', 'serious_injury', 'death'];
const COMPLAINT_SOURCES = ['customer', 'distributor', 'clinical_trial', 'internal', 'regulator', 'literature', 'service', 'other'];
const COMPLAINT_CHANNELS = ['phone', 'email', 'web_form', 'service_call', 'salesforce', 'servicenow', 'mail', 'in_person', 'other'];
const SEVERITY_LEVELS = ['negligible', 'minor', 'serious', 'critical'];
const CAPA_TYPES = ['corrective', 'preventive', 'both'];
const CAPA_SOURCES = ['complaint', 'internal_audit', 'external_audit', 'mdr', 'nonconformance', 'management_review', 'supplier', 'inspection_finding', 'risk_review', 'trend_signal', 'other'];
const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
const VIGILANCE_ENTITY_TYPES = ['complaint', 'mdr_event', 'capa_record', 'capa_action'];

export const ASSESS_MDR_REPORTABILITY: AnaTool = {
  name: 'assess_mdr_reportability',
  description:
    'Assess whether a device adverse event is reportable — the deterministic MDR/vigilance triage. Given the patient harm and event facts, returns whether it is FDA MDR reportable (21 CFR 803) and/or EU MDR vigilance reportable (Art 87), whether a 21 CFR 806 correction/removal notice applies, the suggested jurisdiction, FDA report type, and EU severity/clock, with a rationale. DETERMINISTIC — report the classification verbatim; it does not decide FOR the manufacturer, it computes the regulatory trigger.',
  input_schema: {
    type: 'object',
    properties: {
      patientHarm: { type: 'string', enum: HARM_LEVELS, description: 'The harm level of the event.' },
      isMalfunction: { type: 'boolean', description: 'Was this a device malfunction (that could recur and cause harm)?' },
      eventLocationCountry: { type: 'string', description: 'ISO country code where the event occurred (drives EU applicability).' },
      anticipatesCorrection: { type: 'boolean', description: 'Does the manufacturer anticipate a correction/removal (806)?' },
      trendThresholdCrossed: { type: 'boolean', description: 'Has a trend reporting threshold been crossed?' },
      eventNarrative: { type: 'string', description: 'Optional free-text description (currently informational).' },
    },
    required: ['patientHarm'],
  },
};

export const TRIAGE_CAPA_MDR_QUEUE: AnaTool = {
  name: 'triage_capa_mdr_queue',
  description:
    "Read the device post-market triage queue for a program — the open complaints, MDR events, and CAPAs with their state, risk/severity, due dates, and overdue flags. Use to answer 'what's in my vigilance/CAPA queue?' or 'what's overdue?'.",
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID.' },
      openOnly: { type: 'boolean', description: 'Only open items (default true).' },
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Max items (default 200).' },
    },
    required: ['programId'],
  },
};

export const READ_VIGILANCE_TIMELINE: AnaTool = {
  name: 'read_vigilance_timeline',
  description:
    'Read the append-only vigilance timeline for a program — the ordered history of complaint/MDR/CAPA events (received, triaged, clock computed, filed, state changes, effectiveness verified, closed). Optionally scope to one entity. Use to reconstruct the audit history of a device safety matter.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID (required).' },
      entityType: { type: 'string', enum: VIGILANCE_ENTITY_TYPES, description: 'Optionally scope to one entity kind.' },
      entityId: { type: 'string', description: 'Optionally scope to one entity UUID.' },
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Max events.' },
    },
    required: ['programId'],
  },
};

export const CREATE_COMPLAINT: AnaTool = {
  name: 'create_complaint',
  description:
    'Log a device complaint into the post-market system. Creates the governed complaint record (with a preliminary reportability classification stamped automatically) and records the vigilance-timeline event. Use when the user wants to intake a complaint. Confirm the source, channel, and event narrative with the user before calling.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID.' },
      source: { type: 'string', enum: COMPLAINT_SOURCES },
      channel: { type: 'string', enum: COMPLAINT_CHANNELS },
      receivedAt: { type: 'string', description: 'ISO-8601 date/time the complaint was received.' },
      eventNarrative: { type: 'string', description: 'What happened.' },
      patientHarm: { type: 'string', enum: HARM_LEVELS },
      severityAssessment: { type: 'string', enum: SEVERITY_LEVELS },
      isMalfunction: { type: 'boolean' },
      anticipatesCorrection: { type: 'boolean' },
      trendThresholdCrossed: { type: 'boolean' },
      eventLocationCountry: { type: 'string' },
      deviceModel: { type: 'string' },
      deviceUdiDi: { type: 'string' },
      deviceLot: { type: 'string' },
    },
    required: ['programId', 'source', 'channel', 'receivedAt', 'eventNarrative'],
  },
};

export const OPEN_DEVICE_CAPA: AnaTool = {
  name: 'open_device_capa',
  description:
    'Open a device CAPA (Corrective And Preventive Action) record. Creates the governed CAPA in the open state and records the vigilance-timeline event. Use when the user wants to initiate a CAPA (e.g. escalated from a complaint or an audit finding). Confirm the title, type, and source with the user.',
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID.' },
      title: { type: 'string' },
      type: { type: 'string', enum: CAPA_TYPES },
      source: { type: 'string', enum: CAPA_SOURCES },
      summary: { type: 'string' },
      problemStatement: { type: 'string' },
      riskLevel: { type: 'string', enum: RISK_LEVELS },
      assignedTo: { type: 'string' },
      targetCloseDate: { type: 'string', description: 'Optional ISO-8601 target close date.' },
    },
    required: ['programId', 'title', 'type', 'source'],
  },
};

/** All CAPA/MDR/vigilance tools, spread into ALL_ANA_TOOLS. */
export const CAPA_MDR_TOOLS: AnaTool[] = [
  ASSESS_MDR_REPORTABILITY,
  TRIAGE_CAPA_MDR_QUEUE,
  READ_VIGILANCE_TIMELINE,
  CREATE_COMPLAINT,
  OPEN_DEVICE_CAPA,
];
