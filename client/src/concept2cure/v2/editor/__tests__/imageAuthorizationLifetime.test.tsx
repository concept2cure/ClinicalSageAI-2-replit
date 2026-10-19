// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { clearAuthToken, getAuthToken, setAuthToken } from '@/utils/authToken';
import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringImage, resolveImageSrc } from '../imageNode';
import { AuthoredHtml } from '../AuthoredHtml';

const REF = '/api/authoring/images/file_931_acce55';
const createUrl = vi.fn(() => 'blob:authorized-figure');
const revokeUrl = vi.fn();
const granted = () => ({ ok: true, status: 200, blob: async () => new Blob(['stored-figure'], { type: 'image/png' }) });

beforeEach(() => {
  apiRequest.mockReset(); createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  setAuthToken('viewer-one');
});
afterEach(() => { cleanup(); clearAuthToken(); vi.unstubAllGlobals(); });

describe('governed figures use current viewer authorization', () => {
  it('checks access again when a new viewer opens the same figure', async () => {
    apiRequest.mockImplementation(async () => getAuthToken() === 'viewer-one' ? granted() : { ok: false, status: 403 });
    await expect(resolveImageSrc(REF)).resolves.toBe('blob:authorized-figure');
    setAuthToken('viewer-two');
    await expect(resolveImageSrc(REF)).rejects.toThrow('HTTP 403');
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('checks the server again after project access is revoked in the same session', async () => {
    apiRequest.mockResolvedValueOnce(granted()).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(resolveImageSrc(REF)).resolves.toBe('blob:authorized-figure');
    await expect(resolveImageSrc(REF)).rejects.toThrow('HTTP 403');
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('does not publish bytes from a request completing after logout', async () => {
    let finish!: (value: ReturnType<typeof granted>) => void;
    apiRequest.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = resolveImageSrc('/api/authoring/images/file_932_abcdef');
    clearAuthToken(); finish(granted());
    await expect(pending).rejects.toThrow(/session changed/i);
    expect(createUrl).not.toHaveBeenCalled();
  });
});

describe('figure URLs belong to their mounted view', () => {
  it('releases the editor figure when its node view is destroyed', async () => {
    apiRequest.mockResolvedValue(granted());
    const host = document.createElement('div'); document.body.append(host);
    const editor = new Editor({ element: host, extensions: [StarterKit, AuthoringImage], content: `<img src="${REF}" alt="Stored figure">` });
    await waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    editor.destroy(); host.remove();
    expect(revokeUrl).toHaveBeenCalledWith('blob:authorized-figure');
  });

  it('releases read-only figure bytes and makes a fresh request on remount', async () => {
    apiRequest.mockResolvedValueOnce(granted()).mockResolvedValueOnce({ ok: false, status: 403 });
    const html = `<p>Stored narrative.</p><img src="${REF}" alt="Stored figure">`;
    const first = render(<AuthoredHtml html={html} />);
    await waitFor(() => expect(first.container.querySelector('img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    first.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:authorized-figure');
    const next = render(<AuthoredHtml html={html} />);
    await waitFor(() => expect(next.container.textContent).toContain('you don’t have access'));
    expect(next.container.querySelector('img')).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('states a current permission refusal thrown by the canonical request transport', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError('Permission denied.', 403));
    const view = render(<AuthoredHtml html={`<img src="${REF}" alt="Stored figure">`} />);
    await waitFor(() => expect(view.container.textContent).toContain('you don’t have access'));
    expect(view.container.querySelector('img')).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('releases read-only bytes arriving after the view has unmounted', async () => {
    let finish!: (value: ReturnType<typeof granted>) => void;
    apiRequest.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<AuthoredHtml html={`<img src="${REF}" alt="Stored figure">`} />);
    view.unmount(); finish(granted());
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:authorized-figure'));
  });
});
