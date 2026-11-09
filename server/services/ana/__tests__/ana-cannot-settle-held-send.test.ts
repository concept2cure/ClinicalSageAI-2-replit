/**
 * No AnA tool can settle a held FDA send (P-92, founder 2026-11-02; amended by P-108 1(b); launch row D7).
 *
 * A held send is settled by a named person's Part 11 signature with the meaning responsibility, over FDA's document
 * or the platform's own proof, with the duplicate-filing risk said in words, and their own reason; a chat turn cannot
 * collect a password (ana-cannot-sign.test.ts). Its one door is POST /api/submissions/sequences/:seqId/held-send/settle,
 * which calls settleHeldSend. This pins that no AnA tool or MCP tool is that door: no tool is declared to settle or
 * release a held send, and no source file AnA or the MCP server loads reaches the act, its route, its intent or its
 * audit action. Mirrors ana-cannot-retire-sequence.test.ts (P-86) and the P-35 scan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the settlement's own path names. */
const SETTLEMENT_ACT =
  /settleHeldSend\b|applyHeldSendSettlement|precheckHeldSendSettlement|ECTD_HELD_SEND_SETTLED|HELD_SEND_SETTLEMENT_INTENT|['"`]held-send-settlement['"`]|held-send\/settle/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('no AnA tool can settle a held send', () => {
  it('no tool is declared to settle or release a held send', () => {
    const settling = ALL_ANA_TOOLS_RAW.filter((t) => /settle|release/i.test(t.name) && /held|transmit|send/i.test(`${t.name} ${t.description}`));
    expect(settling.map((t) => t.name)).toEqual([]);
  });

  it('no AnA or MCP source reaches the settlement', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => SETTLEMENT_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });

  it('the pattern matches the act and nothing near it', () => {
    for (const other of ['heldSendSettlement', 'held send', 'settled', "'transmit'"]) {
      expect(SETTLEMENT_ACT.test(other), other).toBe(false);
    }
    for (const act of ['settleHeldSend(', "intent: 'held-send-settlement'", '`/api/submissions/sequences/${id}/held-send/settle`', "'ECTD_HELD_SEND_SETTLED'"]) {
      expect(SETTLEMENT_ACT.test(act), act).toBe(true);
    }
  });
});
