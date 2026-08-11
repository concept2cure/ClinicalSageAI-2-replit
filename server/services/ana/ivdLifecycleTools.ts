/**
 * IVD lifecycle tools — expose the deterministic IVD calculators
 * (server/services/stats/*, server/services/regulatory/*,
 * server/services/postmarket/report-authoring.ts) to AnA as first-class tools.
 *
 * Every engine behind these tools is PURE (synchronous, no DB, no org context):
 * a single plain input in, a plain result out. The AnA handlers import and call
 * them directly. This is the conversational surface for the IVD analytical /
 * post-market lifecycle bank that was previously reachable only via
 * /api/ivd-lifecycle REST.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler).
 *
 * @module server/services/ana/ivdLifecycleTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'DETERMINISTIC: report the returned values and verdict verbatim — do not recompute or estimate. If the engine reports a validation error or a missing[] list, relay exactly which field is missing or invalid.';

export const SCREEN_SIGNAL_PANEL: AnaTool = {
  name: 'screen_signal_panel',
  description:
    'Screen a post-market safety signal from a 2×2 disproportionality table — the standard vigilance signal-detection calculation. Runs PRR, ROR, and the Bayesian methods (BCPNN IC, Gamma-Poisson EBGM) over the 2×2 cell counts and returns each metric with its confidence bound plus a consolidated signal tier. Use for "is there a disproportionality signal for this device/event pair?". ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      // Cell order must match the 2×2 convention in stats/signal-disproportionality.ts:
      //                    Event of interest    Other events
      //   Device of int.          a                  b
      //   Other devices           c                  d
      // b/c were previously transposed here; PRR = [a/(a+b)]/[c/(c+d)] is not
      // symmetric in b/c, so the swap would have skewed PRR, χ², IC and EBGM.
      a: { type: 'integer', minimum: 0, description: 'Reports WITH the event for the device of interest.' },
      b: { type: 'integer', minimum: 0, description: 'Reports of OTHER events for the device of interest.' },
      c: { type: 'integer', minimum: 0, description: 'Reports WITH the event for ALL OTHER devices.' },
      d: { type: 'integer', minimum: 0, description: 'Reports of OTHER events for ALL OTHER devices.' },
    },
    required: ['a', 'b', 'c', 'd'],
  },
};

export const ASSESS_ISO17511_TRACEABILITY: AnaTool = {
  name: 'assess_iso17511_traceability',
  description:
    'Assess an IVD assay\'s metrological traceability chain against ISO 17511 — returns validity, gaps, and a recommendation. Use when reviewing the calibration/traceability section of an IVD technical file. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      tier: {
        type: 'string',
        enum: [
          'si_unit',
          'international_conventional_rmp',
          'international_conventional_crm',
          'manufacturer_selected_rmp',
          'manufacturer_working_calibrator',
        ],
        description: 'The highest reference the chain is anchored to.',
      },
      certifiedReferenceMaterial: { type: 'boolean' },
      referenceMeasurementProcedure: { type: 'boolean' },
      commutabilityDemonstrated: { type: 'boolean' },
      uncertaintyBudgetDocumented: { type: 'boolean' },
      unbrokenChain: { type: 'boolean' },
    },
    required: [
      'tier',
      'certifiedReferenceMaterial',
      'referenceMeasurementProcedure',
      'commutabilityDemonstrated',
      'uncertaintyBudgetDocumented',
      'unbrokenChain',
    ],
  },
};

export const ASSESS_SCIENTIFIC_VALIDITY: AnaTool = {
  name: 'assess_scientific_validity',
  description:
    'Assess the scientific validity of an IVD analyte↔clinical-condition association (IVDR Annex XIII) from the supporting evidence — returns a verdict (established / supported / insufficient) and gaps. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      analyte: { type: 'string' },
      clinicalCondition: { type: 'string' },
      intendedPurpose: { type: 'string' },
      evidence: {
        type: 'array',
        description: 'The body of evidence supporting the association.',
        items: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              enum: [
                'guidelines_consensus',
                'systematic_review_meta',
                'peer_reviewed_studies',
                'proof_of_concept',
                'expert_opinion',
              ],
            },
            reference: { type: 'string' },
            subjects: { type: 'integer', minimum: 0 },
            directlyOnTarget: { type: 'boolean' },
          },
          required: ['source', 'reference', 'directlyOnTarget'],
        },
      },
    },
    required: ['analyte', 'clinicalCondition', 'intendedPurpose', 'evidence'],
  },
};

export const DETERMINE_ASSAY_CUTOFF: AnaTool = {
  name: 'determine_assay_cutoff',
  description:
    'Determine an assay decision cutoff from scored observations with known class labels — returns the optimal cutoff plus sensitivity, specificity, and Youden J at that cutoff. Requires both positive and negative observations. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      observations: {
        type: 'array',
        minItems: 2,
        description: 'Scored samples with their true class.',
        items: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            positive: { type: 'boolean', description: 'True if the sample is truly positive.' },
          },
          required: ['score', 'positive'],
        },
      },
    },
    required: ['observations'],
  },
};

export const ASSESS_SHELF_LIFE_STABILITY: AnaTool = {
  name: 'assess_shelf_life_stability',
  description:
    'Assess real-time stability / shelf-life from measured timepoints — fits the degradation trend and reports the supportable shelf-life against the allowed percent change. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      points: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          properties: {
            time: { type: 'number', description: 'Elapsed time (e.g. months).' },
            value: { type: 'number', description: 'Measured value at that time.' },
          },
          required: ['time', 'value'],
        },
      },
      initialValue: { type: 'number', description: 'Value at t=0. Defaults to the first point.' },
      maxPercentChange: { type: 'number', exclusiveMinimum: 0, description: 'Allowed percent change from initial before the claim fails.' },
    },
    required: ['points', 'maxPercentChange'],
  },
};

export const ASSESS_ACCELERATED_STABILITY: AnaTool = {
  name: 'assess_accelerated_stability',
  description:
    'Project shelf-life from accelerated (Arrhenius) stability data — extrapolates rate constants at elevated temperatures to the storage temperature and reports the projected shelf-life against a degradation threshold. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      points: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          properties: {
            temperatureC: { type: 'number' },
            rateConstant: { type: 'number', exclusiveMinimum: 0 },
          },
          required: ['temperatureC', 'rateConstant'],
        },
      },
      storageTemperatureC: { type: 'number' },
      degradationThreshold: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, description: 'Fraction degraded that defines end of shelf-life (0–1).' },
    },
    required: ['points', 'storageTemperatureC', 'degradationThreshold'],
  },
};

export const GENERATE_DECLARATION_OF_CONFORMITY: AnaTool = {
  name: 'generate_declaration_of_conformity',
  description:
    'Generate an EU MDR/IVDR Declaration of Conformity from the manufacturer/product/conformity inputs — returns the structured declaration, or valid:false with the missing[] fields when incomplete. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      manufacturerName: { type: 'string' },
      manufacturerAddress: { type: 'string' },
      srn: { type: 'string', description: 'Single Registration Number.' },
      productName: { type: 'string' },
      basicUdiDi: { type: 'string' },
      riskClass: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      notifiedBodyNumber: { type: 'string' },
      certificateNumber: { type: 'string' },
      conformityRoute: { type: 'string' },
      standardsApplied: { type: 'array', items: { type: 'string' } },
    },
    required: ['manufacturerName', 'manufacturerAddress', 'productName', 'basicUdiDi', 'riskClass', 'conformityRoute', 'standardsApplied'],
  },
};

export const BUILD_POSTMARKET_REPORT: AnaTool = {
  name: 'build_postmarket_report',
  description:
    'Draft a device/IVD post-market regulatory report — eMDR (US FDA), MIR (EU manufacturer incident report), FSN (field safety notice), or PSUR (periodic safety update). Returns the structured report payload, or valid:false with the missing[] required fields when incomplete. Set reportType and provide that report\'s fields. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      reportType: { type: 'string', enum: ['emdr', 'mir', 'fsn', 'psur'], description: 'Which report to build.' },
      fields: {
        type: 'object',
        description:
          "The report's fields. eMDR: manufacturerName, deviceBrandName, eventType(death|serious_injury|malfunction), becameAwareDate, eventDescription, reportType(initial|supplemental|followup). MIR: manufacturerName, deviceName, incidentType(serious_incident|fsca), becameAwareDate, incidentDescription. FSN: manufacturerName, deviceName, affectedLots[], actionType(recall|software_update|advisory|modification|return), reasonForAction, riskToHealth, recommendedUserAction, contactDetails. PSUR: deviceName, riskClass, reportingPeriodStart, reportingPeriodEnd, complaintCount, seriousIncidentCount, fscaCount, signalsDetected, benefitRiskConclusion.",
      },
    },
    required: ['reportType', 'fields'],
  },
};

/** All IVD lifecycle tools, spread into ALL_ANA_TOOLS. */
export const IVD_LIFECYCLE_TOOLS: AnaTool[] = [
  SCREEN_SIGNAL_PANEL,
  ASSESS_ISO17511_TRACEABILITY,
  ASSESS_SCIENTIFIC_VALIDITY,
  DETERMINE_ASSAY_CUTOFF,
  ASSESS_SHELF_LIFE_STABILITY,
  ASSESS_ACCELERATED_STABILITY,
  GENERATE_DECLARATION_OF_CONFORMITY,
  BUILD_POSTMARKET_REPORT,
];
