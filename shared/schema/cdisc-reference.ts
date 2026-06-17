/**
 * CDISC Reference Tables Schema
 *
 * This file re-exports the ACTIVE CDISC (Clinical Data Interchange Standards
 * Consortium) tables for regulatory standards compliance.
 *
 * Included Standard:
 * - PRM (Protocol Representation Model) - Study design
 *
 * USAGE:
 * The PRM subset (`cdisc_prm_*`) backs the study-design spine consumed by
 * `server/services/study-design/study-design-repository.ts`.
 *
 * HISTORY:
 * ~32 unused CDISC reference tables (CDASH, CSR, ADaM, eCTD, IND, Compliance,
 * Docs, PQ, Device, Task) had zero references in routes/services and were
 * removed (GitHub issue #846). See the dated migration under `migrations/`.
 *
 * Tables: 5 (PRM subset)
 * Status: Active
 *
 * @module shared/schema/cdisc-reference
 */

// NOTE: Table definitions live in shared/schema.ts. This file serves as
// documentation and a clean domain import path for the PRM subset.

export const CDISC_TABLES = [
  'cdiscPrmStudies',
  'cdiscPrmStudyArms',
  'cdiscPrmEpochs',
  'cdiscPrmVisits',
  'cdiscPrmEndpoints',
] as const;

export type CdiscTableName = typeof CDISC_TABLES[number];

// Re-export from main schema (tables remain in schema.ts).
// This provides a clean import path while maintaining backward compatibility.
export {
  cdiscPrmStudies,
  cdiscPrmStudyArms,
  cdiscPrmEpochs,
  cdiscPrmVisits,
  cdiscPrmEndpoints,
} from '../schema';
