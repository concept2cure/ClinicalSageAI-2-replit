/**
 * Batch-draft acceptance — the two decisions that can author regulatory prose
 * to the wrong expectations, and the SQL that must stay honest.
 *
 * WHY THESE AND NOT "does the route return 200".
 *
 * `POST /api/batch-draft/documents/:id/accept` writes machine-generated prose
 * into a regulated document. Two things about it are load-bearing, and neither
 * shows up as a failing request:
 *
 *   1. `deriveFramework` decides what the picker is PRESET to on the next
 *      batch. Return a value the documents do not actually agree on and the
 *      next drafts are silently authored to the wrong regulatory expectations —
 *      confident, plausible, wrong, and much harder to catch in review than a
 *      blank field. Every case below is a case where returning a value would be
 *      a lie.
 *   2. The accepted content REPLACES the document body. The version snapshot is
 *      the only thing that makes that reversible, and the audit row is the only
 *      thing that makes it attributable. Both live in the same transaction as
 *      the UPDATE; a refactor that moves either one out is the failure this
 *      file has to catch, so the statement text is asserted directly.
 *
 * The framework allowlist is checked against its source of truth
 * (AnaDocumentDraftingService `RegulatoryFramework`) by reading that file,
 * because the duplication is deliberate — the route must not import the whole
 * drafting service — and duplication without a drift check is just a bug with a
 * delay on it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveFramework, REGULATORY_FRAMEWORKS } from '../batch-draft-routes';

const ROUTE_SOURCE = readFileSync(join(__dirname, '../batch-draft-routes.ts'), 'utf8');

/**
 * Strip comments before matching statement text.
 *
 * The first version of this file did not, and the route's own documentation
 * defeated its own guard: the comment explaining WHY the SELECT takes
 * `FOR UPDATE` contains the words "FOR UPDATE", so deleting the lock from the
 * SQL left the assertion passing. A guard that matches prose about the code
 * instead of the code proves nothing.
 */
function executableOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('deriveFramework — a preset framework must be a remembered fact', () => {
  it('returns the framework when every document that records one agrees', () => {
    expect(
      deriveFramework([
        { regulatoryFramework: 'ich_clinical' },
        { regulatoryFramework: 'ich_clinical' },
      ]),
    ).toBe('ich_clinical');
  });

  it('returns null when two documents disagree — a mixed dossier has no single answer', () => {
    expect(
      deriveFramework([
        { regulatoryFramework: 'ich_clinical' },
        { regulatoryFramework: 'fda_510k' },
      ]),
      'a dossier drafted under two frameworks was collapsed to one of them',
    ).toBeNull();
  });

  it('ignores documents that record nothing — a half-drafted dossier still has one filing type', () => {
    expect(
      deriveFramework([
        {},
        null,
        { regulatoryFramework: 'fda_pma' },
        { someOtherKey: 'fda_510k' },
      ]),
    ).toBe('fda_pma');
  });

  it('returns null for a dossier that has never been drafted', () => {
    expect(deriveFramework([{}, null, undefined])).toBeNull();
    expect(deriveFramework([])).toBeNull();
  });

  it('ignores non-string and blank values rather than coercing them', () => {
    // A number or an object here means something else wrote the key. Coercing
    // it to a string would put `[object Object]` in the picker.
    expect(deriveFramework([{ regulatoryFramework: 42 }])).toBeNull();
    expect(deriveFramework([{ regulatoryFramework: '   ' }])).toBeNull();
    expect(deriveFramework([{ regulatoryFramework: ['ich_clinical'] }])).toBeNull();
  });

  it('trims, so a stored " ich_clinical " matches the picker option', () => {
    expect(deriveFramework([{ regulatoryFramework: ' ich_clinical ' }])).toBe('ich_clinical');
  });

  it('tolerates a metadata column that is not an object at all', () => {
    expect(deriveFramework(['a string', 7, true, null])).toBeNull();
  });
});

