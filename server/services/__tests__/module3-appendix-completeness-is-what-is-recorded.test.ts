/**
 * A 3.2.A appendix is as complete as what it could state, not as complete as
 * the number of source rows it matched.
 *
 * What the code used to do (until 2026-10-15): composeAppendices scored an
 * appendix 100 with no missing inputs whenever a source of a matching type
 * existed and the narrative lacked the literal marker "NOT ESTABLISHED". So
 * §3.2.A.1 — a REQUIRED appendix — composed from one manufacturing-process row
 * holding only a route read "100% complete, nothing missing" while its own text
 * said "Manufacturing site not yet recorded" and the container closure "not yet
 * specified". In §3.2.A.3 a novel excipient with no recorded safety study was
 * listed with "See M4" — a pointer to Module 4 studies nobody recorded — under
 * a sentence saying the qualification data "is provided below", and the
 * section scored 100. Every A.3 also closed with "Audit trails for vendor
 * changes are maintained per the site quality system.", which no field
 * supports, and the novel-excipient text cited ICH Q3C (residual solvents).
 */
import { describe, expect, it } from 'vitest';

import { composeAppendices } from '../module3-extensions';

const src = (id: string, sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id, sourceType, sourcePayload, sourceHash: 'h' }) as never;

const appendix = (key: string, sources: unknown[]) =>
  composeAppendices(sources as never).find((s) => s.sectionKey === key)!;

describe('§3.2.A.1 — completeness is derived from the facts the section reports missing', () => {
  it('a route alone does not complete the section that says the site and container are not recorded', () => {
    const section = appendix('3.2.A.1', [
      src('mp-1', 'manufacturing_process', { manufacturingRoute: 'Three-step synthesis' }),
    ]);
    expect(section.narrativeDraft).toContain('Manufacturing site not yet recorded');
    expect(section.narrativeDraft).toContain('not yet specified');
    expect(section.missingInputs).toEqual(['manufacturingSite', 'containerDescription']);
    expect(section.completeness).toBe(0);
  });

  it('counts each recorded fact: a site without a container closure is half the section', () => {
    const section = appendix('3.2.A.1', [
      src('mp-1', 'manufacturing_process', {
        manufacturingRoute: 'Three-step synthesis',
        manufacturingSite: 'Cork, Ireland',
      }),
    ]);
    expect(section.missingInputs).toEqual(['containerDescription']);
    expect(section.completeness).toBe(50);
  });

  it('is complete when the site and the container closure are both recorded', () => {
    const section = appendix('3.2.A.1', [
      src('mp-1', 'manufacturing_process', { manufacturingSite: 'Cork, Ireland' }),
      src('cc-1', 'container_closure', {
        containerDescription: '10 mL Type I vial',
        closureDescription: '20 mm bromobutyl stopper',
      }),
    ]);
    expect(section.missingInputs).toEqual([]);
    expect(section.completeness).toBe(100);
  });
});

describe('§3.2.A.3 — a novel excipient with no recorded safety study', () => {
  const novel = (over: Record<string, unknown> = {}) =>
    src('ex-1', 'excipient', {
      materialName: 'Novel Polymer Z',
      novel: true,
      function: 'Modified release agent',
      concentration: '5% w/w',
      ...over,
    });

  it('prints "not recorded", not a pointer to Module 4, and is not a complete section', () => {
    const section = appendix('3.2.A.3', [novel()]);
    const table = section.tables.find((t) => t.title.startsWith('Novel Excipients'))!;
    expect(table.rows[0][3]).toBe('not recorded');
    expect(JSON.stringify(section.tables)).not.toContain('See M4');
    expect(section.narrativeDraft).not.toContain('is provided below');
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(0);
    expect(section.missingInputs.length).toBeGreaterThan(0);
  });

  it('reports the recorded safety study and is complete when every novel excipient has one', () => {
    const section = appendix('3.2.A.3', [
      novel({ safetyStudies: '13-week rat oral toxicity study, report TX-0042' }),
    ]);
    const table = section.tables.find((t) => t.title.startsWith('Novel Excipients'))!;
    expect(table.rows[0][3]).toBe('13-week rat oral toxicity study, report TX-0042');
    expect(section.completeness).toBe(100);
    expect(section.missingInputs).toEqual([]);
  });

  it('does not cite ICH Q3C (residual solvents) as the basis for novel-excipient qualification', () => {
    const section = appendix('3.2.A.3', [novel()]);
    expect(section.narrativeDraft).not.toContain('ICH Q3C');
  });
});

describe('§3.2.A.3 — no claim about vendor audit trails', () => {
  it('does not assert audit trails that no field records', () => {
    const section = appendix('3.2.A.3', [
      src('ex-1', 'excipient', {
        materialName: 'Gelatin',
        functionInFormulation: 'Capsule shell',
        origin: 'bovine',
        tseCertificate: 'CEP R1-CEP 2000-045-Rev 03',
        status: 'specified',
      }),
    ]);
    expect(section.narrativeDraft).toContain('A TSE/BSE certificate is recorded for each');
    expect(section.narrativeDraft).not.toMatch(/Audit trails for vendor changes/);
  });
});
