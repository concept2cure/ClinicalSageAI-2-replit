/**
 * AnA's SOP expertise: an SOP she writes, asks about or reviews names the
 * regulation in force, by clause, for the product it governs
 * (2026-10-08, D2; founder-directed: "enhance her acumen … protocols, SOPs,
 * IND documentation, BLA").
 *
 * Measured at 7de37444 before the change:
 *   - generate_sop had no product type, so a device manufacturer's CAPA SOP
 *     cited 21 CFR 210/211 (drug CGMP) and never ISO 13485:2016 or the QMSR,
 *     in force since 2026-02-02 (currency fact us-qmsr);
 *   - no SOP carried a clause-level requirement; complaint handling and
 *     management review did not exist as topics;
 *   - nothing reviewed a client's SOP against what its topic requires;
 *   - the SOP question flow told clients 21 CFR 820.25 / 820.40 / 820.90 for
 *     devices (removed by the QMSR; 820.90 was nonconforming product, never
 *     CAPA), ICH Q10 §3.2.4 for change management (it is §3.2.3), a §3.2.5
 *     that does not exist, and EU GMP Annex 15 (qualification and validation)
 *     for training competence.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { generateSop } from '../../server/services/sop-generator';
import {
  SOP_TOPICS,
  sopRequirementsFor,
  ICH_Q10_SECTIONS,
} from '../../shared/regulatory/sop-requirements';
import { reviewSopText } from '../../shared/regulatory/sop-review';
import { basisProblems } from '../../shared/regulatory/regulatory-basis';

const AS_OF = '2026-10-08';
const refsOf = (sop: { references: string[] }) => sop.references.join('\n');

describe('a device manufacturer’s SOP cites the device quality system in force, not drug CGMP', () => {
  it('a device CAPA SOP cites the QMSR and ISO 13485:2016 §8.5.2, and no part of 21 CFR 210/211', () => {
    const sop = generateSop({ title: 'Corrective and Preventive Action', processType: 'capa', productType: 'device', effectiveDate: AS_OF });
    const refs = refsOf(sop);
    expect(refs).toMatch(/21 CFR 820\.10/);
    expect(refs).toMatch(/ISO 13485:2016 §8\.5\.2/);
    expect(refs, 'drug CGMP cited for a device').not.toMatch(/21 CFR (Part )?21[01]\b/);
    // The removed QSR section is named only as "formerly", never as the requirement.
    for (const m of refs.matchAll(/21 CFR 820\.(20|25|30|40|50|70|72|90|100|180|198)\b/g)) {
      expect(refs.slice(Math.max(0, m.index! - 40), m.index!), `QSR ${m[0]} cited as in force`).toMatch(/formerly/);
    }
  });

  it('a drug CAPA SOP cites 21 CFR 211.192 and ICH Q10 §3.2.2', () => {
    const refs = refsOf(generateSop({ title: 'CAPA', processType: 'capa', productType: 'drug', effectiveDate: AS_OF }));
    expect(refs).toMatch(/21 CFR 211\.192/);
    expect(refs).toMatch(/ICH Q10 §3\.2\.2/);
  });

  it('a biologic deviation SOP names the biological product deviation report (21 CFR 600.14)', () => {
    const sop = generateSop({ title: 'Deviations', processType: 'deviation_management', productType: 'biologic', effectiveDate: AS_OF });
    expect(refsOf(sop)).toMatch(/21 CFR 600\.14/);
    expect(sop.markdown).toMatch(/45 calendar days/);
  });

  it('every clause the SOP relies on is listed with its basis, and an unread one says so', () => {
    const sop = generateSop({ title: 'CAPA', processType: 'capa', productType: 'device', effectiveDate: AS_OF });
    const req = sop.sections.find((s) => /requirements this procedure addresses/i.test(s.title));
    expect(req, 'no requirements section').toBeDefined();
    expect(req!.content).toMatch(/recall — not checked against the regulator's text/);
    expect(req!.content).toMatch(/root[- ]cause|causes/i);
  });

  it('complaint handling and management review are topics', () => {
    const complaints = generateSop({ title: 'Complaint handling', processType: 'complaint_handling', productType: 'device', effectiveDate: AS_OF });
    expect(refsOf(complaints)).toMatch(/ISO 13485:2016 §8\.2/);
    expect(refsOf(complaints)).toMatch(/21 CFR 803/);
    const review = generateSop({ title: 'Management review', processType: 'management_review', productType: 'drug', effectiveDate: AS_OF });
    expect(refsOf(review)).toMatch(/ICH Q10 §(2\.6|4\.1)/);
  });

  it('with no product type it does not guess one: it says which it assumed', () => {
    const sop = generateSop({ title: 'CAPA', processType: 'capa', effectiveDate: AS_OF });
    expect(sop.productType).toBe('drug');
    expect(sop.markdown).toMatch(/product type was not given/i);
  });
});

describe('the record itself', () => {
  it('every element of every topic and product carries a well-formed basis', () => {
    for (const topic of SOP_TOPICS) {
      for (const domain of ['drug', 'biologic', 'device'] as const) {
        const r = sopRequirementsFor(topic, domain, AS_OF);
        expect(r.elements.length, `${topic}/${domain} has no elements`).toBeGreaterThan(2);
        for (const b of [...r.governing, ...r.elements.map((e) => e.basis)]) {
          expect(basisProblems(b), `${topic}/${domain}: ${b.ref}`).toEqual([]);
        }
      }
    }
  });

  it('before the QMSR took effect, a device SOP is cited to the QSR section then in force', () => {
    const r = sopRequirementsFor('capa', 'device', '2025-06-01');
    expect(r.governing.map((b) => b.ref).join(' ')).toMatch(/21 CFR 820\.100/);
  });
});

describe('AnA reviews a client’s SOP against what its topic requires', () => {
  const draft = [
    'Purpose. This procedure covers corrective and preventive action for medical devices.',
    'The CAPA owner reviews nonconformities, including customer complaints, each week.',
    'A root cause investigation is performed using a structured method.',
    'Actions are planned, documented and implemented, and affected documents are updated.',
    'Effectiveness of each action is verified before closure.',
  ].join('\n');

  it('names each requirement as addressed, with the sentence that addresses it, or as not found', () => {
    const review = reviewSopText(draft, 'capa', 'device', AS_OF);
    const byId = Object.fromEntries(review.elements.map((e) => [e.id, e]));
    expect(byId.determine_causes.status).toBe('addressed');
    expect(byId.determine_causes.evidence).toMatch(/root cause/i);
    expect(byId.effectiveness.status).toBe('addressed');
    expect(byId.no_adverse_effect.status, 'not in the draft').toBe('not_found');
    expect(byId.preventive_action.status).toBe('not_found');
    expect(review.summary.addressed + review.summary.notFound).toBe(review.elements.length);
  });

  it('says what "not found" means: the check found no wording for it, not that the SOP is deficient', () => {
    const review = reviewSopText(draft, 'capa', 'device', AS_OF);
    expect(review.method).toMatch(/wording/i);
    expect(review.method).toMatch(/not a verdict|read the SOP/i);
  });

  it('an empty SOP addresses nothing and is not reported as reviewed clean', () => {
    const review = reviewSopText('   ', 'capa', 'drug', AS_OF);
    expect(review.summary.addressed).toBe(0);
    expect(review.status).toBe('no_text');
  });
});

describe('what the SOP question flow tells clients is the regulation in force', () => {
  const flows = ['sop-development.ts', 'sop-development-specializations.ts'].map((f) =>
    readFileSync(path.resolve(__dirname, '../../server/services/ana/intelligence-questions/flows', f), 'utf8'),
  );
  // What the flow serves to clients: its strings, not its comments (a dated
  // comment may quote the citation it corrected).
  const text = flows.join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('names no removed QSR section as a requirement for devices', () => {
    for (const m of text.matchAll(/21 CFR 820\.(20|22|25|30|40|50|70|72|80|90|100|180|181|184|186|198)\b/g)) {
      expect(text.slice(Math.max(0, m.index! - 40), m.index!), `${m[0]} cited as in force`).toMatch(/formerly|before 2026-02-02|until 2026-02-01/);
    }
  });

  it('cites only ICH Q10 sections that exist, and change management as §3.2.3', () => {
    for (const m of text.matchAll(/ICH Q10 (?:Section |§)(\d+(?:\.\d+)*)/g)) {
      expect(ICH_Q10_SECTIONS, `ICH Q10 ${m[1]} does not exist`).toHaveProperty(m[1]);
    }
    expect(text).not.toMatch(/ICH Q10 (Section |§)3\.2\.4[^.]{0,80}change control|change control[^.]{0,120}ICH Q10 (Section |§)3\.2\.4/i);
  });

  it('does not cite EU GMP Annex 15 for training', () => {
    expect(text).not.toMatch(/Annex 15[^.]{0,80}(competenc|training)/i);
  });
});
