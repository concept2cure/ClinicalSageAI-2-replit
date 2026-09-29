/**
 * Protocol development — the planning projections of the bound study design.
 *
 * docs/design/PROTOCOL_INDUSTRY_GAPS.md Tier 2 and Tier 3: BOIN dose
 * escalation, the enrollment forecast, interim-analysis operating
 * characteristics, MMRM sizing, the external-control plan, multiplicity
 * control, and specimens with blood volume. Each view only re-shapes what its
 * engine returned (same contract as ProtocolDevIndustryProjections.ts): no
 * figure is computed here, an engine default is printed with its source, a
 * lower bound is printed as one, and "not known" is never printed as "within".
 *
 * @module client/src/concept2cure/v2/surfaces/ProtocolDevPlanningProjections
 */
import type { ProjectionSpec, ProjectionView } from './ProtocolDevProjections';
import { num, rows, str, strings, type Obj } from './projectionFormat';

/* ── BOIN dose escalation (Tier 2) ───────────────────────────────────────── */

/** "φ1 0.18 (engine default)" — the source is always printed beside the value. */
function sourced(name: string, v: unknown): string {
  const o = (v ?? {}) as Obj;
  return `${name} ${num(o.value)} (${str(o.source) || 'source not stated'})`;
}

export function doseEscalationView(payload: Obj): ProjectionView {
  const d = (payload.doseEscalation ?? {}) as Obj;
  const p = (d.parameters ?? null) as Obj | null;
  const b = (d.boundaries ?? null) as Obj | null;
  const applicability = (d.applicability ?? {}) as Obj;
  const params = p
    ? [
      `Target toxicity ${num(p.targetToxicity)}; cohorts of ${num(p.cohortSize)}; at most ${num(p.maxSampleSize)} patients` +
        (typeof p.stopWhenAtDoseN === 'number' ? `; stop at ${p.stopWhenAtDoseN} at one dose` : '') + '.',
      [
        sourced('φ1', p.phi1), sourced('φ2', p.phi2), sourced('elimination threshold', p.eliminationThreshold),
        ...(p.minEliminationN ? [sourced('minimum n before elimination', p.minEliminationN)] : []),
        ...(p.prior ? [`prior ${str((p.prior as Obj).value)} (${str((p.prior as Obj).source) || 'source not stated'})`] : []),
      ].join('; ') + '.',
      p.startingDose ? `Starting dose: ${str((p.startingDose as Obj).label)}.` : '',
    ].filter(Boolean).join(' ')
    : '';
  return {
    standard: str(d.basis),
    percent: null,
    status: str(d.status),
    gaps: strings(d.gaps),
    note: [
      strings(applicability.reasons).join('; '),
      params,
      b ? `Escalate when the observed DLT rate ≤ λe = ${num(b.lambdaE)}; de-escalate when ≥ λd = ${num(b.lambdaD)}.` : '',
      str(d.mtdSelection),
      str(d.safetyStopping),
    ].filter(Boolean).join(' '),
    entries: rows(d.decisionTable).map((r) => ({
      key: 'boin:' + str(r.n),
      label: `${str(r.n)} patients at the current dose`,
      status: '',
      text:
        `Escalate if DLTs ≤ ${num(r.escalateIfAtMost)} · de-escalate if ≥ ${num(r.deescalateIfAtLeast)} · ` +
        // The engine says why no count eliminates (too few patients, or a cap); fall back only when it does not.
        (typeof r.eliminateIfAtLeast === 'number' ? `eliminate if ≥ ${r.eliminateIfAtLeast}` : str(r.eliminationNote) || 'no DLT count eliminates at this n'),
      gaps: [],
    })),
  };
}

/* ── Enrollment forecast (Tier 2) ────────────────────────────────────────── */

