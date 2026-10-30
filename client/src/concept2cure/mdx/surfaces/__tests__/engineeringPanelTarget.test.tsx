// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { resolveNavigation } from '@shared/navigation';
import { clearNavParams, stashNavParamsForTarget } from '../../../v2/navParams';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import { openEngineeringPanel, useEngineeringPanelTarget } from '../engineeringPanelTarget';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
function Headings({ pid = A }: { pid?: string | null }) {
  const target = useEngineeringPanelTarget(pid);
  return <><h2 ref={target.risk} tabIndex={-1}>Risk file</h2><h2 ref={target.designControls} tabIndex={-1}>Design trace</h2></>;
}
beforeEach(() => { clearNavParams(); publishShellProject({ id: A }); });
afterEach(() => { cleanup(); clearNavParams(); clearShellProject(); });
describe('project work opens an existing engineering subsection', () => {
  it('focuses the requested heading on arrival and consumes the handoff once', () => {
    const nav = vi.fn(); openEngineeringPanel(A, 'risk', nav);
    expect(nav).toHaveBeenCalledWith('device-engineering');
    const view = render(<Headings />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Risk file' }));
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
    view.unmount();
    render(<Headings />);
    expect(document.activeElement).toBe(document.body);
  });

  it('supports repeated moves on the already mounted feature', () => {
    render(<Headings />);
    act(() => openEngineeringPanel(A, 'design-controls', vi.fn()));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Design trace' }));
    act(() => openEngineeringPanel(A, 'risk', vi.fn()));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Risk file' }));
  });

  it('never changes the selected project or focuses another project’s panel', () => {
    openEngineeringPanel(A, 'risk', vi.fn());
    publishShellProject({ id: B });
    render(<Headings pid={B} />);
    expect(document.activeElement).toBe(document.body);
    expect(window.C2C_PROJECT?.id).toBe(B);
  });

  it('retires a handoff across A to B to A visits and session changes', () => {
    openEngineeringPanel(A, 'risk', vi.fn());
    publishShellProject({ id: B }); publishShellProject({ id: A });
    const view = render(<Headings />);
    expect(document.activeElement).toBe(document.body);
    view.unmount();
    openEngineeringPanel(A, 'risk', vi.fn());
    authService.endSession(null);
    render(<Headings />);
    expect(document.activeElement).toBe(document.body);
  });

  it('refuses unknown subsection names and leaves a current dialog in control', () => {
    expect(resolveNavigation('device-engineering', { engineeringPanel: 'unrecognized' }).ok).toBe(false);
    stashNavParamsForTarget('device-engineering', { engineeringPanel: 'unrecognized', programId: A });
    const view = render(<Headings />);
    expect(document.activeElement).toBe(document.body);
    view.rerender(<><Headings /><div role="dialog" aria-label="Current work">Keep editing</div></>);
    act(() => openEngineeringPanel(A, 'risk', vi.fn()));
    expect(document.activeElement).toBe(document.body);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
  });
});
