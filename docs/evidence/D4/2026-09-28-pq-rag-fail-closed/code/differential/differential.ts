/**
 * HEAD's computeVerdict vs the changed one, over a combinatorial matrix.
 *
 * Parity claim under test: whenever rag is NOT (required and executable), and
 * no unknown component is required and executable, the changed verdict equals
 * HEAD's exactly — verdict AND reasons — whatever rag record is passed.
 * Outside that scope the differences are the intended ones; they are counted
 * and classified, and any PASS the changed verdict gives where HEAD did not is
 * a failure (the change may only close routes to PASS, never open one).
 *
 * HEAD's module is `git show HEAD:server/eval/pq/pq-verdict.ts`, saved beside
 * this file; it has no imports, so it loads from here unchanged.
 */
import { readFileSync } from 'node:fs';
import * as HEAD from './head/server/eval/pq/pq-verdict';
import * as NOW from '/home/user/ClinicalSageAI-2-replit/server/eval/pq/pq-verdict';

type Any = any; // the matrix deliberately builds malformed records

const REAL = JSON.parse(readFileSync('/home/user/ClinicalSageAI-2-replit/server/eval/pq/pq-protocol.json', 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const gen = (n: number, over: Any = {}) =>
  Array.from({ length: n }, (_, i) => ({
    taskId: `g${i}`, docType: 'ind', servedModel: 'm', servedModelVerified: true, sectionCoverage: 1, forbiddenHits: 0, ...(i === 0 ? over : {}),
  }));
const generations: Array<[string, Any[]]> = [
  ['gen passing', gen(10)],
  ['gen short sample', gen(3)],
  ['gen one unverified', gen(10, { servedModelVerified: false, servedModel: 'other' })],
  ['gen one errored', gen(10, { error: 'x', sectionCoverage: null, forbiddenHits: null })],
  ['gen low coverage', gen(10).map((g) => ({ ...g, sectionCoverage: 0.1 }))],
  ['gen forbidden hit', gen(10, { forbiddenHits: 1 })],
  ['gen nothing scored', gen(2).map((g) => ({ ...g, error: 'x', sectionCoverage: null, forbiddenHits: null }))],
];
const ext = (over: Any = {}) => [{ taskId: 'e0', docType: 'ind', servedModel: 'm', servedModelVerified: true, f1: 1, precision: 1, recall: 1, ...over }];
const extractions: Array<[string, Any[]]> = [
  ['ext passing', ext()],
  ['ext none', []],
  ['ext low F1', ext({ f1: 0.1 })],
  ['ext unverified', ext({ servedModelVerified: false })],
  ['ext errored', ext({ error: 'x', f1: null })],
];
const it = (id: string, over: Any = {}) => ({ itemId: id, negativeControl: false, servedModel: 'm', servedModelVerified: true, hit: 1, faithfulness: 1, ...over });
const rags: Array<[string, Any]> = [
  ['rag absent', undefined],
  ['rag not run', { ran: false, notRunReason: 'no phase', itemsScored: 0, items: [] }],
  ['rag ran empty', { ran: true, itemsScored: 0, items: [] }],
  ['rag perfect x3', { ran: true, itemsScored: 3, items: [it('a'), it('b'), it('c')] }],
  ['rag perfect x1', { ran: true, itemsScored: 1, items: [it('a')] }],
  ['rag failing', { ran: true, itemsScored: 3, items: [it('a', { hit: 0, faithfulness: 0 }), it('b', { hit: 0, faithfulness: 0 }), it('c', { hit: 0, faithfulness: 0 })] }],
  ['rag NaN', { ran: true, itemsScored: 3, items: [it('a'), it('b'), it('c', { hit: Number.NaN })] }],
  ['rag ran "yes"', { ran: 'yes', itemsScored: 3, items: [it('a'), it('b'), it('c')] }],
  ['rag duplicates', { ran: true, itemsScored: 3, items: [it('a'), it('a'), it('a')] }],
  ['rag silent items', { ran: true, itemsScored: 1, items: [it('a'), it('s', { hit: null, faithfulness: null })] }],
];
const ragCriteria: Array<[string, Any]> = [
  ['criteria as shipped', clone(REAL.components.rag.criteria)],
  ['criteria + floor 3', { ...clone(REAL.components.rag.criteria), minScoredItems: 3 }],
  ['criteria {}', {}],
  ['criteria strings', { minHitRate: '0.6', minFaithfulness: '0.7', minScoredItems: 3 }],
];
const extras: Array<[string, Any]> = [
  ['no extra component', null],
  ['extra required+executable', { required: true, executable: true, criteria: {}, criteriaSource: 't' }],
  ['extra required, not executable', { required: true, executable: false, notExecutableReason: 'x', criteria: {}, criteriaSource: 't' }],
  ['extra not required', { required: false, executable: true, criteria: {}, criteriaSource: 't' }],
];
const statuses: Array<[string, Any]> = [
  ['approved', { status: 'approved', approvedBy: 'o', approvedOn: '2026-09-28' }],
  ['draft', { status: 'draft', approvedBy: null, approvedOn: null }],
  ['approved, no approver', { status: 'approved', approvedBy: null, approvedOn: '2026-09-28' }],
];

let total = 0, parityScope = 0, parityDiffs = 0, intendedScope = 0, intendedDiffs = 0, newPassWhereHeadDidNot = 0;
const diffSamples: string[] = [];
const intendedByShape = new Map<string, number>();
for (const [sName, st] of statuses)
  for (const ragReq of [true, false])
    for (const ragExec of [true, false])
      for (const extReq of [true, false])
        for (const extExec of [true, false])
          for (const [cName, crit] of ragCriteria)
            for (const [xName, extra] of extras)
              for (const [gName, g] of generations)
                for (const [eName, e] of extractions)
                  for (const [rName, r] of rags) {
                    const p: Any = clone(REAL);
                    Object.assign(p, st);
                    p.components.rag.required = ragReq;
                    p.components.rag.executable = ragExec;
                    p.components.rag.criteria = clone(crit);
                    p.components.extraction.required = extReq;
                    p.components.extraction.executable = extExec;
                    if (extra) p.components.classification = clone(extra);
                    total++;
                    const h = HEAD.computeVerdict(p, g, e);
                    const n = NOW.computeVerdict(p, g, e, r);
                    const same = JSON.stringify(h) === JSON.stringify(n);
                    const label = `${sName} | rag req=${ragReq} exec=${ragExec} | ext req=${extReq} exec=${extExec} | ${cName} | ${xName} | ${gName} | ${eName} | ${rName}`;
                    const inParity = !(ragReq && ragExec) && !(extra && extra.required && extra.executable);
                    if (n.verdict === 'PASS' && h.verdict !== 'PASS') {
                      newPassWhereHeadDidNot++;
                      if (diffSamples.length < 10) diffSamples.push(`NEW PASS where HEAD ${h.verdict}: ${label}`);
                    }
                    if (inParity) {
                      parityScope++;
                      if (!same) {
                        parityDiffs++;
                        if (diffSamples.length < 10) diffSamples.push(`PARITY DIFF: ${label}\n  HEAD ${JSON.stringify(h)}\n  NOW  ${JSON.stringify(n)}`);
                      }
                    } else {
                      intendedScope++;
                      if (!same) {
                        intendedDiffs++;
                        const shape = `${h.verdict} -> ${n.verdict}`;
                        intendedByShape.set(shape, (intendedByShape.get(shape) ?? 0) + 1);
                      }
                    }
                  }

console.log(`combinations: ${total}`);
console.log(`parity scope (rag not required+executable, no unknown required+executable component): ${parityScope}, differences: ${parityDiffs}`);
console.log(`intended-change scope: ${intendedScope}, differing: ${intendedDiffs}`);
for (const [shape, c] of [...intendedByShape].sort()) console.log(`  HEAD ${shape}: ${c}`);
console.log(`the changed verdict PASSes where HEAD did not: ${newPassWhereHeadDidNot}`);
for (const d of diffSamples) console.log(d);
process.exitCode = parityDiffs || newPassWhereHeadDidNot ? 1 : 0;
