/**
 * IVDR Annex VIII classification adapter tests.
 *
 * `classifyIvdrAnnexVIII` is the form-shaped adapter that /api/ivdr/classify,
 * /api/ivd-lifecycle/classify/ivdr, the program plan and drift detection call.
 * It maps its input onto the canonical facts and delegates to `classifyIvdr`
 * (server/services/market-specs/device-classification.ts, `EU_IVDR_RULES`),
 * the one EU IVD rule table. Conformity routes come from `IVDR_CONFORMITY_ROUTES`
 * (IVDR Article 48), held once in ivdr-classification.ts.
 *
 * Basis: recall, corroborated by secondary search extracts on 2026-10-05; see
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-ivdr-adapter-and-conformity-routes-facts.md.
 */

import { describe, it, expect } from 'vitest';
import * as ivdrModule from '../ivdr-classification';
import { classifyIvdrAnnexVIII, IVDR_CONFORMITY_ROUTES } from '../ivdr-classification';
import { getEntry } from '../../ivd-knowledge/knowledge.service';
import { EU_IVDR_RULES, DeviceClassificationFactError } from '../../market-specs/device-classification';

describe('classifyIvdrAnnexVIII — delegates to the canonical EU_IVDR_RULES table', () => {
  it('blood-screening transmissible-agent test is Class D (Rule 1, first indent)', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'HIV screening of blood donations',
      bloodScreening: true,
      detectsTransmissibleAgent: true,
    });
    expect(r.classification).toBe('D');
    expect(r.notifiedBodyRequired).toBe(true);
    expect(r.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 1, first indent (Class D)');
  });

  it('companion diagnostic is Class C under Rule 3(f), not "Rule 3a"', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'select patients for therapy X', isCompanionDiagnostic: true });
    expect(r.classification).toBe('C');
    expect(r.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 3(f) (Class C)');
    expect(r.knowledgeRefs).toContain('eu.ivdr.companion-diagnostics');
  });

  it('cancer detection is Class C under Rule 3(h); genetic testing under Rule 3(i)', () => {
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'detect tumor marker', detectsCancer: true }).matchedRules.map(m => m.rule))
      .toContain('Annex VIII, Rule 3(h) (Class C)');
    const g = classifyIvdrAnnexVIII({ intendedPurpose: 'germline panel', isGeneticTest: true });
    expect(g.classification).toBe('C');
    expect(g.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 3(i) (Class C)');
  });

  /* Rule 4(a): self-tests are Class C, except the enumerated analytes (pregnancy,
     fertility, cholesterol; glucose, erythrocytes, leucocytes, bacteria in urine),
     which are Class B. The old engine decided the exception from riskToPatient,
     which is not an Annex VIII criterion. */
  it('a self-test is Class C when its analyte is not an enumerated Rule 4(a) exception', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'glucose self-monitoring', isSelfTest: true });
    expect(r.classification).toBe('C');
    expect(r.notifiedBodyRequired).toBe(true);
  });

  it('riskToPatient no longer decides the Rule 4(a) exception, and the result says so', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'blood glucose self-monitoring', isSelfTest: true, riskToPatient: 'low' });
    expect(r.classification).toBe('C');
    expect(r.ambiguityNotes.join(' ')).toMatch(/riskToPatient is not an Annex VIII criterion/);
  });

  it('a urine-glucose self-test is Class B (Rule 4(a) exception), whatever the risk given', () => {
    for (const analytes of [['glucose (urine)'], ['urine glucose'], ['Glucose in urine']]) {
      const r = classifyIvdrAnnexVIII({ intendedPurpose: 'urine test strip for home use', isSelfTest: true, analytes });
      expect(r.classification, analytes[0]).toBe('B');
      expect(r.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 4(a) (Class B)');
    }
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'home pregnancy test', isSelfTest: true, analytes: ['pregnancy'] }).classification).toBe('B');
  });

  it('a self-test with any analyte outside the exceptions is Class C, and an unread analyte is named', () => {
    const mixed = classifyIvdrAnnexVIII({ intendedPurpose: 'urine strip', isSelfTest: true, analytes: ['urine glucose', 'urine protein'] });
    expect(mixed.classification).toBe('C');
    expect(mixed.ambiguityNotes.join(' ')).toContain('urine protein');
  });

  /* Rule 4(b): near-patient devices are classified in their own right. */
  it('near-patient testing sets no class of its own (Rule 4(b)) — Rule 6 gives B', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'bedside test', isNearPatient: true });
    expect(r.classification).toBe('B');
    expect(r.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 6 (Class B)');
    expect(r.ambiguityNotes.join(' ')).toContain('Rule 4(b)');
  });

  it('a device matching no rule is Class B by Rule 6, and needs a notified body', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'wash buffer for laboratory use' });
    expect(r.classification).toBe('B');
    expect(r.notifiedBodyRequired).toBe(true);
    expect(r.confidence).toBe('low');
  });

  it('never awards Class A, and explains that Rule 5 is the manufacturer\'s to assert', () => {
    for (const input of [
      { intendedPurpose: 'wash buffer for laboratory use' },
      { intendedPurpose: 'x', riskToPatient: 'low' as const },
      { intendedPurpose: 'specimen tube' },
    ]) {
      const r = classifyIvdrAnnexVIII(input);
      expect(r.classification).not.toBe('A');
      expect(r.ambiguityNotes.join(' ')).toContain('Rule 5');
    }
  });

  it('highest applicable class wins (CDx + cancer + near-patient → C)', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'companion cancer test at point of care',
      isCompanionDiagnostic: true, detectsCancer: true, isNearPatient: true,
    });
    expect(r.classification).toBe('C');
  });

});

