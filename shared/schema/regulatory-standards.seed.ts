/**
 * Regulatory Standards Catalog — Seed Data
 *
 * Curated set of consensus standards most commonly cited in medical-device
 * and IVD submissions (FDA-recognized + EU-harmonized). Loaded into
 * `regulatory_standards` by `scripts/seed-regulatory-standards.ts`.
 *
 * Versions are accurate as of 2026-04. The `fda_recognition_number` field
 * reflects FDA's Recognized Consensus Standards database where applicable;
 * leave blank when not yet recognized so the gap is detectable.
 *
 * IMPORTANT: do not invent standard codes or recognition numbers. If a value
 * is unknown, set it null and let an operator fill it in.
 */

import type { InsertRegulatoryStandard } from './regulatory-graph';

export const REGULATORY_STANDARDS_SEED: Omit<
  InsertRegulatoryStandard,
  'createdAt' | 'updatedAt'
>[] = [
  // ── Quality management ────────────────────────────────────────────────
  {
    code: 'ISO 13485:2016',
    title: 'Medical devices — Quality management systems — Requirements for regulatory purposes',
    sdo: 'ISO',
    version: '2016',
    domain: 'qms',
    appliesTo: ['device', 'ivd', 'samd', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'CA', 'AU', 'JP'],
    status: 'active',
    summary:
      'Specifies QMS requirements where an organization needs to demonstrate its ability to provide medical devices that consistently meet customer and regulatory requirements.',
  },

  // ── Risk management ───────────────────────────────────────────────────
  {
    code: 'ISO 14971:2019',
    title: 'Medical devices — Application of risk management to medical devices',
    sdo: 'ISO',
    version: '2019',
    domain: 'risk',
    appliesTo: ['device', 'ivd', 'samd', 'ai_ml', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'CA', 'AU', 'JP'],
    status: 'active',
    summary:
      'Specifies the process for a manufacturer to identify hazards, estimate and evaluate risks, control them, and monitor effectiveness across the device lifecycle.',
  },
  {
    code: 'ISO/TR 24971:2020',
    title: 'Medical devices — Guidance on the application of ISO 14971',
    sdo: 'ISO',
    version: '2020',
    domain: 'risk',
    appliesTo: ['device', 'ivd', 'samd'],
    fdaRecognized: true,
    status: 'active',
    summary:
      'Guidance on developing, implementing, and maintaining a risk management system per ISO 14971:2019.',
  },

  // ── Software & SaMD ───────────────────────────────────────────────────
  {
    code: 'IEC 62304:2006/AMD 1:2015',
    title: 'Medical device software — Software life cycle processes',
    sdo: 'IEC',
    version: '2006/A1:2015',
    domain: 'software',
    appliesTo: ['device', 'samd', 'ivd', 'ai_ml'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'JP'],
    status: 'active',
    summary:
      'Defines life-cycle requirements for medical device software, with rigor scaled to software safety class A/B/C.',
  },
  {
    code: 'IEC 82304-1:2016',
    title: 'Health software — Part 1: General requirements for product safety',
    sdo: 'IEC',
    version: '2016',
    domain: 'software',
    appliesTo: ['samd', 'ai_ml'],
    fdaRecognized: true,
    status: 'active',
    summary:
      'Requirements for the safety and security of health software products that operate without dedicated hardware.',
  },

  // ── Usability / human factors ─────────────────────────────────────────
  {
    code: 'IEC 62366-1:2015/AMD 1:2020',
    title: 'Medical devices — Part 1: Application of usability engineering to medical devices',
    sdo: 'IEC',
    version: '2015/A1:2020',
    domain: 'usability',
    appliesTo: ['device', 'ivd', 'samd', 'ai_ml'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK'],
    status: 'active',
    summary:
      'Specifies a usability engineering process to provide for safe use of medical devices, including identification of use-related hazards.',
  },

  // ── Electrical safety ─────────────────────────────────────────────────
  {
    code: 'IEC 60601-1:2005/AMD 2:2020',
    title:
      'Medical electrical equipment — Part 1: General requirements for basic safety and essential performance',
    sdo: 'IEC',
    version: '3.2 (2005/A2:2020)',
    domain: 'electrical',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'CA', 'JP'],
    status: 'active',
    summary:
      'General safety requirements for medical electrical equipment, including risk-management integration and essential performance.',
  },
  {
    code: 'IEC 60601-1-2:2014/AMD 1:2020',
    title:
      'Medical electrical equipment — Part 1-2: Collateral standard: Electromagnetic disturbances',
    sdo: 'IEC',
    version: '4.1 (2014/A1:2020)',
    domain: 'electrical',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
    summary: 'EMC requirements and tests for medical electrical equipment and systems.',
  },

  // ── Biocompatibility ──────────────────────────────────────────────────
  {
    code: 'ISO 10993-1:2018',
    title:
      'Biological evaluation of medical devices — Part 1: Evaluation and testing within a risk management process',
    sdo: 'ISO',
    version: '2018',
    domain: 'biocompatibility',
    appliesTo: ['device', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'JP'],
    status: 'active',
    summary:
      'Framework for biological evaluation of medical devices within a risk-management process; selection of tests by contact type and duration.',
  },

  // ── Cybersecurity ─────────────────────────────────────────────────────
  {
    code: 'IEC 81001-5-1:2021',
    title:
      'Health software and health IT systems safety, effectiveness and security — Part 5-1: Security — Activities in the product life cycle',
    sdo: 'IEC',
    version: '2021',
    domain: 'cybersecurity',
    appliesTo: ['samd', 'device', 'ai_ml'],
    fdaRecognized: true,
    status: 'active',
    summary:
      'Security activities required across the product life cycle for connected health software, complementing IEC 62304.',
  },
  {
    code: 'AAMI TIR57:2016',
    title:
      'Principles for medical device security — Risk management',
    sdo: 'AAMI',
    version: '2016',
    domain: 'cybersecurity',
    appliesTo: ['device', 'samd'],
    fdaRecognized: true,
    status: 'active',
    summary:
      'Guidance on applying ISO 14971 to security risks for connected medical devices.',
  },

  // ── Sterilization ─────────────────────────────────────────────────────
  {
    code: 'ISO 11135:2014/AMD 1:2018',
    title:
      'Sterilization of health-care products — Ethylene oxide — Requirements for the development, validation and routine control of a sterilization process for medical devices',
    sdo: 'ISO',
    version: '2014/A1:2018',
    domain: 'sterilization',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },
  {
    code: 'ISO 11137-1:2006/AMD 2:2018',
    title:
      'Sterilization of health-care products — Radiation — Part 1: Requirements for the development, validation and routine control of a sterilization process',
    sdo: 'ISO',
    version: '2006/A2:2018',
    domain: 'sterilization',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Packaging ─────────────────────────────────────────────────────────
  {
    code: 'ISO 11607-1:2019/AMD 1:2023',
    title:
      'Packaging for terminally sterilized medical devices — Part 1: Requirements for materials, sterile barrier systems and packaging systems',
    sdo: 'ISO',
    version: '2019/A1:2023',
    domain: 'packaging',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Labeling / symbols ────────────────────────────────────────────────
  {
    code: 'ISO 15223-1:2021',
    title:
      'Medical devices — Symbols to be used with information to be supplied by the manufacturer — Part 1: General requirements',
    sdo: 'ISO',
    version: '2021',
    domain: 'symbols',
    appliesTo: ['device', 'ivd'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Clinical investigation ────────────────────────────────────────────
  {
    code: 'ISO 14155:2020',
    title:
      'Clinical investigation of medical devices for human subjects — Good clinical practice',
    sdo: 'ISO',
    version: '2020',
    domain: 'clinical_investigation',
    appliesTo: ['device', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
    summary:
      'Good clinical practice for design, conduct, recording, and reporting of clinical investigations involving medical devices.',
  },

  // ── IVD clinical performance ──────────────────────────────────────────
  {
    code: 'ISO 20916:2019',
    title:
      'In vitro diagnostic medical devices — Clinical performance studies using specimens from human subjects — Good study practice',
    sdo: 'ISO',
    version: '2019',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },
  {
    code: 'CLSI EP05-A3',
    title:
      'Evaluation of Precision of Quantitative Measurement Procedures; Approved Guideline — Third Edition',
    sdo: 'CLSI',
    version: '3rd ed.',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
  {
    code: 'CLSI EP17-A2',
    title:
      'Evaluation of Detection Capability for Clinical Laboratory Measurement Procedures; Approved Guideline — Second Edition',
    sdo: 'CLSI',
    version: '2nd ed.',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
    summary: 'Limit of blank, limit of detection, and limit of quantitation determination.',
  },
  {
    code: 'CLSI EP07-A3',
    title:
      'Interference Testing in Clinical Chemistry; Approved Guideline — Third Edition',
    sdo: 'CLSI',
    version: '3rd ed.',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
  {
    code: 'CLSI EP09-A3',
    title:
      'Measurement Procedure Comparison and Bias Estimation Using Patient Samples — Third Edition',
    sdo: 'CLSI',
    version: '3rd ed.',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
];
