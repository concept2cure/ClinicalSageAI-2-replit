/**
 * ICH E6(R3) Good Clinical Practice — the one record of its structure, and
 * where each E6(R2) section the platform used to cite now lives.
 *
 * E6(R3) (Principles + Annex 1) reached Step 4 on 2025-01-06 and supersedes
 * E6(R2) (currency fact `ich-e6r3-gcp-step4`); Annex 2 followed on 2026-06-03
 * (`ich-e6r3-annex2-step4`). Its numbering is not R2's: the 13 principles
 * became 11, the investigator (R2 §4) and sponsor (R2 §5) sections became
 * Annex 1 §2 and §3, data governance is a new §4, and the protocol (R2 §6),
 * Investigator's Brochure (R2 §7) and essential documents (R2 §8) became
 * Appendices B, A and C. An R2 section number given to a client as
 * the guideline in force, under either label, is therefore wrong, not merely dated.
 *
 * How this record was built (2026-10-08, D2): ich.org is not reachable from
 * the build environment, so no entry was read against the guideline's text.
 * Three independent recalls were made blind to each other; only the sections
 * all three gave, with the same heading, are here, and the crosswalk stops at
 * the level all three agreed on (an Annex 1 section, or an appendix). Every
 * basis is therefore `recall`, and says so wherever it is shown. Sub-points
 * (e.g. 2.8.10) are deliberately absent: cite the section, not a guessed
 * paragraph. Reading the Step 4 text would raise these to `regulator-text`.
 *
 * This module has no imports beyond the basis type so client and server can
 * both use it.
 *
 * @module shared/regulatory/ich-e6r3
 */
import type { RegulatoryBasis } from './regulatory-basis';

export const E6R3_STEP4_DATE = '2025-01-06';
export const E6R3_FACT_ID = 'ich-e6r3-gcp-step4';

/** The 11 Principles of ICH GCP in E6(R3). */
export const E6R3_PRINCIPLES: Readonly<Record<number, string>> = Object.freeze({
  1: 'Trials are conducted in accordance with ethical principles; the rights, safety and well-being of participants come first',
  2: 'Informed consent is an integral part of the ethical conduct of a trial',
  3: 'Trials are subject to objective review by an IRB/IEC',
  4: 'Trials are scientifically sound for their intended purpose and based on robust, current knowledge',
  5: 'Trials are designed and conducted by qualified individuals',
  6: 'Quality is built into the scientific and operational design and conduct of trials',
  7: 'Trial processes, measures and approaches are proportionate to the risks to participants and to the reliability of results',
  8: 'Trials are described in a clear, concise and operationally feasible protocol',
  9: 'Trials generate reliable results',
  10: 'Roles, tasks and responsibilities are clear and documented',
  11: 'Investigational products are manufactured under applicable GMP and stored, shipped and handled per their specifications and the protocol',
});

/** Annex 1 sections, to the depth all three recalls agreed on. */
export const E6R3_ANNEX1: Readonly<Record<string, string>> = Object.freeze({
  '1': 'Institutional Review Board/Independent Ethics Committee (IRB/IEC)',
  '1.1': 'Submission and Communication',
  '1.2': 'Responsibilities',
  '1.3': 'Composition, Functions and Operations',
  '1.4': 'Procedures',
  '1.5': 'Records',
  '2': 'Investigator',
  '2.1': 'Qualifications and Training',
  '2.2': 'Resources',
  '2.3': 'Responsibilities',
  '2.4': 'Communication with IRB/IEC',
  '2.5': 'Compliance with Protocol',
  '2.6': 'Premature Termination or Suspension of a Trial',
  '2.7': 'Participant Medical Care and Safety Reporting',
  '2.8': 'Informed Consent of Trial Participants',
  '2.9': 'End of Participation in a Clinical Trial',
  '2.10': 'Investigational Product Management',
  '2.11': 'Randomisation Procedures and Unblinding',
  '2.12': 'Records',
  '2.13': 'Reports',
  '3': 'Sponsor',
  '3.1': 'Trial Design',
  '3.2': 'Resources',
  '3.3': 'Allocation of Activities',
  '3.4': 'Qualification and Training',
  '3.5': 'Financing',
  '3.6': 'Agreements',
  '3.7': 'Investigator Selection',
  '3.8': 'Communication with IRB/IEC and Regulatory Authority(ies)',
  '3.9': 'Sponsor Oversight',
  '3.10': 'Quality Management',
  '3.10.1': 'Risk Management',
  '3.11': 'Quality Assurance and Quality Control',
  '3.11.1': 'Quality Assurance',
  '3.11.2': 'Audit',
  '3.11.3': 'Quality Control',
  '3.11.4': 'Monitoring',
  '3.12': 'Non-Compliance',
  '3.13': 'Safety Assessment and Reporting',
  '3.14': 'Insurance/Indemnification/Compensation to Participants and Investigators',
  '3.15': 'Investigational Product(s)',
  '3.16': 'Data and Records',
  '3.17': 'Reports',
  '4': 'Data Governance – Investigator and Sponsor',
  '4.1': 'Safeguard Blinding in Data Governance',
  '4.2': 'Data Life Cycle Elements',
  '4.3': 'Computerised Systems',
});

