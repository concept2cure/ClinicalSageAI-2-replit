// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiscoveryAnswers } from '@shared/types/onboarding-discovery';
import { useOnboardingDiscovery } from '../useOnboardingDiscovery';
import { completeDiscovery } from './onboardingDiscoveryFixtures';

const { request, identity } = vi.hoisted(() => ({ request: vi.fn(), identity: { orgId: 7 } }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: request, redactInternals: (message: string) => message }));
vi.mock('@/utils/authToken', () => ({ getOrgId: () => identity.orgId }));
const response = (data: unknown) => ({ ok: true, json: async () => ({ data }) });
const record = (answers = completeDiscovery(), revision = 1, completedAt: string | null = null) => ({
  schemaVersion: 1, revision, answers, updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 9, completedAt,
});

beforeEach(() => {
  request.mockReset();
  identity.orgId = 7;
  request.mockImplementation(async (method: string, _path: string, body?: { answers: ReturnType<typeof completeDiscovery>; expectedRevision: number; complete: boolean }) => response({
    canEdit: true, discovery: method === 'GET' ? null : record(body!.answers, body!.expectedRevision + 1, body!.complete ? '2026-10-14T00:00:00.000Z' : null),
  }));
  localStorage.clear();
});
afterEach(cleanup);

async function ready() {
  const hook = renderHook(useOnboardingDiscovery);
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('org-wide discovery persistence', () => {
  it('loads a saved draft and preserves revision without browser persistence', async () => {
    request.mockResolvedValue(response({ canEdit: true, discovery: record() }));
    const hook = await ready();
    expect(hook.result.current.answers.projectName).toBe('Program Alpha');
    expect(hook.result.current.record?.revision).toBe(1);
    expect(localStorage.length).toBe(0);
  });

  it('saves a partial draft with a revision and audit reason, then advances revision', async () => {
    const hook = await ready();
    act(() => hook.result.current.setAnswer('companyGoal', 'Build our first evidence program.'));
    await act(async () => expect(await hook.result.current.save()).toBe(true));
    expect(request).toHaveBeenLastCalledWith('PATCH', '/api/onboarding/discovery', expect.objectContaining({
      answers: expect.objectContaining({ companyGoal: 'Build our first evidence program.' }),
      expectedRevision: 0, complete: false, reason: expect.any(String),
    }));
    expect(hook.result.current.record?.revision).toBe(1);
    expect(hook.result.current.dirty).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('refuses completion locally for incomplete answers', async () => {
    const hook = await ready();
    await act(async () => expect(await hook.result.current.save(true)).toBe(false));
    expect(request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(0);
    expect(hook.result.current.note).toMatch(/required discovery/);
  });

  it('cleans comma-input blanks before saving and requires an actual therapeutic area', async () => {
    request.mockResolvedValueOnce(response({ canEdit: true, discovery: record() }));
    const hook = await ready();
    act(() => hook.result.current.setAnswer('therapeuticAreas', [' ', '']));
    await act(async () => expect(await hook.result.current.save(true)).toBe(false));
    act(() => hook.result.current.setAnswer('therapeuticAreas', [' Oncology ', '']));
    await act(async () => expect(await hook.result.current.save(true)).toBe(true));
    expect(hook.result.current.answers.therapeuticAreas).toEqual(['Oncology']);
  });

  it('rejects an incomplete server confirmation and retains unsaved answers for retry', async () => {
    const hook = await ready();
    act(() => hook.result.current.setAnswer('companyGoal', 'Keep this edit.'));
    request.mockResolvedValue(response({ discovery: {} }));
    await act(async () => expect(await hook.result.current.save()).toBe(false));
    expect(hook.result.current.note).toMatch(/incomplete response|could not be read|did not confirm/);
    expect(hook.result.current.dirty).toBe(true);
    expect(hook.result.current.answers.companyGoal).toBe('Keep this edit.');
  });

  it('requires reload after a concurrent edit and prevents blind overwrite', async () => {
    const hook = await ready();
    act(() => hook.result.current.setAnswer('companyGoal', 'My pending edit.'));
    request.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));
    await act(async () => expect(await hook.result.current.save()).toBe(false));
    expect(hook.result.current.error).toMatch(/another session/);
    await act(async () => expect(await hook.result.current.save()).toBe(false));
    request.mockResolvedValue(response({ canEdit: true, discovery: record() }));
    act(() => hook.result.current.reloadSaved());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.answers.companyGoal).toBe(completeDiscovery().companyGoal);
  });

  it('retains answers after network refusal and permits retry', async () => {
    const hook = await ready();
    act(() => hook.result.current.setAnswer('companyGoal', 'Do not lose this.'));
    request.mockRejectedValueOnce(new Error('The server could not be reached.'));
    await act(async () => expect(await hook.result.current.save()).toBe(false));
    expect(hook.result.current.answers.companyGoal).toBe('Do not lose this.');
    expect(hook.result.current.error).toBeNull();
    await act(async () => expect(await hook.result.current.save()).toBe(true));
  });

  it('disables writes for a viewer while exposing saved discovery', async () => {
    request.mockResolvedValue(response({ canEdit: false, discovery: record() }));
    const hook = await ready();
    act(() => hook.result.current.setAnswer('companyGoal', 'Forbidden edit.'));
    expect(hook.result.current.answers.companyGoal).toBe(completeDiscovery().companyGoal);
    await act(async () => expect(await hook.result.current.save()).toBe(false));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('treats malformed reads as errors rather than as an empty editable draft', async () => {
    request.mockResolvedValue(response({}));
    const hook = await ready();
    expect(hook.result.current.error).toMatch(/incomplete response/);
    expect(hook.result.current.canEdit).toBe(false);
  });

  it('drops late read results across tenant changes', async () => {
    let release: (value: ReturnType<typeof response>) => void = () => {};
    request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const hook = renderHook(useOnboardingDiscovery);
    identity.orgId = 8;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => release(response({ canEdit: true, discovery: record() })));
    expect(hook.result.current.answers).toEqual(emptyDiscoveryAnswers());
    expect(hook.result.current.record).toBeNull();
  });
});
