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
 * Development" (2023) expect the protocol to state, per sub-study, the
 * population, the biomarker and the assay that assigns to it, the arms and the
 * decision rule; and across sub-studies, how a shared control is used
 * (including non-concurrent controls), how arms are added and dropped, and how
 * type I error is handled. This module checks the recorded plan against that
 * list and checks its referential integrity. It computes no statistic.
 *
 * ## The honesty contract
 *  - An element the plan does not record is `not stated`, never assumed.
 *  - A sub-study naming an arm the design does not carry is an integrity
 *    defect, reported with both names.
 *  - Non-concurrent controls used WITHOUT a time-trend adjustment are called
 *    out: the guidance flags exactly that comparison as open to bias.
 *  - Biomarker elements apply to basket and umbrella designs; they are not
 *    demanded of a platform or MAMS design.
 *  - Pure and total; no clock, no model, no DB.
 *
 * @module server/services/study-design/master-protocol
 */

import type { MasterProtocolPlan, StructuralDesign, StudyDesign } from './study-design-types';

export const MASTER_PROTOCOL_BASIS =
  'FDA guidance: Master Protocols: Efficient Clinical Trial Design Strategies To Expedite Development of Oncology Drugs and Biologics (2022); ' +
  'FDA draft guidance: Master Protocols for Drug and Biological Product Development (2023)';

const MASTER_DESIGNS: ReadonlySet<StructuralDesign> = new Set(['platform', 'basket', 'umbrella', 'mams']);
const BIOMARKER_DESIGNS: ReadonlySet<StructuralDesign> = new Set(['basket', 'umbrella']);

export type MasterProtocolStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface MasterProtocolElement {
  scope: string;
  element: string;
  stated: boolean;
  detail: string;
}

export interface MasterProtocolCheck {
  status: MasterProtocolStatus;
  structuralDesign: StructuralDesign | null;
  gaps: string[];
  elements: MasterProtocolElement[];
  /** Referential and structural defects: arms that do not exist, a shared control no sub-study uses. */
  integrity: string[];
  basis: string;
}

const present = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

function element(scope: string, name: string, value: unknown): MasterProtocolElement {
  const ok = present(value);
  return { scope, element: name, stated: ok, detail: ok ? String(value).trim() : 'not stated' };
}

function subStudyElements(plan: MasterProtocolPlan, biomarkerDesign: boolean): MasterProtocolElement[] {
  return plan.subStudies.flatMap((s) => {
    const scope = `sub-study ${s.name || s.id}`;
    const out = [
      element(scope, 'Population', s.population),
      { scope, element: 'Arms', stated: s.arms.length > 0, detail: s.arms.length ? s.arms.join(', ') : 'not stated' },
      element(scope, 'Decision rule', s.decisionRule),
    ];
    if (biomarkerDesign) out.push(element(scope, 'Biomarker', s.biomarker), element(scope, 'Biomarker assay', s.biomarkerAssay));
    return out;
  });
}

function sharedControlElement(plan: MasterProtocolPlan): MasterProtocolElement {
  const scope = 'across sub-studies';
  if (plan.sharedControlArm === undefined) return { scope, element: 'Shared control arm', stated: false, detail: 'not stated' };
  if (plan.sharedControlArm === null) return { scope, element: 'Shared control arm', stated: true, detail: 'stated: no shared control arm' };
  return { scope, element: 'Shared control arm', stated: true, detail: `arm "${plan.sharedControlArm}"` };
}

function nonConcurrentElement(plan: MasterProtocolPlan): MasterProtocolElement | null {
  const scope = 'across sub-studies';
  if (typeof plan.sharedControlArm !== 'string') return null;
  const v = plan.nonConcurrentControls;
  if (!v) return { scope, element: 'Use of non-concurrent controls', stated: false, detail: 'not stated' };
  return {
    scope,
    element: 'Use of non-concurrent controls',
    stated: true,
    detail: v === 'not_used' ? 'comparisons use concurrent controls only'
      : v === 'used_with_time_adjustment' ? 'non-concurrent controls used, with a pre-specified time-trend adjustment'
      : 'non-concurrent controls used with no stated time-trend adjustment',
  };
}

function crossElements(plan: MasterProtocolPlan, design: StudyDesign): MasterProtocolElement[] {
  const scope = 'across sub-studies';
  const nonConcurrent = nonConcurrentElement(plan);
  return [
    sharedControlElement(plan),
    ...(nonConcurrent ? [nonConcurrent] : []),
    element(scope, 'Adding an arm or sub-study', plan.armAdditionProcedure),
    element(scope, 'Dropping an arm', plan.armDroppingRules),
    element(scope, 'Type I error across sub-studies', plan.multiplicityAcrossSubStudies),
    { scope, element: 'Independent data monitoring committee', stated: design.safety?.dmcCharter?.present === true, detail: design.safety?.dmcCharter?.present === true ? 'DMC charter recorded' : 'not stated' },
  ];
}

function integrityOf(plan: MasterProtocolPlan, design: StudyDesign): string[] {
  const armNames = new Set((design.arms ?? []).map((a) => a.name));
  const out: string[] = [];
  const ids = new Set<string>();
  for (const s of plan.subStudies) {
    if (ids.has(s.id)) out.push(`sub-study id "${s.id}" is used twice`);
    ids.add(s.id);
    for (const a of s.arms) if (!armNames.has(a)) out.push(`sub-study ${s.name || s.id} names arm "${a}", which the design does not carry`);
  }
  const shared = plan.sharedControlArm;
  if (typeof shared === 'string') {
    if (!armNames.has(shared)) out.push(`the shared control arm "${shared}" is not an arm of the design`);
    const users = plan.subStudies.filter((s) => s.arms.includes(shared)).length;
    if (users < 2) out.push(`the shared control arm "${shared}" is used by ${users} sub-stud${users === 1 ? 'y' : 'ies'}: a shared control needs at least two`);
  }
  if (plan.nonConcurrentControls === 'used') {
    out.push('non-concurrent controls are used with no pre-specified time-trend adjustment: the guidance flags that comparison as open to bias from changes over time');
  }
  return out;
}

/** Check the design's master-protocol plan. Structural checks only; no statistic is computed. */
export function checkMasterProtocol(design: StudyDesign): MasterProtocolCheck {
  const sd = design.framework?.structuralDesign ?? null;
  const base = { structuralDesign: sd, basis: MASTER_PROTOCOL_BASIS };
  if (!sd || !MASTER_DESIGNS.has(sd)) {
    return { ...base, status: 'not_applicable', gaps: [`structural design "${sd ?? 'not recorded'}" is not a master protocol`], elements: [], integrity: [] };
  }
  const plan = design.masterProtocol;
  if (!plan || plan.subStudies.length === 0) {
    return { ...base, status: 'missing', gaps: [`a ${sd} design with no sub-studies recorded: none of the master-protocol elements can be checked`], elements: [], integrity: [] };
  }
  const elements = [...subStudyElements(plan, BIOMARKER_DESIGNS.has(sd)), ...crossElements(plan, design)];
  const integrity = integrityOf(plan, design);
  const gaps = [...elements.filter((e) => !e.stated).map((e) => `${e.scope}: ${e.element} not stated`), ...integrity];
  return { ...base, status: gaps.length ? 'partial' : 'rendered', gaps, elements, integrity };
}
