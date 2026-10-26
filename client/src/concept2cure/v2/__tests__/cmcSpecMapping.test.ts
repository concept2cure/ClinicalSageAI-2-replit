import { describe, it, expect } from 'vitest';
import {
  specRowFromApi,
  specRowsFromApi,
  specCreateBody,
  specUpdateBody,
  asProjectUuid,
  type QualitySpecApiRow,
} from '../surfaces/cmcSpec';

/**
 * The mapping between the persisted `quality_specifications` row and the UI's
 * spec-row display contract is the one place the shape gap is crossed. Its
 * correctness property is a round-trip: a spec entered in the UI, sent to the
 * create body, persisted, and read back must render identically.
 */
describe('cmcSpec mapping', () => {
  const uiValues: Record<string, string> = {
    attr: 'Charge variants',
    material: 'Drug substance',
    method: 'SE-HPLC',
    release: '<= 2.0%',
    shelf: '<= 3.0%',
    ich: 'ICH Q6B',
    st: 'review',
    justification: 'Rationale for the acidic/basic variant limits.',
  };

  /* 2026-10-25: these two cases used integer ids — 42 and '7' — and
     `quality_specifications.id` is a **uuid**. So they asserted a contract the
     column cannot produce, and pinned the defect instead of catching it:
     `specRowFromApi` parsed the id with `Number()`, every real row became NaN,
     and Edit, Approve and History on the Specifications tab were dead in the
     product. A fixture whose shape the column cannot hold is a test that passes
     over the case it exists to cover. See `cmcSpecRowIdentity.test.ts`. */
  it('specRowFromApi maps a persisted row onto the display contract null-safe', () => {
    const row: QualitySpecApiRow = {
      id: 'c0ffee00-0000-4000-8000-000000000042',
      project_id: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
      material_type: 'Drug product',
      material_name: 'Aggregates',
      acceptance_criteria: { release: '<= 1.0%', shelf: '<= 2.5%' },
      test_methods: { method: 'SEC-MALS' },
      regulatory_basis: { ich: 'ICH Q6B' },
      justification: 'x',
      approval_status: 'approved',
    };
    expect(specRowFromApi(row)).toEqual({
      id: 'c0ffee00-0000-4000-8000-000000000042',
      attr: 'Aggregates',
      material: 'Drug product',
      method: 'SEC-MALS',
      release: '<= 1.0%',
      shelf: '<= 2.5%',
      ich: 'ICH Q6B',
      st: 'approved',
      noMethod: false,
    });
  });

  it('tolerates jsonb delivered as a JSON string (legacy rows)', () => {
    const row: QualitySpecApiRow = {
      id: 'c0ffee00-0000-4000-8000-000000000007',
      material_type: 'Drug substance',
      material_name: 'Endotoxin',
      acceptance_criteria: '{"release":"<= 0.5 EU/mg","shelf":"<= 0.5 EU/mg"}',
      test_methods: '{"method":"LAL"}',
      regulatory_basis: '{"ich":"ICH Q6A"}',
      approval_status: null,
    };
    const mapped = specRowFromApi(row);
    expect(mapped.id).toBe('c0ffee00-0000-4000-8000-000000000007');
    expect(mapped.release).toBe('<= 0.5 EU/mg');
    expect(mapped.method).toBe('LAL');
    expect(mapped.ich).toBe('ICH Q6A');
    expect(mapped.st).toBe('draft'); // null approval_status → honest default
  });

  it('flags a missing analytical method (noMethod) rather than inventing one', () => {
    const row: QualitySpecApiRow = {
      id: 'c0ffee00-0000-4000-8000-000000000011',
      material_type: 'Drug substance',
      material_name: 'Appearance',
      acceptance_criteria: {},
      test_methods: {},
      regulatory_basis: {},
      approval_status: 'draft',
    };
    const mapped = specRowFromApi(row);
    expect(mapped.method).toBe('');
    expect(mapped.noMethod).toBe(true);
    expect(mapped.release).toBe('');
  });

  it('round-trips UI values → create body → persisted row → display row', () => {
    const projectId = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
    const body = specCreateBody(uiValues, projectId);
    expect(body.projectId).toBe(projectId);
    expect(body.approvalStatus).toBe('review');

    // Simulate what the backend persists and returns from SELECT *.
    const persisted: QualitySpecApiRow = {
      id: 'c0ffee00-0000-4000-8000-000000000100',
      project_id: projectId,
      material_type: body.materialType,
      material_name: body.materialName,
      acceptance_criteria: body.acceptanceCriteria,
      test_methods: body.testMethods,
      regulatory_basis: body.regulatoryBasis,
      justification: body.justification ?? null,
      approval_status: body.approvalStatus,
    };
    const row = specRowFromApi(persisted);
    expect(row).toMatchObject({
      attr: 'Charge variants',
      material: 'Drug substance',
      method: 'SE-HPLC',
      release: '<= 2.0%',
      shelf: '<= 3.0%',
      ich: 'ICH Q6B',
      st: 'review',
      noMethod: false,
    });
  });

  it('create body never forwards an approved status (approval is governed-only)', () => {
    expect(specCreateBody({ ...uiValues, st: 'approved' }).approvalStatus).toBe('draft');
    expect(specUpdateBody(uiValues)).not.toHaveProperty('approvalStatus');
    expect(specUpdateBody(uiValues)).not.toHaveProperty('projectId');
  });

  it('specRowsFromApi is tolerant of a non-array payload', () => {
    expect(specRowsFromApi(null)).toEqual([]);
    expect(specRowsFromApi(undefined)).toEqual([]);
    expect(specRowsFromApi([{ id: 'c0ffee00-0000-4000-8000-000000000001', material_type: 'Drug substance', material_name: 'x' }])).toHaveLength(1);
  });

  it('asProjectUuid passes UUIDs and rejects numeric/blank ids', () => {
    expect(asProjectUuid('a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab')).toBe(
      'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    );
    expect(asProjectUuid('123')).toBeUndefined();
    expect(asProjectUuid('')).toBeUndefined();
    expect(asProjectUuid(null)).toBeUndefined();
  });
});
