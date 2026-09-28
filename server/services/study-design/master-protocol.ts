/**
 * Master-protocol check — whether a platform, basket, umbrella or MAMS design
 * records what FDA expects a master protocol to pre-specify, and whether its
 * sub-studies hang together.
 *
 * ## The industry need
 * The structural-design enum admits `platform | basket | umbrella | mams`, and
 * no gate read them. FDA's guidance "Master Protocols: Efficient Clinical Trial
 * Design Strategies To Expedite Development of Oncology Drugs and Biologics"
 * (2022) and its draft "Master Protocols for Drug and Biological Product
 * Development" (December 2023; revised as a draft in June 2026) expect the
 * protocol to state, per sub-study, the population, the arms and the decision
 * rule — and, where assignment is biomarker-based, the biomarker and the assay
 * that measures it; and across sub-studies, how a shared control is used
 * (including non-concurrent controls), how arms are added and dropped, how
 * type I error is handled, and the data monitoring committee. This module
 * checks the recorded plan against that list and checks its referential
 * integrity. It computes no statistic.
 *
 * ## The honesty contract
 *  - An element the plan does not record is `not stated`, never assumed. A
 *    stated absence is distinguished from silence wherever the model can carry
 *    it: `sharedControlArm: null` (no shared control), `biomarker: null` (the
 *    sub-study's population is not biomarker-defined), `dmcCharter.present:
 *    false` (no DMC charter — stated, and still a gap).
 *  - Biomarker elements are asked of basket and umbrella sub-studies only, and
 *    only as "which biomarker, if any": the 2022 guidance defines a basket's
 *    populations by disease stage, histology, prior therapies, genetic or other
 *    biomarkers, or demographics, and an umbrella trial as several drugs in one
 *    disease population — neither is necessarily biomarker-assigned. The assay
 *    is demanded only when a biomarker is named.
 *  - A shared control is shared across the ARMS compared against it: at least
 *    two, across however many sub-studies (a one-sub-study MAMS trial of three
 *    drugs against one control is a shared control).
 *  - A sub-study naming an arm the design does not carry, an arm listed twice,
 *    a repeated sub-study id or name, is an integrity defect.
 *  - ANY use of non-concurrent controls needs a recorded justification: the
 *    draft guidance expects primary comparisons against concurrently eligible,
 *    concurrently randomized controls, admits non-concurrent control data only
 *    in rare circumstances whose rationale is discussed with FDA at the
 *    planning stage, and a time-trend adjustment may not remove the bias. Use
 *    with NO adjustment is additionally an integrity defect.
 *  - A design whose structural design is not recorded is `missing`, not
 *    `not_applicable`: whether a master protocol applies cannot be decided. A
 *    plan recorded on a non-master design is said to be ignored (a note).
 *  - Pure and total: a malformed plan is reported, never thrown on. No clock,
 *    no model, no DB.
 *
 * @module server/services/study-design/master-protocol
 */

import type { MasterProtocolPlan, StructuralDesign, StudyDesign } from './study-design-types';
import { present } from './usdm-types';

export const MASTER_PROTOCOL_BASIS =
  'FDA guidance: Master Protocols: Efficient Clinical Trial Design Strategies To Expedite Development of Oncology Drugs and Biologics (2022); ' +
  'FDA draft guidance: Master Protocols for Drug and Biological Product Development (2023; revised draft 2026)';

const MASTER_DESIGNS: ReadonlySet<unknown> = new Set(['platform', 'basket', 'umbrella', 'mams']);
const BIOMARKER_DESIGNS: ReadonlySet<unknown> = new Set(['basket', 'umbrella']);
const ACROSS = 'across sub-studies';

export type MasterProtocolStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface MasterProtocolElement {
  scope: string;
  element: string;
  /** The plan records a value for this element; a stated absence counts as stated. */
  stated: boolean;
  detail: string;
  /** The gap this element raises, or null. Every unstated element raises one; a stated value can too (no DMC charter). */
  gap: string | null;
}

