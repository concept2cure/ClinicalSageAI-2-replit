/**
 * F-6 guard: the Review board reads the AUTHORING review store and nothing else,
 * and records nothing of its own.
 *
 * ── Why a source guard on top of the PGlite journey ──────────────────────────
 * The journey (review-board-authoring-store.pglite.integration.test.ts) proves
 * the board shows what Authoring wrote. It cannot prove the ABSENCE of a second
 * path: a well-meaning refactor could re-add a `document_workflows` read "for
 * the GA demo rows" or a board-side `decision` route that updates
 * `authoring_reviews` directly, and every journey case would still pass. That
 * is exactly how the two stores came to exist (VSR-001 §4, F-6): each was
 * correct on its own and neither knew about the other.
 *
 * So this pins the shape of the module:
 *   · no import of the unified-workflow tables (document_workflows,
 *     workflow_approvals, workflow_steps, workflow_templates, unified_documents,
 *     workflow_document_versions, workflow_history, document_comments);
 *   · exactly one route, GET /board — the read model the authoring router lacks;
 *   · the read runs on the request-scoped client (RLS), never the shared pool;
 *   · every SQL statement in the read model is tenant-scoped;
 *   · nothing in the board writes: no INSERT/UPDATE/DELETE, no signature — the
 *     decision routes are the authoring router's (POST /documents/:id/review),
 *     and §11.50 signing is POST /docs/:docId/sign / e-sign there too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = readFileSync(join(__dirname, '../review-board-routes.ts'), 'utf8');
const MODEL = readFileSync(join(__dirname, '../../services/review/authoring-review-board.ts'), 'utf8');

/** Match executable code, not the prose about it. */
function executableOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const ROUTE_CODE = executableOnly(ROUTE);
const MODEL_CODE = executableOnly(MODEL);

describe('one store: the board reads authoring_reviews / authoring_workflow_steps', () => {
  it('the read model queries the authoring tables', () => {
    expect(MODEL_CODE).toMatch(/FROM authoring_reviews/);
    expect(MODEL_CODE).toMatch(/FROM authoring_workflow_steps/);
    expect(MODEL_CODE).toMatch(/FROM authoring_documents/);
    expect(MODEL_CODE).toMatch(/FROM authoring_comments/);
  });

  it('neither file touches the unified-workflow store the board used to read', () => {
    for (const sym of [
      'documentWorkflows', 'workflowApprovals', 'workflowSteps', 'workflowTemplates',
      'unifiedDocuments', 'workflowDocumentVersions', 'workflowHistory', 'documentComments',
      'document_workflows', 'workflow_approvals', 'unified_workflow',
    ]) {
      expect(ROUTE_CODE, `review-board-routes.ts still references ${sym}`).not.toContain(sym);
      expect(MODEL_CODE, `authoring-review-board.ts references ${sym}`).not.toContain(sym);
    }
  });
});

describe('one route, one direction: GET /board, read-only', () => {
  it('registers exactly one route and it is GET /board', () => {
    const regs = [...ROUTE_CODE.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(regs).toEqual(['get /board']);
  });

  it('the board-only writes are gone — decisions go through the authoring router', () => {
    for (const gone of ['/change-request', '/decision', '/delegate', '/comments', '/resolve']) {
      expect(ROUTE_CODE).not.toContain(`'/workflows/:workflowId${gone}'`);
      expect(ROUTE_CODE).not.toContain(`'/comments/:commentId${gone}'`);
    }
  });

  it('writes nothing and signs nothing', () => {
    for (const src of [ROUTE_CODE, MODEL_CODE]) {
      expect(src).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(src).not.toMatch(/\bUPDATE\s+authoring_/i);
      expect(src).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(src).not.toMatch(/authoring_signatures/);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

describe('tenant scoping', () => {
  it('runs on the request-scoped client, never the shared pool', () => {
    expect(ROUTE_CODE).toMatch(/requestPgClient\(req\)/);
    expect(ROUTE_CODE).not.toMatch(/getPool\(|from '\.\.\/db'\s*;|import \{ db \}/);
    expect(MODEL_CODE).not.toMatch(/getPool\(|from '\.\.\/\.\.\/db'/);
  });

  it('every statement in the read model carries a tenant_id predicate', () => {
    const statements = [...MODEL_CODE.matchAll(/`\s*(SELECT[\s\S]*?)`/g)].map((m) => m[1]);
    expect(statements.length).toBeGreaterThanOrEqual(5);
    for (const s of statements) {
      expect(s, `unscoped statement:\n${s}`).toMatch(/tenant_id\s*=\s*\$1/);
    }
  });

  it('a program filter is validated as a UUID before it reaches SQL', () => {
    expect(ROUTE_CODE).toMatch(/programId/);
    expect(ROUTE_CODE).toMatch(/400/);
    expect(ROUTE_CODE).toMatch(/\[0-9a-f\]\{8\}/i);
  });
});
