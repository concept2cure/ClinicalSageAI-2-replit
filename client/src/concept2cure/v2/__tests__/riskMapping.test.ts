// @vitest-environment jsdom
/**
 * v2 Risk surface — live risk_items → RiskRow adoption mapping.
 *
 * GET /api/mdx/risk-items returns raw risk_items rows: DB columns, numeric
 * severity/probability on the ISO 14971 1..5 scale. The surface renders
 * labelled RiskRows. This locks the bridge between the two so an org's real
 * risk file actually loads instead of the surface silently staying on its
 * Sample fixture:
 *   • a real risk_items row maps onto the display contract, and the label is
 *     the exact inverse of addHazard's write path (severity N → SEV_LABELS[N-1]);
 *   • residual acceptability comes from the server's `acceptable` boolean, never
 *     inferred — a not-yet-accepted hazard never reads "Acceptable";
 *   • anything that isn't a well-formed, non-empty risk_items list maps to null,
 *     so the surface fails closed to its honest fixture rather than rendering
 *     half-mapped safety data.
 */
import { describe, it, expect } from 'vitest';
import { mapRiskItems } from '../surfaces/Risk';
import { SEV_LABELS, PROB_LABELS } from '../fixtures/risk-data';

// A risk_items row as GET /api/mdx/risk-items (SELECT *) returns it.
const DB_ROW = {
  id: 42,
  organization_id: 7,
  program_id: null,
  ref_code: 'HZ-07',
  hazard: 'Inaccurate glucose reading',
  hazardous_situation: 'Sensor drift reports a low value while the user is hyperglycemic',
  harm: 'Mis-dosing of insulin',
  sequence_of_events: 'drift — false low — bolus — hypoglycemia',
  severity: 4, // Critical
  probability: 3, // Occasional
  detectability: 2,
  initial_risk: 12,
  residual_severity: 4,
  residual_probability: 2, // Remote
  control_strategy: 'design_reduce',
  status: 'verified',
  source: 'fmea',
  acceptable: true,
  assigned_to: null,
};

describe('mapRiskItems — live risk_items adoption', () => {
  it('maps a risk_items row onto the RiskRow display contract', () => {
    const out = mapRiskItems([DB_ROW]);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    const r = out![0];
    expect(r.id).toBe('HZ-07');
    // The display id is the ref_code, but the real numeric id is carried as dbId
    // so the write routes (PATCH /risk-items/:id, POST .../:id/controls, which
    // require a numeric :id) address the row correctly.
    expect(r.dbId).toBe(42);
    expect(r.hazard).toBe(DB_ROW.hazard);
    expect(r.situation).toBe(DB_ROW.hazardous_situation);
    expect(r.harm).toBe(DB_ROW.harm);
    expect(r.seq).toBe(DB_ROW.sequence_of_events);
    expect(r.det).toBe(2);
    expect(r.strategy).toBe('design_reduce');
    expect(r.source).toBe('fmea');
    expect(r.status).toBe('verified');
    expect(r.controls).toEqual([]);
  });

  it('labels severity/probability as the exact inverse of the write path', () => {
    const r = mapRiskItems([DB_ROW])![0];
    // addHazard writes severity = SEV_LABELS.indexOf(sev) + 1, so the read must
    // invert to the same label for a clean round-trip.
    expect(r.sev).toBe(SEV_LABELS[DB_ROW.severity - 1]); // 'Critical'
    expect(r.prob).toBe(PROB_LABELS[DB_ROW.probability - 1]); // 'Occasional'
    expect(r.probR).toBe(PROB_LABELS[DB_ROW.residual_probability - 1]); // 'Remote'
  });

  it('takes acceptability from the server acceptable flag, never inferred', () => {
    expect(mapRiskItems([DB_ROW])![0].res).toBe('Acceptable');
    expect(mapRiskItems([{ ...DB_ROW, acceptable: false }])![0].res).toBe('Investigation');
    expect(mapRiskItems([{ ...DB_ROW, acceptable: null }])![0].res).toBe('Investigation');
  });

  it('falls back to prob when no residual probability is recorded', () => {
    const r = mapRiskItems([{ ...DB_ROW, residual_probability: null }])![0];
    expect(r.probR).toBe(r.prob);
  });

  it('synthesizes a display id when ref_code is absent', () => {
    const r = mapRiskItems([{ ...DB_ROW, ref_code: null, id: 5 }])![0];
    expect(r.id).toBe('HZ-05');
  });

  it('derives the open flag from status', () => {
    expect(mapRiskItems([{ ...DB_ROW, status: 'open' }])![0].open).toBe(true);
    expect(mapRiskItems([{ ...DB_ROW, status: 'mitigating' }])![0].open).toBe(true);
    expect(mapRiskItems([{ ...DB_ROW, status: 'verified' }])![0].open).toBe(false);
  });

  it('fills sensible defaults for optional columns', () => {
    const r = mapRiskItems([
      { hazard: 'H', harm: 'Y', severity: 1, probability: 1 },
    ])![0];
    expect(r.det).toBe(3);
    expect(r.strategy).toBe('design_reduce');
    expect(r.source).toBe('other');
    expect(r.status).toBe('open');
    expect(r.situation).toBe('');
  });

  // ── fail-closed: anything not a clean risk_items list → null → keep fixture ──
  it('rejects an empty list (nothing to adopt)', () => {
    expect(mapRiskItems([])).toBeNull();
  });

  it('rejects the display fixture shape (string sev/prob, no numeric severity)', () => {
    const fixtureRow = { id: 'HZ-01', hazard: 'x', harm: 'y', sev: 'Critical', prob: 'Occasional' };
    expect(mapRiskItems([fixtureRow])).toBeNull();
  });

  it('rejects the whole batch if any row is not a mappable risk_items row', () => {
    expect(mapRiskItems([DB_ROW, { hazard: 'x' /* no harm/severity */ }])).toBeNull();
  });

  it('rejects out-of-scale severity/probability', () => {
    expect(mapRiskItems([{ ...DB_ROW, severity: 0 }])).toBeNull();
    expect(mapRiskItems([{ ...DB_ROW, probability: 6 }])).toBeNull();
    expect(mapRiskItems([{ ...DB_ROW, severity: 2.5 }])).toBeNull();
  });

  it('unwraps the { data } envelope and rejects non-list / nullish payloads', () => {
    expect(mapRiskItems({ data: [DB_ROW] })).toHaveLength(1);
    expect(mapRiskItems(null)).toBeNull();
    expect(mapRiskItems({})).toBeNull();
    expect(mapRiskItems('nope')).toBeNull();
  });
});
