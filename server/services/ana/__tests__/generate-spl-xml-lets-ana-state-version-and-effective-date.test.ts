/**
 * AnA's generate_spl_xml declares the SPL version and effective date, so the
 * model can state them instead of the generator standing in for them.
 *
 * Until 2026-10-15 the tool's input_schema offered neither field. The generator
 * (spl-generation-service) accepts both, and when either is missing writes
 * versionNumber 1 / the generation date and names each in `warnings`; with no
 * declared field to state them in, every SPL AnA built carried those stand-ins.
 */
import { describe, expect, it } from 'vitest';

import { GENERATE_SPL_XML } from '../splSafetyTools';

type Prop = { type?: string; minimum?: number; description?: string };

describe('generate_spl_xml input schema', () => {
  it('lets the version and the effective date be stated, without requiring either', () => {
    const props = GENERATE_SPL_XML.input_schema.properties as Record<string, Prop>;
    expect(props.version).toMatchObject({ type: 'integer', minimum: 1 });
    expect(props.effectiveDate).toMatchObject({ type: 'string' });
    expect(props.effectiveDate?.description).toMatch(/YYYY-MM-DD/);
    expect(GENERATE_SPL_XML.input_schema.required).not.toContain('version');
    expect(GENERATE_SPL_XML.input_schema.required).not.toContain('effectiveDate');
  });
});
