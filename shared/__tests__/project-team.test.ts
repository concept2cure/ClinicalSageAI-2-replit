import { describe, expect, it } from 'vitest';
import { isProjectTeamResponse, type ProjectTeamMember, type ProjectTeamResponse } from '../project-team';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const active: ProjectTeamMember = {
  user_id: 4, role: 'lead', name: 'Alex', email: 'alex@example.test', entry_id: 'user:4',
  identity: 'active_member', label: 'Alex · Account #4', responsibilities: ['project_lead', 'project_owner'],
  sharing_role: 'owner', sources: ['program_lead', 'project_owner', 'project_creator', 'project_member'],
};
const recorded: ProjectTeamMember = {
  user_id: null, role: null, name: 'Legacy collaborator', email: null, entry_id: 'recorded-name:0',
  identity: 'recorded_name', label: 'Legacy collaborator', responsibilities: [], sharing_role: null, sources: ['recorded_name'],
};
const payload = (team: ProjectTeamMember[] = [active, recorded]): ProjectTeamResponse => ({ program_id: PROGRAM, project_id: 17, team });
const acceptsMember = (over: Record<string, unknown>) => isProjectTeamResponse(payload([{ ...active, ...over } as ProjectTeamMember]), PROGRAM);

describe('project responsibility response guard', () => {
  it('accepts a scoped empty roster, current identities, and explicitly unconfirmed account references', () => {
    expect(isProjectTeamResponse(payload(), PROGRAM)).toBe(true);
    expect(isProjectTeamResponse(payload([]), PROGRAM)).toBe(true);
    expect(acceptsMember({ identity: 'unconfirmed_account', name: null, email: null, sharing_role: null,
      label: 'Account #4 — Current membership not confirmed' })).toBe(true);
    expect(acceptsMember({ name: null, email: null, label: 'Account #4' })).toBe(true);
  });

  it.each([
    ['foreign program', { ...payload(), program_id: '22222222-2222-4222-8222-222222222222' }],
    ['integer program', { ...payload(), program_id: '17' }],
    ['missing anchor', { ...payload(), project_id: null }],
    ['fractional anchor', { ...payload(), project_id: 1.5 }],
    ['legacy shape', { team: [active] }],
    ['missing team', { ...payload(), team: null }],
    ['duplicate account', payload([active, active])],
    ['duplicate recorded entry', payload([recorded, recorded])],
    ['null payload', null],
  ])('rejects %s', (_label, value) => { expect(isProjectTeamResponse(value, PROGRAM)).toBe(false); });

  it.each([
    { user_id: 0 }, { user_id: Number.MAX_SAFE_INTEGER + 1 }, { entry_id: 'user:99' }, { label: ' ' },
    { name: 42 }, { email: undefined }, { identity: 'approver' }, { role: 'approver' },
    { responsibilities: ['reviewer'] }, { responsibilities: ['project_lead'] },
    { responsibilities: ['project_lead', 'project_owner', 'project_owner'] },
    { sharing_role: 'approve' }, { sources: [] }, { sources: ['program_lead', 'made_up'] },
    { sources: ['project_owner'] }, { role: null },
    { sources: ['program_lead', 'project_owner', 'recorded_name'] },
  ])('rejects inconsistent account facts: %j', over => { expect(acceptsMember(over)).toBe(false); });

  it('requires a canonical current program, with no fallback to an anchor or absent selection', () => {
    expect(isProjectTeamResponse(payload(), null)).toBe(false);
    expect(isProjectTeamResponse({ ...payload(), program_id: '17' }, '17')).toBe(false);
  });

  it('does not accept sharing inferred from a program lead fact alone', () => {
    expect(acceptsMember({ responsibilities: ['project_lead'], sources: ['program_lead'], sharing_role: 'edit' })).toBe(false);
    expect(acceptsMember({ responsibilities: ['project_lead'], sources: ['program_lead'], sharing_role: null })).toBe(true);
  });

  it('does not collapse distinct accounts or recorded names by name/email', () => {
    const another = { ...active, user_id: 5, entry_id: 'user:5', label: 'Alex · Account #5' };
    const anotherName = { ...recorded, entry_id: 'recorded-name:1' };
    expect(isProjectTeamResponse(payload([active, another, recorded, anotherName]), PROGRAM)).toBe(true);
  });

  it.each(['name', 'email', 'sharing_role'])('rejects exposed %s on an unconfirmed account', field => {
    const unconfirmed = { ...active, identity: 'unconfirmed_account', name: null, email: null, sharing_role: null,
      label: 'Account #4 — Current membership not confirmed' };
    expect(isProjectTeamResponse(payload([{ ...unconfirmed, [field]: active[field as keyof typeof active] } as ProjectTeamMember]), PROGRAM)).toBe(false);
  });

  it('rejects personal identity details hidden in an unconfirmed account label', () => {
    expect(acceptsMember({ identity: 'unconfirmed_account', name: null, email: null, sharing_role: null,
      label: 'Alex (alex@example.test) — Current membership not confirmed' })).toBe(false);
  });

  it.each([
    { user_id: 4 }, { email: 'alex@example.test' }, { role: 'lead' }, { responsibilities: ['project_lead'] },
    { sharing_role: 'use' }, { sources: ['recorded_name', 'project_member'] }, { entry_id: 'user:4' }, { name: '' },
  ])('rejects account or responsibility claims on a recorded name: %j', over => {
    expect(isProjectTeamResponse(payload([{ ...recorded, ...over } as ProjectTeamMember]), PROGRAM)).toBe(false);
  });
});
