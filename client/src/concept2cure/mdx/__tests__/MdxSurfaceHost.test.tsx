// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

const state = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: vi.fn() }));
vi.mock('../hooks/useMdxPrograms', () => ({ useMdxPrograms: () => state }));
vi.mock('../surfaces/K510Surface', () => ({ K510Surface: ({ program }: { program: Program }) => <div data-testid="selected-program">{program.id}</div> }));
vi.mock('../surfaces/SoftwareSurface', () => ({ SoftwareSurface: ({ program }: { program: Program }) => <div data-testid="selected-program">{program.id}</div> }));
vi.mock('../surfaces/PostmarketSurface', () => ({ PostmarketSurface: ({ program }: { program: Program }) => <div data-testid="selected-program">{program.id}</div> }));
vi.mock('../surfaces/CerSurface', () => ({ CerSurface: ({ program, onOpenEditor }: { program: Program; onOpenEditor: (section: { code: string; label: string }) => void }) => <div data-testid="selected-program">{program.id}<button onClick={() => onOpenEditor({ code: '4', label: 'Clinical evaluation' })}>Open clinical section</button></div> }));
vi.mock('../surfaces/IvdSurface', () => ({ IvdSurface: ({ onOpenEditor }: { onOpenEditor: (section: { code: string; label: string }) => void }) => <button onClick={() => onOpenEditor({ code: 'II.6.2', label: 'Performance evaluation' })}>Open performance section</button> }));
import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';
import { consumeEditorTarget } from '../../v2/editorTarget';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const row = (id: string, over: Partial<Program> = {}) => ({ id, title: `Device ${id.slice(0, 4)}`, pathway: 'k510', productType: 'device', ...over } as Program);
const props = () => ({ surface: { id: 'device-510k' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps);
beforeEach(() => { state.programs = [row(A), row(B)]; state.loading = false; state.error = null; state.refresh.mockClear(); });
afterEach(() => { cleanup(); clearShellProject(); consumeEditorTarget(); sessionStorage.clear(); });

describe('MDX project context isolation', () => {
  it('says which postmarket panels are this project\'s, without changing the selected project', () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-postmarket" />);
    /* Slice 0: the organisation-wide surveillance panels are no longer shown on a project, so the banner no longer says they are. */
    expect(screen.getByText('Reporting clocks are for this project; signals, CAPA board, trends and PMS plan execution are not shown until they are read for this project')).toBeTruthy();
    expect(screen.queryByText(/organization-wide surveillance feeds/)).toBeNull();
    expect(screen.getByTestId('selected-program').textContent).toBe(A);
  });
  it('requires an explicit project selection before mounting a project feature', () => {
    render(<MdxSurfaceHost {...props()} nav="device-510k" />);
    expect(screen.getByText('Open a project to continue')).toBeTruthy();
    expect(screen.queryByTestId('selected-program')).toBeNull();
  });

  it('never substitutes another same-pathway project for an unavailable selection', () => {
    publishShellProject({ id: '33333333-3333-4333-8333-333333333333' });
    render(<MdxSurfaceHost {...props()} nav="device-510k" />);
    expect(screen.queryByTestId('selected-program')).toBeNull();
    expect(screen.getByTestId('mdx-project-required')).toBeTruthy();
  });

  it('software does not borrow the first project', () => {
    render(<MdxSurfaceHost {...props()} nav="device-software" />);
    expect(screen.queryByTestId('selected-program')).toBeNull();
    expect(screen.getByTestId('mdx-project-required')).toBeTruthy();
  });

  it('keeps the selected project and responds when the shell switches projects', () => {
    publishShellProject({ id: B });
    const p = props();
    render(<MdxSurfaceHost {...p} nav="device-software" />);
    expect(screen.getByTestId('selected-program').textContent).toBe(B);
    act(() => publishShellProject({ id: A }));
    expect(screen.getByTestId('selected-program').textContent).toBe(A);
    fireEvent.click(screen.getByRole('button', { name: 'Return to project workflow' }));
    expect(p.onNav).toHaveBeenCalledWith('project-home');
  });

  it('withholds the leaf on a failed context read and offers a retry', () => {
    publishShellProject({ id: A }); state.error = 'The programs register could not be read.';
    render(<MdxSurfaceHost {...props()} nav="device-510k" />);
    expect(screen.queryByTestId('selected-program')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it('routes an IVD away from MDR CER into performance evaluation', () => {
    publishShellProject({ id: A }); state.programs = [row(A, { productType: 'ivd' })];
    const p = props(); render(<MdxSurfaceHost {...p} nav="device-cer" />);
    expect(screen.queryByTestId('selected-program')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open diagnostic evidence' }));
    expect(p.onNav).toHaveBeenCalledWith('device-diagnostics');
  });

  it('opens the CER document type for the selected project, preserving pathway-specific authoring', () => {
    publishShellProject({ id: A });
    const p = props(); render(<MdxSurfaceHost {...p} nav="device-cer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open clinical section' }));
    expect(consumeEditorTarget()).toMatchObject({ docType: 'cer', programId: A, sectionCode: '4' });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
  });

  it('keeps a secondary IVDR performance section out of the primary 510(k) document', () => {
    publishShellProject({ id: A });
    const p = props(); render(<MdxSurfaceHost {...p} nav="device-diagnostics" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open performance section' }));
    expect(consumeEditorTarget()).toMatchObject({ docType: 'ivdr', programId: A, sectionCode: 'II.6.2' });
  });
});
