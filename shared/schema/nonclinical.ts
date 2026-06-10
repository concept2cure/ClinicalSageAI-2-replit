/**
 * Nonclinical Study Management + SEND (Capability C2C-04)
 *
 * A GOVERNED, submission-linked nonclinical (tox/pharmacology) study registry and
 * its SEND (CDISC Standard for Exchange of Nonclinical Data) dataset packaging.
 * This is distinct from `ctd_nonclinical_studies` (the AI-extraction landing
 * zone, program-keyed): this layer is the curated, audited record that links a
 * study to its authorizing IACUC protocol (provenance) and forward into CTD
 * Module 4 — closing the roadmap gap "GLP tox data disconnected from submission;
 * SEND built late."
 *
 * Grounded in ICH M4 (CTD Module 4 organization), ICH S-series nonclinical
 * guidances, and the CDISC SENDIG + FDA Study Data Technical Conformance Guide.
 * Conventions match the platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/nonclinical
 */

import { boolean, index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';
import { iacucProtocols } from './iacuc';

export type NonclinicalStudyType =
  | 'single_dose_tox'
  | 'repeat_dose_tox'
  | 'safety_pharmacology'
  | 'genotoxicity'
  | 'carcinogenicity'
  | 'reproductive_tox'
  | 'local_tolerance'
  | 'adme_pk'
  | 'immunotoxicity'
  | 'other';

export type NonclinicalStudyStatus = 'planned' | 'in_life' | 'in_reporting' | 'finalized' | 'cancelled';
export type SendValidationStatus = 'not_validated' | 'passed' | 'warnings' | 'errors';

// ─── Nonclinical studies (governed registry) ─────────────────────────────────

export const nonclinicalStudies = pgTable(
  'nonclinical_studies',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** The CTD submission this study supports (Module 4). */
    submissionId: integer('submission_id').references(() => submissions.id),
    /** The IACUC protocol that authorized the in-vivo work, when applicable. */
    iacucProtocolId: integer('iacuc_protocol_id').references(() => iacucProtocols.id),
    studyNumber: text('study_number').notNull(),
    title: text('title').notNull(),
    studyType: text('study_type').$type<NonclinicalStudyType>().notNull(),
    species: text('species'),
    glpCompliant: boolean('glp_compliant').notNull().default(false),
    testingFacility: text('testing_facility'),
    noael: text('noael'),
    status: text('status').$type<NonclinicalStudyStatus>().notNull().default('planned'),
    /** Derived CTD Module 4 section (e.g. 4.2.3.2). Persisted for the index. */
    ctdSection: text('ctd_section'),
    reportFinalizedDate: date('report_finalized_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_nonclinical_studies_org').on(t.organizationId),
    submissionIdx: index('idx_nonclinical_studies_submission').on(t.submissionId),
    iacucIdx: index('idx_nonclinical_studies_iacuc').on(t.iacucProtocolId),
  })
);

export type NonclinicalStudy = typeof nonclinicalStudies.$inferSelect;
export type NewNonclinicalStudy = typeof nonclinicalStudies.$inferInsert;

// ─── SEND datasets (CDISC) ───────────────────────────────────────────────────

export const sendDatasets = pgTable(
  'send_datasets',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    studyId: integer('study_id').notNull().references(() => nonclinicalStudies.id),
    /** SENDIG version, e.g. '3.1'. */
    sendigVersion: text('sendig_version').notNull().default('3.1'),
    /** Domain codes present in the package, e.g. ['DM','EX','BW','CL','LB','MI']. */
    domainsPresent: text('domains_present').array().notNull().default([]),
    defineXmlPresent: boolean('define_xml_present').notNull().default(false),
    nsdrcPresent: boolean('nsdrc_present').notNull().default(false), // nonclinical study data reviewer's guide
    validationStatus: text('validation_status').$type<SendValidationStatus>().notNull().default('not_validated'),
    validatorErrorCount: integer('validator_error_count').notNull().default(0),
    validatorWarningCount: integer('validator_warning_count').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_send_datasets_org').on(t.organizationId),
    studyIdx: index('idx_send_datasets_study').on(t.studyId),
  })
);

export type SendDataset = typeof sendDatasets.$inferSelect;
export type NewSendDataset = typeof sendDatasets.$inferInsert;
