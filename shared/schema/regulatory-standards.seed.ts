/**
 * Consensus Standards Seed — UPSERTs into the canonical `device_test_standards` table.
 *
 * Loaded by `scripts/seed-regulatory-standards.ts`. Idempotent:
 *   - if a row with `standard_code` exists, the new governance fields
 *     (domain, applies_to, fda_recognized, eu_harmonized, jurisdictions,
 *     status, summary) are merged in but legacy fields are preserved.
 *   - if no row exists, a new row is inserted with both legacy and
 *     governance fields populated.
 *
 * Versions are accurate as of 2026-04. If a value is unknown, leave it null
 * so the gap is visible.
 */

export interface StandardSeed {
  // Legacy columns (existing on device_test_standards)
  standardCode: string;
  standardName: string;
  standardBody: string; // ISO | IEC | ASTM | CLSI | AAMI | FDA
  family?: string | null;
  version?: string | null;
  editionYear?: number | null;
  region?: string | null;
  description?: string | null;

  // Governance columns (added 2026-04-29)
  domain: string;
  appliesTo: string[];
  fdaRecognized?: boolean;
  euHarmonized?: boolean;
  jurisdictions?: string[];
  status?: 'active' | 'superseded' | 'withdrawn' | 'draft';
  summary?: string;
}

