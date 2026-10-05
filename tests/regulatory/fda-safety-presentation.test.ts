/**
 * FDA's own safety-review tooling, as the CTD record presents it to AnA (D2,
 * 2026-10-04, docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/
 * b3-safety-presentation-facts.md):
 *   - OND reviewers regenerate the AE analyses of an NDA/BLA with the Standard
 *     Safety Tables and Figures (ST&F: an Integrated Guide plus Targeted
 *     Analysis Guides) and group terms with the OND Custom Medical Queries
 *     (OCMQs, formerly FMQs). The record named neither, so AnA could not tell
 *     a sponsor what the reviewer will see;
 *   - both are reviewer tools and sponsor use is voluntary, so every line must
 *     read as anticipation, never as a submission requirement;
 *   - the OCMQ count and MedDRA version change with each MedDRA release and
 *     are not fixed in the record.
 */
import { describe, it, expect } from 'vitest';
import { CTD_AUTHORING_GUIDANCE, getE3Section, getLifecycleDocumentType } from '../../server/services/ind/ctd/index';

const STF_IG_URL = 'https://www.fda.gov/media/187065/download';
const OCMQ_URL = 'https://www.fda.gov/drugs/development-resources/office-new-drugs-custom-medical-queries-ocmqs';

/** "required" / "must" / "mandatory" within a clause of an OCMQ or ST&F mention, either side. */
const REQUIRED_NEAR = /(OCMQ|ST&F|Standard Safety Tables)[^.;"]{0,80}\b(required|must|mandatory)\b|\b(required|must|mandatory)\b[^.;"]{0,80}(OCMQ|ST&F|Standard Safety Tables)/i;

const iss = () => getLifecycleDocumentType('iss');
const issComponent = (code: string) => iss()?.components.find((c) => c.code === code);

describe('the standalone ISS anticipates FDA ST&F and OCMQ review', () => {
  it('regulatoryBasis names the ST&F and the OCMQs as reviewer practice, voluntary for sponsors', () => {
    const basis = iss()?.regulatoryBasis ?? [];
    expect(basis.some((b) => /Standard Safety Tables and Figures/.test(b))).toBe(true);
    const ocmq = basis.find((b) => /OCMQ/.test(b));
    expect(ocmq, 'an OCMQ basis entry').toBeDefined();
    expect(ocmq).toMatch(/voluntary/i);
  });

  it('ISS-AE groups terms by OCMQ and anticipates the ST&F layout', () => {
    const ae = issComponent('ISS-AE');
    expect(ae).toBeDefined();
    const elements = ae?.keyContentElements ?? [];
    expect(elements.some((e) => /OCMQ/.test(e) && /Narrow/.test(e) && /Broad/.test(e))).toBe(true);
    expect(elements.some((e) => /ST&F/.test(e) && /organ system/.test(e) && /risk difference/.test(e))).toBe(true);
    expect(ae?.authoringGuidance).toMatch(/OCMQ/);
  });

  it('ISS-LAB anticipates the kidney- and muscle-injury Targeted Analysis Guides', () => {
    const elements = issComponent('ISS-LAB')?.keyContentElements ?? [];
    expect(elements.some((e) => /Targeted Analysis Guides/.test(e) && /kidney/i.test(e) && /muscle/i.test(e))).toBe(true);
  });
});

describe('the E3 overlay cites the ST&F IG and OCMQs at 12.2.2 / 12.2.3', () => {
  it('12.2.2 carries the ST&F IG and OCMQ bases as regulator-text and frames the layout as anticipation', () => {
    const s = getE3Section('12.2.2');
    const stf = s?.basis?.find((b) => b.url === STF_IG_URL);
    expect(stf?.confidence).toBe('regulator-text');
    expect(s?.basis?.find((b) => b.url === OCMQ_URL)?.confidence).toBe('regulator-text');
    const presentation = (s?.presentation ?? []).join(' ');
    expect(presentation).toMatch(/OCMQ/);
    expect(presentation).toMatch(/anticipate/i);
    expect(presentation).toMatch(/not required/i);
  });

  it('12.2.3 names the grouped-term pitfall and has a basis', () => {
    const s = getE3Section('12.2.3');
    expect((s?.pitfalls ?? []).some((p) => /OCMQ/.test(p))).toBe(true);
    expect(s?.basis?.some((b) => b.url === STF_IG_URL)).toBe(true);
  });
});

describe('CTD 2.7.4 anticipates grouped-term (OCMQ) review', () => {
  it('expectedData or commonPitfalls mention OCMQ', () => {
    const g = CTD_AUTHORING_GUIDANCE['2.7.4'];
    const text = [...(g.expectedData ?? []), ...(g.commonPitfalls ?? [])].join(' ');
    expect(text).toMatch(/OCMQ/);
  });
});

describe('reviewer tools are never presented as sponsor requirements', () => {
  const surfaces = (): Array<[string, string]> => [
    ['iss', JSON.stringify(iss())],
    ['12.2.2', JSON.stringify(getE3Section('12.2.2'))],
    ['12.2.3', JSON.stringify(getE3Section('12.2.3'))],
    ['2.7.4', JSON.stringify(CTD_AUTHORING_GUIDANCE['2.7.4'])],
  ];

  it('the surfaces mention OCMQ at all (so the guards below are not vacuous)', () => {
    for (const [name, text] of surfaces()) expect(text, name).toMatch(/OCMQ/);
  });

  it('no "required" / "must" within a clause of an OCMQ or ST&F mention', () => {
    // "The CSR is not required to use this layout" is the one allowed form.
    for (const [name, text] of surfaces()) {
      expect(text.replace(/not required/gi, ''), name).not.toMatch(REQUIRED_NEAR);
    }
  });

  it('the OCMQ count and MedDRA version are not fixed in the record', () => {
    for (const [name, text] of surfaces()) {
      expect(text, name).not.toMatch(/\b104 OCMQs?\b|MedDRA v(ersion )?\d+/i);
    }
  });
});
