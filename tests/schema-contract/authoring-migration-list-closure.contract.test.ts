/**
 * Contract: a test harness that builds the authoring schema must build ALL of
 * it — every applier file that ALTERs a table the harness creates.
 *
 * ── What this exists to catch ─────────────────────────────────────────────────
 * Fourteen harnesses stand up a real Postgres engine (PGlite) from their OWN
 * hard-coded list of db/migrations files, then drive the real
 * server/routes/authoring.router.ts against it. Each list is a hand-maintained
 * copy of part of the deploy, and a copy drifts:
 *
 *   • 20260817_doc_revisions_immutable_ledger.sql was registered with the
 *     durable applier but with none of those lists. Six harnesses built a
 *     doc_revisions with no ledger columns and ran a router that writes them —
 *     11 assertions failed, in tests whose subject was permissions and filing,
 *     not revisions.
 *   • 20260730_authoring_comments_router_columns.sql had ALREADY drifted the
 *     same way, out of eight lists, before that. Nothing failed yet only
 *     because those harnesses do not touch the comment columns — a latent
 *     break waiting for the first test that does.
 *
 * The failure mode is not "a test is wrong". It is that the proofs run against
 * a schema no deployment would ever have, so a green suite stops meaning the
 * deployed shape works. Registering a migration with the applier is one edit;
 * remembering the fourteen private copies is not something to hold by memory.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * ALTER-closure. If a harness lists any file from AUTHORING_SUBSYSTEM_FILES, and
 * the files it lists CREATE table T, then every applier file that ALTERs T must
 * be in that list too. Ordering is the harness's business; presence is not.
 *
 * This is deliberately narrow: only the applier's own files are required, and
 * only when the harness already builds the table being altered. A harness that
 * stays away from the authoring subsystem is untouched by this gate.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Static: it reads source text, so it proves the file is LISTED, not that the
 * harness executed it. The execution half is covered by
 * authoring-durable-applier.contract.test.ts, which runs the real applier.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORING_SUBSYSTEM_FILES } from '../../scripts/db/authoring-subsystem.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEARCH_ROOTS = ['tests', 'server'];
const MIGRATION_LITERAL = /'(db\/migrations\/[^']+\.sql)'/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Tables a migration file CREATEs and ALTERs. */
function tablesOf(relPath: string): { created: Set<string>; altered: Set<string> } {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) return { created: new Set(), altered: new Set() };
  const sql = fs.readFileSync(abs, 'utf8');
  const names = (re: RegExp) =>
    new Set([...sql.matchAll(re)].map((m) => m[1].toLowerCase()));
  return {
    created: names(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z0-9_.]+)/gi),
    altered: names(/ALTER TABLE(?:\s+IF EXISTS)?\s+([a-z0-9_.]+)/gi),
  };
}

const APPLIER_FILES: string[] = [...AUTHORING_SUBSYSTEM_FILES];
const applierMeta = new Map(APPLIER_FILES.map((f) => [f, tablesOf(f)]));

/** Every harness that lists at least one applier migration, with its list. */
const harnesses = SEARCH_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)))
  .map((abs) => {
    const listed = [
      ...fs.readFileSync(abs, 'utf8').matchAll(MIGRATION_LITERAL),
    ].map((m) => m[1]);
    return { file: path.relative(REPO_ROOT, abs), listed };
  })
  .filter((h) => h.listed.some((f) => APPLIER_FILES.includes(f)));

describe('authoring migration lists in test harnesses are ALTER-closed', () => {
  it('finds the harnesses at all — the gate is not vacuous', () => {
    // If a refactor moves these lists somewhere this scan cannot see, the gate
    // would pass by finding nothing. It must keep finding the real population.
    expect(harnesses.length).toBeGreaterThanOrEqual(10);
  });

  it('and the applier itself still declares files that ALTER what it creates', () => {
    // The rule is only meaningful while the applier ships ALTER files at all.
    const altering = APPLIER_FILES.filter((f) => applierMeta.get(f)!.altered.size > 0);
    expect(altering.length).toBeGreaterThan(0);
  });

  it('no harness builds a table and then skips an applier file that alters it', () => {
    const violations: string[] = [];

    for (const h of harnesses) {
      const created = new Set<string>();
      for (const f of h.listed) for (const t of tablesOf(f).created) created.add(t);

      for (const applierFile of APPLIER_FILES) {
        if (h.listed.includes(applierFile)) continue;
        const altersBuiltTable = [...applierMeta.get(applierFile)!.altered].filter((t) =>
          created.has(t),
        );
        if (altersBuiltTable.length > 0) {
          violations.push(
            `${h.file}\n    builds ${altersBuiltTable.join(', ')} but does not apply ${applierFile}`,
          );
        }
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
  });
});
