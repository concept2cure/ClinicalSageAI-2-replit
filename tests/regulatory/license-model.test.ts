import { describe, it, expect } from 'vitest';
import {
  canCreateProjectType,
  licensedProjectTypes,
  includedApps,
  type License,
} from '../../shared/regulatory/license-model';

const pharmaAll: License = { segments: ['pharma'], projectTypes: ['*'] };
const pharmaNarrow: License = { segments: ['pharma'], projectTypes: ['US_NDA', 'US_IND'] };
const device: License = { segments: ['device'], projectTypes: ['*'] };

describe('license — client type gates the whole vertical', () => {
  it('a pharma license can create pharma filings but not biotech or device ones', () => {
    expect(canCreateProjectType(pharmaAll, 'NDA').allowed).toBe(true);
    expect(canCreateProjectType(pharmaAll, 'IND').allowed).toBe(true);
    expect(canCreateProjectType(pharmaAll, 'ANDA').allowed).toBe(true);
    // BLA is biotech (CBER), 510(k) is device — different client types
    expect(canCreateProjectType(pharmaAll, 'BLA').allowed).toBe(false);
    expect(canCreateProjectType(pharmaAll, '510k').allowed).toBe(false);
  });

  it('a device license is the mirror image', () => {
    expect(canCreateProjectType(device, '510k').allowed).toBe(true);
    expect(canCreateProjectType(device, 'PMA').allowed).toBe(true);
    expect(canCreateProjectType(device, 'NDA').allowed).toBe(false);
  });
});

describe('license — project type narrows within the licensed client type', () => {
  it('grants only the named project types when there is no wildcard', () => {
    expect(canCreateProjectType(pharmaNarrow, 'NDA').allowed).toBe(true);
    expect(canCreateProjectType(pharmaNarrow, 'IND').allowed).toBe(true);
    // ANDA is pharma but not in the granted list
    const anda = canCreateProjectType(pharmaNarrow, 'ANDA');
    expect(anda.allowed).toBe(false);
    expect(anda.reason).toMatch(/not licensed within/);
  });
});

describe('licensedProjectTypes — feeds the New-Project picker', () => {
  it('returns pharma filings and excludes other segments', () => {
    const ids = licensedProjectTypes(pharmaAll);
    expect(ids).toContain('US_NDA');
    expect(ids).toContain('US_IND');
    expect(ids).not.toContain('US_510K'); // device
    expect(ids).not.toContain('US_BLA');  // biotech
  });
});

describe('apps follow the project type — never sold separately', () => {
  it('a licensed project type includes its apps; an unlicensed one includes none', () => {
    const ndaApps = includedApps(pharmaAll, 'NDA');
    expect(ndaApps.length).toBeGreaterThan(0);
    expect(ndaApps).toContain('cmc');
    // BLA is not licensed for a pharma-only org → no apps
    expect(includedApps(pharmaAll, 'BLA')).toHaveLength(0);
  });
});
