/**
 * Cross-document reconciliation tools — expose the deterministic dossier number
 * reconciler (`server/services/reconciliation/dossier-number-reconciler.ts`) to
 * AnA as a first-class, selectable tool.
 *
 * The recurring reviewer finding the existing consistency tools do NOT cover:
 * a quantity reported with different values ACROSS a submission's documents
 * (enrolled N in Module 2.5 ≠ 2.7.3 ≠ CSR). `check_numerical_integrity` catches
 * this within ONE document; `check_dossier_consistency` does a pairwise draft-vs
 * -artifact check; the prose-mining `reconcile_dossier_numbers` tool extracts
 * labeled figures from raw document TEXT. This tool instead reconciles a set of
 * ALREADY-EXTRACTED, structured figures (from OCR / table parsing / data-lineage
 * citations) across the whole dossier — with per-figure provenance spans, a
 * configurable agreement tolerance, and a plurality consensus the prose variant
 * does not provide. Handler lives in AnaToolExecutor.ts (registerToolHandler) and
 * dynamic-imports the reconciler engine.
 *
 * @module server/services/ana/reconciliationTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Report the returned conflicts and values verbatim. Do NOT recompute or estimate — a missed cross-document number mismatch is a recurring reviewer finding (an RTF trigger when it is enrolment N or dose). If the engine reports a validation error, relay exactly which figure field is missing or invalid and ask the user for it.';

export const RECONCILE_EXTRACTED_FIGURES: AnaTool = {
  name: 'reconcile_extracted_figures',
  description:
    "Reconcile already-EXTRACTED, structured numbers ACROSS a submission's documents to flag figures that disagree between modules — the recurring reviewer finding where the same quantity (e.g. enrolled N) differs between Module 2.5, Module 2.7.3, and the CSR. DETERMINISTIC: groups figures by quantityKey, detects values that diverge beyond a configurable absolute/relative tolerance, and returns, per quantityKey, the distinct values with their sources, a consensus (plurality) value when one exists, and a severity. This is the CROSS-MODULE reconciliation that check_numerical_integrity (within one document) and check_dossier_consistency (pairwise draft vs artifact) lack. Unlike reconcile_dossier_numbers (which mines labeled figures from raw document TEXT), this takes figures ALREADY extracted upstream (by OCR / table parsing / data-lineage citations) with explicit provenance spans, and applies a configurable agreement tolerance. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      figures: {
        type: 'array',
        description:
          'The extracted numbers to reconcile. Each is one number attached to the quantity it measures and the document/module it came from.',
        items: {
          type: 'object',
          properties: {
            quantityKey: {
              type: 'string',
              description:
                "Canonical key for the quantity this number measures (e.g. 'enrolled_n', 'primary_endpoint_effect', 'dose_mg', 'noael'). Figures are reconciled WITHIN a key, never across keys — use the same key for the same quantity in every document.",
            },
            value: { type: 'number', description: 'The numeric value as extracted.' },
            unit: { type: 'string', description: 'Optional unit (%, mg, mg/kg …). Mismatched units for the same quantity are flagged.' },
            source: {
              type: 'object',
              description: 'Where this figure was found, for traceability.',
              properties: {
                documentId: { type: 'string', description: 'Originating document id (artifact id or file name).' },
                module: { type: 'string', description: "CTD module when known (e.g. '2.5', '2.7.3')." },
                section: { type: 'string', description: 'Section / table / heading within the document.' },
                span: { type: 'string', description: 'Character span or page/line locator within the source.' },
              },
              required: ['documentId'],
            },
          },
          required: ['quantityKey', 'value', 'source'],
        },
      },
      tolerance: {
        type: 'object',
        description:
          'Optional agreement tolerance. Two values agree (are NOT flagged) when within either bound. Default 0/0 ⇒ exact equality.',
        properties: {
          absolute: { type: 'number', description: 'Absolute tolerance: |a − b| ≤ absolute ⇒ agree. Default 0.' },
          relative: { type: 'number', description: 'Relative tolerance: |a − b| / max(|a|,|b|) ≤ relative ⇒ agree. Default 0.' },
        },
      },
    },
    required: ['figures'],
  },
};

/** All cross-document reconciliation tools, spread into ALL_ANA_TOOLS. */
export const RECONCILIATION_TOOLS: AnaTool[] = [RECONCILE_EXTRACTED_FIGURES];
