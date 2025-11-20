import { object, string } from 'yup';

// Create ICH eCTD Module structure schemas
// Module 1 schema - Administrative Information
const module1Schema = object({
  'cover-letter.pdf': string().required('Module 1 requires a cover letter'),
  'application-form.pdf': string().required('Module 1 requires an application form'),
  'product-information.pdf': string().optional(),
  'labeling.pdf': string().optional(),
  'administrative-documents.pdf': string().optional(),
}).noUnknown(false); // Allow additional files beyond required ones

// Module 2 schema - CTD Summaries
const module2Schema = object({
  'ctd-toc.pdf': string().required('Module 2 requires a CTD Table of Contents'),
  'quality-overall-summary.pdf': string().optional(),
  'nonclinical-overview.pdf': string().optional(),
  'clinical-overview.pdf': string().optional(),
}).noUnknown(false);

// Module 3 schema - Quality
const module3Schema = object({
  'drug-substance.pdf': string().optional(),
  'drug-product.pdf': string().optional(),
  'regional-information.pdf': string().optional(),
}).noUnknown(false);

// Module 4 schema - Nonclinical Study Reports
const module4Schema = object({
  'study-reports.pdf': string().optional(),
  'literature-references.pdf': string().optional(),
}).noUnknown(false);

// Module 5 schema - Clinical Study Reports
const module5Schema = object({
  'study-reports.pdf': string().optional(),
  'literature-references.pdf': string().optional(),
}).noUnknown(false);

// Complete ICH eCTD structure schema
const ichSchema = object({
  M1: module1Schema.required('Module 1 (Administrative Information) is required'),
  M2: module2Schema.required('Module 2 (CTD Summaries) is required'),
  M3: module3Schema.optional(),
  M4: module4Schema.optional(),
  M5: module5Schema.optional(),
}).noUnknown(false);

export { ichSchema, module1Schema, module2Schema, module3Schema, module4Schema, module5Schema };
