/**
 * Tests for the device labeling requirements module.
 */
import { describe, it, expect } from 'vitest';
import { deviceLabelingRequirements } from '../device-labeling';

const ids = (els: Array<{ id: string }>) => els.map((e) => e.id);

describe('device labeling — always-on elements', () => {
  it('a basic device carries manufacturer, UDI, and intended use on both regions', () => {
    const r = deviceLabelingRequirements({});
    expect(ids(r.fdaLabel)).toEqual(expect.arrayContaining(['manufacturer', 'intended_use', 'udi', 'warnings']));
    expect(ids(r.mdrLabel)).toEqual(expect.arrayContaining(['device_name', 'manufacturer', 'udi', 'md_indicator']));
    expect(ids(r.symbols)).toEqual(expect.arrayContaining(['manufacturer', 'consult_ifu', 'udi']));
  });

  it('does not include sterile / single-use / Rx-only for a basic device', () => {
    const r = deviceLabelingRequirements({});
    expect(ids(r.mdrLabel)).not.toContain('sterile_state');
    expect(ids(r.mdrLabel)).not.toContain('single_use');
    expect(ids(r.fdaLabel)).not.toContain('rx_only');
  });
});

describe('device labeling — conditional elements', () => {
  it('adds sterile state + sterile symbol + IFU sterile handling for a sterile device', () => {
    const r = deviceLabelingRequirements({ sterile: true });
    expect(ids(r.mdrLabel)).toContain('sterile_state');
    expect(ids(r.symbols)).toContain('sterile');
    expect(ids(r.ifuSections)).toContain('sterile_handling');
  });

  it('adds single-use + do-not-reuse for a single-use device', () => {
    const r = deviceLabelingRequirements({ singleUse: true });
    expect(ids(r.mdrLabel)).toContain('single_use');
    expect(ids(r.symbols)).toContain('do_not_reuse');
  });

  it('adds reprocessing IFU for a reusable device', () => {
    expect(ids(deviceLabelingRequirements({ reusable: true }).ifuSections)).toContain('reprocessing');
  });

  it('adds Rx-only for a prescription device', () => {
    expect(ids(deviceLabelingRequirements({ prescriptionOnly: true }).fdaLabel)).toContain('rx_only');
  });

  it('notes the implant card for implantable devices', () => {
    const r = deviceLabelingRequirements({ implantable: true });
    expect(r.notes.some((n) => /implant card/i.test(n))).toBe(true);
    expect(ids(r.symbols)).toContain('serial_number');
  });

  it('always surfaces the labeling reviewer questions', () => {
    expect(deviceLabelingRequirements({}).reviewerQuestions.some((q) => /Indications for Use/.test(q))).toBe(true);
  });
});
