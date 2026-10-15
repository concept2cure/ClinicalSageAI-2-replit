// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'fixture-token' }));
import { TemplateGuidance } from '../TemplateGuidance';
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const guide = { template_guidance: [{ guidance_text: 'Check the retained study source.', compliance_checklist: ['Verify study identity.'],
  regulatory_references: ['ICH M4'], common_pitfalls: ['Do not invent a GLP statement.'], source_reference: 'server/private/implementation.ts',
  template_source: { kind: 'preparation', limitations: ['The worksheet does not replace the original.'] } }] };
beforeEach(() => { apiRequest.mockReset().mockResolvedValue(ok(guide)); });
afterEach(cleanup);

describe('template guidance remains separate from authored evidence', () => {
  it('reads the exact saved section and shows the existing source disclosure', async () => {
    render(<TemplateGuidance sectionId="section-one" />);
    await screen.findByText('Verify study identity.');
    fireEvent.click(screen.getByText('Template guidance and source requirements'));
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/authoring/guidance/section-one');
    expect(screen.getByText('The worksheet does not replace the original.')).toBeTruthy();
    expect(screen.queryByText('server/private/implementation.ts')).toBeNull();
    expect(document.querySelector('.tiptap')).toBeNull();
  });

  it('reports a refused read and retries without showing a false empty guide', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Current view permission is required.'));
    render(<TemplateGuidance sectionId="section-one" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('No template guidance is recorded for this section.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry guidance' }));
    await screen.findByText('Verify study identity.');
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('refuses malformed requirement lists without presenting partial guidance', async () => {
    apiRequest.mockResolvedValueOnce(ok({ template_guidance: [{ guidance_text: 'Partial guide.', compliance_checklist: 'unsupported payload' }] }));
    render(<TemplateGuidance sectionId="section-one" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Partial guide.')).toBeNull();
  });

  it('never mixes a late earlier section response into the current section', async () => {
    let resolveOld!: (value: Response) => void;
    apiRequest.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }));
    const view = render(<TemplateGuidance sectionId="section-one" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    view.rerender(<TemplateGuidance sectionId="section-two" />);
    await screen.findByText('Verify study identity.');
    resolveOld(ok({ template_guidance: [{ guidance_text: 'Old section guidance.' }] }));
    await waitFor(() => expect(screen.queryByText('Old section guidance.')).toBeNull());
  });
});
