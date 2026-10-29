// @vitest-environment jsdom
/**
 * Plan's device workflow opens the Pre-Sub manager, the label and IFU, and the
 * UDI check (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-reach-three/).
 *
 * The map places all three in the project (INFORMATION_ARCHITECTURE.md
 * section 5, `device-presub`, `labeling` and `device-udi` rows; section 6,
 * "Device label and IFU"; slices 12 and 20). Their screens now read the open
 * project, so Plan offers them through the doors it already draws:
 *  - "Prepare a Pre-Sub for FDA", on the regulatory strategy workstream, only
 *    when the project records an FDA route (510(k), De Novo or PMA). A Q-Sub is
 *    FDA's programme; an EU MDR or IVDR filing has no Pre-Sub.
 *  - "Write the label and IFU", on the labeling workstream, and "Check each
 *    label's UDI", on the registration and UDI workstream. The compiler plans
 *    both for every device route.
 * Each is offered only when the feature is available to the organization. When
 * it is not, labeling and UDI keep the door they had (Author), and the Pre-Sub
 * door is not drawn.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { ProjectMdxWorkflow, type MdxWorkflowProject } from '../surfaces/ProjectMdxWorkflow';
import { DEVICE_DOORS } from '../projectDoors';

afterEach(cleanup);

const BASE: MdxWorkflowProject = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Client device', primary_agency: 'FDA', device_flags: [],
  product_type: 'device', program_type: '510K', regulatory_path: '510k',
};
const ROUTES = {
  '510(k)': { program_type: '510K', regulatory_path: '510k' },
  'De Novo': { program_type: 'DE_NOVO', regulatory_path: 'de_novo' },
  PMA: { program_type: 'PMA', regulatory_path: 'pma' },
  MDR: { program_type: 'MDR', regulatory_path: null },
  IVDR: { program_type: 'IVDR', regulatory_path: null },
  HDE: { program_type: 'HDE', regulatory_path: 'hde' },
} as const;
const PRODUCTS = ['device', 'samd', 'ivd', 'cdx'] as const;

function draw(route: keyof typeof ROUTES, product: string, opts: { otherFilings?: string[]; available?: (id: string) => boolean } = {}) {
  const onNav = vi.fn();
  const onStage = vi.fn();
  const view = render(<ProjectMdxWorkflow project={{ ...BASE, ...ROUTES[route], product_type: product }} otherFilings={opts.otherFilings ?? []}
    marketsState="ready" onNav={onNav} onStage={onStage} onAsk={vi.fn()} available={opts.available ?? (() => true)} />);
  const pkg = (id: string) => view.container.querySelector(`[data-work-package="${id}"]`) as HTMLElement | null;
  return { view, onNav, onStage, pkg };
}

describe('the Pre-Sub door: only for a recorded FDA route', () => {
  it.each((['510(k)', 'De Novo', 'PMA'] as const).flatMap((route) => PRODUCTS.map((product) => [route, product] as const)))(
    'a %s %s project is offered it on regulatory strategy, and it opens the Pre-Sub manager', (route, product) => {
      const { pkg, onNav } = draw(route, product);
      fireEvent.click(within(pkg('regulatory-strategy')!).getByRole('button', { name: DEVICE_DOORS.preSub }));
      expect(onNav).toHaveBeenLastCalledWith('device-presub');
    });

  it.each((['MDR', 'IVDR', 'HDE'] as const).flatMap((route) => PRODUCTS.map((product) => [route, product] as const)))(
    'a %s %s project is not offered it anywhere', (route, product) => {
      const { view } = draw(route, product);
      expect(within(view.container).queryByRole('button', { name: DEVICE_DOORS.preSub })).toBeNull();
    });

  it('an EU filing added to a 510(k) keeps the door, and an EU filing added to an EU filing does not add it', () => {
    expect(within(draw('510(k)', 'device', { otherFilings: ['MDR'] }).view.container).queryAllByRole('button', { name: DEVICE_DOORS.preSub })).toHaveLength(1);
    cleanup();
    expect(within(draw('MDR', 'cdx', { otherFilings: ['IVDR'] }).view.container).queryByRole('button', { name: DEVICE_DOORS.preSub })).toBeNull();
  });

  it('is not drawn when the Pre-Sub manager is not available to the organization', () => {
    const { view } = draw('510(k)', 'device', { available: (id) => id !== 'device-presub' });
    expect(within(view.container).queryByRole('button', { name: DEVICE_DOORS.preSub })).toBeNull();
  });
});

describe('the label and UDI doors: every device route', () => {
  it.each((Object.keys(ROUTES) as Array<keyof typeof ROUTES>).flatMap((route) => PRODUCTS.map((product) => [route, product] as const)))(
    'a %s %s project opens the label and IFU, and the UDI check', (route, product) => {
      const { pkg, onNav } = draw(route, product);
      fireEvent.click(within(pkg('labeling')!).getByRole('button', { name: DEVICE_DOORS.label }));
      expect(onNav).toHaveBeenLastCalledWith('labeling');
      fireEvent.click(within(pkg('registration-udi')!).getByRole('button', { name: DEVICE_DOORS.udi }));
      expect(onNav).toHaveBeenLastCalledWith('device-udi');
    });

  it.each([['labeling', 'labeling'], ['registration-udi', 'device-udi']] as const)(
    'when the feature behind %s is not available, that workstream keeps its Author door', (packageId, surface) => {
      const { pkg, onNav, onStage } = draw('510(k)', 'device', { available: (id) => id !== surface });
      expect(within(pkg(packageId)!).queryByRole('button', { name: packageId === 'labeling' ? DEVICE_DOORS.label : DEVICE_DOORS.udi })).toBeNull();
      fireEvent.click(within(pkg(packageId)!).getByRole('button', { name: DEVICE_DOORS.documents }));
      expect(onStage).toHaveBeenLastCalledWith('author');
      expect(onNav).not.toHaveBeenCalledWith(surface);
    });
});

describe('no device door on a drug project', () => {
  it('draws no device workflow for a drug, so none of the three doors', () => {
    const { view } = draw('510(k)', 'drug');
    expect(view.container.querySelector('[data-testid="pj-mdx-workflow"]')).toBeNull();
  });
});
