// @vitest-environment jsdom
/**
 * Author's Memory and Instructions cards (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, the project-home row).
 *
 * Both cards read nothing: AnA's project memory and the project's authoring
 * instructions live on the numeric project's intelligence profile, which this
 * page (keyed by the regulatory program) has no read for. They said "No project
 * memory yet" and "No custom instructions yet" on every project — an absence of
 * a read rendered as a fact about the project. They now say the page does not
 * read them, and never that there is nothing.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ProjectSide } from '../surfaces/ProjectSide';

afterEach(() => cleanup());

const dossier = { state: { loading: true, data: null }, retry: () => {} } as never;

describe('Author side column: what this page does not read', () => {
  it('Memory and Instructions say they are not read here, never that there is none', () => {
    render(<ProjectSide pid={null} dossier={dossier} />);
    for (const name of ['Memory', 'Instructions']) {
      const card = screen.getByRole('heading', { name }).closest('section') as HTMLElement;
      expect(within(card).getByText('Not read on this page yet')).toBeTruthy();
    }
    expect(screen.queryByText(/No project memory yet/)).toBeNull();
    expect(screen.queryByText(/No custom instructions yet/)).toBeNull();
  });
});
