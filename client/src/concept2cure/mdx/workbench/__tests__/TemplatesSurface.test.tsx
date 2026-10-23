// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplatesSurface } from '../TemplatesSurface';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('preserved optional template surface', () => {
  it('continues to open a returned template through its existing authoring handoff', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      templates: [{ id: '7', name: 'Protocol outline', source: 'ind' }],
    }) })));
    const onAskAna = vi.fn();
    render(<TemplatesSurface onAskAna={onAskAna} />);
    fireEvent.click(await screen.findByRole('button', { name: /Protocol outline/ }));
    expect(onAskAna).toHaveBeenCalledWith(expect.stringContaining('Open template "Protocol outline"'));
  });
});
