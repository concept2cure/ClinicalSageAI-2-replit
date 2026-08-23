/**
 * Type definitions for CMC Module components
 *
 * This file contains shared type definitions used across CMC module components.
 */

import { z } from 'zod';

// Formulation types
export const formulationSchema = z.object({
  dosageForm: z.string().min(1).max(100),
  routeOfAdministration: z.string().min(1).max(100),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        function: z.string().min(1).max(200),
        amount: z.string().min(1).max(100),
      })
    )
    .optional(),
});

// Molecule structure types
export const molecularStructureSchema = z.object({
  moleculeName: z.string().min(2, {
    message: 'Molecule name must be at least 2 characters.',
  }),
  molecularFormula: z.string().min(2, {
    message: 'Molecular formula is required.',
  }),
  smiles: z.string().optional(),
  inchi: z.string().optional(),
  molecularWeight: z.string().optional(),
  synthesisPathway: z.string().optional(),
  analyticalMethods: z.array(z.string()).default([]),
  formulation: formulationSchema.optional(),
});

// Process data types
export const processDataSchema = z.object({
  processType: z.enum(['batch', 'continuous']),
  processSteps: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          units: z.string().optional(),
          controlRange: z.string().optional(),
        })
      ),
      equipment: z
        .array(
          z.object({
            name: z.string(),
            type: z.string(),
            capacity: z.string().optional(),
          })
        )
        .optional(),
      materials: z
        .array(
          z.object({
            name: z.string(),
            function: z.string(),
            amount: z.string().optional(),
            grade: z.string().optional(),
          })
        )
        .optional(),
      criticalParameters: z.array(z.string()).optional(),
    })
  ),
  controlStrategy: z.string().optional(),
  validationApproach: z.string().optional(),
});

// Analytical methods types
export const analyticalMethodSchema = z.object({
  methodName: z.string(),
  methodType: z.enum(['HPLC', 'GC', 'MS', 'NMR', 'IR', 'UV', 'DSC', 'XRD', 'Other']),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        units: z.string().optional(),
      })
    )
    .optional(),
  validationStatus: z
    .enum(['validated', 'verification', 'development', 'technology-transfer'])
    .optional(),
  purpose: z.string(),
  description: z.string().optional(),
});

// Document types for the Blueprint Generator
export const documentTypeSchema = z.enum([
  // Drug Substance sections
  's.1',
  's.1.1',
  's.1.2',
  's.1.3',
  's.2',
  's.2.1',
  's.2.2',
  's.2.3',
  's.2.4',
  's.2.5',
  's.2.6',
  's.3',
  's.3.1',
  's.3.2',
  's.4',
  's.4.1',
  's.4.2',
  's.4.3',
  's.4.4',
  's.4.5',
  's.5',
  's.6',
  's.7',
  // Drug Product sections
  'p.1',
  'p.2',
  'p.3',
  'p.4',
  'p.5',
  'p.6',
  'p.7',
  'p.8',
]);

// Change Impact Simulator types
export const changeTypeSchema = z.enum([
  'api_supplier_change',
  'process_scale_up',
  'excipient_replacement',
  'analytical_method_change',
  'facility_change',
  'equipment_change',
  'process_parameter_change',
  'specification_change',
  'packaging_change',
  'stability_protocol_change',
  'other',
]);

export const regulatoryMarketSchema = z.enum([
  'fda',
  'ema',
  'pmda',
  'nmpa',
  'anvisa',
  'health_canada',
  'uk_mhra',
  'who',
  'other',
]);

export const changeImpactSchema = z.object({
  changeType: changeTypeSchema,
  description: z.string(),
  affectedDocuments: z.array(z.string()).optional(),
  affectedParameters: z.array(z.string()).optional(),
  markets: z.array(regulatoryMarketSchema).default(['fda']),
  currentState: z.string().optional(),
  proposedState: z.string().optional(),
});

// Manufacturing Intelligence Tuner types
export const manufacturingDataSchema = z.object({
  batchRecords: z
    .array(
      z.object({
        batchNumber: z.string(),
        process: z.string(),
        product: z.string(),
        date: z.string(),
        parameters: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
            units: z.string().optional(),
            specification: z.string().optional(),
            deviation: z.boolean().default(false),
          })
        ),
        outcomes: z
          .object({
            yield: z.string().optional(),
            purity: z.string().optional(),
            success: z.boolean().default(true),
            notes: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
  processes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        steps: z.array(z.string()),
        equipment: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

// Preclinical to Process Translator types
export const preclinicalDataSchema = z.object({
  formulationDescription: z.string(),
  scaleSize: z.string(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.string(),
      function: z.string().optional(),
    })
  ),
  preparationMethod: z.string(),
  analyticalMethods: z.array(z.string()).optional(),
  stabilityData: z.string().optional(),
  targetDosageForm: z.string(),
});

// Global Compliance types
export const complianceDocumentSchema = z.object({
  documentType: z.string(),
  content: z.string(),
  baseRegion: z.enum(['ich', 'fda', 'ema', 'pmda', 'other']),
  targetRegions: z.array(regulatoryMarketSchema),
  formatPreferences: z
    .object({
      useLocalTerminology: z.boolean().default(true),
      includeRegionalAnnexes: z.boolean().default(true),
      standardizeUnits: z.boolean().default(true),
    })
    .optional(),
});

// Audit Risk Monitor types
export const documentAuditSchema = z.object({
  documentId: z.string(),
  documentType: z.string(),
  content: z.string(),
  relatedDocuments: z.array(z.string()).optional(),
  lastUpdated: z.string().optional(),
  author: z.string().optional(),
  version: z.string().optional(),
});

export default {
  molecularStructureSchema,
  formulationSchema,
  processDataSchema,
  analyticalMethodSchema,
  documentTypeSchema,
  changeTypeSchema,
  regulatoryMarketSchema,
  changeImpactSchema,
  manufacturingDataSchema,
  preclinicalDataSchema,
  complianceDocumentSchema,
  documentAuditSchema,
};
