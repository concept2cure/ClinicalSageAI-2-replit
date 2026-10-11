// @vitest-environment jsdom
/**
 * The change log's row overdue flag is the server's verdict, not the browser's.
 *
 * QA walk 2026-10-08 (J8): `isImplementationOverdue(c, today = '2026-07-24')`
 * compared every target date with a hard-coded day and only for approved or
 * in-implementation rows, so on 2026-10-08 a proposed change past its target
 * (CC-2026-001) and an approved one (CC-2026-006, target 2026-10-01) carried no
 * flag. The register read now returns `implementation_overdue`, computed by the
 * database against CURRENT_DATE with the same predicate as the Overdue tile
 * (changeControl.service IMPLEMENTATION_OVERDUE_SQL); the row reads that.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const H = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: () => ({ data: H.data, loading: false, error: null, refresh: () => {} }),
}));

import { isImplementationOverdue, FIXTURE_CHANGES } from '../changeData';
import { useChangeRegister } from '../changeHooks';

const base = FIXTURE_CHANGES[0];

describe('isImplementationOverdue', () => {
  it('flags a proposed change the server says is past its target', () => {
    expect(isImplementationOverdue({ ...base, status: 'proposed', targetImplementationDate: '2026-08-30', implementationOverdue: true })).toBe(true);
  });

  it('does not flag a change the server says is on schedule, whatever a fixed date would say', () => {
    expect(isImplementationOverdue({ ...base, status: 'in_implementation', targetImplementationDate: '2020-01-01', implementationOverdue: false })).toBe(false);
  });

  it('claims nothing for a row that carries no verdict', () => {
    expect(isImplementationOverdue({ ...base, status: 'approved', targetImplementationDate: '2020-01-01', implementationOverdue: undefined })).toBe(false);
  });
});

describe('useChangeRegister', () => {
  it('carries the server verdict and the linked records onto each row', () => {
    H.data = {
      data: [{
        id: 1, change_number: 'CC-2026-014', title: 'Sterile filter supplier change', description: null,
        change_type: 'supplier', classification: 'critical', risk_level: 'high', status: 'under_assessment',
        reason: null, target_implementation_date: '2026-09-15', created_at: null, updated_at: null,
        implementation_overdue: true,
        links: [{ id: 11, change_id: 1, link_type: 'deviation', linked_ref: 'DEV-2026-041', linked_label: null, relationship: 'triggered_by', note: null }],
      }],
    };
    const { result } = renderHook(() => useChangeRegister());
    const row = result.current.changes![0];
    expect(row.implementationOverdue).toBe(true);
    expect(row.links?.map((l) => l.linkedRef)).toEqual(['DEV-2026-041']);
  });
});
