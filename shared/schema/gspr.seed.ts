/**
 * GSPR catalog seed — top-level Annex I clauses for EU MDR and IVDR.
 *
 * Conservative: only the top-level clauses + a few critical sub-clauses that
 * almost every device program must address. Operators can extend the catalog
 * with finer-grained sub-clauses (e.g., MDR §10.4 chemical/physical/biological
 * properties; §14 devices intended to be implanted) without code changes.
 *
 * References used (publicly available):
 *   EU MDR 2017/745 Annex I — General safety and performance requirements
 *   EU IVDR 2017/746 Annex I — General safety and performance requirements
 */

export interface GsprSeed {
  regulation: 'MDR' | 'IVDR';
  annex: 'I';
  chapter?: 'I' | 'II' | 'III';
  clause: string;
  title: string;
  summary?: string;
  deviceClassScope?: string[];
  productTypeScope?: string[];
  isImplantableOnly?: boolean;
  isSterileOnly?: boolean;
  relatedStandards?: string[];
}

export const GSPR_SEED: GsprSeed[] = [
  // ── MDR 2017/745 — Annex I, Chapter I (General requirements) ─────────────
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '1',
    title: 'Devices shall achieve performance intended by the manufacturer',
    summary:
      'Devices must achieve their intended performance and be designed/manufactured so that they are suitable for their intended purpose under normal conditions of use.',
    productTypeScope: ['device', 'samd', 'ai_ml', 'combination', 'implantable'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '2',
    title: 'Reduce risks as far as possible',
    summary: 'Risk reduction principle; risks must be reduced as far as possible without adversely affecting the benefit-risk ratio.',
    relatedStandards: ['ISO 14971:2019', 'ISO/TR 24971:2020'],
    productTypeScope: ['device', 'samd', 'ai_ml', 'combination'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '3',
    title: 'Risk management system',
    summary: 'Establish, document, implement, maintain a risk management system through the entire lifecycle of the device.',
    relatedStandards: ['ISO 14971:2019'],
    productTypeScope: ['device', 'samd', 'ai_ml', 'combination'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '4',
    title: 'Risk control measures',
    summary: 'Adopt the safest design and manufacture; take protective measures; provide information for safety.',
    relatedStandards: ['ISO 14971:2019'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '5',
    title: 'Reduce risks related to use error',
    summary: 'Reduce, as far as possible, risks related to ergonomic features and the environment in which the device is intended to be used.',
    relatedStandards: ['IEC 62366-1:2015/AMD 1:2020'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '6',
    title: 'Lifetime of the device',
    summary: 'Characteristics and performance shall not be adversely affected during the lifetime of the device.',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '7',
    title: 'Performance during transport and storage',
    summary: 'Devices must be packaged and transported such that performance is not adversely affected.',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '8',
    title: 'Side effects acceptability',
    summary: 'Side effects must constitute acceptable risk in relation to performance.',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'I',
    clause: '9',
    title: 'Devices without medical purpose (Annex XVI)',
    summary: 'Devices listed in Annex XVI must satisfy the same requirements as those with a medical purpose.',
  },

  // ── MDR Annex I, Chapter II (Design and manufacture) — selected ─────────
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '10',
    title: 'Chemical, physical and biological properties',
    relatedStandards: ['ISO 10993-1:2018'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '11',
    title: 'Infection and microbial contamination',
    relatedStandards: ['ISO 11135:2014/AMD 1:2018', 'ISO 11137-1:2006/AMD 2:2018'],
    isSterileOnly: true,
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '14',
    title: 'Construction of devices and interaction with their environment',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '15',
    title: 'Devices with diagnostic or measuring function',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '16',
    title: 'Protection against radiation',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '17',
    title: 'Electronic programmable systems and software',
    summary:
      'Devices with electronic programmable systems and software as a device shall be designed and developed in accordance with the state of the art (lifecycle, risk management, verification, validation).',
    relatedStandards: ['IEC 62304:2006/AMD 1:2015', 'IEC 81001-5-1:2021'],
    productTypeScope: ['device', 'samd', 'ai_ml'],
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '18',
    title: 'Active devices and devices connected to them',
  },
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'II',
    clause: '19',
    title: 'Particular requirements for active implantable devices',
    isImplantableOnly: true,
  },

  // ── MDR Annex I, Chapter III (Information supplied with the device) ────
  {
    regulation: 'MDR',
    annex: 'I',
    chapter: 'III',
    clause: '23',
    title: 'Label and instructions for use',
    summary: 'Each device shall be accompanied by the information needed to identify the device and its manufacturer, with safety and performance information.',
    relatedStandards: ['ISO 15223-1:2021'],
  },

  // ── IVDR 2017/746 — Annex I, Chapter I (General requirements) ──────────
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'I',
    clause: '1',
    title: 'Devices shall achieve performance intended by the manufacturer',
    productTypeScope: ['ivd'],
  },
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'I',
    clause: '2',
    title: 'Reduce risks as far as possible (IVD)',
    relatedStandards: ['ISO 14971:2019'],
    productTypeScope: ['ivd'],
  },
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'I',
    clause: '3',
    title: 'Risk management system (IVD)',
    relatedStandards: ['ISO 14971:2019'],
    productTypeScope: ['ivd'],
  },

  // ── IVDR Annex I, Chapter II — selected ────────────────────────────────
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'II',
    clause: '9',
    title: 'Performance characteristics of IVDs',
    summary:
      'Analytical performance, where applicable clinical performance, and traceability of values assigned to calibrators and trueness control materials.',
    relatedStandards: ['ISO 20916:2019', 'CLSI EP05-A3', 'CLSI EP07-A3', 'CLSI EP09-A3', 'CLSI EP17-A2'],
    productTypeScope: ['ivd'],
  },
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'II',
    clause: '16',
    title: 'Protection against electrical, mechanical, and thermal risks (IVD)',
    productTypeScope: ['ivd'],
  },
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'II',
    clause: '20',
    title: 'IVD software and electronic programmable systems',
    relatedStandards: ['IEC 62304:2006/AMD 1:2015', 'IEC 81001-5-1:2021'],
    productTypeScope: ['ivd', 'samd', 'ai_ml'],
  },

  // ── IVDR Annex I, Chapter III ─────────────────────────────────────────
  {
    regulation: 'IVDR',
    annex: 'I',
    chapter: 'III',
    clause: '20',
    title: 'IVD label and instructions for use',
    relatedStandards: ['ISO 15223-1:2021'],
    productTypeScope: ['ivd'],
  },
];
