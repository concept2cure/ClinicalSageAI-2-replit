import { SecHunter } from './hunters/sec-hunter';
import { FdaHunter } from './hunters/fda-hunter';
import { TrialsHunter } from './hunters/trials-hunter';
import { EmaHunter } from './hunters/ema-hunter';
import { CanadaHunter } from './hunters/canada-hunter';
import { CronJob } from 'cron';

let lastSuccessfulHunt: string | null = null;
let lastHuntStatus: 'success' | 'partial' | 'error' | null = null;
let lastHuntRecordCount = 0;

export const DataHunterService = {
  async huntGlobal(_options?: { keywords?: string; sources?: Record<string, boolean> }) {
    console.log('>>> 🐺 LUMEN CORTEX GLOBAL HUNT STARTED <<<');
    try {
      const results = await Promise.all([
        SecHunter.run(),
        FdaHunter.run(),
        TrialsHunter.hunt('device'),
        EmaHunter.run(),
        CanadaHunter.run(),
      ]);

      const recordCount = results.reduce((sum, result: any) => {
        return sum + (result?.new_records || 0);
      }, 0);
      const allSuccess = results.every((result: any) => result?.status === 'success');

      lastHuntRecordCount = recordCount;
      lastHuntStatus = allSuccess ? 'success' : 'partial';
      if (allSuccess) {
        lastSuccessfulHunt = new Date().toISOString();
      }

      console.log('>>> 🐺 HUNT COMPLETE <<<');
      return results;
    } catch (e) {
      lastHuntStatus = 'error';
      lastHuntRecordCount = 0;
      console.error('>>> 🐺 HUNT FAILED <<<', e);
      throw e;
    }
  },
  getStatus() {
    return {
      last_successful_hunt: lastSuccessfulHunt,
      last_hunt_status: lastHuntStatus,
      last_hunt_record_count: lastHuntRecordCount,
    };
  },
  startScheduledHunt() {
    if (process.env.LUMEN_HUNTER_DISABLE === 'true' || process.env.NODE_ENV === 'test') {
      console.log('🟡 Lumen Cortex hunters disabled via environment.');
      return null;
    }

    const schedule = process.env.LUMEN_HUNTER_CRON || '0 */6 * * *';
    const job = new CronJob(schedule, async () => {
      try {
        await DataHunterService.huntGlobal();
      } catch (e) {
        console.error('❌ Lumen Cortex hunt failed:', e);
      }
    });

    job.start();
    console.log(`✅ Lumen Cortex hunters scheduled (${schedule})`);
    return job;
  },
};
