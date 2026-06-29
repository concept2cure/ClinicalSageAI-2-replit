/**
 * HEOR / market-access modeling tools — exposes the comparator-mix engines in
 * `server/services/heor/market-access-models.ts` to AnA as first-class tools.
 *
 * These complement the single-comparator HEOR tools in extendedRegulatoryTools.ts
 * (`model_budget_impact`, `model_cost_effectiveness`) by adding the two payer
 * capabilities those lack: a *mix* of comparators (the displaced standard of care
 * is a basket, not one option) with optional population growth and discounting,
 * and a cost-utility comparison that always reports net monetary benefit at a
 * required willingness-to-pay threshold. Each tool is a thin, validated wrapper
 * over a pure deterministic engine — the numbers are reproducible and
 * submission-defensible. Handlers live in AnaToolExecutor.ts (registerToolHandler)
 * and dynamic-import `../heor/market-access-models` through the runStatsTool
 * deterministic envelope.
 *
 * Tools:
 *   model_budget_impact_mix     — multi-year net budget impact vs a comparator mix
 *   model_cost_effectiveness_nmb — ICER + dominance + net monetary benefit at a WTP
 *
 * @module server/services/ana/heorTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic engine — report the returned figures verbatim; do not recompute, round differently, or estimate. Costs are in the caller-supplied currency unit. If the engine reports a validation error, relay exactly which parameter is missing or invalid and ask the user for it.';

export const MODEL_BUDGET_IMPACT_MIX: AnaTool = {
  name: 'model_budget_impact_mix',
  description:
    "Compute a multi-year budget-impact model for a payer where the displaced standard of care is a MIX of comparators (each with its own market share and per-patient cost). For payer/AMCP dossiers, esp. MDX/diagnostics. Inputs: eligible population, a per-year uptake curve, the new-world per-patient cost, and the comparator mix; optionally annual population growth and a discount rate. Returns per-year and cumulative NET budget impact (undiscounted and discounted) — a negative cumulative value means the new intervention is cost-saving to the payer. Use this (rather than model_budget_impact) when the comparator is a basket of options. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      eligiblePopulation: {
        type: 'number',
        description: 'Eligible patients in the payer population in year 1 (≥ 0).',
      },
      uptakeCurve: {
        type: 'array',
        items: { type: 'number' },
        description: 'New-intervention market share per year, each in [0,1]; array length = horizon years (≥ 1).',
      },
      newPerPatientCost: {
        type: 'number',
        description: 'All-in per-patient cost of the new world (test + downstream treatment), ≥ 0.',
      },
      comparatorMix: {
        type: 'array',
        description: 'The displaced standard of care as a mix of comparators; shares must sum to 1.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Optional comparator label (reporting only).' },
            share: { type: 'number', description: 'Share of the comparator basket (0–1).' },
            perPatientCost: { type: 'number', description: 'Per-patient cost of this comparator (≥ 0).' },
          },
          required: ['share', 'perPatientCost'],
        },
      },
      populationGrowth: {
        type: 'number',
        description: 'Annual eligible-population growth rate (e.g. 0.02 = 2%/yr). Default 0.',
      },
      discountRate: {
        type: 'number',
        description: 'Annual discount rate for future-year impact (e.g. 0.03). Default 0 (undiscounted).',
      },
    },
    required: ['eligiblePopulation', 'uptakeCurve', 'newPerPatientCost', 'comparatorMix'],
  },
};

export const MODEL_COST_EFFECTIVENESS_NMB: AnaTool = {
  name: 'model_cost_effectiveness_nmb',
  description:
    "Compute incremental cost-effectiveness with a REQUIRED willingness-to-pay threshold: incremental cost (ΔC), incremental effectiveness (ΔE, e.g. QALYs), the ICER (ΔC/ΔE, null when ΔE = 0), the dominance verdict (dominant = cheaper and better; dominated = costlier and worse), the net monetary benefit (NMB = WTP×ΔE − ΔC), and whether the intervention is cost-effective at that WTP (NMB ≥ 0). NMB is the controlling figure because it stays well-defined where the ICER's sign is ambiguous across quadrants. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      interventionCost: { type: 'number', description: 'Total per-patient cost of the intervention arm.' },
      interventionEffectiveness: { type: 'number', description: 'Per-patient effectiveness of the intervention (e.g. QALYs).' },
      comparatorCost: { type: 'number', description: 'Total per-patient cost of the comparator arm.' },
      comparatorEffectiveness: { type: 'number', description: 'Per-patient effectiveness of the comparator (e.g. QALYs).' },
      willingnessToPay: { type: 'number', description: 'WTP per effectiveness unit (e.g. $/QALY), ≥ 0. Drives the NMB and verdict.' },
      effectivenessUnit: { type: 'string', description: "Effectiveness unit label, reporting only. Default 'QALY'." },
    },
    required: ['interventionCost', 'interventionEffectiveness', 'comparatorCost', 'comparatorEffectiveness', 'willingnessToPay'],
  },
};

/** HEOR / market-access modeling tools, spread into ALL_ANA_TOOLS. */
export const HEOR_MARKET_ACCESS_TOOLS: AnaTool[] = [
  MODEL_BUDGET_IMPACT_MIX,
  MODEL_COST_EFFECTIVENESS_NMB,
];
