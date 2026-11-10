// @vitest-environment jsdom
/**
 * The project's work areas are direct doors (2026-10-31 client demo).
 *
 * They sat on Plan behind a "Choose work" select and a "Start selected work" button,
 * and CMC was offered only to a small-molecule US IND: a client on a biologic IND
 * could not find Biostatistics or CMC from the project at all. Each work area the
 * project's track has is now one button that opens it on the open project.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { APP_REGISTRY } from '@shared/regulatory/app-registry';
import { ProjectCoreWork, workAreasFor, type WorkAreaTrack } from '../surfaces/ProjectCoreWork';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const allow = () => true;
const DRUG: WorkAreaTrack = { deviceFiling: false, riskBasedMonitoring: false, cmcComposes: true };
const BIOLOGIC: WorkAreaTrack = { deviceFiling: false, riskBasedMonitoring: false, cmcComposes: false };
const DEVICE: WorkAreaTrack = { deviceFiling: true, riskBasedMonitoring: false, cmcComposes: false };
const doors = () => within(screen.getByRole('navigation', { name: 'This project’s work areas' })).getAllByRole('button')
  .map((b) => b.textContent?.trim());

afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the project’s work areas, as direct doors', () => {
  it('a medicinal project gets Study & protocol, Biostatistics, CMC / Module 3 and Risk-based monitoring, each one click', () => {
    render(<ProjectCoreWork programId={PID} track={DRUG} available={allow} onNav={vi.fn()} />);
    expect(doors()).toEqual([APP_REGISTRY.study_protocol_design.label, 'Biostatistics', 'CMC / Module 3', 'Risk-based monitoring']);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start selected work/ })).toBeNull();
  });

  /* D3-2a: a card in Project knowledge, headed "Work areas"; the page's Reports row comes last, in the same card. */
  it('is a "Work areas" card whose rows carry an icon, and whose last row is the one passed after them', () => {
    render(<ProjectCoreWork programId={PID} track={DRUG} available={allow} onNav={vi.fn()}><button type="button">Reports</button></ProjectCoreWork>);
    const nav = screen.getByRole('navigation', { name: 'This project’s work areas' });
    expect(within(nav).getByRole('heading', { name: 'Work areas' })).toBeTruthy();
    expect(doors().at(-1)).toBe('Reports');
    expect(nav.querySelectorAll('.pj-work-area .pj-work-area-ic svg').length).toBe(4);
  });

  it('waits for the project\u2019s track before naming an area, and still offers the row passed after them', () => {
    render(<ProjectCoreWork programId={PID} track={null} available={allow} onNav={vi.fn()}><button type="button">Reports</button></ProjectCoreWork>);
    expect(doors()).toEqual(['Reports']);
  });

  it('a biologic still gets the CMC / Module 3 door: its screen says what it composes', () => {
    render(<ProjectCoreWork programId={PID} track={BIOLOGIC} available={allow} onNav={vi.fn()} />);
    expect(doors()).toContain('CMC / Module 3');
    expect(workAreasFor(BIOLOGIC).find((a) => a.id === 'cmc')?.describe).toMatch(/says which filings it composes Module 3 for/);
  });

  it('a device filing has no protocol workspace or Module 3; risk-based monitoring only when the project records it', () => {
    expect(workAreasFor(DEVICE).map((a) => a.id)).toEqual(['biostatistics']);
    expect(workAreasFor({ ...DEVICE, riskBasedMonitoring: true }).map((a) => a.id)).toEqual(['biostatistics', 'rbm']);
  });

  it.each(['protocol-dev', 'biostatistics', 'cmc', 'rbm'])('the %s door opens that work area on the open project, in one click', (id) => {
    const project = { id: PID, title: 'BX-410' };
    (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = project;
    const onNav = vi.fn();
    render(<ProjectCoreWork programId={PID} track={DRUG} available={allow} onNav={onNav} />);
    const label = workAreasFor(DRUG).find((a) => a.id === id)!.label;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label.replace(/[()/&]/g, '.')}`) }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith(id);
    expect((window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT).toBe(project);
  });

  it('offers only the work areas this release can open, and nothing when none can be', () => {
    const { rerender } = render(<ProjectCoreWork programId={PID} track={DRUG} available={(id) => id === 'cmc'} onNav={vi.fn()} />);
    expect(doors()).toEqual(['CMC / Module 3']);
    rerender(<ProjectCoreWork programId={PID} track={DRUG} available={() => false} onNav={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: 'This project’s work areas' })).toBeNull();
  });

  it('does not open a work area whose availability changed after it was drawn', () => {
    const onNav = vi.fn();
    let open = true;
    render(<ProjectCoreWork programId={PID} track={DRUG} available={(id) => id !== 'cmc' || open} onNav={onNav} />);
    open = false;
    fireEvent.click(screen.getByRole('button', { name: /^CMC \/ Module 3/ }));
    expect(onNav).not.toHaveBeenCalled();
  });
});
