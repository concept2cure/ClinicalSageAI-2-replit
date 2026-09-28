/**
 * Tests for the decentralised-trial (DCT) profile of the Schedule of Activities.
 * The profile renders only the locations the SoA (or an explicit map) states: an
 * unstated activity is never counted as site and is excluded from the off-site
 * share's denominator, a share with nothing stated is null (not 0), a visit is
 * fully off-site capable only when every scheduled activity is stated off-site,
 * and each of the four findings fires on its trigger and on nothing else.
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

/** An activity with an optional `location` attribute (the type gains the field at integration). */
function act(id: string, category: SoaActivityCategory, order: number, location?: unknown): SoaActivity {
  const activity: SoaActivity = { id, name: `Activity ${id}`, category, order };
  if (location !== undefined) Object.assign(activity, { location });
  return activity;
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Set (or, with undefined, remove) an activity's location attribute. */
function setLoc(soa: ScheduleOfActivities, id: string, location: unknown): ScheduleOfActivities {
  const activity = soa.activities.find(a => a.id === id);
  if (!activity) throw new Error(`no activity ${id}`);
  // Through Object.assign/Reflect so this compiles both before and after SoaActivity gains `location`.
  if (location === undefined) Reflect.deleteProperty(activity, 'location');
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

describe('DCT-IMP-HOME', () => {
  it('warns when a drug-administration activity is at home, with the visits it is scheduled at', () => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_dose', 'home'));
    const [f, ...rest] = findingsFor(p, 'DCT-IMP-HOME');
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ severity: 'warning', activityIds: ['a_dose'], visitIds: ['V2'] });
    expect(f.message).toContain('shipment');
  });

  it.each(['site', 'local_provider', 'telehealth', 'mobile_unit'])('does not fire for drug administration at %s', loc => {
    expect(codes(profileDecentralization(setLoc(dctSoa(), 'a_dose', loc)))).not.toContain('DCT-IMP-HOME');
  });

  it('does not fire for a non-drug activity at home', () => {
    const p = profileDecentralization(dctSoa());
    expect(p.activities.find(a => a.activityId === 'a_pro')?.location).toBe('home');
    expect(codes(p)).not.toContain('DCT-IMP-HOME');
  });

  it('an unstated drug administration is not assessed rather than clean', () => {
    const p = profileDecentralization(setLoc(dctSoa(), 'a_dose', undefined));
    expect(codes(p)).not.toContain('DCT-IMP-HOME');
    expect(p.notAssessed).toContain('DCT-IMP-HOME not assessed for drug-administration activities without a stated location: a_dose.');
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
    expect(f.message).toContain('1 further scheduled safety activity has no stated location');
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

  it.each(['site', 'local_provider', 'telehealth', 'mobile_unit'])('does not fire for PK at %s', loc => {
    expect(codes(profileDecentralization(setLoc(dctSoa(), 'a_pk', loc)))).not.toContain('DCT-PK-OFFSITE');
  });

  it('does not fire for a PD activity at home', () => {
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

  it.each(['site', 'home', 'local_provider'])('does not fire for an administrative activity at %s', loc => {
    expect(codes(profileDecentralization(setLoc(dctSoa(), 'a_consent', loc)))).not.toContain('DCT-CONSENT-REMOTE');
  });

  it('does not fire for a non-administrative activity by telehealth', () => {
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

describe('explicit locations', () => {
  it('take precedence over the activity attribute', () => {
    const p = profileDecentralization(dctSoa(), { a_dose: 'home', a_consent: 'site' });
    expect(p.activities.find(a => a.activityId === 'a_dose')?.location).toBe('home');
    expect(p.activities.find(a => a.activityId === 'a_consent')?.location).toBe('site');
    expect(codes(p)).toContain('DCT-IMP-HOME');
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
  it('returns the same profile for the same input, and does not mutate it', () => {
    const soa = dctSoa();
    const before = clone(soa);
    expect(profileDecentralization(soa)).toEqual(profileDecentralization(soa));
    expect(soa).toEqual(before);
  });

  it('is independent of the order activities, visits, epochs and cells are listed in', () => {
    const shuffled = dctSoa();
    shuffled.activities.reverse();
    shuffled.visits.reverse();
    shuffled.epochs.reverse();
    shuffled.cells.reverse();
    expect(profileDecentralization(shuffled)).toEqual(profileDecentralization(dctSoa()));
  });
});
