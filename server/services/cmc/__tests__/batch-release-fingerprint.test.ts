/**
 * The release fingerprint is computed, not crashed on.
 *
 * ## The defect, measured against the running server
 *
 * `POST /api/cmc/batch-records/:id/release` answered **500** on every batch
 * whose results were reviewed — the only path that reaches a signature:
 *
 *     ReferenceError: require is not defined
 *       at sha256Hex (shared/canonical-json.ts:90)
 *       at stableHash (shared/canonical-json.ts:99)
 *       at evidenceFingerprint (server/services/cmc/batch-release-evidence.ts:174)
 *       at evaluateBatchForRelease (server/api/cmc/batchRecordRoutes.ts:426)
 *
 * `shared/canonical-json.ts` reaches `node:crypto` through a **dynamic
 * `require`**, deliberately, so that a module five client files import does not
 * pull crypto into the browser bundle. `require` does not exist in this
 * server's ESM runtime, so the function cannot run there at all. It is not a
 * bundling edge case: it failed in `npm run dev`.
 *
 * It was already known. `server/services/ana/skills/library/index.ts` hashes
 * with `node:crypto` by hand and says why: *"rather than
 * shared/canonical-json's sha256Hex, which reaches crypto through `require`
 * and so cannot run in the ESM production bundle."* That lane stepped around
 * it; this one called it, and batch release — a governed §11.50 act — has
 * therefore never completed.
 *
 * Nobody saw it because the Batch records tab was posting to
 * `/api/cmc/batch-records/NaN/release` and getting a different 500
 * (`docs/evidence/F1/2026-11-09-batch-row-identity/`). Two defects, one
 * screen, each hiding the other.
 *
 * ## What these cases hold
 *
 * The fingerprint is a value. Anything that reads a recorded result can
 * compute it, in this runtime, without a bundler.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { evidenceFingerprint, type RecordedReleaseTest } from '../batch-release-evidence';

/** A recorded release test, in the shape the evaluator actually builds. */
const test = (over: Partial<RecordedReleaseTest> = {}): RecordedReleaseTest => ({
  qcId: 14,
  sampleId: 'DS-2502-R1',
  testMethod: 'HPLC-UV assay (AM-114)',
  result: '99.4 %',
  criterion: '98.0 - 102.0 %',
  passFail: 'pass',
  reviewed: true,
  passed: true,
  sampleType: 'in-process',
  analystId: 2,
  reviewerId: 1,
  testDate: '2026-10-01T00:00:00.000Z',
  releaseDate: null,
  certificateOfAnalysis: null,
  recordRevision: null,
  ...over,
});

describe('evidenceFingerprint', () => {
  it('returns a sha-256 hex string rather than throwing', () => {
    /* The case the running server failed: `require is not defined`, from
       inside a hash, on the one path that reaches a signature. */
    const fp = evidenceFingerprint([test()]);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same recorded results, whatever order the keys arrive in', () => {
    /* The canonical stringify is what makes the comparison across
       reauthentication meaningful: the same facts must hash the same however
       the row was assembled. */
    const a = evidenceFingerprint([test()]);
    const reordered = Object.fromEntries(
      Object.entries(test()).reverse(),
    ) as unknown as RecordedReleaseTest;
    expect(evidenceFingerprint([reordered])).toBe(a);
  });

  it('changes when a result changes — the whole point of taking it', () => {
    /* The fingerprint exists so the signing transaction can refuse when what
       was evaluated is not what is being signed over. */
    expect(evidenceFingerprint([test({ result: '91.8 %' })])).not.toBe(evidenceFingerprint([test()]));
    expect(evidenceFingerprint([test({ reviewed: false })])).not.toBe(evidenceFingerprint([test()]));
    expect(evidenceFingerprint([test({ criterion: '95.0 - 105.0 %' })])).not.toBe(evidenceFingerprint([test()]));
  });

  it('distinguishes a different number of results', () => {
    expect(evidenceFingerprint([test(), test({ sampleId: 'DS-2502-R2' })])).not.toBe(evidenceFingerprint([test()]));
  });

  it('answers for no results at all, rather than refusing to compute', () => {
    expect(evidenceFingerprint([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ── Why the cases above could not have caught this ──────────────────────────
   They pass WITHOUT the fix. Vitest's runtime provides `require`, so the
   dynamic require resolves under test and fails only in the server's own ESM
   runtime. A unit test is the wrong instrument for this defect, which is
   exactly why it shipped and why the evidence for it is a measured 500 from
   `npm run dev` rather than a red test.

   What can be held statically is the rule: no server module takes its hash
   from `shared/canonical-json`, because that function cannot run there. This
   catches the next caller, which the value cases above cannot. */
describe('no server module hashes through shared/canonical-json', () => {
  const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.ts$/.test(e.name)) out.push(full);
    }
    return out;
  }

  it('finds the server tree at all, so an empty sweep cannot pass', () => {
    expect(walk(path.join(ROOT, 'server')).length).toBeGreaterThan(200);
  });

  it('imports neither sha256Hex nor stableHash from it', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'server'))) {
      const src = fs.readFileSync(file, 'utf8');
      /* The import statement only — a mention in a comment explaining WHY not
         to use it is the documentation this rule wants to exist. */
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*canonical-json[^'"]*['"]/g)) {
        const named = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0].trim());
        if (named.some((n) => n === 'sha256Hex' || n === 'stableHash')) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(
      offenders,
      'these cannot run in the ESM runtime: hash stableStringify(value) with node:crypto in the server module',
    ).toEqual([]);
  });
});
