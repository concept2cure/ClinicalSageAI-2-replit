/**
 * Figures the MDX kit presents as measured must actually be measured.
 *
 * Two defects of one shape were found by auditing every export of the
 * modules under mdx/data for fabricated content. The first was the device
 * vault's KPI builder (vaultKpisForFiles asserted a retention count of 3 that
 * nothing derived); it left the tree with the device vault, which folded into
 * the Vault (D2, fold F3, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/).
 * The Vault's governed-artifact lane counts by recorded status and signature
 * (VaultGovernedArtifacts.tsx GovernedArtifactsLane) and states no retention
 * figure. The second remains:
 *
 *   PMA_PHASES           Carried a hand-written position (100/100/100/85/61/40/
 *                        25/0/0/0, 'Module assembly' blocked) alongside the ten
 *                        canonical phase labels. PmaSurface's derivePhases
 *                        overwrote pct and status for every row from the active
 *                        program, so those numbers were reachable through one
 *                        path only — no program selected — where the grid drew
 *                        an invented programme's progress for a user who had
 *                        chosen nothing. (Slice 0 deleted derivePhases too: no
 *                        position reaches the grid from anywhere now.)
 */
import { describe, expect, it } from 'vitest';
import { PMA_PHASES } from '../data/pma';

describe('the PMA phase list is a taxonomy, not a programme', () => {
  it('names the ten phases', () => {
    expect(PMA_PHASES).toHaveLength(10);
    expect(PMA_PHASES.map((p) => p.id)).toContain('pivotal');
    expect(PMA_PHASES.every((p) => p.label.length > 0)).toBe(true);
  });

  // Slice 0 (audit 2): this name said the position "comes from the active
  // program". Nothing supplies one now — a project records no PMA phase.
  it('carries no position, and nothing supplies one', () => {
    // Reachable verbatim whenever no program is selected.
    expect(PMA_PHASES.every((p) => p.pct === 0)).toBe(true);
    expect(PMA_PHASES.every((p) => p.status === 'idle')).toBe(true);
  });
});

/**
 * The same defect one layer up, found by an adversarial verifier checking a
 * different finding on this surface.
 *
 * PmaSurface's header read, with no PMA program in the tenant's list:
 *
 *   PMA pathway · CV-330 Implantable Monitor
 *   Phase 1 of 10 — Pre-submission · PMA filing Q3 2026
 *
 * An invented device, an invented filing date, and a phase claimed as current —
 * written as inline JSX literals rather than imported from a data module, so no
 * fixture audit and no import-based gate could see them. The phase claim was the
 * quietest: `Math.max(activeIdx, 0)` turns "no active phase" (-1) into "phase 1"
 * and prints it beside ten bars all reading 0%.
 *
 * Asserted against the source because rendering this surface pulls in the eSTAR
 * export chain, the pathway panes and the official filing panel, none of which
 * this is about. What matters is that the literals are not there to render.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('the PMA surface names nothing the program did not supply', () => {
  const src = readFileSync(
    path.join(process.cwd(), 'client/src/concept2cure/mdx/surfaces/PmaSurface.tsx'),
    'utf8',
  );
  /* Comments quote the removed literals on purpose, to record what shipped. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  it('carries no invented device name or filing date', () => {
    expect(code).not.toMatch(/CV-330/);
    expect(code).not.toMatch(/PMA filing Q[1-4]\s*20\d\d/);
  });

  it('does not claim a current phase when no program is selected', () => {
    // The phase line must be reached only on the program branch.
    // Slice 0: the line is now the recorded phase (useRecordedPhaseLine), still only on the program branch.
    expect(code).toMatch(/program\s*\n?\s*\?\s*`\$\{phaseLine\}/);
  });
});
