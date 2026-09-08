/**
 * The enforcement report tells the truth about what it does and does not know.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * The report exists for exactly one decision: whether MODULE_ENFORCEMENT is safe
 * to move from 'report' to 'enforce'. An empty report and a report that has
 * never observed anything look identical — both render as no rows — and they
 * argue for opposite decisions. Collapsing them would hand an operator a green
 * light the buffer never gave, so `observingSince` is the discriminator and it
 * must stay honest across recording, eviction and clearing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearObservations,
  enforcementReport,
  recordObservation,
} from '../enforcement-observations';

const obs = (over: Partial<Parameters<typeof recordObservation>[0]> = {}) => ({
  path: '/api/pv-cockpit',
  organizationId: 1,
  modules: ['pv-cockpit'],
  reasons: ['pv-cockpit: Not included in this plan'],
  enforced: false,
  ...over,
});

beforeEach(() => clearObservations());

describe('enforcement observations', () => {
  it('reports observingSince as null before anything is seen — not an all-clear', () => {
    const r = enforcementReport('report');
    expect(r.observingSince).toBeNull();
    expect(r.observations).toHaveLength(0);
    // The pair together is the claim: no evidence, not "no denials".
    expect(r.perProcess).toBe(true);
  });

  it('sets observingSince on the FIRST record and never moves it forward', () => {
    recordObservation(obs({ now: '2026-08-01T10:00:00.000Z' }));
    recordObservation(obs({ organizationId: 2, now: '2026-08-02T10:00:00.000Z' }));
    expect(enforcementReport('report').observingSince).toBe('2026-08-01T10:00:00.000Z');
  });

  it('counts repeats of one (workspace, path) instead of appending rows', () => {
    // A component polling every few seconds would otherwise bury a whole
    // workspace losing a module under thousands of identical rows.
    for (let i = 0; i < 40; i += 1) recordObservation(obs({ now: `2026-08-01T10:00:${String(i).padStart(2, '0')}.000Z` }));
    const r = enforcementReport('report');
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0].count).toBe(40);
    expect(r.observations[0].firstSeen).toBe('2026-08-01T10:00:00.000Z');
    expect(r.observations[0].lastSeen).toBe('2026-08-01T10:00:39.000Z');
  });

  it('takes the NEWEST reasoning, because a verdict changes under the operator', () => {
    recordObservation(obs({ reasons: ['old'], enforced: false, now: '2026-08-01T10:00:00.000Z' }));
    recordObservation(obs({ reasons: ['new'], enforced: true, now: '2026-08-01T11:00:00.000Z' }));
    const row = enforcementReport('enforce').observations[0];
    expect(row.reasons).toEqual(['new']);
    expect(row.enforced).toBe(true);
  });

  it('separates workspaces that hit the same path', () => {
    recordObservation(obs({ organizationId: 1, now: '2026-08-01T10:00:00.000Z' }));
    recordObservation(obs({ organizationId: 2, now: '2026-08-01T10:00:01.000Z' }));
    const r = enforcementReport('report');
    expect(r.observations).toHaveLength(2);
    expect(r.organizationsAffected).toBe(2);
  });

  it('rolls up the distinct modules implicated', () => {
    recordObservation(obs({ path: '/api/pv-cockpit', modules: ['pv-cockpit'], now: '2026-08-01T10:00:00.000Z' }));
    recordObservation(obs({ path: '/api/projects', modules: ['projects', 'project-home'], now: '2026-08-01T10:00:01.000Z' }));
    expect(enforcementReport('report').modulesAffected).toEqual([
      'project-home',
      'projects',
      'pv-cockpit',
    ]);
  });

  it('orders most-recently-seen first', () => {
    recordObservation(obs({ organizationId: 1, now: '2026-08-01T10:00:00.000Z' }));
    recordObservation(obs({ organizationId: 2, now: '2026-08-01T12:00:00.000Z' }));
    expect(enforcementReport('report').observations.map((o) => o.organizationId)).toEqual([2, 1]);
  });

  it('caps the buffer, says it is truncated, and evicts the least recently seen', () => {
    // 500 distinct paths, oldest first, then one more.
    for (let i = 0; i < 500; i += 1) {
      recordObservation(
        obs({ path: `/api/m${i}`, now: `2026-08-01T10:00:00.${String(i).padStart(3, '0')}Z` }),
      );
    }
    let r = enforcementReport('report');
    expect(r.observations).toHaveLength(500);
    expect(r.truncated).toBe(true);
    expect(r.capacity).toBe(500);

    /* Eviction is LEAST-RECENTLY-SEEN, not first-inserted, and the two are only
       distinguishable when an early entry is touched again. Without this the
       test passes against a plain FIFO — insertion order and lastSeen order are
       the same in a naive fixture, which is exactly how a FIFO ships believing
       it is an LRU. m0 is the oldest INSERT and, after this touch, the newest
       SEEN; m1 is then the least recently seen and is what must go. */
    recordObservation(obs({ path: '/api/m0', now: '2026-08-01T10:59:00.000Z' }));
    recordObservation(obs({ path: '/api/newest', now: '2026-08-01T11:00:00.000Z' }));
    r = enforcementReport('report');
    expect(r.observations).toHaveLength(500);
    const paths = new Set(r.observations.map((o) => o.path));
    expect(paths.has('/api/newest')).toBe(true);
    expect(paths.has('/api/m0')).toBe(true); // touched, so it survives
    expect(paths.has('/api/m1')).toBe(false); // now the least recently seen
    expect(paths.has('/api/m499')).toBe(true);
  });

  it('clearing resets observingSince — a cleared buffer has observed nothing', () => {
    recordObservation(obs({ now: '2026-08-01T10:00:00.000Z' }));
    expect(enforcementReport('report').observingSince).toBe('2026-08-01T10:00:00.000Z');
    clearObservations();
    const r = enforcementReport('report');
    expect(r.observations).toHaveLength(0);
    // Keeping the old start would claim a window of evidence that was discarded.
    expect(r.observingSince).toBeNull();
  });

  it('echoes the mode it was asked about, so the surface never guesses', () => {
    expect(enforcementReport('off').mode).toBe('off');
    expect(enforcementReport('enforce').mode).toBe('enforce');
  });
});
