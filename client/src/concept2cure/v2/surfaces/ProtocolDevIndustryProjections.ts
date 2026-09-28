/**
 * Protocol development — the industry-gap projections of the bound study design.
 *
 * docs/design/PROTOCOL_INDUSTRY_GAPS.md Tier 1: ICH M11 §1.2 trial schema,
 * SPIRIT 2013 conformance, ICH E6(R3) critical-to-quality factors, the CDISC
 * USDM-shaped export, the decentralised-element profile and the WHO Trial
 * Registration Data Set. Each is served by the deterministic engine at
 * `GET /api/study-design/:studyId/<path>` — the same engine AnA's tools reach
 * through `protocol-industry-service.ts` — and each normalizer below only
 * RE-SHAPES what the engine returned for the shared projection pane:
 *
 *   • no count or share is computed here; the engine's own summary is
 *     printed as it came, and a share the engine returns is only formatted
 *     as a percentage beside the numerator and denominator it came from;
 *   • absent is never rendered as zero, "site" or "met" — `not_assessable`,
 *     `unstated`, `missing` and a null share are printed as themselves;
 *   • `unverified` stays `unverified`: the USDM export's conformance status is
 *     printed verbatim in the note;
 *   • the trial-schema SVG is shown as an <img> data URI, never injected into
 *     the DOM, so nothing in a design title can run as markup.
 *
 * @module client/src/concept2cure/v2/surfaces/ProtocolDevIndustryProjections
 */
import type { ProjectionSpec, ProjectionView } from './ProtocolDevProjections';

type Obj = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? '' : String(v));
const rows = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);
const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'not recorded');

/* ── ICH M11 §1.2 trial schema ──────────────────────────────────────────── */

function milestoneText(m: Obj): string {
  const day = typeof m.studyDay === 'number' ? `day ${m.studyDay}` : 'study day not recorded';
  const win = typeof m.windowDays === 'number' ? ` ±${m.windowDays}` : '';
  return `${str(m.name)} (${day}${win})${m.isBaseline ? ' — baseline' : ''}`;
}

export function trialSchemaView(payload: Obj): ProjectionView {
  const ts = (payload.trialSchema ?? {}) as Obj;
  const model = (ts.model ?? {}) as Obj;
  const r = (model.randomization ?? {}) as Obj;
  const svg = typeof ts.svg === 'string' && ts.svg ? ts.svg : null;
  const epochs = rows(model.epochs).map((e) => ({
    key: 'epoch:' + str(e.id),
    label: `Epoch — ${str(e.name)}`,
    status: str(e.kind),
    text: rows(e.milestones).map(milestoneText).join('\n') || 'No visit recorded in this epoch.',
    gaps: [],
  }));
  const arms = rows(model.arms).map((a) => ({
    key: 'arm:' + str(a.name),
    label: `Arm — ${str(a.name)}`,
    status: '',
    text: str(a.label),
    gaps: [],
  }));
  const randomisation = r.present
    ? `Randomised${Array.isArray(r.ratio) ? ` ${(r.ratio as unknown[]).map(str).join(':')}` : ''}${r.blinding ? `, ${str(r.blinding)} blind` : ''}.`
    : 'The design records no randomisation.';
  return {
    standard: str(ts.basis),
    percent: null,
    status: str(ts.status),
    gaps: strings(ts.gaps),
    note: [randomisation, ...strings(model.notDrawn).map((n) => `Not drawn: ${n}`)].join(' '),
    entries: [...epochs, ...arms],
    figure: svg ? { svg, alt: `Trial schema: ${str(model.title)}` } : undefined,
  };
}

/* ── SPIRIT 2013 ────────────────────────────────────────────────────────── */

export function spiritView(payload: Obj): ProjectionView {
  const sp = (payload.spirit ?? {}) as Obj;
  const s = (sp.summary ?? {}) as Obj;
  return {
    standard: str(sp.basis),
    percent: null,
    gaps: [],
    note:
      `Engine summary — met ${num(s.met)}, partial ${num(s.partial)}, missing ${num(s.missing)}, ` +
      `not assessable ${num(s.notAssessable)}, of ${num(s.total)} checklist rows.` +
      (sp.documentProvided ? '' : ' Read from the design alone: rows only a protocol section can evidence are not assessable here, not missing.'),
    entries: rows(sp.items).map((i) => ({
      key: 'spirit:' + str(i.item),
      label: `${str(i.item)}. ${str(i.title)}`,
      status: str(i.status),
      text: strings(i.evidence).join('\n'),
      gaps: i.gap ? [str(i.gap)] : [],
    })),
  };
}

