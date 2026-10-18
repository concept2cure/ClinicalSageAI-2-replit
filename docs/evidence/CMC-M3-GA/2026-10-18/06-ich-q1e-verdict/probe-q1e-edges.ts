/**
 * The probe that found the defects — run it from the repo root:
 *
 *   npx tsx docs/evidence/CMC-M3-GA/2026-10-18/06-ich-q1e-verdict/probe-q1e-edges.ts
 *
 * It prints; it asserts nothing. The assertions live in the rule's own tests
 * (server/services/cmc/__tests__/ich-compliance-q1e.test.ts), which fail on
 * each defect with the fix removed. This file is kept so the next reader can
 * probe the parser the same way rather than reading it and trusting what it
 * looks like.
 */
import { checkQ1E, monthsIn, latestTimePoint, longTermCoverage, statedClaim } from '../../../../../server/services/cmc/ich-compliance-q1e';
const EMPTY: any = { specs: [], methods: [], stability: [], drugSubs: [], processes: [], sourceObjects: [], sections: [] };
const NDA: any = { application: 'marketing', phase: 3, basis: 'nda' };
const of = (stability: any[], stage: any) => ({ ...EMPTY, stability, stage });
const show = (label: string, v: unknown) => console.info(label.padEnd(44), JSON.stringify(v));

console.info('── the parser ──');
for (const t of ['1.5 years', '0.5 years', '1000 months', '24M', '2-year', '18 months', '24 months', '36 mo', 'NMT 24 months', 'at least 24 months'])
  show(`monthsIn(${JSON.stringify(t)})`, monthsIn(t));
console.info('── time points ──');
for (const t of ['0,3,6,12,24', '[0,3,6,12,24]', '0, 3, 6, 9, 12', '0,6,12,18,24M', 'T0,T3,T6'])
  show(`latestTimePoint(${JSON.stringify(t)})`, latestTimePoint(t));

console.info('\n── a refrigerated product: long term 5C, accelerated 25C ──');
const fridge = [
  { studyName: 'LT-5C', studyType: 'primary stability', storageCondition: 'LT, 5°C ± 3°C', duration: '24', timePoints: '0, 3, 6, 12, 24', shelfLifeClaim: '24 months' },
  { studyName: 'ACC-25C', studyType: 'accelerated', storageCondition: 'ACC, 25°C ± 2°C / 60% ± 5% RH', duration: '6', timePoints: '0, 3, 6', shelfLifeClaim: '' },
];
show('longTermCoverage', longTermCoverage(fridge));
show('verdict', checkQ1E(of(fridge, NDA) as any).map((f: any) => [f.ruleId, f.status]));

console.info('\n── intermediate only, 30C (Zone II: intermediate, NOT long term) ──');
const inter = [
  { studyName: 'INT-12', studyType: 'intermediate', storageCondition: 'INT, 30°C ± 2°C / 65% ± 5% RH', duration: '12', timePoints: '0, 3, 6, 9, 12', shelfLifeClaim: '12 months', climaticZone: 'II' },
];
show('longTermCoverage', longTermCoverage(inter));
show('verdict', checkQ1E(of(inter, NDA) as any).map((f: any) => [f.ruleId, f.status]));

console.info('\n── a DS retest period beside a DP shelf life ──');
const dsdp = [
  { studyName: 'DS retest', studyType: 'long-term', storageCondition: 'LT, 25°C/60% RH', duration: '36', timePoints: '0, 6, 12, 24, 36', shelfLifeClaim: '60 months', scope: 'DS' },
  { studyName: 'DP primary', studyType: 'long-term', storageCondition: 'LT, 25°C/60% RH', duration: '24', timePoints: '0, 3, 6, 12, 24', shelfLifeClaim: '24 months', scope: 'DP' },
  { studyName: 'DP acc', studyType: 'accelerated', storageCondition: 'ACC, 40°C/75% RH', duration: '6', timePoints: '0, 3, 6', shelfLifeClaim: '', scope: 'DP' },
];
show('statedClaim', statedClaim(dsdp));
show('verdict', checkQ1E(of(dsdp, NDA) as any).map((f: any) => [f.ruleId, f.status]));

console.info('\n── a readable 12-month claim beside an UNREADABLE larger one ──');
const mixed = [
  { studyName: 'LT-12', studyType: 'long-term', storageCondition: '25C/60%RH', duration: '12', timePoints: '0,3,6,12', shelfLifeClaim: '12 months' },
  { studyName: 'LT-12b', studyType: 'long-term', storageCondition: '25C/60%RH', duration: '12', timePoints: '0,3,6,12', shelfLifeClaim: 'thirty-six months' },
];
show('statedClaim', statedClaim(mixed));
show('verdict', checkQ1E(of(mixed, NDA) as any).map((f: any) => [f.ruleId, f.status]));

console.info('\n── a nonsense 1000-month claim ──');
const silly = [
  { studyName: 'LT-24', studyType: 'long-term', storageCondition: '25C/60%RH', duration: '24', timePoints: '0,3,6,12,24', shelfLifeClaim: '1000 months' },
  { studyName: 'ACC', studyType: 'accelerated', storageCondition: '40C/75%RH', duration: '6', timePoints: '0,3,6', shelfLifeClaim: '' },
];
show('statedClaim', statedClaim(silly));
show('verdict', checkQ1E(of(silly, NDA) as any).map((f: any) => [f.ruleId, f.status]));
