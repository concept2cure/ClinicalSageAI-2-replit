/**
 * Japanese programmes — the one record of the PMDA/MHLW programmes AnA's
 * engines describe: conditional approval as amended by the 2025 PMD Act
 * amendment, SAKIGAKE, orphan designation, priority review, the paediatric
 * development plan effort obligation, and the PMDA consultation types.
 *
 * A satellite record on the shared basis type (docs/design/ANA_REGULATORY_RECORD.md
 * §9 "jp-programs.ts", step R13). It is not a document tree. Every engine that
 * states one of these programmes reads it from here:
 *   - server/services/global-ri/expedited-programs.ts (PMDA catalog entries and
 *     the matcher's rationale and reason text; the predicates stay there);
 *   - server/services/global-ri/pediatric-requirements.ts (the PMDA obligation);
 *   - server/services/global-ri/special-designations.ts (PMDA orphan criteria and
 *     the paediatric programme);
 *   - server/services/regulatory-strategy/regulatory-strategy-knowledge.ts
 *     (Japan's expedited pathways and conditional approval).
 * Until 2026-10-05 each of those carried its own Japan prose, as the law stood
 * before the 2025 amendment and with no basis ("Confirmatory clinical trials are
 * difficult", "No mandatory pediatric study plan", "Pediatric development is
 * encouraged").
 *
 * Basis. The MHLW and PMDA hosts are egress-blocked in the environment this was
 * written in, so nothing here has been read against the regulator's own text.
 * Every basis is `recall`; where a search of the regulator host returned the
 * page, its URL is given with a note saying it is a search extract. Unverified
 * article numbers stay out of `ref`. The product owner's decision is to ship
 * these labelled recall rather than say nothing (docs/evidence/
 * D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/DECISIONS.md #26). The facts
 * relied on are in g-jp-programs-record-facts.md in the same folder.
 *
 * Pure data and pure functions; no IO.
 *
 * @module server/services/ind/ctd/jp-programs
 */

import type { RegulatoryBasis } from './types.js';
import { basisLabel, basisProblems } from '../../../../shared/regulatory/regulatory-basis';

/** What kind of thing the entry is. */
export type JpProgramKind = 'approval-pathway' | 'designation' | 'review-priority' | 'obligation' | 'consultation';

/** Product families an entry is recorded as applying to. */
export type JpProductFamily = 'drug' | 'device' | 'ivd' | 'regenerative';

export interface JpProgram {
  /** Stable id; the global-ri engines key on it. */
  id: string;
  kind: JpProgramKind;
  /** English name as AnA states it. */
  name: string;
  /** The Japanese name. */
  nameJa: string;
  /** Product families this is recorded for. Narrowed to what has a basis. */
  appliesTo: readonly JpProductFamily[];
  description: string;
  /** Qualifying criteria, or for a consultation, when it is used. */
  criteria: readonly string[];
  /** What it gives the sponsor. */
  benefit: string;
  /** When it is due or held, where that is part of the programme. */
  timing?: string;
  /** Conditions attached after approval (approval pathways). */
  conditions?: readonly string[];
  /** ISO date from which the entry as written is in force. */
  effectiveFrom?: string;
  basis: readonly RegulatoryBasis[];
}

const SEARCH_EXTRACT = 'Search extract of the regulator page on 2026-10-05; the page itself was not read (egress blocked). Verbatim re-read owed.';

/** The 2025 amending act. The article numbers it inserts are not verified and are not cited. */
const PMD_ACT_2025: RegulatoryBasis = {
  ref: 'PMD Act as amended by Act No. 37 of 2025 (令和7年法律第37号)',
  confidence: 'recall',
  url: 'https://www.mhlw.go.jp/stf/newpage_58083.html',
  note: `${SEARCH_EXTRACT} Staged entry into force; the provisions recorded here from 2026-05-01.`,
};

