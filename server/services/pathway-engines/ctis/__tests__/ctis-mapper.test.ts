import { describe, it, expect } from 'vitest';
import { mapToCtis, type CtisInputLeaf, type CtisDossier } from '../ctis-mapper';
import { assessPathwayReadiness } from '../../index';
import { buildPathwayManifest } from '../../pathway-manifest';

const leaf = (over: Partial<CtisInputLeaf> & { sectionCode: string }): CtisInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

/**
 * A complete Part I, placed at the canonical CTIS slugs (shared/regulatory/
 * placement-vocabulary.ts, vocabulary 'ctis'). The previous fixtures used
 * 3.2.S.1 and 2.5 as IMPD stand-ins, which is exactly the defect: a CTD
 * section is not an IMPD.
 */
const partIComplete: CtisInputLeaf[] = [
  leaf({ sectionCode: 'part-i.cover-letter', title: 'Cover letter' }),
  leaf({ sectionCode: 'part-i.eu-application-form', title: 'EU application form' }),
  leaf({ sectionCode: 'part-i.protocol', title: 'Phase 2 protocol' }),
  leaf({ sectionCode: 'part-i.investigators-brochure', title: "Investigator's brochure" }),
  leaf({ sectionCode: 'part-i.gmp-manufacturing', title: 'MIA and QP declaration' }),
  leaf({ sectionCode: 'part-i.impd-quality', title: 'IMPD — quality' }),
  leaf({ sectionCode: 'part-i.impd-safety-efficacy', title: 'IMPD — safety and efficacy' }),
  leaf({ sectionCode: 'part-i.labelling', title: 'IMP labelling' }),
];

/** Every Part II slot for one member state, placed at part-ii.<ms>.<slot>. */
const partIIFor = (ms: string): CtisInputLeaf[] =>
  [
    'recruitment-arrangements',
    'subject-information',
    'investigator-suitability',
    'facilities-suitability',
    'insurance',
    'financial-arrangements',
    'fee-payment',
    'data-protection',
  ].map((s) => leaf({ sectionCode: `part-ii.${ms}.${s}`, title: `${ms.toUpperCase()} ${s}` }));

/** Missing OR undetermined, per state — what stands between the sponsor and "ready". */
const gapsFor = (d: CtisDossier, ms: string): string[] => [
  ...d.summary.partIIMissingByState[ms],
  ...d.summary.partIIUndeterminedByState[ms],
];

/**
 * The finding's case (verified 2026-10-05 on HEAD: ready:true, zero gaps for
 * DE/FR/ES). A US NDA sequence: Form FDA 356h, a cover letter, a CSR, an IB,
 * 3.2.P.3, a clinical overview and a US informed-consent template.
 */
const ndaShaped: CtisInputLeaf[] = [
  leaf({ sectionCode: '1.1.2', title: 'Form FDA 356h application form' }),
  leaf({ sectionCode: '1.2', title: 'Cover letter' }),
  leaf({ sectionCode: '5.3.5.1', title: 'CSR Study 301 (protocol 301)' }),
  leaf({ sectionCode: '1.14.4.1', title: "Investigator's brochure" }),
  leaf({ sectionCode: '3.2.P.3', title: 'Manufacture — GMP batch records' }),
  leaf({ sectionCode: '2.5', title: 'Clinical overview' }),
  leaf({ sectionCode: '5.3.5.1', title: 'Open-label extension: informed consent template (US) and labelling' }),
  leaf({ sectionCode: '5.3.5.4', title: 'Investigator CV listing, facilities, financial disclosure, insurance' }),
];

