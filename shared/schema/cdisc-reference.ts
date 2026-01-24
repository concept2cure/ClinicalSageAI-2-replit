/**
 * CDISC Reference Tables Schema
 * 
 * This file contains CDISC (Clinical Data Interchange Standards Consortium)
 * reference tables for regulatory standards compliance.
 * 
 * Included Standards:
 * - PRM (Protocol Representation Model) - Study design
 * - CDASH (Clinical Data Acquisition Standards Harmonization)
 * - CSR (Clinical Study Report) templates
 * - ADaM (Analysis Data Model) specifications
 * - eCTD (electronic Common Technical Document) metadata
 * - IND (Investigational New Drug) integration
 * - Compliance rules and validation
 * - Product Quality (PQ) domains
 * - Medical Device domains
 * - Task management
 * 
 * USAGE:
 * These tables are READ-ONLY reference data for regulatory compliance.
 * They have zero active usages in the codebase (verified 2025-01-24).
 * 
 * Tables: 37
 * Status: Reference/Future Use
 * 
 * @module shared/schema/cdisc-reference
 */

// NOTE: Tables are defined in shared/schema.ts (lines 8696-9720)
// This file serves as documentation until full extraction is complete.
// 
// Tables included:
// - cdiscPrmStudies, cdiscPrmStudyArms, cdiscPrmEpochs, cdiscPrmVisits, cdiscPrmEndpoints
// - cdiscCdashForms, cdiscCdashFields, cdiscCdashSdtmMappings
// - cdiscCsrTemplates, cdiscCsrTfl, cdiscCsrSap
// - cdiscAdamSpecs
// - cdiscEctdDefineXml, cdiscEctdDatasets, cdiscEctdReviewersGuide, cdiscEctdSdsp
// - cdiscIndIntegration, cdiscIndSend, cdiscIndIss, cdiscIndIse
// - cdiscComplianceRules, cdiscComplianceResults, cdiscComplianceAgencyPrefs, cdiscComplianceVersions
// - cdiscDocsRepository, cdiscDocsAcrf, cdiscDocsDefineArtifacts
// - cdiscPqDomains, cdiscPqStability, cdiscPqManufacturing
// - cdiscDeviceDx, cdiscDeviceDe, cdiscDeviceRelationships
// - cdiscTaskDeliverables, cdiscTaskMilestones, cdiscTaskWorkflows, cdiscTaskValidationQueue

export const CDISC_TABLES = [
  'cdiscPrmStudies',
  'cdiscPrmStudyArms', 
  'cdiscPrmEpochs',
  'cdiscPrmVisits',
  'cdiscPrmEndpoints',
  'cdiscCdashForms',
  'cdiscCdashFields',
  'cdiscCdashSdtmMappings',
  'cdiscCsrTemplates',
  'cdiscCsrTfl',
  'cdiscCsrSap',
  'cdiscAdamSpecs',
  'cdiscEctdDefineXml',
  'cdiscEctdDatasets',
  'cdiscEctdReviewersGuide',
  'cdiscEctdSdsp',
  'cdiscIndIntegration',
  'cdiscIndSend',
  'cdiscIndIss',
  'cdiscIndIse',
  'cdiscComplianceRules',
  'cdiscComplianceResults',
  'cdiscComplianceAgencyPrefs',
  'cdiscComplianceVersions',
  'cdiscDocsRepository',
  'cdiscDocsAcrf',
  'cdiscDocsDefineArtifacts',
  'cdiscPqDomains',
  'cdiscPqStability',
  'cdiscPqManufacturing',
  'cdiscDeviceDx',
  'cdiscDeviceDe',
  'cdiscDeviceRelationships',
  'cdiscTaskDeliverables',
  'cdiscTaskMilestones',
  'cdiscTaskWorkflows',
  'cdiscTaskValidationQueue',
] as const;

export type CdiscTableName = typeof CDISC_TABLES[number];

// Re-export from main schema for now (tables remain in schema.ts)
// This provides a clean import path while maintaining backward compatibility
export {
  cdiscPrmStudies,
  cdiscPrmStudyArms,
  cdiscPrmEpochs,
  cdiscPrmVisits,
  cdiscPrmEndpoints,
  cdiscCdashForms,
  cdiscCdashFields,
  cdiscCdashSdtmMappings,
  cdiscCsrTemplates,
  cdiscCsrTfl,
  cdiscCsrSap,
  cdiscAdamSpecs,
  cdiscEctdDefineXml,
  cdiscEctdDatasets,
  cdiscEctdReviewersGuide,
  cdiscEctdSdsp,
  cdiscIndIntegration,
  cdiscIndSend,
  cdiscIndIss,
  cdiscIndIse,
  cdiscComplianceRules,
  cdiscComplianceResults,
  cdiscComplianceAgencyPrefs,
  cdiscComplianceVersions,
  cdiscDocsRepository,
  cdiscDocsAcrf,
  cdiscDocsDefineArtifacts,
  cdiscPqDomains,
  cdiscPqStability,
  cdiscPqManufacturing,
  cdiscDeviceDx,
  cdiscDeviceDe,
  cdiscDeviceRelationships,
  cdiscTaskDeliverables,
  cdiscTaskMilestones,
  cdiscTaskWorkflows,
  cdiscTaskValidationQueue,
} from '../schema';