describe('the framework allowlist has not drifted from the drafting service', () => {
  it('matches RegulatoryFramework exactly', () => {
    const source = readFileSync(
      join(__dirname, '../../services/ana/AnaDocumentDraftingService.ts'),
      'utf8',
    );
    const decl = /export type RegulatoryFramework\s*=\s*([^;]+);/.exec(source);
    expect(decl, 'RegulatoryFramework is no longer declared where this test looks').not.toBeNull();

    const fromService = (decl as RegExpExecArray)[1]
      .split('|')
      .map(part => part.trim().replace(/^'(.*)'$/, '$1'))
      .filter(Boolean)
      .sort();

    expect([...REGULATORY_FRAMEWORKS].sort()).toEqual(fromService);
  });

  it('rejects a value the drafting service has no expectations for', () => {
    // The recorded framework is handed straight back as the next batch's
    // default, so storing an unrecognised one would quietly become the
    // expectations the next drafts are written to.
    expect(REGULATORY_FRAMEWORKS.has('iso_13485')).toBe(false);
    expect(REGULATORY_FRAMEWORKS.has('')).toBe(false);
  });
});

describe('the acceptance write stays reversible, attributable, and atomic', () => {
  const acceptRoute = executableOnly(
    ROUTE_SOURCE.slice(ROUTE_SOURCE.indexOf("router.post('/documents/:id/accept'")),
  );

  it('is a real route, not a placeholder', () => {
    expect(acceptRoute.length, 'the accept route is gone').toBeGreaterThan(500);
  });

  it('snapshots the replaced content into coauthor_document_versions', () => {
    expect(acceptRoute).toMatch(/INSERT INTO coauthor_document_versions/);
    // The snapshot must carry the content being REPLACED. Writing the new
    // content instead would leave the history describing a state that never
    // preceded anything, and the accept would not be undoable.
    expect(acceptRoute).toMatch(/\$\{previousContent\}/);
  });

  it('locks the row it is about to read-then-overwrite', () => {
    // Without FOR UPDATE a concurrent accept on the same section can interleave
    // between the snapshot read and the update, and the version history stops
    // describing what happened.
    expect(acceptRoute).toMatch(/FOR UPDATE/);
  });

  it('writes an audit event for the change, in the same transaction', () => {
    // \b matters: without it this passed against `audit_events_disabled`,
    // because the assertion was matching a prefix of a different table.
    expect(acceptRoute).toMatch(/INSERT INTO audit_events\b/);
    expect(acceptRoute).toMatch(/coauthor_document\.draft_accepted/);
    // 21 CFR Part 11 §11.10(e): both flags, or the row is not part of the
    // regulated trail the console reads.
    expect(acceptRoute).toMatch(/true, true, NOW\(\)/);

    const beginAt = acceptRoute.indexOf('BEGIN');
    const auditAt = acceptRoute.indexOf('INSERT INTO audit_events');
    const commitAt = acceptRoute.indexOf('COMMIT');
    expect(beginAt).toBeGreaterThan(-1);
    expect(auditAt, 'the audit insert is outside the transaction').toBeGreaterThan(beginAt);
    expect(commitAt, 'the audit insert is after the commit').toBeGreaterThan(auditAt);
  });

  it('rolls back rather than leaving a half-applied acceptance', () => {
    expect(acceptRoute).toMatch(/ROLLBACK/);
  });

  it('scopes both the read and the write to the authenticated organization', () => {
    // Tenant isolation is not optional on a route that overwrites documents by
    // id. Both statements must carry it; a bare `WHERE id = $1` would let any
    // authenticated org overwrite any document.
    const orgScoped = acceptRoute.match(/id = \$\{documentId\} AND organization_id = \$\{organizationId\}/g);
    expect(orgScoped?.length ?? 0, 'a statement addresses a document by id alone').toBeGreaterThanOrEqual(2);
    expect(acceptRoute).toMatch(/getOrganizationId\(req\)/);
  });

  it('merges metadata instead of replacing it', () => {
    // `metadata` is shared with other writers. A bare assignment would drop
    // whatever else the document carries.
    expect(acceptRoute).toMatch(/COALESCE\(metadata::jsonb, '\{\}'::jsonb\) \|\|/);
  });

  it('never takes the actor from the request body', () => {
    // An audit trail whose attribution the client can set is not an audit trail.
    expect(acceptRoute).toMatch(/getActor\(req\)/);
    expect(acceptRoute).not.toMatch(/body\.(userId|userName|user_id|organizationId)/);
  });
});
