import { describe, expect, it, vi } from 'vitest';
import { resolveDocumentClass, describeUnmappedClass } from '../document-class';
import { findActiveRulePack } from '../rule-pack-lookup';
import { resolveGovernedDocument } from '../governed-document-binding';
import { resolveRequiredSections } from '../../ectd/required-sections';

const classes = [
  ['hde', 'FDA', 'fda'], ['mdl', 'Health Canada', 'hc'], ['ivd_licence', 'Health Canada', 'hc'],
  ['shonin', 'PMDA', 'pmda'], ['ninsho', 'Registered certification body', 'jp_rcb'],
  ['todokede', 'PMDA', 'pmda'], ['ivd_approval', 'PMDA', 'pmda'], ['jp_cdx', 'PMDA', 'pmda'],
] as const;

describe('Notified Body document identity reuses the existing pure class resolver', () => {
  it.each(['mdr', 'ivdr', 'cer'])('%s resolves the existing pack key for every recorded body label', type => {
    for (const agency of ['EU / Notified Body', 'Notified_Body', 'notified body', 'NB']) {
      expect(resolveDocumentClass(type, agency)).toEqual({ docType: type, agency: 'ema' });
    }
  });
  it.each(['nda', 'maa', 'pma', 'mdl', 'ivd_licence', 'ninsho', 'device'])('%s does not gain a Notified Body filing identity', type => {
    for (const agency of ['EU / Notified Body', 'Notified_Body', 'notified body', 'NB']) {
      expect(resolveDocumentClass(type, agency)).toBeNull();
    }
  });
});

describe('exact regional device application classes reuse the governed document path', () => {
  it.each(classes)('%s resolves only its actual authority', (type, agency, code) => {
    expect(resolveDocumentClass(type, agency)).toEqual({ docType: type, agency: code });
    expect(resolveDocumentClass(type, code === 'fda' ? 'PMDA' : 'FDA')).toBeNull();
    expect(describeUnmappedClass(type, code === 'fda' ? 'PMDA' : 'FDA')).toContain(`Choose ${agency}`);
  });
  it.each(classes)('%s never borrows an ICH pack', async (type) => {
    const query = vi.fn(async () => ({ rows: [{ version: 'wrong', label: 'wrong', required_sections: [] }] }));
    expect(await findActiveRulePack({ query }, type, 'ich')).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('required-sections never reports a hypothetical ICH pack for regional certification', async () => {
    const query = vi.fn(async (_sql: string, args?: unknown[]) => ({ rows: args?.[1] === 'ich'
      ? [{ version: 'wrong', required_sections: [{ key: '1.1', mandatory: true }] }] : [] }));
    const result = await resolveRequiredSections({ query } as never, { programType: 'ninsho', primaryAgency: 'Registered certification body' });
    expect(result.provenance.source).toBe('not_applicable');
    expect(result.modules).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
  it('the raw saved registered-body agency binds only its exact home filing', async () => {
    const query = vi.fn(async (sql: string, args?: unknown[]) => {
      if (sql.includes('FROM regulatory_programs')) return { rows: [{ program_type: 'ninsho', primary_agency: 'Registered certification body' }] };
      expect(args?.slice(2)).toEqual(['ninsho', ['jp_rcb']]);
      return { rows: [{ id: 'doc_ninsho' }] };
    });
    expect(await resolveGovernedDocument({ db: { query } as never, orgId: 7, projectId: '11111111-1111-1111-1111-111111111111' })).toEqual({ documentId: 'doc_ninsho' });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
