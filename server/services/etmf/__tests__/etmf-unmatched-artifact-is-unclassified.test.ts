/**
 * An artifact whose name matches no DIA TMF Reference Model keyword is
 * unclassified — it is not filed into a zone nobody chose.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `classifyArtifact` returned Zone 2 "Central Trial Documents" (confidence
 * 'default') for any name that matched no rule, and `addArtifactTx` stored that
 * zone and section on the tmf_artifacts row with no marker, `expected` and
 * `completeness_required` by default — so "quarterly-board-deck.pdf" entered
 * Zone 2's completeness denominator, and AnA announced it as "Filed … to TMF
 * zone 2 (auto-classified)", the same words as a keyword match.
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyArtifact } from '../etmf-logic';
import { addArtifactTx, EtmfError } from '../etmf-service';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));

function fakeClient() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/^SELECT id FROM tmf_files/.test(sql.trim())) return { rows: [{ id: 3 }] };
      if (/INSERT INTO tmf_artifacts/.test(sql)) return { rows: [{ id: 41 }] };
      return { rows: [] };
    }),
  };
}

describe('classifyArtifact', () => {
  it('says a name that matches no rule is unclassified, with no zone', () => {
    expect(classifyArtifact('quarterly-board-deck.pdf')).toEqual({
      zone: null,
      zoneName: null,
      section: null,
      confidence: 'unclassified',
    });
  });

  it('still classifies a keyword match', () => {
    expect(classifyArtifact('Statistical Analysis Plan v2')).toMatchObject({ zone: 11, confidence: 'matched' });
  });
});

describe('addArtifactTx', () => {
  it('refuses an unclassifiable name with no zone, naming the missing zone, and stores nothing', async () => {
    const client = fakeClient();
    const attempt = addArtifactTx(client, 7, 5, 3, { artifactName: 'quarterly-board-deck.pdf' });
    await expect(attempt).rejects.toBeInstanceOf(EtmfError);
    await expect(addArtifactTx(fakeClient(), 7, 5, 3, { artifactName: 'quarterly-board-deck.pdf' })).rejects.toMatchObject({
      code: 'BAD_INPUT',
      message: expect.stringMatching(/zone/),
    });
    expect(client.calls.some((c) => /INSERT INTO tmf_artifacts/.test(c.sql))).toBe(false);
  });

  it('files the same name into the zone the caller states', async () => {
    const client = fakeClient();
    const r = await addArtifactTx(client, 7, 5, 3, { artifactName: 'quarterly-board-deck.pdf', zone: 1 });
    expect(r).toEqual({ id: 41, zone: 1, classification: 'explicit' });
  });

  it('auto-classifies a keyword match and says so', async () => {
    const client = fakeClient();
    const r = await addArtifactTx(client, 7, 5, 3, { artifactName: 'IRB Approval Letter' });
    expect(r).toEqual({ id: 41, zone: 4, classification: 'matched' });
    const insert = client.calls.find((c) => /INSERT INTO tmf_artifacts/.test(c.sql))!;
    expect(insert.params?.[2]).toBe(4);
    expect(insert.params?.[3]).toBe('IRB/IEC Approval');
  });
});