const timeOrNotReached = (v: unknown, unit: string): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v} ${unit}s` : 'not reached';

/**
 * A simulated completion time. The engine reports the median and interval only
 * when every simulation reached the target: a null time with some simulations
 * reaching it is "not reported", never "not reached" and never a number.
 */
function simulatedTime(v: unknown, unit: string, probReached: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return `${v} ${unit}s`;
  return probReached === 0 ? 'not reached' : 'not reported (some simulations never reached the target)';
}

export function enrollmentView(payload: Obj): ProjectionView {
  const e = (payload.enrollment ?? {}) as Obj;
  const f = (e.forecast ?? null) as Obj | null;
  const sites = (e.sites ?? null) as Obj | null;
  const unit = f ? str(f.timeUnit) : '';
  return {
    standard: str(e.basis),
    percent: null,
    status: str(e.status),
    gaps: strings(e.gaps),
    note: f
      ? [
        `Target ${num(f.targetN)} patients. Median ${simulatedTime(f.median, unit, f.probReached)}; ` +
          `80% interval ${simulatedTime(f.p10, unit, f.probReached)} to ${simulatedTime(f.p90, unit, f.probReached)}.`,
        `Probability of reaching the target: ${num(f.probReached)} (${num(f.nSim)} simulations, seed ${num(f.seed)}` +
          (f.seedSource === 'derived_from_inputs' ? ', derived from the inputs because no seed is recorded).' : ').'),
        `Closed-form expectation at the mean rates: ${timeOrNotReached(f.closedFormExpectedTime, unit)}.`,
        str(e.note),
      ].join(' ')
      : str(e.note),
    entries: rows(sites?.byCountry).map((c) => ({
      key: 'country:' + str(c.country),
      label: str(c.country),
      status: '',
      text: `${num(c.sites)} site(s); combined mean rate ${num(c.meanRatePerUnit)} per ${unit || 'time unit'}.`,
      gaps: [],
    })),
  };
}

/* ── Interim-analysis operating characteristics (Tier 2) ─────────────────── */

/** The type I error is one-sided and non-binding; the binding figure, when futility is recorded, is its own number. */
function characteristicsLine(c: Obj): string {
  const binding = typeof c.typeIErrorIfFutilityBinding === 'number' ? `; ${num(c.typeIErrorIfFutilityBinding)} if futility were binding` : '';
  const power = c.power === null ? 'not computed (see the gaps)' : num(c.power);
  return `Characteristics of the ${str(c.boundariesEvaluated)} boundaries: one-sided type I error ${num(c.typeIError)} (futility non-binding)${binding}; power ${power}.`;
}

export function interimOcView(payload: Obj): ProjectionView {
  const i = (payload.interimOc ?? {}) as Obj;
  const c = (i.characteristics ?? null) as Obj | null;
  const eif = (c?.expectedInformationFraction ?? {}) as Obj;
  const ess = (c?.expectedSampleSize ?? null) as Obj | null;
  const discrepancies = rows(i.discrepancies);
  return {
    standard: str(i.basis),
    percent: null,
    status: str(i.status),
    gaps: strings(i.gaps),
    note: [
      Array.isArray(i.schedule) ? `Analyses at information fractions ${strings(i.schedule).join(', ')}.` : '',
      c ? characteristicsLine(c) : '',
      c ? `Expected information fraction ${num(eif.underNull)} under H0, ${eif.underAlternative === null ? 'not computed' : num(eif.underAlternative)} under the alternative.` : '',
      ess ? `Expected sample size ${num(ess.underNull)} under H0, ${ess.underAlternative === null ? 'not computed' : num(ess.underAlternative)} under the alternative.` : '',
      ...strings(i.notes),
    ].filter(Boolean).join(' '),
    entries: [
      ...discrepancies.map((x) => ({
        key: 'discrepancy:' + str(x.look),
        label: `Look ${str(x.look)}: recorded boundary differs from the spending function`,
        status: 'discrepancy',
        text: `Recorded ${num(x.recorded)} · solved ${num(x.solved)} · difference ${num(x.difference)}`,
        gaps: [],
      })),
      ...rows(c?.perLook).map((l) => ({
        key: 'look:' + str(l.look),
        label: `Look ${str(l.look)} at information ${num(l.informationFraction)}`,
        status: '',
        text:
          `Efficacy boundary z ${num(l.efficacyBoundary)}` + (typeof l.futilityBoundary === 'number' ? ` · futility z ${l.futilityBoundary}` : '') +
          `\nP(stop for efficacy) ${num(l.efficacyStopUnderNull)} under H0` +
          (l.efficacyStopUnderAlternative === null ? '' : `, ${num(l.efficacyStopUnderAlternative)} under the alternative`),
        gaps: [],
      })),
    ],
  };
}

/* ── MMRM sizing (Tier 2) ────────────────────────────────────────────────── */

/** "179 per arm" only at 1:1; otherwise each arm's n and where the allocation comes from. */
function armsText(z: Obj): string {
  if (z.allocationRatio === 1 || typeof z.nSecondArm !== 'number') return `${num(z.nPerArm)} per arm`;
  const from = z.allocationSource === 'randomization' ? 'the randomization ratio' : z.allocationSource === 'mmrm_assumptions' ? 'the MMRM assumptions' : 'source not stated';
  return `${num(z.nPerArm)} in the first arm and ${num(z.nSecondArm)} in the second (allocation ${num(z.allocationRatio)}, from ${from})`;
}

export function mmrmView(payload: Obj): ProjectionView {
  const m = (payload.mmrm ?? {}) as Obj;
  const z = (m.sizing ?? null) as Obj | null;
  const pvr = (m.plannedVsRequired ?? null) as Obj | null;
  return {
    standard: str(m.basis),
    percent: null,
    status: str(m.status),
    gaps: strings(m.gaps),
    note: [
      m.endpointName ? `Endpoint: ${str(m.endpointName)}.` : '',
      z ? `Required: ${armsText(z)}, ${num(z.nTotal)} in total (two-sided alpha ${num(z.alphaTwoSided)}); achieved power ${num(z.achievedPower)}.` : '',
      z ? `Variance factor ${num(z.varianceFactor)}; efficiency over a completers-only analysis ${num(z.efficiencyVsCompleters)}.` : '',
      pvr ? (pvr.covered ? `The planned ${num(pvr.planned)} covers the requirement.` : `The planned ${num(pvr.planned)} is ${num(pvr.shortfall)} below the requirement.`) : '',
      typeof m.soaVisitCount === 'number' ? `The Schedule of Activities schedules the endpoint at ${m.soaVisitCount} post-baseline visit(s).` : '',
    ].filter(Boolean).join(' '),
    entries: [],
  };
}

/* ── External-control plan (Tier 2) ──────────────────────────────────────── */

export function externalControlView(payload: Obj): ProjectionView {
  const e = (payload.externalControl ?? {}) as Obj;
  const b = (e.borrowing ?? null) as Obj | null;
  const param = (b?.parameter ?? {}) as Obj;
  return {
    standard: str(e.basis),
    percent: null,
    status: str(e.status),
    gaps: strings(e.gaps),
    note: [
      e.kind === 'fully_external' ? 'Fully external control: no concurrent control arm.' : e.kind === 'hybrid' ? 'Hybrid: a concurrent control augmented by external data.' : '',
      b ? `${str(b.method)} (${str(param.name)} = ${num(param.value)}): effective historical N ${num(b.effectiveHistoricalN)}; ` +
        `share of the control's precision borrowed ${num(b.borrowedPrecisionFraction)} at the planned concurrent SE ${num(b.plannedConcurrentSe)}.` : '',
      'No posterior or treatment effect is computed at protocol stage.',
    ].filter(Boolean).join(' '),
    entries: rows(e.elements).map((x) => ({
      key: 'ec:' + str(x.element),
      label: str(x.element),
      status: x.stated ? 'stated' : x.field === null ? 'not recordable yet' : 'not stated',
      text: str(x.detail),
      gaps: [],
    })),
  };
}

