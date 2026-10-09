/**
 * Tests for the decentralised-trial (DCT) profile of the Schedule of Activities.
 * The profile renders only the locations the SoA (or an explicit map) states: an
 * unstated activity is never counted as site and is excluded from the off-site
 * share's denominator, a share with nothing stated is null (not 0), a visit is
 * fully off-site capable only when every scheduled activity is stated off-site,
 * each of the four findings fires on its trigger and on nothing else, and a
 * structural defect (a duplicated id, a cell naming an undefined visit, a visit
 * with no defined epoch) is reported and never guessed through.
 */

import { describe, it, expect } from 'vitest';
import {
  profileDecentralization,
  locationsFromSoa,
  isSoaActivityLocation,
  SOA_ACTIVITY_LOCATIONS,
  DCT_PROFILE_BASIS,
  type DctProfile,
  type SoaActivityLocation,
} from '../dct-profile';
import { type ScheduleOfActivities, type SoaActivity, type SoaActivityCategory } from '../study-design-types';

const OFF_SITE: SoaActivityLocation[] = ['home', 'local_provider', 'local_lab', 'telehealth', 'mobile_unit'];

function act(id: string, category: SoaActivityCategory, order: number, location?: SoaActivityLocation): SoaActivity {
  return { id, name: `Activity ${id}`, category, order, ...(location ? { location } : {}) };
}

/**
 * Screening → treatment → follow-up.
 *   V3 (Week 4) and V5 (Follow-up) schedule only stated off-site activities.
 *   V4 (Week 8) schedules an unstated activity (a_hba1c, conditional).
 *   Follow-up's safety is all off-site; treatment's includes site vitals.
 */
