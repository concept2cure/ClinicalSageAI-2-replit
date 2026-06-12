/**
 * External intelligence sweep — AnA's nightly scan of the outside world.
 *
 * Every night AnA checks the regulatory agencies for every market the
 * platform serves (FDA, EMA, MHRA, TGA, plus operator-configured feeds)
 * and the academic / industry centers of study-methodology knowledge
 * (SCDM, PubMed methodology literature, medRxiv methods preprints). New
 * findings land in external_intelligence_findings, surface in AnA's chat
 * context via the EXTERNAL INTELLIGENCE block, and power the digest API —
 * so every client, in every market, wakes up to an assistant that already
 * read last night's news.
 *
 * Default ON (the monitoring is a product feature, not an ops experiment);
 * disable with ENABLE_EXTERNAL_INTELLIGENCE=false. Default schedule: 01:00
 * nightly (override with EXTERNAL_INTELLIGENCE_CRON). Defensive like the
 * sibling sweeps: per-source failures are logged, never thrown.
 *
 * @module server/jobs/externalIntelligenceSweep
 */

import cron from 'node-cron';
import { runExternalIntelligenceSweep } from '../services/external-intelligence/index.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('external-intel-sweep');

/**
 * Schedule the nightly external intelligence sweep. Enabled by default;
 * set ENABLE_EXTERNAL_INTELLIGENCE=false to opt out.
 */
export function startExternalIntelligenceSchedule(): void {
  if (process.env.ENABLE_EXTERNAL_INTELLIGENCE === 'false') return;
  const expr = process.env.EXTERNAL_INTELLIGENCE_CRON || '0 1 * * *';
  try {
    cron.schedule(expr, () => {
      void runExternalIntelligenceSweep().catch(err =>
        logger.error(`External intelligence sweep crashed: ${err?.message}`)
      );
    });
    logger.info(`External intelligence sweep scheduled (${expr})`);
  } catch (err: any) {
    logger.error(`Failed to schedule external intelligence sweep: ${err?.message}`);
  }
}