export const REGULATORY_STANDARDS_SEED: StandardSeed[] = [
  // ── Quality management ────────────────────────────────────────────────
  {
    standardCode: 'ISO 13485:2016',
    standardName:
      'Medical devices — Quality management systems — Requirements for regulatory purposes',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2016',
    editionYear: 2016,
    region: 'Global',
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
    standardCode: 'ISO 14971:2019',
    standardName: 'Medical devices — Application of risk management to medical devices',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2019',
    editionYear: 2019,
    region: 'Global',
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
    standardCode: 'ISO/TR 24971:2020',
    standardName: 'Medical devices — Guidance on the application of ISO 14971',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2020',
    editionYear: 2020,
    region: 'Global',
    domain: 'risk',
    appliesTo: ['device', 'ivd', 'samd'],
    fdaRecognized: true,
    status: 'active',
    summary: 'Guidance on developing, implementing, and maintaining ISO 14971-conformant risk management.',
  },

  // ── Software & SaMD ───────────────────────────────────────────────────
  {
    standardCode: 'IEC 62304:2006/AMD 1:2015',
    standardName: 'Medical device software — Software life cycle processes',
    standardBody: 'IEC',
    family: 'IEC',
    version: '2006/A1:2015',
    editionYear: 2015,
    region: 'Global',
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
    standardCode: 'IEC 82304-1:2016',
    standardName: 'Health software — Part 1: General requirements for product safety',
    standardBody: 'IEC',
    family: 'IEC',
    version: '2016',
    editionYear: 2016,
    region: 'Global',
    domain: 'software',
    appliesTo: ['samd', 'ai_ml'],
    fdaRecognized: true,
    status: 'active',
  },

  // ── Usability / human factors ─────────────────────────────────────────
  {
    standardCode: 'IEC 62366-1:2015/AMD 1:2020',
    standardName: 'Medical devices — Part 1: Application of usability engineering to medical devices',
    standardBody: 'IEC',
    family: 'IEC',
    version: '2015/A1:2020',
    editionYear: 2020,
    region: 'Global',
    domain: 'usability',
    appliesTo: ['device', 'ivd', 'samd', 'ai_ml'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK'],
    status: 'active',
  },

  // ── Electrical safety ─────────────────────────────────────────────────
  {
    standardCode: 'IEC 60601-1:2005/AMD 2:2020',
    standardName:
      'Medical electrical equipment — Part 1: General requirements for basic safety and essential performance',
    standardBody: 'IEC',
    family: 'IEC',
    version: '3.2 (2005/A2:2020)',
    editionYear: 2020,
    region: 'Global',
    domain: 'electrical',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'CA', 'JP'],
    status: 'active',
  },
  {
    standardCode: 'IEC 60601-1-2:2014/AMD 1:2020',
    standardName: 'Medical electrical equipment — Part 1-2: Electromagnetic disturbances',
    standardBody: 'IEC',
    family: 'IEC',
    version: '4.1 (2014/A1:2020)',
    editionYear: 2020,
    region: 'Global',
    domain: 'electrical',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Biocompatibility ──────────────────────────────────────────────────
  {
    standardCode: 'ISO 10993-1:2018',
    standardName:
      'Biological evaluation of medical devices — Part 1: Evaluation and testing within a risk management process',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2018',
    editionYear: 2018,
    region: 'Global',
    domain: 'biocompatibility',
    appliesTo: ['device', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    jurisdictions: ['US', 'EU', 'UK', 'JP'],
    status: 'active',
  },

  // ── Cybersecurity ─────────────────────────────────────────────────────
  {
    standardCode: 'IEC 81001-5-1:2021',
    standardName:
      'Health software and health IT systems safety, effectiveness and security — Part 5-1: Security — Activities in the product life cycle',
    standardBody: 'IEC',
    family: 'IEC',
    version: '2021',
    editionYear: 2021,
    region: 'Global',
    domain: 'cybersecurity',
    appliesTo: ['samd', 'device', 'ai_ml'],
    fdaRecognized: true,
    status: 'active',
  },
  {
    standardCode: 'AAMI TIR57:2016',
    standardName: 'Principles for medical device security — Risk management',
    standardBody: 'AAMI',
    family: 'AAMI',
    version: '2016',
    editionYear: 2016,
    region: 'US',
    domain: 'cybersecurity',
    appliesTo: ['device', 'samd'],
    fdaRecognized: true,
    status: 'active',
  },

  // ── Sterilization ─────────────────────────────────────────────────────
  {
    standardCode: 'ISO 11135:2014/AMD 1:2018',
    standardName: 'Sterilization of health-care products — Ethylene oxide',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2014/A1:2018',
    editionYear: 2018,
    region: 'Global',
    domain: 'sterilization',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },
  {
    standardCode: 'ISO 11137-1:2006/AMD 2:2018',
    standardName: 'Sterilization of health-care products — Radiation — Part 1',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2006/A2:2018',
    editionYear: 2018,
    region: 'Global',
    domain: 'sterilization',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Packaging ─────────────────────────────────────────────────────────
  {
    standardCode: 'ISO 11607-1:2019/AMD 1:2023',
    standardName:
      'Packaging for terminally sterilized medical devices — Part 1: Materials and sterile barrier systems',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2019/A1:2023',
    editionYear: 2023,
    region: 'Global',
    domain: 'packaging',
    appliesTo: ['device'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Labeling / symbols ────────────────────────────────────────────────
  {
    standardCode: 'ISO 15223-1:2021',
    standardName:
      'Medical devices — Symbols to be used with information to be supplied by the manufacturer — Part 1',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2021',
    editionYear: 2021,
    region: 'Global',
    domain: 'symbols',
    appliesTo: ['device', 'ivd'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── Clinical investigation ────────────────────────────────────────────
  {
    standardCode: 'ISO 14155:2020',
    standardName:
      'Clinical investigation of medical devices for human subjects — Good clinical practice',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2020',
    editionYear: 2020,
    region: 'Global',
    domain: 'clinical_investigation',
    appliesTo: ['device', 'combination'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },

  // ── IVD clinical performance ──────────────────────────────────────────
  {
    standardCode: 'ISO 20916:2019',
    standardName:
      'In vitro diagnostic medical devices — Clinical performance studies using specimens from human subjects',
    standardBody: 'ISO',
    family: 'ISO',
    version: '2019',
    editionYear: 2019,
    region: 'Global',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    euHarmonized: true,
    status: 'active',
  },
  {
    standardCode: 'CLSI EP05-A3',
    standardName: 'Evaluation of Precision of Quantitative Measurement Procedures (3rd ed.)',
    standardBody: 'CLSI',
    family: 'CLSI',
    version: '3rd ed.',
    region: 'US',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
  {
    standardCode: 'CLSI EP17-A2',
    standardName: 'Evaluation of Detection Capability for Clinical Laboratory Measurement Procedures (2nd ed.)',
    standardBody: 'CLSI',
    family: 'CLSI',
    version: '2nd ed.',
    region: 'US',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
    summary: 'Limit of blank, limit of detection, limit of quantitation determination.',
  },
  {
    standardCode: 'CLSI EP07-A3',
    standardName: 'Interference Testing in Clinical Chemistry (3rd ed.)',
    standardBody: 'CLSI',
    family: 'CLSI',
    version: '3rd ed.',
    region: 'US',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
  {
    standardCode: 'CLSI EP09-A3',
    standardName: 'Measurement Procedure Comparison and Bias Estimation Using Patient Samples (3rd ed.)',
    standardBody: 'CLSI',
    family: 'CLSI',
    version: '3rd ed.',
    region: 'US',
    domain: 'ivd_clinical_performance',
    appliesTo: ['ivd'],
    fdaRecognized: true,
    status: 'active',
  },
];