function dctSoa(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 1 },
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 2 },
    ],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -14, order: 0 },
      { id: 'V2', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 1 },
      { id: 'V3', name: 'Week 4', epochId: 'e_trt', studyDay: 29, order: 2 },
      { id: 'V4', name: 'Week 8', epochId: 'e_trt', studyDay: 57, order: 3 },
      { id: 'V5', name: 'Follow-up', epochId: 'e_fu', studyDay: 85, order: 4 },
    ],
    activities: [
      act('a_consent', 'administrative', 0, 'telehealth'),
      act('a_elig', 'eligibility', 1, 'site'),
      act('a_dose', 'drug_administration', 2, 'site'),
      act('a_vitals', 'safety', 3, 'site'),
      act('a_labs', 'safety', 4, 'local_lab'),
      act('a_aeq', 'safety', 5, 'telehealth'),
      act('a_pro', 'patient_reported', 6, 'home'),
      act('a_pk', 'pk', 7, 'site'),
      act('a_hba1c', 'efficacy', 8),
    ],
    cells: [
      { activityId: 'a_consent', visitId: 'V1', state: 'performed' },
      { activityId: 'a_elig', visitId: 'V1', state: 'performed' },
      { activityId: 'a_vitals', visitId: 'V1', state: 'performed' },
      { activityId: 'a_labs', visitId: 'V1', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V2', state: 'performed' },
      { activityId: 'a_vitals', visitId: 'V2', state: 'performed' },
      { activityId: 'a_pk', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
      { activityId: 'a_labs', visitId: 'V3', state: 'performed' },
      { activityId: 'a_aeq', visitId: 'V3', state: 'performed' },
      { activityId: 'a_pro', visitId: 'V3', state: 'performed' },
      { activityId: 'a_aeq', visitId: 'V4', state: 'performed' },
      { activityId: 'a_pro', visitId: 'V4', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V4', state: 'conditional' },
      { activityId: 'a_aeq', visitId: 'V5', state: 'performed' },
      { activityId: 'a_labs', visitId: 'V5', state: 'optional' },
    ],
  };
}

/** One treatment epoch with one visit V1 — the base for the structural-defect cases. */
function oneVisitSoa(activities: SoaActivity[], cells: ScheduleOfActivities['cells']): ScheduleOfActivities {
  return {
    epochs: [{ id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 0 }],
    visits: [{ id: 'V1', name: 'Day 1', epochId: 'e_trt', order: 0 }],
    activities,
    cells,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function reversed(soa: ScheduleOfActivities): ScheduleOfActivities {
  const r = clone(soa);
  r.activities.reverse();
  r.visits.reverse();
  r.epochs.reverse();
  r.cells.reverse();
  return r;
}

/** Set (or, with undefined, remove) an activity's location attribute; `unknown` so invalid values can be tested. */
function setLoc(soa: ScheduleOfActivities, id: string, location: unknown): ScheduleOfActivities {
  const activity = soa.activities.find(a => a.id === id);
  if (!activity) throw new Error(`no activity ${id}`);
  if (location === undefined) delete activity.location;
  else Object.assign(activity, { location });
  return soa;
}

function codes(p: DctProfile): string[] {
  return p.findings.map(f => f.code);
}

function findingsFor(p: DctProfile, code: string) {
  return p.findings.filter(f => f.code === code);
}

describe('vocabulary and basis', () => {
  it('declares the six locations and the regulatory basis', () => {
    expect([...SOA_ACTIVITY_LOCATIONS]).toEqual(['site', 'home', 'local_provider', 'local_lab', 'telehealth', 'mobile_unit']);
    expect(DCT_PROFILE_BASIS).toBe(
      'FDA guidance: Conducting Clinical Trials With Decentralized Elements (2024); ' +
        'EMA/HMA/EC recommendation paper on decentralised elements in clinical trials (2022)',
    );
    expect(profileDecentralization(dctSoa()).basis).toBe(DCT_PROFILE_BASIS);
    expect(isSoaActivityLocation('home')).toBe(true);
    expect(isSoaActivityLocation('Home')).toBe(false);
    expect(isSoaActivityLocation('unstated')).toBe(false);
  });
});

describe('locationsFromSoa', () => {
  it('reads only members of the vocabulary and ignores anything else', () => {
    const soa = dctSoa();
    setLoc(soa, 'a_elig', 'clinic');
    setLoc(soa, 'a_dose', 'HOME');
    setLoc(soa, 'a_vitals', 42);
    setLoc(soa, 'a_labs', null);
    setLoc(soa, 'a_pk', { where: 'site' });
    expect(locationsFromSoa(soa)).toEqual({ a_consent: 'telehealth', a_aeq: 'telehealth', a_pro: 'home' });
  });

  it('defines an id of "__proto__" as an own key, never on the prototype', () => {
    const soa: ScheduleOfActivities = { epochs: [], visits: [], cells: [], activities: [act('__proto__', 'safety', 0, 'home')] };
    const map = locationsFromSoa(soa);
    expect(Object.prototype.hasOwnProperty.call(map, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
  });

  it('omits an id defined more than once rather than keeping whichever row came last', () => {
    const rows = [act('a1', 'safety', 0, 'site'), act('a1', 'safety', 1, 'telehealth'), act('a2', 'pk', 2, 'home')];
    expect(locationsFromSoa(oneVisitSoa(rows, []))).toEqual({ a2: 'home' });
    expect(locationsFromSoa(oneVisitSoa([...rows].reverse(), []))).toEqual({ a2: 'home' });
  });
});

describe('off-site share', () => {
  it('counts stated locations only: the unstated activity is in neither numerator nor denominator', () => {
    const p = profileDecentralization(dctSoa());
    expect(p.measures.activitiesTotal).toBe(9);
    expect(p.measures.activitiesWithStatedLocation).toBe(8);
    expect(p.measures.offSiteShare).toEqual({ value: 0.5, numerator: 4, denominator: 8, basis: 'stated locations only' });
    expect(p.activities.find(a => a.activityId === 'a_hba1c')?.location).toBe('unstated');
    expect(p.notAssessed.some(n => n.includes('1 of 9 activities have no stated location (a_hba1c)'))).toBe(true);
  });

  it('never counts an unstated activity as site', () => {
    const soa: ScheduleOfActivities = {
      epochs: [],
      visits: [],
      cells: [],
      activities: [act('a_home', 'efficacy', 0, 'home'), act('a_gap1', 'efficacy', 1), act('a_gap2', 'safety', 2)],
    };
    const p = profileDecentralization(soa);
    expect(p.activities.filter(a => a.location === 'site')).toEqual([]);
    expect(p.activities.map(a => a.location)).toEqual(['home', 'unstated', 'unstated']);
    expect(p.measures.offSiteShare.denominator).toBe(1);
    expect(p.measures.offSiteShare.value).toBe(1);
  });

  it('is null — not 0 — with a stated reason when no activity has a stated location', () => {
    const soa = dctSoa();
    for (const a of soa.activities) setLoc(soa, a.id, undefined);
    const p = profileDecentralization(soa);
    expect(p.measures.activitiesWithStatedLocation).toBe(0);
    expect(p.measures.offSiteShare.value).toBeNull();
    expect(p.measures.offSiteShare.numerator).toBe(0);
    expect(p.measures.offSiteShare.denominator).toBe(0);
    expect(p.notAssessed.some(n => n.includes('No activity has a stated location'))).toBe(true);
    expect(p.measures.visitsFullyOffSiteCapable).toEqual([]);
    expect(p.findings).toEqual([]);
  });

  it('is 0 only when locations are stated and all are site', () => {
    const soa = dctSoa();
    for (const a of soa.activities) setLoc(soa, a.id, 'site');
    const p = profileDecentralization(soa);
    expect(p.measures.offSiteShare).toEqual({ value: 0, numerator: 0, denominator: 9, basis: 'stated locations only' });
  });
});

describe('absent or empty Schedule of Activities', () => {
  it.each([null, undefined])('%s SoA → empty profile that names the missing SoA', soa => {
    const p = profileDecentralization(soa, { a_x: 'home' });
    expect(p.activities).toEqual([]);
    expect(p.measures).toEqual({
      activitiesTotal: 0,
      activitiesWithStatedLocation: 0,
      offSiteShare: { value: null, numerator: 0, denominator: 0, basis: 'stated locations only' },
      visitsFullyOffSiteCapable: [],
    });
    expect(p.findings).toEqual([]);
    expect(p.notAssessed).toEqual(['No Schedule of Activities is attached; the decentralisation profile cannot be assessed.']);
  });

  it('an SoA with no activities has a null share and says so', () => {
    const p = profileDecentralization({ epochs: [], visits: [], activities: [], cells: [] });
    expect(p.measures.offSiteShare.value).toBeNull();
    expect(p.notAssessed[0]).toContain('lists no activities');
  });
});

describe('DCT-IMP-OFFSITE', () => {
  it.each(OFF_SITE)('warns for drug administration at %s, with the visits it is scheduled at', loc => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_dose', loc));
    const [f, ...rest] = findingsFor(p, 'DCT-IMP-OFFSITE');
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ severity: 'warning', activityIds: ['a_dose'], visitIds: ['V2'] });
    expect(f.message).toContain('reaches that location');
    expect(f.message).toContain('accountability');
  });

  it('words the message for where the product goes', () => {
    const at = (loc: SoaActivityLocation) =>
      findingsFor(profileDecentralization(setLoc(dctSoa(), 'a_dose', loc)), 'DCT-IMP-OFFSITE')[0].message;
    expect(at('home')).toContain("at the participant's home");
    expect(at('home')).toContain('direct-to-participant shipment');
    expect(at('telehealth')).toContain('direct-to-participant shipment');
    expect(at('local_provider')).toContain('shipment to the local health-care provider');
    expect(at('mobile_unit')).toContain('transport by the mobile unit');
  });

  it('does not fire for drug administration at the site', () => {
    expect(codes(profileDecentralization(dctSoa()))).not.toContain('DCT-IMP-OFFSITE');
  });

  it('does not fire for a non-drug activity at home', () => {
    const p = profileDecentralization(dctSoa());
    expect(p.activities.find(a => a.activityId === 'a_pro')?.location).toBe('home');
    expect(codes(p)).not.toContain('DCT-IMP-OFFSITE');
  });

  it('an unstated drug administration is not assessed rather than clean', () => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_dose', undefined));
    expect(codes(p)).not.toContain('DCT-IMP-OFFSITE');
    expect(p.notAssessed).toContain(
      'DCT-IMP-OFFSITE not assessed for drug-administration activities without a stated location: a_dose.',
    );
  });
});

describe('DCT-SAFETY-REMOTE', () => {
  it('warns for the epoch whose stated safety activities are all off-site, and not for epochs with site safety', () => {
    const p = profileDecentralization(dctSoa());
    const found = findingsFor(p, 'DCT-SAFETY-REMOTE');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warning', activityIds: ['a_labs', 'a_aeq'], visitIds: ['V5'] });
    expect(found[0].message).toContain('"Follow-up"');
  });

  it('fires for the treatment epoch once its site vitals move off-site', () => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_vitals', 'mobile_unit'));
    const epochs = findingsFor(p, 'DCT-SAFETY-REMOTE').map(f => f.visitIds);
    expect(epochs).toEqual([['V1'], ['V2', 'V3', 'V4'], ['V5']]);
  });

  it('still fires when a scheduled safety activity is unstated, and says it was not counted', () => {
    const soa = dctSoa();
    soa.activities.push(act('a_ecg', 'safety', 9));
    soa.cells.push({ activityId: 'a_ecg', visitId: 'V5', state: 'performed' });
    const [f] = findingsFor(profileDecentralization(soa), 'DCT-SAFETY-REMOTE');
    expect(f.activityIds).toEqual(['a_labs', 'a_aeq']);
    expect(f.message).toContain('1 further scheduled safety activity has no stated location (a_ecg) and was not counted');
  });

  it('attributes the finding only to visits that schedule a stated safety activity', () => {
    const soa: ScheduleOfActivities = {
      epochs: [{ id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [
        { id: 'V1', name: 'Day 1', epochId: 'e_trt', order: 0 },
        { id: 'V2', name: 'Day 8', epochId: 'e_trt', order: 1 },
      ],
      activities: [act('s1', 'safety', 0, 'local_lab'), act('s2', 'safety', 1)],
      cells: [
        { activityId: 's1', visitId: 'V1', state: 'performed' },
        { activityId: 's2', visitId: 'V2', state: 'performed' },
      ],
    };
    const [f] = findingsFor(profileDecentralization(soa), 'DCT-SAFETY-REMOTE');
    expect(f).toMatchObject({ activityIds: ['s1'], visitIds: ['V1'] });
  });

  it('an epoch whose scheduled safety activities are all unstated is not assessed', () => {
    const soa = setLoc(setLoc(dctSoa(), 'a_labs', undefined), 'a_aeq', undefined);
    const p = profileDecentralization(soa);
    expect(codes(p)).not.toContain('DCT-SAFETY-REMOTE');
    expect(p.notAssessed.some(n => n.startsWith('DCT-SAFETY-REMOTE not assessed for epoch "Follow-up"'))).toBe(true);
  });

  it('ignores a safety activity at site that is not scheduled in the epoch', () => {
    const soa = dctSoa();
    soa.activities.push(act('a_unsched', 'safety', 9, 'site'));
    expect(findingsFor(profileDecentralization(soa), 'DCT-SAFETY-REMOTE')).toHaveLength(1);
  });
});

describe('DCT-PK-OFFSITE', () => {
  it('warns for PK at home and for a biomarker at a local lab', () => {
    const soa = setLoc(dctSoa(), 'a_pk', 'home');
    soa.activities.push(act('a_bio', 'biomarker', 9, 'local_lab'));
    const found = findingsFor(profileDecentralization(soa), 'DCT-PK-OFFSITE');
    expect(found.map(f => f.activityIds)).toEqual([['a_pk'], ['a_bio']]);
    expect(found.every(f => f.severity === 'warning')).toBe(true);
    expect(found[0].message).toContain('chain of custody');
  });

  it.each(OFF_SITE)('warns for PK at every off-site location: %s', loc => {
    const found = findingsFor(profileDecentralization(setLoc(dctSoa(), 'a_pk', loc)), 'DCT-PK-OFFSITE');
    expect(found.map(f => f.activityIds)).toEqual([['a_pk']]);
  });

  it('says who collects the sample when the contact is by telehealth', () => {
    const [f] = findingsFor(profileDecentralization(setLoc(dctSoa(), 'a_pk', 'telehealth')), 'DCT-PK-OFFSITE');
    expect(f.message).toContain('does not itself collect a sample');
  });

  it('does not fire for PK at the site, or for a PD activity at home', () => {
    const soa = dctSoa();
    soa.activities.push(act('a_pd', 'pd', 9, 'home'));
    expect(codes(profileDecentralization(soa))).not.toContain('DCT-PK-OFFSITE');
  });
});

describe('DCT-CONSENT-REMOTE', () => {
  it('is info for an administrative activity by telehealth', () => {
    const found = findingsFor(profileDecentralization(dctSoa()), 'DCT-CONSENT-REMOTE');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'info', activityIds: ['a_consent'], visitIds: ['V1'] });
    expect(found[0].message).toContain('remote consent');
  });

  it('is info for an eligibility activity by telehealth', () => {
    const found = findingsFor(profileDecentralization(setLoc(dctSoa(), 'a_elig', 'telehealth')), 'DCT-CONSENT-REMOTE');
    expect(found.map(f => f.activityIds)).toEqual([['a_consent'], ['a_elig']]);
  });

  it.each(OFF_SITE)('fires for an administrative activity at every off-site location: %s', loc => {
    const found = findingsFor(profileDecentralization(setLoc(dctSoa(), 'a_consent', loc)), 'DCT-CONSENT-REMOTE');
    expect(found.map(f => f.activityIds)).toEqual([['a_consent']]);
  });

  it('does not fire for an administrative activity at the site, or a non-administrative one by telehealth', () => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_consent', 'site'));
    expect(p.activities.find(a => a.activityId === 'a_aeq')?.location).toBe('telehealth');
    expect(codes(p)).not.toContain('DCT-CONSENT-REMOTE');
  });
});

