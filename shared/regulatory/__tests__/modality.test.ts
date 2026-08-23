/**
 * BP-W2-2 — modality and its regulatory frame.
 *
 * Two kinds of pin. The structural ones (exhaustiveness, normalization
 * discipline) keep the registry honest as it grows. The DOMAIN ones pin the
 * FDA facts a program header must never get wrong — each of these is a mistake
 * a real product has shipped:
 *   - "BLA therefore CBER": mAbs and therapeutic proteins review in CDER.
 *   - "biologic therefore BsUFA": BsUFA covers 351(k) biosimilars only.
 *   - "ADC is a biologic": its payload–linker needs Q3A/Q3B impurity control too.
 *   - "oligo is a biologic": regulated as drugs — CDER, NDA.
 *   - "combination defaults to CDER": the lead centre comes from primary mode
 *     of action (21 CFR Part 3); a default would be a fabricated fact.
 */
import { describe, it, expect } from 'vitest';
import {
  MODALITIES,
  MODALITY_FRAME,
  MODALITY_LABEL,
  frameFor,
  frameSummary,
  normalizeModality,
} from '../modality';

describe('registry shape', () => {
  it('every modality has a frame and a label — the record cannot outgrow the derivation', () => {
    for (const m of MODALITIES) {
      expect(MODALITY_FRAME[m], `${m} has no frame`).toBeTruthy();
      expect(MODALITY_LABEL[m], `${m} has no label`).toBeTruthy();
    }
    expect(Object.keys(MODALITY_FRAME).sort()).toEqual([...MODALITIES].sort());
  });

  it('every named centre is justified, and every pathway names its fee programme', () => {
    for (const m of MODALITIES) {
      const f = frameFor(m);
      expect(f.centerBasis.length, `${m} centre has no basis sentence`).toBeGreaterThan(10);
      for (const p of f.pathways) {
        expect(['PDUFA', 'BsUFA', 'GDUFA']).toContain(p.feeProgram);
      }
    }
  });
});

describe('normalizeModality — variants land, classes do not', () => {
  it('accepts canonical members, spacing and case variants', () => {
    expect(normalizeModality('small_molecule')).toBe('small_molecule');
    expect(normalizeModality('Small Molecule')).toBe('small_molecule');
    expect(normalizeModality('  cell therapy ')).toBe('cell_therapy');
  });

  it('accepts the live domain spellings', () => {
    expect(normalizeModality('mAb')).toBe('mab');
    expect(normalizeModality('monoclonal antibody')).toBe('mab');
    expect(normalizeModality('antibody-drug conjugate')).toBe('adc');
    expect(normalizeModality('siRNA')).toBe('oligonucleotide');
    expect(normalizeModality('ASO')).toBe('oligonucleotide');
    expect(normalizeModality('CAR-T')).toBe('cell_therapy');
    expect(normalizeModality('AAV')).toBe('gene_therapy');
    expect(normalizeModality('351(k)')).toBe('biosimilar');
  });

  it('refuses to sharpen a class word into a modality', () => {
    /* `biologic` spans four modalities and two review centres; `mrna` is a
       vaccine or a therapeutic depending on the program. Null is the honest
       answer — a guess here would fabricate the very field this module exists
       to make reliable. */
    expect(normalizeModality('biologic')).toBeNull();
    expect(normalizeModality('mrna')).toBeNull();
    expect(normalizeModality('device')).toBeNull();
    expect(normalizeModality('')).toBeNull();
    expect(normalizeModality(undefined)).toBeNull();
  });
});

