import { describe, expect, it, vi } from 'vitest';
import { resolveRequiredSections } from '../required-sections';

const classes = [
  { type: 'hde', agency: 'FDA' }, { type: 'mdl', agency: 'Health Canada' },
  { type: 'ivd_licence', agency: 'Health Canada' }, { type: 'shonin', agency: 'PMDA' },
  { type: 'ninsho', agency: 'Registered certification body' }, { type: 'todokede', agency: 'PMDA' },
  { type: 'ivd_approval', agency: 'PMDA' }, { type: 'jp_cdx', agency: 'PMDA' },
];

describe('regional device preparation requirements never become a medicinal CTD baseline', () => {
  it.each(classes.flatMap(row => ['optional', 'missing', 'unreadable', 'wrongauthority'].map(mode => ({ ...row, mode }))))('$type/$mode stays explicitly outside the CTD checklist', async ({ type, agency, mode }) => {
    const query = vi.fn(async () => {
      if (mode === 'unreadable') throw new Error('Unavailable test store');
      return { rows: mode === 'missing' ? [] : [{ version: 'preparation', required_sections: [{ key: 'device', mandatory: false }] }] };
    });
    const result = await resolveRequiredSections({ query } as never, { programType: type, primaryAgency: mode === 'wrongauthority' ? agency === 'FDA' ? 'PMDA' : 'FDA' : agency });
    expect(result.modules).toEqual([]);
    expect(result.provenance).toMatchObject({ source: 'not_applicable', docType: type });
    expect(result.provenance.reason).toMatch(/not a CTD dossier/);
    expect(query).not.toHaveBeenCalled();
  });
  it('a medicinal application still reads its own CTD pack', async () => {
    const query = vi.fn(async () => ({ rows: [{ version: 'existing', required_sections: [{ key: '1.1', mandatory: true }] }] }));
    const result = await resolveRequiredSections({ query } as never, { programType: 'ind', primaryAgency: 'FDA' });
    expect(result.provenance).toMatchObject({ source: 'rule_pack', docType: 'ind', agency: 'fda' });
    expect(result.modules.find(m => m.code === 'm1')?.requiredSections).toEqual(['1.1']);
  });
});
