import { z } from 'zod';

// Create ICH eCTD Module structure schemas
// Module 1 schema - Administrative Information
const module1Schema = z.object({
  'cover-letter.pdf': z.unknown().refine((v) => v != null, { message: 'Module 1 requires a cover letter' }),
  'application-form.pdf': z.unknown().refine((v) => v != null, { message: 'Module 1 requires an application form' }),
  'product-information.pdf': z.unknown().optional(),
  'labeling.pdf': z.unknown().optional(),
  'administrative-documents.pdf': z.unknown().optional(),
}).passthrough(); // Allow additional files beyond required ones

// Module 2 schema - CTD Summaries
const module2Schema = z.object({
  'ctd-toc.pdf': z.unknown().refine((v) => v != null, { message: 'Module 2 requires a CTD Table of Contents' }),
  'quality-overall-summary.pdf': z.unknown().optional(),
  'nonclinical-overview.pdf': z.unknown().optional(),
  'clinical-overview.pdf': z.unknown().optional(),
}).passthrough();

// Module 3 schema - Quality
const module3Schema = z.object({
  'drug-substance.pdf': z.unknown().optional(),
  'drug-product.pdf': z.unknown().optional(),
  'regional-information.pdf': z.unknown().optional(),
}).passthrough();

// Module 4 schema - Nonclinical Study Reports
const module4Schema = z.object({
  'study-reports.pdf': z.unknown().optional(),
  'literature-references.pdf': z.unknown().optional(),
}).passthrough();

// Module 5 schema - Clinical Study Reports
const module5Schema = z.object({
  'study-reports.pdf': z.unknown().optional(),
  'literature-references.pdf': z.unknown().optional(),
}).passthrough();

// Complete ICH eCTD structure schema
const ichSchema = z.object({
  M1: module1Schema,
  M2: module2Schema,
  M3: module3Schema.optional(),
  M4: module4Schema.optional(),
  M5: module5Schema.optional(),
}).passthrough();

export { ichSchema, module1Schema, module2Schema, module3Schema, module4Schema, module5Schema };