/* ── Multiplicity control (Tier 2) ───────────────────────────────────────── */

function fwerText(label: string, r: Obj | null): string {
  if (!r) return '';
  return `${label}: family-wise error ${num(r.fwer)} (Monte Carlo SE ${num(r.monteCarloSe)})` +
    (typeof r.controlled === 'boolean' ? (r.controlled ? ' — controlled at alpha.' : ' — NOT controlled at alpha.') : '.');
}

/** What was simulated, when the engine says: the recorded allocation, or the textbook split in its absence. */
function procedureLabel(p: Obj | null): string {
  const what = p?.simulated === 'recorded_allocation' ? 'the recorded allocation' : p?.simulated === 'textbook_split' ? 'its textbook split (no allocation recorded)' : null;
  return what ? `Named procedure, ${what}, spending ${num(p?.level)}` : 'Named procedure';
}

export function multiplicityView(payload: Obj): ProjectionView {
  const m = (payload.multiplicity ?? {}) as Obj;
  return {
    standard: str(m.basis),
    percent: null,
    status: str(m.status),
    gaps: strings(m.gaps),
    note: [
      m.method ? `Procedure: ${str(m.method)} at alpha ${num(m.alpha)}.` : '',
      fwerText(procedureLabel((m.procedure ?? null) as Obj | null), (m.procedure ?? null) as Obj | null),
      fwerText('Each hypothesis at full alpha', (m.unadjusted ?? null) as Obj | null),
      ...strings(m.notes),
    ].filter(Boolean).join(' '),
    entries: strings(m.family).map((f, i) => ({ key: `family:${i}`, label: f, status: 'confirmatory', text: '', gaps: [] })),
  };
}

