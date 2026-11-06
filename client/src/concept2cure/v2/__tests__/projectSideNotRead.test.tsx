// @vitest-environment jsdom
/**
 * Author's Memory and Instructions cards (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, the project-home row).
 *
 * An unselected project cannot be read. The reached cards must keep this
 * separate from a successful no-profile or empty-field response.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ProjectSide } from '../surfaces/ProjectSide';

afterEach(() => cleanup());

describe('Project knowledge: no selected project', () => {
  /* D3-2a: Memory and Instructions are one card, "What AnA knows", which says once that it cannot read. */
  it('offers no profile absence claim or request without a current project', () => {
    render(<ProjectSide pid={null} />);
    const card = screen.getByRole('heading', { name: 'What AnA knows' }).closest('section') as HTMLElement;
    expect(within(card).getAllByText('Select a project and sign in to read its saved profile context.')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Records' })).toBeNull();
    expect(screen.queryByText(/No project memory yet/)).toBeNull();
    expect(screen.queryByText(/No custom instructions yet/)).toBeNull();
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
