/**
 * A form's field coverage is a measurement, or null when there is nothing to measure.
 *
 * The labeled draft and the drawn reconstruction set `fieldCoverage` to
 * `entries.length === 0 ? 1 : 1` — 100% whether or not the form had a single
 * built field — and the official fills divided by `entries.length || 1`, so an
 * empty form read 0%. The route sends it as X-Form-Field-Coverage and the
 * forms panel prints "coverage 1.000" beside the render.
 */
import { describe, expect, it } from 'vitest';

import { renderBuiltForm } from '../ind-form-fill-service';
import { reconstructForm } from '../ind-form-reconstruct';
import type { BuiltForm } from '../ind-form-data-builders';

const empty = (formId: string): BuiltForm =>
  ({ formId, fields: {}, missingRequired: [], requiredFields: [] }) as unknown as BuiltForm;

describe('fieldCoverage', () => {
  it('is null for a reconstruction with no built fields, not 100%', async () => {
    const r = await reconstructForm('FDA_1571', empty('FDA_1571'));
    expect(r.fieldCoverage).toBeNull();
  }, 60_000);

  it('is null for a labeled draft with no built fields, not 100%', async () => {
    const r = await renderBuiltForm('FDA_NO_TEMPLATE', empty('FDA_NO_TEMPLATE'));
    expect(r.usedOfficialTemplate).toBe(false);
    expect(r.fieldCoverage).toBeNull();
  }, 60_000);

  it('is the share of built fields drawn when there are some', async () => {
    const r = await renderBuiltForm('FDA_NO_TEMPLATE', {
      ...empty('FDA_NO_TEMPLATE'),
      fields: { sponsor_name: 'Acme Bio', ind_number: '' },
    } as BuiltForm);
    expect(r.fieldCoverage).toBe(1);
  }, 60_000);
});
