/**
 * §3.2.S.2.3 prints a raw or starting material's recorded origin and TSE/BSE
 * certificate.
 *
 * What the code used to do (until 2026-11-12): the material register records
 * Origin, Origin detail and a TSE/BSE certificate for every role, and
 * mapMaterialSpecPayload writes them for a raw material exactly as for an
 * excipient. §3.2.A.3 reads excipient sources only. §3.2.A.2 tells the reviewer
 * "the origin of the raw and starting materials is recorded in §3.2.S.2.3" and
 * prints "Raw Material Origin: Recorded in §3.2.S.2.3". But §3.2.S.2.3's table
 * had no Origin column, so a bovine-derived reagent with no certificate
 * appeared in no composed section and §3.2.A.2's pointer was untrue.
 */
import { describe, expect, it } from 'vitest';

import { mapMaterialSpecPayload } from '../cmc-write-through';
import { composeModule3FromCanonicalSources } from '../module3Composer';

const src = (id: string, sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id, sourceType, sourcePayload, sourceHash: 'h' }) as never;

/** A raw material as the register maps it. */
const rawMaterial = (over: Record<string, unknown> = {}) =>
  src(`rm-${String(over.materialName ?? 'x')}`, 'raw_material_spec', mapMaterialSpecPayload({
    materialRole: 'reagent',
    materialName: 'Reagent R',
    grade: 'ACS',
    supplier: 'Acme Fine Chemicals',
    status: 'specified',
    ...over,
  }));

const s2 = (sources: unknown[]) =>
  composeModule3FromCanonicalSources(sources as never).find((s) => s.sectionKey === '3.2.S.2')!;
const table = (section: ReturnType<typeof s2>) =>
  section.tables.find((t) => t.title === 'Raw and Starting Material Specifications')!;
const cell = (section: ReturnType<typeof s2>, material: string, header: string) => {
  const t = table(section);
  return t.rows.find((r) => r[0] === material)![t.headers.indexOf(header)];
};

describe('§3.2.S.2.3 — the origin of a raw or starting material', () => {
  it('prints a recorded human or animal origin, and says when no certificate is on record', () => {
    const section = s2([rawMaterial({ materialName: 'Sodium tallowate', origin: 'bovine', originDetail: 'tallow derivative' })]);
    expect(table(section).headers).toEqual(expect.arrayContaining(['Origin', 'TSE/BSE Certificate']));
    expect(cell(section, 'Sodium tallowate', 'Origin')).toBe('bovine (tallow derivative)');
    expect(cell(section, 'Sodium tallowate', 'TSE/BSE Certificate')).toBe('not recorded');
    expect(section.narrativeDraft).toContain('1 (Sodium tallowate) is recorded as of human or animal origin.');
    expect(section.narrativeDraft).toContain('No TSE/BSE certificate is recorded for Sodium tallowate.');
  });

  it('prints the recorded certificate and raises nothing about it', () => {
    const section = s2([rawMaterial({ materialName: 'Sodium tallowate', origin: 'bovine', tseCertificate: 'EDQM CEP R1-CEP 2004-123' })]);
    expect(cell(section, 'Sodium tallowate', 'TSE/BSE Certificate')).toBe('EDQM CEP R1-CEP 2004-123');
    expect(section.narrativeDraft).not.toContain('No TSE/BSE certificate is recorded');
  });

  it('never reads a blank origin as "not of animal origin"', () => {
    const section = s2([rawMaterial({ materialName: 'Reagent R' })]);
    expect(cell(section, 'Reagent R', 'Origin')).toBe('not recorded');
    expect(cell(section, 'Reagent R', 'TSE/BSE Certificate')).toBe('not recorded');
    expect(section.narrativeDraft).toContain(
      '1 of them (Reagent R) record no origin, so whether any is of human or animal origin is not established by this section.',
    );
    expect(section.narrativeDraft).not.toContain('None is recorded as of human or animal origin');
  });

  it('says none is of human or animal origin only when every origin is recorded and none is', () => {
    const section = s2([
      rawMaterial({ materialName: 'Reagent R', origin: 'synthetic' }),
      rawMaterial({ materialName: 'Solvent S', origin: 'mineral' }),
    ]);
    expect(cell(section, 'Reagent R', 'Origin')).toBe('synthetic');
    expect(cell(section, 'Reagent R', 'TSE/BSE Certificate')).toBe('—');
    expect(section.narrativeDraft).toContain('None is recorded as of human or animal origin.');
  });
});