describe('the FDA facts the frames must never get wrong', () => {
  it('mAbs and therapeutic proteins review in CDER — BLA does not imply CBER', () => {
    expect(frameFor('mab').center).toBe('CDER');
    expect(frameFor('protein').center).toBe('CDER');
    expect(frameFor('mab').pathways[0]).toEqual({ pathway: 'BLA 351(a)', feeProgram: 'PDUFA' });
  });

  it('CBER holds vaccines and cell & gene therapy', () => {
    expect(frameFor('vaccine').center).toBe('CBER');
    expect(frameFor('cell_therapy').center).toBe('CBER');
    expect(frameFor('gene_therapy').center).toBe('CBER');
  });

  it('BsUFA is 351(k) only; an innovator BLA pays PDUFA; an ANDA pays GDUFA', () => {
    expect(frameFor('biosimilar').pathways).toEqual([
      { pathway: 'BLA 351(k)', feeProgram: 'BsUFA' },
    ]);
    for (const m of MODALITIES) {
      for (const p of frameFor(m).pathways) {
        if (p.feeProgram === 'BsUFA') expect(p.pathway).toContain('351(k)');
        if (p.pathway.startsWith('ANDA')) expect(p.feeProgram).toBe('GDUFA');
        if (p.pathway === 'BLA 351(a)') expect(p.feeProgram).toBe('PDUFA');
      }
    }
  });

  it('an ADC carries BOTH CMC cores — Q5E for the antibody, Q3A/Q3B for the payload–linker', () => {
    const cores = frameFor('adc').cmcCore.join(' ');
    expect(cores).toContain('Q5');
    expect(cores).toContain('Q3A');
  });

  it('oligonucleotides are drugs: CDER and NDA, not a BLA', () => {
    const f = frameFor('oligonucleotide');
    expect(f.center).toBe('CDER');
    expect(f.pathways.every((p) => p.pathway.startsWith('NDA'))).toBe(true);
  });

  it('a combination product derives no centre — the summary is the Part 3 rule, not a default', () => {
    const f = frameFor('combination');
    expect(f.center).toBeNull();
    expect(f.pathways).toEqual([]);
    expect(frameSummary('combination')).toContain('21 CFR Part 3');
  });

  it('frameSummary leads with the centre and the default pathway everywhere else', () => {
    expect(frameSummary('mab')).toBe('CDER · BLA 351(a) (PDUFA) · ICH Q5 family');
    expect(frameSummary('small_molecule')).toContain('CDER · NDA 505(b)(1) (PDUFA)');
  });
});

describe('cmcSectionModelFor — modality drives the CMC section model (BP-W2-2)', () => {
  it('every modality carries the common Module 3 base', async () => {
    const { MODALITIES, cmcSectionModelFor } = await import('../modality');
    for (const m of MODALITIES) {
      const model = cmcSectionModelFor(m);
      const sections = model.map((r) => r.section);
      expect(sections, `${m} lost the drug substance base`).toContain('3.2.S');
      expect(sections, `${m} lost the drug product base`).toContain('3.2.P');
      expect(sections, `${m} lost the stability programme`).toContain('3.2.P.8');
      for (const r of model) expect(r.rationale.length, `${m}/${r.title} has no rationale`).toBeGreaterThan(0);
    }
  });

  it('a mAb is told about cell banks, potency and Q5E comparability — a small molecule is not', async () => {
    const { cmcSectionModelFor } = await import('../modality');
    const mab = JSON.stringify(cmcSectionModelFor('mab'));
    expect(mab).toContain('Cell banks');
    expect(mab).toContain('Potency');
    expect(mab).toContain('Q5E');
    const sm = JSON.stringify(cmcSectionModelFor('small_molecule'));
    expect(sm).not.toContain('Cell banks');
    expect(sm).not.toContain('Q5E');
  });

  it('a small molecule is told about polymorphism, impurities and dissolution — a mAb is not', async () => {
    const { cmcSectionModelFor } = await import('../modality');
    const sm = JSON.stringify(cmcSectionModelFor('small_molecule'));
    expect(sm).toContain('Polymorphism');
    expect(sm).toContain('Q3A');
    expect(sm).toContain('Dissolution');
    const mab = JSON.stringify(cmcSectionModelFor('mab'));
    expect(mab).not.toContain('Polymorphism');
    expect(mab).not.toContain('Dissolution');
  });

  it('an ADC carries BOTH the biologic core and payload–linker chemistry', async () => {
    const { cmcSectionModelFor } = await import('../modality');
    const adc = JSON.stringify(cmcSectionModelFor('adc'));
    expect(adc).toContain('Q5E');
    expect(adc).toContain('Payload');
    expect(adc).toContain('Drug–antibody ratio');
  });

  it('a combination product gets the Part 3 per-constituent rule, not a borrowed model', async () => {
    const { cmcSectionModelFor } = await import('../modality');
    const combo = cmcSectionModelFor('combination');
    expect(JSON.stringify(combo)).toContain('constituent');
  });
});
