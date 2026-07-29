-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: drop the duplicate clinical_* evidence lineage wherever it exists
-- Date: 2026-07-27
--
-- WHY THIS EXISTS
-- migrations/20260725_clinical_regulatory_evidence.sql created a PARALLEL
-- evidence graph (clinical_evidence_sources + seven siblings, UUID-keyed) one
-- day after the cre_* spine (20260724_clinical_regulatory_evidence_spine.sql)
-- created the same domain with SERIAL ids. The two were never reconciled:
--
--   · every real data flow — CRL ingestion, CSR projection, chat-upload source
--     identity, citations — writes cre_*;
--   · the clinical_* writer (a second CSR adapter) had zero callers;
--   · the facade functions reading clinical_* were hardcoded empty stubs except
--     one coverage count over tables no durable path ever applied;
--   · concretely: the CRL Library surface searched findings through the
--     clinical_* facade while CRL ingestion wrote cre_regulatory_findings, so
--     an ingested letter could never reach the surface built to show it.
--
-- The recorded decision (2026-07-26) is that cre_evidence_sources, via its
-- service, is THE canonical source object. The drizzle definitions and the
-- 20260725 migration file have been removed from the repo; this migration
-- removes any copy of the eight tables that a preview branch or a `db:push`ed
-- development database materialized. Such copies hold at most data written by
-- tests — no production path ever wrote them (the writer had no callers).
--
-- IDEMPOTENT and safe where the tables never existed (every known durable
-- database): every statement is IF EXISTS, dropped in reverse dependency
-- order. No enum types: the 20260725 file declared none (checked).
--
-- ROLLBACK: none. Restoring a second evidence lineage is not a supported
-- state; the domain is served by the cre_* spine.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS design_lessons;
DROP TABLE IF EXISTS evidence_relationships;
DROP TABLE IF EXISTS regulatory_application_outcomes;
DROP TABLE IF EXISTS regulatory_findings;
DROP TABLE IF EXISTS regulatory_applications;
DROP TABLE IF EXISTS study_result_observations;
DROP TABLE IF EXISTS clinical_study_identities;
DROP TABLE IF EXISTS clinical_evidence_sources;
