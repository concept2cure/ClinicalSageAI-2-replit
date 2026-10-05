/**
 * The PQ verdict's rag component (D4 evidence
 * docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, finding E6;
 * docs/evidence/D4/2026-09-28-pq-rag-fail-closed/code/).
 *
 * THE DEFECT THIS PREVENTS. rag reached the verdict only through
 * `unexecutableComponents`: while `components.rag.executable` is false it is
 * named as a reason the PQ is INCOMPLETE. `computeVerdict` took no rag results
 * and had no rag step, so the moment somebody set `executable: true` — the step
 * the protocol's own `notExecutableReason` implied was all that remained — rag
 * dropped out of the verdict entirely, and an approved protocol PASSed with the
 * rag component never run. That is fail-open on a qualification record.
 *
 * The same defect has smaller shapes, each pinned below: one scored item out
 * of a 30-50 item gold set; a gold item nobody keyed, dropped as if it were a
 * negative control; a NaN mean that never compares below a minimum; a criterion
 * the protocol misspelled or left out. Each of those let rag PASS on less than
 * the protocol asks for.
 *
 * Every case runs against the REAL protocol, read as data and copied (never
 * edited): the hit-rate and faithfulness minimums come from pq-protocol.json, so
 * a change to them moves these cases with it. The copy is approved and has rag
 * flipped to executable, which is the configuration the defect lives in. The
 * real protocol declares no rag sample floor yet (criteria.minScoredItems), so
 * each copy sets one explicitly; a copy without one is its own case.
 */
import { describe, expect, it } from 'vitest';
import protocolJson from '../pq-protocol.json';
import {
  computeVerdict,
  type PqExtractionResult,
  type PqGenerationResult,
  type PqProtocol,
  type PqRagRecord,
  type PqRagResult,
} from '../pq-verdict';

const REAL = protocolJson as unknown as PqProtocol;

/** A deep copy: the real protocol object is shared by every case and never mutated. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The sample floor each copy sets unless a case says otherwise. Small, so each case targets one branch. */
const FLOOR = 2;

/**
 * The real protocol, approved, with rag in whatever state the case needs.
 * `floor: null` leaves the rag sample floor out, as the real protocol does today.
 */
function protocolCopy(rag: { executable?: boolean; required?: boolean; floor?: number | null } = {}): PqProtocol {
  const p = clone(REAL);
  p.status = 'approved';
  p.approvedBy = 'System owner (test copy)';
  p.approvedOn = '2026-09-28';
  if (!p.components.rag) throw new Error('pq-protocol.json declares no rag component; these cases measure it');
  if (rag.executable !== undefined) p.components.rag.executable = rag.executable;
  if (rag.required !== undefined) p.components.rag.required = rag.required;
  const floor = rag.floor === undefined ? FLOOR : rag.floor;
  if (floor === null) delete p.components.rag.criteria.minScoredItems;
  else p.components.rag.criteria.minScoredItems = floor;
  return p;
}

/** Generation results that meet every generation criterion of the real protocol. */
function passingGeneration(p: PqProtocol): PqGenerationResult[] {
  const floor = p.components.generation?.criteria.minTasksPerDocType ?? 1;
  return Array.from({ length: floor }, (_, i) => ({
    taskId: `gen-${i}`,
    docType: 'ind',
    servedModel: 'claude-opus-5-5',
    servedModelVerified: true,
    sectionCoverage: 1,
    forbiddenHits: 0,
  }));
}

const passingExtraction: PqExtractionResult[] = [
  { taskId: 'ext-0', docType: 'ind', servedModel: 'claude-opus-5-5', servedModelVerified: true, f1: 1, precision: 1, recall: 1 },
];

/** A positive gold item the pinned model answered perfectly. */
function item(id: string, over: Partial<PqRagResult> = {}): PqRagResult {
  return {
    itemId: id,
    negativeControl: false,
    servedModel: 'claude-opus-5-5',
    servedModelVerified: true,
    hit: 1,
    faithfulness: 1,
    ...over,
  };
}

/** A declared negative control: it names no expected source by design. */
function control(id: string, over: Partial<PqRagResult> = {}): PqRagResult {
  return item(id, { negativeControl: true, hit: null, faithfulness: null, ...over });
}

/** A rag record whose itemsScored agrees with its items, as a runner would write it. */
function ragRun(items: PqRagResult[]): PqRagRecord {
  const itemsScored = items.filter((i) => !i.error && (i.hit !== null || i.faithfulness !== null)).length;
  return { ran: true, itemsScored, items };
}

