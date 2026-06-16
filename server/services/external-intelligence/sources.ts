/**
 * External Intelligence — source registry.
 *
 * Every source AnA checks on the nightly sweep. Two families:
 *
 *   regulatory  — agency news / rulemaking across the markets the platform
 *                 serves (FDA via the Federal Register API + FDA press RSS,
 *                 EMA, MHRA, TGA). Add markets by adding entries.
 *   knowledge   — academic and industry centers of study methodology:
 *                 SCDM (Society for Clinical Data Management), PubMed
 *                 methodology literature, medRxiv methods preprints.
 *
 * All sources are fetched fail-soft: a source that is down or changes its
 * format logs and is skipped — the sweep never dies on one feed.
 *
 * Operators can extend the registry without a deploy via
 * EXTERNAL_INTEL_EXTRA_FEEDS — a JSON array of
 * { key, name, sourceType, market?, regulatoryBody?, url } RSS/Atom feeds.
 *
 * @module server/services/external-intelligence/sources
 */

import type { ExternalIntelSourceType } from '../../../shared/schema/external-intelligence.js';

export type SourceKind = 'rss' | 'federal_register' | 'pubmed' | 'medrxiv';

export interface ExternalIntelSource {
  key: string;
  name: string;
  sourceType: ExternalIntelSourceType;
  kind: SourceKind;
  market: string | null; // 'US' | 'EU' | 'UK' | 'AU' | 'global'
  regulatoryBody: string | null; // 'FDA' | 'EMA' | 'MHRA' | 'TGA' | null
  /** Feed/endpoint URL. For pubmed this is the search term, not a URL. */
  url: string;
  topics: string[];
}

const BUILTIN_SOURCES: ExternalIntelSource[] = [
  // ── Regulatory agencies ────────────────────────────────────────────────
  {
    key: 'fda_federal_register',
    name: 'FDA — Federal Register (rules, notices, guidance availability)',
    sourceType: 'regulatory_agency',
    kind: 'federal_register',
    market: 'US',
    regulatoryBody: 'FDA',
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=food-and-drug-administration&order=newest&per_page=25',
    topics: ['guidance', 'rulemaking'],
  },
  {
    key: 'fda_press',
    name: 'FDA — Press Announcements',
    sourceType: 'regulatory_agency',
    kind: 'rss',
    market: 'US',
    regulatoryBody: 'FDA',
    url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
    topics: ['announcements'],
  },
  {
    key: 'ema_news',
    name: 'EMA — News & Updates',
    sourceType: 'regulatory_agency',
    kind: 'rss',
    market: 'EU',
    regulatoryBody: 'EMA',
    url: 'https://www.ema.europa.eu/en/rss.xml',
    topics: ['guidance', 'announcements'],
  },
  {
    key: 'mhra_updates',
    name: 'MHRA — News & Publications (GOV.UK)',
    sourceType: 'regulatory_agency',
    kind: 'rss',
    market: 'UK',
    regulatoryBody: 'MHRA',
    url: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom',
    topics: ['guidance', 'announcements'],
  },
  {
    key: 'tga_news',
    name: 'TGA — News & Alerts',
    sourceType: 'regulatory_agency',
    kind: 'rss',
    market: 'AU',
    regulatoryBody: 'TGA',
    url: 'https://www.tga.gov.au/rss.xml',
    topics: ['announcements'],
  },

  // ── Academic / industry centers of knowledge ───────────────────────────
  {
    key: 'scdm_news',
    name: 'SCDM — Society for Clinical Data Management',
    sourceType: 'industry_group',
    kind: 'rss',
    market: 'global',
    regulatoryBody: null,
    url: 'https://scdm.org/feed/',
    topics: ['clinical data management', 'GCDMP', 'study methods'],
  },
  {
    key: 'pubmed_study_methods',
    name: 'PubMed — new study-methodology literature',
    sourceType: 'academic',
    kind: 'pubmed',
    market: 'global',
    regulatoryBody: null,
    // E-utilities search term (not a URL): clinical data management + modern
    // trial-methodology themes (SCDM GCDMP territory, DCTs, RBQM, estimands).
    url: '("clinical data management"[Title/Abstract] OR "decentralized clinical trial"[Title/Abstract] OR "risk-based quality management"[Title/Abstract] OR "risk-based monitoring"[Title/Abstract] OR "estimand"[Title/Abstract] OR "adaptive trial design"[Title/Abstract] OR "master protocol"[Title/Abstract])',
    topics: ['study methods', 'clinical data management', 'trial design'],
  },
  {
    key: 'medrxiv_methods',
    name: 'medRxiv — new methods preprints',
    sourceType: 'academic',
    kind: 'medrxiv',
    market: 'global',
    regulatoryBody: null,
    url: 'https://api.biorxiv.org/details/medrxiv',
    topics: ['study methods', 'preprints'],
  },
];

/** Parse operator-supplied extra RSS feeds. Malformed JSON → empty list. */
function extraFeedsFromEnv(): ExternalIntelSource[] {
  const raw = process.env.EXTERNAL_INTEL_EXTRA_FEEDS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (f: any) => f && typeof f.key === 'string' && typeof f.url === 'string' && typeof f.name === 'string'
      )
      .map((f: any) => ({
        key: f.key,
        name: f.name,
        sourceType: (['regulatory_agency', 'standards_body', 'academic', 'industry_group'].includes(
          f.sourceType
        )
          ? f.sourceType
          : 'industry_group') as ExternalIntelSourceType,
        kind: 'rss' as const,
        market: typeof f.market === 'string' ? f.market : null,
        regulatoryBody: typeof f.regulatoryBody === 'string' ? f.regulatoryBody : null,
        url: f.url,
        topics: Array.isArray(f.topics) ? f.topics.filter((t: any) => typeof t === 'string') : [],
      }));
  } catch {
    return [];
  }
}

/** The full source list for a sweep: built-ins plus env-configured extras. */
export function getExternalIntelSources(): ExternalIntelSource[] {
  const extras = extraFeedsFromEnv();
  const builtinKeys = new Set(BUILTIN_SOURCES.map(s => s.key));
  return [...BUILTIN_SOURCES, ...extras.filter(e => !builtinKeys.has(e.key))];
}
