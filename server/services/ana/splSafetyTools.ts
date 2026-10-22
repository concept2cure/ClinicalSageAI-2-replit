/**
 * AnA tool definitions for SPL generation and PSUR/DSUR safety reports.
 *
 * Four deterministic tools:
 *  - generate_spl_xml        — build FDA SPL XML from product info
 *  - validate_spl_structure  — validate SPL XML structural completeness
 *  - generate_psur_structure — ICH E2C(R2) PSUR report structure
 *  - generate_dsur_structure — ICH E2F DSUR report structure
 *
 * Spread into ALL_ANA_TOOLS via AnaToolDefinitions.ts.
 *
 * @module server/services/ana/splSafetyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network.';

export const GENERATE_SPL_XML: AnaTool = {
  name: 'generate_spl_xml',
  description: `Generate a valid FDA SPL (Structured Product Labeling) XML skeleton from product information including name, NDC, active ingredients, indications, contraindications, warnings, dosage, route, and manufacturer. ${DETERMINISTIC_NOTE}`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'Product trade name or proprietary name.',
      },
      ndc: {
        type: 'string',
        description: 'National Drug Code (NDC) in 10-digit format (optional).',
      },
      // 2026-10-15: neither was declared, so every SPL AnA built carried version 1
      // and the generation date — the generator's stand-ins, named in its `warnings`.
      version: {
        type: 'integer',
        minimum: 1,
        description:
          'Version of this labeling under its setId; FDA expects it to advance with each new version of the same label. State it when known — if omitted the SPL carries 1 and the result warns.',
      },
      effectiveDate: {
        type: 'string',
        description:
          "The labeling's effective date, YYYY-MM-DD. State it when known — if omitted the SPL carries the generation date and the result warns.",
      },
      activeIngredients: {
        type: 'array',
        description: 'List of active ingredients with name and optional strength.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingredient name (INN or USAN).' },
            strength: { type: 'string', description: 'Strength with units, e.g. "10 mg".' },
          },
          required: ['name'],
        },
      },
      indications: {
        type: 'string',
        description: 'Indications and usage text for the labeling.',
      },
      contraindications: {
        type: 'string',
        description: 'Contraindications text for the labeling.',
      },
      warnings: {
        type: 'string',
        description: 'Warnings and precautions text for the labeling.',
      },
      dosage: {
        type: 'string',
        description: 'Dosage and administration text for the labeling.',
      },
      route: {
        type: 'string',
        description: 'Route of administration (e.g. "oral", "intravenous").',
      },
      manufacturer: {
        type: 'string',
        description: 'Manufacturer / labeler organization name.',
      },
    },
    required: [
      'productName',
      'activeIngredients',
      'indications',
      'contraindications',
      'warnings',
      'dosage',
      'manufacturer',
    ],
  },
};

export const VALIDATE_SPL_STRUCTURE: AnaTool = {
  name: 'validate_spl_structure',
  description: `Validate an SPL XML string for structural completeness. Checks for root element, document id, component/section presence, and required LOINC section codes. ${DETERMINISTIC_NOTE}`,
  input_schema: {
    type: 'object',
    properties: {
      xml: {
        type: 'string',
        description: 'The SPL XML document string to validate.',
      },
    },
    required: ['xml'],
  },
};

export const GENERATE_PSUR_STRUCTURE: AnaTool = {
  name: 'generate_psur_structure',
  description: `Generate the complete ICH E2C(R2) PSUR (Periodic Safety Update Report) structure with all 19 required sections, guidance text, and reporting period metadata. ${DETERMINISTIC_NOTE}`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'Product trade name.',
      },
      substanceName: {
        type: 'string',
        description: 'Active substance INN name.',
      },
      reportingPeriodStart: {
        type: 'string',
        description: 'Reporting period start date (ISO 8601, e.g. "2024-01-01").',
      },
      reportingPeriodEnd: {
        type: 'string',
        description: 'Reporting period end date (ISO 8601, e.g. "2024-12-31").',
      },
      marketingAuthorizations: {
        type: 'array',
        description: 'List of marketing authorizations held for this product.',
        items: {
          type: 'object',
          properties: {
            country: { type: 'string', description: 'Country of authorization.' },
            holderName: { type: 'string', description: 'Marketing authorization holder name.' },
            approvalDate: { type: 'string', description: 'Date of first approval (ISO 8601).' },
          },
          required: ['country', 'holderName', 'approvalDate'],
        },
      },
    },
    required: [
      'productName',
      'substanceName',
      'reportingPeriodStart',
      'reportingPeriodEnd',
      'marketingAuthorizations',
    ],
  },
};

export const GENERATE_DSUR_STRUCTURE: AnaTool = {
  name: 'generate_dsur_structure',
  description: `Generate the complete ICH E2F DSUR (Development Safety Update Report) structure with all required sections, guidance text, and reporting period metadata. ${DETERMINISTIC_NOTE}`,
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'Investigational product name.',
      },
      substanceName: {
        type: 'string',
        description: 'Active substance INN name.',
      },
      developmentPhase: {
        type: 'string',
        description: 'Current development phase (e.g. "Phase 1", "Phase 2", "Phase 3").',
      },
      reportingPeriodStart: {
        type: 'string',
        description: 'Reporting period start date (ISO 8601, e.g. "2024-01-01").',
      },
      reportingPeriodEnd: {
        type: 'string',
        description: 'Reporting period end date (ISO 8601, e.g. "2024-12-31").',
      },
    },
    required: [
      'productName',
      'substanceName',
      'developmentPhase',
      'reportingPeriodStart',
      'reportingPeriodEnd',
    ],
  },
};

/** SPL & safety-report tools, spread into ALL_ANA_TOOLS. */
export const SPL_SAFETY_TOOLS: AnaTool[] = [
  GENERATE_SPL_XML,
  VALIDATE_SPL_STRUCTURE,
  GENERATE_PSUR_STRUCTURE,
  GENERATE_DSUR_STRUCTURE,
];
