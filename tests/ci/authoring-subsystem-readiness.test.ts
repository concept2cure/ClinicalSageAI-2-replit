/**
 * Authoring subsystem readiness rule (P0 / C2C-DEPLOY-002).
 *
 * The deploy audit found /readyz reporting green while the regulated authoring
 * loop was completely unprovisioned, because readiness judged only two flat
 * "critical" tables. `evaluateSubsystem` is the rule that closes it: a regulated
 * subsystem is judged AS A UNIT, and a partial or absent one fails readiness so
 * the ECS health check refuses to register a container that cannot run authoring.
 *
 * These cases pin the exact decision — especially that a PARTIAL subsystem can
 * never be rescued by the opt-out, since a freeze/e-sign surface with no audit
 * or signature storage is worse than one plainly absent.
 */

import { describe, it, expect } from 'vitest';
import { evaluateSubsystem } from '../../server/db/ensureCoreTables';

const EXPECTED = ['authoring_documents', 'authoring_audit_trail', 'authoring_signatures'];

const setOf = (...tables: string[]) => new Set(tables);

describe('evaluateSubsystem — regulated subsystem readiness', () => {
  it('present: all tables exist → never fails readiness', () => {
    const s = evaluateSubsystem('authoring', EXPECTED, setOf(...EXPECTED));
    expect(s.state).toBe('present');
    expect(s.missing).toEqual([]);
    expect(s.readinessFailing).toBe(false);
  });

  it('absent: no tables exist → fails readiness by default', () => {
    const s = evaluateSubsystem('authoring', EXPECTED, setOf('organizations', 'users'));
    expect(s.state).toBe('absent');
    expect(s.missing).toEqual(EXPECTED);
    expect(s.readinessFailing).toBe(true);
  });

  it('absent + optional: opt-out downgrades a wholly-absent subsystem to non-failing', () => {
    const s = evaluateSubsystem('authoring', EXPECTED, setOf('users'), { optional: true });
    expect(s.state).toBe('absent');
    expect(s.readinessFailing).toBe(false);
  });

  it('partial: some tables missing → ALWAYS fails readiness', () => {
    // Loop table present, but audit + signature storage absent — the exact
    // half-provisioned Part 11 posture the unit rule exists to catch.
    const s = evaluateSubsystem('authoring', EXPECTED, setOf('authoring_documents'));
    expect(s.state).toBe('partial');
    expect(s.present).toEqual(['authoring_documents']);
    expect(s.missing).toEqual(['authoring_audit_trail', 'authoring_signatures']);
    expect(s.readinessFailing).toBe(true);
  });

  it('partial + optional: the opt-out CANNOT rescue a partial subsystem', () => {
    const s = evaluateSubsystem('authoring', EXPECTED, setOf('authoring_documents'), {
      optional: true,
    });
    expect(s.state).toBe('partial');
    expect(s.readinessFailing).toBe(true);
  });
});
