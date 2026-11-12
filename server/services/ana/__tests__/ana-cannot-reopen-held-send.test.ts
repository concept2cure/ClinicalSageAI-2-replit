/**
 * No AnA tool can re-open a held send's settlement (P-92 C3, P-108 1(c); launch row D7).
 *
 * A settlement FDA's verified answer contradicts is re-opened by a named person's Part 11 signature with the meaning
 * responsibility and their own reason; a chat turn cannot collect a password (ana-cannot-sign.test.ts). Its one door is
 * POST /api/submissions/sequences/:seqId/held-send/reopen, which calls recordHeldSendReopen. This pins that no AnA or MCP
 * tool is that door. Mirrors ana-cannot-settle-held-send.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the re-open's own path names. */
const REOPEN_ACT =
  /recordHeldSendReopen\b|applyHeldSendReopen|precheckHeldSendReopen|ECTD_HELD_SEND_REOPENED|HELD_SEND_REOPEN_INTENT|['"`]held-send-reopen['"`]|held-send\/reopen/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("no AnA tool can re-open a held send's settlement", () => {
  it('no tool is declared to re-open a settlement', () => {
    const reopening = ALL_ANA_TOOLS_RAW.filter((t) => /re-?open/i.test(t.name) && /settle|held|send|fda/i.test(`${t.name} ${t.description}`));
    expect(reopening.map((t) => t.name)).toEqual([]);
  });

  it('no AnA or MCP source reaches the act', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => REOPEN_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });

  it('the pattern matches the act and nothing near it', () => {
    for (const other of ['reopenedBy', 're-opened', 'heldSendSettlement', "'held-send-settlement'", 'settleHeldSend(']) {
      expect(REOPEN_ACT.test(other), other).toBe(false);
    }
    for (const act of ['recordHeldSendReopen(', "intent: 'held-send-reopen'", '`/api/submissions/sequences/${id}/held-send/reopen`', "'ECTD_HELD_SEND_REOPENED'"]) {
      expect(REOPEN_ACT.test(act), act).toBe(true);
    }
  });
});
