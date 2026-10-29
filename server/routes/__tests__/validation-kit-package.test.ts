/**
 * What the validation kit offers a customer is the launch package, as each
 * document records itself (decision P-67).
 *
 * GET /api/validation-kit is reached on administration's Settings as the
 * vendor's GAMP 5 validation package, which a regulated customer files in their
 * computer-system-validation record (21 CFR 11.10(a), EU GMP Annex 11 §4). It
 * must describe the deployed system truthfully. Two defects are pinned:
 *
 * 1. CONTENTS. The route listed every markdown file in docs/validation/: the
 *    launch package, and beside it the CORTEX series (a second validation
 *    master plan, for the AI engines VMP-001 §3 puts out of scope), an internal
 *    CI work order and a generated evidence pack. The package is VMP-001, the
 *    documents that name it as their parent, and TM-001, which VMP-001 §5 names
 *    as generated from their records. That set is derived here from the
 *    documents themselves, independently of the route's rule.
 * 2. STATUS. The launch package records its header in a `| Field | Value |`
 *    table, which the route did not read, so every one of its documents was
 *    listed with no version and no status, and the client showed it as
 *    "Available". Each status must be the document's own words.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

const { sendAuditedDownload } = vi.hoisted(() => ({
  sendAuditedDownload: vi.fn(async (res: express.Response, input: { buffer: Buffer }) => {
    res.send(input.buffer);
    return { sha256: 'recorded' };
  }),
}));
vi.mock('../../services/export/governedExportConsequence', async (orig) => ({
  ...(await orig<typeof import('../../services/export/governedExportConsequence')>()),
  sendAuditedDownload,
}));

const { default: validationKit } = await import('../validation-kit');

const DIR = path.join(process.cwd(), 'docs', 'validation');
function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).user = { id: 3, organizationId: 7 };
    next();
  });
  a.use('/api/validation-kit', validationKit);
  return a;
}

/** A `| Label | value |` row of a document's header table, emphasis dropped. */
function headerRow(md: string, label: string): string | null {
  const m = md.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*$`, 'm'));
  return m ? m[1].replace(/\*\*/g, '').trim() : null;
}

/** The package, from the documents: VMP-001, each child that names it, and TM-001. */
function packageFromTheDocuments(): Map<string, { version: string | null; status: string | null }> {
  const out = new Map<string, { version: string | null; status: string | null }>();
  for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.md'))) {
    const md = fs.readFileSync(path.join(DIR, file), 'utf8').slice(0, 2048);
    const id = headerRow(md, 'Document ID');
    if (!id) continue;
    const parent = headerRow(md, 'Parent') ?? '';
    if (id === 'VMP-001' || id === 'TM-001' || /\bVMP-001\b/.test(parent)) {
      out.set(id, { version: headerRow(md, 'Version'), status: headerRow(md, 'Status') });
    }
  }
  return out;
}

describe('GET /api/validation-kit offers the launch package', () => {
  it('lists exactly VMP-001, the documents under it and TM-001', async () => {
    const expected = packageFromTheDocuments();
    expect(expected.size, 'the package is on disk').toBeGreaterThanOrEqual(15);
    const res = await request(app()).get('/api/validation-kit');
    expect(res.status).toBe(200);
    const listed = (res.body.artifacts as Array<{ docId: string }>).map(a => a.docId);
    expect([...listed].sort()).toEqual([...expected.keys()].sort());
    expect(listed[0], 'the master plan first').toBe('VMP-001');
  });

  it('offers nothing outside it: no CORTEX document, work order or evidence pack', async () => {
    const res = await request(app()).get('/api/validation-kit');
    const files = (res.body.artifacts as Array<{ docId: string; file: string }>).map(a => `${a.docId} ${a.file}`);
    expect(files.filter(f => /CORTEX|C2C_BLOCKING_CI_GATES|IQ_OQ_EVIDENCE_PACK/.test(f))).toEqual([]);
    for (const outside of ['VMP-CORTEX-001', 'IQ-CORTEX-001', 'C2C_BLOCKING_CI_GATES']) {
      const one = await request(app()).get(`/api/validation-kit/${outside}`);
      expect(one.status, outside).toBe(404);
    }
  });

  it("reports each document's own version and status, as written", async () => {
    const expected = packageFromTheDocuments();
    const res = await request(app()).get('/api/validation-kit');
    for (const a of res.body.artifacts as Array<{ docId: string; version: string | null; status: string | null }>) {
      expect({ version: a.version, status: a.status }, a.docId).toEqual(expected.get(a.docId));
      expect(a.status, `${a.docId} records a status`).toBeTruthy();
    }
    const vmp = (res.body.artifacts as Array<{ docId: string; status: string }>).find(a => a.docId === 'VMP-001');
    expect(vmp?.status).toBe('DRAFT — UNSIGNED');
  });

  it('makes no promise the package does not keep', async () => {
    const res = await request(app()).get('/api/validation-kit');
    expect(res.body.note).not.toMatch(/at contract|approved/i);
  });
});
