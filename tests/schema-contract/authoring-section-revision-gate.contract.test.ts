/**
 * Contract: no handler overwrites section content without first snapshotting it.
 *
 * ── Why a gate and not just a test ────────────────────────────────────────────
 * c2c_document_sections cannot lose a version: c2c_snapshot_section_version() is
 * a BEFORE UPDATE trigger that copies the outgoing row into the immutable
 * version ledger and RAISES if no actor is set, so attribution is enforced by
 * the database and a handler that forgets it gets an error, not silent loss.
 *
 * authoring_sections has no such trigger. Its history lives in doc_revisions and
 * is written by an APPLICATION call — createRevision(...) — placed by hand in
 * each handler that overwrites content. That is a convention, and a convention
 * held only by memory is one refactor away from a handler that replaces a
 * section's text with no record of what was there. On a 21 CFR Part 11 surface
 * that is not a missing feature, it is destroyed evidence.
 *
 * Adding the trigger would be the stronger answer and is not this change: a
 * BEFORE UPDATE that RAISES without a GUC would break every write path that does
 * not yet set one, converting a data-integrity gap into an outage. The gate
 * below makes the convention enforceable now; the trigger can follow once every
 * writer sets an actor.
 *
 * ── What it caught ────────────────────────────────────────────────────────────
 * A fourth site existed until this change: the change-request apply handler
 * replaced section content outright with no snapshot at all. It went with the
 * rest of the doc_change_requests surface — that table is defined nowhere, so
 * the handler could never reach its UPDATE, and nothing in the client called it.
 *
 * ── Mechanism ─────────────────────────────────────────────────────────────────
 * Source-derived: every `UPDATE authoring_sections` in the router is located,
 * the enclosing route handler is bounded by the surrounding `router.<verb>(`
 * registrations, and a createRevision call must appear inside it. Comments are
 * stripped first, so prose describing the rule cannot satisfy the rule.
 *
 * This is a static gate and says so: it proves the snapshot call is PRESENT, not
 * that it ran. The behaviour is covered separately —
 * tests/golden-journeys/ind-authoring.journey.test.ts drives a real section save
 * and asserts revision_created, and the apply-template snapshot is asserted in
 * tests/schema-contract/authoring-router-columns.contract.test.ts's coverage of
 * the overwrite branch.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../ui/_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER = path.join(REPO_ROOT, 'server/routes/authoring.router.ts');

const src = stripComments(fs.readFileSync(ROUTER, 'utf8'));
const lineOf = (index: number) => src.slice(0, index).split('\n').length;

/** Byte offsets of every `router.get|post|put|patch|delete(` registration. */
function routeStarts(text: string): number[] {
  const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m.index);
  return out;
}

/** The [start, end) of the route handler containing `index`. */
function enclosingHandler(starts: number[], index: number): [number, number] | null {
  let start = -1;
  for (const s of starts) {
    if (s <= index) start = s;
    else return start === -1 ? null : [start, s];
  }
  return start === -1 ? null : [start, src.length];
}

const STARTS = routeStarts(src);

interface Site { index: number; line: number; body: string }

const updateSites: Site[] = [];
{
  const re = /\bUPDATE\s+authoring_sections\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const span = enclosingHandler(STARTS, m.index);
    updateSites.push({
      index: m.index,
      line: lineOf(m.index),
      body: span ? src.slice(span[0], span[1]) : '',
    });
  }
}

describe('every section-content overwrite is preceded by a revision snapshot', () => {
  it('finds the write sites at all — the gate is not vacuous', () => {
    // If the router is refactored so this pattern stops matching, every
    // assertion below passes trivially. Three sites exist today: the section
    // PATCH, the revert, and apply-template's overwrite branch.
    expect(updateSites.length).toBeGreaterThanOrEqual(3);
  });

  it('each one sits inside a handler that also calls createRevision', () => {
    const unguarded = updateSites
      .filter((s) => !/\bcreateRevision\s*\(/.test(s.body))
      .map((s) => `server/routes/authoring.router.ts:${s.line}`);
    expect(unguarded).toEqual([]);
  });

  it('createRevision itself still writes the revision ledger', () => {
    // The pairing above is worthless if the helper stops inserting. Anchored on
    // the table and the columns the history endpoint reads back.
    expect(src).toMatch(/INSERT INTO doc_revisions\s*\(id, section_id, content, created_by, created_at, tenant_id\)/);
  });

  it('and it is tenant-scoped, so a snapshot cannot land in another org', () => {
    const helper = /const createRevision = async \(([\s\S]{0,900}?)\n\};/.exec(src);
    expect(helper, 'createRevision helper not found').not.toBeNull();
    expect(helper![1]).toMatch(/tenantId/);
  });
});

describe('the section store has exactly one revision ledger', () => {
  it('nothing writes a second section-history table', () => {
    // doc_revisions is the prior-content history for authoring_sections;
    // c2c_document_section_versions is the trigger-written ledger for the
    // governed store. A third would be the split this convergence is closing.
    //
    // Scoped to revision/version table names on purpose:
    // authoring_export_history also matches a loose "_history" pattern and is a
    // different thing entirely — a log of export runs, not of section content.
    const inserts = [...src.matchAll(/INSERT\s+INTO\s+(\w*revision\w*|\w*section_version\w*)\b/gi)]
      .map((m) => m[1].toLowerCase());
    const distinct = [...new Set(inserts)].sort();
    expect(distinct).toEqual(['doc_revisions']);
  });
});
