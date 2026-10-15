/**
 * A concurrent check-in that commits between planCheckIn's chain query and its
 * second-successor query must read as VERSION_NOT_CURRENT. Before the fix, the
 * second query saw the winner's row and reported VERSION_LINK_CONFLICT — "a
 * record that is not a version of this document; an administrator must resolve
 * it" — which was false (CI run 12756, vault-version-checkin.dbtest under load).
 *
 * The interleaving is replayed deterministically: the stub answers each query
 * the way the database did on either side of the winner's commit.
 */
import { describe, expect, it } from 'vitest';
import { planCheckIn, type CheckInQueryable } from '../vault-version-checkin';

const HEAD = {
  id: '00000000-0000-4000-8000-000000000001',
  document_code: 'DOC-1',
  document_type: 'OTHER',
  version: '1.0',
  folder_id: null,
  evidence_kind: null,
  ctd_section: null,
  placement_status: 'unfiled',
  placement_confidence: null,
  placement_rationale: null,
  placed_by: null,
  classification: null,
  retention_policy: null,
};
const PARAMS = {
  organizationId: 7,
  programId: '00000000-0000-4000-8000-0000000000aa',
  headId: HEAD.id,
  contentHash: 'hash-b',
};

function stub(successorInFamily: boolean | null): CheckInQueryable {
  return {
    async query(sql: string) {
      if (/FROM vault\.documents d\s+WHERE d\.id/.test(sql)) return { rows: [HEAD] };
      if (/WITH RECURSIVE chain/.test(sql)) return { rows: [] }; // before the winner commits
      if (/supersedes_id = \$1::uuid AND deleted_at IS NULL LIMIT 1/.test(sql)) {
        return { rows: successorInFamily === null ? [] : [{ in_family: successorInFamily }] }; // after it commits
      }
      return { rows: [] };
    },
  } as CheckInQueryable;
}

describe('planCheckIn under a concurrent check-in', () => {
  it('a same-family successor that appeared between the two reads is VERSION_NOT_CURRENT', async () => {
    const plan = await planCheckIn(stub(true), PARAMS);
    expect(plan.ok).toBe(false);
    expect(plan).toMatchObject({ status: 409, code: 'VERSION_NOT_CURRENT' });
  });

  it('a successor outside the family is still VERSION_LINK_CONFLICT', async () => {
    const plan = await planCheckIn(stub(false), PARAMS);
    expect(plan).toMatchObject({ status: 409, code: 'VERSION_LINK_CONFLICT' });
  });

  it('no successor: the next major version is planned', async () => {
    const plan = await planCheckIn(stub(null), PARAMS);
    expect(plan).toMatchObject({ ok: true, version: '2.0' });
  });
});
