#!/usr/bin/env node
/**
 * check-validation-traceability.mjs — refuse a validation package whose
 * requirements cite code that is no longer there.
 *
 * ── What this adds, and why it is not the traceability matrix ────────────────
 * `npm run validation:traceability` builds TM-001 by reading the requirement
 * tables in `docs/validation/URS-00*.md` and joining them to the executed OQ
 * results. It answers "was this requirement verified, and did the verification
 * pass". It does NOT ask whether the code each requirement cites still exists —
 * and it cannot, because a deleted file simply stops being mentioned. The row
 * still renders, the matrix still looks complete, and the package quietly
 * becomes a description of a codebase that has moved on.
 *
 * That is the failure this repository keeps having to remove: a control that
 * reports success while doing nothing. So this gate makes the citation
 * load-bearing. Move a route, rename a service, delete a module, and the build
 * goes red naming the requirement that just lost its anchor.
 *
 * ── How citations are resolved ───────────────────────────────────────────────
 * The fifth column holds backticked references, and they come in two shapes
 * because that is how the URS documents are written:
 *
 *   `server/routes/vault-ingest.ts:60-63, 165-198`   a repo-relative path
 *   `vault-ingest.service.ts:193`                    a bare filename, continuing
 *                                                    from a sibling of the last
 *
 * A bare filename is resolved by basename across the repository. If exactly one
 * file matches it resolves; if none matches that is a finding; if several match
 * that is ALSO a finding, because an ambiguous citation cannot be followed by a
 * reviewer and is not traceability. Line numbers are stripped — they go stale
 * constantly and pinning them would make this gate noise rather than signal.
 *
 * ── Second check: the record states the assurance activity the protocol set ──
 * Each OQ protocol declares every step's kind: scripted (a pass criterion the
 * runner checks), unscripted or ad-hoc (the runner records what it observed
 * and a reviewer judges it), or prerequisite. The execution record prints the
 * kind the RUNNER gave the step, and the harness defaults to scripted. No
 * runner declared a kind, so every record presented unscripted and ad-hoc
 * steps as scripted passes: 18 steps across the six protocols, among them
 * OQ-SRDY-05, which passed on a readiness review built from reads that had
 * all failed (VSR-001 F-23). So every step a runner executes must carry the
 * kind its protocol declares, and neither may list a step the other lacks.
 *
 * Usage:
 *   node scripts/ci/check-validation-traceability.mjs
 *   node scripts/ci/check-validation-traceability.mjs --self-test
 *
 * Exit 0 when every citation resolves and every step's kind matches; 1 otherwise.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF_TEST = process.argv.includes('--self-test');

/** `| URS-VAULT-001 | statement | §11.10(d) | high | `path`, `path` |` */
const URS_ROW = /^\|\s*(URS-[A-Z]+-\d{3}[a-z]?)\s*\|(.*)$/;
const BACKTICKED = /`([^`]+)`/g;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'test-results']);

/**
 * Index every file in the repository by basename.
 *
 * A basename mapping to several files is kept as a list rather than collapsed,
 * because silently choosing one would turn an ambiguous citation — which a
 * reviewer cannot follow — into a resolved one.
 */
function indexBasenames(root) {
  const byName = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full);
      } else {
        const rel = path.relative(root, full);
        const list = byName.get(e.name);
        if (list) list.push(rel);
        else byName.set(e.name, [rel]);
      }
    }
  };
  walk(root);
  return byName;
}

/** Strip a trailing `:12`, `:12-34` or `:12-34, 56-78` line reference. */
function stripLines(ref) {
  return ref.replace(/:\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/, '').trim();
}

/**
 * A citation is a reference to a FILE. The column also carries prose in
 * backticks — an env var, a column name, an HTTP path — and treating those as
 * missing files would bury the real findings in noise. Only things shaped like
 * a source file are checked.
 */
function looksLikeFile(ref) {
  return /\.[a-z]{2,5}$/i.test(ref) && !ref.startsWith('http') && !ref.includes(' ');
}

export function collectFindings(root) {
  const findings = [];
  const docsDir = path.join(root, 'docs', 'validation');
  if (!fs.existsSync(docsDir)) {
    return [{ rule: 'no-docs', id: '-', detail: 'docs/validation does not exist' }];
  }
  const ursFiles = fs
    .readdirSync(docsDir)
    .filter((f) => /^URS-\d{3}-.*\.md$/.test(f))
    .sort();
  if (ursFiles.length === 0) {
    return [{ rule: 'no-urs', id: '-', detail: 'no URS-NNN-*.md documents found in docs/validation' }];
  }

  const byName = indexBasenames(root);
  let rows = 0;

  for (const file of ursFiles) {
    let rowsHere = 0;
    const lines = fs.readFileSync(path.join(docsDir, file), 'utf8').split('\n');
    for (const line of lines) {
      const m = URS_ROW.exec(line.trim());
      if (!m) continue;
      const [, id, rest] = m;
      rowsHere += 1;
      rows += 1;

      /* Citations live in the LAST column. Splitting the whole row would also
         pick up backticked identifiers in the requirement text itself. */
      const cols = rest.split('|');
      const lastCol = cols.length >= 2 ? cols[cols.length - 2] : '';
      const refs = [...lastCol.matchAll(BACKTICKED)]
        .flatMap((x) => x[1].split(','))
        .map((r) => stripLines(r.trim()))
        .filter((r) => r && looksLikeFile(r));

      if (refs.length === 0) {
        findings.push({ rule: 'uncited', id, detail: `${file}: no implementing file cited — the requirement is unanchored` });
        continue;
      }
      for (const ref of refs) {
        if (ref.includes('/')) {
          if (!fs.existsSync(path.join(root, ref))) {
            findings.push({ rule: 'dangling', id, detail: `${file}: cited path does not exist: ${ref}` });
          }
          continue;
        }
        const matches = byName.get(ref);
        if (!matches || matches.length === 0) {
          findings.push({ rule: 'dangling', id, detail: `${file}: cited file not found anywhere: ${ref}` });
        } else if (matches.length > 1) {
          findings.push({
            rule: 'ambiguous',
            id,
            detail: `${file}: "${ref}" matches ${matches.length} files (${matches.slice(0, 3).join(', ')}…) — a reviewer cannot follow it`,
          });
        }
      }
    }
    if (rowsHere === 0) {
      findings.push({ rule: 'empty-urs', id: file, detail: 'this URS document declares no requirements' });
    }
  }

  if (rows === 0) findings.push({ rule: 'no-rows', id: '-', detail: 'no requirement rows parsed from any URS document' });
  return findings;
}

/** A protocol's step kind, reduced to the four the harness records. */
export function protocolKind(cell) {
  const text = cell.replace(/\*/g, '').replace(/\([^)]*\)/g, ' ').trim().toLowerCase();
  const word = text.split(/\s+/)[0] ?? '';
  // A credentialed step is a scripted step that needs a second identity.
  if (word === 'credentialed') return 'scripted';
  return ['scripted', 'unscripted', 'ad-hoc', 'prerequisite'].includes(word) ? word : null;
}

/** The step definitions of a runner: id and declared kind (the harness default is scripted). */
export function runnerSteps(source) {
  const steps = new Map();
  for (const chunk of source.split(/await step\(/).slice(1)) {
    const definition = chunk.split(/\n\s*(?:async\s*)?\(\s*(?:\{|ctx\b|\))|\n\s*async\s+function/)[0];
    const id = /\bid:\s*'(OQ-[A-Z]+-\d+[a-z]?)'/.exec(definition)?.[1];
    if (!id) continue;
    steps.set(id, /\bkind:\s*'([a-z-]+)'/.exec(definition)?.[1] ?? 'scripted');
  }
  return steps;
}

export function collectKindFindings(root) {
  const findings = [];
  const docsDir = path.join(root, 'docs', 'validation');
  if (!fs.existsSync(docsDir)) return findings;
  for (const file of fs.readdirSync(docsDir).filter((f) => /^OQ-\d{3}-.*\.md$/.test(f)).sort()) {
    const text = fs.readFileSync(path.join(docsDir, file), 'utf8');
    const runnerPath = /^\|\s*Runner[^|]*\|\s*`([^`]+\.mjs)`/m.exec(text)?.[1];
    if (!runnerPath || !fs.existsSync(path.join(root, runnerPath))) {
      findings.push({ rule: 'no-runner', id: file, detail: `names no runner that exists (${runnerPath ?? 'none'})` });
      continue;
    }
    const declared = new Map();
    for (const line of text.split('\n')) {
      const m = /^\|\s*(OQ-[A-Z]+-\d+[a-z]?)\s*\|[^|]*\|([^|]*)\|/.exec(line);
      if (m && !declared.has(m[1])) declared.set(m[1], protocolKind(m[2]));
    }
    const executed = runnerSteps(fs.readFileSync(path.join(root, runnerPath), 'utf8'));
    for (const [id, kind] of executed) {
      if (!declared.has(id)) {
        findings.push({ rule: 'undescribed-step', id, detail: `${runnerPath} executes it; ${file} does not describe it` });
      } else if (declared.get(id) === null) {
        findings.push({ rule: 'unknown-kind', id, detail: `${file} gives it no kind the harness can record` });
      } else if (declared.get(id) !== kind) {
        findings.push({
          rule: 'kind-mismatch',
          id,
          detail: `${file} declares it ${declared.get(id)}; ${runnerPath} records it ${kind}`,
        });
      }
    }
    for (const id of declared.keys()) {
      if (!executed.has(id)) {
        findings.push({ rule: 'unexecuted-step', id, detail: `${file} describes it; ${runnerPath} does not execute it` });
      }
    }
  }
  return findings;
}

