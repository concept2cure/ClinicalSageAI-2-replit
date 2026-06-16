/**
 * Medical device & IVD risk-classification + market-pathway expert — FDA, EU MDR, EU IVDR.
 */

import { describe, it, expect } from 'vitest';
import {
  getDeviceFramework,
  classifyDevicePathway,
  DEVICE_REGIONS,
  type DeviceRegion,
} from '../device-classification';

describe('device-classification framework catalog', () => {
  it('models all three regions', () => {
    expect(DEVICE_REGIONS).toEqual(['FDA', 'EU_MDR', 'EU_IVDR']);
    for (const r of DEVICE_REGIONS) {
      const fw = getDeviceFramework(r);
      expect(fw.region).toBe(r);
      expect(fw.basis).toBeTruthy();
      expect(fw.citation).toBeTruthy();
      expect(fw.classes.length).toBeGreaterThan(0);
      for (const c of fw.classes) {
        expect(c.citation).toBeTruthy();
        expect(c.typicalPathway).toBeTruthy();
        expect(c.riskLevel).toBeTruthy();
      }
    }
  });

  it('FDA has classes I/II/III', () => {
    const classes = getDeviceFramework('FDA').classes.map((c) => c.class);
    expect(classes).toEqual(['I', 'II', 'III']);
  });

  it('EU_MDR has classes I/IIa/IIb/III', () => {
    const classes = getDeviceFramework('EU_MDR').classes.map((c) => c.class);
    expect(classes).toEqual(['I', 'IIa', 'IIb', 'III']);
  });

  it('EU_IVDR has classes A/B/C/D', () => {
    const classes = getDeviceFramework('EU_IVDR').classes.map((c) => c.class);
    expect(classes).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('classifyDevicePathway — FDA', () => {
  it('Class II → 510(k)', () => {
    const r = classifyDevicePathway({ region: 'FDA', deviceClass: 'II' });
    expect(r.pathway).toContain('510(k)');
    expect(r.notifiedBodyRequired).toBe(false);
  });

  it('Class III → PMA', () => {
    const r = classifyDevicePathway({ region: 'FDA', deviceClass: 'III' });
    expect(r.pathway).toContain('PMA');
  });

  it('Class II notes mention De Novo and 513(g)', () => {
    const notes = classifyDevicePathway({ region: 'FDA', deviceClass: 'II' }).notes.join(' ');
    expect(notes).toContain('De Novo');
    expect(notes).toContain('513(g)');
  });

  it('Class I is 510(k)-exempt and mentions De Novo', () => {
    const r = classifyDevicePathway({ region: 'FDA', deviceClass: 'I' });
    expect(r.pathway).toContain('exempt');
    expect(r.notes.join(' ')).toContain('De Novo');
  });
});

describe('classifyDevicePathway — EU MDR', () => {
  it('Class III → Notified Body required', () => {
    expect(classifyDevicePathway({ region: 'EU_MDR', deviceClass: 'III' }).notifiedBodyRequired).toBe(true);
  });

  it('Class I → Notified Body not required', () => {
    expect(classifyDevicePathway({ region: 'EU_MDR', deviceClass: 'I' }).notifiedBodyRequired).toBe(false);
  });

  it('Class IIa / IIb → Notified Body required', () => {
    expect(classifyDevicePathway({ region: 'EU_MDR', deviceClass: 'IIa' }).notifiedBodyRequired).toBe(true);
    expect(classifyDevicePathway({ region: 'EU_MDR', deviceClass: 'IIb' }).notifiedBodyRequired).toBe(true);
  });
});

describe('classifyDevicePathway — EU IVDR', () => {
  it('Class D → Notified Body required', () => {
    expect(classifyDevicePathway({ region: 'EU_IVDR', deviceClass: 'D' }).notifiedBodyRequired).toBe(true);
  });

  it('Class A → Notified Body not required', () => {
    expect(classifyDevicePathway({ region: 'EU_IVDR', deviceClass: 'A' }).notifiedBodyRequired).toBe(false);
  });
});

describe('classifyDevicePathway — errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() => getDeviceFramework('PMDA' as DeviceRegion)).toThrow();
    expect(() => classifyDevicePathway({ region: 'PMDA' as DeviceRegion, deviceClass: 'I' })).toThrow();
  });

  it('throws for an invalid class in a valid region', () => {
    expect(() => classifyDevicePathway({ region: 'FDA', deviceClass: 'IIa' })).toThrow();
    expect(() => classifyDevicePathway({ region: 'EU_MDR', deviceClass: 'II' })).toThrow();
    expect(() => classifyDevicePathway({ region: 'EU_IVDR', deviceClass: 'I' })).toThrow();
  });

  it('is deterministic', () => {
    expect(classifyDevicePathway({ region: 'EU_IVDR', deviceClass: 'C' })).toEqual(
      classifyDevicePathway({ region: 'EU_IVDR', deviceClass: 'C' }),
    );
  });
});