describe('classifyIvdrAnnexVIII — Rule 2 markers, fail-closed cases and the trace', () => {
  /* Rule 2: blood grouping and tissue typing are Class C; Class D only when the
     device determines a listed ABO / Rh / Kell / Kidd / Duffy marker. The old
     engine gave D for any blood grouping. */
  it('blood grouping of a listed marker is Class D (Rule 2)', () => {
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'ABO blood typing for transfusion' }).classification).toBe('D');
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'blood grouping reagent', analytes: ['anti-D'] }).classification).toBe('D');
  });

  it('blood grouping of a marker that is not listed is Class C (Rule 2), not D', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'Lewis blood grouping reagent for transfusion' });
    expect(r.classification).toBe('C');
    expect(r.matchedRules.map(m => m.rule)).toContain('Annex VIII, Rule 2 (Class C)');
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'blood grouping reagent', analytes: ['LE1'] }).classification).toBe('C');
  });

  it('blood grouping that names no marker is not classified (fails closed, no class stated)', () => {
    expect(() => classifyIvdrAnnexVIII({ intendedPurpose: 'blood grouping reagent for transfusion' }))
      .toThrow(DeviceClassificationFactError);
    expect(() => classifyIvdrAnnexVIII({ intendedPurpose: 'blood grouping reagent for transfusion' }))
      .toThrow(/bloodGroupingMarker/);
  });

  it('a transmissible-agent test that is not blood screening is not classified from these inputs', () => {
    expect(() => classifyIvdrAnnexVIII({ intendedPurpose: 'SARS-CoV-2 PCR', detectsTransmissibleAgent: true }))
      .toThrow(DeviceClassificationFactError);
  });

  it('the trace enumerates every row of the canonical table, each with its basis', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'x' });
    expect(r.ruleTrace.map(t => t.id)).toEqual(EU_IVDR_RULES.map(row => row.id));
    for (const t of r.ruleTrace) {
      expect(t.rule).not.toMatch(/Rule 3[a-d]\b/);
      expect(t.basisLabel).toMatch(/recall/);
    }
  });

  it('every knowledge ref resolves to a real corpus entry', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'genetic predisposition test', isGeneticTest: true });
    expect(r.knowledgeRefs.length).toBeGreaterThan(0);
    for (const id of r.knowledgeRefs) {
      expect(getEntry(id), `knowledge ref ${id} must exist`).not.toBeNull();
    }
  });
});

describe('IVDR_CONFORMITY_ROUTES — Article 48, held once', () => {
  it('replaces CONFORMITY_ROUTE_BY_CLASS', () => {
    expect((ivdrModule as Record<string, unknown>).CONFORMITY_ROUTE_BY_CLASS).toBeUndefined();
  });

  it('Class B has Annex IX Chapters I and III with a representative device per category — no Annex X or XI', () => {
    const b = IVDR_CONFORMITY_ROUTES.B;
    expect(b.summary).toMatch(/Annex IX Chapters I and III/);
    expect(b.summary).toMatch(/category of devices/);
    expect(b.summary).not.toMatch(/Annex XI?\b/);
    expect(b.summary).not.toMatch(/X\+XI/);
    expect(classifyIvdrAnnexVIII({ intendedPurpose: 'wash buffer' }).conformityRoute).not.toMatch(/X\+XI|Annex XI?\b/);
  });

  it('Class C offers Annex IX (generic device group) or Annex X coupled with Annex XI', () => {
    const c = IVDR_CONFORMITY_ROUTES.C;
    expect(c.summary).toMatch(/generic device group/);
    expect(c.summary).toMatch(/Annex X coupled with Annex XI/);
  });

  it('Class D offers Annex IX Chapters I, II (except section 5) and III, or Annex X coupled with Annex XI, plus the EU reference laboratory', () => {
    const d = IVDR_CONFORMITY_ROUTES.D;
    expect(d.summary).toMatch(/Chapters I, II \(except section 5\) and III/);
    expect(d.summary).toMatch(/Annex X coupled with Annex XI/);
    expect(d.summary).toMatch(/EU reference laboratory/);
  });

  it('Class A self-declares; sterile Class A involves a notified body for the sterility aspects via Annex IX or XI', () => {
    const a = IVDR_CONFORMITY_ROUTES.A;
    expect(a.notifiedBodyRequired).toBe(false);
    expect(a.summary).toMatch(/sterile/);
    expect(a.summary).toMatch(/Annex IX or Annex XI/);
  });

  it('a companion diagnostic result adds the medicines-authority consultation', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'CDx', isCompanionDiagnostic: true });
    expect(r.conformityRoute).toMatch(/medicines authority|EMA/);
  });

  it('every route carries a recall basis pointing at the IVDR on EUR-Lex', () => {
    for (const cls of ['A', 'B', 'C', 'D'] as const) {
      const route = IVDR_CONFORMITY_ROUTES[cls];
      expect(route.class).toBe(cls);
      expect(route.basis.confidence).toBe('recall');
      expect(route.basis.url).toBe('https://eur-lex.europa.eu/eli/reg/2017/746/oj');
      expect(route.basis.ref).toMatch(/Article 48/);
    }
  });
});
