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
 * "HEAD" is pq-verdict.ts as it was before this change, commit 575cd8323. It
 * has no imports, so the harness writes it from git into a temporary folder at
 * run time and loads it from there. Nothing but this script is committed.
 * Run from the repository root: npx tsx <this file>.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as NOW from '../../../../../../server/eval/pq/pq-verdict';

const BEFORE_CHANGE = '575cd8323';
const headFile = path.join(mkdtempSync(path.join(tmpdir(), 'pq-verdict-head-')), 'pq-verdict.ts');
writeFileSync(headFile, execFileSync('git', ['show', `${BEFORE_CHANGE}:server/eval/pq/pq-verdict.ts`]));
const HEAD: typeof NOW = await import(pathToFileURL(headFile).href);

type Any = any; // the matrix deliberately builds malformed records

const REAL = JSON.parse(readFileSync('server/eval/pq/pq-protocol.json', 'utf8'));
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
/** Every combination of the lists, in order (the matrix, without nested loops). */
function product(lists: Any[][]): Any[][] {
  return lists.reduce<Any[][]>((acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])), [[]]);
}
const TF = [true, false];

function compare(combo: Any[]): void {
  const [[sName, st], ragReq, ragExec, extReq, extExec, [cName, crit], [xName, extra], [gName, g], [eName, e], [rName, r]] = combo;
  const p: Any = clone(REAL);
  // nosemgrep: insecure-object-assign -- an offline differential over fixed state combinations; no request data reaches it
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
    if (same) return;
    parityDiffs++;
    if (diffSamples.length < 10) diffSamples.push(`PARITY DIFF: ${label}\n  HEAD ${JSON.stringify(h)}\n  NOW  ${JSON.stringify(n)}`);
    return;
  }
  intendedScope++;
  if (same) return;
  intendedDiffs++;
  const shape = `${h.verdict} -> ${n.verdict}`;
  intendedByShape.set(shape, (intendedByShape.get(shape) ?? 0) + 1);
}

for (const combo of product([statuses, TF, TF, TF, TF, ragCriteria, extras, generations, extractions, rags])) compare(combo);

console.info(`combinations: ${total}`);
console.info(`parity scope (rag not required+executable, no unknown required+executable component): ${parityScope}, differences: ${parityDiffs}`);
console.info(`intended-change scope: ${intendedScope}, differing: ${intendedDiffs}`);
for (const [shape, c] of [...intendedByShape].sort()) console.info(`  HEAD ${shape}: ${c}`);
console.info(`the changed verdict PASSes where HEAD did not: ${newPassWhereHeadDidNot}`);
for (const d of diffSamples) console.info(d);
process.exitCode = parityDiffs || newPassWhereHeadDidNot ? 1 : 0;
