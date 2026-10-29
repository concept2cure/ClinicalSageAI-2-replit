/**
 * Vault saved views, the pure parts (D2, P-46; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md
 * test T6): the filters a view stores round-trip through the search's own
 * parser, and who may change a view is exactly the design's §3.3 table.
 */
import { describe, expect, it } from 'vitest';
import { parseVaultFilters, vaultFilterQuery, VAULT_FILTER_PARAMETER_NAMES } from '../vault-document-filter';
import { savedViewAuthority, validateViewParameters, SavedViewRefusal } from '../vault-saved-views';

describe('vaultFilterQuery: parsed filters back to the search\'s parameters', () => {
  it('uses only the search\'s parameter names, keeps CTD codes normalised, and round-trips', () => {
    const raw = { documentType: 'CSR,SAR', ctdSection: ['m3.2.p', '3.2.P'], lifecycleStage: 'none', folderId: 'module-3' };
    const once = parseVaultFilters(raw, { view: 'pharma' });
    if (!('filters' in once)) throw new Error('parse refused');
    const query = vaultFilterQuery(once.filters);
    expect(Object.keys(query).every((k) => VAULT_FILTER_PARAMETER_NAMES.includes(k))).toBe(true);
    expect(query).toEqual({ documentType: ['CSR', 'SAR'], ctdSection: ['3.2.P'], lifecycleStage: ['none'], folderId: ['module-3'] });
    expect(parseVaultFilters(query, { view: 'pharma' })).toEqual(once);
  });

  it('omits empty dimensions', () => {
    expect(vaultFilterQuery({ documentTypes: [], classifications: ['CONTROLLED'] })).toEqual({ classification: ['CONTROLLED'] });
  });
});

describe('validateViewParameters: a view holds only what the search accepts', () => {
  const resolveView = async () => 'pharma' as const;
  const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: SavedViewRefusal) => ({ status: e.status, code: e.code, parameter: e.body.parameter }));

  it('refuses a project list, an unknown key, a folder in a library view and an empty view', async () => {
    expect(await refusal(validateViewParameters({ programId: null, q: '', filters: { programId: ['x'] }, resolveView })))
      .toEqual({ status: 400, code: 'UNSUPPORTED_PARAMETER', parameter: 'programId' });
    expect(await refusal(validateViewParameters({ programId: null, q: 'x', filters: { owner: ['me'] }, resolveView })))
      .toEqual({ status: 400, code: 'UNSUPPORTED_PARAMETER', parameter: 'owner' });
    expect(await refusal(validateViewParameters({ programId: null, q: 'x', filters: { folderId: ['module-3'] }, resolveView })))
      .toEqual({ status: 400, code: 'INVALID_FILTER', parameter: 'folderId' });
    expect(await refusal(validateViewParameters({ programId: null, q: '', filters: {}, resolveView })))
      .toEqual({ status: 422, code: 'EMPTY_VIEW', parameter: undefined });
  });

  it('leaves processingStatus to the parser, which refuses it as the search does', async () => {
    expect(await refusal(validateViewParameters({ programId: null, q: 'x', filters: { processingStatus: ['INDEXED'] }, resolveView })))
      .toEqual({ status: 400, code: 'UNSUPPORTED_PARAMETER', parameter: 'processingStatus' });
  });

  it('reads a project view\'s cabinet only when a folder is asked for', async () => {
    let reads = 0;
    const counting = async () => { reads += 1; return 'pharma' as const; };
    await validateViewParameters({ programId: '11111111-1111-4111-8111-111111111111', q: 'x', filters: { documentType: ['CSR'] }, resolveView: counting });
    expect(reads).toBe(0);
    await validateViewParameters({ programId: '11111111-1111-4111-8111-111111111111', q: '', filters: { folderId: ['module-3'] }, resolveView: counting });
    expect(reads).toBe(1);
  });
});

describe('savedViewAuthority: the design\'s §3.3 table', () => {
  const OWNER = 5;
  const OTHER = 6;
  const view = (visibility: 'private' | 'org_public') => ({ userId: OWNER, visibility });
  type Row = [string, 'private' | 'org_public', number, string, { canEdit: boolean; canRename: boolean; canShare: boolean; canDelete: boolean }];
  const table: Row[] = [
    ['owner (member) of a personal view', 'private', OWNER, 'member', { canEdit: true, canRename: true, canShare: true, canDelete: true }],
    ['owner (viewer) of a personal view cannot publish it', 'private', OWNER, 'viewer', { canEdit: true, canRename: true, canShare: false, canDelete: true }],
    ['creator (member) of an organisation view', 'org_public', OWNER, 'member', { canEdit: true, canRename: true, canShare: true, canDelete: true }],
    ['creator demoted to viewer: may withdraw, not change', 'org_public', OWNER, 'viewer', { canEdit: false, canRename: false, canShare: true, canDelete: true }],
    ['another member of an organisation view', 'org_public', OTHER, 'member', { canEdit: false, canRename: false, canShare: false, canDelete: false }],
    ['a manager of an organisation view: rename and delete, not edit', 'org_public', OTHER, 'manager', { canEdit: false, canRename: true, canShare: false, canDelete: true }],
    ['an admin of an organisation view: rename and delete, not edit', 'org_public', OTHER, 'admin', { canEdit: false, canRename: true, canShare: false, canDelete: true }],
  ];
  it.each(table)('%s', (_label, visibility, userId, role, expected) => {
    const can = savedViewAuthority(view(visibility), { userId, role });
    expect({ canEdit: can.canEdit, canRename: can.canRename, canShare: can.canShare, canDelete: can.canDelete }).toEqual(expected);
    expect(can.mine).toBe(userId === OWNER);
  });
});