/** PMDA's consultation catalogue for new drugs (治験相談等). */
const PMDA_CONSULTATIONS: RegulatoryBasis = {
  ref: 'PMDA face-to-face advice and consultations for new drugs (対面助言・治験相談等)',
  confidence: 'recall',
  url: 'https://www.pmda.go.jp/review-services/f2f-pre/consultations/0007.html',
  note: SEARCH_EXTRACT,
};

/**
 * The record, ordered by id.
 */
export const JP_PROGRAMS: readonly JpProgram[] = Object.freeze([
  {
    id: 'jp-pediatric-development-plan',
    kind: 'obligation',
    name: 'Paediatric development plan (effort obligation)',
    nameJa: '小児用医薬品開発計画の策定（努力義務）',
    appliesTo: ['drug'],
    description:
      'Under the PMD Act as amended in 2025, a sponsor seeking approval of a drug that differs from an approved drug in active ingredient, indication, dosage or administration is to endeavour to draw up a paediatric development plan for that indication, have it confirmed by PMDA, and develop it without delay. It is an effort obligation: the Act asks the sponsor to endeavour; the plan is not an approval prerequisite.',
    criteria: [
      'Application for a new active ingredient, new indication, or new dosage or administration',
      'A paediatric development plan for the indication is drawn up and confirmed by PMDA',
      'Paediatric development then proceeds under the plan without delay',
    ],
    benefit:
      'A PMDA-confirmed paediatric plan in place before the adult application. Incentives linked to paediatric development (for example the re-examination period) are not modelled here; confirm them with PMDA.',
    timing: 'Drawn up and confirmed by PMDA before the adult marketing application is filed.',
    effectiveFrom: '2026-05-01',
    basis: [
      {
        ...PMD_ACT_2025,
        note: `${PMD_ACT_2025.note} The MHLW notice of 2026-02-27 (医薬薬審発0227第8号) applying from 2026-05-01 was found by title only; its content was not read.`,
      },
    ],
  },
  {
    id: 'pmda-conditional-approval',
    kind: 'approval-pathway',
    name: 'Conditional approval (amended 2025)',
    nameJa: '条件付き承認制度',
    appliesTo: ['drug'],
    description:
      'Approval of a drug for a serious disease with no adequate alternative therapy at the exploratory-trial stage, where clinical usefulness can be reasonably predicted, before confirmatory trials are complete. The approval carries conditions and can be revoked. This replaces the earlier system, under which confirmatory trials had to be difficult to conduct.',
    criteria: [
      'Serious disease for which no adequate alternative therapy exists',
      'Clinical usefulness can be reasonably predicted from exploratory clinical trial results',
      'Efficacy and safety are confirmed after approval under the conditions attached to the approval',
    ],
    benefit: 'Approval at the exploratory-trial stage, subject to post-approval conditions.',
    conditions: [
      'Post-approval confirmation of efficacy and safety as specified in the approval conditions',
      'The approval can be revoked if the conditions are not met or clinical usefulness is not confirmed',
    ],
    effectiveFrom: '2026-05-01',
    basis: [
      {
        ...PMD_ACT_2025,
        note: `${PMD_ACT_2025.note} The search extract and secondary sources report that the amended system also covers medical devices and IVDs; that extension is not verified, so this entry is recorded for drugs only.`,
      },
    ],
  },
  {
    id: 'pmda-consultation-clinical-trial',
    kind: 'consultation',
    name: 'Clinical trial consultation',
    nameJa: '治験相談',
    appliesTo: ['drug'],
    description:
      'Fee-based PMDA face-to-face advice on a development programme, offered at defined stages (before Phase 1, before and after Phase 2, before the application).',
    criteria: ['Specific scientific or regulatory questions on the development programme, at a defined development stage'],
    benefit: 'Recorded PMDA advice on the questions asked.',
    basis: [PMDA_CONSULTATIONS],
  },
  {
    id: 'pmda-consultation-electronic-data',
    kind: 'consultation',
    name: 'Consultation on the submission of electronic study data',
    nameJa: '医薬品申請電子データ提出確認相談',
    appliesTo: ['drug'],
    description: 'PMDA consultation confirming the electronic study data (CDISC) package to be submitted with a new drug application.',
    criteria: ['A new drug application that will carry electronic study data'],
    benefit: 'Agreement with PMDA on the electronic data package before filing.',
    timing: 'Before the application is filed.',
    basis: [PMDA_CONSULTATIONS],
  },
  {
    id: 'pmda-consultation-end-of-phase-2',
    kind: 'consultation',
    name: 'End-of-Phase II consultation',
    nameJa: '第II相試験終了後相談',
    appliesTo: ['drug'],
    description: 'Clinical trial consultation at the end of Phase II on the confirmatory programme and the application data package.',
    criteria: ['Phase II complete; confirmatory development being planned'],
    benefit: 'PMDA advice on the confirmatory trial design and data package.',
    timing: 'After Phase II, before confirmatory trials start.',
    basis: [PMDA_CONSULTATIONS],
  },
  {
    id: 'pmda-consultation-pediatric-plan',
    kind: 'consultation',
    name: 'Consultation to confirm a paediatric development plan',
    nameJa: '小児用医薬品開発計画確認相談',
    appliesTo: ['drug'],
    description:
      'PMDA consultation set up to confirm the paediatric development plan for a new active ingredient or new indication being developed in adults; advice is given in writing in principle.',
    criteria: ['Adult development of a new active ingredient or new indication, with a paediatric development plan to confirm'],
    benefit: 'PMDA confirmation of the paediatric development plan.',
    timing: 'Before the adult marketing application is filed.',
    effectiveFrom: '2026-05-01',
    basis: [
      {
        ref: 'PMDA, Consultation to confirm a paediatric development plan (小児用医薬品開発計画確認相談)',
        confidence: 'recall',
        url: 'https://www.pmda.go.jp/review-services/f2f-pre/consultations/0118.html',
        note: `${SEARCH_EXTRACT} The extract says the consultation was revised on 2026-02-27 and gives advice in writing in principle.`,
      },
    ],
  },
  {
    id: 'pmda-consultation-pre-application',
    kind: 'consultation',
    name: 'Pre-application consultation',
    nameJa: '申請前相談',
    appliesTo: ['drug'],
    description: 'Clinical trial consultation before filing, on the sufficiency of the application data package.',
    criteria: ['Development complete or nearly complete; application being prepared'],
    benefit: 'PMDA advice on the data package before filing.',
    timing: 'Before the application is filed.',
    basis: [PMDA_CONSULTATIONS],
  },
  {
    id: 'pmda-consultation-pre-meeting',
    kind: 'consultation',
    name: 'Pre-consultation meeting',
    nameJa: '事前面談',
    appliesTo: ['drug'],
    description: 'Short PMDA meeting before a formal consultation to agree its scope and questions.',
    criteria: ['A formal consultation is being prepared'],
    benefit: 'Agreed scope and questions for the formal consultation.',
    timing: 'Before a formal consultation is applied for.',
    basis: [PMDA_CONSULTATIONS],
  },
  {
    id: 'pmda-consultation-rs-strategy',
    kind: 'consultation',
    name: 'Regulatory science strategy consultation',
    nameJa: 'RS戦略相談',
    appliesTo: ['drug'],
    description: 'PMDA consultation on the development strategy for seeds from academia and venture companies, from the non-clinical stage.',
    criteria: ['Early development by an academic group or venture company'],
    benefit: 'PMDA advice on the development strategy and the tests needed.',
    basis: [
      {
        ref: 'PMDA, Regulatory science strategy consultation (RS戦略相談)',
        confidence: 'recall',
        url: 'https://www.pmda.go.jp/review-services/f2f-pre/strategies/0005.html',
        note: SEARCH_EXTRACT,
      },
    ],
  },
  {
    id: 'pmda-orphan-drug',
    kind: 'designation',
    name: 'Orphan Drug Designation',
    nameJa: '希少疾病用医薬品指定',
    appliesTo: ['drug'],
    description:
      'Designation for drugs targeting serious diseases affecting fewer than 50,000 patients in Japan with high medical need, providing development support, priority review, and re-examination and tax incentives.',
    criteria: [
      'Target patient population under 50,000 in Japan',
      'Indication is a serious disease with high medical need',
      'Sound rationale and feasible development plan',
    ],
    benefit: 'Development subsidies, consultation support, priority review, and extended re-examination period.',
    basis: [{ ref: 'PMD Act; MHLW orphan drug designation criteria', confidence: 'recall' }],
  },
  {
    id: 'pmda-priority-review',
    kind: 'review-priority',
    name: 'Priority Review',
    nameJa: '優先審査',
    appliesTo: ['drug'],
    description: 'Shortened MHLW/PMDA review period for drugs treating serious diseases with high medical usefulness relative to existing therapies.',
    criteria: [
      'Indication is a serious disease',
      'High medical usefulness (no existing therapy, or superior efficacy/safety/usefulness over existing therapies)',
    ],
    benefit: 'Prioritized, shortened regulatory review timetable.',
    basis: [{ ref: 'PMD Act; MHLW priority review criteria', confidence: 'recall' }],
  },
  {
    id: 'pmda-sakigake',
    kind: 'designation',
    name: 'Sakigake Designation',
    nameJa: '先駆的医薬品指定',
    appliesTo: ['drug'],
    description:
      'Designation promoting early practical application in Japan of innovative drugs developed there ahead of (or simultaneously with) other countries, offering prioritized consultation, review, and a substantive review-period target.',
    criteria: [
      'Innovative product with a novel mechanism',
      'Serious or life-threatening target disease',
      'Prominent effectiveness expected (substantial improvement over existing therapies)',
      'Intended for early/world-first development and filing in Japan',
    ],
    benefit: 'Prioritized consultation and review (target ~6 months), with a dedicated PMDA concierge.',
    basis: [
      {
        ref: 'PMD Act, SAKIGAKE designation (statutory since the 2019 amendment)',
        confidence: 'recall',
        note: 'Introduced in 2015 as an MHLW scheme (先駆け審査指定制度); placed in the PMD Act by the 2019 amendment.',
      },
    ],
  },
] satisfies JpProgram[]);