const passingRag = () => ragRun([item('q1'), item('q2'), item('q3')]);

const verdictOf = (p: PqProtocol, rag?: PqRagRecord) => computeVerdict(p, passingGeneration(p), passingExtraction, rag);
const why = (r: { reasons: string[] }) => r.reasons.join(' | ');

describe('rag required AND executable — not run', () => {
  it('control — the copy with rag NOT executable is INCOMPLETE only because rag cannot run (today\'s rule)', () => {
    const p = protocolCopy({ executable: false });
    const r = verdictOf(p);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/required component "rag" cannot be executed yet/);
  });

  it('E6 — flipped executable with no rag results in the record → INCOMPLETE naming rag, never PASS', () => {
    const r = verdictOf(protocolCopy({ executable: true }));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag".*not run/);
  });

  it('the runner recorded that rag was not run → INCOMPLETE, and the reason carries the runner\'s words', () => {
    const r = verdictOf(protocolCopy({ executable: true }), {
      ran: false,
      notRunReason: 'run-pq has no rag phase',
      itemsScored: 0,
      items: [],
    });
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag".*not run.*run-pq has no rag phase/);
  });
});

describe('rag required AND executable — ran, but scored nothing it can be judged on', () => {
  it('rag ran and scored zero items → INCOMPLETE naming rag', () => {
    const r = verdictOf(protocolCopy({ executable: true }), ragRun([]));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag".*scored no item/);
  });

  it('every item errored → INCOMPLETE, and the errors are named', () => {
    const rag = ragRun([
      item('q1', { hit: null, faithfulness: null, error: 'no tenant' }),
      item('q2', { hit: null, faithfulness: null, error: 'no tenant' }),
    ]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag".*scored no item/);
    expect(why(r)).toMatch(/q1: no tenant/);
  });

  it('a record whose itemsScored is 0 while 3 items carry a score is inconsistent → INCOMPLETE', () => {
    const r = verdictOf(protocolCopy({ executable: true }), { ...passingRag(), itemsScored: 0 });
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/inconsistent.*itemsScored 0.*3 item/);
  });

  it('a record whose itemsScored overstates its items → INCOMPLETE (an inconsistent record is not evidence)', () => {
    const r = verdictOf(protocolCopy({ executable: true }), { ...passingRag(), itemsScored: 30 });
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/inconsistent.*itemsScored 30.*3 item/);
  });

  it('E4 — positive items that name no resolved expected source → INCOMPLETE naming each item', () => {
    // The gold set as it stands: every expectedSourceIds empty, so no item has a
    // hit to score. An item that is not a declared control and carries no hit is
    // a keying or key-resolution failure, not a control.
    const rag = ragRun([item('q1', { hit: null }), item('q2', { hit: null }), item('q3')]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/q1, q2.*no resolved expected source/);
  });

  it('E4 — hit rate measured on 0 items (only controls were judged) → INCOMPLETE naming hit rate', () => {
    const rag = ragRun([control('n1', { faithfulness: 1 }), control('n2', { faithfulness: 1 })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag hit rate was measured on 0 item/);
  });

  it('E5 — positive items retrieved but never judged for faithfulness, with no error → INCOMPLETE naming each item', () => {
    const rag = ragRun([item('q1', { faithfulness: null }), item('q2', { faithfulness: null }), item('q3')]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/q1, q2.*not judged for faithfulness/);
  });
});

