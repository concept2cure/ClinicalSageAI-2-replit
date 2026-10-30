// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { AuthoringAiDraft, type AuthoringAiDraftProps } from '../surfaces/AuthoringAiDraft';
import { publishShellProject } from '../shellProject';
import { WRITING_AGENCIES } from '@shared/authoring/writing-regions';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const SECTION = '44444444-4444-4444-8444-444444444444';
type Props = AuthoringAiDraftProps;
function props(extra: Partial<Props> = {}): Props {
  return { sectionId: SECTION, docId: DOC, programId: PROGRAM, sectionCode: 'purpose', sectionTitle: 'Purpose',
    docSealed: false, editorDirty: false, onAccepted: vi.fn(), onClose: vi.fn(), fireToast: vi.fn(), ...extra };
}
const region = () => screen.getByLabelText('Region') as HTMLSelectElement;
const generation = () => apiRequest.mock.calls.filter(([, path]) => String(path).endsWith('/ai/draft'));
async function draft() { await act(async () => { fireEvent.click(screen.getByTestId('ai-draft-generate')); }); }

beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`,
    { id: '7', organizationId: '12', roles: ['author'], permissions: [] }, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM });
  apiRequest.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true,
    draft: { content: 'Evidence-supported text.', draftId: 'candidate', metadata: { region: 'FDA' } } }) });
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); delete window.C2C_PROJECT; });

describe('the editor writing agency follows the admitted recorded filing', () => {
  it('opens on the EU application agency and sends that explicit choice', async () => {
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'EU_CTA', draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(region().value).toBe('EMA');
    await draft();
    expect(generation()[0][2]).toEqual({ tone: 'professional', region: 'EMA' });
  });

  it('uses the exact saved section agency before a different program or caller preference', async () => {
    render(<AuthoringAiDraft {...props({ region: 'FDA', recordedFiling: { registryId: 'US_IND',
      draftingRegion: 'PMDA', draftingRegionState: 'recorded', state: 'ready' } })} />);
    expect(region().value).toBe('PMDA');
    await draft();
    expect(generation()[0][2]).toEqual({ tone: 'professional', region: 'PMDA' });
  });

  it('lets a GLOBAL section defer to the recorded application', () => {
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'CA_CTA', draftingRegion: null,
      draftingRegionState: 'global', state: 'ready' } })} />);
    expect(region().value).toBe('Health Canada');
  });

  it('requires an explicit supported choice when no receiving agency is recorded', async () => {
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: null, draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(region().value).toBe('');
    expect(screen.getByTestId('ai-draft-generate').hasAttribute('disabled')).toBe(true);
    await draft(); expect(generation()).toHaveLength(0);
    fireEvent.change(region(), { target: { value: 'Health Canada' } });
    await draft();
    expect(generation()[0][2]).toEqual({ tone: 'professional', region: 'Health Canada' });
  });

  it('offers the complete shared writing vocabulary and opens on MHRA for a UK application', () => {
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'UK_CTA', draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(Array.from(region().options).map(option => option.value)).toEqual(['', ...WRITING_AGENCIES]);
    expect(region().value).toBe('MHRA');
  });

  it('holds an unavailable exact section reference instead of falling back to its US program', async () => {
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'US_IND', draftingRegion: null,
      draftingRegionState: 'unavailable', state: 'ready' } })} />);
    expect(region().value).toBe('');
    fireEvent.change(region(), { target: { value: 'FDA' } });
    await draft(); expect(generation()).toHaveLength(0);
    expect(screen.getByTestId('ai-draft-region-note').textContent).toMatch(/section.*reference.*unavailable|section.*could not be verified/i);
  });

  it('updates an untouched default when the scoped read completes and changes projects', () => {
    const view = render(<AuthoringAiDraft {...props({ recordedFiling: { state: 'loading' } })} />);
    expect(region().value).toBe('');
    view.rerender(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'EU_CTA', draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(region().value).toBe('EMA');
    publishShellProject({ id: OTHER });
    view.rerender(<AuthoringAiDraft {...props({ programId: OTHER, recordedFiling: { registryId: 'JP_CTN', draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(region().value).toBe('PMDA');
    expect(generation()).toHaveLength(0);
  });

  it('keeps a person’s supported selection and states the application mismatch', () => {
    const view = render(<AuthoringAiDraft {...props({ recordedFiling: { state: 'loading' } })} />);
    fireEvent.change(region(), { target: { value: 'FDA' } });
    view.rerender(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'EU_CTA', draftingRegionState: 'not-recorded', state: 'ready' } })} />);
    expect(region().value).toBe('FDA');
    expect(screen.getByTestId('ai-draft-region-note').textContent).toMatch(/FDA.*differs.*EMA/);
  });

  it('blocks an old unsupported retained choice without discarding the reviewed candidate', async () => {
    const state = { draft: { sectionId: SECTION, generated: 'Original text.', draftId: 'old-candidate', metadata: {}, check: null },
      body: 'Human-reviewed text.', changeReason: 'Checked sources.', refusal: null,
      generationInputs: { tone: 'professional', region: 'UnknownAgency', context: '', requirements: '' } };
    const update = vi.fn();
    render(<AuthoringAiDraft {...props({ recordedFiling: { registryId: 'EU_CTA', draftingRegionState: 'not-recorded', state: 'ready' },
      reviewSession: { state, update, isCurrent: () => true } })} />);
    expect(screen.getByTestId('ai-draft-regenerate').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('ai-draft-region-note').textContent).toMatch(/UnknownAgency.*not supported/);
    expect(screen.queryByRole('button', { name: 'Revise' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('ai-draft-regenerate')); });
    expect(generation()).toHaveLength(0);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Human-reviewed text.');
    expect(screen.getByTestId('ai-draft-accept').hasAttribute('disabled')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
