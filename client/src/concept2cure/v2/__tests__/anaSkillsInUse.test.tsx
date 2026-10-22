// @vitest-environment jsdom
/**
 * Skills in use: what a person picks in AnA's composer rides on every turn of
 * that conversation, each answer says which skills it followed and why, a
 * project's skills are deployed or turned off there only with a reason, and a
 * skill is tried against a question before it is saved.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));

const send = vi.hoisted(() => vi.fn());
const chatMessages = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.value,
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send,
    threadId: null,
  }),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { ComposerSkills } from '../ComposerSkills';
import { ConversationThread } from '../surfaces/ConversationThread';
import { ProjectSkills } from '../ProjectSkills';
import { SkillStudio } from '../SkillStudio';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const AVAILABLE = ['labeling', 'cmc.stability', 'biostatistics', 'clinical'].map(key => ({
  key,
  name: `Skill ${key}`,
  description: `Method for ${key}.`,
  source: 'library',
  disciplines: ['labeling'],
  useCases: ['review'],
  segments: [],
  projectOnly: false,
  projectState: null,
}));

beforeEach(() => {
  apiRequest.mockReset();
  send.mockReset();
  chatMessages.value = [];
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('the Skills menu in the composer', () => {
  it('lists what is on, picks up to three, and says AnA chooses when none is picked', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/ana-skills/available') return ok({ skills: AVAILABLE });
      throw new Error(`unexpected ${url}`);
    });
    const onChange = vi.fn();
    const { rerender } = render(<ComposerSkills projectId={null} chosen={[]} onChange={onChange} />);
    expect(screen.getByTestId('ct-skills-pill').textContent).toBe('Skills: AnA chooses');
    fireEvent.click(screen.getByTestId('ct-skills-pill'));
    fireEvent.click(await screen.findByLabelText(/Skill labeling/));
    expect(onChange).toHaveBeenCalledWith(['labeling']);

    rerender(<ComposerSkills projectId={null} chosen={['labeling', 'cmc.stability', 'biostatistics']} onChange={onChange} />);
    await screen.findByText('3 skills picked. Remove one to pick another.');
    expect((screen.getByLabelText(/Skill clinical/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('ct-skills-pill').textContent).toBe('Skills: 3 chosen');
  });

  it('says a failed read failed, and that AnA still chooses', async () => {
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError('boom', 503, {});
    });
    render(<ComposerSkills projectId="0f3c1a2b-1111-4222-8333-444455556666" chosen={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ct-skills-pill'));
    await screen.findByText(/Couldn't load the skills\. Nothing was changed; AnA still chooses on her own\./);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/ana-skills/available?project=0f3c1a2b-1111-4222-8333-444455556666');
  });
});

describe('a conversation with skills picked', () => {
  const props: OwnedSurfaceViewProps = {
    surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
    segment: 'biopharma',
    onNav: () => {},
  };

  it('sends what was picked with the turn', async () => {
    apiRequest.mockImplementation(async () => ok({ skills: AVAILABLE }));
    window.sessionStorage.setItem('c2c.ana-skills.v1', JSON.stringify({ __new__: ['labeling'] }));
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
    render(<ConversationThread {...props} />);
    const chip = document.querySelector<HTMLButtonElement>('.ct-empty-chip')!;
    fireEvent.click(chip);
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][2]).toMatchObject({ skills: ['labeling'] });
  });

  it('shows on an answer which skills it followed, and why each loaded', () => {
    chatMessages.value = [
      { id: 'u1', role: 'user', text: 'How do we justify the shelf life?' },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Start from the long-term data.',
        streaming: false,
        contextUsed: {
          uploads: [],
          unresolvedUploads: 0,
          memory: [],
          memoryStatus: 'none',
          skills: [
            { key: 'cmc.stability', name: 'Stability programs', source: 'library', version: 1, reasons: ['asked about "shelf life"'], chosen: null },
            { key: 'labeling', name: 'Labeling', source: 'library', version: 1, reasons: ['chosen in this conversation'], chosen: 'picked' },
          ],
          skillsStatus: 'loaded',
        },
      },
    ];
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current' };
    render(<ConversationThread {...props} />);
    const row = screen.getByTestId('ct-skills-used');
    expect(within(row).getByText('Stability programs').closest('[title]')?.getAttribute('title')).toBe('asked about "shelf life"');
    expect(within(row).getByText('AnA chose')).toBeTruthy();
    expect(within(row).getByText('you picked')).toBeTruthy();
  });
});

describe('a project’s Skills card', () => {
  const PROGRAM = '0f3c1a2b-1111-4222-8333-444455556666';
  const project = (over: Record<string, unknown> = {}) => ({
    projectId: 9,
    settings: [{ key: 'cmc', name: 'CMC strategy', state: 'always', reason: 'Every turn here is CMC.', updatedAt: null }],
    skills: [],
    alwaysMax: 3,
    canChange: true,
    ...over,
  });

  it('deploys a skill only with a stated reason, and sends the reason', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === `/api/ana-skills/projects/${PROGRAM}`) return ok(project());
      if (method === 'GET' && url === `/api/ana-skills/available?project=${PROGRAM}`) return ok({ skills: AVAILABLE });
      if (method === 'PUT') return ok({ changed: true });
      throw new Error(`unexpected ${method} ${url}`);
    });
    render(<ProjectSkills projectRef={PROGRAM} />);
    await screen.findByText('CMC strategy');
    fireEvent.click(screen.getByRole('button', { name: /Deploy a skill/ }));
    const dialog = await screen.findByTestId('project-skill-dialog');
    fireEvent.click(await within(dialog).findByLabelText(/Skill labeling/));
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByTestId('project-skill-submit'));
    await within(dialog).findByText(/A reason of at least 8 characters is required/);
    expect(apiRequest).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());

    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'This program files labeling every sequence.' } });
    fireEvent.click(within(dialog).getByTestId('project-skill-submit'));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('PUT', `/api/ana-skills/projects/${PROGRAM}/settings/labeling`, {
        state: 'always',
        reason: 'This program files labeling every sequence.',
      }),
    );
  });

  it('shows a reader the project’s skills without the actions', async () => {
    apiRequest.mockImplementation(async () => ok(project({ canChange: false })));
    render(<ProjectSkills projectRef={PROGRAM} />);
    await screen.findByText('CMC strategy');
    expect(screen.queryByRole('button', { name: /Deploy a skill/ })).toBeNull();
    expect(screen.getByText('Your role on this project can read its skills, not change them.')).toBeTruthy();
  });

  it('says a failed or malformed read failed, never that the project has no skills', async () => {
    apiRequest.mockImplementation(async () => ok({}));
    render(<ProjectSkills projectRef={PROGRAM} />);
    await screen.findByText("Couldn't load the project's skills");
    expect(screen.queryByText('No skill is deployed to this project.')).toBeNull();
  });
});

describe('the skill studio', () => {
  it('tries a question against the draft before anything is saved, and saves only with a reason', async () => {
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (url === '/api/ana-skills/test') {
        return ok({
          selection: { selected: [{ key: 'org:draft', name: 'Zebra review', source: 'organization', version: 0, contentHash: 'x', score: 4, reasons: ['asked about "zebra protocol"'], chosen: null, attached: [] }], passedOver: [], considered: 10 },
          draftKey: 'org:draft',
          body,
        });
      }
      if (method === 'POST' && url === '/api/ana-skills/projects/0f3c/skills') return ok({ skill: {} });
      throw new Error(`unexpected ${method} ${url}`);
    });
    const onSaved = vi.fn();
    render(<SkillStudio target={{ kind: 'org', skill: null, base: null, mode: null, projectId: '0f3c' }} onClose={vi.fn()} onSaved={onSaved} />);
    const studio = screen.getByTestId('skill-studio');
    fireEvent.change(within(studio).getByLabelText('Name'), { target: { value: 'Zebra review' } });
    fireEvent.change(within(studio).getByLabelText('Trigger phrases'), { target: { value: 'zebra protocol' } });
    fireEvent.change(within(studio).getByLabelText(/Type a question/), { target: { value: 'Review our zebra protocol.' } });
    fireEvent.click(within(studio).getByRole('button', { name: 'Try it' }));
    await within(studio).findByText('This skill would load for that question.');
    const tried = apiRequest.mock.calls.find(c => c[1] === '/api/ana-skills/test')![2] as Record<string, unknown>;
    expect(tried).toMatchObject({ message: 'Review our zebra protocol.', project: '0f3c' });
    expect((tried.draft as { triggers: string[] }).triggers).toEqual(['zebra protocol']);

    fireEvent.click(within(studio).getByTestId('skill-studio-save'));
    await within(studio).findByText(/A reason of at least 8 characters is required/);
    expect(apiRequest).not.toHaveBeenCalledWith('POST', '/api/ana-skills/projects/0f3c/skills', expect.anything());

    fireEvent.change(within(studio).getByLabelText(/Reason for change/), { target: { value: 'Our reviewers asked for this.' } });
    fireEvent.click(within(studio).getByTestId('skill-studio-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Zebra review created.'));
    const saved = apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/ana-skills/projects/0f3c/skills')![2] as Record<string, unknown>;
    expect(saved).toMatchObject({ name: 'Zebra review', triggers: ['zebra protocol'], reason: 'Our reviewers asked for this.' });
  });
});
