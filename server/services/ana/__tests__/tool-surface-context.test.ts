/**
 * Handler situational-context threading.
 *
 * ToolContext now carries the active `surface` (plus projectType/documentType),
 * threaded from the chat route. The instrumented handler wrapper records the
 * originating surface in telemetry — proving the new context reaches a real
 * consumer (not dead plumbing). Uses run_compliance_checklist (pure, no DB).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { getToolSurfaceUsage, resetToolSurfaceUsage } from '../tool-telemetry';

describe('ToolContext.surface → telemetry', () => {
  beforeEach(() => resetToolSurfaceUsage());

  it('records the surface a tool was invoked from', async () => {
    await getToolHandler('run_compliance_checklist')!(
      { involves_human_subjects: true, funding_source: 'nih' },
      { organizationId: 1, surface: 'sponsored_programs' } as any,
    );
    const usage = getToolSurfaceUsage().find((u) => u.tool === 'run_compliance_checklist');
    expect(usage?.bySurface.sponsored_programs).toBe(1);
  });

  it('does not record when no surface is supplied', async () => {
    await getToolHandler('run_compliance_checklist')!(
      { involves_human_subjects: true },
      { organizationId: 1 } as any,
    );
    expect(getToolSurfaceUsage().find((u) => u.tool === 'run_compliance_checklist')).toBeUndefined();
  });

  it('accumulates counts across surfaces', async () => {
    const h = getToolHandler('run_compliance_checklist')!;
    await h({ involves_animals: true }, { organizationId: 1, surface: 'iacuc' } as any);
    await h({ involves_animals: true }, { organizationId: 1, surface: 'iacuc' } as any);
    await h({ involves_human_subjects: true }, { organizationId: 1, surface: 'irb' } as any);
    const usage = getToolSurfaceUsage().find((u) => u.tool === 'run_compliance_checklist')!;
    expect(usage.bySurface.iacuc).toBe(2);
    expect(usage.bySurface.irb).toBe(1);
  });
});
