/**
 * A governed sequence transition applies only while the sequence still holds the
 * state it was authorized against.
 *
 * `applyGovernedSequenceTransition` reads `seq.status`, evaluates
 * canTransitionSequence against it, and THEN makes several more round-trips —
 * three queries inside governedSignatureRefusal, deriveGovernedTargetBinding,
 * and the whole assessSequenceDispatchReadiness including an external validator
 * call — before writing:
 *
 *     UPDATE ectd_sequences SET status = $1 ... WHERE id = $2 AND organization_id = $3
 *                                                    -- no AND status = <what was read>
 *
 * Both routes (POST /sequences/:id/freeze and .../transition) are live behind the
 * same auth, so two authors in one org can race them: both read 'validated',
 * both pass, both write, each spending its own signature and each writing a
 * §11.10(e) row — an irreversible transition recorded twice from a state only one
 * of them observed. The generic twin `transitionSequence` had the same shape.
 *
 * These pin the compare-and-set on both writes, and that a lost race is reported
 * as INVALID_STATE rather than as a missing sequence.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'submission-service.ts'), 'utf8');
// Executable source only — the comments deliberately quote the pre-fix SQL.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('governed freeze/dispatch — compare-and-set on the authorized state', () => {
  it('both governed writes predicate on the status that was read', () => {
    const writes = [...CODE.matchAll(/UPDATE ectd_sequences SET status = \$1[^`]*/g)].map(m => m[0]);
    expect(writes.length).toBeGreaterThanOrEqual(2); // the frozen and dispatched branches
    for (const w of writes) {
      expect(w, `governed status write must carry a CAS predicate: ${w}`).toMatch(/AND status = \$4/);
    }
  });

  it('passes the read status as that predicate, not a constant', () => {
    expect(CODE).toMatch(/params: \[toStatus, id, ctx\.organizationId, seq\.status\]/);
  });

  it('reports a lost race as INVALID_STATE, not "not found"', () => {
    expect(CODE).toContain('noRowsRefusal');
    expect(CODE).toMatch(/is no longer in state/);
    // The helper must honour it rather than always saying NOT_FOUND.
    expect(CODE).toMatch(/update\.noRowsRefusal[\s\S]{0,160}INVALID_STATE/);
  });
});

describe('the generic transitionSequence twin carries the same guard', () => {
  it('adds the read status to its where clause', () => {
    expect(CODE).toMatch(/eq\(ectdSequences\.status, seq\.status\)/);
  });

  it('refuses when the compare-and-set matched nothing', () => {
    expect(CODE).toMatch(/if \(!row\)[\s\S]{0,200}INVALID_STATE/);
  });
});

describe('the transmit terminal write explains its own zero-row case', () => {
  it('says the package already went to the gateway', () => {
    expect(CODE).toMatch(/package WAS handed to the gateway/);
  });
});
