import { describe, it, expect } from 'vitest';
import { mapToCtis, type CtisInputLeaf } from '../ctis-mapper';

const leaf = (over: Partial<CtisInputLeaf> & { sectionCode: string }): CtisInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

// A reasonably complete Part I set.
const partIComplete: CtisInputLeaf[] = [
  leaf({ sectionCode: 'm1.2', title: 'Cover letter', documentType: 'cover_letter' }),
  leaf({ sectionCode: 'm1.0', title: 'EU application form', documentType: 'eu_application_form' }),
  leaf({ sectionCode: '5.3.5.1', title: 'Phase 2 protocol', documentType: 'clinical_protocol' }),
  leaf({ sectionCode: 'm1.7', title: "Investigator's brochure", documentType: 'investigator_brochure' }),
  leaf({ sectionCode: '3.2.S.1', title: 'Drug substance — general' }),
  leaf({ sectionCode: '2.5', title: 'Clinical overview' }),
  leaf({ sectionCode: '3.2.P.3', title: 'Manufacturing', documentType: 'manufacturing' }),
  leaf({ sectionCode: 'm1.14', title: 'IMP labelling', documentType: 'labelling' }),
];

describe('mapToCtis — Part I', () => {
  it('marks all required Part I slots present for a complete dossier', () => {
    const d = mapToCtis({ leaves: partIComplete, memberStates: [] });
    expect(d.summary.partIMissingRequired).toEqual([]);
    const protocol = d.partI.find((s) => s.id === 'protocol')!;
    expect(protocol.present).toBe(true);
    expect(protocol.sources).toContain('5.3.5.1');
  });

  it('reports missing required Part I slots as gaps, never invents them', () => {
    const d = mapToCtis({ leaves: [leaf({ sectionCode: '5.3.5.1', title: 'Protocol', documentType: 'clinical_protocol' })], memberStates: [] });
    expect(d.summary.partIMissingRequired).toContain('cover-letter');
    expect(d.summary.partIMissingRequired).toContain('investigators-brochure');
    expect(d.partI.find((s) => s.id === 'protocol')!.present).toBe(true);
  });

  it('does not require optional Part I slots (PIP, scientific advice)', () => {
    const d = mapToCtis({ leaves: partIComplete, memberStates: [] });
    expect(d.summary.partIMissingRequired).not.toContain('paediatric-investigation-plan');
    expect(d.summary.partIMissingRequired).not.toContain('scientific-advice');
  });
});

describe('mapToCtis — Part II (per member state)', () => {
  it('evaluates Part II independently for each member state', () => {
    const d = mapToCtis({ leaves: partIComplete, memberStates: ['DE', 'FR'] });
    expect(d.partII.map((s) => s.memberState)).toEqual(['DE', 'FR']);
    // No Part II docs supplied → each state missing its required Part II slots.
    expect(d.summary.partIIMissingByState['DE']).toContain('subject-information-consent');
    expect(d.summary.partIIMissingByState['FR']).toContain('investigator-suitability');
  });

  it('clears Part II required slots when the member-state docs are present', () => {
    const withPartII = [
      ...partIComplete,
      leaf({ sectionCode: 'm1.ic', title: 'Informed consent form', documentType: 'informed_consent' }),
      leaf({ sectionCode: 'm1.cv', title: 'Investigator CV', documentType: 'investigator_cv' }),
      leaf({ sectionCode: 'm1.fac', title: 'Facilities statement', documentType: 'facility_suitability' }),
      leaf({ sectionCode: 'm1.fin', title: 'Financial arrangements', documentType: 'financial_arrangement' }),
    ];
    const d = mapToCtis({ leaves: withPartII, memberStates: ['DE'] });
    expect(d.summary.partIIMissingByState['DE']).toEqual([]);
  });
});

describe('mapToCtis — readiness', () => {
  it('is ready only when Part I and every state Part II are complete', () => {
    const full = [
      ...partIComplete,
      leaf({ sectionCode: 'ic', title: 'Informed consent', documentType: 'informed_consent' }),
      leaf({ sectionCode: 'cv', title: 'Investigator CV', documentType: 'investigator_cv' }),
      leaf({ sectionCode: 'fac', title: 'Facilities', documentType: 'facility_suitability' }),
      leaf({ sectionCode: 'fin', title: 'Financial', documentType: 'financial_arrangement' }),
    ];
    expect(mapToCtis({ leaves: full, memberStates: ['DE'] }).summary.ready).toBe(true);
    // Missing Part II → not ready.
    expect(mapToCtis({ leaves: partIComplete, memberStates: ['DE'] }).summary.ready).toBe(false);
    // No member states → not ready (CTIS requires at least one concerned MS).
    expect(mapToCtis({ leaves: full, memberStates: [] }).summary.ready).toBe(false);
  });
});
