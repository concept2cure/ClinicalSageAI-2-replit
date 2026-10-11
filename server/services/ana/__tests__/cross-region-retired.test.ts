/**
 * The Cross-region model verdict is retired (docs/design/FILING_SPINE.md F21,
 * break 23; docs/design/WORKFLOW_DECISION_2026-10-08.md, "What we stop").
 *
 * The Submission Center's Cross-region workspace asked a model which Module 1
 * deltas another region needed (POST /api/submissions/:id/cross-region →
 * computeCrossRegionGap → prompt cross-region-gap), and AnA could ask the same
 * through the tool cross_region_gap_analysis. The answer rendered as a verdict:
 * when the model listed nothing, the screen read "No Module 1 deltas reported",
 * over targets hard-coded to fda, eu and jp. A model producing a regulatory
 * verdict breaks CLAUDE.md Rule 2.
 *
 * The replacements, by path:
 *   - what the platform can carry for another market, deterministically:
 *     server/services/regulatory/market-support.ts (F19), shown on each region
 *     option of client/src/concept2cure/v2/surfaces/NewSubmissionForm.tsx and
 *     on each submission row of ProjectHome's Submit tab;
 *   - another region's Module 1 requirements: the Planner's region profile
 *     (GET /api/region-profiles/:region, SubmissionCenter.tsx), held by
 *     client/src/concept2cure/v2/__tests__/submissionCenterHonesty.test.tsx;
 *   - for AnA: resolve_submission_plan (submission-resolver.ts), which reads
 *     the same market-support judgement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor';
import { SUBMISSION_WORKSPACES } from '../../../../shared/types/submission-ui';
import { resolveSurfaceAction } from '../../../../shared/navigation/surface-actions';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const TOOL = 'cross_region_gap_analysis';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the Cross-region model verdict is retired', () => {
  it('AnA has no cross_region_gap_analysis: no handler, not offered, not registered, not in scope', () => {
    expect(getToolHandler(TOOL)).toBeUndefined();
    expect(ALL_ANA_TOOLS.map((t) => t.name)).not.toContain(TOOL);
    const register = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'tool-authorization.register.json'), 'utf8')) as { tools: Record<string, unknown> };
    expect(Object.keys(register.tools).length).toBeGreaterThan(100);
    expect(Object.keys(register.tools)).not.toContain(TOOL);
    const inv = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'ana-launch-scope.inventory.json'), 'utf8')) as { tools: { inScope: string[]; hiddenApp: unknown } };
    expect(inv.tools.inScope).not.toContain(TOOL);
    expect(JSON.stringify(inv.tools.hiddenApp)).not.toContain(`"${TOOL}"`);
  });

  it('the Submission Center has no Cross-region workspace, and AnA cannot open one', () => {
    expect(SUBMISSION_WORKSPACES.map((w) => w.id)).not.toContain('cross-region');
    const r = resolveSurfaceAction('submissions.set-workspace', { workspace: 'cross-region' });
    expect(r.ok).toBe(false);
  });

  it('the server has no cross-region route, no computeCrossRegionGap and no cross-region-gap prompt', async () => {
    const routes = fs.readFileSync(path.join(REPO, 'server/routes/submissions.ts'), 'utf8');
    expect(routes).not.toMatch(/['"]\/:id\/cross-region['"]/);
    const ai = await import('../../submission-ai/submission-ai-service');
    expect((ai as Record<string, unknown>).computeCrossRegionGap).toBeUndefined();
    expect((ai.default as Record<string, unknown>).computeCrossRegionGap).toBeUndefined();
    expect(fs.existsSync(path.join(REPO, 'server/services/ai-gateway/prompts/cross-region-gap'))).toBe(false);
  });

  it('no client source renders "No Module 1 deltas reported" or posts to the cross-region route', () => {
    const offenders = walk(path.join(REPO, 'client/src/concept2cure')).filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return /No Module 1 deltas reported/.test(src) || /\/cross-region[`'"]/.test(src) || /CrossRegionWorkspace/.test(src);
    });
    expect(offenders.map((f) => path.relative(REPO, f))).toEqual([]);
  });
});
