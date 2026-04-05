/**
 * Beta Seed: Biotech / Pharma Workspace
 *
 * Creates realistic demo project data for the biotech/pharma founder path.
 * Includes IND, NDA/BLA, and CMC tracks with representative content.
 *
 * Usage: node scripts/seed-beta-biotech-workspace.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const seededProjects = [
  // ── TRACK A: IND Application (green path — complete) ──
  {
    key: 'ind-green-path',
    submissionType: 'IND',
    state: {
      projectName: 'C2C-101 IND Application',
      companyName: 'Meridian Therapeutics',
      drugName: 'MRD-2847',
      indication: 'Non-small cell lung cancer (NSCLC)',
      phase: 'Phase 1/2',
      targetAgency: 'FDA',
      mechanism: 'Selective CDK4/6 inhibitor with novel binding profile',
      therapeuticArea: 'Oncology',
      moleculeType: 'Small molecule',
      route: 'Oral',
      indSections: {
        'Module 1': { status: 'complete', title: 'Administrative & Prescribing Information' },
        'Module 2.4': { status: 'complete', title: 'Nonclinical Overview' },
        'Module 2.5': { status: 'complete', title: 'Clinical Overview' },
        'Module 2.6': { status: 'complete', title: 'Nonclinical Written and Tabulated Summaries' },
        'Module 2.7': { status: 'complete', title: 'Clinical Summary' },
        'Module 3': { status: 'complete', title: 'Quality (CMC)' },
        'Module 4': { status: 'complete', title: 'Nonclinical Study Reports' },
        'Module 5': { status: 'in_progress', title: 'Clinical Study Reports' },
      },
      regulatoryStrategy: 'Fast Track designation requested based on unmet medical need in third-line NSCLC.',
      gapAnalysis: {
        critical: [],
        major: ['Module 5 clinical study reports pending final QC'],
        minor: ['Administrative forms need wet-ink signatures'],
      },
      readinessScore: 87,
      documents: [
        'IND-cover-letter.docx',
        'Form-1571.pdf',
        'investigators-brochure-v3.docx',
        'clinical-protocol-MRD2847-001.docx',
        'nonclinical-pharmacology-summary.docx',
        'CMC-drug-substance-spec.pdf',
        'CMC-drug-product-spec.pdf',
        'stability-data-summary.xlsx',
      ],
      exportReady: true,
    },
  },

  // ── TRACK B: NDA Submission (mid-path — in progress) ──
  {
    key: 'nda-mid-path',
    submissionType: 'NDA',
    state: {
      projectName: 'Veloprazole NDA Submission',
      companyName: 'Cascade Pharmaceuticals',
      drugName: 'Veloprazole',
      indication: 'Gastroesophageal reflux disease (GERD)',
      phase: 'Phase 3 complete',
      targetAgency: 'FDA',
      mechanism: 'Next-generation proton pump inhibitor with improved acid suppression profile',
      therapeuticArea: 'Gastroenterology',
      moleculeType: 'Small molecule',
      route: 'Oral',
      ectdStructure: {
        'Module 1': { status: 'in_progress', completeness: 60 },
        'Module 2': { status: 'in_progress', completeness: 75 },
        'Module 3': { status: 'complete', completeness: 100 },
        'Module 4': { status: 'complete', completeness: 100 },
        'Module 5': { status: 'in_progress', completeness: 45 },
      },
      regulatoryStrategy: 'Standard NDA pathway. Two pivotal Phase 3 trials completed with positive results.',
      gapAnalysis: {
        critical: ['Clinical study reports for VLP-301 and VLP-302 not finalized'],
        major: ['Module 2.5 Clinical Overview incomplete', 'Pediatric study plan pending'],
        minor: ['Patent certification letter needed for Module 1'],
      },
      readinessScore: 62,
      documents: [
        'clinical-protocol-VLP301.docx',
        'clinical-protocol-VLP302.docx',
        'CMC-complete-module3.pdf',
        'nonclinical-complete-module4.pdf',
        'biostatistics-SAP-VLP301.docx',
        'risk-evaluation-REMS.docx',
      ],
      exportReady: false,
    },
  },

  // ── TRACK C: BLA (biologics — early stage) ──
  {
    key: 'bla-early-path',
    submissionType: 'BLA',
    state: {
      projectName: 'AVB-1200 BLA Submission',
      companyName: 'Apex Biologics',
      drugName: 'AVB-1200 (Avabizumab)',
      indication: 'Moderate-to-severe atopic dermatitis',
      phase: 'Phase 3 ongoing',
      targetAgency: 'FDA',
      mechanism: 'Anti-IL-31 receptor monoclonal antibody',
      therapeuticArea: 'Immunology / Dermatology',
      moleculeType: 'Monoclonal antibody (IgG4)',
      route: 'Subcutaneous injection',
      regulatoryStrategy: 'Breakthrough Therapy designation granted. Rolling submission planned.',
      gapAnalysis: {
        critical: ['Phase 3 data not yet unblinded', 'CMC process validation pending'],
        major: ['Immunogenicity analysis ongoing', 'Comparability study for manufacturing site transfer'],
        minor: ['Environmental assessment waiver to be filed'],
      },
      readinessScore: 34,
      documents: [
        'clinical-protocol-AVB1200-301.docx',
        'investigators-brochure-v5.docx',
        'CMC-characterization-report.pdf',
        'nonclinical-toxicology-package.pdf',
      ],
      exportReady: false,
    },
  },

  // ── TRACK D: CMC Documentation Set ──
  {
    key: 'cmc-documentation',
    submissionType: 'IND',
    state: {
      projectName: 'MRD-2847 CMC Package',
      companyName: 'Meridian Therapeutics',
      drugName: 'MRD-2847',
      cmcFocus: true,
      cmcSections: {
        'Drug Substance': {
          status: 'complete',
          subsections: ['General Information', 'Manufacture', 'Characterisation', 'Control', 'Reference Standards', 'Container Closure', 'Stability'],
        },
        'Drug Product': {
          status: 'in_progress',
          subsections: ['Description & Composition', 'Pharmaceutical Development', 'Manufacture', 'Control', 'Reference Standards', 'Container Closure', 'Stability'],
        },
        'Appendices': {
          status: 'not_started',
          subsections: ['Facilities & Equipment', 'Adventitious Agents', 'Novel Excipients'],
        },
      },
      documents: [
        'drug-substance-specification.pdf',
        'analytical-methods-validation.pdf',
        'stability-protocol-DS.pdf',
        'batch-records-DS-001-003.pdf',
        'drug-product-formulation-development.docx',
      ],
      readinessScore: 71,
      exportReady: false,
    },
  },
];

const outputDir = path.resolve(process.cwd(), 'test-results', 'beta-seed');
await mkdir(outputDir, { recursive: true });
const outFile = path.join(outputDir, 'seeded-biotech-workspace.json');
await writeFile(outFile, JSON.stringify({ seededAt: new Date().toISOString(), seededProjects }, null, 2));

console.log(`✅ Biotech/Pharma seed pack generated at ${outFile}`);
console.log(`   ${seededProjects.length} projects: IND (green), NDA (mid), BLA (early), CMC (docs)`);
console.log('Use this pack to preload API fixtures or localStorage in beta demos.');