describe('visits fully off-site capable', () => {
  it('lists visits whose every scheduled activity is stated off-site, counting conditional and optional cells', () => {
    expect(profileDecentralization(dctSoa()).measures.visitsFullyOffSiteCapable).toEqual(['V3', 'V5']);
  });

  it('a visit with one unstated scheduled activity is not listed', () => {
    const soa = dctSoa();
    const p = profileDecentralization(soa);
    expect(p.measures.visitsFullyOffSiteCapable).not.toContain('V4');
    expect(profileDecentralization(soa, { a_hba1c: 'home' }).measures.visitsFullyOffSiteCapable).toEqual(['V3', 'V4', 'V5']);
  });

  it('a visit with one site activity is not listed', () => {
    const soa = setLoc(dctSoa(), 'a_pro', 'site');
    expect(profileDecentralization(soa).measures.visitsFullyOffSiteCapable).toEqual(['V5']);
  });

  it('a visit with nothing scheduled is not listed and is reported', () => {
    const soa = dctSoa();
    soa.visits.push({ id: 'V6', name: 'Unscheduled', epochId: 'e_fu', unscheduled: true, order: 5 });
    const p = profileDecentralization(soa);
    expect(p.measures.visitsFullyOffSiteCapable).not.toContain('V6');
    expect(p.notAssessed.some(n => n.startsWith('Visit(s) V6 schedule no activity'))).toBe(true);
  });

  it('a visit with a cell for an undefined activity is not listed and is reported', () => {
    const soa = dctSoa();
    soa.cells.push({ activityId: 'a_ghost', visitId: 'V3', state: 'performed' });
    const p = profileDecentralization(soa);
    expect(p.measures.visitsFullyOffSiteCapable).toEqual(['V5']);
    expect(p.notAssessed.some(n => n.includes('Visit V3') && n.includes('a_ghost'))).toBe(true);
  });
});

