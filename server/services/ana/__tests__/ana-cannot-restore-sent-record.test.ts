/**
 * No AnA tool can put a sent sequence's send on record (P-99 C2; launch rows D7 and D2).
 *
 * Reading a send's record back from the package the platform kept is a person's governed act: they read every document
 * it would record, bind what they read and give their own reason. Its one door is
 * POST /api/submissions/sequences/:seqId/sent-record/rederive, which calls rederiveSentRecord. This pins that no AnA or
 * MCP tool is that door (design §4). Mirrors ana-cannot-reopen-held-send.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';

const SERVER = path.resolve(__dirname, '../../..');
const TOOL_ROOTS = [path.join(SERVER, 'services/ana'), path.join(SERVER, 'mcp')];
/** What only the read-back's own path names. */
const SENT_RECORD_ACT =
  /rederiveSentRecord\b|precheckSentRecord\b|ECTD_SENT_RECORD_REDERIVED|['"`]sent-record['"`]|sent-record\/rederive/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("no AnA tool can put a sent sequence's send on record", () => {
  it('no tool is declared to read a send back or restore its record', () => {
    const restoring = ALL_ANA_TOOLS_RAW.filter((t) => /(read.?back|rederive|restore).*(record|send|sequence)|sent.?record/i.test(`${t.name} ${t.description}`));
    expect(restoring.map((t) => t.name)).toEqual([]);
  });

  it('no AnA or MCP source reaches the act', () => {
    const files = TOOL_ROOTS.flatMap(sourceFiles);
    expect(files.length, 'the scan read nothing, so it proves nothing').toBeGreaterThan(50);
    const reaching = files.filter((f) => SENT_RECORD_ACT.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SERVER, f));
    expect(reaching).toEqual([]);
  });

  it('the pattern matches the act and nothing near it', () => {
    for (const other of ['sentPackage', 'readSentPackage(', 'leafManifest', "'sent'", 'sentRecordStatement']) {
      expect(SENT_RECORD_ACT.test(other), other).toBe(false);
    }
    for (const act of ['rederiveSentRecord(', "step: 'sent-record'", '`/api/submissions/sequences/${id}/sent-record/rederive`', "'ECTD_SENT_RECORD_REDERIVED'"]) {
      expect(SENT_RECORD_ACT.test(act), act).toBe(true);
    }
  });
});
