/**
 * CAPA + complaint + MDR/vigilance schema.
 *
 * Models the single-intake quality-event triage workflow that ships against
 * MDX_DESIGN_BACKLOG.md Wave 1 item 8. Universal-coverage tablestakes for
 * every MDX client segment.
 *
 * Regulatory backbone:
 *   - 21 CFR 820.198 — complaint files (FDA QSR)
 *   - 21 CFR 820.100 — corrective and preventive action (FDA QSR)
 *   - 21 CFR 803     — Medical Device Reporting (FDA): 5-day reportable for
 *                      life-threatening, 30-calendar-day reportable for serious
 *                      injury or death
 *   - 21 CFR 806     — corrections and removals (FDA): 10-business-day notice
 *   - EU MDR Reg 2017/745 Article 87 — serious-incident reporting:
 *                      2 days (serious public-health threat), 10 days (death or
 *                      unanticipated serious deterioration), 15 days (other
 *                      serious incidents)
 *   - ISO 13485 §8.2 — feedback and complaint handling
 *   - ISO 14971 §10  — production and post-production information feeding
 *                      back into the risk-management file
 *
 * Five core tables:
 *
 *   complaints              — single intake from any source (customer, clinical,
 *                             field service, regulator, literature, internal)
 *   mdr_events              — FDA 803 / EU 87 reportable events with computed
 *                             reportability clocks
 *   capa_records            — corrective and preventive action master records
 *   capa_actions            — action items inside a CAPA (containment,
 *                             corrective, preventive, training, supplier, etc.)
 *   vigilance_events        — append-only event timeline shared across all
 *                             three flows for inspector-grade audit trail
 *
 * Tenant isolation matches the q-sub / post-market pattern: tables carry only
 * program_id, and the service layer JOINs regulatoryPrograms.organization_id
 * before every read or write.
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  index,
  uniqueIndex,
  json,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations — kept inline so the API can validate without a join.
// ─────────────────────────────────────────────────────────────────────────────

/** Where the complaint came from. */
export const COMPLAINT_SOURCES = [
  'customer',
  'distributor',
  'clinical_trial',
  'internal',
  'regulator',
  'literature',
  'service',
  'other',
] as const;

/** How the complaint reached the company. */
export const COMPLAINT_CHANNELS = [
  'phone',
  'email',
  'web_form',
  'service_call',
  'salesforce',
  'servicenow',
  'mail',
  'in_person',
  'other',
] as const;

/** Patient-harm classification (preliminary). */
export const HARM_LEVELS = ['none', 'malfunction', 'injury', 'serious_injury', 'death'] as const;

/** Severity assessment (ISO 14971-style banding). */
export const SEVERITY_LEVELS = ['negligible', 'minor', 'serious', 'critical'] as const;

/** Complaint lifecycle. */
export const COMPLAINT_STATES = [
  'new',
  'triaged',
  'investigation',
  'resolved',
  'closed',
  'escalated_capa',
  'escalated_mdr',
] as const;

/** Jurisdictions for an MDR event. */
export const MDR_JURISDICTIONS = ['us_fda', 'eu_mdr', 'both', 'other'] as const;

/** US FDA 21 CFR 803 report types. */
export const FDA_MDR_REPORT_TYPES = [
  'initial_5day',
  'initial_30day',
  'supplemental',
  'followup',
  'annual',
  'not_reportable',
] as const;

/** EU MDR Article 87 severity classes — drive the 2/10/15-day clock. */
export const EU_MDR_SEVERITY = [
  'life_threatening_2day',
  'death_or_serious_10day',
  'other_serious_15day',
  'not_reportable',
] as const;

/** MDR event lifecycle. */
export const MDR_STATES = [
  'open',
  'preparing',
  'filed',
  'acknowledged',
  'followup_required',
  'closed',
] as const;

/** CAPA type per 21 CFR 820.100. */
export const CAPA_TYPES = ['corrective', 'preventive', 'both'] as const;

