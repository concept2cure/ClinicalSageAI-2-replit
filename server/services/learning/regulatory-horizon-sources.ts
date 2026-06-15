/**
 * Regulatory Horizon Sources — the global watchlist AnA self-studies.
 *
 * This is the curated registry of authoritative regulators and harmonisation
 * bodies whose published output AnA scans on a schedule to stay current on
 * clinical-trial design, methods, and International Harmonisation standards. It
 * is the "what to read" half of the continuous-learning loop; the scan job
 * (server/jobs/regulatoryHorizonScan) is the "when/how".
 *
 * HONESTY NOTE: each `url` below is the body's stable, real landing/guidance
 * page — not a fabricated feed endpoint. Where a body publishes a machine
 * feed, configure it per-deploy via the env override documented on the source
 * (so we never hard-code an unverified RSS path). The registry is intentionally
 * data-only and side-effect free so it can be unit-tested and surfaced read-only.
 */

import type { ClientSegment } from '../ana-ri/industry-wisdom-pack.js';

/** ISO-ish jurisdiction tags. 'global' = harmonised / supra-national output. */
export type Jurisdiction =
  | 'global'
  | 'US'
  | 'EU'
  | 'JP'
  | 'UK'
  | 'CA'
  | 'CH'
  | 'KR'
  | 'CN'
  | 'BR'
  | 'AU'
  | 'SG';

/** Authoritative bodies AnA tracks. */
export type StandardBody =
  | 'ICH'
  | 'ICMRA'
  | 'WHO'
  | 'CIOMS'
  | 'CDISC'
  | 'ISO'
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'MHRA'
  | 'HealthCanada'
  | 'TGA'
  | 'NMPA'
  | 'ANVISA';

/** How a source is consumed. 'html' = page scrape/distil; 'rss'/'atom'/'api' = structured feed. */
export type SourceKind = 'rss' | 'atom' | 'html' | 'api';

/** Scan cadence. The job runs each source no more often than its cadence. */
export type ScanCadence = 'daily' | 'weekly' | 'monthly';

export interface HorizonSource {
  /** Stable id, used as the namespace for cards harvested from this source. */
  id: string;
  body: StandardBody;
  /** Region(s) the body's output governs. 'global' for harmonised standards. */
  jurisdiction: Jurisdiction;
  title: string;
  /** Real, stable landing/guidance page (provenance + fallback scrape target). */
  url: string;
  kind: SourceKind;
  cadence: ScanCadence;
  /** Client segments this source is most load-bearing for. */
  segments: ClientSegment[];
  /** Topic tags this source tends to emit (retrieval + routing). */
  topics: string[];
  /** When false, the scan skips it (kept in registry for visibility). */
  enabled: boolean;
  /**
   * Env var name that, when set, supplies a verified machine feed URL for this
   * source — so feed endpoints are confirmed at deploy time, never guessed here.
   */
  feedEnvVar?: string;
  note?: string;
}

const ALL_SEGMENTS: ClientSegment[] = ['pharma', 'biotech', 'mdx'];

/**
 * The watchlist. Harmonisation bodies first (highest leverage — one change
 * propagates across every ICH-member market), then the major national/regional
 * regulators that implement them.
 */
