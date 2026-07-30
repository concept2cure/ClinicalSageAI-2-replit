/**
 * useStudyDetail adapters — the nested clinical-study records.
 *
 * These rows drive a BIMO-readiness read-out (open deviations, serious
 * AEs, endpoints met), so the adapters are unit-tested directly. The
 * properties that matter: date-derived flags are true only when the date
 * is present (an absent activation/resolution/report date is "no", never a
 * guessed yes), booleans coerce strictly, and `met` stays a genuine
 * tri-state (met / not met / not yet analysed).
 */

import { describe, it, expect } from 'vitest';
import { adaptSite, adaptDeviation, adaptAe, adaptEndpoint } from '../useStudyDetail';

describe('adaptSite', () => {
  it('marks a site activated only when it has an activation date', () => {
    expect(adaptSite({ id: 1, site_number: 'S1', site_name: 'Mercy', activated_at: '2026-02-01' }).activated).toBe(true);
    expect(adaptSite({ id: 1, site_number: 'S1', site_name: 'Mercy', activated_at: null }).activated).toBe(false);
    expect(adaptSite({ id: 1, site_number: 'S1', site_name: 'Mercy' }).activated).toBe(false);
  });

  it('defaults a missing enrolled count to zero and maps the PI', () => {
    const s = adaptSite({ id: 2, site_number: 'S2', site_name: 'St Luke', principal_investigator: 'Dr Ada' });
    expect(s.enrolledCount).toBe(0);
    expect(s.principalInvestigator).toBe('Dr Ada');
  });
});

describe('adaptDeviation', () => {
  it('derives resolved from the resolution date, not a flag', () => {
    expect(adaptDeviation({ id: 1, category: 'major', description: 'x', resolved_at: '2026-03-01' }).resolved).toBe(true);
    expect(adaptDeviation({ id: 1, category: 'major', description: 'x', resolved_at: null }).resolved).toBe(false);
  });

  it('coerces capa_required strictly and defaults category', () => {
    expect(adaptDeviation({ id: 1, description: 'x', capa_required: true }).capaRequired).toBe(true);
    expect(adaptDeviation({ id: 1, description: 'x', capa_required: null }).capaRequired).toBe(false);
    expect(adaptDeviation({ id: 1, description: 'x' }).category).toBe('other');
  });
});

describe('adaptAe', () => {
  it('coerces safety flags strictly — only true is true', () => {
    const a = adaptAe({ id: 1, ae_id: 'AE1', serious: true, unanticipated: null, ae_date: '2026-04-01' });
    expect(a.serious).toBe(true);
    expect(a.unanticipated).toBe(false);
  });

  it('marks FDA-reported only when a report date is present', () => {
    expect(adaptAe({ id: 1, ae_id: 'AE1', reported_to_fda_at: '2026-04-10' }).reportedToFda).toBe(true);
    expect(adaptAe({ id: 1, ae_id: 'AE1', reported_to_fda_at: null }).reportedToFda).toBe(false);
  });

  it('prefers the MedDRA term but keeps the ae_id available', () => {
    const a = adaptAe({ id: 1, ae_id: 'AE1', preferred_term: 'Headache' });
    expect(a.preferredTerm).toBe('Headache');
    expect(a.aeId).toBe('AE1');
  });
});

describe('adaptEndpoint', () => {
  it('keeps met as a tri-state (true / false / null)', () => {
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x', met: true }).met).toBe(true);
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x', met: false }).met).toBe(false);
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x', met: null }).met).toBeNull();
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x' }).met).toBeNull();
  });

  it('stringifies a numeric p-value and leaves an absent one null', () => {
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x', p_value: 0.032 }).pValue).toBe('0.032');
    expect(adaptEndpoint({ id: 1, endpoint_kind: 'primary', name: 'x', p_value: null }).pValue).toBeNull();
  });
});