describe('rag required AND executable — the sample floor and item identity', () => {
  it('ONE verified item against a floor of 3 → INCOMPLETE naming the floor, never PASS', () => {
    const r = verdictOf(protocolCopy({ executable: true, floor: 3 }), ragRun([item('q1')]));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag hit rate was measured on 1 item.*floor.* 3/);
    expect(why(r)).toMatch(/rag faithfulness was measured on 1 item.*floor.* 3/);
  });

  it('the floor counts DISTINCT items: the same item three times is an inconsistent record → INCOMPLETE', () => {
    const r = verdictOf(protocolCopy({ executable: true, floor: 3 }), ragRun([item('q1'), item('q1'), item('q1')]));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/inconsistent.*q1.*more than once/);
  });

  it('the floor applies to each criterion: enough judged items, too few keyed ones → INCOMPLETE naming hit rate', () => {
    // 2 positives + 2 judged controls: faithfulness on 4 items, hit rate on 2.
    const rag = ragRun([item('q1'), item('q2'), control('n1', { faithfulness: 1 }), control('n2', { faithfulness: 1 })]);
    const r = verdictOf(protocolCopy({ executable: true, floor: 3 }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag hit rate was measured on 2 item/);
    expect(why(r)).not.toMatch(/rag faithfulness was measured/);
  });

  it('the protocol sets no rag sample floor while rag is executable → INCOMPLETE, whatever the run scored', () => {
    const rag = ragRun(Array.from({ length: 50 }, (_, i) => item(`q${i}`)));
    const r = verdictOf(protocolCopy({ executable: true, floor: null }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/no rag sample floor.*minScoredItems/);
  });

  it.each([[0], [-1], [2.5], [Number.NaN], ['30' as unknown as number]])(
    'a floor of %s is not a positive whole number → INCOMPLETE',
    (floor) => {
      const r = verdictOf(protocolCopy({ executable: true, floor }), passingRag());
      expect(r.verdict).toBe('INCOMPLETE');
      expect(why(r)).toMatch(/minScoredItems.*not a positive whole number/);
    },
  );

  it('control — a run that reaches the floor on every criterion PASSes', () => {
    const r = verdictOf(protocolCopy({ executable: true, floor: 3 }), passingRag());
    expect(r.verdict).toBe('PASS');
  });
});

describe('rag required AND executable — negative controls are declared, not inferred', () => {
  it('a declared control with nothing to judge does not count as scored, and does not block', () => {
    const rag = ragRun([item('q1'), item('q2'), control('neg')]);
    expect(rag.itemsScored).toBe(2);
    expect(verdictOf(protocolCopy({ executable: true }), rag).verdict).toBe('PASS');
  });

  it('an UNDECLARED item with no hit and no faithfulness is not a control → INCOMPLETE naming it, never PASS', () => {
    // 1 scored item + 49 silent ones used to PASS: the silent ones were read as
    // negative controls, which the record never said they were.
    const silent = Array.from({ length: 49 }, (_, i) => item(`s${i}`, { hit: null, faithfulness: null }));
    const r = verdictOf(protocolCopy({ executable: true, floor: 1 }), ragRun([item('q1'), ...silent]));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/s0, s1, .*no resolved expected source/);
  });

  it('a declared control that carries a hit is an inconsistent record → INCOMPLETE', () => {
    const rag = ragRun([item('q1'), item('q2'), control('neg', { hit: 1 })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/inconsistent.*neg.*negative control.*hit/);
  });

  it('an item that does not say whether it is a control → INCOMPLETE naming it', () => {
    const bare = item('q3') as Partial<PqRagResult>;
    delete bare.negativeControl;
    const r = verdictOf(protocolCopy({ executable: true }), ragRun([item('q1'), item('q2'), bare as PqRagResult]));
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/q3.*negativeControl/);
  });

  it('a judged control counts toward faithfulness, as run-eval scores it', () => {
    // run-eval judges every item that retrieved something and is not a grounded
    // refusal, negatives included (server/eval/rag/run-eval.ts faithfulness loop).
    const rag = ragRun([item('q1'), item('q2'), control('neg', { faithfulness: 0 })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    // (1 + 1 + 0) / 3 = 0.667, below the protocol's 0.7.
    expect(r.verdict).toBe('FAIL');
    expect(why(r)).toMatch(/rag faithfulness 0\.667 is below/);
  });
});

describe('rag required AND executable — a score that is not a number between 0 and 1 is not a score', () => {
  it.each([
    ['hit NaN', { hit: Number.NaN }],
    ['faithfulness NaN', { faithfulness: Number.NaN }],
    ['hit above 1', { hit: 5 }],
    ['faithfulness above 1', { faithfulness: 1.5 }],
    ['hit negative', { hit: -1 }],
    ['faithfulness negative', { faithfulness: -0.2 }],
    ['hit Infinity', { hit: Number.POSITIVE_INFINITY }],
    ['faithfulness a string', { faithfulness: '0.9' as unknown as number }],
  ])('%s → INCOMPLETE naming the item, never PASS', (_name, over) => {
    const rag = ragRun([item('q1'), item('q2'), item('bad', over as Partial<PqRagResult>)]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/bad.*not a number between 0 and 1/);
  });

  it('an out-of-range hit cannot lift a failing mean: {hit:5} beside two misses is not a pass', () => {
    const rag = ragRun([item('a', { hit: 0 }), item('b', { hit: 0 }), item('c', { hit: 5 })]);
    expect(verdictOf(protocolCopy({ executable: true }), rag).verdict).not.toBe('PASS');
  });

  it('ran: "false" (a string) is a malformed record, not a run → INCOMPLETE', () => {
    const r = verdictOf(protocolCopy({ executable: true }), { ...passingRag(), ran: 'false' as unknown as boolean });
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag" record.*ran.*not true or false/);
  });

  it('servedModelVerified: "false" (a string) is not verification → INCOMPLETE naming the item', () => {
    const rag = ragRun([item('q1'), item('q2'), item('q3', { servedModelVerified: 'false' as unknown as boolean })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/q3.*servedModelVerified/);
  });

  it('items that are not an array → INCOMPLETE', () => {
    const r = verdictOf(protocolCopy({ executable: true }), { ran: true, itemsScored: 1, items: { q1: item('q1') } as unknown as PqRagResult[] });
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"rag" record.*items.*not a list/);
  });
});

describe('rag required AND executable — the protocol\'s rag criteria must be ones this verdict measures', () => {
  function withCriteria(criteria: Record<string, unknown>): PqProtocol {
    const p = protocolCopy({ executable: true });
    p.components.rag.criteria = criteria as Record<string, number>;
    return p;
  }

  it('no criteria at all → INCOMPLETE, never PASS on any scored item', () => {
    const r = verdictOf(withCriteria({}), passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/minHitRate.*not a number between 0 and 1/);
    expect(why(r)).toMatch(/minFaithfulness.*not a number between 0 and 1/);
  });

  it('minimums given as strings → INCOMPLETE naming them (a run that scored zero on both used to PASS)', () => {
    const rag = ragRun([item('q1', { hit: 0, faithfulness: 0 }), item('q2', { hit: 0, faithfulness: 0 })]);
    const r = verdictOf(withCriteria({ minHitRate: '0.6', minFaithfulness: '0.7', minScoredItems: FLOOR }), rag);
    expect(r.verdict).not.toBe('PASS');
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/minHitRate.*not a number between 0 and 1/);
    expect(why(r)).toMatch(/minFaithfulness.*not a number between 0 and 1/);
  });

  it('minFaithfulness missing → INCOMPLETE naming it', () => {
    const r = verdictOf(withCriteria({ minHitRate: 0.6, minScoredItems: FLOOR }), passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/minFaithfulness.*not a number between 0 and 1/);
  });

  it('a criterion above 1 → INCOMPLETE naming it', () => {
    const r = verdictOf(withCriteria({ minHitRate: 60, minFaithfulness: 0.7, minScoredItems: FLOOR }), passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/minHitRate.*not a number between 0 and 1/);
  });

  it('a criterion this verdict does not measure (misspelt floor) → INCOMPLETE naming the key', () => {
    const r = verdictOf(withCriteria({ minHitRate: 0.6, minFaithfulness: 0.7, minScoredItem: 30 }), passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag criterion "minScoredItem" is not one this verdict measures/);
  });
});