export const HORIZON_SOURCES: HorizonSource[] = [
  // ── Harmonisation & supra-national (global leverage) ──────────────────────
  {
    id: 'ich-workproducts',
    body: 'ICH',
    jurisdiction: 'global',
    title: 'ICH — Work Products, Guidelines & News',
    url: 'https://www.ich.org/page/articles-procedures',
    kind: 'html',
    cadence: 'weekly',
    segments: ['pharma', 'biotech'],
    topics: ['GCP', 'estimands', 'CTD', 'stability', 'impurities', 'pharmacovigilance', 'MRCT'],
    enabled: true,
    feedEnvVar: 'HORIZON_FEED_ICH',
    note: 'Backbone of global harmonisation; Q/S/E/M families adopted by all ICH members.',
  },
  {
    id: 'icmra-statements',
    body: 'ICMRA',
    jurisdiction: 'global',
    title: 'ICMRA — International Coalition of Medicines Regulatory Authorities',
    url: 'https://www.icmra.info/drupal/news',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech'],
    topics: ['regulatory convergence', 'real-world evidence', 'AI', 'decentralised trials'],
    enabled: true,
    feedEnvVar: 'HORIZON_FEED_ICMRA',
  },
  {
    id: 'who-regulation',
    body: 'WHO',
    jurisdiction: 'global',
    title: 'WHO — Regulation and Prequalification',
    url: 'https://www.who.int/teams/regulation-prequalification',
    kind: 'html',
    cadence: 'monthly',
    segments: ALL_SEGMENTS,
    topics: ['GCP', 'prequalification', 'good reliance practices', 'biologicals'],
    enabled: true,
    feedEnvVar: 'HORIZON_FEED_WHO',
  },
  {
    id: 'cioms-publications',
    body: 'CIOMS',
    jurisdiction: 'global',
    title: 'CIOMS — Working Group Reports (pharmacovigilance & ethics)',
    url: 'https://cioms.ch/publications/',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech'],
    topics: ['pharmacovigilance', 'benefit-risk', 'research ethics', 'safety'],
    enabled: true,
  },
  {
    id: 'cdisc-standards',
    body: 'CDISC',
    jurisdiction: 'global',
    title: 'CDISC — Data Standards (SDTM, ADaM, CDASH)',
    url: 'https://www.cdisc.org/standards',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech'],
    topics: ['SDTM', 'ADaM', 'CDASH', 'data standards', 'submission datasets'],
    enabled: true,
  },
  {
    id: 'iso-tc194',
    body: 'ISO',
    jurisdiction: 'global',
    title: 'ISO/TC 194 — Biological & clinical evaluation of medical devices (ISO 14155)',
    url: 'https://www.iso.org/committee/54472.html',
    kind: 'html',
    cadence: 'monthly',
    segments: ['mdx'],
    topics: ['ISO 14155', 'clinical investigation', 'medical devices', 'GCP for devices'],
    enabled: true,
  },

  // ── National / regional regulators (implement the harmonised canon) ───────
  {
    id: 'fda-guidance',
    body: 'FDA',
    jurisdiction: 'US',
    title: 'FDA — Search for Guidance Documents',
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
    kind: 'html',
    cadence: 'weekly',
    segments: ALL_SEGMENTS,
    topics: ['guidance', 'clinical trials', 'CMC', 'oncology', 'diversity', 'real-world evidence'],
    enabled: true,
    feedEnvVar: 'HORIZON_FEED_FDA',
  },
  {
    id: 'ema-news',
    body: 'EMA',
    jurisdiction: 'EU',
    title: 'EMA — News and Scientific Guidelines',
    url: 'https://www.ema.europa.eu/en/news',
    kind: 'html',
    cadence: 'weekly',
    segments: ALL_SEGMENTS,
    topics: ['scientific guidelines', 'CTR', 'clinical trials', 'biosimilars', 'ATMP'],
    enabled: true,
    feedEnvVar: 'HORIZON_FEED_EMA',
  },
  {
    id: 'pmda-english',
    body: 'PMDA',
    jurisdiction: 'JP',
    title: 'PMDA — Reviews, Guidelines & Notifications (English)',
    url: 'https://www.pmda.go.jp/english/review-services/reviews/0001.html',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech'],
    topics: ['review reports', 'notifications', 'bridging', 'ethnic factors'],
    enabled: true,
    note: 'Some primary source is Japanese; distil step normalises and preserves original for provenance.',
  },
  {
    id: 'mhra-guidance',
    body: 'MHRA',
    jurisdiction: 'UK',
    title: 'MHRA — Guidance and Publications',
    url: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency',
    kind: 'html',
    cadence: 'weekly',
    segments: ALL_SEGMENTS,
    topics: ['guidance', 'clinical trials', 'IRAS', 'innovative licensing'],
    enabled: true,
  },
  {
    id: 'health-canada',
    body: 'HealthCanada',
    jurisdiction: 'CA',
    title: 'Health Canada — Drug and Health Product Guidance',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products.html',
    kind: 'html',
    cadence: 'monthly',
    segments: ALL_SEGMENTS,
    topics: ['guidance', 'clinical trials', 'CTA'],
    enabled: true,
  },
  {
    id: 'tga-australia',
    body: 'TGA',
    jurisdiction: 'AU',
    title: 'TGA — Australia: Guidance and Publications',
    url: 'https://www.tga.gov.au/resources/guidance',
    kind: 'html',
    cadence: 'monthly',
    segments: ALL_SEGMENTS,
    topics: ['guidance', 'clinical trials', 'CTN/CTA'],
    enabled: true,
  },
  {
    id: 'nmpa-china',
    body: 'NMPA',
    jurisdiction: 'CN',
    title: 'NMPA — China (English portal)',
    url: 'https://english.nmpa.gov.cn/',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech', 'mdx'],
    topics: ['drug registration', 'clinical trials', 'technical guidelines'],
    enabled: true,
    note: 'Primary source largely Chinese; distil step normalises and preserves original.',
  },
  {
    id: 'anvisa-brazil',
    body: 'ANVISA',
    jurisdiction: 'BR',
    title: 'ANVISA — Brazil: Regulations and News',
    url: 'https://www.gov.br/anvisa/pt-br',
    kind: 'html',
    cadence: 'monthly',
    segments: ['pharma', 'biotech', 'mdx'],
    topics: ['RDC resolutions', 'clinical trials', 'registration'],
    enabled: false,
    note: 'Disabled by default (Portuguese-only); enable once translation budget is allocated.',
  },
];

const BY_ID = new Map(HORIZON_SOURCES.map(s => [s.id, s]));

export function getSource(id: string): HorizonSource | undefined {
  return BY_ID.get(id.trim());
}

/** Sources currently enabled for scanning. */
export function enabledSources(): HorizonSource[] {
  return HORIZON_SOURCES.filter(s => s.enabled);
}

/** Map a cadence to its minimum interval in days (used by the scan to decide due-ness). */
export function cadenceDays(cadence: ScanCadence): number {
  switch (cadence) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
  }
}

export interface HorizonSourcesSummary {
  total: number;
  enabled: number;
  byBody: Record<string, number>;
  byJurisdiction: Record<string, number>;
}

export function horizonSourcesSummary(): HorizonSourcesSummary {
  const byBody: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  for (const s of HORIZON_SOURCES) {
    byBody[s.body] = (byBody[s.body] ?? 0) + 1;
    byJurisdiction[s.jurisdiction] = (byJurisdiction[s.jurisdiction] ?? 0) + 1;
  }
  return {
    total: HORIZON_SOURCES.length,
    enabled: enabledSources().length,
    byBody,
    byJurisdiction,
  };
}
