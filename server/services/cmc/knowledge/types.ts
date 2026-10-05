/**
 * The shape of the platform's cited CMC regulatory record.
 *
 * Every statement AnA makes about what an agency requires of a CMC dossier is
 * read from this record and carries its source: the official identifier, its
 * status and date, and the literature that corroborates it. See ./index.ts.
 */

/** The authorities the record names, normalised. */
export const CMC_AUTHORITIES = [
  'ICH',
  'FDA',
  'EC',
  'EMA',
  'MHRA',
  'Swissmedic',
  'MHLW',
  'PMDA',
  'MFDS',
  'NMPA',
  'Health Canada',
  'TGA',
  'ANVISA',
  'CDSCO',
  'HSA',
  'WHO',
  'PIC/S',
  'EDQM',
  'USP',
  /** Peer-reviewed academic literature: evidence and interpretation, never an authority's requirement. */
  'Literature',
] as const;
export type CmcAuthority = (typeof CMC_AUTHORITIES)[number];

export type CmcApplicationType = 'clinical_trial' | 'marketing' | 'post_approval' | 'gmp' | 'all';
export type CmcModality = 'small_molecule' | 'biologic' | 'atmp' | 'vaccine' | 'all';
export type CmcConfidence = 'high' | 'medium' | 'low';

/** A regulation, guideline, guidance, Q&A or pharmacopoeial text. */
export interface CmcSource {
  id: string;
  authority: string;
  /** The official identifier: "Q2(R2)", "21 CFR 312.23(a)(7)", "EMA/CHMP/QWP/545525/2017 Rev. 2". */
  code: string;
  title: string;
  kind: 'regulation' | 'guideline' | 'guidance' | 'template' | 'q&a' | 'pharmacopoeia' | 'other';
  status: 'final' | 'draft' | 'superseded' | 'withdrawn' | 'unknown';
  /** Adoption or publication date, YYYY, YYYY-MM or YYYY-MM-DD. */
  date: string;
  supersedes?: string[];
  supersededBy?: string;
  applicationTypes: CmcApplicationType[];
  modalities: CmcModality[];
  ctdSections: string[];
  scope: string;
  url: string;
  corroboratingUrls: string[];
  confidence: CmcConfidence;
  /** What could not be established, in words; empty when nothing. */
  uncertainty: string;
}

/** One thing an authority requires, tied to the source(s) that say it. */
export interface CmcRequirement {
  id: string;
  authority: string;
  applicationType: CmcApplicationType;
  /** As the source states it: "phase 1", "phase 2-3", "all phases", "marketing". */
  phase: string;
  modality: string;
  /** CTD sections it lands in, normalised ("3.2.S.4.1"); empty when not CTD-placed. */
  ctdSections: string[];
  statement: string;
  sourceIds: string[];
  confidence: CmcConfidence;
}

/** How an authority receives the quality part of an application. */
export interface CmcPathway {
  authority: string;
  applicationName: string;
  legalBasis: string;
  qualityDossierFormat: string;
  phaseAppropriate: string;
  gmpForInvestigationalProduct: string;
  regionalSpecifics: string;
  language: string;
  sourceIds: string[];
  confidence: CmcConfidence;
}

export interface CmcCitation {
  kind: 'guideline' | 'regulation' | 'article' | 'white-paper' | 'pharmacopoeia';
  /** Guideline code, or "PMID:…", "PMCID:…", "DOI:…". */
  id: string;
  title: string;
  year: string;
  url: string;
}

/** A note on one question a CMC lead asks, with the science and its citations. */
export interface CmcKnowledgeNote {
  id: string;
  topic: string;
  ctdSections: string[];
  jurisdictions: string[];
  phase: string;
  modality: CmcModality;
  summary: string;
  keyPoints: string[];
  commonDeficiencies: string[];
  citations: CmcCitation[];
  confidence: CmcConfidence;
}

export interface CmcRegulatoryRecord {
  /** The date the record's statuses were established as of. */
  asOf: string;
  /** How the record was built and checked, in words. */
  method: string;
  sources: CmcSource[];
  requirements: CmcRequirement[];
  pathways: CmcPathway[];
  notes: CmcKnowledgeNote[];
}
