/**
 * Device / IVD submission + coding tools — exposes engines that were built and
 * tested but had NO AnA tool surface (the model could not reach them):
 *
 *   assemble_device_submission -> pathway-engines/device-assembly/assembleDeviceSubmission
 *       Honest 510(k)/De Novo/PMA eSTAR assembly state: which producible artifact
 *       (official eSTAR vs loose content draft vs none), section readiness,
 *       official-template gate, optional market overlay, and every blocker.
 *       Deterministic, no render/transmit — mirrors the eCTD dispatch-gate.
 *
 *   score_predicate_adequacy   -> regulatory/predicate-adequacy.scorePredicateAdequacy
 *       Ranks candidate predicates for substantial-equivalence adequacy with a
 *       fixed, inspectable rubric. Screening aid, not a determination.
 *
 *   code_drug                  -> NLM RxNorm/RxNav (open, public-domain terminology)
 *       Normalizes a free-text drug name to standardized RxNorm concepts
 *       (RxCUI + name + term type). The open-source alternative for drug coding
 *       where a licensed WHODrug dictionary is not available. (MedDRA has no open
 *       equivalent; the platform's ICD-10 service covers diagnosis/condition coding.)
 *
 * Definitions only — handlers live in AnaToolExecutor.ts (registerToolHandler).
 *
 * @module server/services/ana/deviceSubmissionTools
 */

import type { AnaTool } from '../ai-gateway/types';
import { PMA_SUBMISSION_TYPES } from '../pathway-engines/pma/pma-mapper';

const DETERMINISTIC_NOTE =
  'Report the returned values verbatim. Do NOT recompute or soften them. If the engine reports a validation error or a blocker, relay it exactly and ask the user for any missing input rather than guessing.';

export const ASSEMBLE_DEVICE_SUBMISSION: AnaTool = {
  name: 'assemble_device_submission',
  description:
    "Compute the HONEST assembly state of a 510(k), De Novo or PMA eSTAR submission using the DETERMINISTIC device-assembly engine. Given the canonical content leaves (section code + title) and which official FDA eSTAR templates are present, it returns the producible artifactKind ('official-estar' = sections complete AND official template available; 'content-package-draft' = content exists but no official template, NOT submittable; 'none' = required content missing), whether an official eSTAR can be produced, the section readiness summary (eSTAR slots for 510(k)/De Novo; the 21 CFR 814 PMA modules for a PMA), the template-availability gate, an optional target-market readiness overlay, and a de-duplicated list of every blocker. It does NOT render or transmit anything — it tells you exactly what can be assembled and what blocks a submittable artifact. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      pathway: { type: 'string', enum: ['510k', 'de_novo', 'pma'], description: 'FDA device pathway: 510(k), De Novo, or PMA (scored against the 21 CFR 814 modules). EU MDR/IVDR technical documentation is a separate tool.' },
      pmaSubmissionType: {
        type: 'string',
        enum: PMA_SUBMISSION_TYPES.map((t) => t.value),
        description: "PMA only: original application vs a 21 CFR 814.39 supplement/notice, which scopes the modules the filing owes. Defaults to 'original'.",
      },
      variant: { type: 'string', enum: ['device', 'ivd'], description: 'Selects the official eSTAR template variant (device vs IVD).' },
      leaves: {
        type: 'array',
        description: 'Canonical content leaves to project onto the eSTAR section tree.',
        items: {
          type: 'object',
          properties: {
            sectionCode: { type: 'string', description: 'eSTAR section code (e.g. "DEVICE_DESCRIPTION").' },
            title: { type: 'string', description: 'Human-readable section/leaf title.' },
            documentType: { type: 'string', description: 'Optional document type for the leaf.' },
          },
          required: ['sectionCode', 'title'],
        },
      },
      presentTemplates: { type: 'array', items: { type: 'string' }, description: 'Official eSTAR template filenames present in the drop-point (omit if none).' },
      market: { type: 'string', description: 'Optional target market id for a readiness overlay (e.g. "us-fda", "eu-mdr-ivdr", "jp-pmda").' },
      availableArtifacts: { type: 'array', items: { type: 'string' }, description: 'Artifact ids available, for the market-readiness overlay.' },
      environment: { type: 'string', enum: ['staging', 'production'], description: 'Build environment. "production" gates the official-template requirement.' },
    },
    required: ['pathway', 'variant', 'leaves'],
  },
};

