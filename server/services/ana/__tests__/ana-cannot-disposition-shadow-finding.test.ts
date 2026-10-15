/**
 * No AnA tool can close a Shadow Review finding (P-35,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * A critical finding is closed by a named person's Part 11 signature with its
 * own reason, and a chat turn cannot collect a password (ana-cannot-sign.test.ts).
 * Its one door is
 * POST /api/submissions/sequences/:seqId/shadow-review/findings/:findingId/disposition,
 * which calls dispositionShadowFinding. This pins that no AnA tool or MCP tool is
 * that door: no tool is declared to accept, fix, dismiss or close a finding, and
 * no source file AnA or the MCP server loads reaches the disposition act, its
 * route, its intent, its audit action or its module.
 *
 * Mirrors ana-cannot-waive-shadow-review.test.ts (P-34). Verified failing
 * (docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p35-shadow-finding-disposition/):
 * a handler importing dispositionShadowFinding into AnaToolExecutor.ts trips
 * the source scan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
/** Where a tool is defined or executed: AnA's services and the MCP server. */
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the disposition act's own path names. */
const DISPOSITION_ACT =
  /dispositionShadowFinding|findings\/[^'"`\s]*\/disposition|['"`]shadow-finding-disposition['"`]|SHADOW_FINDING_DISPOSITIONED|shadow-finding-disposition/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('no AnA tool can disposition a Shadow Review finding', () => {
  it('no tool is declared to accept, fix, dismiss or close a Shadow Review finding', () => {
    // resolve_validation_finding closes a QMS validation finding, not a Shadow
    // Review one: the filter is on Shadow Review, not on the word "finding".
    const closing = ALL_ANA_TOOLS_RAW.filter(
      (t) => /disposition|accept|dismiss|resolve|close|fix|waive/i.test(t.name) && /shadow/i.test(`${t.name} ${t.description}`),
    );
    expect(closing.map((t) => t.name)).toEqual([]);
    // The one Shadow Review tool runs a review; it cannot close what a review found.
    const shadowTools = ALL_ANA_TOOLS_RAW.filter((t) => /shadow/i.test(t.name)).map((t) => t.name);
    expect(shadowTools).toEqual(['run_shadow_review']);
  });

  it('no AnA or MCP source reaches the disposition act', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => DISPOSITION_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });
});
