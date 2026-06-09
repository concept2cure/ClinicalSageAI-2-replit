/**
 * Regulatory landscape synthesis for AnA.
 *
 * Fans out one topic across the existing evidence clients in parallel and
 * returns a single, compact, citeable briefing — trials + literature +
 * Medicare coverage, plus device safety (recalls) and/or drug labeling &
 * approvals depending on the domain. AnA then synthesizes the prose; this tool
 * gathers and normalizes the evidence in one call.
 *
 * Uses Promise.allSettled so a single source failure degrades to a per-source
 * error entry rather than sinking the whole briefing. Source functions are
 * injectable for unit testing.
 *
 * @module server/services/integrations/landscape
 */

import { searchTrials } from './clinicaltrials-client.js';
import { searchPubmed } from './pubmed-client.js';
import { searchMedicareCoverage } from './cms-coverage-client.js';
import { searchDeviceRecalls } from './device-recalls.js';
import { searchDrugLabels } from './drug-label-client.js';
import { searchDrugApprovals } from './drug-approvals-client.js';

export type LandscapeDomain = 'device' | 'drug' | 'auto';

export interface LandscapeParams {
  topic: string;
  domain?: LandscapeDomain;
  /** Max items per source (1–15, default 5). */
  limitPerSource?: number;
}

export interface LandscapeDeps {
  searchTrials: typeof searchTrials;
  searchPubmed: typeof searchPubmed;
  searchMedicareCoverage: typeof searchMedicareCoverage;
  searchDeviceRecalls: typeof searchDeviceRecalls;
  searchDrugLabels: typeof searchDrugLabels;
  searchDrugApprovals: typeof searchDrugApprovals;
}

export interface LandscapeResult {
  source: 'Regulatory Landscape';
  topic: string;
  domain: LandscapeDomain;
  sections: Record<string, unknown>;
  errors: Array<{ source: string; error: string }>;
}

const defaultDeps: LandscapeDeps = {
  searchTrials,
  searchPubmed,
  searchMedicareCoverage,
  searchDeviceRecalls,
  searchDrugLabels,
  searchDrugApprovals,
};

/**
 * Assemble a cross-source regulatory landscape for a topic. Always covers
 * trials, literature, and Medicare coverage; adds device recalls and/or drug
 * labeling + approvals per domain ('auto' includes both).
 */
export async function assessRegulatoryLandscape(
  params: LandscapeParams,
  deps: LandscapeDeps = defaultDeps
): Promise<LandscapeResult> {
  const topic = (params.topic || '').trim();
  const domain: LandscapeDomain = params.domain ?? 'auto';
  const limit = Math.min(Math.max(Math.trunc(params.limitPerSource ?? 5), 1), 15);

  const wantDevice = domain === 'device' || domain === 'auto';
  const wantDrug = domain === 'drug' || domain === 'auto';

  // key → task. Each task returns the compact section payload.
  const tasks: Array<{ key: string; run: () => Promise<unknown> }> = [
    {
      key: 'trials',
      run: async () => {
        const r = await deps.searchTrials({ query: topic, pageSize: limit });
        return {
          total: r.totalCount,
          top: r.trials.map(t => ({ nctId: t.nctId, title: t.title, phase: t.phase, status: t.status, url: t.url })),
        };
      },
    },
    {
      key: 'literature',
      run: async () => {
        const r = await deps.searchPubmed({ query: topic, maxResults: limit });
        return {
          total: r.totalCount,
          top: r.articles.map(a => ({ pmid: a.pmid, title: a.title, journal: a.journal, url: a.url })),
        };
      },
    },
    {
      key: 'coverage',
      run: async () => {
        const r = await deps.searchMedicareCoverage({ keyword: topic, limit });
        return {
          matched: r.matched,
          documents: r.documents.map(d => ({ documentId: d.documentId, title: d.title, type: d.type, url: d.url })),
        };
      },
    },
  ];

  if (wantDevice) {
    tasks.push({
      key: 'deviceRecalls',
      run: async () => {
        const r = await deps.searchDeviceRecalls({ query: topic, limit });
        return { summary: r.summary, recalls: r.recalls.slice(0, limit) };
      },
    });
  }
  if (wantDrug) {
    tasks.push({
      key: 'drugLabels',
      run: async () => {
        const r = await deps.searchDrugLabels({ query: topic, limit });
        return { total: r.total, labels: r.labels.map(l => ({ brandName: l.brandName, genericName: l.genericName, indications: l.indications })) };
      },
    });
    tasks.push({
      key: 'drugApprovals',
      run: async () => {
        const r = await deps.searchDrugApprovals({ query: topic, limit });
        return { total: r.total, approvals: r.approvals };
      },
    });
  }

  const settled = await Promise.allSettled(tasks.map(t => t.run()));
  const sections: Record<string, unknown> = {};
  const errors: Array<{ source: string; error: string }> = [];

  settled.forEach((outcome, i) => {
    const key = tasks[i].key;
    if (outcome.status === 'fulfilled') {
      sections[key] = outcome.value;
    } else {
      const reason = outcome.reason;
      errors.push({ source: key, error: reason instanceof Error ? reason.message : String(reason) });
    }
  });

  return { source: 'Regulatory Landscape', topic, domain, sections, errors };
}