const BY_ID: ReadonlyMap<string, JpProgram> = new Map(JP_PROGRAMS.map((p) => [p.id, p]));

/** The entry with this id. Throws for an id the record does not hold, so a reader never states an unrecorded programme. */
export function getJpProgram(id: string): JpProgram {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`jp-programs: no Japanese programme "${id}" is recorded.`);
  return p;
}

/** The entry's bases as a reader sees them, joined: each says whether it was checked against the regulator's text. */
export function jpProgramBasisLabel(p: JpProgram): string {
  return p.basis.map(basisLabel).join('; ');
}

/** "Criterion; criterion; …" — the one rendering of an entry's criteria in prose. */
export function jpProgramCriteriaText(p: JpProgram): string {
  return p.criteria.join('; ');
}

/**
 * Why the record (or the given entries) is not well formed; `[]` means it is.
 * Every entry needs at least one basis, each basis must pass `basisProblems`,
 * and a `regulator-text` basis must have been checked on or after the date the
 * entry took effect — otherwise the check read the law as it stood before.
 */
export function jpProgramProblems(programs: readonly JpProgram[] = JP_PROGRAMS): string[] {
  const problems: string[] = [];
  for (const p of programs) {
    if (p.basis.length === 0) problems.push(`${p.id}: no basis`);
    for (const b of p.basis) {
      for (const msg of basisProblems(b)) problems.push(`${p.id}: ${b.ref}: ${msg}`);
      if (b.confidence === 'regulator-text' && p.effectiveFrom && b.checked && b.checked < p.effectiveFrom) {
        problems.push(`${p.id}: ${b.ref}: checked ${b.checked} is before effectiveFrom ${p.effectiveFrom}`);
      }
    }
  }
  return problems;
}
