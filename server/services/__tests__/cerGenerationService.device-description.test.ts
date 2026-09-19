/**
 * A Clinical Evaluation Report must not assert a device has no contraindications.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The device-description template read eight fields off the `device_profiles`
 * row. That table has ELEVEN columns — verified against the live catalog: id,
 * organization_id, name, device_name, device_type, manufacturer, classification,
 * product_code, metadata, created_at, updated_at. None of the eight exists, no
 * request field supplies them, and `db.select().from(deviceProfiles)` emits only
 * the declared columns. So all eight were `undefined` on every code path.
 *
 * Seven passed `undefined` through. The eighth read:
 *
 *     contraindications: data.contraindications || 'None identified',
 *
 * so EVERY generated CER asserted the device has no contraindications — an
 * affirmative clinical safety claim, in an MDR Annex XIV report, that nothing in
 * the system had assessed. The `||` could not have done anything else.
 */
import { describe, it, expect } from 'vitest';

import cerGenerationService, { DEVICE_FIELD_NOT_RECORDED } from '../cerGenerationService';

/** Reach the registered template without going through the database. */
function deviceDescription(data: Record<string, unknown>) {
  const engine = (
    cerGenerationService as unknown as { templateEngine: Map<string, (d: unknown) => unknown> }
  ).templateEngine;
  const tpl = engine.get('device_description')!;
  return tpl(data) as { content: Record<string, unknown> };
}

describe('device description reports only what the device profile holds', () => {
  it('never claims "None identified" for contraindications', () => {
    const out = deviceDescription({ deviceName: 'Acme Assay' });

    expect(out.content.contraindications).not.toBe('None identified');
    expect(out.content.contraindications).toBe(DEVICE_FIELD_NOT_RECORDED);
    expect(JSON.stringify(out)).not.toContain('None identified');
  });

  it('marks every unsourced field as not recorded rather than emitting undefined', () => {
    const out = deviceDescription({ deviceName: 'Acme Assay' });

    for (const field of [
      'generalDescription',
      'intendedUse',
      'indications',
      'contraindications',
      'targetPopulation',
      'principlesOfOperation',
      'materials',
      'specifications',
    ]) {
      expect(out.content[field]).toBe(DEVICE_FIELD_NOT_RECORDED);
    }
  });

  it('passes a real value through untouched', () => {
    // The fix removes the false claim, not the capability: if a source for these
    // fields is ever added, the template must report it.
    const out = deviceDescription({
      deviceName: 'Acme Assay',
      contraindications: 'Not for use in patients under 18.',
      intendedUse: 'In vitro diagnostic use.',
    });

    expect(out.content.contraindications).toBe('Not for use in patients under 18.');
    expect(out.content.intendedUse).toBe('In vitro diagnostic use.');
  });

  it('does not overwrite a genuine empty string', () => {
    // `??` not `||`: an empty string from a future column is a recorded value of
    // "nothing", and the sentinel must not claim it was never recorded.
    const out = deviceDescription({ deviceName: 'Acme Assay', contraindications: '' });
    expect(out.content.contraindications).toBe('');
  });
});
