/**
 * promote_artifact flips a concept2cure artifact to 'approved' under an explicit
 * human approval (requireHumanApproval). It is not the approval act, so it
 * records no approved version — and when the result is not filable it says so.
 *
 * 2026-09-23 (W5/D7, final pass): product decision — only the governed
 * approval act (the status route's review → approved and authoring-actions
 * approve-artifact, which apply the role table / governed authority and the P12
 * review quorum) may make an artifact filable (artifactApproval,
 * server/services/ectd/package-content-fingerprint.ts). The residual-repair
 * rounds made this handler record approved_version_id (round 2
 * unconditionally; round 3 for review → approved with the quorum met, through
 * APPROVAL_ROLES). That is reverted to HEAD: the status is written, no version
 * is recorded, and the handler warns, when the result is not filable, that
 * filing requires approval through review. An artifact already approved by
 * the governed act keeps its approval and gets no such warning.
 * Superseded: the round-2/3 cases that pinned the recording.
 * Run through the real handler on a real engine (PGlite + drizzle), judged by
 * the real filing rule.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const handlers = vi.hoisted(() => new Map<string, any>());
vi.mock('../../action-registry', () => ({
  registerActionHandler: (h: any) => handlers.set(h.actionType, h),
}));
vi.mock('../../../auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));
vi.mock('../../../contradiction-engine-service', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: vi.fn(async () => ({ blocked: false, blockingFindings: [], warningFindings: [] })),
  },
}));

import '../promote-artifact';
import { artifactApproval } from '../../../ectd/package-content-fingerprint';

const pg = new PGlite();
const db = drizzle(pg);

const DDL = `
DROP TABLE IF EXISTS workflow_document_versions, unified_documents, concept2cure_artifacts CASCADE;
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL,
  conversation_id INTEGER, organization_id INTEGER NOT NULL, type TEXT NOT NULL,
  category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1, ctd_section TEXT, template_id TEXT, ana_thread_id TEXT,
  title_slug TEXT, status TEXT NOT NULL DEFAULT 'draft', approved_version_id INTEGER,
  published_version_id INTEGER, published_at TIMESTAMP, locked_at TIMESTAMP, locked_by_id INTEGER,
  created_by_id INTEGER, metadata JSON, citations JSONB DEFAULT '[]'::jsonb, citation_run_id UUID,
  citations_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE unified_documents (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_by TEXT, updated_at TIMESTAMP DEFAULT NOW(),
  organization_id INTEGER NOT NULL, latest_version INTEGER NOT NULL DEFAULT 1, metadata JSON
);
CREATE TABLE workflow_document_versions (
  id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, content JSON, created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), comments TEXT, organization_id INTEGER NOT NULL
);
`;

const ORG = 7;

beforeEach(async () => {
  await pg.exec(DDL);
  await pg.exec(`
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, type, category, title, content, version, ctd_section, status, metadata)
    VALUES (5, 'artifact_five', 3, ${ORG}, 'markdown', 'document', 'Clinical Overview', 'body v1', 1, '2.5', 'review', '{"harness":{"submissionProgram":"ind"}}');
  `);
});
afterAll(async () => {
  await pg.close();
});

const ctx = (userRole = 'approver') =>
  ({
    user: { userId: 11, userName: 'Approver', userRole, organizationId: ORG },
    db,
    actionId: 'act_1',
    ipAddress: '127.0.0.1',
  }) as any;
const request = () =>
  ({
    actionType: 'promote_artifact',
    targetId: 5,
    projectId: 3,
    sourceSurface: 'ai_panel',
    payload: { approvalReason: 'Reviewed and approved for filing', confirmApproval: true },
  }) as any;

interface Row {
  status: string;
  version: number;
  approved_version_id: number | null;
  published_version_id: number | null;
}
const row = async (): Promise<Row> =>
  (
    await pg.query<Row>(
      'SELECT status, version, approved_version_id, published_version_id FROM concept2cure_artifacts WHERE id = 5'
    )
  ).rows[0];
const filable = (r: Row) =>
  artifactApproval({
    status: r.status,
    version: r.version,
    approvedVersionId: r.approved_version_id,
    publishedVersionId: r.published_version_id,
  });

// 2026-09-23 (W5/D7, final pass, repair): the warning must name the governed
// act that records the version and say this action records none — not a
// generic "approval through review" a user could take to mean this action.
const NAMES_GOVERNED_APPROVE = /An approved version is recorded only by the review workflow's Approve action \(the status route's review → approved, .*authoring-actions approve-artifact\); this action records none/;
const FALSE_REMEDIES = [
  '(approved → review, then review → approved), which records',
  'Filing requires approval through review, which records the approved version.',
];
const expectTruthfulRemedy = (warnings: string[]) => {
  const text = warnings.join(' ');
  expect(text).toMatch(NAMES_GOVERNED_APPROVE);
  for (const f of FALSE_REMEDIES) expect(text).not.toContain(f);
};
const promote = (role?: string) => handlers.get('promote_artifact').execute(request(), ctx(role));

describe('promote_artifact records no approved version', () => {
  it.each(['approver', 'editor', 'regulatory', 'super_admin'])(
    'a %s promoting from review: status approved, no approved version, not filable, and the warning says so',
    async role => {
      const out = await promote(role);
      expect(out.success).toBe(true);
      const r = await row();
      expect(r.status).toBe('approved');
      expect(r.approved_version_id).toBeNull();
      expect(filable(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
      expectTruthfulRemedy(out.warnings);
    },
    30_000
  );

  it('promoting a DRAFT nobody reviewed records no approved version, and the warning says so', async () => {
    await pg.query("UPDATE concept2cure_artifacts SET status = 'draft' WHERE id = 5");
    const out = await promote();
    expect(out.success).toBe(true);
    const r = await row();
    expect(r.approved_version_id).toBeNull();
    expect(filable(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
    expectTruthfulRemedy(out.warnings);
  }, 30_000);

  it('promoting an artifact approved at v1 and edited to v2 does not re-stamp v2 (stays edited-after-approval)', async () => {
    await pg.query(
      "UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = 1, version = 2, content = 'body v2' WHERE id = 5"
    );
    const out = await promote();
    expect(out.success).toBe(true);
    const r = await row();
    expect(r.approved_version_id).toBe(1);
    expect(filable(r)).toMatchObject({ filable: false, reason: 'edited-after-approval' });
    expectTruthfulRemedy(out.warnings);
  }, 30_000);

  it('promoting an artifact the governed act approved at its current version keeps it filable and claims nothing else', async () => {
    await pg.query("UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = 1 WHERE id = 5");
    const out = await promote();
    expect(out.success).toBe(true);
    expect(filable(await row())).toEqual({ filable: true });
    expect(out.warnings.join(' ')).not.toMatch(/cannot be filed|not filable|no approved version|Filing requires|recorded only by/i);
  }, 30_000);

  it('the human-approval gate is unchanged: no reason/confirmation, no approval and no version recorded', async () => {
    const req = request();
    req.payload = {};
    await expect(handlers.get('promote_artifact').execute(req, ctx())).rejects.toMatchObject({
      code: 'APPROVAL_REASON_REQUIRED',
    });
    const r = await row();
    expect(r.status).toBe('review');
    expect(r.approved_version_id).toBeNull();
  }, 30_000);
});