describe('structural defects are reported, never guessed through', () => {
  const dupSafety = () =>
    oneVisitSoa(
      [{ ...act('a1', 'safety', 0, 'site'), name: 'Vitals at site' }, { ...act('a1', 'safety', 1, 'telehealth'), name: 'AE call' }],
      [{ activityId: 'a1', visitId: 'V1', state: 'performed' }],
    );

  it('a duplicated activity id resolves unstated on every row, whatever the input order', () => {
    const forward = profileDecentralization(dupSafety());
    expect(profileDecentralization(reversed(dupSafety()))).toEqual(forward);
    expect(forward.activities.map(a => [a.name, a.location])).toEqual([['Vitals at site', 'unstated'], ['AE call', 'unstated']]);
    expect(forward.measures.offSiteShare).toMatchObject({ value: null, numerator: 0, denominator: 0 });
    expect(forward.measures.visitsFullyOffSiteCapable).toEqual([]);
    expect(forward.findings).toEqual([]);
    expect(forward.notAssessed.some(n => n.startsWith('Activity id(s) a1 are defined more than once'))).toBe(true);
    expect(forward.notAssessed.some(n => n.includes('DCT-SAFETY-REMOTE not assessed for epoch "Treatment"'))).toBe(true);
  });

  it('a duplicated activity id is named as not counted when a stated safety activity shares its epoch', () => {
    const soa = dupSafety();
    soa.activities.push(act('a2', 'safety', 2, 'local_lab'));
    soa.cells.push({ activityId: 'a2', visitId: 'V1', state: 'performed' });
    const [f] = findingsFor(profileDecentralization(soa), 'DCT-SAFETY-REMOTE');
    expect(f.activityIds).toEqual(['a2']);
    expect(f.message).toContain('1 further scheduled safety activity has an id defined more than once (a1) and was not counted');
  });

  it('an explicit location is not applied to a duplicated activity id, and that is reported', () => {
    const p = profileDecentralization(dupSafety(), { a1: 'home' });
    expect(p.activities.map(a => a.location)).toEqual(['unstated', 'unstated']);
    expect(p.notAssessed.some(n => n.includes('a1') && n.includes('defined more than once') && n.includes('not applied'))).toBe(true);
  });

  it('a duplicated visit id is not listed (twice or at all) and its cells are reported as not counted', () => {
    const soa = oneVisitSoa([act('a', 'efficacy', 0, 'home')], [{ activityId: 'a', visitId: 'V1', state: 'performed' }]);
    soa.visits.push({ id: 'V1', name: 'Day 1 again', epochId: 'e_trt', order: 1 });
    const p = profileDecentralization(soa);
    expect(p.measures.visitsFullyOffSiteCapable).toEqual([]);
    // Exactly one line: a duplicated visit is not also reported as an (empty) visit of its own, once per copy.
    expect(p.notAssessed).toEqual([
      'Visit id(s) V1 are defined more than once; the 1 cell(s) naming them cannot be attributed to one visit and ' +
        'are not counted, and those visits are not assessed for off-site capability or safety oversight.',
    ]);
  });

  it('a cell naming an undefined visit is reported, not dropped', () => {
    const soa = oneVisitSoa(
      [act('a_labs', 'safety', 0, 'local_lab'), act('a_vitals', 'safety', 1, 'site')],
      [
        { activityId: 'a_labs', visitId: 'V1', state: 'performed' },
        { activityId: 'a_vitals', visitId: 'V_GHOST', state: 'performed' },
      ],
    );
    const p = profileDecentralization(soa);
    expect(p.notAssessed).toContain(
      'Cells name visit(s) not defined in the Schedule of Activities (V_GHOST: a_vitals); they are not counted toward ' +
        'visit capability or safety oversight.',
    );
  });

  it.each([
    ['no epoch id', undefined, 'V1 (no epoch id)'],
    ['an undefined epoch', 'e_nope', 'V1 (epoch "e_nope" is not defined)'],
  ])('a visit with %s is reported and never shown as an epoch', (_label, epochId, described) => {
    const soa = oneVisitSoa([act('a_labs', 'safety', 0, 'local_lab')], [{ activityId: 'a_labs', visitId: 'V1', state: 'performed' }]);
    soa.epochs = [];
    Object.assign(soa.visits[0], { epochId });
    const p = profileDecentralization(soa);
    expect(codes(p)).not.toContain('DCT-SAFETY-REMOTE');
    expect(JSON.stringify(p)).not.toContain('epoch "undefined"');
    expect(p.notAssessed.some(n => n.startsWith(`Visit(s) ${described} belong to no uniquely defined epoch`))).toBe(true);
    expect(p.measures.visitsFullyOffSiteCapable).toEqual(['V1']);
  });

  it('a duplicated epoch id groups no visit and is reported', () => {
    const soa = oneVisitSoa([act('a_labs', 'safety', 0, 'local_lab')], [{ activityId: 'a_labs', visitId: 'V1', state: 'performed' }]);
    soa.epochs.push({ id: 'e_trt', name: 'Treatment B', kind: 'treatment', order: 1 });
    const p = profileDecentralization(soa);
    expect(codes(p)).not.toContain('DCT-SAFETY-REMOTE');
    expect(p.notAssessed.some(n => n.startsWith('Epoch id(s) e_trt are defined more than once'))).toBe(true);
    expect(p.notAssessed.some(n => n.startsWith('Visit(s) V1 (epoch "e_trt" is defined more than once)'))).toBe(true);
  });
});

