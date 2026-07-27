/**
 * useSoftware helpers — the IEC 62304 lifecycle adapters.
 *
 * The surface reads submission readiness off these rows, so the pure
 * pieces are unit-tested: the snake_case → camelCase item mapping (keeping
 * an absent optional field null, not a guessed value) and the deliverable
 * label lookup (a known kind gets its regulatory label; an unknown kind
 * degrades to a readable fallback rather than a raw token).
 */

import { describe, it, expect } from 'vitest';
import { adaptItem, kindLabel } from '../useSoftware';

describe('adaptItem', () => {
  it('maps the raw columns to the camelCase item shape', () => {
    const it0 = adaptItem({
      id: 5,
      item_kind: 'srs',
      title: 'Pump SRS',
      identifier: 'SRS-001',
      doc_level: 'enhanced',
      safety_class: 'C',
      status: 'approved',
      updated_at: '2026-07-01T00:00:00Z',
    });
    expect(it0).toMatchObject({
      id: 5,
      itemKind: 'srs',
      title: 'Pump SRS',
      identifier: 'SRS-001',
      docLevel: 'enhanced',
      safetyClass: 'C',
      status: 'approved',
    });
  });

  it('keeps absent optional fields null and defaults status to draft', () => {
    const it0 = adaptItem({ id: 6, item_kind: 'sbom', title: 'SBOM' } as never);
    expect(it0.identifier).toBeNull();
    expect(it0.safetyClass).toBeNull();
    expect(it0.docLevel).toBeNull();
    expect(it0.status).toBe('draft');
  });
});

describe('kindLabel', () => {
  it('gives a regulatory label for known deliverable kinds', () => {
    expect(kindLabel('srs')).toBe('Software requirements (SRS)');
    expect(kindLabel('sbom')).toBe('SBOM');
    expect(kindLabel('threat_model')).toBe('Threat model');
  });

  it('degrades an unknown kind to a readable fallback, not a raw token', () => {
    expect(kindLabel('new_kind_here')).toBe('new kind here');
  });
});
