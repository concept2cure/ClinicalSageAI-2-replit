// @vitest-environment jsdom
/**
 * ProjectMarkets (the Submit step) offers a device project's filing assembly
 * from the project read it is given (D2, 2026-10-29). The door is the one
 * Plan's submission-assembly workstream offers (PATHWAY_FEATURES), for the
 * pathway the project records, gated on whether this release can open its
 * feature. projectSubmitDeviceFiling.test.tsx holds the same door on the real
 * ProjectHome Submit step.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProjectMarkets } from '../surfaces/ProjectMarkets';
import type { MdxWorkflowProject } from '../surfaces/ProjectMdxWorkflow';
import { DEVICE_DOORS } from '../projectDoors';
import { getSurfaceMeta } from '../registryModel';

const markets = { list: { rows: [], loading: false, empty: true }, notOffered: 0, markets: [], retryList: vi.fn(), retryMarket: vi.fn() } as never;
const PROJECT: MdxWorkflowProject = {
  id: '3c1e9b40-7d2a-4f6b-9e85-0a1b2c3d4e5f', name: 'Client device', program_type: '510k', product_type: 'device',
  regulatory_path: null, primary_agency: 'FDA', device_flags: [],
};
/* Each pathway's feature, written as the expectation: a door that opens the wrong one has to fail. */
const PATHWAYS = [
  { programType: '510k', productType: 'device', door: DEVICE_DOORS.pathway['510k'].assembly, surface: 'device-510k' },
  { programType: 'PMA', productType: 'device', door: DEVICE_DOORS.pathway.pma.assembly, surface: 'device-pma' },
  { programType: 'MDR', productType: 'device', door: DEVICE_DOORS.pathway.mdr.assembly, surface: 'device-cer' },
  { programType: 'IVDR', productType: 'ivd', door: DEVICE_DOORS.pathway.ivdr.assembly, surface: 'device-diagnostics' },
] as const;
const PATHWAY_NAMES = Object.values(DEVICE_DOORS.pathway).flatMap((p) => [p.assembly, p.strategy]);
const pathwayButtons = () => screen.queryAllByRole('button').filter((b) => PATHWAY_NAMES.some((name) => b.textContent?.includes(name)));

function draw(project: MdxWorkflowProject | null, opts: { deviceFiling?: boolean; available?: (id: string) => boolean } = {}) {
  const onNav = vi.fn();
  const available = vi.fn(opts.available ?? (() => true));
  render(<ProjectMarkets markets={markets} onNav={onNav} available={available} ectdFiling={false}
    deviceFiling={opts.deviceFiling ?? true} project={project} />);
  return { onNav, available };
}

afterEach(cleanup);

describe('ProjectMarkets — a device project’s filing assembly', () => {
  it.each(PATHWAYS)('a $programType project is offered "$door", which opens $surface', ({ programType, productType, door, surface }) => {
    const { onNav } = draw({ ...PROJECT, program_type: programType, product_type: productType });
    const button = screen.getByRole('button', { name: door });
    expect(pathwayButtons()).toEqual([button]);
    fireEvent.click(button);
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith(surface);
  });

  it.each(PATHWAYS)('asks whether $surface can be opened, and when it cannot, says so with no button', ({ programType, productType, door, surface }) => {
    const { available } = draw({ ...PROJECT, program_type: programType, product_type: productType }, { available: (id) => id !== surface });
    expect(available).toHaveBeenCalledWith(surface);
    expect(screen.queryByRole('button', { name: door })).toBeNull();
    expect(pathwayButtons()).toEqual([]);
    expect(screen.getByTestId('pj-mkt-door-unavailable').textContent)
      .toBe(`${getSurfaceMeta(surface).label}, where this filing is assembled, is not part of this release.`);
  });

  it('reads the recorded regulatory path when the filing type names no pathway', () => {
    const { onNav } = draw({ ...PROJECT, program_type: null, regulatory_path: '510(k)' });
    fireEvent.click(screen.getByRole('button', { name: DEVICE_DOORS.pathway['510k'].assembly }));
    expect(onNav).toHaveBeenCalledWith('device-510k');
  });

  it.each([
    ['a project not yet read', null, true],
    ['a pathway with no feature (De Novo)', { ...PROJECT, program_type: 'de_novo' }, true],
    ['a device project that records no pathway', { ...PROJECT, program_type: null, regulatory_path: null }, true],
    ['a project the step does not treat as a device filing', PROJECT, false],
  ] as const)('%s is given no door and no words', (_, project, deviceFiling) => {
    draw(project, { deviceFiling });
    expect(pathwayButtons()).toEqual([]);
    expect(screen.queryByTestId('pj-mkt-door-unavailable')).toBeNull();
  });
});
