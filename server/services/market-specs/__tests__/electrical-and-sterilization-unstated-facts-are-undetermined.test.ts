/**
 * An unstated device fact leaves IEC 60601 / sterilization applicability
 * undetermined, never "not applicable" (2026-10-15).
 *
 * What the code used to do: applicableElectricalStandards read every fact with
 * `!facts.x` / `!!facts.x`, so an omitted electricallyPowered returned
 * applicable:false ("Not electrically powered — IEC 60601 does not apply.") and an
 * omitted hasAlarms / closedLoopControl / homeUse / emsUse dropped that collateral
 * as if stated absent. sterilizationRequirements read an omitted `sterile` as "not
 * supplied sterile — sterilization validation does not apply". buildDeviceBlueprint
 * (`=== true`) listed both modules applicable:false when their facts were left out,
 * so a blueprint with nothing said about power or sterility could be evidenceReady.
 */
import { describe, it, expect } from 'vitest';
import { applicableElectricalStandards, IEC_60601_STANDARDS } from '../electrical-safety';
import { sterilizationRequirements } from '../sterilization';
import { buildDeviceBlueprint } from '../device-blueprint';
import { RMF_SECTIONS } from '../risk-management-structure';
import { CER_SECTIONS } from '../cer-structure';

const codes = (list: Array<{ code: string }>) => list.map((s) => s.code);

describe('applicableElectricalStandards with a fact left out', () => {
  it('is undetermined, not "not applicable", when electricallyPowered is not stated', () => {
    const r = applicableElectricalStandards({});
    expect(r.applicable, 'an omitted electricallyPowered read as false').toBeNull();
    expect(r.notes.join(' ')).not.toMatch(/does not apply/);
    expect(r.notes.join(' ')).toMatch(/undetermined — electricallyPowered not stated/);
    expect(r.standards).toEqual([]);
    // Every standard of the family is named as undetermined, with the fact it waits on.
    expect(codes(r.undeterminedStandards)).toEqual(codes(IEC_60601_STANDARDS));
    expect(r.undeterminedStandards.find((s) => s.code === 'IEC 60601-1')?.applicability).toBe('undetermined — electricallyPowered not stated');
    expect(r.undeterminedStandards.find((s) => s.code === 'IEC 60601-1-8')?.applicability).toBe('undetermined — electricallyPowered and hasAlarms not stated');
  });

  it('names a conditional collateral whose fact is not stated as undetermined, not absent', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true, hasAlarms: true, closedLoopControl: false });
    expect(r.applicable).toBe(true);
    expect(codes(r.standards)).toEqual(['IEC 60601-1', 'IEC 60601-1-2', 'IEC 60601-1-6', 'IEC 60601-1-8']);
    expect(r.undeterminedStandards.map((s) => [s.code, s.applicability])).toEqual([
      ['IEC 60601-1-11', 'undetermined — homeUse not stated'],
      ['IEC 60601-1-12', 'undetermined — emsUse not stated'],
    ]);
    expect(r.notes.join(' ')).toMatch(/IEC 60601-2-xx.*undetermined — hasParticularStandard not stated/);
  });

  it('still answers "does not apply" for a device stated not to be powered', () => {
    const r = applicableElectricalStandards({ electricallyPowered: false });
    expect(r.applicable).toBe(false);
    expect(r.undeterminedStandards).toEqual([]);
  });

  it('determines every standard once every fact is stated', () => {
    const r = applicableElectricalStandards({
      electricallyPowered: true, hasAlarms: false, closedLoopControl: false, homeUse: true, emsUse: false, hasParticularStandard: false,
    });
    expect(r.undeterminedStandards).toEqual([]);
    expect(codes(r.standards)).toEqual(['IEC 60601-1', 'IEC 60601-1-2', 'IEC 60601-1-6', 'IEC 60601-1-11']);
    expect(r.notes.join(' ')).not.toMatch(/undetermined/);
  });
});

describe('sterilizationRequirements with sterile left out', () => {
  it('is undetermined, not "does not apply"', () => {
    const r = sterilizationRequirements({});
    expect(r.applicable, 'an omitted sterile read as "not supplied sterile"').toBeNull();
    expect(r.notes.join(' ')).not.toMatch(/does not apply/);
    expect(r.notes.join(' ')).toMatch(/undetermined — sterile not stated/);
  });

  it('still answers "does not apply" for a device stated non-sterile', () => {
    expect(sterilizationRequirements({ sterile: false }).applicable).toBe(false);
  });
});

describe('buildDeviceBlueprint with power or sterility left out', () => {
  const RMF_COMPLETE = RMF_SECTIONS.filter((s) => s.required).map((s) => s.id);
  const CER_COMPLETE = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);
  const complete = { submissionType: 'mdr_td' as const, present: { rmfSectionIds: RMF_COMPLETE, cerSectionIds: CER_COMPLETE }, equivalenceClaimed: false };

  it('does not list the modules as not applicable, and names them undetermined', () => {
    const bp = buildDeviceBlueprint(complete);
    const listed = bp.evidenceModules.filter((m) => m.id === 'electrical_safety' || m.id === 'sterilization');
    expect(listed, 'an unstated power / sterility fact listed its module as applicable:false').toEqual([]);
    expect(bp.evidenceModulesUndetermined.map((m) => [m.id, m.applicability])).toEqual([
      ['electrical_safety', 'undetermined — electrical.electricallyPowered not stated'],
      ['sterilization', 'undetermined — sterilization.sterile not stated'],
    ]);
  });

  it('is not evidenceReady while either module may apply', () => {
    expect(buildDeviceBlueprint(complete).evidenceReady, 'ready with power and sterility unstated').toBeNull();
    expect(buildDeviceBlueprint({ ...complete, electrical: { electricallyPowered: false } }).evidenceReady).toBeNull();
  });

  it('is evidenceReady once both are stated not to apply', () => {
    const bp = buildDeviceBlueprint({ ...complete, electrical: { electricallyPowered: false }, sterilization: { sterile: false } });
    expect(bp.evidenceModulesUndetermined).toEqual([]);
    expect(bp.evidenceModules.find((m) => m.id === 'electrical_safety')?.applicable).toBe(false);
    expect(bp.evidenceModules.find((m) => m.id === 'sterilization')?.applicable).toBe(false);
    expect(bp.evidenceReady).toBe(true);
  });
});