describe('explicit locations', () => {
  it('take precedence over the activity attribute', () => {
    const p = profileDecentralization(dctSoa(), { a_dose: 'home', a_consent: 'site' });
    expect(p.activities.find(a => a.activityId === 'a_dose')?.location).toBe('home');
    expect(p.activities.find(a => a.activityId === 'a_consent')?.location).toBe('site');
    expect(codes(p)).toContain('DCT-IMP-OFFSITE');
    expect(codes(p)).not.toContain('DCT-CONSENT-REMOTE');
  });

  it('supply a location for an unstated activity', () => {
    const p = profileDecentralization(dctSoa(), { a_hba1c: 'local_lab' });
    expect(p.measures.offSiteShare).toMatchObject({ numerator: 5, denominator: 9 });
  });

  it('an unrecognised value is not applied, and neither is an entry for an unknown id; both are reported', () => {
    const bad = { a_dose: 'hospital', a_nope: 'home' } as unknown as Record<string, SoaActivityLocation>;
    const p = profileDecentralization(dctSoa(), bad);
    expect(p.activities.find(a => a.activityId === 'a_dose')?.location).toBe('site');
    expect(p.activities.some(a => a.activityId === 'a_nope')).toBe(false);
    expect(p.notAssessed.some(n => n.includes('a_dose') && n.includes('not recognised'))).toBe(true);
    expect(p.notAssessed.some(n => n.includes('a_nope') && n.includes('not SoA activities'))).toBe(true);
  });
});

