// @vitest-environment jsdom
/**
 * ProjectBack: the one "back to the project" link (D0-7; D5 §WA.4.2 rule 2).
 *
 * Four work areas each drew this link by hand (CMC's `CmBack`, Vault, Reporting's
 * `ReportingHead`, Biostatistics). `dataConnect.tsx` now exports it once, and each
 * owner converges onto it in its own lane
 * (docs/evidence/DESIGN/D0/D0-7-project-back/README.md). These cases pin what the
 * copies did, so converging changes nothing a person sees or does:
 *   - nothing renders while no project is open (a dead link is worse than none);
 *   - the label is the open project's title, after an arrow a screen reader skips,
 *     and "Project" when the title is missing or blank;
 *   - a click, Enter or Space goes to `project-home`;
 *   - it follows the shell channel: a project opened after mount shows its link.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProjectBack } from '../dataConnect';
import { clearShellProject, publishShellProject } from '../shellProject';

const PID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  clearShellProject();
});

describe('ProjectBack, the one way back to the project', () => {
  it('renders nothing while no project is open', () => {
    const { container } = render(<ProjectBack onNav={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a .pj-back button named by the open project, its arrow hidden from screen readers', () => {
    publishShellProject({ id: PID, title: 'C2C-101 anti-IL-23p19 mAb' });
    render(<ProjectBack onNav={vi.fn()} />);

    const back = screen.getByRole('button', { name: 'C2C-101 anti-IL-23p19 mAb' });
    expect(back.className).toBe('pj-back');
    expect(back.getAttribute('type')).toBe('button');
    const arrow = back.querySelector('svg');
    expect(arrow).not.toBeNull();
    expect(arrow!.getAttribute('aria-hidden')).toBe('true');
    expect(back.firstElementChild).toBe(arrow);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('says "Project" when the title is %s, so the button always has a name', (_label, title) => {
    publishShellProject({ id: PID, ...(title === undefined ? {} : { title }) });
    render(<ProjectBack onNav={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Project' }).className).toBe('pj-back');
  });

  /* A project opened by its link alone reaches the shell as an id, and the top
     bar's own read (Shell.tsx useNameProjectOpenedById) names it only once that
     read answers. Until then, or if it fails, the link read "Project" (the
     Reporting running-app run, docs/evidence/DESIGN/D7/2026-11-02-reporting/).
     A screen that has read the project itself passes its name. */
  it('names an id-only project by the name its screen read, until the shell has a title', () => {
    publishShellProject({ id: PID });
    render(<ProjectBack onNav={vi.fn()} name="C2C-101 anti-IL-23p19 mAb (IND)" />);
    expect(screen.getByRole('button', { name: 'C2C-101 anti-IL-23p19 mAb (IND)' }).className).toBe('pj-back');
  });

  it('prefers the shell title to the screen name, then the shell product and code, before "Project"', () => {
    publishShellProject({ id: PID, title: 'Shell title' });
    const { unmount } = render(<ProjectBack onNav={vi.fn()} name="Screen name" />);
    expect(screen.getByRole('button', { name: 'Shell title' })).toBeTruthy();
    unmount();
    clearShellProject();
    publishShellProject({ id: PID, product: 'Lumaril', code: 'LX-7' });
    render(<ProjectBack onNav={vi.fn()} name="   " />);
    expect(screen.getByRole('button', { name: 'Lumaril' })).toBeTruthy();
  });

  it('names a title that is not a string, as the copies did, and does not throw', () => {
    /* The channel is a loosely typed window global, restored from session storage
       with only its id checked; its own reader (`shellProgramName`) reads every
       field as `String(v ?? '').trim()`. A `.trim()` on a number would take the
       whole work area down with it. */
    publishShellProject({ id: PID, title: 42 as unknown as string });
    render(<ProjectBack onNav={vi.fn()} />);
    expect(screen.getByRole('button', { name: '42' }).className).toBe('pj-back');
  });

  it('goes to the project home on click', () => {
    publishShellProject({ id: PID, title: 'BX-301' });
    const onNav = vi.fn();
    render(<ProjectBack onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'BX-301' }));
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith('project-home');
  });

  it('works from the keyboard: Tab reaches it, and Enter and Space each go back', async () => {
    publishShellProject({ id: PID, title: 'BX-301' });
    const onNav = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <ProjectBack onNav={onNav} />
      </>,
    );

    await user.tab();
    expect(document.activeElement?.textContent).toBe('Before');
    await user.tab();
    const back = screen.getByRole('button', { name: 'BX-301' });
    expect(document.activeElement).toBe(back);

    await user.keyboard('{Enter}');
    expect(onNav).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onNav).toHaveBeenCalledTimes(2);
    expect(onNav.mock.calls).toEqual([['project-home'], ['project-home']]);
  });

  it('follows the shell channel: it appears when a project opens after mount and goes when it closes', () => {
    render(<ProjectBack onNav={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();

    act(() => publishShellProject({ id: PID, title: 'BX-301' }));
    expect(screen.getByRole('button', { name: 'BX-301' })).toBeTruthy();

    act(() => clearShellProject());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does nothing, and throws nothing, when the screen gives it no onNav', () => {
    publishShellProject({ id: PID, title: 'BX-301' });
    render(<ProjectBack />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'BX-301' }))).not.toThrow();
  });
});
