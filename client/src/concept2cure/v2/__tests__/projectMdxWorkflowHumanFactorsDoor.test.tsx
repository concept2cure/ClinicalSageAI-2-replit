// @vitest-environment jsdom
/**
 * Plan's device workflow opens the project's usability engineering file (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/).
 *
 * The map places `human-factors` in the project as the human-factors-usability
 * work package's destination (INFORMATION_ARCHITECTURE.md section 5, the
 * `human-factors` row; slice 19). Until its read took the project the package
 * fell through to Evidence. The screen now reads the open project's file, so
 * the package's door, "Build the usability engineering file", opens it. The
 * compiler plans the package for every device route, so the door is on every
 * device route. It is offered only when the feature is available to the
 * organization; otherwise the package keeps the Evidence door it had. A drug
 * project has no device workflow at all.
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
const PACKAGE = 'human-factors-usability';

function draw(route: keyof typeof ROUTES, product: string, available: (id: string) => boolean = () => true) {
  const onNav = vi.fn();
  const onStage = vi.fn();
  const view = render(<ProjectMdxWorkflow project={{ ...BASE, ...ROUTES[route], product_type: product }} otherFilings={[]}
    marketsState="ready" onNav={onNav} onStage={onStage} onAsk={vi.fn()} available={available} />);
  const pkg = () => view.container.querySelector(`[data-work-package="${PACKAGE}"]`) as HTMLElement | null;
  return { view, onNav, onStage, pkg };
}

describe('the usability engineering file door', () => {
  it.each((Object.keys(ROUTES) as Array<keyof typeof ROUTES>).flatMap((route) => PRODUCTS.map((product) => [route, product] as const)))(
    'a %s %s project opens the project\'s usability engineering file from human factors', (route, product) => {
      const { pkg, onNav } = draw(route, product);
      expect(pkg(), 'the compiler plans human factors for every device route').not.toBeNull();
      fireEvent.click(within(pkg()!).getByRole('button', { name: DEVICE_DOORS.humanFactors }));
      expect(onNav).toHaveBeenLastCalledWith('human-factors');
    });

  it('when the feature is not available, the workstream keeps its Evidence door and never offers it', () => {
    const { pkg, onNav, onStage } = draw('510(k)', 'device', (id) => id !== 'human-factors');
    expect(within(pkg()!).queryByRole('button', { name: DEVICE_DOORS.humanFactors })).toBeNull();
    fireEvent.click(within(pkg()!).getByRole('button', { name: DEVICE_DOORS.evidence }));
    expect(onStage).toHaveBeenLastCalledWith('evidence');
    expect(onNav).not.toHaveBeenCalledWith('human-factors');
  });

  it('is on the human-factors workstream only', () => {
    const { view, pkg } = draw('PMA', 'device');
    const all = within(view.container).getAllByRole('button', { name: DEVICE_DOORS.humanFactors });
    expect(all).toHaveLength(1);
    expect(pkg()!.contains(all[0])).toBe(true);
  });

  it('draws no device workflow for a drug, so no door', () => {
    const { view } = draw('510(k)', 'drug');
    expect(view.container.querySelector('[data-testid="pj-mdx-workflow"]')).toBeNull();
  });
});