describe('rag required AND executable — attribution and criteria', () => {
  it('an item that errored among scored ones → INCOMPLETE, naming it', () => {
    const rag = ragRun([item('q1'), item('q2'), item('q3', { hit: null, faithfulness: null, error: 'timeout' })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/1 rag item\(s\) produced no output: q3/);
  });

  it('an item answered by another model → INCOMPLETE, and its low score does not turn the run into a FAIL', () => {
    const rag = ragRun([
      item('q1'),
      item('q2'),
      item('q3', { servedModel: 'claude-opus-4-8', servedModelVerified: false, hit: 0, faithfulness: 0 }),
    ]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag item\(s\) were answered by a model that is not the pinned version.*q3=claude-opus-4-8/);
    expect(why(r)).not.toMatch(/below/);
  });

  it('an unverified item\'s high score does not lift the pinned model over the criterion', () => {
    // Verified items: hit mean 0.5, below the protocol's minHitRate. Counting the
    // three unverified perfect items would lift it to 0.8 and hide the miss.
    const p = protocolCopy({ executable: true });
    const minHit = p.components.rag.criteria.minHitRate;
    expect(minHit).toBeGreaterThan(0.5);
    const rag = ragRun([
      item('q1', { hit: 1 }),
      item('q2', { hit: 0 }),
      item('u1', { servedModel: null, servedModelVerified: false }),
      item('u2', { servedModel: null, servedModelVerified: false }),
      item('u3', { servedModel: null, servedModelVerified: false }),
    ]);
    const r = verdictOf(p, rag);
    expect(r.verdict).toBe('FAIL');
    expect(why(r)).toMatch(new RegExp(`rag hit rate 0\\.500 is below ${minHit}`));
    expect(why(r)).toMatch(/u1=unreported/);
  });

  it('no item on the pinned model → INCOMPLETE: nothing measured the model under qualification', () => {
    const rag = ragRun([
      item('q1', { servedModel: 'gpt-4o', servedModelVerified: false }),
      item('q2', { servedModel: 'gpt-4o', servedModelVerified: false }),
    ]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/rag hit rate was measured on 0 item/);
    expect(why(r)).toMatch(/rag faithfulness was measured on 0 item/);
  });

  it('faithfulness below the criterion → FAIL', () => {
    const rag = ragRun([item('q1', { faithfulness: 0.2 }), item('q2', { faithfulness: 0.3 })]);
    const r = verdictOf(protocolCopy({ executable: true }), rag);
    expect(r.verdict).toBe('FAIL');
    expect(why(r)).toMatch(/rag faithfulness 0\.250 is below/);
  });

  it('control — rag ran on the pinned model and met both criteria → PASS (the guard is not "rag can never pass")', () => {
    const r = verdictOf(protocolCopy({ executable: true }), passingRag());
    expect(r).toEqual({ verdict: 'PASS', reasons: ['every required component executed and met approved criteria'] });
  });

  it('a draft protocol still cannot PASS on a perfect rag run', () => {
    const p = protocolCopy({ executable: true });
    p.status = 'draft';
    const r = verdictOf(p, passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.reasons[0]).toMatch(/not a PQ/);
  });
});

/**
 * rag not (required and executable) — today's verdict, pinned LITERALLY.
 *
 * The expected verdicts and reasons below are written out, not computed by the
 * module under test, so a change to the rag-absent path itself fails here. The
 * differential against HEAD's computeVerdict over the wider matrix is filed as
 * evidence (docs/evidence/D4/2026-09-28-pq-rag-fail-closed/code/).
 */
describe('rag not (required and executable) — exactly today\'s verdict, whatever the record carries', () => {
  const variants: Array<[string, PqRagRecord | undefined]> = [
    ['no rag results', undefined],
    ['rag not run', { ran: false, notRunReason: 'no rag phase', itemsScored: 0, items: [] }],
    ['rag scored nothing', { ran: true, itemsScored: 0, items: [] }],
    ['rag failing every criterion', ragRun([item('q1', { hit: 0, faithfulness: 0 })])],
    ['rag perfect', passingRag()],
    ['rag malformed (NaN scores, string ran)', { ran: 'yes' as unknown as boolean, itemsScored: 1, items: [item('q1', { hit: Number.NaN })] }],
  ];

  const NOT_EXECUTABLE = `required component "rag" cannot be executed yet: ${REAL.components.rag.notExecutableReason}`;

  it.each(variants)('required, not executable, %s → INCOMPLETE for exactly the one reason it is today', (_name, rag) => {
    // With the floor left out too: criteria are not read while rag cannot run.
    for (const floor of [FLOOR, null]) {
      const p = protocolCopy({ executable: false, floor });
      expect(verdictOf(p, rag)).toEqual({ verdict: 'INCOMPLETE', reasons: [NOT_EXECUTABLE] });
    }
  });

  it.each(variants)('not required (executable), %s → PASS, as today', (_name, rag) => {
    for (const floor of [FLOOR, null]) {
      const p = protocolCopy({ executable: true, required: false, floor });
      expect(verdictOf(p, rag)).toEqual({ verdict: 'PASS', reasons: ['every required component executed and met approved criteria'] });
    }
  });

  it('the real protocol as shipped (draft, rag not executable) is unaffected by rag results', () => {
    const p = clone(REAL);
    for (const [, rag] of variants) {
      expect(verdictOf(p, rag)).toEqual({ verdict: 'INCOMPLETE', reasons: [NOT_EXECUTABLE] });
    }
  });
});

describe('a required, executable component the verdict has no step for', () => {
  it('→ INCOMPLETE naming it: a component nobody measures cannot drop silently out of a PASS', () => {
    // The E6 defect in general form: the verdict measured only what it knew by
    // name, so any executable component it did not know passed by omission.
    const p = protocolCopy({ executable: true });
    p.components.classification = { required: true, executable: true, criteria: { minAccuracy: 0.9 }, criteriaSource: 'test' };
    const r = verdictOf(p, passingRag());
    expect(r.verdict).toBe('INCOMPLETE');
    expect(why(r)).toMatch(/"classification".*no step that measures it/);
  });
});
