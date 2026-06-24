/**
 * Regulatory Horizon Scan — AnA's continuous self-study loop.
 *
 * On a schedule this walks the horizon source registry (ICH and the harmonised
 * canon first, then national regulators), harvests recent items, distils each
 * into a structured KnowledgeCard, routes it through the promotion policy, and
 * rolls the result into a weekly no-touch digest. It is the runtime that turns
 * the platform's existing ingestion + RAG + corpora into a self-updating
 * knowledge layer.
 *
 * Read-mostly and defensive, exactly like corpusIngestionSweep: every source is
 * independent, failures are logged (never thrown), and the whole job self-guards
 * to a no-op unless ENABLE_REGULATORY_HORIZON_SCAN=true — so default boot is
 * unchanged. The human touchpoint is one weekly digest, nothing more.
 *
 * @module server/jobs/regulatoryHorizonScan
 */

import cron from 'node-cron';
import { createScopedLogger } from '../utils/logger.js';
import {
  enabledSources,
  cadenceDays,
  type HorizonSource,
} from '../services/learning/regulatory-horizon-sources.js';
import { harvest } from '../services/learning/harvester.js';
import { distill } from '../services/learning/distiller.js';
import { decidePromotion, policyFromEnv } from '../services/learning/promotion-policy.js';
import { getHorizonStore } from '../services/learning/horizon-store.js';
import { assessIchCurrency, type IchCurrencyReport } from '../services/learning/ich-currency.js';
import { buildHorizonDigest, type HorizonDigest, type ScanRecord } from '../services/learning/horizon-digest.js';

const logger = createScopedLogger('regulatory-horizon');

/** Per-source item cap when none configured. */
const DEFAULT_LIMIT = 25;

export interface HorizonScanResult {
  sourcesScanned: number;
  digest: HorizonDigest;
  ichCurrency: IchCurrencyReport;
}

/** Decide whether a source is due, given the last time it ran (ISO) and now. */
export function isSourceDue(source: HorizonSource, lastRunIso: string | undefined, now: Date): boolean {
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  const ageDays = (now.getTime() - last) / 86_400_000;
  return ageDays >= cadenceDays(source.cadence);
}

// Last digest/currency report, kept in-process so the read API can surface the
// most recent scan without re-running it. Populated by runRegulatoryHorizonScan.
let _lastResult: HorizonScanResult | null = null;
const _lastRunBySource = new Map<string, string>();

export function getLastHorizonResult(): HorizonScanResult | null {
  return _lastResult;
}

/**
 * Run one horizon scan over all due, enabled sources. Never throws: a failing
 * source is logged and the scan continues with the next.
 */
export async function runRegulatoryHorizonScan(now: Date = new Date()): Promise<HorizonScanResult> {
  const store = getHorizonStore();
  await store.load();

  const policy = policyFromEnv();
  const limit = Number(process.env.HORIZON_SCAN_LIMIT) > 0 ? Number(process.env.HORIZON_SCAN_LIMIT) : DEFAULT_LIMIT;
  const sources = enabledSources().filter(s => isSourceDue(s, _lastRunBySource.get(s.id), now));

  logger.info(`Horizon scan starting: ${sources.length} due source(s).`);

  const records: ScanRecord[] = [];

  for (const source of sources) {
    try {
      const items = await harvest(source, { limit });
      for (const item of items) {
        const card = await distill(item, source);
        if (!card) continue;

        const { decision, reason } = decidePromotion(card, policy);
        const status = decision === 'auto_promote' ? 'promoted' : decision === 'review' ? 'pending' : 'quarantined';

        const next = { ...card, status } as typeof card;
        store.upsert(next);
        records.push({ card: next, decision, reason });
      }
      _lastRunBySource.set(source.id, now.toISOString());
      logger.info(`Scanned ${source.id}: ${items.length} item(s) harvested.`);
    } catch (err: any) {
      logger.error(`Horizon scan failed for ${source.id}: ${err?.message}`);
    }
  }

  await store.persist();

  const digest = buildHorizonDigest(records, sources.length, now);
  const ichCurrency = assessIchCurrency(store.all(), now);

  logger.info(
    `Horizon scan done: ${digest.totals.ingested} ingested ` +
      `(${digest.totals.autoPromoted} auto, ${digest.totals.review} review, ${digest.totals.quarantined} quarantined); ` +
      `${ichCurrency.actions.length} ICH corpus action(s).`,
  );

  _lastResult = { sourcesScanned: sources.length, digest, ichCurrency };
  return _lastResult;
}

/**
 * Schedule the horizon scan. No-op unless ENABLE_REGULATORY_HORIZON_SCAN=true,
 * so default boot is unchanged. Default schedule: 06:00 weekly on Monday — so
 * the digest is waiting at the start of the week (override with
 * REGULATORY_HORIZON_SCAN_CRON).
 */
export function startRegulatoryHorizonSchedule(): void {
  if (process.env.ENABLE_REGULATORY_HORIZON_SCAN !== 'true') return;
  const expr = process.env.REGULATORY_HORIZON_SCAN_CRON || '0 6 * * 1';
  try {
    cron.schedule(expr, () => {
      void runRegulatoryHorizonScan().catch(err =>
        logger.error(`Regulatory horizon scan failed: ${err?.message ?? String(err)}`)
      );
    });
    logger.info(`Regulatory horizon scan scheduled (${expr})`);
  } catch (err: any) {
    logger.error(`Failed to schedule regulatory horizon scan: ${err?.message}`);
  }
}
