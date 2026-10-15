/**
 * Regulatory Horizon Scan — AnA's continuous self-study loop.
 *
 * On a schedule this walks the horizon source registry (ICH and the harmonised
 * canon first, then national regulators), harvests recent items, distils each
 * into a structured KnowledgeCard, routes it through the promotion policy, and
 * rolls the result into a weekly digest. The cards are stored and listed by
 * /api/learning/horizon. Nothing yet feeds them into AnA's answers or corpora.
 *
 * Read-mostly and defensive, like corpusIngestionSweep: every source is
 * independent and nothing is thrown. A source that cannot be read, or whose
 * items cannot be distilled, is named in the digest and is not marked scanned,
 * so the next run retries it. The whole job self-guards to a no-op unless
 * ENABLE_REGULATORY_HORIZON_SCAN=true, so default boot is unchanged.
 *
 * @module server/jobs/regulatoryHorizonScan
 */

import cron from 'node-cron';
import { createScopedLogger } from '../utils/logger.js';
import { runWithSystemTenantScope } from '../db/tenantStore';
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
import {
  buildHorizonDigest,
  type HorizonDigest,
  type ScanCoverage,
  type ScanRecord,
} from '../services/learning/horizon-digest.js';

const logger = createScopedLogger('regulatory-horizon');

/** Per-source item cap when none configured. */
const DEFAULT_LIMIT = 25;

export interface HorizonScanResult {
  /** Due sources that were read; the digest names the ones that were not. */
  sourcesScanned: number;
  digest: HorizonDigest;
  ichCurrency: IchCurrencyReport;
}

/** Decide whether a source is due, given the last time it ran (ISO) and now. */
export function isSourceDue(
  source: HorizonSource,
  lastRunIso: string | undefined,
  now: Date
): boolean {
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
 * source is recorded in the digest and the scan continues with the next.
 */
export async function runRegulatoryHorizonScan(now: Date = new Date()): Promise<HorizonScanResult> {
  return runWithSystemTenantScope('regulatory-horizon-scan', async () => {
    const store = getHorizonStore();
    await store.load();

    const policy = policyFromEnv();
    const limit =
      Number(process.env.HORIZON_SCAN_LIMIT) > 0
        ? Number(process.env.HORIZON_SCAN_LIMIT)
        : DEFAULT_LIMIT;
    const sources = enabledSources().filter(s => isSourceDue(s, _lastRunBySource.get(s.id), now));

    logger.info(`Horizon scan starting: ${sources.length} due source(s).`);

    const records: ScanRecord[] = [];
    const unreadSources: ScanCoverage['unreadSources'] = [];
    const undistilledItems: ScanCoverage['undistilledItems'] = [];
    let itemsHarvested = 0;

    // 2026-10-15: a failed fetch came back as zero items and a failed model call
    // as "no card", both only logged. Every failed source was then marked
    // scanned, so it was not retried until its cadence elapsed, and the digest
    // read "0 change(s) ingested … Nothing needs your attention this week".
    for (const source of sources) {
      try {
        const harvested = await harvest(source, { limit });
        if (harvested.error !== null) {
          unreadSources.push({ sourceId: source.id, error: harvested.error });
          logger.warn(`Could not read ${source.id}: ${harvested.error}`);
          continue;
        }
        itemsHarvested += harvested.items.length;
        let undistilled = 0;
        for (const item of harvested.items) {
          const outcome = await distill(item, source);
          if (outcome.status === 'failed') {
            undistilled++;
            undistilledItems.push({ sourceId: source.id, url: item.url || source.url, reason: outcome.reason });
            continue;
          }
          if (outcome.status === 'no_change') continue;
          const card = outcome.card;

          const { decision, reason } = decidePromotion(card, policy);
          const status =
            decision === 'auto_promote'
              ? 'promoted'
              : decision === 'review'
              ? 'pending'
              : 'quarantined';

          const next = { ...card, status } as typeof card;
          store.upsert(next);
          records.push({ card: next, decision, reason });
        }
        if (undistilled === 0) _lastRunBySource.set(source.id, now.toISOString());
        logger.info(
          `Scanned ${source.id}: ${harvested.items.length} item(s) harvested, ${undistilled} not distilled.`
        );
      } catch (err: any) {
        unreadSources.push({ sourceId: source.id, error: 'scan failed unexpectedly (see the server log)' });
        logger.error(`Horizon scan failed for ${source.id}: ${err?.message}`);
      }
    }

    await store.persist();

    const digest = buildHorizonDigest(
      records,
      { sourcesDue: sources.length, unreadSources, itemsHarvested, undistilledItems },
      now
    );
    const ichCurrency = assessIchCurrency(store.all(), now);

    logger.info(
      `Horizon scan done: ${digest.totals.sourcesScanned} of ${sources.length} source(s) read, ` +
        `${digest.totals.itemsUndistilled} item(s) not distilled; ${digest.totals.ingested} ingested ` +
        `(${digest.totals.autoPromoted} auto, ${digest.totals.review} review, ${digest.totals.quarantined} quarantined); ` +
        `${ichCurrency.actions.length} ICH corpus action(s).`
    );

    _lastResult = { sourcesScanned: digest.totals.sourcesScanned, digest, ichCurrency };
    return _lastResult;
  });
}

/**
 * Schedule the horizon scan. No-op unless ENABLE_REGULATORY_HORIZON_SCAN=true,
 * so default boot is unchanged. Default schedule: 06:00 weekly on Monday — so
 * the digest is waiting at the start of the week (override with
 * REGULATORY_HORIZON_SCAN_CRON).
 */
export function startRegulatoryHorizonSchedule(): void {
  if (process.env.ENABLE_REGULATORY_HORIZON_SCAN !== 'true') {
    // Boot-posture line: deliberately opt-in (external harvesting egress), so
    // make the OFF state visible rather than silently returning.
    logger.info(
      'Regulatory horizon scan disabled (set ENABLE_REGULATORY_HORIZON_SCAN=true to enable)',
      {
        enabled: false,
        controlledBy: 'ENABLE_REGULATORY_HORIZON_SCAN',
      }
    );
    return;
  }
  const expr = process.env.REGULATORY_HORIZON_SCAN_CRON || '0 6 * * 1';
  try {
    cron.schedule(expr, () => {
      void runRegulatoryHorizonScan().catch(err =>
        logger.error(`Regulatory horizon scan failed: ${err?.message ?? String(err)}`)
      );
    });
    logger.info(`Regulatory horizon scan scheduled (${expr})`, {
      enabled: true,
      controlledBy: 'ENABLE_REGULATORY_HORIZON_SCAN',
      schedule: expr,
    });
  } catch (err: any) {
    logger.error(`Failed to schedule regulatory horizon scan: ${err?.message}`);
  }
}