export interface MasterProtocolCheck {
  status: MasterProtocolStatus;
  structuralDesign: StructuralDesign | null;
  gaps: string[];
  elements: MasterProtocolElement[];
  /** Referential and structural defects: arms that do not exist, a shared control with one arm against it, repeats. */
  integrity: string[];
  /** What the check says without it being a gap (a plan ignored on a non-master design). */
  notes: string[];
  basis: string;
}

/**
 * The plan as persisted designs may carry it: `biomarker: null` states a
 * sub-study is not biomarker-defined, and `nonConcurrentControlsJustification`
 * records why non-concurrent controls are used. Both are read ahead of
 * `study-design-types.ts` declaring them.
 */
type SubStudy = Omit<MasterProtocolPlan['subStudies'][number], 'biomarker'> & { biomarker?: string | null };
type Plan = Omit<MasterProtocolPlan, 'subStudies'> & { subStudies: unknown; nonConcurrentControlsJustification?: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const designArmNames = (design: StudyDesign): Set<unknown> => new Set((Array.isArray(design.arms) ? design.arms : []).filter(isRecord).map((a) => a.name));
const armsOf = (s: SubStudy): string[] => (Array.isArray(s.arms) ? s.arms.map(String) : []);

function unstated(scope: string, name: string): MasterProtocolElement {
  return { scope, element: name, stated: false, detail: 'not stated', gap: `${scope}: ${name} not stated` };
}

function element(scope: string, name: string, value: unknown): MasterProtocolElement {
  return present(value) ? { scope, element: name, stated: true, detail: value.trim(), gap: null } : unstated(scope, name);
}

function countBy<T>(items: T[], key: (t: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of items) {
    const k = key(x);
    if (k !== null) out.set(k, [...(out.get(k) ?? []), x]);
  }
  return out;
}

const nameOf = (s: SubStudy): string | null => (present(s.name) ? s.name.trim() : null);

/** A scope label per sub-study; a name several sub-studies share is disambiguated by id. */
function scopeLabeller(subs: SubStudy[]): (s: SubStudy) => string {
  const byName = countBy(subs, nameOf);
  return (s) => {
    const n = nameOf(s);
    if (n === null) return `sub-study ${String(s.id)}`;
    return (byName.get(n)?.length ?? 0) > 1 ? `sub-study ${n} (id ${String(s.id)})` : `sub-study ${n}`;
  };
}

// ─── Elements ────────────────────────────────────────────────────────────────

function biomarkerElements(scope: string, s: SubStudy): MasterProtocolElement[] {
  if (s.biomarker === null) {
    return [{ scope, element: 'Biomarker', stated: true, detail: 'stated: the sub-study population is not biomarker-defined', gap: null }];
  }
  if (!present(s.biomarker)) return [unstated(scope, 'Biomarker')];
  return [element(scope, 'Biomarker', s.biomarker), element(scope, 'Biomarker assay', s.biomarkerAssay)];
}

function subStudyElements(subs: SubStudy[], biomarkerDesign: boolean, scopeOf: (s: SubStudy) => string): MasterProtocolElement[] {
  return subs.flatMap((s) => {
    const scope = scopeOf(s);
    const arms = armsOf(s);
    const out = [
      element(scope, 'Population', s.population),
      arms.length ? { scope, element: 'Arms', stated: true, detail: arms.join(', '), gap: null } : unstated(scope, 'Arms'),
      element(scope, 'Decision rule', s.decisionRule),
    ];
    return biomarkerDesign ? [...out, ...biomarkerElements(scope, s)] : out;
  });
}

function sharedControlElement(plan: Plan): MasterProtocolElement {
  const name = 'Shared control arm';
  if (plan.sharedControlArm === null) return { scope: ACROSS, element: name, stated: true, detail: 'stated: no shared control arm', gap: null };
  if (!present(plan.sharedControlArm)) return unstated(ACROSS, name);
  return { scope: ACROSS, element: name, stated: true, detail: `arm "${plan.sharedControlArm.trim()}"`, gap: null };
}

const NCC_DETAIL: Readonly<Record<string, string>> = {
  not_used: 'comparisons use concurrent controls only',
  used_with_time_adjustment: 'non-concurrent controls used, with a pre-specified time-trend adjustment (an adjustment may not remove the bias from changes over time)',
  used: 'non-concurrent controls used with no stated time-trend adjustment',
};

const NCC_JUSTIFICATION_GAP =
  `${ACROSS}: Justification for non-concurrent controls not stated — FDA's master-protocol draft guidance expects primary comparisons against ` +
  'concurrently eligible, concurrently randomized controls; non-concurrent control data need a rationale discussed with FDA at the planning stage';

/** Asked whenever a shared control exists; a recorded use of non-concurrent controls is reported with or without one. */
function nonConcurrentElements(plan: Plan): MasterProtocolElement[] {
  const name = 'Use of non-concurrent controls';
  const v = plan.nonConcurrentControls;
  if (!present(plan.sharedControlArm) && v !== 'used' && v !== 'used_with_time_adjustment') return [];
  if (typeof v !== 'string' || !Object.hasOwn(NCC_DETAIL, v)) return [unstated(ACROSS, name)];
  const use: MasterProtocolElement = { scope: ACROSS, element: name, stated: true, detail: NCC_DETAIL[v], gap: null };
  if (v === 'not_used') return [use];
  const why = 'Justification for non-concurrent controls';
  const j = plan.nonConcurrentControlsJustification;
  return [use, present(j) ? element(ACROSS, why, j) : { ...unstated(ACROSS, why), gap: NCC_JUSTIFICATION_GAP }];
}

function dmcElement(design: StudyDesign): MasterProtocolElement {
  const name = 'Data monitoring committee (charter)';
  const charter = design.safety?.dmcCharter?.present;
  if (charter === true) {
    return { scope: ACROSS, element: name, stated: true, detail: 'DMC charter recorded; whether the committee is independent is not recorded', gap: null };
  }
  if (charter === false) {
    return {
      scope: ACROSS,
      element: name,
      stated: true,
      detail: 'stated: no DMC charter',
      gap: `${ACROSS}: ${name} — the design states there is no DMC charter; FDA's 2022 master-protocol guidance recommends an independent data monitoring committee`,
    };
  }
  return unstated(ACROSS, name);
}

function crossElements(plan: Plan, design: StudyDesign): MasterProtocolElement[] {
  return [
    sharedControlElement(plan),
    ...nonConcurrentElements(plan),
    element(ACROSS, 'Adding an arm or sub-study', plan.armAdditionProcedure),
    element(ACROSS, 'Dropping an arm', plan.armDroppingRules),
    element(ACROSS, 'Type I error across sub-studies', plan.multiplicityAcrossSubStudies),
    dmcElement(design),
  ];
}

// ─── Integrity ───────────────────────────────────────────────────────────────

function repeatDefects(subs: SubStudy[]): string[] {
  const out: string[] = [];
  for (const [id, xs] of countBy(subs, (s) => String(s.id))) if (xs.length > 1) out.push(`sub-study id "${id}" is used ${xs.length === 2 ? 'twice' : `${xs.length} times`}`);
  for (const [name, xs] of countBy(subs, nameOf)) {
    if (xs.length > 1) out.push(`sub-study name "${name}" is used by ${xs.length} sub-studies (ids ${xs.map((s) => String(s.id)).join(', ')})`);
  }
  return out;
}

function armDefects(subs: SubStudy[], design: StudyDesign, scopeOf: (s: SubStudy) => string): string[] {
  const armNames = designArmNames(design);
  const out: string[] = [];
  for (const s of subs) {
    const arms = armsOf(s);
    for (const [a, xs] of countBy(arms, (x) => x)) if (xs.length > 1) out.push(`${scopeOf(s)} lists arm "${a}" ${xs.length} times`);
    for (const a of new Set(arms)) if (!armNames.has(a)) out.push(`${scopeOf(s)} names arm "${a}", which the design does not carry`);
  }
  return out;
}

function sharedControlDefects(plan: Plan, subs: SubStudy[], design: StudyDesign): string[] {
  if (!present(plan.sharedControlArm)) return [];
  const shared = plan.sharedControlArm.trim();
  const out: string[] = [];
  if (!designArmNames(design).has(shared)) out.push(`the shared control arm "${shared}" is not an arm of the design`);
  const compared = [...new Set(subs.filter((s) => armsOf(s).includes(shared)).flatMap((s) => armsOf(s).filter((a) => a !== shared)))];
  if (compared.length < 2) {
    const which = compared.length ? ` (${compared.join(', ')})` : '';
    out.push(`the shared control arm "${shared}" is compared against ${compared.length} arm${compared.length === 1 ? '' : 's'}${which}: a shared control needs at least two arms compared against it`);
  }
  return out;
}

function integrityOf(plan: Plan, subs: SubStudy[], malformed: number, design: StudyDesign, scopeOf: (s: SubStudy) => string): string[] {
  const out = malformed ? [`${malformed} sub-study entr${malformed === 1 ? 'y is' : 'ies are'} not a record, so not checked`] : [];
  out.push(...repeatDefects(subs), ...armDefects(subs, design, scopeOf), ...sharedControlDefects(plan, subs, design));
  if (plan.nonConcurrentControls === 'used') {
    out.push('non-concurrent controls are used with no pre-specified time-trend adjustment: the comparison is open to bias from changes over time in the population and the standard of care');
  }
  return out;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function notChecked(sd: StructuralDesign | null, design: StudyDesign): MasterProtocolCheck | null {
  const base = { structuralDesign: sd, basis: MASTER_PROTOCOL_BASIS, elements: [], integrity: [] };
  if (sd === null) {
    return { ...base, status: 'missing', gaps: ['the structural design is not recorded: whether the design is a master protocol, and so what it must state, cannot be decided'], notes: [] };
  }
  if (!MASTER_DESIGNS.has(sd)) {
    const notes = [`structural design "${sd}" is not a master protocol`];
    if (design.masterProtocol !== undefined && design.masterProtocol !== null) notes.push(`a master-protocol plan is recorded, but the structural design "${sd}" is not a master protocol: the plan is not checked`);
    return { ...base, status: 'not_applicable', gaps: [], notes };
  }
  const plan = design.masterProtocol as unknown;
  if (!isRecord(plan) || !Array.isArray(plan.subStudies)) {
    return { ...base, status: 'missing', gaps: [`a ${sd} design with no list of sub-studies recorded: none of the master-protocol elements can be checked`], notes: [] };
  }
  if (plan.subStudies.length === 0) {
    return { ...base, status: 'missing', gaps: [`a ${sd} design with no sub-studies recorded: none of the master-protocol elements can be checked`], notes: [] };
  }
  return null;
}

/** Check the design's master-protocol plan. Structural checks only; no statistic is computed. */
export function checkMasterProtocol(design: StudyDesign): MasterProtocolCheck {
  const recorded = design.framework?.structuralDesign;
  const sd = typeof recorded === 'string' && recorded.length > 0 ? recorded : null;
  const early = notChecked(sd, design);
  if (early) return early;
  const plan = design.masterProtocol as unknown as Plan;
  const raw = plan.subStudies as unknown[];
  const subs = raw.filter(isRecord) as unknown as SubStudy[];
  const scopeOf = scopeLabeller(subs);
  const elements = [...subStudyElements(subs, BIOMARKER_DESIGNS.has(sd), scopeOf), ...crossElements(plan, design)];
  const integrity = integrityOf(plan, subs, raw.length - subs.length, design, scopeOf);
  const gaps = [...elements.flatMap((e) => (e.gap === null ? [] : [e.gap])), ...integrity];
  return { structuralDesign: sd, basis: MASTER_PROTOCOL_BASIS, status: gaps.length ? 'partial' : 'rendered', gaps, elements, integrity, notes: [] };
}