export const E6R3_APPENDICES: Readonly<Record<'A' | 'B' | 'C', string>> = Object.freeze({
  A: "Investigator's Brochure",
  B: 'Clinical Trial Protocol and Protocol Amendment(s)',
  C: 'Essential Records for the Conduct of a Clinical Trial',
});

export type E6R3Location =
  | { kind: 'principle'; n: number }
  | { kind: 'annex1'; section: string }
  | { kind: 'appendix'; id: 'A' | 'B' | 'C' };

const NOTE =
  'recall — three independent recalls agreed; not read against the ICH Step 4 text (ich.org unreachable from the build environment)';

/** The citation text for a location: "ICH E6(R3) Annex 1 §2.8 (Informed Consent of Trial Participants)". */
export function e6r3Ref(loc: E6R3Location): string {
  switch (loc.kind) {
    case 'principle': {
      if (!E6R3_PRINCIPLES[loc.n]) throw new Error(`ICH E6(R3) has no Principle ${loc.n}`);
      return `ICH E6(R3) Principle ${loc.n}`;
    }
    case 'annex1': {
      const title = E6R3_ANNEX1[loc.section];
      if (!title) throw new Error(`ICH E6(R3) Annex 1 has no §${loc.section} in this record`);
      return `ICH E6(R3) Annex 1 §${loc.section} (${title})`;
    }
    case 'appendix':
      return `ICH E6(R3) Appendix ${loc.id} (${E6R3_APPENDICES[loc.id]})`;
  }
}

/** A `recall` basis for a location, carrying the currency fact. */
export function citeE6R3(loc: E6R3Location): RegulatoryBasis {
  return { ref: e6r3Ref(loc), confidence: 'recall', factId: E6R3_FACT_ID, note: NOTE };
}

const A1 = (section: string): E6R3Location => ({ kind: 'annex1', section });
const APP = (id: 'A' | 'B' | 'C'): E6R3Location => ({ kind: 'appendix', id });

/**
 * Where E6(R2) content lives in E6(R3), for the R2 sections this platform has
 * cited. Only locations all three recalls agreed on. R2 §2 (the 13
 * principles) is not mapped: R3's 11 principles were rewritten, not
 * renumbered, so cite the R3 principle by its content. Two R2 numbers the code
 * cited do not exist in E6(R2) at all (5.3.5, 6.5.4); they are not mapped.
 */