describe('determinism', () => {
  it('returns the same profile for the same input, and does not mutate it — also when the input is out of order', () => {
    for (const soa of [dctSoa(), reversed(dctSoa())]) {
      const before = clone(soa);
      expect(profileDecentralization(soa)).toEqual(profileDecentralization(soa));
      expect(soa).toEqual(before);
    }
  });

  it('is independent of the order activities, visits, epochs and cells are listed in', () => {
    expect(profileDecentralization(reversed(dctSoa()))).toEqual(profileDecentralization(dctSoa()));
  });

  it('breaks ties in `order` by id, for activities, visits and epochs alike', () => {
    const soa: ScheduleOfActivities = {
      epochs: [
        { id: 'e_b', name: 'B', kind: 'treatment', order: 0 },
        { id: 'e_a', name: 'A', kind: 'treatment', order: 0 },
      ],
      visits: [
        { id: 'VB', name: 'VB', epochId: 'e_b', order: 0 },
        { id: 'VA', name: 'VA', epochId: 'e_a', order: 0 },
      ],
      activities: [act('b', 'safety', 0, 'home'), act('a', 'safety', 0, 'local_lab')],
      cells: [
        { activityId: 'b', visitId: 'VB', state: 'performed' },
        { activityId: 'a', visitId: 'VB', state: 'performed' },
        { activityId: 'a', visitId: 'VA', state: 'performed' },
      ],
    };
    const p = profileDecentralization(soa);
    expect(p.activities.map(a => a.activityId)).toEqual(['a', 'b']);
    expect(p.measures.visitsFullyOffSiteCapable).toEqual(['VA', 'VB']);
    expect(findingsFor(p, 'DCT-SAFETY-REMOTE').map(f => [/^In epoch "([^"]*)"/.exec(f.message)?.[1], f.activityIds])).toEqual([
      ['A', ['a']],
      ['B', ['a', 'b']],
    ]);
    expect(profileDecentralization(reversed(soa))).toEqual(p);
  });
});
