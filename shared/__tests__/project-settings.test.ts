import { describe, expect, it } from 'vitest';
import {
  isProjectSettingsData, isProjectSettingsEnvelope, isProjectSettingsPatch,
  type ProjectSettingsData, type ProjectSettingsScope, type ProjectSettingsWrite,
} from '../project-settings';

const scope: ProjectSettingsScope = {
  programId: '9a7f0b10-0000-4000-8000-0000000000aa', projectId: 11,
  organizationId: 9, actorUserId: 7, clientWorkspaceId: 71,
};
const original = `v1:${'a'.repeat(64)}`;
const saved: ProjectSettingsData = {
  ...scope, projectId: 11, clientWorkspaceId: 71, canChange: true,
  revision: `v1:${'b'.repeat(64)}`, description: 'Current description',
  priority: 'high', targetSubmissionDate: '2028-02-29',
};
const write: ProjectSettingsWrite = {
  revision: original, reason: 'Revised agreed delivery date',
  patch: { description: ' Current description ', priority: 'high', targetSubmissionDate: '2028-02-29' },
};
const receipt = () => ({ success: true, data: { ...saved },
  meta: { auditTrail: { persisted: true, chained: true }, changedFields: ['description', 'priority', 'targetSubmissionDate'] } });

describe('current project settings receipts', () => {
  it('confirms the actual scoped fields, new revision and transactional audit', () => {
    expect(isProjectSettingsEnvelope(receipt(), scope, write)).toBe(true);
    expect(isProjectSettingsEnvelope({ success: true, data: { ...saved, canChange: false } }, scope)).toBe(true);
  });

  it.each([
    ['programId', '9a7f0b10-0000-4000-8000-0000000000bb'], ['projectId', 12],
    ['organizationId', 10], ['actorUserId', 8], ['clientWorkspaceId', 72],
  ])('refuses a saved receipt from a different %s', (key, value) => {
    const response = receipt(); Object.assign(response.data, { [key]: value });
    expect(isProjectSettingsEnvelope(response, scope, write)).toBe(false);
  });

  it('leaves a first read unbound when no client was selected, then pins the saved parent for writes', () => {
    const unbound = { ...scope, projectId: undefined, clientWorkspaceId: null };
    expect(isProjectSettingsEnvelope({ success: true, data: saved }, unbound)).toBe(true);
    expect(isProjectSettingsEnvelope(receipt(), unbound, write)).toBe(false);
    const legacy = { ...scope, clientWorkspaceId: null };
    const response = receipt(); response.data.clientWorkspaceId = null;
    expect(isProjectSettingsEnvelope(response, legacy, write)).toBe(true);
    expect(isProjectSettingsEnvelope(receipt(), legacy, write)).toBe(false);
  });

  it.each([
    { description: 'Other description' }, { priority: 'low' }, { targetSubmissionDate: '2028-03-01' },
    { revision: original }, { revision: '1' }, { canChange: false },
  ])('does not confirm contradictory saved facts %j', patch => {
    const response = receipt(); Object.assign(response.data, patch);
    expect(isProjectSettingsEnvelope(response, scope, write)).toBe(false);
  });

  it.each([
    { persisted: false, chained: false }, { persisted: true, chained: false }, {},
  ])('requires the chained audit, rather than a success-shaped wrapper %j', auditTrail => {
    expect(isProjectSettingsEnvelope({ ...receipt(), meta: { ...receipt().meta, auditTrail } }, scope, write)).toBe(false);
  });

  it.each([
    { changedFields: [] }, { changedFields: ['priority', 'priority'] },
    { changedFields: ['leadUserId'] }, { changedFields: ['targetAgencies'] },
  ])('refuses invalid changed-field attribution %j', ({ changedFields }) => {
    expect(isProjectSettingsEnvelope({ ...receipt(), meta: { ...receipt().meta, changedFields } }, scope, write)).toBe(false);
  });

  it('does not treat pending stores or a missing audit envelope as a saved update', () => {
    expect(isProjectSettingsEnvelope({ ...receipt(), meta: { ...receipt().meta, pendingStore: true } }, scope, write)).toBe(false);
    expect(isProjectSettingsEnvelope({ success: true, data: saved }, scope, write)).toBe(false);
  });

  it('confirms deliberate clearing against canonical null values', () => {
    const response = receipt(); response.data.description = null; response.data.targetSubmissionDate = null;
    expect(isProjectSettingsEnvelope(response, scope, { ...write, patch: { description: '   ', targetSubmissionDate: null, priority: 'high' } })).toBe(true);
  });

  it('refuses an audited field that was not in the submitted change', () => {
    expect(isProjectSettingsEnvelope(receipt(), scope, { ...write, patch: { priority: 'high' } })).toBe(false);
  });

  it.each([0, '11', 2_147_483_648])('requires an actual supported anchor ID %j', projectId => {
    expect(isProjectSettingsData({ ...saved, projectId }, scope)).toBe(false);
  });
});

describe('bounded profile fields', () => {
  it.each([
    {}, { name: 'A replacement identity' }, { leadUserId: 8 }, { clientWorkspaceId: 72 },
    { priority: 'urgent' }, { description: 3 }, { description: 'x'.repeat(4001) },
    { targetSubmissionDate: '2026-02-30' }, { targetSubmissionDate: '2027-02-29' },
    { targetSubmissionDate: '0000-01-01' }, { targetSubmissionDate: '2027-01-01T00:00:00Z' },
  ])('rejects invalid or unauthorized patch fields (case %#)', patch => {
    expect(isProjectSettingsPatch(patch)).toBe(false);
  });

  it('accepts a valid leap day, an omitted field and deliberate clearing', () => {
    expect(isProjectSettingsPatch({ targetSubmissionDate: '2028-02-29' })).toBe(true);
    expect(isProjectSettingsPatch({ description: null, targetSubmissionDate: null })).toBe(true);
  });
});