export const E6R2_TO_R3: Readonly<Record<string, { r2Topic: string; r3: readonly E6R3Location[]; oneToOne: boolean }>> =
  Object.freeze({
    '3': { r2Topic: 'IRB/IEC', r3: [A1('1')], oneToOne: true },
    '3.2': { r2Topic: 'IRB/IEC composition, functions and operations', r3: [A1('1.3')], oneToOne: true },
    '3.3': { r2Topic: 'IRB/IEC procedures', r3: [A1('1.4')], oneToOne: true },
    '4': { r2Topic: 'Investigator', r3: [A1('2')], oneToOne: true },
    '4.5': { r2Topic: 'Compliance with protocol (incl. documenting deviations, 4.5.3)', r3: [A1('2.5')], oneToOne: true },
    '4.8': { r2Topic: 'Informed consent of trial subjects', r3: [A1('2.8')], oneToOne: true },
    '4.9': { r2Topic: 'Records and reports (incl. retention, 4.9.5)', r3: [A1('2.12'), APP('C')], oneToOne: false },
    '4.11': { r2Topic: 'Investigator safety reporting', r3: [A1('2.7')], oneToOne: true },
    '5': { r2Topic: 'Sponsor', r3: [A1('3'), A1('4')], oneToOne: false },
    '5.0': { r2Topic: 'Quality management (risk-based)', r3: [A1('3.10'), A1('3.10.1')], oneToOne: true },
    '5.1': { r2Topic: 'Quality assurance and quality control', r3: [A1('3.11')], oneToOne: true },
    '5.2': { r2Topic: 'Contract research organisation (transfer of duties)', r3: [A1('3.3'), A1('3.9')], oneToOne: false },
    '5.5': { r2Topic: 'Trial management, data handling and record keeping', r3: [A1('3.16'), A1('4')], oneToOne: false },
    '5.5.3': { r2Topic: 'Electronic trial data handling and validation', r3: [A1('4.3')], oneToOne: false },
    '5.14': { r2Topic: 'Supplying and handling investigational product', r3: [A1('3.15')], oneToOne: true },
    '5.16': { r2Topic: 'Safety information', r3: [A1('3.13')], oneToOne: true },
    '5.17': { r2Topic: 'Adverse drug reaction reporting', r3: [A1('3.13')], oneToOne: true },
    '5.18': { r2Topic: 'Monitoring (incl. monitor responsibilities, 5.18.4)', r3: [A1('3.11.4')], oneToOne: true },
    '5.20': { r2Topic: 'Noncompliance', r3: [A1('3.12')], oneToOne: true },
    '5.22': { r2Topic: 'Clinical trial/study reports', r3: [A1('3.17')], oneToOne: true },
    '6': { r2Topic: 'Clinical trial protocol and protocol amendment(s)', r3: [APP('B')], oneToOne: false },
    '7': { r2Topic: "Investigator's Brochure", r3: [APP('A')], oneToOne: false },
    '8': { r2Topic: 'Essential documents (phase tables 8.2–8.4)', r3: [APP('C')], oneToOne: false },
  });

/** Numbers the platform cited as E6(R2) sections that E6(R2) does not have. */
export const E6R2_NOT_SECTIONS: readonly string[] = Object.freeze(['5.3.5', '6.5.4']);

/**
 * The E6(R3) location(s) for an E6(R2) section number ("4.8.10" → §2.8), by
 * the most specific mapped prefix. Undefined when nothing is mapped — the
 * caller then cites the topic's R3 section itself, never a guessed number.
 */
export function r3ForR2(r2Section: string): readonly E6R3Location[] | undefined {
  if (E6R2_NOT_SECTIONS.includes(r2Section)) return undefined;
  const parts = r2Section.split('.');
  for (let n = parts.length; n > 0; n--) {
    const hit = E6R2_TO_R3[parts.slice(0, n).join('.')];
    if (hit) return hit.r3;
  }
  return undefined;
}

/**
 * True when a citation's section exists in this record: "Principle 7",
 * "Annex 1 §3.11.4", "Appendix C". Used by the gate that every E6(R3)
 * citation the platform serves names a real section.
 */
export function isE6R3Section(token: string): boolean {
  const t = token.trim();
  let m = /^Principle (\d+)$/.exec(t);
  if (m) return Boolean(E6R3_PRINCIPLES[Number(m[1])]);
  m = /^Annex 1 §(\d+(?:\.\d+)*)$/.exec(t);
  if (m) return Boolean(E6R3_ANNEX1[m[1]]);
  m = /^Appendix ([A-C])$/.exec(t);
  return Boolean(m);
}