/* ── Biospecimens and blood volume (Tier 3) ─────────────────────────────── */

const known = (v: unknown, suffix: string): string => (typeof v === 'number' ? `${v}${suffix}` : 'not computable');

export function biospecimenView(payload: Obj): ProjectionView {
  const p = (payload.biospecimens ?? {}) as Obj;
  const b = (p.bloodVolume ?? null) as Obj | null;
  const refs = rows(b?.referencePoints);
  return {
    standard: str(p.basis),
    percent: null,
    status: str(p.status),
    gaps: strings(p.gaps),
    note: b
      ? [
        `Blood per participant: ${num(b.totalScheduledMl)} mL scheduled${b.scheduledIsLowerBound ? ' (a lower bound)' : ''}, ` +
          `up to ${num(b.totalUpperBoundMl)} mL with conditional and unscheduled draws${b.totalsAreLowerBounds ? ' (a lower bound)' : ''}` +
          (typeof b.unscheduledMl === 'number' && b.unscheduledMl > 0 ? `, of which ${b.unscheduledMl} mL at unscheduled visits (counted once each).` : '.'),
        // Under lower-bound totals, the window is a lower bound too, and is printed as one.
        `Worst 8-week window: ${b.totalsAreLowerBounds && typeof b.maxEightWeekScheduledMl === 'number' ? `at least ${b.maxEightWeekScheduledMl} mL (lower bound)` : known(b.maxEightWeekScheduledMl, ' mL')}; ` +
          `most scheduled draw visits in one week: ${known(b.maxDrawVisitsInAnyWeek, '')}` +
          (typeof b.maxDrawVisitsInAnyWeekUpperBound === 'number' ? `, up to ${b.maxDrawVisitsInAnyWeekUpperBound} with conditional draws.` : '.'),
        ...refs.map((r) => `Reference ${num(r.eightWeekLimitMl)} mL / 8 weeks (${str(r.appliesTo)}): ` +
          (r.exceededScheduled === null ? `not known${r.withinUnknownBecause ? ` — ${str(r.withinUnknownBecause)}` : ''}.` : r.exceededScheduled ? 'above.' : 'within.')),
        str(b.meaning),
        b.countingRule ? `Counting rule: ${str(b.countingRule)}.` : '',
        ...strings(p.notes),
      ].filter(Boolean).join(' ')
      : strings(p.notes).join(' '),
    entries: rows(p.specimens).map((s) => {
      const sp = (s.specimen ?? null) as Obj | null;
      return {
        key: 'specimen:' + str(s.activityId),
        label: str(s.name),
        status: sp ? str(sp.type) : 'unspecified',
        text: sp ? [sp.volumeMl ? `${num(sp.volumeMl)} mL` : '', str(sp.processing), str(sp.storage), str(sp.retention)].filter(Boolean).join(' · ') : '',
        gaps: strings(s.unspecified).map((u) => `${u} not specified`),
      };
    }),
  };
}