describe('mapToCtis — an NDA-shaped sequence is not CTIS-ready', () => {
  const d = mapToCtis({ leaves: ndaShaped, memberStates: ['DE', 'FR', 'ES'] });

  it('is not ready', () => {
    expect(d.summary.ready).toBe(false);
  });

  it('reports the Part I Annex I documents a US NDA does not contain', () => {
    for (const id of ['protocol', 'impd-quality', 'impd-safety-efficacy', 'labelling', 'eu-application-form']) {
      expect(d.summary.partIMissingRequired).toContain(id);
    }
    // GMP (Annex I F) does not apply to an authorised, unmodified IMP, so it is
    // undetermined until the sponsor says which — never cleared by a 3.2.P leaf.
    expect([...d.summary.partIMissingRequired, ...d.summary.partIUndetermined]).toContain('gmp-manufacturing');
  });

  it('reports every Part II Annex I heading per member state, including K, O, Q and R', () => {
    for (const ms of ['DE', 'FR', 'ES']) {
      const gaps = gapsFor(d, ms);
      for (const id of ['recruitment-arrangements', 'data-protection', 'insurance', 'fee-payment', 'subject-information-consent']) {
        expect(gaps).toContain(id);
      }
    }
  });

  it('the dispatcher lists undetermined slots with the missing ones, as eSTAR does', () => {
    const r = assessPathwayReadiness({ pathway: 'ctis', leaves: ndaShaped, memberStates: ['DE', 'FR', 'ES'] });
    expect(r.ready).toBe(false);
    expect(r.missingRequired).toContain('I:protocol');
    expect(r.missingRequired).toContain('II:DE:data-protection');
    expect(r.missingRequired).toContain('II:FR:insurance');
  });
});

describe('mapToCtis — Part I matching is by slug or document type, never by title or CTD prefix', () => {
  it('a "pipeline" title does not satisfy the PIP slot, nor "Open-label" the labelling slot', () => {
    const d = mapToCtis({
      leaves: [
        leaf({ sectionCode: '4.2.1', title: '4.2.1 pipeline pharmacology' }),
        leaf({ sectionCode: '5.3.5.1', title: 'Open-label extension study' }),
      ],
      memberStates: [],
    });
    expect(d.partI.find((s) => s.id === 'paediatric-investigation-plan')!.present).toBe(false);
    expect(d.partI.find((s) => s.id === 'labelling')!.present).toBe(false);
    expect(d.partI.find((s) => s.id === 'impd-safety-efficacy')!.present).toBe(false);
  });

  it('marks every required Part I slot present for a complete Part I placed at its slugs', () => {
    const d = mapToCtis({ leaves: partIComplete, memberStates: [] });
    expect(d.summary.partIMissingRequired).toEqual([]);
    expect(d.summary.partIUndetermined).toEqual([]);
    const protocol = d.partI.find((s) => s.id === 'protocol')!;
    expect(protocol.present).toBe(true);
    expect(protocol.sources).toEqual(['part-i.protocol']);
  });

  it('accepts a listed documentType wherever the leaf is filed', () => {
    const d = mapToCtis({
      leaves: [leaf({ sectionCode: 'm1.ib', title: 'IB v4', documentType: 'investigator_brochure' })],
      memberStates: [],
    });
    expect(d.partI.find((s) => s.id === 'investigators-brochure')!.present).toBe(true);
  });

  it('a protocol annex is not the protocol, and slugs are matched case-insensitively', () => {
    const annexOnly = mapToCtis({ leaves: [leaf({ sectionCode: 'part-i.protocol.annex', title: 'SAP' })], memberStates: [] });
    expect(annexOnly.summary.partIMissingRequired).toContain('protocol');
    const upper = mapToCtis({ leaves: [leaf({ sectionCode: ' Part-I.Protocol ', title: 'Protocol' })], memberStates: [] });
    expect(upper.partI.find((s) => s.id === 'protocol')!.present).toBe(true);
  });

  it('reports missing required Part I slots as gaps, never invents them', () => {
    const d = mapToCtis({ leaves: [leaf({ sectionCode: 'part-i.protocol', title: 'Protocol' })], memberStates: [] });
    expect(d.summary.partIMissingRequired).toContain('cover-letter');
    expect(d.summary.partIMissingRequired).toContain('investigators-brochure');
    expect(d.partI.find((s) => s.id === 'protocol')!.present).toBe(true);
  });

  it('does not block on conditional Part I rows (AxMP, scientific advice, PIP); it asks a human to confirm them', () => {
    const d = mapToCtis({ leaves: partIComplete, memberStates: [] });
    for (const id of ['auxiliary-medicinal-products', 'scientific-advice', 'paediatric-investigation-plan']) {
      expect(d.summary.partIMissingRequired).not.toContain(id);
      expect(d.summary.partIUndetermined).not.toContain(id);
      expect(d.summary.checkApplicability).toContain(`I:${id}`);
    }
  });
});