function checkRepo() {
  const kindFindings = collectKindFindings(REPO_ROOT);
  if (kindFindings.length > 0) {
    console.error(`✗ validation traceability: ${kindFindings.length} step(s) recorded differently from their protocol\n`);
    for (const f of kindFindings) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
    console.error(
      '\nA record that calls an unscripted step scripted overstates what was verified.\n' +
        'Give the runner step the kind its protocol declares (kind: ...), or change the protocol.',
    );
    return 1;
  }
  const findings = collectFindings(REPO_ROOT);
  if (findings.length === 0) {
    const n = fs
      .readdirSync(path.join(REPO_ROOT, 'docs', 'validation'))
      .filter((f) => /^URS-\d{3}-.*\.md$/.test(f)).length;
    console.log(`✓ validation traceability: every file cited by ${n} URS document(s) resolves; every OQ step carries its protocol's kind`);
    return 0;
  }
  console.error(`✗ validation traceability: ${findings.length} finding(s)\n`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
  console.error(
    '\nA citation that cannot be followed is not traceability. Update the URS row\n' +
      'to the code\'s new home, or remove the requirement.',
  );
  return 1;
}

/* ── the self-test ───────────────────────────────────────────────────────────
 * Each case builds a fixture repository that breaks exactly one rule. The first
 * two are controls that break none: without them, a checker that reported
 * "everything is broken" would pass every other case.
 */
function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urs-trace-'));
  const docs = path.join(root, 'docs', 'validation');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'routes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server', 'routes', 'vault.ts'), '// impl\n');
  fs.writeFileSync(path.join(root, 'server', 'services', 'unique-name.ts'), '// impl\n');
  // Two files sharing a basename, so ambiguity is reachable.
  fs.writeFileSync(path.join(root, 'server', 'routes', 'shared.ts'), '// a\n');
  fs.writeFileSync(path.join(root, 'server', 'services', 'shared.ts'), '// b\n');

  const HEAD = '| ID | Requirement | Reg | Risk | Implemented by |\n|---|---|---|---|---|\n';
  const write = (body) => fs.writeFileSync(path.join(docs, 'URS-001-VAULT.md'), HEAD + body);

  const cases = [
    ['control — a full path that exists', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `server/routes/vault.ts:12-40` |\n', 0],
    ['control — a bare filename matching exactly one file', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `server/routes/vault.ts`, `unique-name.ts:19` |\n', 0],
    ['a cited path that does not exist', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `server/routes/deleted.ts:12` |\n', 1],
    ['a bare filename that matches nothing', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `renamed-away.ts:12` |\n', 1],
    ['a bare filename that matches several files', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `shared.ts:12` |\n', 1],
    ['a requirement citing no implementing file at all', '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | none |\n', 1],
    ['a URS document declaring no requirements', '', 1],
    [
      'one good row and one broken row — the broken one is still caught',
      '| URS-VAULT-001 | The vault refuses an anonymous read. | §11.10(d) | high | `server/routes/vault.ts` |\n' +
        '| URS-VAULT-002 | The vault records a SHA-256 for every document. | §11.10(e) | high | `server/routes/gone.ts` |\n',
      1,
    ],
    [
      'prose in backticks is not mistaken for a missing file',
      '| URS-VAULT-001 | Refused unless `RLS_ENFORCE` is on and `organization_id` matches. | §11.10(d) | high | `server/routes/vault.ts` |\n',
      0,
    ],
  ];

  let failures = 0;
  for (const [name, body, expect] of cases) {
    write(body);
    const findings = collectFindings(root);
    const caught = findings.length > 0 ? 1 : 0;
    const ok = caught === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) {
      console.log(
        expect === 1
          ? '      NOT CAUGHT — this mutation survived the checker'
          : `      false positive: ${findings.map((f) => `${f.rule}/${f.detail}`).join('; ')}`,
      );
    }
  }

  /* The kind check: one protocol, one runner. Two controls first. */
  fs.rmSync(path.join(docs, 'URS-001-VAULT.md'));
  fs.mkdirSync(path.join(root, 'tests', 'oq'), { recursive: true });
  const PROTOCOL_HEAD =
    '| Runner (the executable protocol) | `tests/oq/run.mjs` |\n\n| Step | URS | Kind | Action | Expected |\n|---|---|---|---|---|\n';
  const step = (id, kind) =>
    `await step(\n  {\n    id: '${id}',\n    urs: [],${kind ? `\n    kind: '${kind}',` : ''}\n    title: 't',\n  },\n  async ({ api }) => 'ok',\n);\n`;
  const kindCases = [
    ['control — scripted by default, unscripted declared', '| OQ-X-01 | U | scripted | a | e |\n| OQ-X-02 | U | unscripted (browser) | a | e |\n', step('OQ-X-01') + step('OQ-X-02', 'unscripted'), 0],
    ['control — a credentialed step is scripted', '| OQ-X-01 | U | **credentialed** (signer) | a | e |\n', step('OQ-X-01'), 0],
    ['an unscripted step the runner records as scripted', '| OQ-X-01 | U | unscripted | a | e |\n', step('OQ-X-01'), 1],
    ['an ad-hoc step the runner records as unscripted', '| OQ-X-01 | U | ad-hoc (browser) | a | e |\n', step('OQ-X-01', 'unscripted'), 1],
    ['a step the protocol describes and the runner never executes', '| OQ-X-01 | U | scripted | a | e |\n| OQ-X-02 | U | scripted | a | e |\n', step('OQ-X-01'), 1],
    ['a step the runner executes and the protocol does not describe', '| OQ-X-01 | U | scripted | a | e |\n', step('OQ-X-01') + step('OQ-X-03'), 1],
  ];
  for (const [name, table, runner, expect] of kindCases) {
    fs.writeFileSync(path.join(docs, 'OQ-001-X.md'), PROTOCOL_HEAD + table);
    fs.writeFileSync(path.join(root, 'tests', 'oq', 'run.mjs'), runner);
    const findings = collectKindFindings(root);
    const ok = (findings.length > 0 ? 1 : 0) === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) {
      console.log(
        expect === 1
          ? '      NOT CAUGHT — this mutation survived the checker'
          : `      false positive: ${findings.map((f) => `${f.rule}/${f.detail}`).join('; ')}`,
      );
    }
  }
  cases.push(...kindCases);

  fs.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`\n✗ self-test: ${failures} case(s) wrong. The gate does not do what it claims.`);
    return 1;
  }
  console.log(`\n✓ self-test: ${cases.length} cases, every mutation caught and the controls clean`);
  return 0;
}

process.exit(SELF_TEST ? selfTest() : checkRepo());
