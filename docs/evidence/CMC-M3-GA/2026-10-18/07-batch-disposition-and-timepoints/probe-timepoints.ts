/**
 * Run from the repo root:
 *   npx tsx docs/evidence/CMC-M3-GA/2026-10-18/07-batch-disposition-and-timepoints/probe-timepoints.ts
 */
import { monthsIn, studyCoverage, checkQ1E } from '../../../../../server/services/cmc/ich-compliance-q1e';
import { numericSeries, readRecordedStabilityResults } from '../../../../../server/services/cmc/recorded-stability';

const show = (l: string, v: unknown) => console.info(l.padEnd(40), JSON.stringify(v));
console.info('── my monthsIn vs the register’s own labels ──');
for (const t of ['Month 24', 'Month 0', 'T24', '24', '0', '24m', '2 years', 'month 12'])
  show(`monthsIn(${JSON.stringify(t)})`, monthsIn(t));

console.info('\n── a complete 24-month study labelled "Month N" ──');
const study = {
  studyName: 'DP-LT-24', studyType: 'long-term', storageCondition: '25C/60%RH',
  duration: '24', timePoints: '0,6,12,24', shelfLifeClaim: '24 months',
  results: [
    { timePoint: 'Month 0', parameter: 'assay', result: '99.4' },
    { timePoint: 'Month 6', parameter: 'assay', result: '98.2' },
    { timePoint: 'Month 12', parameter: 'assay', result: '97.5' },
    { timePoint: 'Month 24', parameter: 'assay', result: '96.6' },
  ],
};
show('studyCoverage', studyCoverage(study));
const read = readRecordedStabilityResults(study.results);
show('numericSeries (the canonical reader)', numericSeries(read.points));
const NDA: never = { application: 'marketing', phase: 3, basis: 'nda' } as never;
const inp: never = { specs: [], methods: [], stability: [study], drugSubs: [], processes: [], sourceObjects: [], sections: [], stage: NDA } as never;
console.info('\nverdict:');
for (const f of checkQ1E(inp)) console.info(' ', f.ruleId.padEnd(38), f.status.padEnd(8), f.message.slice(0, 92));
