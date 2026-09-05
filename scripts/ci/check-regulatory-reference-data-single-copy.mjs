#!/usr/bin/env node
/**
 * CI Guard: regulatory reference data has exactly one copy.
 *
 * ── The defect (GA ledger L48) ────────────────────────────────────────────────
 * The eCTD fallback template catalog existed twice — `server/data/fallback-
 * templates.ts` and `server/services/templates/ectd-fallback-templates.ts` —
 * 1,134 lines each, byte-identical once comments are stripped, and BOTH were
 * served: `routes/templates.ts` imported one, `routes/misc-inline-routes.ts`
 * and the ich-headings test imported the other.
 *
 * Ordinary duplication costs maintenance. THIS duplication ships a wrong
 * regulatory artifact: the data is the FDA/ICH CTD skeleton — module numbering
 * and section headings — so a correction applied to one copy leaves the other
 * serving the superseded structure, and which skeleton a caller received
 * depended on which endpoint it hit. A submission scaffolded from the stale
 * copy is non-conformant, and the first party to notice is the agency.
 *
 * ── Why a gate and not a comment ──────────────────────────────────────────────
 * Both files already carried a docstring saying they were "extracted from
 * server/index.ts". Two files can each be an honest extraction of the same
 * source and still be two copies. Neither docstring could say the other
 * existed, because neither author knew.
 *
 * ── What is checked ───────────────────────────────────────────────────────────
 * For each guarded export name, the number of modules DECLARING it. More than
 * one is a violation, whichever file is new — this gate does not privilege the
 * incumbent, because the copy that should survive is a judgement and the
 * duplication is not.
 *
 * Deliberately narrow. It guards named regulatory-reference exports, not all
 * duplication: a gate that flags every repeated identifier is one people
 * switch off. Add a name here when a static regulatory catalog gains a second
 * home; that is the moment the cost lands.
 *
 * Exit 0 — one declaring module per guarded export.
 * Exit 1 — a second copy appeared.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

/** export name → what it is, for the failure message. */
const GUARDED = {
  fallbackTemplates: 'the eCTD/ICH CTD fallback template catalog (GA ledger L48)',
};

function declaringModules(name) {
  try {
    const out = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist ` +
        `-E "^export (const|function|class|let|var) ${name}\\b" server client shared`,
      { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return out.trim().split('\n').filter(Boolean).map((l) => l.split(':')[0]);
  } catch {
    return []; // grep exits 1 on no match
  }
}

let failed = false;
console.log('[ci:reg-reference-single-copy] regulatory reference data, one copy each\n');

for (const [name, what] of Object.entries(GUARDED)) {
  const files = declaringModules(name);
  const ok = files.length <= 1;
  console.log(`  ${ok ? '✓' : '✗'} ${name} — ${files.length} declaring module(s)`);
  for (const f of files) console.log(`      ${f}`);
  if (!ok) {
    failed = true;
    console.log(`\n    ${what}`);
    console.log('    Two copies of a regulatory catalog means a correction to one leaves the');
    console.log('    other serving the superseded structure, and which one a caller receives');
    console.log('    depends on which endpoint it hit. Keep one, re-point the importers,');
    console.log('    delete the other.\n');
  }
}

process.exit(failed ? 1 : 0);
