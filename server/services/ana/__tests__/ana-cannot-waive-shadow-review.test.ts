/**
 * No AnA tool can waive Shadow Review (P-34, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * The waiver is a Part 11 signature with its own reason, and a chat turn
 * cannot collect a password (ana-cannot-sign.test.ts). Its one door is
 * POST /api/submissions/sequences/:seqId/shadow-review/waive, which calls
 * waiveShadowReview. This pins that no AnA tool is that door: no tool is
 * declared for it, and no source file AnA or the MCP server loads reaches the
 * waiver act, its route, its intent or its audit action.
 *
 * Verified failing (docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p34-shadow-review-waiver/):
 * a handler importing waiveShadowReview into AnaToolExecutor.ts trips the
 * source scan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
/** Where a tool is defined or executed: AnA's services and the MCP server. */
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the waiver act's own path names. */
const WAIVER_ACT = /waiveShadowReview|shadow-review\/waive|['"`]shadow-waiver['"`]|SHADOW_REVIEW_WAIVED|shadow-review-waiver/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('no AnA tool can waive Shadow Review', () => {
  it('no tool is declared for a waiver', () => {
    const waiving = ALL_ANA_TOOLS_RAW.filter((t) => /waive|waiver/i.test(t.name) && /shadow/i.test(`${t.name} ${t.description}`));
    expect(waiving.map((t) => t.name)).toEqual([]);
    // The one Shadow Review tool runs a review; it cannot record one that did not run.
    const shadowTools = ALL_ANA_TOOLS_RAW.filter((t) => /shadow/i.test(t.name)).map((t) => t.name);
    expect(shadowTools).toEqual(['run_shadow_review']);
  });

  it('no AnA or MCP source reaches the waiver act', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => WAIVER_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });
});