describe('mapToCtis — Part II is per member state', () => {
  it('a DE informed-consent form does not clear FR', () => {
    const d = mapToCtis({
      leaves: [...partIComplete, leaf({ sectionCode: 'part-ii.de.subject-information', title: 'DE ICF' })],
      memberStates: ['DE', 'FR'],
    });
    expect(d.partII.map((s) => s.memberState)).toEqual(['DE', 'FR']);
    expect(d.partII[0].slots.find((s) => s.id === 'subject-information-consent')!.present).toBe(true);
    expect(d.summary.partIIMissingByState['DE']).not.toContain('subject-information-consent');
    expect(d.summary.partIIMissingByState['FR']).toContain('subject-information-consent');
  });

  it('a Part II document with no member state is undetermined for every state, never present', () => {
    const d = mapToCtis({
      leaves: [
        ...partIComplete,
        leaf({ sectionCode: 'part-ii.subject-information', title: 'ICF' }),
        leaf({ sectionCode: 'm1.cv', title: 'Investigator CV', documentType: 'investigator_cv' }),
      ],
      memberStates: ['DE', 'FR'],
    });
    for (const ms of ['DE', 'FR']) {
      expect(d.summary.partIIUndeterminedByState[ms]).toContain('subject-information-consent');
      expect(d.summary.partIIUndeterminedByState[ms]).toContain('investigator-suitability');
      expect(d.summary.partIIMissingByState[ms]).not.toContain('subject-information-consent');
    }
    const st = d.partII[0].slots.find((s) => s.id === 'subject-information-consent')!;
    expect(st.present).toBe(false);
    expect(st.status).toBe('undetermined');
    expect(d.summary.ready).toBe(false);
  });

  it('a state code in the slug must match a concerned state', () => {
    const d = mapToCtis({ leaves: [...partIComplete, ...partIIFor('it')], memberStates: ['DE'] });
    expect(d.summary.partIIMissingByState['DE']).toContain('subject-information-consent');
  });
});

