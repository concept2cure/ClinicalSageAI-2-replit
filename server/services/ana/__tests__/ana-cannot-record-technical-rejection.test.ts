/**
 * No AnA tool can record FDA's technical rejection of a sequence (P-92 C4, P-108 1(a); launch row D7).
 *
 * FDA's failed Ack3 is recorded on a sequence by a named person's Part 11 signature with the meaning responsibility,
 * over FDA's Ack3 in the project's Vault, with their own reason; a chat turn cannot collect a password
 * (ana-cannot-sign.test.ts). Its one door is POST /api/submissions/sequences/:seqId/technical-rejection, which calls
 * recordTechnicalRejection. This pins that no AnA or MCP tool is that door. Mirrors ana-cannot-settle-held-send.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the technical rejection's own path names. */
const REJECTION_ACT =
  /recordTechnicalRejection\b|applyTechnicalRejection|precheckTechnicalRejection|ECTD_TECHNICAL_REJECTION_RECORDED|TECHNICAL_REJECTION_INTENT|['"`]technical-rejection['"`]|\/technical-rejection\b/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("no AnA tool can record FDA's technical rejection of a sequence", () => {
  it('no tool is declared to record a rejection or a technical rejection', () => {
    const recording = ALL_ANA_TOOLS_RAW.filter((t) => /reject/i.test(t.name) && /sequence|ack3|technical|fda/i.test(`${t.name} ${t.description}`));
    expect(recording.map((t) => t.name)).toEqual([]);
  });

  it('no AnA or MCP source reaches the act', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => REJECTION_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });

  it('the pattern matches the act and nothing near it', () => {
    for (const other of ['technicalRejection', 'technical rejection', 'rejected', "'validation_failed'", 'recordFiledSequenceRejection']) {
      expect(REJECTION_ACT.test(other), other).toBe(false);
    }
    for (const act of ['recordTechnicalRejection(', "intent: 'technical-rejection'", '`/api/submissions/sequences/${id}/technical-rejection`', "'ECTD_TECHNICAL_REJECTION_RECORDED'"]) {
      expect(REJECTION_ACT.test(act), act).toBe(true);
    }
  });
});