/* ── ICH E6(R3) critical-to-quality factors ─────────────────────────────── */

export function ctqView(payload: Obj): ProjectionView {
  const c = (payload.ctq ?? {}) as Obj;
  const factors = rows(c.factors);
  return {
    standard: str(c.basis),
    percent: null,
    gaps: strings(c.notAssessed),
    note:
      `${factors.length} factor(s) derived from the design. Every likelihood and impact is a default seed from the ` +
      'category table, not an assessment — the RACT owner rates them.',
    entries: factors.map((f, i) => {
      const from = (f.derivedFrom ?? {}) as Obj;
      return {
        key: `ctq:${i}:${str(f.ctqFactor)}`,
        label: str(f.ctqFactor),
        status: str(f.category),
        text:
          `${str(f.riskDescription)}\nDerived from ${str(from.kind)}: ${str(from.ref)}\n` +
          `Seed likelihood ${num(f.likelihood)} × impact ${num(f.impact)} (${str(f.ratingSource)})` +
          `${f.isCritical ? ' · critical' : ''}\nMitigation: ${str(f.mitigation)}`,
        gaps: [],
      };
    }),
  };
}

/* ── CDISC USDM-shaped export ────────────────────────────────────────────── */

/** One entry per entity list of the exported study design: ids and names, as exported. */
function usdmEntityEntry(kind: string, list: unknown): { key: string; label: string; status: string; text: string; gaps: string[] } {
  const items = rows(list);
  return {
    key: 'usdm:' + kind,
    label: kind,
    status: '',
    text: items.length ? items.map((i) => `${str(i.id)} — ${str(i.name ?? i.text)}`).join('\n') : 'None exported.',
    gaps: [],
  };
}

export function usdmView(payload: Obj): ProjectionView {
  const u = (payload.usdm ?? {}) as Obj;
  const c = (u.conformance ?? {}) as Obj;
  const version = rows(((u.study ?? {}) as Obj).versions)[0] ?? {};
  const sd = rows(version.studyDesigns)[0] ?? {};
  const unmapped = strings(u.unmappedDesignFields);
  return {
    standard: str(c.standard) || str(u.basis),
    percent: null,
    // The engine's conformance status, verbatim — always "unverified" today.
    status: str(c.status),
    gaps: strings(u.unfilledUsdmEntities),
    note: `Conformance ${str(c.status) || 'not stated'}: ${str(c.reason)} Download the JSON for the full object graph.`,
    entries: [
      usdmEntityEntry('StudyArm', sd.arms),
      usdmEntityEntry('StudyEpoch', sd.epochs),
      usdmEntityEntry('Encounter', sd.encounters),
      usdmEntityEntry('Activity', sd.activities),
      usdmEntityEntry('Objective', sd.objectives),
      usdmEntityEntry('Estimand', sd.estimands),
      usdmEntityEntry('StudyIntervention', sd.studyInterventions),
      { key: 'usdm:unmapped', label: 'Design fields with no USDM home in this mapping', status: '', text: unmapped.length ? '' : 'None.', gaps: unmapped },
    ],
  };
}

/* ── WHO Trial Registration Data Set ─────────────────────────────────────── */

export function whoIctrpView(payload: Obj): ProjectionView {
  const w = (payload.whoIctrp ?? {}) as Obj;
  const s = (w.summary ?? {}) as Obj;
  return {
    standard: str(w.basis),
    percent: null,
    gaps: [],
    note:
      `Engine summary — rendered ${num(s.rendered)}, partial ${num(s.partial)}, missing ${num(s.missing)}, of ${num(s.total)} items. ` +
      'A projection for registration, not a registration: nothing is submitted to any registry.',
    entries: rows(w.items).map((i) => ({
      key: 'who:' + str(i.number),
      label: `${str(i.number)}. ${str(i.name)}`,
      status: str(i.status),
      text: Array.isArray(i.value) ? strings(i.value).join('\n') : str(i.value),
      gaps: i.gap ? [str(i.gap)] : [],
    })),
  };
}

/* ── Decentralised elements ─────────────────────────────────────────────── */

/** "3 of 8 activities with a stated location (37.5%)" — or, when nothing is
 *  stated, that the share was not assessed. Never 0%. */
function offSiteText(share: Obj): string {
  if (typeof share.value !== 'number') {
    return 'Off-site share not assessed: no activity has a stated location.';
  }
  const pct = Math.round(share.value * 1000) / 10;
  return `Off-site: ${num(share.numerator)} of ${num(share.denominator)} activities with a stated location (${pct}%) — stated locations only; unstated activities are not counted either way.`;
}

