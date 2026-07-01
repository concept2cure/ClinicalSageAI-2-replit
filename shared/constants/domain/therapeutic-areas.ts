/**
 * Therapeutic Areas — canonical domain vocabulary.
 *
 * 25 therapeutic-area entries with MedDRA SOC mapping where applicable.
 * Used by the intelligence question engine, project metadata, and protocol
 * design flows to constrain and label therapeutic-area selections.
 *
 * @module shared/constants/domain/therapeutic-areas
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type TherapeuticArea =
  | 'oncology'
  | 'cardiology'
  | 'neurology'
  | 'psychiatry'
  | 'immunology'
  | 'infectious_disease'
  | 'rare_disease'
  | 'metabolic'
  | 'respiratory'
  | 'dermatology'
  | 'gastroenterology'
  | 'ophthalmology'
  | 'hematology'
  | 'nephrology'
  | 'urology'
  | 'obstetrics_gynecology'
  | 'musculoskeletal'
  | 'pain'
  | 'gene_cell_therapy'
  | 'vaccines'
  | 'endocrinology'
  | 'allergy'
  | 'transplant'
  | 'dental'
  | 'other';

export const THERAPEUTIC_AREAS: DomainEntry<TherapeuticArea>[] = [
  {
    value: 'oncology',
    label: 'Oncology / Hematologic Malignancies',
    description: 'Solid tumors, hematologic malignancies, and immuno-oncology.',
    codingRef: 'MedDRA SOC: Neoplasms benign, malignant and unspecified (incl cysts and polyps)',
  },
  {
    value: 'cardiology',
    label: 'Cardiovascular',
    description: 'Heart failure, arrhythmia, coronary artery disease, and vascular disorders.',
    codingRef: 'MedDRA SOC: Cardiac disorders',
  },
  {
    value: 'neurology',
    label: 'Neurology / CNS',
    description: 'Neurodegenerative diseases, epilepsy, stroke, and movement disorders.',
    codingRef: 'MedDRA SOC: Nervous system disorders',
  },
  {
    value: 'psychiatry',
    label: 'Psychiatry / Behavioral Health',
    description: 'Depression, anxiety, schizophrenia, ADHD, and substance use disorders.',
    codingRef: 'MedDRA SOC: Psychiatric disorders',
  },
  {
    value: 'immunology',
    label: 'Immunology / Rheumatology',
    description: 'Autoimmune diseases, rheumatoid arthritis, lupus, and inflammatory conditions.',
    codingRef: 'MedDRA SOC: Immune system disorders',
  },
  {
    value: 'infectious_disease',
    label: 'Infectious Disease',
    description: 'Bacterial, viral, fungal, and parasitic infections including HIV and hepatitis.',
    codingRef: 'MedDRA SOC: Infections and infestations',
  },
  {
    value: 'rare_disease',
    label: 'Rare Disease / Orphan',
    description: 'Diseases affecting fewer than 200,000 individuals in the US (Orphan Drug Act).',
  },
  {
    value: 'metabolic',
    label: 'Metabolic / Endocrinology',
    description: 'Inborn errors of metabolism, lipid disorders, and metabolic syndrome.',
    codingRef: 'MedDRA SOC: Metabolism and nutrition disorders',
  },
  {
    value: 'respiratory',
    label: 'Respiratory / Pulmonology',
    description: 'Asthma, COPD, pulmonary fibrosis, and cystic fibrosis.',
    codingRef: 'MedDRA SOC: Respiratory, thoracic and mediastinal disorders',
  },
  {
    value: 'dermatology',
    label: 'Dermatology',
    description: 'Psoriasis, atopic dermatitis, acne, and skin cancers.',
    codingRef: 'MedDRA SOC: Skin and subcutaneous tissue disorders',
  },
  {
    value: 'gastroenterology',
    label: 'Gastroenterology / Hepatology',
    description: 'IBD, IBS, NAFLD/NASH, liver disease, and GI cancers.',
    codingRef: 'MedDRA SOC: Gastrointestinal disorders',
  },
  {
    value: 'ophthalmology',
    label: 'Ophthalmology',
    description: 'Macular degeneration, glaucoma, diabetic retinopathy, and dry eye disease.',
    codingRef: 'MedDRA SOC: Eye disorders',
  },
  {
    value: 'hematology',
    label: 'Hematology / Non-Malignant',
    description: 'Anemia, hemophilia, sickle cell disease, and thrombocytopenia.',
    codingRef: 'MedDRA SOC: Blood and lymphatic system disorders',
  },
  {
    value: 'nephrology',
    label: 'Nephrology',
    description: 'Chronic kidney disease, dialysis, and glomerulonephritis.',
    codingRef: 'MedDRA SOC: Renal and urinary disorders',
  },
  {
    value: 'urology',
    label: 'Urology',
    description: 'BPH, overactive bladder, urinary incontinence, and urologic cancers.',
    codingRef: 'MedDRA SOC: Renal and urinary disorders',
  },
  {
    value: 'obstetrics_gynecology',
    label: 'Obstetrics / Gynecology',
    description: 'Maternal health, endometriosis, uterine fibroids, and contraception.',
    codingRef: 'MedDRA SOC: Reproductive system and breast disorders',
  },
  {
    value: 'musculoskeletal',
    label: 'Musculoskeletal / Orthopedics',
    description: 'Osteoporosis, osteoarthritis, muscular dystrophy, and spinal disorders.',
    codingRef: 'MedDRA SOC: Musculoskeletal and connective tissue disorders',
  },
  {
    value: 'pain',
    label: 'Pain / Anesthesiology',
    description: 'Chronic pain, neuropathic pain, migraine, and procedural anesthesia.',
  },
  {
    value: 'gene_cell_therapy',
    label: 'Gene & Cell Therapy',
    description: 'Gene therapy, CAR-T, stem cell therapy, and genome editing.',
    regulatoryRefs: ['FDA CBER Guidance for Gene Therapy', 'ICH Q5A(R2)', 'ICH Q5D'],
  },
  {
    value: 'vaccines',
    label: 'Vaccines / Immunization',
    description: 'Prophylactic and therapeutic vaccines for infectious disease and oncology.',
    regulatoryRefs: ['FDA CBER', 'WHO Prequalification of Vaccines'],
  },
  {
    value: 'endocrinology',
    label: 'Endocrinology / Diabetes',
    description: 'Type 1 and Type 2 diabetes, thyroid disorders, and growth hormone deficiency.',
    codingRef: 'MedDRA SOC: Endocrine disorders',
  },
  {
    value: 'allergy',
    label: 'Allergy / Clinical Immunology',
    description: 'Allergic rhinitis, food allergy, anaphylaxis, and allergen immunotherapy.',
    codingRef: 'MedDRA SOC: Immune system disorders',
  },
  {
    value: 'transplant',
    label: 'Transplant Medicine',
    description: 'Solid organ transplant, GVHD prevention, and immunosuppression.',
  },
  {
    value: 'dental',
    label: 'Dental / Oral Health',
    description: 'Periodontal disease, dental caries prevention, and oral surgery.',
  },
  {
    value: 'other',
    label: 'Other / Not Listed',
    description: 'Therapeutic area not covered by the predefined categories.',
  },
];

/** Convert THERAPEUTIC_AREAS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return THERAPEUTIC_AREAS.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