describe('mapToCtis — readiness', () => {
  it('is ready only when Part I and every concerned state Part II are complete', () => {
    const full = [...partIComplete, ...partIIFor('de')];
    expect(mapToCtis({ leaves: full, memberStates: ['DE'] }).summary.ready).toBe(true);
    // A second state with nothing filed → not ready.
    expect(mapToCtis({ leaves: full, memberStates: ['DE', 'FR'] }).summary.ready).toBe(false);
    // No member states → not ready (CTIS requires at least one concerned MS).
    expect(mapToCtis({ leaves: full, memberStates: [] }).summary.ready).toBe(false);
  });

  it('"if applicable" rows (K, O, Q) are undetermined until filed or recorded not-applicable', () => {
    const withoutKOQ = [...partIComplete, ...partIIFor('de')].filter(
      (l) => !/\.(recruitment-arrangements|insurance|fee-payment)$/.test(l.sectionCode),
    );
    const open = mapToCtis({ leaves: withoutKOQ, memberStates: ['DE'] });
    expect(open.summary.ready).toBe(false);
    expect(open.summary.partIIMissingByState['DE']).toEqual([]);
    expect(open.summary.partIIUndeterminedByState['DE'].sort()).toEqual(['fee-payment', 'insurance', 'recruitment-arrangements']);

    const answered = mapToCtis({
      leaves: withoutKOQ,
      memberStates: ['DE'],
      notApplicable: ['II:DE:fee-payment', 'II:DE:insurance', 'II:DE:recruitment-arrangements'],
    });
    expect(answered.summary.ready).toBe(true);
    expect(answered.partII[0].slots.find((s) => s.id === 'fee-payment')!.status).toBe('not-applicable');
  });

  it('a required row (R, data protection) cannot be marked not-applicable', () => {
    const noR = [...partIComplete, ...partIIFor('de')].filter((l) => !l.sectionCode.endsWith('.data-protection'));
    const d = mapToCtis({ leaves: noR, memberStates: ['DE'], notApplicable: ['II:DE:data-protection'] });
    expect(d.summary.partIIMissingByState['DE']).toContain('data-protection');
    expect(d.summary.ready).toBe(false);
  });

  it('GMP (Annex I F) can be recorded not-applicable for an authorised, unmodified IMP', () => {
    const noGmp = [...partIComplete, ...partIIFor('de')].filter((l) => l.sectionCode !== 'part-i.gmp-manufacturing');
    expect(mapToCtis({ leaves: noGmp, memberStates: ['DE'] }).summary.partIUndetermined).toEqual(['gmp-manufacturing']);
    expect(mapToCtis({ leaves: noGmp, memberStates: ['DE'], notApplicable: ['I:gmp-manufacturing'] }).summary.ready).toBe(true);
  });
});

describe('CTR_ANNEX_I — the one record the engine reads', () => {
  it('has one row per Annex I heading B–R plus Article 7(1)(h), each with an EUR-Lex basis', async () => {
    const { CTR_ANNEX_I } = await import('../ctr-annex-i');
    const letters = [...new Set(CTR_ANNEX_I.map((r) => r.letter))];
    expect(letters).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'Art 7(1)(h)']);
    for (const r of CTR_ANNEX_I) {
      expect(r.basis.url).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
      expect(['regulator-text', 'recall']).toContain(r.basis.confidence);
      expect(r.perMemberState).toBe(r.part === 'II');
      expect(r.ctisSlug.startsWith(r.part === 'I' ? 'part-i.' : 'part-ii.')).toBe(true);
    }
    const req = (id: string) => CTR_ANNEX_I.find((r) => r.id === id)!.requirement.kind;
    expect(req('recruitment-arrangements')).toBe('if-applicable');
    expect(req('insurance')).toBe('if-applicable');
    expect(req('fee-payment')).toBe('if-applicable');
    expect(req('data-protection')).toBe('required');
    expect(req('biological-samples')).toBe('conditional');
    // The slots the engine reports ARE the record's rows — no second list.
    const d = mapToCtis({ leaves: [], memberStates: ['DE'] });
    expect([...d.partI, ...d.partII[0].slots].map((s) => s.id)).toEqual(CTR_ANNEX_I.map((r) => r.id));
  });
});

describe('buildPathwayManifest — CTIS statuses', () => {
  it('projects undetermined and not-applicable as themselves, not as optional-absent', () => {
    const r = assessPathwayReadiness({
      pathway: 'ctis',
      leaves: [...partIComplete, leaf({ sectionCode: 'part-ii.subject-information', title: 'ICF' })],
      memberStates: ['DE'],
      ctisNotApplicable: ['II:DE:fee-payment'],
    });
    const m = buildPathwayManifest('ctis', r.detail);
    const de = (id: string) => m.entries.find((e) => e.group === 'Part II — DE' && e.id === id)!;
    expect(de('subject-information-consent').status).toBe('undetermined');
    expect(de('fee-payment').status).toBe('not-applicable');
    expect(de('data-protection').status).toBe('missing');
    expect(m.totals.undetermined).toBeGreaterThan(0);
    expect(m.ready).toBe(false);
  });
});
