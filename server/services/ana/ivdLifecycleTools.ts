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
import { IVDR_CLASSES } from '../../../shared/regulatory/device-class.js';

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
      // b/c were previously transposed here. PRR = [a/(a+b)]/[c/(c+d)] is not
      // symmetric in b/c, so the swap changes PRR and its CI — and with them the
      // frequentist signal flag and the consolidated panel tier. ROR (ad/bc), the
      // Yates χ² and both Bayesian methods (IC, EBGM — keyed off the expected
      // count E = (a+b)(a+c)/N) ARE invariant under a b↔c transpose, which is
      // precisely why a transposed table still returned plausible-looking output.
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
    'Assess an IVD assay\'s metrological traceability chain against ISO 17511 — returns validity, gaps, and a recommendation. Every input is required: a missing or non-boolean fact, or an unknown tier, is refused by name, never read as false. Use when reviewing the calibration/traceability section of an IVD technical file. ' +
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
      certifiedReferenceMaterial: { type: 'boolean', description: 'A certified reference material is identified at the top of the chain. Required, true or false.' },
      referenceMeasurementProcedure: { type: 'boolean', description: 'A reference measurement procedure is documented. Required, true or false.' },
      commutabilityDemonstrated: { type: 'boolean', description: 'Commutability with clinical samples is demonstrated. Required, true or false.' },
      uncertaintyBudgetDocumented: { type: 'boolean', description: 'Uncertainty is propagated to the end-user result. Required, true or false.' },
      unbrokenChain: { type: 'boolean', description: 'Each step is value-assigned by the step above. Required, true or false.' },
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
    'Assess the scientific validity of an IVD analyte↔clinical-condition association (IVDR Annex XIII) from the supporting evidence — returns a verdict (established / supported / insufficient) and gaps. Each evidence item needs a listed source and directlyOnTarget true or false; an item missing either, or evidence that is not a list, is refused by field. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      analyte: { type: 'string' },
      clinicalCondition: { type: 'string' },
      intendedPurpose: { type: 'string', description: 'Not read by the engine.' },
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
            reference: { type: 'string', description: 'Not read by the engine.' },
            subjects: { type: 'integer', minimum: 0, description: 'Not read by the engine.' },
            directlyOnTarget: { type: 'boolean', description: 'Whether the item directly concerns the claimed analyte–condition link. Required, true or false.' },
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
    'Assess real-time stability / shelf-life from measured timepoints — fits the degradation trend and reports the supportable shelf-life against the allowed percent change. A point whose time is not a number of 0 or more or whose value is not a number, fewer than two distinct times, or a missing or non-positive maxPercentChange is refused by field. ' +
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
      initialValue: { type: 'number', description: 'Value at t=0 (non-zero). If omitted, the regression intercept is used, and initialValueSource says so.' },
      maxPercentChange: { type: 'number', exclusiveMinimum: 0, description: 'Allowed percent change from initial before the claim fails. Required.' },
    },
    required: ['points', 'maxPercentChange'],
  },
};

export const ASSESS_ACCELERATED_STABILITY: AnaTool = {
  name: 'assess_accelerated_stability',
  description:
    'Project shelf-life from accelerated (Arrhenius) stability data — extrapolates rate constants at elevated temperatures to the storage temperature and reports the projected shelf-life against a degradation threshold. A point whose temperature or rate constant is out of range, fewer than two distinct temperatures, or a missing storage temperature or threshold is refused by field. ' +
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
      riskClass: { type: 'string', enum: [...IVDR_CLASSES] },
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
    'Draft a device/IVD post-market regulatory report — eMDR (US FDA), MIR (EU manufacturer incident report) or FSN (field safety notice). Returns the structured report payload, or valid:false with the missing[] required fields when incomplete. Set reportType and provide that report\'s fields. A PSUR is not built here: it is a program\'s post-market document, authored with the post_market.document.create command (documentType "psur"). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      reportType: { type: 'string', enum: ['emdr', 'mir', 'fsn'], description: 'Which report to build.' },
      fields: {
        type: 'object',
        description:
          "The report's fields. eMDR: manufacturerName, deviceBrandName, eventType(death|serious_injury|malfunction), becameAwareDate, eventDescription, reportType(initial|supplemental|followup). MIR: manufacturerName, deviceName, incidentType(serious_incident|fsca), becameAwareDate, incidentDescription. FSN: manufacturerName, deviceName, affectedLots[], actionType(recall|software_update|advisory|modification|return), reasonForAction, riskToHealth, recommendedUserAction, contactDetails.",
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