/* ── Master protocol (Tier 3) ─────────────────────────────────────────────── */

export function masterProtocolView(payload: Obj): ProjectionView {
  const m = (payload.masterProtocol ?? {}) as Obj;
  return {
    standard: str(m.basis),
    percent: null,
    status: str(m.status),
    gaps: strings(m.gaps),
    note: [
      `Structural design: ${str(m.structuralDesign) || 'not recorded'}. A structural check — no statistic is computed and no stated rule is judged adequate.`,
      ...strings(m.notes),
    ].join(' '),
    entries: rows(m.elements).map((e, i) => ({
      key: `mp:${i}`,
      label: `${str(e.scope)} — ${str(e.element)}`,
      status: e.stated ? 'stated' : 'not stated',
      text: str(e.detail),
      gaps: [],
    })),
  };
}

/** Tier 2 in the design document's order, then Tier 3. */
export const PLANNING_PROJECTIONS: ProjectionSpec[] = [
  {
    id: 'dose-escalation', label: 'Dose escalation (BOIN)', path: 'dose-escalation',
    of: 'The study design object’s dose-escalation rules, computed by the BOIN engine (Liu & Yuan 2015). A value marked engine default was not chosen by the sponsor.',
    normalize: doseEscalationView,
  },
  {
    id: 'enrollment', label: 'Enrollment forecast', path: 'enrollment',
    of: 'Time to the planned sample size from the sponsor’s site accrual plan, by the Poisson–Gamma engine. Site rates are sponsor inputs; none is assumed.',
    normalize: enrollmentView,
  },
  {
    id: 'interim-oc', label: 'Interim analysis characteristics', path: 'interim-oc',
    of: 'Type I error, power and expected sample size of the study design object’s interim plan, computed exactly. A recorded boundary that departs from the spending function is shown as a discrepancy.',
    normalize: interimOcView,
  },
  {
    id: 'mmrm', label: 'MMRM sample size', path: 'mmrm',
    of: 'The sample size the MMRM-analysed endpoint needs under the sponsor’s recorded assumptions, checked against the planned N. No assumption is supplied when one is missing.',
    normalize: mmrmView,
  },
  {
    id: 'external-control', label: 'External-control plan', path: 'external-control',
    of: 'What the study design object pre-specifies about borrowing from an external control, and how strongly it borrows (FDA 2023 draft guidance).',
    normalize: externalControlView,
  },
  {
    id: 'multiplicity', label: 'Multiplicity control', path: 'multiplicity',
    of: 'Whether the study design object’s multiplicity procedure holds the family-wise error at alpha over its confirmatory endpoints, by seeded simulation.',
    normalize: multiplicityView,
  },
  {
    id: 'biospecimens', label: 'Specimens and blood volume', path: 'biospecimens',
    of: 'What the Schedule of Activities collects, what the lab manual still needs, and how much blood a participant gives. Reference points are expedited-review thresholds, not safety limits.',
    normalize: biospecimenView,
  },
  {
    id: 'master-protocol', label: 'Master protocol structure', path: 'master-protocol',
    of: 'For a platform, basket, umbrella or MAMS design: what the plan states per sub-study and across them, against FDA’s master-protocol guidances.',
    normalize: masterProtocolView,
  },
];
