/**
 * Concept2Cure - Artifacts Catalog
 *
 * Claude.ai-style template catalog for regulatory artifacts.
 * Browse, search, and use templates.
 *
 * Phase 3: Comprehensive templates for all industry segments
 * (Pharma, Biotech, MedTech, Diagnostics) with IndustryContext filtering.
 */

import React, { useState, useMemo } from 'react';
import type { ArtifactTemplate, SubmissionType, ArtifactType, ArtifactCategory } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useIndustry } from '../../contexts/IndustryContext';
import type { IndustrySegment } from '../../contexts/IndustryContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  BarChart3,
  Table2,
  Workflow,
  Network,
  Star,
  Download,
  Users,
  Building2,
  Sparkles,
  Filter,
  X,
  ChevronRight,
  Clock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENT TAG — maps templates to industry segments
// ─────────────────────────────────────────────────────────────────────────────

type SegmentTag = 'pharma' | 'biotech' | 'medtech' | 'diagnostics' | 'all';

interface ExtendedArtifactTemplate extends ArtifactTemplate {
  /** Which industry segments this template is relevant for */
  segments: SegmentTag[];
  /** CTD section reference */
  ctdSection?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE TEMPLATE CATALOG
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES: ExtendedArtifactTemplate[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MedTech / Device Templates
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-510k-cover',
    name: '510(k) Cover Letter',
    description: 'Standard FDA 510(k) cover letter following official format guidelines',
    type: 'cover_letter',
    category: 'document',
    content: `[DATE]\n\nFood and Drug Administration\nCenter for Devices and Radiological Health\nDocument Mail Center - WO66-G609\n10903 New Hampshire Avenue\nSilver Spring, MD 20993-0002\n\nRe: 510(k) Premarket Notification\nDevice Name: [DEVICE NAME]\nClassification: [PRODUCT CODE]\n\nDear Sir or Madam:\n\n[COMPANY NAME] is submitting this 510(k) premarket notification...`,
    submissionTypes: ['510K'],
    segments: ['medtech', 'diagnostics'],
    ctdSection: '1.0',
    tags: ['FDA', 'cover letter', 'medical device'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 2847,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-device-desc',
    name: 'Device Description',
    description: 'Comprehensive device description following FDA guidance for 510(k) submissions',
    type: 'device_description',
    category: 'document',
    content: `DEVICE DESCRIPTION\n\n1. Device Name and Classification\n[Device Trade Name]\nProduct Code: [CODE]\nRegulation Number: [NUMBER]\n\n2. Intended Use\n[Describe the intended use of the device]\n\n3. Device Description\n[Detailed physical and functional description]\n\n4. Technological Characteristics\n[List key technological features]\n\n5. Principles of Operation\n[Explain how the device works]`,
    submissionTypes: ['510K', 'PMA', 'DE_NOVO'],
    segments: ['medtech', 'diagnostics'],
    ctdSection: '3.0',
    tags: ['device description', 'technical', 'FDA'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1923,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-11-15'),
  },
  {
    id: 'tpl-se-summary',
    name: 'Substantial Equivalence Summary',
    description: 'SE summary comparing device to predicate with technological characteristics',
    type: 'se_summary',
    category: 'document',
    content: `SUBSTANTIAL EQUIVALENCE SUMMARY\n\n1. INTRODUCTION\nThis summary demonstrates substantial equivalence between [SUBJECT DEVICE] and [PREDICATE DEVICE].\n\n2. PREDICATE DEVICE INFORMATION\nK Number: [K-NUMBER]\nDevice Name: [NAME]\nManufacturer: [MANUFACTURER]\n\n3. COMPARISON OF INTENDED USE\n[Comparison table]\n\n4. COMPARISON OF TECHNOLOGICAL CHARACTERISTICS\n[Detailed comparison]\n\n5. CONCLUSION\nBased on the above analysis, [SUBJECT DEVICE] is substantially equivalent to [PREDICATE DEVICE].`,
    submissionTypes: ['510K'],
    segments: ['medtech', 'diagnostics'],
    ctdSection: '4.0',
    tags: ['SE', 'predicate', 'comparison'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1456,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-03-05'),
    updatedAt: new Date('2024-10-20'),
  },
  {
    id: 'tpl-biocompat',
    name: 'Biocompatibility Assessment',
    description: 'ISO 10993 biocompatibility evaluation report for device-body contact assessment',
    type: 'biocompatibility_summary',
    category: 'document',
    content: `BIOCOMPATIBILITY ASSESSMENT\nPer ISO 10993-1:2018\n\n1. DEVICE INFORMATION\nDevice Name: [NAME]\nBody Contact: [Type and duration]\nMaterials: [List of materials]\n\n2. BIOLOGICAL EVALUATION PLAN\n[Tests required based on contact type]\n\n3. EXISTING DATA REVIEW\n[Literature, clinical history, predicate data]\n\n4. TEST RESULTS\n[Cytotoxicity, Sensitization, Irritation, etc.]\n\n5. RISK ASSESSMENT\n[Biological risk characterization]\n\n6. CONCLUSIONS\n[Overall biocompatibility determination]`,
    submissionTypes: ['510K', 'PMA', 'DE_NOVO'],
    segments: ['medtech'],
    tags: ['biocompatibility', 'ISO 10993', 'testing'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 876,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-04-10'),
    updatedAt: new Date('2024-11-20'),
  },
  {
    id: 'tpl-software-doc',
    name: 'Software Documentation (IEC 62304)',
    description: 'Software lifecycle documentation per IEC 62304 for SaMD and device software',
    type: 'software_documentation',
    category: 'document',
    content: `SOFTWARE DOCUMENTATION\nPer IEC 62304:2006+A1:2015\n\n1. SOFTWARE DESCRIPTION\nSoftware Name: [NAME]\nSafety Classification: [Class A/B/C]\nIntended Use: [PURPOSE]\n\n2. SOFTWARE DEVELOPMENT PLAN\n[Lifecycle model, activities, deliverables]\n\n3. SOFTWARE REQUIREMENTS\n[Functional and performance requirements]\n\n4. SOFTWARE ARCHITECTURE\n[System architecture, data flow, interfaces]\n\n5. VERIFICATION & VALIDATION\n[Test protocols, results, traceability]\n\n6. RISK MANAGEMENT\n[Software hazard analysis per ISO 14971]`,
    submissionTypes: ['510K', 'PMA', 'DE_NOVO'],
    segments: ['medtech', 'diagnostics'],
    tags: ['software', 'IEC 62304', 'SaMD'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 645,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-05-01'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-sterilization',
    name: 'Sterilization Validation Report',
    description: 'Sterilization process validation documentation per FDA and ISO standards',
    type: 'sterilization_summary',
    category: 'document',
    content: `STERILIZATION VALIDATION REPORT\n\n1. SCOPE\nDevice: [NAME]\nSterilization Method: [EO/Radiation/Steam/Other]\nStandard: [ISO 11135/11137/17665]\n\n2. BIOBURDEN TESTING\n[Pre-sterilization bioburden characterization]\n\n3. DOSE SETTING / CYCLE DEVELOPMENT\n[Parameter establishment]\n\n4. VALIDATION PROTOCOL\n[Installation, Operational, Performance Qualification]\n\n5. RESULTS\n[SAL demonstration, residual limits]\n\n6. CONCLUSIONS\n[Validated sterilization parameters]`,
    submissionTypes: ['510K', 'PMA'],
    segments: ['medtech'],
    tags: ['sterilization', 'validation', 'ISO'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 432,
    rating: 4.6,
    isOfficial: true,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-11-01'),
  },
  {
    id: 'tpl-pma-summary',
    name: 'PMA Summary of Safety & Effectiveness',
    description: 'Premarket Approval summary document for Class III medical devices',
    type: 'clinical_summary',
    category: 'document',
    content: `SUMMARY OF SAFETY AND EFFECTIVENESS DATA\n\n1. GENERAL INFORMATION\nDevice: [NAME]\nApplicant: [COMPANY]\nPMA Number: [NUMBER]\n\n2. INDICATIONS FOR USE\n[Intended use and indications]\n\n3. DEVICE DESCRIPTION\n[Detailed description]\n\n4. NONCLINICAL STUDIES\n[Bench testing, biocompatibility, performance]\n\n5. CLINICAL STUDIES\n[Pivotal study design, results, endpoints]\n\n6. CONCLUSIONS\n[Safety and effectiveness determination]`,
    submissionTypes: ['PMA'],
    segments: ['medtech'],
    tags: ['PMA', 'Class III', 'safety', 'effectiveness'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 567,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-03-20'),
    updatedAt: new Date('2024-10-15'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EU / International Templates
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-cer-mdr',
    name: 'Clinical Evaluation Report (EU MDR)',
    description: 'MEDDEV 2.7/1 Rev 4 compliant CER for EU MDR 2017/745 conformity',
    type: 'cer_report',
    category: 'document',
    content: `CLINICAL EVALUATION REPORT\nPer MEDDEV 2.7/1 Rev 4\n\n1. EXECUTIVE SUMMARY\n[CER scope and conclusions]\n\n2. SCOPE OF THE CLINICAL EVALUATION\n[Device, intended purpose, target population]\n\n3. CLINICAL BACKGROUND\n[State of the art, available treatment options]\n\n4. CLINICAL DATA IDENTIFIED\n[Literature search, clinical investigations, PMS data]\n\n5. APPRAISAL OF CLINICAL DATA\n[Methodological quality assessment]\n\n6. ANALYSIS OF CLINICAL DATA\n[Safety, performance, benefit-risk]\n\n7. CONCLUSIONS\n[Clinical evidence sufficiency, residual risks]\n\n8. QUALIFICATIONS OF AUTHORS\n[CV and declarations]`,
    submissionTypes: ['510K', 'PMA'],
    segments: ['medtech', 'diagnostics'],
    tags: ['CER', 'EU MDR', 'MEDDEV', 'clinical evaluation'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1234,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-ivdr-techfile',
    name: 'IVDR Technical Documentation',
    description: 'EU IVDR 2017/746 technical file structure for in-vitro diagnostic devices',
    type: 'ivdr_technical_file',
    category: 'document',
    content: `IVDR TECHNICAL DOCUMENTATION\nPer EU 2017/746 Annex II & III\n\n1. DEVICE DESCRIPTION AND SPECIFICATION\n[Device identification, variants, accessories]\n\n2. INFORMATION SUPPLIED BY THE MANUFACTURER\n[Label, IFU, packaging]\n\n3. DESIGN AND MANUFACTURING INFORMATION\n[Design stages, manufacturing processes, suppliers]\n\n4. GENERAL SAFETY AND PERFORMANCE REQUIREMENTS\n[GSPR checklist with standards applied]\n\n5. BENEFIT-RISK ANALYSIS\n[Risk management per ISO 14971]\n\n6. PRODUCT VERIFICATION AND VALIDATION\n[Analytical performance, clinical evidence]\n\n7. POST-MARKET SURVEILLANCE PLAN\n[PMCF, PSUR schedule]`,
    submissionTypes: ['IVDR'],
    segments: ['diagnostics'],
    tags: ['IVDR', 'EU', 'IVD', 'technical file'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 389,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-07-01'),
    updatedAt: new Date('2024-12-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — IND Templates (Module 1)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-ind-cover',
    name: 'IND Cover Letter (FDA Form 1571)',
    description: 'FDA IND application cover letter for investigational new drugs and biologics',
    type: 'ind_cover_letter',
    category: 'document',
    content: `[DATE]\n\nFood and Drug Administration\nCenter for Drug Evaluation and Research\nCentral Document Room\n5901-B Ammendale Road\nBeltsville, MD 20705-1266\n\nRE: Investigational New Drug Application\nDrug Name: [DRUG NAME]\nIND Number: [NUMBER] (if amendment)\n\nDear Sir or Madam:\n\n[SPONSOR NAME] hereby submits this Investigational New Drug (IND) application for [DRUG NAME], a [MECHANISM OF ACTION] for the treatment of [INDICATION].\n\nThis submission contains the following:\n- Form FDA 1571\n- Form FDA 1572\n- Table of Contents\n- Introductory Statement and General Investigational Plan\n- Investigator's Brochure\n- Clinical Protocol\n- Chemistry, Manufacturing, and Controls Information\n- Pharmacology and Toxicology Information\n- Previous Human Experience`,
    submissionTypes: ['IND'],
    segments: ['pharma', 'biotech', 'all'],
    ctdSection: 'm1.2',
    tags: ['IND', 'cover letter', 'FDA 1571', 'drug'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 2134,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-ind-intro-plan',
    name: 'Introductory Statement & General Investigational Plan',
    description: 'IND introductory statement including clinical rationale, development plan, and investigational approach',
    type: 'ind_cover_letter',
    category: 'document',
    content: `INTRODUCTORY STATEMENT AND GENERAL INVESTIGATIONAL PLAN\n\n1. INTRODUCTORY STATEMENT\n1.1 Name of Drug: [NAME]\n1.2 Chemical Structure: [STRUCTURE/CLASS]\n1.3 Pharmacological Class: [CLASS]\n1.4 Formulation: [DOSAGE FORM]\n1.5 Route of Administration: [ROUTE]\n\n2. GENERAL INVESTIGATIONAL PLAN\n2.1 Rationale for Development\n[Scientific rationale and unmet medical need]\n\n2.2 Development Strategy\n[Phase I → Phase II → Phase III plan]\n\n2.3 Indication(s) to Be Studied\n[Target indications]\n\n2.4 Approach to Evaluation\n[Clinical pharmacology, efficacy, safety approach]\n\n2.5 Projected Timeline\n[Key milestones and timeline]`,
    submissionTypes: ['IND'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm1.6',
    tags: ['IND', 'investigational plan', 'development strategy'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1567,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-15'),
    updatedAt: new Date('2024-11-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — Module 2 (CTD Summaries)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-qos',
    name: 'Quality Overall Summary (M2.3)',
    description: 'ICH M4Q-compliant quality overall summary for drug substance and drug product',
    type: 'quality_overall_summary',
    category: 'document',
    content: `QUALITY OVERALL SUMMARY\nPer ICH M4Q(R1)\n\n2.3.S DRUG SUBSTANCE\n2.3.S.1 General Information\n[Nomenclature, structure, general properties]\n\n2.3.S.2 Manufacture\n[Manufacturers, description of process, process controls]\n\n2.3.S.3 Characterisation\n[Elucidation of structure, impurities]\n\n2.3.S.4 Control of Drug Substance\n[Specification, analytical procedures, batch analysis]\n\n2.3.S.5 Reference Standards\n[Primary/secondary reference standards]\n\n2.3.S.6 Container Closure System\n[Description, specifications]\n\n2.3.S.7 Stability\n[Summary, post-approval stability protocol]\n\n2.3.P DRUG PRODUCT\n2.3.P.1 Description and Composition\n[Description, formulation table]\n\n2.3.P.2 Pharmaceutical Development\n[Formulation development, manufacturing process development]\n\n2.3.P.3 Manufacture\n[Batch formula, process description, controls]\n\n2.3.P.4 Control of Excipients\n[Specifications, analytical procedures]\n\n2.3.P.5 Control of Drug Product\n[Specifications, analytical procedures, batch analysis]\n\n2.3.P.6 Reference Standards\n[Reference standard characterization]\n\n2.3.P.7 Container Closure System\n[Description and specifications]\n\n2.3.P.8 Stability\n[Summary of results, shelf life]`,
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech', 'all'],
    ctdSection: 'm2.3',
    tags: ['QOS', 'CMC', 'ICH M4Q', 'quality', 'drug substance', 'drug product'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1876,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-nonclinical-overview',
    name: 'Nonclinical Overview (M2.4)',
    description: 'ICH M4S-compliant nonclinical overview synthesizing pharmacology, PK, and toxicology',
    type: 'nonclinical_overview',
    category: 'document',
    content: `NONCLINICAL OVERVIEW\nPer ICH M4S(R2)\n\n1. OVERVIEW OF NONCLINICAL TESTING STRATEGY\n[Rationale for studies conducted, GLP compliance]\n\n2. PHARMACOLOGY\n2.1 Primary Pharmacodynamics\n[In vitro and in vivo efficacy data]\n2.2 Secondary Pharmacodynamics\n[Off-target effects]\n2.3 Safety Pharmacology\n[CNS, cardiovascular, respiratory]\n\n3. PHARMACOKINETICS\n3.1 Absorption\n3.2 Distribution\n3.3 Metabolism\n3.4 Excretion\n3.5 Pharmacokinetic Drug Interactions\n\n4. TOXICOLOGY\n4.1 Single-Dose Toxicity\n4.2 Repeat-Dose Toxicity\n4.3 Genotoxicity\n4.4 Carcinogenicity\n4.5 Reproductive and Developmental Toxicity\n\n5. INTEGRATED OVERVIEW AND CONCLUSIONS\n[NOAEL, safety margins, risk assessment]`,
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm2.4',
    tags: ['nonclinical', 'pharmacology', 'toxicology', 'ICH M4S'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1234,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-11-15'),
  },
  {
    id: 'tpl-clinical-overview',
    name: 'Clinical Overview (M2.5)',
    description: 'ICH M4E-compliant clinical overview providing integrated clinical assessment',
    type: 'clinical_overview',
    category: 'document',
    content: `CLINICAL OVERVIEW\nPer ICH M4E(R2)\n\n1. PRODUCT DEVELOPMENT RATIONALE\n[Unmet need, mechanism, therapeutic positioning]\n\n2. OVERVIEW OF BIOPHARMACEUTICS\n[Formulation, bioavailability, food effects]\n\n3. OVERVIEW OF CLINICAL PHARMACOLOGY\n[PK, PD, dose-response, special populations]\n\n4. OVERVIEW OF EFFICACY\n[Study design, endpoints, results, dose selection]\n\n5. OVERVIEW OF SAFETY\n[Common AEs, serious AEs, deaths, discontinuations]\n\n6. BENEFITS AND RISKS CONCLUSIONS\n[Benefit-risk assessment, proposed labeling]`,
    submissionTypes: ['NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm2.5',
    tags: ['clinical overview', 'ICH M4E', 'efficacy', 'safety'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 987,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-03-15'),
    updatedAt: new Date('2024-11-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — Module 3 (CMC)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-drug-substance',
    name: 'Drug Substance (M3.2.S)',
    description: 'Complete drug substance CMC module per ICH Q guidelines',
    type: 'drug_substance',
    category: 'document',
    content: `MODULE 3.2.S: DRUG SUBSTANCE\n\n3.2.S.1 GENERAL INFORMATION\n3.2.S.1.1 Nomenclature\n[INN, USAN, chemical name, company code]\n3.2.S.1.2 Structure\n[Structural formula, molecular formula, molecular weight]\n3.2.S.1.3 General Properties\n[Physical form, solubility, polymorphism, pKa, optical rotation]\n\n3.2.S.2 MANUFACTURE\n3.2.S.2.1 Manufacturer(s)\n[Name, address, responsibilities]\n3.2.S.2.2 Description of Manufacturing Process and Process Controls\n[Flow diagram, process description, critical steps]\n3.2.S.2.3 Control of Materials\n[Starting materials, reagents, solvents]\n3.2.S.2.4 Controls of Critical Steps and Intermediates\n[In-process controls, specifications]\n3.2.S.2.5 Process Validation and/or Evaluation\n[Validation approach and results]\n3.2.S.2.6 Manufacturing Process Development\n[Significant changes, scale-up]`,
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm3.2.S',
    tags: ['CMC', 'drug substance', 'manufacturing', 'ICH Q'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1654,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-25'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-drug-product',
    name: 'Drug Product (M3.2.P)',
    description: 'Complete drug product CMC module covering formulation, manufacture, and control',
    type: 'drug_product',
    category: 'document',
    content: `MODULE 3.2.P: DRUG PRODUCT\n\n3.2.P.1 DESCRIPTION AND COMPOSITION\n[Description, composition table, formulation development]\n\n3.2.P.2 PHARMACEUTICAL DEVELOPMENT\n3.2.P.2.1 Components of the Drug Product\n[Active ingredient, excipients]\n3.2.P.2.2 Drug Product\n[Formulation development, overages]\n3.2.P.2.3 Manufacturing Process Development\n[Selection, optimization, scale-up]\n3.2.P.2.4 Container Closure System\n[Selection rationale, compatibility]\n3.2.P.2.5 Microbiological Attributes\n[Preservative effectiveness, microbial limits]\n3.2.P.2.6 Compatibility\n[With diluents, devices]\n\n3.2.P.3 MANUFACTURE\n[Batch formula, manufacturing process, controls]\n\n3.2.P.4 CONTROL OF EXCIPIENTS\n[Specifications, sourcing]\n\n3.2.P.5 CONTROL OF DRUG PRODUCT\n[Specifications, methods, batch analysis]\n\n3.2.P.7 CONTAINER CLOSURE SYSTEM\n[Description, specifications]\n\n3.2.P.8 STABILITY\n[Protocol, results, shelf life proposal]`,
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm3.2.P',
    tags: ['CMC', 'drug product', 'formulation', 'stability'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1543,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-05'),
    updatedAt: new Date('2024-11-20'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — Module 4 (Nonclinical)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-pharm-summary',
    name: 'Pharmacology Written Summary (M2.6.2)',
    description: 'Written summary of all pharmacology studies per ICH M4S guidelines',
    type: 'pharmacology_summary',
    category: 'document',
    content: `PHARMACOLOGY WRITTEN SUMMARY\n\n1. BRIEF SUMMARY\n[One paragraph overview of pharmacology program]\n\n2. PRIMARY PHARMACODYNAMICS\n[In vitro binding, selectivity, in vivo efficacy models]\n\n3. SECONDARY PHARMACODYNAMICS\n[Off-target receptor panel, unintended pharmacological activities]\n\n4. SAFETY PHARMACOLOGY\n4.1 Central Nervous System\n[Modified Irwin, FOB]\n4.2 Cardiovascular System\n[hERG, in vivo telemetry]\n4.3 Respiratory System\n[Respiratory rate, tidal volume]\n\n5. PHARMACODYNAMIC DRUG INTERACTIONS\n[Combination studies if applicable]\n\n6. DISCUSSION AND CONCLUSIONS\n[Integrated pharmacology assessment]`,
    submissionTypes: ['IND', 'NDA', 'BLA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm2.6.2',
    tags: ['pharmacology', 'safety pharmacology', 'hERG'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 876,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-04-01'),
    updatedAt: new Date('2024-11-01'),
  },
  {
    id: 'tpl-tox-summary',
    name: 'Toxicology Written Summary (M2.6.6)',
    description: 'Comprehensive toxicology summary covering all GLP and non-GLP studies',
    type: 'toxicology_summary',
    category: 'document',
    content: `TOXICOLOGY WRITTEN SUMMARY\n\n1. BRIEF SUMMARY\n[Overview of toxicology program and key findings]\n\n2. SINGLE-DOSE TOXICITY\n[Species, routes, LD50/MTD, dose-limiting toxicities]\n\n3. REPEAT-DOSE TOXICITY\n[Study designs, NOAEL, target organs, reversibility]\n\n4. GENOTOXICITY\n[Ames test, in vitro chromosomal aberration, in vivo micronucleus]\n\n5. CARCINOGENICITY\n[2-year studies, transgenic models, if applicable]\n\n6. REPRODUCTIVE AND DEVELOPMENTAL TOXICITY\n[Fertility, embryo-fetal, pre/postnatal development]\n\n7. LOCAL TOLERANCE\n[Route-specific studies]\n\n8. OTHER TOXICITY STUDIES\n[Immunotoxicity, phototoxicity, dependence, metabolite studies]\n\n9. DISCUSSION AND CONCLUSIONS\n[Safety margins, clinical relevance]`,
    submissionTypes: ['IND', 'NDA', 'BLA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm2.6.6',
    tags: ['toxicology', 'GLP', 'NOAEL', 'safety margins'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 789,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-04-15'),
    updatedAt: new Date('2024-11-15'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — Module 5 (Clinical)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-clinical-protocol',
    name: 'Clinical Study Protocol',
    description: 'ICH E6(R2) GCP-compliant clinical study protocol template',
    type: 'clinical_protocol',
    category: 'document',
    content: `CLINICAL STUDY PROTOCOL\nPer ICH E6(R2) GCP\n\nPROTOCOL TITLE: [TITLE]\nProtocol Number: [NUMBER]\nSponsor: [SPONSOR]\nPhase: [I/II/III/IV]\n\n1. SYNOPSIS\n[One-page protocol summary table]\n\n2. INTRODUCTION\n2.1 Background\n2.2 Rationale for the Study\n2.3 Risk-Benefit Assessment\n\n3. STUDY OBJECTIVES\n3.1 Primary Objective\n3.2 Secondary Objectives\n3.3 Exploratory Objectives\n\n4. STUDY DESIGN\n4.1 Overall Design\n4.2 Randomization and Blinding\n4.3 Duration of Treatment\n4.4 Study Schema\n\n5. STUDY POPULATION\n5.1 Inclusion Criteria\n5.2 Exclusion Criteria\n\n6. STUDY TREATMENTS\n6.1 Investigational Product\n6.2 Dose and Administration\n6.3 Dose Modifications\n\n7. STUDY ASSESSMENTS\n7.1 Efficacy Assessments\n7.2 Safety Assessments\n7.3 PK Assessments\n7.4 Biomarker Assessments\n\n8. ENDPOINTS\n8.1 Primary Endpoint\n8.2 Secondary Endpoints\n8.3 Exploratory Endpoints\n\n9. STATISTICAL CONSIDERATIONS\n9.1 Sample Size\n9.2 Analysis Populations\n9.3 Primary Analysis\n9.4 Secondary Analyses\n\n10. SAFETY REPORTING\n[AE definitions, SAE reporting, DSMB]\n\n11. DATA MANAGEMENT\n[EDC, data quality, database lock]\n\n12. ETHICAL CONSIDERATIONS\n[IRB/EC, informed consent, confidentiality]`,
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech', 'all'],
    ctdSection: 'm5.3',
    tags: ['protocol', 'GCP', 'ICH E6', 'clinical trial'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 3456,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-sap',
    name: 'Statistical Analysis Plan (SAP)',
    description: 'ICH E9-compliant SAP template with endpoint definitions and analysis methods',
    type: 'statistical_analysis_plan',
    category: 'document',
    content: `STATISTICAL ANALYSIS PLAN\nPer ICH E9(R1)\n\nStudy: [PROTOCOL NUMBER]\nSponsor: [SPONSOR]\nVersion: [VERSION]\nDate: [DATE]\n\n1. INTRODUCTION\n[Purpose, study overview, SAP version history]\n\n2. STUDY OBJECTIVES AND ENDPOINTS\n2.1 Primary Objective and Endpoint\n2.2 Secondary Objectives and Endpoints\n2.3 Exploratory Objectives\n\n3. STUDY DESIGN\n[Design overview, randomization, stratification]\n\n4. ANALYSIS POPULATIONS\n4.1 Intent-to-Treat (ITT)\n4.2 Modified ITT (mITT)\n4.3 Per-Protocol (PP)\n4.4 Safety Population\n\n5. STATISTICAL METHODS\n5.1 Primary Analysis\n[Estimand, statistical test, significance level]\n5.2 Secondary Analyses\n5.3 Subgroup Analyses\n5.4 Sensitivity Analyses\n5.5 Multiplicity Adjustment\n\n6. SAMPLE SIZE\n[Assumptions, calculation, power]\n\n7. MISSING DATA HANDLING\n[Imputation strategy, sensitivity analyses]\n\n8. INTERIM ANALYSES\n[DSMB, alpha spending function]\n\n9. TABLES, FIGURES, LISTINGS SHELLS\n[TFL specifications]`,
    submissionTypes: ['IND', 'NDA', 'BLA'],
    segments: ['pharma', 'biotech', 'all'],
    ctdSection: 'm5.3',
    tags: ['SAP', 'statistics', 'ICH E9', 'endpoints'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 2345,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-csr',
    name: 'Clinical Study Report (ICH E3)',
    description: 'Full ICH E3 clinical study report structure with all required sections',
    type: 'clinical_study_report',
    category: 'document',
    content: `CLINICAL STUDY REPORT\nPer ICH E3\n\n1. TITLE PAGE\n[Study title, protocol number, phase, sponsor]\n\n2. SYNOPSIS\n[Structured synopsis per ICH E3 Table 1]\n\n3. TABLE OF CONTENTS, LIST OF TABLES AND FIGURES\n\n4. LIST OF ABBREVIATIONS\n\n5. ETHICS\n[IEC/IRB, ethical conduct, informed consent]\n\n6. INVESTIGATORS AND STUDY ADMINISTRATIVE STRUCTURE\n\n7. INTRODUCTION\n[Background, scientific rationale]\n\n8. STUDY OBJECTIVES\n\n9. INVESTIGATIONAL PLAN\n9.1 Overall Study Design\n9.2 Discussion of Study Design\n9.3 Selection of Study Population\n9.4 Treatments\n9.5 Efficacy and Safety Variables\n9.6 Data Quality Assurance\n9.7 Statistical Methods\n\n10. STUDY PATIENTS\n10.1 Disposition of Patients\n10.2 Protocol Deviations\n\n11. EFFICACY EVALUATION\n11.1 Primary Efficacy Endpoint\n11.2 Secondary Efficacy Endpoints\n11.3 Subgroup Analyses\n\n12. SAFETY EVALUATION\n12.1 Extent of Exposure\n12.2 Adverse Events\n12.3 Deaths, SAEs, Discontinuations\n12.4 Clinical Laboratory Evaluation\n12.5 Vital Signs\n\n13. DISCUSSION AND OVERALL CONCLUSIONS\n\n14. TABLES, FIGURES, GRAPHS\n\n15. REFERENCE LIST\n\n16. APPENDICES`,
    submissionTypes: ['NDA', 'BLA', 'MAA'],
    segments: ['pharma', 'biotech', 'all'],
    ctdSection: 'm5.3.5',
    tags: ['CSR', 'ICH E3', 'clinical study report', 'efficacy', 'safety'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 2890,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-ib',
    name: "Investigator's Brochure (IB)",
    description: 'ICH E6(R2) compliant IB template compiling clinical and nonclinical data for investigators',
    type: 'investigators_brochure',
    category: 'document',
    content: `INVESTIGATOR'S BROCHURE\nPer ICH E6(R2) Section 7\n\n1. TABLE OF CONTENTS\n\n2. SUMMARY\n[Brief overview of physical, chemical, pharmaceutical, pharmacological, toxicological, pharmacokinetic, and clinical information]\n\n3. INTRODUCTION\n[Chemical name, structural formula, pharmacological class, rationale]\n\n4. PHYSICAL, CHEMICAL, AND PHARMACEUTICAL PROPERTIES AND FORMULATION\n[Description, formulation, storage, structural similarity to other compounds]\n\n5. NONCLINICAL STUDIES\n5.1 Nonclinical Pharmacology\n5.2 Pharmacokinetics and Metabolism\n5.3 Toxicology\n\n6. EFFECTS IN HUMANS\n6.1 Pharmacokinetics and Metabolism\n6.2 Safety and Efficacy\n6.3 Post-Marketing Experience\n\n7. SUMMARY OF DATA AND GUIDANCE FOR THE INVESTIGATOR\n[Overall risk assessment, guidance on monitoring, dose selection]`,
    submissionTypes: ['IND', 'MAA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm1.7',
    tags: ['IB', 'investigator brochure', 'ICH E6', 'GCP'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 1876,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-02-20'),
    updatedAt: new Date('2024-11-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Pharma / Biotech — Safety Reports
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-dsur',
    name: 'Development Safety Update Report (DSUR)',
    description: 'ICH E2F-compliant annual safety report for active investigational drugs',
    type: 'dsur',
    category: 'document',
    content: `DEVELOPMENT SAFETY UPDATE REPORT\nPer ICH E2F\n\n1. INTRODUCTION\n[Drug name, reporting period, development status]\n\n2. WORLDWIDE MARKETING APPROVALS\n[Approved indications and countries]\n\n3. ACTIONS TAKEN FOR SAFETY REASONS\n[Regulatory actions, protocol amendments, IB updates]\n\n4. CHANGES TO REFERENCE SAFETY INFORMATION\n[RSI updates during period]\n\n5. ESTIMATED CUMULATIVE EXPOSURE\n[Clinical trials + post-marketing]\n\n6. DATA IN LINE LISTINGS AND SUMMARY TABULATIONS\n[SAEs, SUSARs, deaths]\n\n7. SIGNIFICANT FINDINGS FROM CLINICAL TRIALS\n[Completed and ongoing studies]\n\n8. SAFETY FINDINGS FROM NON-INTERVENTIONAL STUDIES\n\n9. OTHER CLINICAL TRIAL/STUDY SAFETY INFORMATION\n\n10. NONCLINICAL DATA\n\n11. LITERATURE\n\n12. OTHER DSUR/PSUR FINDINGS\n\n13. OVERALL SAFETY ASSESSMENT\n[Integrated assessment, benefit-risk]\n\n14. SUMMARY OF IMPORTANT RISKS\n\n15. CONCLUSIONS\n[Recommendation to continue development]`,
    submissionTypes: ['IND', 'NDA'],
    segments: ['pharma', 'biotech'],
    tags: ['DSUR', 'ICH E2F', 'safety report', 'pharmacovigilance'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 654,
    rating: 4.7,
    isOfficial: true,
    createdAt: new Date('2024-05-01'),
    updatedAt: new Date('2024-11-15'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NDA / BLA Templates
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-nda-summary',
    name: 'NDA Summary (Integrated Summary of Safety)',
    description: 'Integrated Summary of Safety (ISS) per ICH E1 for NDA/BLA submissions',
    type: 'nda_summary',
    category: 'document',
    content: `INTEGRATED SUMMARY OF SAFETY\nPer ICH E1\n\n1. INTRODUCTION\n[Drug, indication, submission overview]\n\n2. OVERALL EXPOSURE\n2.1 Overall Extent of Exposure\n2.2 Demographic and Other Characteristics of Study Population\n\n3. ADVERSE EVENTS\n3.1 Common Adverse Events\n3.2 Deaths\n3.3 Serious Adverse Events\n3.4 AEs Leading to Discontinuation\n\n4. CLINICAL LABORATORY EVALUATIONS\n[Hematology, chemistry, urinalysis, liver function]\n\n5. VITAL SIGNS\n[Blood pressure, heart rate, body weight]\n\n6. SPECIAL SAFETY TOPICS\n[Hepatotoxicity, QTc, suicidality, dependence, etc.]\n\n7. SAFETY IN SPECIAL POPULATIONS\n[Age, sex, race, renal/hepatic impairment, pregnancy]\n\n8. OVERDOSE AND DRUG ABUSE\n\n9. WITHDRAWAL/REBOUND EFFECTS\n\n10. POST-MARKETING EXPERIENCE\n\n11. OVERALL SAFETY CONCLUSIONS`,
    submissionTypes: ['NDA', 'BLA'],
    segments: ['pharma', 'biotech'],
    ctdSection: 'm2.7.4',
    tags: ['NDA', 'ISS', 'safety', 'ICH E1'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 567,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-11-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-Segment SOPs
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-sop-general',
    name: 'Standard Operating Procedure (SOP)',
    description: 'GxP-compliant SOP template for quality management system documentation',
    type: 'sop',
    category: 'document',
    content: `STANDARD OPERATING PROCEDURE\n\nSOP Number: [SOP-XXX]\nTitle: [TITLE]\nEffective Date: [DATE]\nVersion: [VERSION]\nDepartment: [DEPARTMENT]\n\n1. PURPOSE\n[Objective of the procedure]\n\n2. SCOPE\n[What this SOP covers and any exclusions]\n\n3. RESPONSIBILITIES\n[Roles and responsibilities table]\n\n4. DEFINITIONS\n[Key terms and acronyms]\n\n5. PROCEDURE\n5.1 [Step 1]\n5.2 [Step 2]\n5.3 [Step 3]\n[Continue as needed]\n\n6. REFERENCES\n[Related SOPs, regulations, guidelines]\n\n7. ATTACHMENTS\n[Forms, templates, flowcharts]\n\n8. REVISION HISTORY\n[Version | Date | Author | Description of Changes]`,
    submissionTypes: ['IND', 'NDA', 'BLA', '510K', 'PMA'],
    segments: ['all'],
    tags: ['SOP', 'GxP', 'quality', 'compliance'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 4567,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-12-01'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Interactive Tools
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'tpl-pyramid-gantt',
    name: 'Submission Pyramid Timeline',
    description: 'Interactive Gantt chart showing submission phases and milestone tracking',
    type: 'pyramid_gantt',
    category: 'interactive',
    content: JSON.stringify({
      phases: [
        { id: 1, name: 'Pre-Submission', weeks: 4, status: 'planning' },
        { id: 2, name: 'Document Authoring', weeks: 8, status: 'planning' },
        { id: 3, name: 'Quality Review', weeks: 4, status: 'planning' },
        { id: 4, name: 'eCTD Compilation', weeks: 2, status: 'planning' },
        { id: 5, name: 'Submission', weeks: 1, status: 'planning' },
        { id: 6, name: 'Agency Review', weeks: 12, status: 'planning' },
        { id: 7, name: 'Approval & Launch', weeks: 2, status: 'planning' },
      ],
    }),
    submissionTypes: ['510K', 'IND', 'NDA', 'BLA', 'PMA'],
    segments: ['all'],
    tags: ['timeline', 'gantt', 'planning', 'milestones'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 987,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-05-15'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-risk-heatmap',
    name: 'Risk Analysis Heatmap',
    description: 'Interactive risk visualization for regulatory submission risks across modules',
    type: 'risk_heatmap',
    category: 'interactive',
    content: JSON.stringify({
      categories: ['Documentation', 'Testing', 'Clinical', 'Compliance', 'Technical', 'CMC'],
      template: true,
    }),
    submissionTypes: ['510K', 'IND', 'NDA', 'PMA'],
    segments: ['all'],
    tags: ['risk', 'heatmap', 'analysis', 'visualization'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 876,
    rating: 4.6,
    isOfficial: true,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-12-01'),
  },
  {
    id: 'tpl-ifu-checker',
    name: 'IFU Consistency Checker',
    description: 'Interactive tool to check Indications for Use consistency across documents',
    type: 'ifu_checker',
    category: 'interactive',
    content: JSON.stringify({
      documents: ['Form 3881', 'Cover Letter', 'Device Description', 'Labeling'],
      template: true,
    }),
    submissionTypes: ['510K'],
    segments: ['medtech', 'diagnostics'],
    tags: ['IFU', 'consistency', 'checker', 'tool'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 543,
    rating: 4.9,
    isOfficial: true,
    createdAt: new Date('2024-08-01'),
    updatedAt: new Date('2024-11-15'),
  },
  {
    id: 'tpl-traceability',
    name: 'Requirements Traceability Matrix',
    description: 'Interactive RTM linking requirements to verification and validation evidence',
    type: 'traceability_matrix',
    category: 'interactive',
    content: JSON.stringify({
      columns: ['Requirement ID', 'Requirement', 'Source', 'V&V Method', 'Evidence', 'Status'],
      template: true,
    }),
    submissionTypes: ['510K', 'PMA', 'DE_NOVO'],
    segments: ['medtech', 'diagnostics'],
    tags: ['traceability', 'RTM', 'verification', 'validation'],
    author: 'Concept2Cure',
    organization: 'Official',
    usageCount: 765,
    rating: 4.8,
    isOfficial: true,
    createdAt: new Date('2024-04-20'),
    updatedAt: new Date('2024-11-01'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENT MAPPING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Maps IndustrySegment to SegmentTag for filtering */
function segmentToTag(segment: string): SegmentTag {
  switch (segment) {
    case 'pharma': return 'pharma';
    case 'biotech': return 'biotech';
    case 'medtech': return 'medtech';
    case 'diagnostics': return 'diagnostics';
    default: return 'pharma'; // CRO, academic, regulatory, medical_writing default to pharma
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY ICONS
// ─────────────────────────────────────────────────────────────────────────────

const categoryIcons: Record<ArtifactCategory, React.ElementType> = {
  document: FileText,
  interactive: Workflow,
  visualization: BarChart3,
};

const typeColors: Record<ArtifactCategory, string> = {
  document: 'bg-zinc-100 text-zinc-700',
  interactive: 'bg-blue-50 text-blue-700',
  visualization: 'bg-emerald-50 text-emerald-700',
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: ExtendedArtifactTemplate;
  onUse: () => void;
  onPreview: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUse, onPreview }) => {
  const Icon = categoryIcons[template.category];

  return (
    <div className="group p-4 bg-white rounded-lg border border-zinc-200 hover:border-zinc-300 transition-all duration-150">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn('p-2 rounded-lg', typeColors[template.category])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-900 truncate">{template.name}</h3>
          <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
            {template.description}
          </p>
        </div>
        {template.isOfficial && (
          <Badge variant="secondary" className="text-xs flex-shrink-0 bg-zinc-100 text-zinc-600 border-0">
            Official
          </Badge>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {template.submissionTypes.map((type) => (
          <Badge
            key={type}
            variant="outline"
            className="text-xs px-1.5 py-0 border-zinc-200 text-zinc-500"
          >
            {type}
          </Badge>
        ))}
        {template.ctdSection && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 border-blue-200 text-blue-600">
            {template.ctdSection}
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-zinc-400 mb-3">
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {template.usageCount.toLocaleString()}
        </span>
        {template.rating && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            {template.rating}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800 text-xs h-8"
          onClick={onUse}
        >
          Use Template
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8 border-zinc-200"
          onClick={onPreview}
        >
          Preview
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PREVIEW DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface TemplatePreviewProps {
  template: ExtendedArtifactTemplate | null;
  open: boolean;
  onClose: () => void;
  onUse: () => void;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  open,
  onClose,
  onUse,
}) => {
  if (!template) return null;

  const Icon = categoryIcons[template.category];
  const content = typeof template.content === 'string'
    ? template.content
    : JSON.stringify(template.content, null, 2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', typeColors[template.category])}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription>{template.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] mt-4">
          <div className="bg-zinc-50 rounded-lg p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono text-zinc-700">
              {content}
            </pre>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-200">
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Download className="h-4 w-4" />
              {template.usageCount.toLocaleString()} uses
            </span>
            {template.rating && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                {template.rating} rating
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Updated {new Date(template.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button className="bg-zinc-900 text-white hover:bg-zinc-800" onClick={onUse}>
            Use This Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CATALOG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ArtifactsCatalogProps {
  open: boolean;
  onClose: () => void;
}

export const ArtifactsCatalog: React.FC<ArtifactsCatalogProps> = ({ open, onClose }) => {
  const { activeProject, createArtifact, createConversation, setActiveConversation } = useProject();
  const { segment } = useIndustry();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ArtifactCategory | 'all'>('all');
  const [selectedSubmissionType, setSelectedSubmissionType] = useState<SubmissionType | 'all'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<ExtendedArtifactTemplate | null>(null);

  const tag = segmentToTag(segment);

  // Filter templates by segment + user filters
  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter((template) => {
      // Segment filter — show templates matching user's segment or 'all'
      if (!template.segments.includes(tag) && !template.segments.includes('all')) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.tags.some((t) => t.toLowerCase().includes(query)) ||
          (template.ctdSection && template.ctdSection.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false;
      }

      // Submission type filter
      if (
        selectedSubmissionType !== 'all' &&
        !template.submissionTypes.includes(selectedSubmissionType)
      ) {
        return false;
      }

      return true;
    });
  }, [searchQuery, selectedCategory, selectedSubmissionType, tag]);

  const handleUseTemplate = async (template: ExtendedArtifactTemplate) => {
    if (!activeProject) {
      return;
    }

    // Create a new conversation for this template
    const conversation = await createConversation(activeProject.id, `From template: ${template.name}`);
    setActiveConversation(conversation.id);

    // Create the artifact from template — stored in vault via ProjectContext
    createArtifact({
      projectId: activeProject.id,
      conversationId: conversation.id,
      type: template.type,
      category: template.category,
      title: template.name,
      content: template.content,
    });

    onClose();
    setPreviewTemplate(null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSubmissionType('all');
  };

  const hasActiveFilters =
    searchQuery || selectedCategory !== 'all' || selectedSubmissionType !== 'all';

  // Determine available submission types based on segment
  const availableSubmissionTypes = useMemo(() => {
    const types = new Set<SubmissionType>();
    TEMPLATES.forEach(t => {
      if (t.segments.includes(tag) || t.segments.includes('all')) {
        t.submissionTypes.forEach(st => types.add(st));
      }
    });
    return Array.from(types).sort();
  }, [tag]);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900">
              <FileText className="h-5 w-5 text-zinc-500" />
              Template Library
            </DialogTitle>
            <DialogDescription>
              {filteredTemplates.length} templates available for your {segment} workflow. Select a template to begin authoring.
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex items-center gap-3 py-4 border-b border-zinc-200">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search templates, CTD sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-zinc-200"
              />
            </div>

            {/* Category filter */}
            <Select
              value={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value as ArtifactCategory | 'all')}
            >
              <SelectTrigger className="w-[150px] border-zinc-200">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="interactive">Interactive</SelectItem>
                <SelectItem value="visualization">Visualizations</SelectItem>
              </SelectContent>
            </Select>

            {/* Submission type filter — segment-aware */}
            <Select
              value={selectedSubmissionType}
              onValueChange={(value) =>
                setSelectedSubmissionType(value as SubmissionType | 'all')
              }
            >
              <SelectTrigger className="w-[140px] border-zinc-200">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {availableSubmissionTypes.map(st => (
                  <SelectItem key={st} value={st}>{st === '510K' ? '510(k)' : st === 'DE_NOVO' ? 'De Novo' : st}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-zinc-500">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Results count */}
          <div className="text-xs text-zinc-400 py-2">
            {filteredTemplates.length} of {TEMPLATES.length} templates
          </div>

          {/* Templates grid */}
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 gap-4 pb-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => handleUseTemplate(template)}
                  onPreview={() => setPreviewTemplate(template)}
                />
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Filter className="h-12 w-12 text-zinc-200 mb-4" />
                <h3 className="text-sm font-medium text-zinc-900 mb-2">
                  No templates found
                </h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Try adjusting your filters or search query.
                </p>
                <Button variant="outline" size="sm" onClick={clearFilters} className="border-zinc-200">
                  Clear all filters
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Template preview */}
      <TemplatePreview
        template={previewTemplate}
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        onUse={() => previewTemplate && handleUseTemplate(previewTemplate)}
      />
    </>
  );
};

export default ArtifactsCatalog;
