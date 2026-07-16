/**
 * listStudies display-shape contract.
 *
 * The nonclinical review board (v2 surface) adopts GET /api/nonclinical/studies
 * via useLiveList, which requires each row to carry the NcStudy display keys
 * ({ id, type, species, dur, finding, cls, send }). This locks that listStudies
 * queries with the display projection (study_number AS id, a study_type→label
 * CASE, and a send-conformance derivation from send_datasets) and passes rows
 * through unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { listStudies } from '../nonclinical-service';

beforeEach(() => query.mockReset());

describe('listStudies', () => {
  it('projects the NcStudy display shape and scopes to the org', async () => {
    const row = { id: 'TX-701', type: 'Repeat-dose tox', species: 'Rat', dur: '26-week', finding: 'Minimal hepatocellular hypertrophy (adaptive)', cls: 'non-adverse', send: 'conforms' };
    query.mockResolvedValueOnce({ rows: [row] });

    const rows = await listStudies(7);

    expect(rows).toEqual([row]);
    const [sql, params] = query.mock.calls[0];
    // display projection + derivations
    expect(sql).toContain('study_number');
    expect(sql).toContain('duration_label');
    expect(sql).toContain('finding_class');
    expect(sql).toContain('send_datasets');
    // org-scoped, no submission filter when omitted
    expect(params).toEqual([7]);
  });

  it('adds the submission filter when a submissionId is given', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listStudies(7, 42);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('submission_id');
    expect(params).toEqual([7, 42]);
  });
});