/** CAPA source — what triggered it. */
export const CAPA_SOURCES = [
  'complaint',
  'internal_audit',
  'external_audit',
  'mdr',
  'nonconformance',
  'management_review',
  'supplier',
  'inspection_finding',
  'risk_review',
  'trend_signal',
  'other',
] as const;

/** CAPA risk level. */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

/** CAPA lifecycle. */
export const CAPA_STATES = [
  'open',
  'investigation',
  'action_planned',
  'action_implemented',
  'effectiveness_check',
  'closed_effective',
  'closed_not_effective',
  'escalated',
] as const;

/** Action item lifecycle. */
export const ACTION_STATES = ['planned', 'in_progress', 'done', 'blocked', 'cancelled'] as const;

/** Action item type. */
export const ACTION_TYPES = [
  'containment',
  'corrective',
  'preventive',
  'training',
  'document_change',
  'process_change',
  'supplier_action',
  'communication',
  'verification',
  'other',
] as const;

/** Vigilance event kinds — append-only audit timeline. */
export const VIGILANCE_EVENT_KINDS = [
  'complaint_received',
  'complaint_triaged',
  'complaint_state_changed',
  'mdr_opened',
  'mdr_clock_computed',
  'mdr_filed',
  'mdr_acknowledged',
  'mdr_state_changed',
  'capa_opened',
  'capa_state_changed',
  'capa_action_added',
  'capa_action_completed',
  'capa_effectiveness_verified',
  'capa_closed',
  'note',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// complaints — single intake
// ─────────────────────────────────────────────────────────────────────────────

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant scoping — joined via regulatoryPrograms.organization_id at the
    // service layer (mirrors q-sub / post-market pattern).
    programId: text('program_id').notNull(),

    // Display identifier: e.g. CMP-2025-001. Service layer assigns.
    complaintCode: varchar('complaint_code', { length: 64 }).notNull(),

    // Intake metadata
    source: varchar('source', { length: 32 }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),

    // Reporter — JSON allows anonymous or full contact (name, role, email,
    // phone, organization, anonymous flag). Service validates shape.
    reporter: json('reporter'),

    // Device under complaint — UDI-DI is the canonical FDA 21 CFR 830 / EU
    // MDR Article 27 identifier; lot and serial are commonly captured.
    deviceUdiDi: varchar('device_udi_di', { length: 64 }),
    deviceLot: varchar('device_lot', { length: 64 }),
    deviceSerial: varchar('device_serial', { length: 128 }),
    deviceModel: varchar('device_model', { length: 128 }),

    // Event particulars
    eventDate: timestamp('event_date', { withTimezone: true }),
    eventLocationCountry: varchar('event_location_country', { length: 8 }),
    eventNarrative: text('event_narrative').notNull(),

    // Patient impact (preliminary — refined during triage)
    patientHarm: varchar('patient_harm', { length: 24 }).notNull().default('none'),
    severityAssessment: varchar('severity_assessment', { length: 24 })
      .notNull()
      .default('minor'),

    // Preliminary classification — populated by triageEngine on intake.
    // Shape: { fdaReportable: bool, mdrEuReportable: bool, requires806Notice: bool,
    //          rationale: string, autoComputed: bool, computedAt: ISO }
    preliminaryClassification: json('preliminary_classification'),

    // Triage decision — set by triageEngine when status moves to 'triaged'
    triageState: varchar('triage_state', { length: 32 }).notNull().default('new'),
    triageDecision: json('triage_decision'),
    // { route: 'mdr' | 'capa' | 'investigation_only' | 'no_action',
    //   reasonForChange: string, decidedBy: userId, decidedAt: ISO }
    triagedBy: text('triaged_by'),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),

    // Linked downstream records (soft FKs — populated when triage routes the
    // complaint somewhere; direction is complaint -> downstream so the
    // single-row complaint always points at the latest related record)
    linkedMdrEventId: uuid('linked_mdr_event_id'),
    linkedCapaId: uuid('linked_capa_id'),

    // Closure
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    closureReason: text('closure_reason'),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  t => ({
    byProgram: index('complaints_program_idx').on(t.programId),
    byState: index('complaints_state_idx').on(t.triageState),
    byReceived: index('complaints_received_idx').on(t.receivedAt),
    byUdi: index('complaints_udi_idx').on(t.deviceUdiDi),
    uniqueCode: uniqueIndex('complaints_code_uq').on(t.complaintCode),
    bySeverity: index('complaints_severity_idx').on(t.severityAssessment),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// mdr_events — FDA 803 + EU 87 reportable events with reportability clock
// ─────────────────────────────────────────────────────────────────────────────

export const mdrEvents = pgTable(
  'mdr_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: text('program_id').notNull(),
    mdrCode: varchar('mdr_code', { length: 64 }).notNull(),

    // Originating complaint (nullable — some MDRs originate without a
    // formal complaint, e.g. from internal trend analysis).
    sourceComplaintId: uuid('source_complaint_id').references(() => complaints.id, {
      onDelete: 'set null',
    }),

    // Where this report goes
    jurisdiction: varchar('jurisdiction', { length: 16 }).notNull(),

    // FDA 21 CFR 803 fields
    usFdaReportType: varchar('us_fda_report_type', { length: 24 }),
    fdaReportNumber: varchar('fda_report_number', { length: 64 }),
    // FDA Patient Code, Device Problem Code, Health Effect Code — see
    // FDA Adverse Event Codes catalog. Stored as text so codes don't have
    // to be joined to a reference table.
    fdaPatientCode: varchar('fda_patient_code', { length: 32 }),
    fdaDeviceProblemCode: varchar('fda_device_problem_code', { length: 32 }),
    fdaHealthEffectCode: varchar('fda_health_effect_code', { length: 32 }),

    // EU MDR Article 87 fields
    euMdrSeverity: varchar('eu_mdr_severity', { length: 32 }),
    euReportNumber: varchar('eu_report_number', { length: 64 }),

    // Reportability clock — the most important field on this table. Computed
    // by clockCalculator on creation or class change.
    decisionDate: timestamp('decision_date', { withTimezone: true }).notNull(),
    reportDueAt: timestamp('report_due_at', { withTimezone: true }),
    reportFiledAt: timestamp('report_filed_at', { withTimezone: true }),
    reportConfirmationCode: varchar('report_confirmation_code', { length: 128 }),
    // Days remaining (or negative when overdue) — denormalized for list
    // rendering; recomputed on read by service layer.
    daysToDue: integer('days_to_due'),

    // Narrative + outcome
    eventNarrative: text('event_narrative').notNull(),
    patientOutcome: text('patient_outcome'),
    correctionsTaken: text('corrections_taken'),

    // Attachments — array of vault file references.
    // Shape: [{ vaultArtifactId, name, size, hash, uploadedAt }]
    attachmentRefs: json('attachment_refs'),

    // Lifecycle
    state: varchar('state', { length: 32 }).notNull().default('open'),

    // Optional CAPA escalation
    linkedCapaId: uuid('linked_capa_id'),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  t => ({
    byProgram: index('mdr_events_program_idx').on(t.programId),
    byState: index('mdr_events_state_idx').on(t.state),
    byJurisdiction: index('mdr_events_jurisdiction_idx').on(t.jurisdiction),
    byDue: index('mdr_events_due_idx').on(t.reportDueAt),
    bySource: index('mdr_events_source_idx').on(t.sourceComplaintId),
    uniqueCode: uniqueIndex('mdr_events_code_uq').on(t.mdrCode),
    uniqueFdaNumber: uniqueIndex('mdr_events_fda_report_uq').on(t.fdaReportNumber),
    uniqueEuNumber: uniqueIndex('mdr_events_eu_report_uq').on(t.euReportNumber),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// capa_records — 21 CFR 820.100 corrective and preventive action records
// ─────────────────────────────────────────────────────────────────────────────

export const capaRecords = pgTable(
  'capa_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: text('program_id').notNull(),
    capaCode: varchar('capa_code', { length: 64 }).notNull(),

    // Description
    title: text('title').notNull(),
    summary: text('summary'),

    // Type + source
    type: varchar('type', { length: 16 }).notNull(),
    source: varchar('source', { length: 32 }).notNull(),
    // sourceRefs: json array — array of { kind, id, label } pointing at the
    // upstream record(s). Multiple complaints/MDRs can roll into one CAPA.
    sourceRefs: json('source_refs'),

    // Risk assessment (ISO 14971 link)
    riskLevel: varchar('risk_level', { length: 16 }).notNull().default('medium'),

    // Ownership + dates
    assignedTo: text('assigned_to'),
    targetCloseDate: timestamp('target_close_date', { withTimezone: true }),

    // Investigation + action plan (text or structured JSON)
    problemStatement: text('problem_statement'),
    containmentActions: text('containment_actions'),
    rootCauseAnalysis: json('root_cause_analysis'),
    correctiveActionPlan: text('corrective_action_plan'),

    // Effectiveness check (21 CFR 820.100(a)(4))
    effectivenessCheckCriteria: text('effectiveness_check_criteria'),
    effectivenessCheckResult: json('effectiveness_check_result'),
    // { verifiedAt, verifiedBy, outcome: 'effective'|'not_effective'|'inconclusive',
    //   evidenceRefs, narrative }

    // Lifecycle
    state: varchar('state', { length: 32 }).notNull().default('open'),

    // Closure
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  t => ({
    byProgram: index('capa_records_program_idx').on(t.programId),
    byState: index('capa_records_state_idx').on(t.state),
    byRisk: index('capa_records_risk_idx').on(t.riskLevel),
    bySource: index('capa_records_source_idx').on(t.source),
    byTarget: index('capa_records_target_idx').on(t.targetCloseDate),
    uniqueCode: uniqueIndex('capa_records_code_uq').on(t.capaCode),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// capa_actions — individual action items within a CAPA
// ─────────────────────────────────────────────────────────────────────────────

export const capaActions = pgTable(
  'capa_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capaId: uuid('capa_id')
      .notNull()
      .references(() => capaRecords.id, { onDelete: 'cascade' }),

    // Sequence within the CAPA (1, 2, 3 …) for stable ordering.
    n: integer('n').notNull(),

    type: varchar('type', { length: 32 }).notNull(),
    description: text('description').notNull(),

    owner: text('owner'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),

    // Verification evidence — link to vault artifacts proving the action
    // happened (training record, updated SOP, supplier letter, test report).
    evidenceRefs: json('evidence_refs'),

    state: varchar('state', { length: 16 }).notNull().default('planned'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({
    byCapa: index('capa_actions_capa_idx').on(t.capaId),
    byState: index('capa_actions_state_idx').on(t.state),
    byOwner: index('capa_actions_owner_idx').on(t.owner),
    uniqByN: uniqueIndex('capa_actions_capa_n_uq').on(t.capaId, t.n),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// vigilance_events — append-only event timeline
// ─────────────────────────────────────────────────────────────────────────────

export const vigilanceEvents = pgTable(
  'vigilance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: text('program_id').notNull(),

    // What happened
    kind: varchar('kind', { length: 48 }).notNull(),

    // What it happened to. Polymorphic — the entity is always one of
    // complaint, mdr_event, capa_record, capa_action.
    entityType: varchar('entity_type', { length: 24 }).notNull(),
    entityId: uuid('entity_id').notNull(),

    // Actor
    actor: text('actor'),
    actorRole: varchar('actor_role', { length: 32 }),

    // Timing
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    // Free-form payload — varies by kind. Service layer documents the
    // expected shape per kind in service/capa-mdr/eventPayloads.ts.
    payload: json('payload'),

    // Reason-for-change (21 CFR Part 11 §11.10(e))
    reason: text('reason'),

    // Cryptographic signature (optional — populated when an e-signature
    // accompanies the event, e.g. CAPA closure with sign-off).
    signatureId: uuid('signature_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({
    byProgram: index('vigilance_events_program_idx').on(t.programId),
    byEntity: index('vigilance_events_entity_idx').on(t.entityType, t.entityId),
    byKind: index('vigilance_events_kind_idx').on(t.kind),
    byOccurred: index('vigilance_events_occurred_idx').on(t.occurredAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const complaintsRelations = relations(complaints, ({ many, one }) => ({
  mdrEvents: many(mdrEvents),
  linkedMdr: one(mdrEvents, {
    fields: [complaints.linkedMdrEventId],
    references: [mdrEvents.id],
  }),
  linkedCapa: one(capaRecords, {
    fields: [complaints.linkedCapaId],
    references: [capaRecords.id],
  }),
}));

export const mdrEventsRelations = relations(mdrEvents, ({ one }) => ({
  sourceComplaint: one(complaints, {
    fields: [mdrEvents.sourceComplaintId],
    references: [complaints.id],
  }),
  linkedCapa: one(capaRecords, {
    fields: [mdrEvents.linkedCapaId],
    references: [capaRecords.id],
  }),
}));

export const capaRecordsRelations = relations(capaRecords, ({ many }) => ({
  actions: many(capaActions),
}));

export const capaActionsRelations = relations(capaActions, ({ one }) => ({
  capa: one(capaRecords, {
    fields: [capaActions.capaId],
    references: [capaRecords.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Insert schemas + types
// ─────────────────────────────────────────────────────────────────────────────

export const insertComplaintSchema = createInsertSchema(complaints, {
  source: z.enum(COMPLAINT_SOURCES),
  channel: z.enum(COMPLAINT_CHANNELS),
  patientHarm: z.enum(HARM_LEVELS),
  severityAssessment: z.enum(SEVERITY_LEVELS),
  triageState: z.enum(COMPLAINT_STATES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMdrEventSchema = createInsertSchema(mdrEvents, {
  jurisdiction: z.enum(MDR_JURISDICTIONS),
  usFdaReportType: z.enum(FDA_MDR_REPORT_TYPES).optional().nullable(),
  euMdrSeverity: z.enum(EU_MDR_SEVERITY).optional().nullable(),
  state: z.enum(MDR_STATES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertCapaRecordSchema = createInsertSchema(capaRecords, {
  type: z.enum(CAPA_TYPES),
  source: z.enum(CAPA_SOURCES),
  riskLevel: z.enum(RISK_LEVELS),
  state: z.enum(CAPA_STATES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertCapaActionSchema = createInsertSchema(capaActions, {
  type: z.enum(ACTION_TYPES),
  state: z.enum(ACTION_STATES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertVigilanceEventSchema = createInsertSchema(vigilanceEvents, {
  kind: z.enum(VIGILANCE_EVENT_KINDS),
}).omit({ id: true, createdAt: true });

export type Complaint = InferSelectModel<typeof complaints>;
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type MdrEvent = InferSelectModel<typeof mdrEvents>;
export type InsertMdrEvent = z.infer<typeof insertMdrEventSchema>;
export type CapaRecord = InferSelectModel<typeof capaRecords>;
export type InsertCapaRecord = z.infer<typeof insertCapaRecordSchema>;
export type CapaAction = InferSelectModel<typeof capaActions>;
export type InsertCapaAction = z.infer<typeof insertCapaActionSchema>;
export type VigilanceEvent = InferSelectModel<typeof vigilanceEvents>;
export type InsertVigilanceEvent = z.infer<typeof insertVigilanceEventSchema>;

export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];
export type ComplaintChannel = (typeof COMPLAINT_CHANNELS)[number];
export type HarmLevel = (typeof HARM_LEVELS)[number];
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export type ComplaintState = (typeof COMPLAINT_STATES)[number];
export type MdrJurisdiction = (typeof MDR_JURISDICTIONS)[number];
export type FdaMdrReportType = (typeof FDA_MDR_REPORT_TYPES)[number];
export type EuMdrSeverity = (typeof EU_MDR_SEVERITY)[number];
export type MdrState = (typeof MDR_STATES)[number];
export type CapaType = (typeof CAPA_TYPES)[number];
export type CapaSource = (typeof CAPA_SOURCES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type CapaState = (typeof CAPA_STATES)[number];
export type ActionState = (typeof ACTION_STATES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];
export type VigilanceEventKind = (typeof VIGILANCE_EVENT_KINDS)[number];
