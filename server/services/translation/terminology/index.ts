/**
 * Bilingual terminology corpus — registry + accessors.
 *
 * Aggregates the per-domain terminology modules into one corpus and exposes
 * pure read helpers the glossary engine / seed loader consume. Adding a domain
 * is a two-line change here (import its module, add it to DOMAIN_MODULES) — the
 * accessors and summary derive everything else.
 *
 * Provenance/verification discipline (see ./types): every entry carries a
 * sourceRef and a verificationStatus. The corpus is a SEED — entries are
 * 'unverified' / 'needs_review' until a qualified native linguist signs off;
 * promotion into a tenant glossary should gate on 'verified'. This module never
 * asserts certification, it only organizes the corpus.
 *
 * @module server/services/translation/terminology
 */

import type { TerminologyEntry, DomainTerminologyModule, TerminologyVerificationStatus, GlossaryCategory } from './types';
import { regulatoryCtdModule } from './domains/regulatory-ctd';
import { clinicalSafetyPvModule } from './domains/clinical-safety-pv';
import { pharmacologyPkAdmeModule } from './domains/pharmacology-pk-adme';
import { oncologyModule } from './domains/oncology';
import { biostatisticsDesignModule } from './domains/biostatistics-design';
import { immunoInflammationVaccinesModule } from './domains/immuno-inflammation-vaccines';
import { cmcQualityAnalyticalModule } from './domains/cmc-quality-analytical';

/**
 * Every domain module in the corpus, in a stable order. Append new domains here
 * (import above, add the module) — accessors + summary pick them up automatically.
 */
export const DOMAIN_MODULES: readonly DomainTerminologyModule[] = [
  regulatoryCtdModule,
  clinicalSafetyPvModule,
  pharmacologyPkAdmeModule,
  oncologyModule,
  biostatisticsDesignModule,
  immunoInflammationVaccinesModule,
  cmcQualityAnalyticalModule,
];

/** The flat corpus: every entry across every domain, in domain/registration order. */
export const ALL_TERMINOLOGY: readonly TerminologyEntry[] = DOMAIN_MODULES.flatMap(
  (m) => m.entries,
);

/** Stable list of domain keys present in the corpus. */
export const TERMINOLOGY_DOMAINS: readonly string[] = DOMAIN_MODULES.map((m) => m.domain);

/** All entries for one domain (empty array if the domain is unknown). */
export function getTerminologyByDomain(domain: string): readonly TerminologyEntry[] {
  return DOMAIN_MODULES.find((m) => m.domain === domain)?.entries ?? [];
}

/**
 * The do-not-translate set: identifiers that must be masked before MT and
 * restored verbatim (citations, agency names, codes, INN/drug names, units…).
 */
export function getDoNotTranslateTerms(): readonly TerminologyEntry[] {
  return ALL_TERMINOLOGY.filter((e) => e.doNotTranslate);
}

/**
 * Locked source→target pairs: non-DNT entries with a mandated target rendering.
 * These feed glossary-adherence checking and preferred-term substitution.
 */
export function getLockedTermPairs(): ReadonlyArray<{ source: string; target: string; category: GlossaryCategory }> {
  const pairs: Array<{ source: string; target: string; category: GlossaryCategory }> = [];
  for (const e of ALL_TERMINOLOGY) {
    if (!e.doNotTranslate && typeof e.target === 'string' && e.target.length > 0) {
      pairs.push({ source: e.source, target: e.target, category: e.category });
    }
  }
  return pairs;
}

/** Per-key tallies over the corpus, for at-a-glance summaries + tests. */
export interface TerminologyCorpusSummary {
  total: number;
  doNotTranslate: number;
  lockedPairs: number;
  byDomain: Record<string, number>;
  byVerificationStatus: Record<TerminologyVerificationStatus, number>;
}

/** Compute the corpus summary (pure derivation over ALL_TERMINOLOGY). */
export function corpusSummary(): TerminologyCorpusSummary {
  const byDomain: Record<string, number> = {};
  const byVerificationStatus: Record<TerminologyVerificationStatus, number> = {
    unverified: 0,
    needs_review: 0,
    verified: 0,
  };
  let dnt = 0;
  let locked = 0;
  for (const e of ALL_TERMINOLOGY) {
    byDomain[e.domain] = (byDomain[e.domain] ?? 0) + 1;
    byVerificationStatus[e.verificationStatus]++;
    if (e.doNotTranslate) dnt++;
    else if (typeof e.target === 'string' && e.target.length > 0) locked++;
  }
  return {
    total: ALL_TERMINOLOGY.length,
    doNotTranslate: dnt,
    lockedPairs: locked,
    byDomain,
    byVerificationStatus,
  };
}

export type { TerminologyEntry, DomainTerminologyModule, TerminologyVerificationStatus } from './types';