export function dctView(payload: Obj): ProjectionView {
  const p = (payload.dctProfile ?? {}) as Obj;
  const m = (p.measures ?? {}) as Obj;
  const findings = rows(p.findings);
  const visits = strings(m.visitsFullyOffSiteCapable);
  return {
    standard: str(p.basis),
    percent: null,
    gaps: strings(p.notAssessed),
    note: [
      `${num(m.activitiesWithStatedLocation)} of ${num(m.activitiesTotal)} activities have a stated location.`,
      offSiteText((m.offSiteShare ?? {}) as Obj),
      visits.length ? `Visits every scheduled activity of which is stated off-site: ${visits.join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    entries: [
      ...findings.map((f, i) => ({
        key: `dct-finding:${i}:${str(f.code)}`,
        label: str(f.code),
        status: str(f.severity),
        text: str(f.message) + (Array.isArray(f.activityIds) && f.activityIds.length ? `\nActivities: ${strings(f.activityIds).join(', ')}` : ''),
        gaps: [],
      })),
      ...rows(p.activities).map((a) => ({
        key: 'dct-activity:' + str(a.activityId),
        label: str(a.name),
        status: str(a.location),
        text: `Category: ${str(a.category)}`,
        gaps: [],
      })),
    ],
  };
}

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
      [sourced('φ1', p.phi1), sourced('φ2', p.phi2), sourced('elimination threshold', p.eliminationThreshold)].join('; ') + '.',
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
    ].filter(Boolean).join(' '),
    entries: rows(d.decisionTable).map((r) => ({
      key: 'boin:' + str(r.n),
      label: `${str(r.n)} patients at the current dose`,
      status: '',
      text:
        `Escalate if DLTs ≤ ${num(r.escalateIfAtMost)} · de-escalate if ≥ ${num(r.deescalateIfAtLeast)} · ` +
        (typeof r.eliminateIfAtLeast === 'number' ? `eliminate if ≥ ${r.eliminateIfAtLeast}` : 'no DLT count eliminates at this n'),
      gaps: [],
    })),
  };
}

/* ── Enrollment forecast (Tier 2) ────────────────────────────────────────── */

const timeOrNotReached = (v: unknown, unit: string): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v} ${unit}s` : 'not reached';

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
        `Target ${num(f.targetN)} patients. Median ${timeOrNotReached(f.median, unit)}; 80% interval ${timeOrNotReached(f.p10, unit)} to ${timeOrNotReached(f.p90, unit)}.`,
        `Probability of reaching the target: ${num(f.probReached)} (${num(f.nSim)} simulations, seed ${num(f.seed)}).`,
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
      c ? `Characteristics of the ${str(c.boundariesEvaluated)} boundaries: type I error ${num(c.typeIError)}; power ${c.power === null ? 'not computed (alpha or power not recorded)' : num(c.power)}.` : '',
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

/** In the order the design document names them. */
export const INDUSTRY_PROJECTIONS: ProjectionSpec[] = [
  {
    id: 'trial-schema', label: 'Trial schema', path: 'trial-schema',
    of: 'A projection of the study design object as the ICH M11 §1.2 trial schema — epochs, randomisation, arms.',
    normalize: trialSchemaView,
  },
  {
    id: 'spirit', label: 'SPIRIT 2013 checklist', path: 'spirit',
    of: 'The study design object judged against the SPIRIT 2013 checklist, row by row. Rows only a protocol section can evidence are not assessable from the design alone.',
    normalize: spiritView,
  },
  {
    id: 'ctq', label: 'Critical-to-quality factors', path: 'ctq',
    of: 'Critical-to-quality factors (ICH E6(R3)) derived from the study design object, each with the design element it came from. Ratings are default seeds.',
    normalize: ctqView,
  },
  {
    id: 'usdm', label: 'USDM export', path: 'usdm',
    of: 'The study design object as a CDISC USDM-shaped object graph. Conformance is unverified: the USDM schema is not vendored, so nothing has been validated against it.',
    normalize: usdmView,
  },
  {
    id: 'dct-profile', label: 'Decentralised elements', path: 'dct-profile',
    of: 'Where each Schedule of Activities activity happens, per the FDA decentralized-elements guidance. An activity with no stated location is unstated — not assumed to be at the site.',
    normalize: dctView,
  },
  {
    id: 'who-ictrp', label: 'WHO registration data set', path: 'who-ictrp',
    of: 'The study design object as the WHO Trial Registration Data Set (24 items). Sponsor, contacts, dates, ethics and results are supplied at registration, not by the design.',
    normalize: whoIctrpView,
  },
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
];
