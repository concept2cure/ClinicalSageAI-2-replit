/**
 * No AnA tool can retire an eCTD sequence (P-86, founder 2026-11-01; launch
 * row D7).
 *
 * A sequence is retired by a named person's Part 11 signature with the meaning
 * responsibility, the statement that it was never filed by any route, and their
 * own reason, and a chat turn cannot collect a password (ana-cannot-sign.test.ts).
 * Its one door is POST /api/submissions/sequences/:seqId/retire, which calls
 * retireSequence. This pins that no AnA tool or MCP tool is that door: no tool
 * is declared to retire a sequence, and no source file AnA or the MCP server
 * loads reaches the act, its route, its intent, its audit action or its module.
 * MCP may report a retired sequence (c2c_get_sequence_status) through
 * readRetiredSequence, which names none of them.
 *
 * Mirrors ana-cannot-waive-shadow-review.test.ts (P-34). The QMS document
 * retirement ('retire_qms_document') is another act and does not match.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
/** Where a tool is defined or executed: AnA's services and the MCP server. */
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the retirement's own path names. */
const RETIREMENT_ACT =
  /retireSequence\b|applySequenceRetirement|ECTD_SEQUENCE_RETIRED|SEQUENCE_RETIREMENT_INTENT|sequence-retirement['"`]|sequences\/:seqId\/retire|sequences\/\$\{[^}]+\}\/retire|['"`]retire['"`]/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('no AnA tool can retire a sequence', () => {
  it('no tool is declared to retire a sequence', () => {
    const retiring = ALL_ANA_TOOLS_RAW.filter((t) => /retire/i.test(t.name) && /sequence/i.test(`${t.name} ${t.description}`));
    expect(retiring.map((t) => t.name)).toEqual([]);
  });

  it('no AnA or MCP source reaches the retirement', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => RETIREMENT_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });

  it("the pattern does not take the QMS document's retirement for this one", () => {
    for (const other of ["'retire_qms_document'", 'Retire the SOP once its successor is effective.', 'retiredSequence', 'readRetiredSequence(']) {
      expect(RETIREMENT_ACT.test(other), other).toBe(false);
    }
    for (const act of ['retireSequence(', "intent: 'retire'", '`/api/submissions/sequences/${id}/retire`', "'ECTD_SEQUENCE_RETIRED'"]) {
      expect(RETIREMENT_ACT.test(act), act).toBe(true);
    }
  });
});