export const SCORE_PREDICATE_ADEQUACY: AnaTool = {
  name: 'score_predicate_adequacy',
  description:
    "Score and rank candidate 510(k)/De Novo predicate devices for SUBSTANTIAL-EQUIVALENCE adequacy using a DETERMINISTIC, inspectable rubric (product code 30, intended use 25, technological characteristics 20, review panel 8, clearance recency 7, decision type 6, adverse status 4; sum=100). You supply the structured comparison signals (you have read both device descriptions); the engine combines them with fixed weights and returns, per candidate, a 0–100 score, an adequacy band (≥75 adequate / ≥50 marginal / else inadequate), the per-factor point breakdown with rationale, strengths, concerns, and which factors were unknown (scored 0, never assumed favourable). Use to pick the strongest predicate and expose weak points before filing. This is a SCREENING AID, not a regulatory determination — report the disclaimer. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        description: 'Candidate predicates to score. At least one required.',
        items: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: '510(k)/De Novo id, e.g. "K203456" / "DEN200012".' },
            deviceName: { type: 'string', description: 'Optional device name for the report.' },
            sameProductCode: { type: 'boolean', description: 'Subject and predicate share the same FDA product code.' },
            intendedUseAlignment: { type: 'string', enum: ['same', 'similar', 'different', 'unknown'], description: 'Intended-use / indications-for-use alignment.' },
            technologyAlignment: { type: 'string', enum: ['same', 'similar', 'different', 'unknown'], description: 'Technological-characteristics alignment.' },
            samePanel: { type: 'boolean', description: 'Reviewed by the same FDA advisory panel / medical specialty.' },
            clearanceYear: { type: 'number', description: 'Calendar year the predicate was cleared/granted.' },
            decision: { type: 'string', enum: ['SE', 'NSE', 'DENOVO_GRANT', 'other', 'unknown'], description: "The predicate's own FDA decision." },
            adverseStatus: { type: 'boolean', description: 'Predicate is recalled / withdrawn / subject to a safety action.' },
          },
          required: ['identifier'],
        },
      },
      currentYear: { type: 'number', description: 'Optional "now" for recency scoring (defaults to the current year).' },
    },
    required: ['candidates'],
  },
};

export const CODE_DRUG: AnaTool = {
  name: 'code_drug',
  description:
    "Normalize a free-text drug/substance name to standardized RxNorm concepts using the NLM RxNav API (open, public-domain US drug terminology — the open alternative when a licensed WHODrug dictionary is not configured). Returns candidate matches with RxCUI, normalized name, term type (e.g. IN ingredient, SCD clinical drug, BN brand name), and an approximate-match score, best match first. Use for coding drug names in safety/CSR tables and ICSR drafting. Reports an honest 'no match' / network-error status rather than guessing a code — never fabricate an RxCUI. NOTE: RxNorm is US-centric; for diagnosis/condition coding use the ICD-10 tools, and for MedDRA (proprietary) coding use a licensed dictionary.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Drug or substance name to code (free text), e.g. "atorvastatin 20 mg tablet".' },
      max_results: { type: 'number', description: 'Maximum candidate concepts to return (default 8, max 20).' },
    },
    required: ['name'],
  },
};

/** Device-submission + coding tools, spread into ALL_ANA_TOOLS. */
export const DEVICE_SUBMISSION_TOOLS: AnaTool[] = [
  ASSEMBLE_DEVICE_SUBMISSION,
  SCORE_PREDICATE_ADEQUACY,
  CODE_DRUG,
];
