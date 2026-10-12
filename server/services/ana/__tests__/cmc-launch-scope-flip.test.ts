/**
 * What AnA offers once CMC / Module 3 is in the launch catalog (decision P-28).
 *
 * ── What the flip changes ─────────────────────────────────────────────────────
 * The CMC tools and commands were classified `hiddenApp` on 2026-09-26 —
 * "operates records of surfaces outside the launch catalog only; withheld /
 * refused in production". With `cmc` a launch surface they are inside it, and
 * `anaCapabilityInLaunchScope` re-checks the surface against
 * LAUNCH_SURFACE_IDS rather than trusting the inventory, so they came back the
 * moment the surface did.
 *
 * That is the half worth pinning: ten tools and six commands that production
 * withheld are now offered, and the inventory says so rather than describing a
 * launch surface as outside the catalog.
 *
 * ── And what it must NOT open ─────────────────────────────────────────────────
 * `start_intelligence_flow` reached production with them. It starts an
 * interview for any document type the flow registry knows — protocol, CSR,
 * IND, NDA, BLA, SOP, 510(k), CER — but `buildInterviewCommitPlan` produces
 * entries for the CMC specification flow and an EMPTY plan for every other
 * category. So any other interview could be started, answered to the end, and
 * commit nothing: an empty result standing in for a refusal, which this
 * codebase forbids. It is refused at the start where the boundary is enforced,
 * and still available on a development server.
 */

import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  HIDDEN_APP_COMMANDS,
  HIDDEN_APP_TOOLS,
  anaCapabilityInLaunchScope,
} from '../ana-launch-scope';
import { LAUNCH_SURFACE_IDS } from '../../../../shared/constants/launch-scope';
import { COMMITTING_FLOW_CATEGORIES, flowCommitsToRecord } from '../../cmc/interview-commit';

/** The ten tools the 2026-09-26 classification withheld for the CMC surface. */
const CMC_TOOLS = [
  'answer_intelligence_question',
  'assess_recorded_batch_poolability',
  'assess_recorded_process_capability',
  'assess_recorded_stability_trend',
  'commit_intelligence_flow',
  'compare_recorded_dissolution',
  'estimate_recorded_shelf_life',
  'list_cmc_registers',
  'resume_intelligence_flow',
  'start_intelligence_flow',
] as const;

/** The six platform commands it withheld. */
const CMC_COMMANDS = [
  'cmc_status',
  'control_strategy',
  'ich_compliance',
  'module3_contradictions',
  'module3_lineage',
  'module3_readiness',
] as const;

describe('the CMC capabilities are in scope now that the surface is', () => {
  it('cmc is a launch surface', () => {
    expect(LAUNCH_SURFACE_IDS.has('cmc')).toBe(true);
  });

  it.each(CMC_TOOLS)('%s is in scope', (name) => {
    expect(anaCapabilityInLaunchScope(name, HIDDEN_APP_TOOLS)).toBe(true);
  });

  it.each(CMC_COMMANDS)('%s is in scope', (name) => {
    expect(anaCapabilityInLaunchScope(name, HIDDEN_APP_COMMANDS)).toBe(true);
  });

  it('they would be withheld again if the surface left the catalog', () => {
    /* The mechanism, not the bookkeeping: the surface check decides. Proven by
       taking `cmc` out of the id set and seeing each name withheld — so this
       suite cannot pass merely because the inventory was edited. */
    const withoutCmc = new Set([...LAUNCH_SURFACE_IDS].filter((id) => id !== 'cmc'));
    const asHidden = new Map<string, readonly string[]>([
      ...[...CMC_TOOLS].map((n) => [n, ['cmc']] as [string, readonly string[]]),
      ...[...CMC_COMMANDS].map((n) => [n, ['cmc']] as [string, readonly string[]]),
    ]);
    for (const name of [...CMC_TOOLS, ...CMC_COMMANDS]) {
      expect(anaCapabilityInLaunchScope(name, asHidden, withoutCmc), name).toBe(false);
    }
  });

  it('the inventory no longer calls a launch surface hidden', () => {
    const inv = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'ana-launch-scope.inventory.json'), 'utf8'),
    ) as {
      tools: { hiddenApp: Array<{ surfaces: string[]; names: string[] }>; inScope: string[] };
      commands: { hiddenApp: Array<{ surfaces: string[]; names: string[] }>; inScope: string[] };
    };
    for (const kind of ['tools', 'commands'] as const) {
      for (const entry of inv[kind].hiddenApp) {
        expect(entry.surfaces, `${kind}: ${entry.names.join(', ')}`).not.toContain('cmc');
      }
    }
    for (const n of CMC_TOOLS) expect(inv.tools.inScope).toContain(n);
    for (const n of CMC_COMMANDS) expect(inv.commands.inScope).toContain(n);
  });
});

describe('an interview whose answers reach no record is not offered in production', () => {
  it('only the CMC specification flow commits', () => {
    expect([...COMMITTING_FLOW_CATEGORIES]).toEqual(['cmc_specification']);
    expect(flowCommitsToRecord('cmc_specification')).toBe(true);
    for (const category of ['protocol_development', 'csr_report', 'ind_submission', 'sop_development'] as const) {
      expect(flowCommitsToRecord(category as never), category).toBe(false);
    }
  });

  describe('start_intelligence_flow', () => {
    /* The control is the launch boundary, not NODE_ENV: readLaunchScopeMode
       honours an explicit 'on' anywhere, and importing the executor under
       NODE_ENV=production trips an unrelated connector-encryption boot guard. */
    /* AnaToolExecutor is a 20,000-line module; importing it once here keeps
       that cost out of the first case's own timeout. */
    beforeAll(async () => {
      await import('../AnaToolExecutor');
    }, 60_000);
    beforeEach(() => vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'on'));
    afterEach(() => vi.unstubAllEnvs());

    /** The registered handler, as the agentic loop reaches it. */
    async function start(documentType: string): Promise<Record<string, unknown>> {
      const { getToolHandler } = await import('../AnaToolExecutor');
      const handler = getToolHandler('start_intelligence_flow');
      expect(handler, 'start_intelligence_flow has no registered handler').toBeTruthy();
      const out = await handler!({ document_type: documentType }, undefined as never);
      return JSON.parse(String(out)) as Record<string, unknown>;
    }

    it.each(['protocol', 'csr', '510k', 'cer', 'sop', 'nda', 'bla'])(
      'refuses a %s interview, and says where to author it instead',
      async (documentType) => {
        const res = await start(documentType);
        expect(res.commits, JSON.stringify(res).slice(0, 200)).toBe(false);
        expect(String(res.error)).toMatch(/reach no record/);
        expect(String(res.error)).toContain('Document editor & authoring');
      },
    );

    it('offers the CMC interview — it is the one that commits', async () => {
      const res = await start('cmc');
      // Not the scope refusal. (With no real organisation the session store is
      // what answers next; what matters here is that the boundary let it through.)
      expect(res.commits).toBeUndefined();
      expect(String(res.error ?? '')).not.toMatch(/reach no record/);
    });

    it('offers every flow on a development server', async () => {
      vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
      const res = await start('protocol');
      expect(res.commits).toBeUndefined();
      expect(String(res.error ?? '')).not.toMatch(/reach no record/);
    });
  });
});
