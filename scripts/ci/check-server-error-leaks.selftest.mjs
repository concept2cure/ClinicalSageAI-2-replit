#!/usr/bin/env node
/**
 * Self-test for ci:server-error-leaks (scripts/ci/check-server-error-leaks.mjs).
 *
 * On the real tree the gate reports "OK — 10 baselined site(s) across 10
 * file(s); no file gained one", so its failure branch never fires in normal
 * use. A gate whose failure branch has never been seen has not been tested
 * (CLAUDE.md, working agreement). This shows it firing.
 *
 * Each case writes a throwaway server/ tree into a temp directory, writes a
 * baseline beside it, and runs a copy of the REAL gate whose `repoRoot` and
 * `BASELINE_FILE` constants are patched to point there. Nothing else in the
 * gate is changed, so what is tested is the command CI runs.
 *
 * The failing cases are the shapes the gate's header and history name:
 *   - the incident itself: the pre-fix `serverError()` copying `err.message`
 *     into a body its own docstring called "sanitized";
 *   - the copy-pasted per-route `fail()` helper (346 sites / 72 files when the
 *     gate was written; server/routes/grants.ts still carries one) — and only
 *     its 500 counts, not the dynamic-status 4xx line above it;
 *   - the multi-line chat body (server/routes/cortex-unified.ts);
 *   - a catch NAMED for what it does, in both suffixes the gate's binding
 *     covers: `promoteErr`, `upstreamErr`, and `aiError` — `…Error` is the
 *     commoner spelling in server/ (aiError ×12, auditError ×8, parseError ×7);
 *   - the fixed bindings the suffix cannot cover, which the gate's header keeps
 *     the literal list for: `catch (ex)`, a promise chain's `.catch((reason) =>`,
 *     and Drizzle's wrapped driver error read as `(err as any).cause?.message`
 *     (the spelling server/services/featureToggleService.ts uses);
 *   - every other spelling the gate lists: optional chaining, an `as` cast,
 *     `String(err)`, `err.stack`, `.send(`, and EACH of the Postgres driver's
 *     own fields (detail, hint, constraint, table, column, routine) on its own;
 *   - the 2026-09-29 alias (docs/evidence/D2/2026-09-29-correspondence-work-
 *     items/): `const message = e instanceof Error ? e.message : …` then
 *     `detail: message` — which shipped Drizzle's failed-query text, the
 *     requester's e-mail among the params, while the gate read green; the same
 *     alias as `{ message }` shorthand, as a `let` truncated before it is sent,
 *     as a legacy `var`, and declared at the top of a long compensating catch
 *     block just inside ALIAS_LOOKBACK;
 *   - a `)` and `;` INSIDE the body's string literal (enumerated steps in a
 *     message), which must not end the statement before the leak is reached —
 *     in single quotes, with an escaped apostrophe (`didn\'t`), in double
 *     quotes and in a template literal;
 *   - a leak in each extension the gate scans (.ts, .js, .mjs, .mts — the tree
 *     has server/common/exportFormats.mjs and server/db.js).
 *
 * The quiet cases are the near-misses the gate's comments say it must not
 * flag: the canonical `serverError()` call and its current implementation
 * (which binds the detail to a local and sends it only to the logger), a
 * correct fail-closed 503 followed by a logger line with no blank line between
 * (the shape the first statement-cut reported as a leak), a 503 that sends no
 * body at all with the logger after it (no-semicolon style, and `end(callback)`),
 * an alias that goes only to the logger while the body uses `message:` as a
 * KEY or reads `notice.message` as a PROPERTY, a logger-only alias more than
 * ALIAS_LOOKBACK characters above another handler's static `message`, 4xx
 * bodies, `.message` read off a job record or off an identifier merely ending
 * in `e`, `pendingStore()`, comment prose about this very rule (apostrophes
 * included), and code the walker must not enter: tests, specs, __tests__/,
 * __mocks__/, dist/, build/, node_modules/, .d.ts files, and code outside
 * server/.
 *
 * Baseline semantics: per-FILE counts, not lines (an edit above a baselined
 * leak must not read as a new one); a file may lose leaks but not gain them;
 * a leak that moves to another file is new there; a missing baseline fails;
 * `--write-baseline` and `--list` behave and write only where they are told.
 *
 * KNOWN GAPS of the gate are probed on every run and REPORTED, never counted
 * and never failing: asserting that a gap is present would make the bug a
 * requirement, and failing on it would turn this selftest red until the gate
 * changes (the convention of check-committed-secrets.selftest.mjs and
 * check-rls-allowlist-sync.selftest.mjs). A probe prints CLOSED once the gate
 * gets it right — the signal to promote it to a case above. Each needs a GATE
 * change and is escalated to the gate's owner, not fixed here:
 *   1. stripComments() is not string-aware. A `/*` or `//` INSIDE a string
 *      literal is taken for a comment and blanks real code, so the leak under
 *      it is never seen. Two ordinary shapes: an Express route glob
 *      (`router.use('/files/*', …)`) above a leak opens a "comment" that runs
 *      to the next `*\/` in the file; a URL in the 5xx body's own string
 *      (`'… at https://api.fda.gov …'`) turns the rest of the line, err.message
 *      included, into a "comment". Latent, not historical: on 2026-10-01
 *      server/routes/cortex-unified.ts — a baselined file — has
 *      `legacyPath: '/api/cortex/advisory/*'` at :196, and the gate is blind to
 *      lines 196–234 of it; no 5xx sits there today. Each probe has a CONTROL
 *      case above (the same file without the marker), asserted, so the probe
 *      measures the marker and nothing else. The fix: skip string and template
 *      literals in stripComments() with the quote tracking
 *      responseStatementEnd() already has; it must keep comment prose with an
 *      apostrophe in it quiet (the COMMENT_PROSE case below pins that).
 *   2. The alias lookback has no notion of scope. A handler's logger-only
 *      alias (`const message = err.message` → `log.error(…, { message })`)
 *      makes a LATER handler's own static `const message = '…'`, sent as
 *      `{ message }` within ALIAS_LOOKBACK characters, read as a leak — a false
 *      positive on correct code, which the gate's own comments name as how a
 *      baseline gets widened. Beyond ALIAS_LOOKBACK the gate is quiet (a case
 *      below pins that bound); within it, it is not.
 *
 * Hygiene: every gate run has a timeout (a statement walker that never ends
 * fails the run instead of hanging CI), and the temp directory is removed on
 * every exit path, including a throw while the cases are being built.
 *
 * Usage:
 *   node scripts/ci/check-server-error-leaks.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-server-error-leaks.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:server-error-leaks:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-server-error-leaks.mjs');
const REAL_BASELINE = path.join(repoRoot, 'scripts', 'ci', 'server-error-leaks-baseline.json');

/** One gate run over a fixture tree takes well under a second; this is a hang. */
const GATE_TIMEOUT_MS = 20_000;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'server-error-leaks-selftest-'));
const tree = path.join(tmp, 'tree');
const baselinePath = path.join(tmp, 'baseline.json');

/* The temp tree holds a patched gate and fixtures; it goes on EVERY exit path —
   a normal end, abort(), a throw while the cases are built, an interrupt. */
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

/* ── The patched gate ────────────────────────────────────────────────────── */

const ROOT_DECL = /const repoRoot = [^;]+;/g;
const BASELINE_DECL = /const BASELINE_FILE = [^;]+;/g;

function abort(msg) {
  console.error(`${TAG} FAIL — ${msg}`);
  process.exit(1);
}

const gateSrc = fs.readFileSync(GATE, 'utf8');
/* Both constants must be found exactly once. If either were missed, the copy
   would judge some other tree — or `--write-baseline` would overwrite the real
   baseline — so refuse to run anything rather than run it wrong. */
const rootHits = gateSrc.match(ROOT_DECL)?.length ?? 0;
const baseHits = gateSrc.match(BASELINE_DECL)?.length ?? 0;
if (rootHits !== 1 || baseHits !== 1) {
  abort(
    `cannot patch ${path.relative(repoRoot, GATE)}: expected one \`const repoRoot = …;\` ` +
      `and one \`const BASELINE_FILE = …;\`, found ${rootHits} and ${baseHits}.`,
  );
}
const patched = gateSrc
  .replace(ROOT_DECL, `const repoRoot = ${JSON.stringify(tree)};`)
  .replace(BASELINE_DECL, `const BASELINE_FILE = ${JSON.stringify(baselinePath)};`);
const gatePath = path.join(tmp, 'gate.mjs');
fs.writeFileSync(gatePath, patched);

const sha = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null);
const realBaselineBefore = sha(REAL_BASELINE);

/* ── Harness ─────────────────────────────────────────────────────────────── */

function setTree(files) {
  fs.rmSync(tree, { recursive: true, force: true });
  fs.mkdirSync(path.join(tree, 'server'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tree, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** `counts` → write { counts }; `null` → no baseline file at all. */
function setBaseline(counts) {
  fs.rmSync(baselinePath, { force: true });
  if (counts !== null) fs.writeFileSync(baselinePath, JSON.stringify({ counts }));
}

/**
 * Run the patched gate. `crash` is set when it did not run to an exit code —
 * killed by the timeout or a signal, or not started at all — which is a case
 * failure, never a verdict.
 */
function runGate(args = []) {
  const r = spawnSync(process.execPath, [gatePath, ...args], {
    encoding: 'utf8',
    cwd: tmp,
    timeout: GATE_TIMEOUT_MS,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error?.code === 'ETIMEDOUT' || (r.signal && r.status === null && !r.error)) {
    return { code: null, out, crash: `gate did not finish within ${GATE_TIMEOUT_MS} ms (killed by ${r.signal ?? 'timeout'})` };
  }
  if (r.error) return { code: null, out, crash: `gate did not run: ${r.error.message}` };
  if (r.signal) return { code: null, out, crash: `gate was killed by ${r.signal}` };
  return { code: r.status, out };
}

/** 1-based line of each occurrence of `needle` in `src`. */
function linesOf(src, needle) {
  const out = [];
  let i = src.indexOf(needle);
  while (i !== -1) {
    out.push(src.slice(0, i).split('\n').length);
    i = src.indexOf(needle, i + needle.length);
  }
  if (!out.length) throw new Error(`fixture lacks ${JSON.stringify(needle)}`);
  return out;
}

/** Characters from the first `from` to the first `to` after it (the gate measures the same way). */
function charsBetween(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if (a === -1 || b === -1) throw new Error(`fixture lacks ${JSON.stringify(a === -1 ? from : to)}`);
  return b - a;
}

const HEADLINE = 'A server error response carries the underlying failure text.';
const ok = (sites, files) =>
  `[ci:server-error-leaks] OK — ${sites} baselined site(s) across ${files} file(s); no file gained one.`;
/** Strings a failing run must print: the headline, the count change, each site. */
function leakReport(file, src, was, now, needle, status = '500') {
  return [HEADLINE, `${file} — ${was} → ${now}`, ...linesOf(src, needle).map((l) => `${file}:${l}  [${status}]`)];
}

/* ── Fixtures: the defect shapes ─────────────────────────────────────────── */

/** The incident: serverError() before its fix. The docstring is the irony. */
const INCIDENT_HELPER = `import type { Response } from 'express';

/**
 * Sanitized error envelope. Never leaks internals to the client.
 */
export function serverError(res: Response, log: ScopedLogger, where: string, err: unknown): Response {
  log.error(\`\${where} failed\`, { err });
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'Operation failed',
  });
}
`;

/** The per-route fail() helper, verbatim in shape from server/routes/grants.ts. */
const FAIL_HELPER = `const router = Router();
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
router.get('/awards', async (req, res) => {
  try {
    res.json(await listAwards(req));
  } catch (err) {
    fail(res, err);
  }
});
`;

/** The multi-line chat body, as in server/routes/cortex-unified.ts. */
const CHAT_MULTILINE = `router.post('/chat', async (req, res) => {
  try {
    const result = await orchestrate(req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error(\`[Chat] Error: \${error.message}\`);
    res.status(500).json({
      error: 'Failed to process message',
      code: 'CHAT_ERROR',
      message: error.message,
    });
  }
});
`;

/** A catch named for what it was doing — invisible to the first, literal binding list. */
const NAMED_CATCH = `router.post('/artifacts/:id/promote', async (req, res) => {
  try {
    await promoteArtifact(req.params.id, req.body);
    res.json({ ok: true });
  } catch (promoteErr: any) {
    return res.status(500).json({ error: 'PROMOTE_FAILED', detail: promoteErr.message });
  }
});
`;

/**
 * The same, with the `…Error` suffix — the commoner of the two in server/
 * (aiError ×12, auditError ×8, parseError ×7, dbError ×4 on 2026-10-01).
 */
const NAMED_CATCH_ERROR_SUFFIX = `router.post('/documents/:id/summarize', async (req, res) => {
  try {
    res.json({ summary: await summarizeDocument(req.params.id) });
  } catch (aiError) {
    res.status(500).json({ error: 'AI_SUMMARY_FAILED', message: aiError instanceof Error ? aiError.message : 'Summarization failed.' });
  }
});
`;

/** `ex` — one of the fixed names the `…Err`/`…Error` suffix cannot cover. */
const EX_CATCH = `router.post('/registry/sync', async (req, res) => {
  try {
    res.json(await syncRegistry(req.body));
  } catch (ex) {
    res.status(500).json({ error: 'SYNC_FAILED', message: ex.message });
  }
});
`;

/** A promise chain's rejection handler, named `reason` as Promise.allSettled names it. */
const REASON_PROMISE = `router.get('/dossiers/:id/pdf', (req, res) => {
  renderDossierPdf(req.params.id)
    .then((pdf) => res.type('application/pdf').send(pdf))
    .catch((reason) => res.status(500).json({ error: String(reason) }));
});
`;

/** Drizzle wraps the driver error; its `.cause` is the PostgreSQL one, relation names and all. */
const DRIZZLE_CAUSE = `router.post('/work-items/bulk', async (req, res) => {
  try {
    res.status(201).json(await insertWorkItems(req.body));
  } catch (err) {
    res.status(500).json({ error: 'BULK_INSERT_FAILED', detail: (err as any).cause?.message ?? 'Insert failed.' });
  }
});
`;

const OPTIONAL_CHAIN = `router.get('/documents', async (req, res) => {
  try {
    res.json(await listDocuments(req));
  } catch (error) {
    res.status(500).json({ error: 'LIST_FAILED', message: error?.message ?? 'Failed' });
  }
});
`;

const AS_CAST = `router.get('/register', async (req, res) => {
  try {
    res.json(await listRegister(req));
  } catch (error) {
    res.status(500).json({ error: 'REGISTER_FAILED', message: (error as Error).message });
  }
});
`;

/** String(err) through .send — the same disclosure, another route, another sink. */
const STRING_SEND = `router.get('/agency/status', async (req, res) => {
  try {
    res.json(await pollAgencyGateway(req));
  } catch (upstreamErr) {
    res.status(502).send(String(upstreamErr));
  }
});
`;

/** err.stack behind a NODE_ENV check — the check is a deploy setting, not a control. */
const STACK = `router.post('/export', async (req, res) => {
  try {
    res.json(await buildExport(req));
  } catch (err: any) {
    res.status(500).json({
      error: 'EXPORT_FAILED',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }
});
`;

/** The Postgres driver's own fields: a constraint and its detail line. */
const PG_FIELDS = `router.post('/work-items', async (req, res) => {
  try {
    res.status(201).json(await insertWorkItem(req.body));
  } catch (dbErr: any) {
    res.status(500).json({ error: 'INSERT_FAILED', constraint: dbErr.constraint, detail: dbErr.detail });
  }
});
`;

/** Each driver field alone — one file per field, so dropping any one of them is seen. */
const PG_FIELD_NAMES = ['detail', 'hint', 'constraint', 'table', 'column', 'routine'];
const pgFieldRoute = (field) => `router.post('/register/entries', async (req, res) => {
  try {
    res.status(201).json(await insertEntry(req.body));
  } catch (err: any) {
    res.status(500).json({ error: 'INSERT_FAILED', ${field}: err.${field} });
  }
});
`;

/** The 2026-09-29 correspondence intake: the error text laundered through a local. */
const ALIAS_INTAKE = `router.post('/correspondence/ingest', async (req, res) => {
  try {
    const recorded = await ingestCorrespondence(req.body, req.user);
    res.status(201).json(recorded);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to ingest correspondence', detail: message });
  }
});
`;

/** The same alias sent as an object shorthand, through a cast. */
const ALIAS_SHORTHAND = `router.post('/submissions/:id/validate', async (req, res) => {
  try {
    res.json(await validateSubmission(req.params.id));
  } catch (err) {
    const message: string = (err as Error).message;
    res.status(500).json({ error: 'VALIDATION_RUN_FAILED', message });
  }
});
`;

/** The alias as a `let` — it is reassigned (truncated), which is why it is not a const. */
const ALIAS_LET = `router.post('/submissions/:id/publish', async (req, res) => {
  try {
    res.json(await publishSubmission(req.params.id));
  } catch (err) {
    let msg = err instanceof Error ? err.message : 'Publish failed';
    if (msg.length > 500) msg = msg.slice(0, 500);
    res.status(500).json({ error: 'PUBLISH_FAILED', detail: msg });
  }
});
`;

/** The alias as a `var`, in a callback-style legacy .js route. */
const ALIAS_VAR = `router.post('/legacy/import', function (req, res) {
  importLegacy(req.body, function (err, result) {
    if (err) {
      var detail = err && err.message;
      return res.status(500).json({ error: 'IMPORT_FAILED', detail: detail });
    }
    res.json(result);
  });
});
`;

/**
 * Enumerated remediation steps in the body's message: two `)` and a `;` inside
 * a string literal, then the leak. A statement walker that did not skip string
 * contents would count the string's `)` as closers, reach depth 0, take the
 * string's `;` for the end of the statement, and never see `err.message`.
 */
const SEMI_IN_STRING = `router.post('/packages', async (req, res) => {
  try {
    res.json(await writePackage(req.body));
  } catch (err) {
    res.status(500).json({
      error: 'EXPORT_FAILED',
      message: 'Export failed: 1) the connector refused, 2) nothing was written; retry later.',
      detail: err.message,
    });
  }
});
`;

/**
 * The same steps after an ESCAPED apostrophe. A walker that took `\'` for the
 * closing quote would read the rest of the sentence as code — its `)` and `;`
 * included — and cut the statement before `err.message`.
 */
const SEMI_AFTER_ESCAPED_QUOTE = `router.post('/packages/:id/retry', async (req, res) => {
  try {
    res.json(await retryPackage(req.params.id));
  } catch (err) {
    res.status(500).json({
      error: 'RETRY_FAILED',
      message: 'The connector didn\\'t finish: 1) it refused, 2) nothing was written; retry later.',
      detail: err.message,
    });
  }
});
`;

/** The same steps in double quotes. */
const SEMI_IN_DOUBLE_QUOTES = `router.post("/packages/:id/validate", async (req, res) => {
  try {
    res.json(await validatePackage(req.params.id));
  } catch (err) {
    res.status(500).json({
      error: "VALIDATE_FAILED",
      message: "Validation failed: 1) the schema refused, 2) nothing was recorded; retry later.",
      detail: err.message,
    });
  }
});
`;

/** The same steps in a template literal, with an interpolation. */
const SEMI_IN_TEMPLATE = `router.post('/packages/:id/submit', async (req, res) => {
  try {
    res.json(await submitPackage(req.params.id));
  } catch (err) {
    res.status(500).json({
      error: 'SUBMIT_FAILED',
      message: \`Submission of \${req.params.id} failed: 1) the gateway refused, 2) nothing was sent; retry later.\`,
      detail: err.message,
    });
  }
});
`;

/** A route handler factory, in each extension the gate scans besides .ts. */
const HANDLER_FACTORY = `export function exportHandler(formatter) {
  return async (req, res) => {
    try {
      res.send(await formatter(req.body));
    } catch (err) {
      res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
    }
  };
}
`;

/* ── Fixtures: the alias lookback, either side of its bound ──────────────── */

/**
 * The gate's ALIAS_LOOKBACK, mirrored on purpose: the two cases built here sit
 * just inside and just outside it. A deliberate change to the bound changes it
 * here too; an accidental one (unbounded, or narrowed) fails a case.
 */
const ALIAS_LOOKBACK = 1500;
const LOOKBACK_MARGIN = { min: 40, max: 160 };

/** Handler A: the error text is aliased, but only the logger reads it. */
const LOGGER_ONLY_ALIAS_DECL = 'const message = err instanceof Error ? err.message : String(err);';
const LOGGER_ONLY_HANDLER = `router.get('/register', async (req, res) => {
  try {
    res.json(await listRegister(req));
  } catch (err) {
    ${LOGGER_ONLY_ALIAS_DECL}
    log.error('register list failed', { message });
    return res.status(500).json({ error: 'LIST_FAILED', message: 'The register could not be listed.' });
  }
});
`;

/** Handler B: a correct 503 that declares its OWN static `message` and sends it. */
const STATIC_MESSAGE_HANDLER = `router.post('/register/rebuild', async (req, res) => {
  if (await isRebuilding()) {
    const message = 'The register is being rebuilt. Try again in a few minutes.';
    return res.status(503).json({ error: 'REBUILDING', message });
  }
  res.status(202).json(await startRebuild(req));
});
`;

const SECTIONS = [
  'owners', 'history', 'holds', 'retention', 'signatures', 'versions', 'exports', 'reviews',
  'links', 'tags', 'sources', 'notes', 'attachments', 'approvals', 'comments', 'watchers',
  'deviations', 'capas', 'changes', 'training', 'suppliers', 'risks', 'audits', 'controls',
  'reports', 'schedules', 'archives', 'templates', 'labels', 'events',
];

/** A then B, with a route table between them sized to put A's alias just OUTSIDE the lookback. */
function aliasBeyondLookback() {
  const lines = [];
  let src = `${LOGGER_ONLY_HANDLER}\n${STATIC_MESSAGE_HANDLER}`;
  for (const s of SECTIONS) {
    if (charsBetween(src, LOGGER_ONLY_ALIAS_DECL, '.status(503)') >= ALIAS_LOOKBACK + LOOKBACK_MARGIN.min) break;
    lines.push(`router.get('/register/${s}', listSection('${s}'));`);
    src = `${LOGGER_ONLY_HANDLER}\n${lines.join('\n')}\n\n${STATIC_MESSAGE_HANDLER}`;
  }
  const d = charsBetween(src, LOGGER_ONLY_ALIAS_DECL, '.status(503)');
  if (d < ALIAS_LOOKBACK + LOOKBACK_MARGIN.min || d > ALIAS_LOOKBACK + LOOKBACK_MARGIN.max) {
    throw new Error(`alias-beyond-lookback fixture is ${d} characters, not just past ${ALIAS_LOOKBACK}`);
  }
  return { src, d };
}

/**
 * The 2026-09-29 intake with the compensations its commit says it lacks: the
 * alias is declared at the top of the catch, the undo steps follow, and the
 * 500 comes last — sized to sit just INSIDE the lookback.
 */
const LONG_CATCH_ALIAS_DECL = "const message = e instanceof Error ? e.message : 'Unknown error';";
const WRITTEN_KINDS = [
  'letter', 'issue', 'work-item', 'attachment', 'notification', 'task', 'link', 'audit-entry',
  'commitment', 'reminder', 'owner', 'deadline', 'thread', 'summary', 'citation', 'extract',
];
function aliasInsideLookback() {
  const build = (steps) => `router.post('/correspondence/intake', async (req, res) => {
  const written = new Map();
  try {
    await recordLetter(req.body, req.user, written);
    res.status(201).json({ recorded: [...written.keys()] });
  } catch (e) {
    ${LONG_CATCH_ALIAS_DECL}
${steps.join('\n')}
    return res.status(500).json({ error: 'Failed to ingest correspondence', detail: message });
  }
});
`;
  const steps = [];
  for (const k of WRITTEN_KINDS) {
    const next = [...steps, `    if (written.has('${k}')) await undoWrite('${k}', written.get('${k}')).catch(() => log.warn('undo skipped', { kind: '${k}' }));`];
    if (charsBetween(build(next), LONG_CATCH_ALIAS_DECL, '.status(500)') > ALIAS_LOOKBACK - LOOKBACK_MARGIN.min) break;
    steps.push(next[next.length - 1]);
  }
  const src = build(steps);
  const d = charsBetween(src, LONG_CATCH_ALIAS_DECL, '.status(500)');
  if (d > ALIAS_LOOKBACK - LOOKBACK_MARGIN.min || d < ALIAS_LOOKBACK - LOOKBACK_MARGIN.max) {
    throw new Error(`alias-inside-lookback fixture is ${d} characters, not just inside ${ALIAS_LOOKBACK}`);
  }
  return { src, d };
}

const BEYOND = aliasBeyondLookback();
const INSIDE = aliasInsideLookback();

/* ── Fixtures: the near-misses ───────────────────────────────────────────── */

/** The canonical helper as it is now: the detail is bound to a local and LOGGED. */
const CANONICAL_HELPER = `import type { Response } from 'express';

export function serverError(res: Response, log: ScopedLogger, where: string, err: unknown): Response {
  const detail = err instanceof Error ? err.message : 'Operation failed';
  const header = res.getHeader('X-Request-Id');
  const correlationId = typeof header === 'string' && header ? header : null;
  log.error(\`\${where} failed\`, { err: detail, correlationId });
  const envelope = {
    error: 'INTERNAL_ERROR',
    message: \`Something went wrong while \${where}. The problem has been logged.\`,
    ...(correlationId ? { correlationId } : {}),
  };
  return res.status(500).json(envelope);
}
`;

const CANONICAL_ROUTE = `router.get('/register', async (req, res) => {
  try {
    res.json(await listRegister(req));
  } catch (err) {
    return serverError(res, log, 'listing the register', err);
  }
});
`;

/**
 * A correct fail-closed handler: a static 503, then a logger reading
 * err.message on the very next lines — no blank line between. The first
 * statement-cut (first blank line) attributed the logger's text to the body.
 */
const LOGGER_AFTER_RESPONSE = `router.get('/register', async (req, res) => {
  try {
    res.json(await listRegister(req));
  } catch (err) {
    if (isRelationMissing(err)) {
      return res.status(503).json({ error: { code: 'STORE_PENDING', message: 'The register is not provisioned yet.' } });
    }
    console.error('[register] list failed', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The register could not be listed.' } });
  }
});
`;

/**
 * A 503 that sends NO body, the logger after it. In a no-semicolon file there
 * is no `;` to end the statement, so the logger's err.message is inside the
 * walked window — the `.json(`/`.send(` filter is what keeps it from being
 * read as a response body.
 */
const NO_BODY_NO_SEMICOLONS = `const router = require('express').Router()

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('select 1')
    res.status(204).end()
  } catch (err) {
    res.status(503).set('Retry-After', '30').end()
    console.error('[health] database unreachable:', err.message)
  }
})

module.exports = router
`;

/** The same: an empty 500, logged once it is flushed — `res.end(callback)`. */
const NO_BODY_END_CALLBACK = `router.post('/exports/:id/cancel', async (req, res) => {
  try {
    res.json(await cancelExport(req.params.id));
  } catch (err) {
    res.status(500).end(() => log.error('cancel failed', { exportId: req.params.id, reason: err.message }));
  }
});
`;

/** The alias exists, but only the logger reads it; the body uses `message` as a KEY. */
const ALIAS_TO_LOGGER = `router.post('/correspondence/ingest', async (req, res) => {
  try {
    res.status(201).json(await ingestCorrespondence(req.body, req.user));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('ingest failed', { message });
    return res.status(500).json({ error: 'INGEST_FAILED', message: 'The correspondence could not be recorded.' });
  }
});
`;

/** The alias exists, but the body reads `message` only as a PROPERTY of something else. */
const ALIAS_AS_PROPERTY = `router.post('/exports/:id/retry', async (req, res) => {
  const notice = await getMaintenanceNotice();
  try {
    res.json(await retryExport(req.params.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('export retry failed', { exportId: req.params.id, message });
    return res.status(503).json({ error: 'EXPORTS_PAUSED', notice: notice.message, retryAfter: notice.retryAfter });
  }
});
`;

/** 4xx bodies echoing a validation message are intended behaviour. */
const FOUR_XX = `router.post('/programs', async (req, res) => {
  try {
    res.status(201).json(await createProgram(req.body));
  } catch (err: any) {
    if (err instanceof ZodError) return res.status(400).json({ error: 'BAD_INPUT', message: err.message });
    if (err.code === 'CONFLICT') return res.status(409).json({ error: 'CONFLICT', detail: err.detail });
    return serverError(res, log, 'creating the program', err);
  }
});
`;

/**
 * A 5xx reading .message off things that are not the caught error: a job
 * record the user is meant to read, and an identifier that merely ENDS in "e"
 * (a sloppy /e\.message/ would take \`notice.message\` for \`e.message\`).
 */
const NON_ERROR_MESSAGE = `router.get('/exports/:id', async (req, res) => {
  const job = await getExportJob(req.params.id);
  const notice = await getMaintenanceNotice();
  if (job.state === 'failed') {
    return res.status(500).json({ error: 'EXPORT_FAILED', message: job.message, notice: notice.message, jobId: job.id });
  }
  res.json(job);
});
`;

/** pendingStore() builds its object in a function that logs the relation. */
const PENDING_STORE = `router.post('/projects', async (req, res) => {
  try {
    res.status(201).json(await createProject(req.body));
  } catch (err) {
    const pending = await pendingStore(err, 'creating the project', req);
    if (pending) return res.status(503).json(pending);
    return serverError(res, log, 'creating the project', err);
  }
});
`;

/**
 * Prose about this very rule, in both comment styles — with apostrophes in it,
 * so a string-aware comment stripper (KNOWN GAPS, 1) that let a comment's `'`
 * open a string would turn the prose back into code and fail here.
 */
const COMMENT_PROSE = `/**
 * Do not write  res.status(500).json({ error: err.message })  — it ships the
 * driver's text to the browser. Use serverError() instead.
 */
// e.g. res.status(500).json({ detail: (error as Error).message, stack: err.stack });
// Don't answer res.status(502).send(String(upstreamErr)) either — it's the same leak.
export const RULE = 'serverError only';
`;

const LEAK_LINE = `res.status(500).json({ error: err.message });\n`;

/* ── Fixtures: KNOWN GAPS (header) and their controls ───────────────────── */

/** KNOWN GAPS 1: a route glob's `/*` opens a "comment" that runs to the doc comment's `*\/`. */
const routeGlob = (mountPath) => `import { Router } from 'express';

const router = Router();
router.use('${mountPath}', requireAuth);

router.get('/files/:id', async (req, res) => {
  try {
    res.json(await readStoredFile(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'FILE_READ_FAILED', detail: err.message });
  }
});

/** Store an uploaded file in the vault. */
router.post('/files', async (req, res) => {
  try {
    res.status(201).json(await storeFile(req.body));
  } catch (err) {
    return serverError(res, log, 'storing the file', err);
  }
});
`;

/** KNOWN GAPS 1: a URL in the body's own string turns the rest of the line into a "comment". */
const gatewayStatus = (sentence) => `router.get('/agency/fda/status', async (req, res) => {
  try {
    res.json(await pollFdaGateway());
  } catch (err) {
    res.status(502).json({ error: '${sentence}', detail: err.message });
  }
});
`;

/* ── Cases ───────────────────────────────────────────────────────────────── */

const fail1 = (name, file, src, needle, status) => ({
  name,
  files: { [file]: src },
  expectExit: 1,
  expectIn: leakReport(file, src, 0, 1, needle, status),
});

/** Several files, one leak each: every one must be named. */
const failEach = (name, files, needle = '.status(500)', status = '500') => ({
  name,
  files,
  expectExit: 1,
  expectIn: Object.entries(files).flatMap(([file, src]) => leakReport(file, src, 0, 1, needle, status)),
});

const quiet = (name, files, extraNotIn = []) => ({
  name,
  files,
  expectExit: 0,
  expectIn: [ok(0, 0)],
  expectNotIn: [HEADLINE, ...extraNotIn],
});

/* A baselined file, then the same file with 40 lines added above its leak. */
const BASELINED = FAIL_HELPER;
const SHIFTED = `${'// an unrelated edit above the leak\nconst unrelated = 1;\n'.repeat(20)}${FAIL_HELPER}`;
const GAINED = `${FAIL_HELPER}router.get('/awards/:id', async (req, res) => {
  try {
    res.json(await getAward(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'AWARD_FAILED', message: String(err) });
  }
});
`;

const ROUTE_GLOB_CONTROL = routeGlob('/files');
const ROUTE_GLOB = routeGlob('/files/*');
const GATEWAY_CONTROL = gatewayStatus('The FDA gateway did not answer.');
const GATEWAY_URL = gatewayStatus('The FDA gateway at https://api.fda.gov did not answer.');

const cases = [
  /* — fails: the defect shapes — */
  fail1(
    'FAILS on the incident — the pre-fix serverError() copying err.message into a "sanitized" body',
    'server/lib/api-response.ts', INCIDENT_HELPER, '.status(500)',
  ),
  {
    // Only the 500 counts: the dynamic-status 4xx line reads err.message too.
    ...fail1(
      'FAILS on the copy-pasted per-route fail() helper — and counts its 500 only, not its 4xx line',
      'server/routes/grants.ts', FAIL_HELPER, '.status(500)',
    ),
    expectNotIn: [`server/routes/grants.ts:${linesOf(FAIL_HELPER, '.status(CODE_STATUS')[0]}`],
  },
  fail1('FAILS on the multi-line chat body (error.message on its own line)',
    'server/routes/cortex-unified.ts', CHAT_MULTILINE, '.status(500)'),
  fail1('FAILS on a catch named for what it does (promoteErr.message)',
    'server/routes/artifacts.ts', NAMED_CATCH, '.status(500)'),
  fail1('FAILS on a catch named with the …Error suffix (aiError.message) — the commoner spelling in server/',
    'server/routes/document-summaries.ts', NAMED_CATCH_ERROR_SUFFIX, '.status(500)'),
  fail1('FAILS on catch (ex) — a fixed name the …Err/…Error suffix cannot cover',
    'server/routes/registry-sync.ts', EX_CATCH, '.status(500)'),
  fail1('FAILS on a promise chain\'s .catch((reason) => …) sending String(reason)',
    'server/routes/dossier-pdf.ts', REASON_PROMISE, '.status(500)'),
  fail1("FAILS on Drizzle's wrapped driver error — (err as any).cause?.message",
    'server/routes/work-items-bulk.ts', DRIZZLE_CAUSE, '.status(500)'),
  fail1('FAILS on optional chaining (error?.message)',
    'server/routes/documents.ts', OPTIONAL_CHAIN, '.status(500)'),
  fail1('FAILS on an `as` cast ((error as Error).message)',
    'server/routes/register.ts', AS_CAST, '.status(500)'),
  fail1('FAILS on String(upstreamErr) sent with .send() from a 502',
    'server/routes/agency.ts', STRING_SEND, '.status(502)', '502'),
  fail1('FAILS on err.stack behind a NODE_ENV check',
    'server/routes/export.ts', STACK, '.status(500)'),
  fail1("FAILS on the Postgres driver's own fields (dbErr.constraint / dbErr.detail)",
    'server/routes/work-items.ts', PG_FIELDS, '.status(500)'),
  failEach(
    `FAILS on each Postgres driver field on its own (${PG_FIELD_NAMES.join(', ')}) — one file each`,
    Object.fromEntries(PG_FIELD_NAMES.map((f) => [`server/routes/pg-${f}.ts`, pgFieldRoute(f)])),
  ),
  fail1('FAILS on the 2026-09-29 alias — const message = e.message, then detail: message',
    'server/routes/correspondence.ts', ALIAS_INTAKE, '.status(500)'),
  fail1('FAILS on the alias sent as an object shorthand ({ …, message })',
    'server/services/submissions/validate-route.ts', ALIAS_SHORTHAND, '.status(500)'),
  failEach('FAILS on the alias declared with let (truncated, then sent) and with var (legacy .js)', {
    'server/routes/submission-publish.ts': ALIAS_LET,
    'server/legacy/import.js': ALIAS_VAR,
  }),
  fail1(
    `FAILS on an alias ${INSIDE.d} characters above its 500 — a long compensating catch is still inside ALIAS_LOOKBACK (${ALIAS_LOOKBACK})`,
    'server/routes/correspondence-intake.ts', INSIDE.src, '.status(500)',
  ),
  fail1("FAILS when a string's own ')' and ';' precede the leak (enumerated steps in the message)",
    'server/routes/packages.ts', SEMI_IN_STRING, '.status(500)'),
  fail1("FAILS when those ')' and ';' follow an escaped apostrophe (didn\\'t) in the string",
    'server/routes/package-retry.ts', SEMI_AFTER_ESCAPED_QUOTE, '.status(500)'),
  failEach("FAILS when those ')' and ';' sit in a double-quoted string, and in a template literal", {
    'server/routes/package-validate.ts': SEMI_IN_DOUBLE_QUOTES,
    'server/routes/package-submit.ts': SEMI_IN_TEMPLATE,
  }),
  failEach('FAILS on a leak in every extension the gate scans besides .ts (.js, .mjs, .mts)', {
    'server/legacy/export-handler.js': HANDLER_FACTORY,
    'server/common/exportFormats.mjs': HANDLER_FACTORY,
    'server/validation/export-handler.mts': HANDLER_FACTORY,
  }),
  fail1('FAILS on the route-glob file with no glob (control for KNOWN GAPS 1 — the probe differs by `/*` only)',
    'server/routes/files.ts', ROUTE_GLOB_CONTROL, '.status(500)'),
  fail1('FAILS on the gateway 502 with no URL in its sentence (control for KNOWN GAPS 1 — the probe differs by the URL only)',
    'server/routes/fda-gateway.ts', GATEWAY_CONTROL, '.status(502)', '502'),

  /* — quiet: the near-misses — */
  quiet('quiet — the canonical serverError() and its current body (detail goes to the logger only)', {
    'server/lib/api-response.ts': CANONICAL_HELPER,
    'server/routes/register.ts': CANONICAL_ROUTE,
  }),
  quiet('quiet — a static 503, then a logger reading err.message with no blank line between', {
    'server/routes/register.ts': LOGGER_AFTER_RESPONSE,
  }),
  quiet('quiet — a 5xx that sends no body, the logger after it (no-semicolon style; res.end(callback))', {
    'server/legacy/health.js': NO_BODY_NO_SEMICOLONS,
    'server/routes/export-cancel.ts': NO_BODY_END_CALLBACK,
  }),
  quiet('quiet — an error-text alias that only the logger reads; the body uses `message` as a key', {
    'server/routes/correspondence.ts': ALIAS_TO_LOGGER,
  }),
  quiet('quiet — an error-text alias that only the logger reads; the body reads notice.message (a property)', {
    'server/routes/export-retry.ts': ALIAS_AS_PROPERTY,
  }),
  quiet(
    `quiet — a logger-only alias ${BEYOND.d} characters above another handler's static \`message\` (outside ALIAS_LOOKBACK, ${ALIAS_LOOKBACK})`,
    { 'server/routes/register-admin.ts': BEYOND.src },
  ),
  quiet('quiet — 400/409 bodies echoing the error (a different question entirely)', {
    'server/routes/programs.ts': FOUR_XX,
  }),
  quiet('quiet — a 5xx reading .message off a job record, and off an identifier ending in "e"', {
    'server/routes/exports.ts': NON_ERROR_MESSAGE,
  }),
  quiet('quiet — pendingStore() answering a 503 with the object it built', {
    'server/routes/c2c/projects.ts': PENDING_STORE,
  }),
  quiet('quiet — prose about the rule inside comments (apostrophes included)', {
    'server/routes/README-rule.ts': COMMENT_PROSE,
  }),
  quiet('quiet — tests, specs, mocks, build output, dependencies, .d.ts and code outside server/ are out of scope', {
    'server/routes/__tests__/leak.ts': LEAK_LINE,
    'server/routes/leak.test.ts': LEAK_LINE,
    'server/routes/leak.spec.ts': LEAK_LINE,
    'server/routes/leak.test.js': LEAK_LINE,
    'server/__mocks__/db.ts': LEAK_LINE,
    'server/dist/routes/leak.js': LEAK_LINE,
    'server/build/routes/leak.js': LEAK_LINE,
    'server/node_modules/some-pkg/index.js': LEAK_LINE,
    'server/types/express-ext.d.ts': LEAK_LINE,
    'client/src/leak.ts': LEAK_LINE,
    'scripts/leak.mjs': LEAK_LINE,
  }),

  /* — baseline semantics — */
  {
    name: 'quiet — a baselined leak stays tolerated',
    files: { 'server/routes/grants.ts': BASELINED },
    baseline: { 'server/routes/grants.ts': 1 },
    expectExit: 0,
    expectIn: [ok(1, 1)],
    expectNotIn: [HEADLINE],
  },
  {
    name: 'quiet — an edit ABOVE a baselined leak shifts its line but not its identity (per-file count)',
    files: { 'server/routes/grants.ts': SHIFTED },
    baseline: { 'server/routes/grants.ts': 1 },
    expectExit: 0,
    expectIn: [ok(1, 1)],
    expectNotIn: [HEADLINE],
  },
  {
    name: 'FAILS when a baselined file GAINS a leak (1 → 2), naming both sites',
    files: { 'server/routes/grants.ts': GAINED },
    baseline: { 'server/routes/grants.ts': 1 },
    expectExit: 1,
    expectIn: leakReport('server/routes/grants.ts', GAINED, 1, 2, '.status(500)'),
  },
  {
    name: 'FAILS when a leak moves to another file — a fix elsewhere does not pay for it',
    files: {
      'server/routes/grants.ts': CANONICAL_ROUTE,
      'server/routes/irb.ts': FAIL_HELPER,
    },
    baseline: { 'server/routes/grants.ts': 1 },
    expectExit: 1,
    expectIn: leakReport('server/routes/irb.ts', FAIL_HELPER, 0, 1, '.status(500)'),
    expectNotIn: ['server/routes/grants.ts —'],
  },
  {
    name: 'quiet, and says so — a baseline larger than the tree reports the fixed sites',
    files: { 'server/routes/grants.ts': BASELINED },
    baseline: { 'server/routes/grants.ts': 2, 'server/routes/irb.ts': 1 },
    expectExit: 0,
    expectIn: [ok(1, 1), '2 site(s) fixed since the baseline — shrink it with --write-baseline.'],
    expectNotIn: [HEADLINE],
  },
  {
    name: 'FAILS when the baseline is missing',
    files: { 'server/routes/register.ts': CANONICAL_ROUTE },
    baseline: null,
    expectExit: 1,
    expectIn: ['FAIL — baseline missing'],
  },
  {
    name: '--list prints every site, baselined or not, and exits 0',
    files: { 'server/routes/grants.ts': FAIL_HELPER, 'server/routes/correspondence.ts': ALIAS_INTAKE },
    baseline: null,
    args: ['--list'],
    expectExit: 0,
    expectIn: [
      `server/routes/grants.ts:${linesOf(FAIL_HELPER, '.status(500)')[0]}  [500]`,
      `server/routes/correspondence.ts:${linesOf(ALIAS_INTAKE, '.status(500)')[0]}  [500]`,
      '2 server-error leak site(s).',
    ],
  },
  {
    name: '--write-baseline writes per-file counts to the baseline it was given, which then passes',
    files: {
      'server/routes/grants.ts': GAINED,
      'server/routes/correspondence.ts': ALIAS_INTAKE,
      'server/routes/register.ts': LOGGER_AFTER_RESPONSE,
    },
    baseline: null,
    args: ['--write-baseline'],
    expectExit: 0,
    expectIn: ['baseline written — 3 site(s) across 2 file(s).'],
    after() {
      const problems = [];
      let doc = null;
      try {
        doc = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;
      } catch (err) {
        return [`the written baseline is not JSON: ${err.message}`];
      }
      const want = { 'server/routes/correspondence.ts': 1, 'server/routes/grants.ts': 2 };
      if (!doc) problems.push('no baseline was written at the patched path');
      else if (JSON.stringify(doc.counts) !== JSON.stringify(want))
        problems.push(`counts were ${JSON.stringify(doc.counts)}, expected ${JSON.stringify(want)}`);
      const again = runGate();
      if (again.crash) problems.push(`re-run against the written baseline: ${again.crash}`);
      else if (again.code !== 0 || !again.out.includes(ok(3, 2)))
        problems.push(`re-run against the written baseline: exit ${again.code}\n${again.out}`);
      return problems;
    },
  },
];

/*
 * KNOWN GAPS (header): probed and reported, never counted. `caught` is what the
 * gate prints once the gap is closed — the same expectation a case above would
 * assert. A probe never sets the exit code.
 */
const knownGaps = [
  {
    ...fail1('', 'server/routes/files.ts', ROUTE_GLOB, '.status(500)'),
    name: "a route glob's '/*' in a string above a leak (KNOWN GAPS 1)",
    note: "router.use('/files/*', …) opens a \"comment\" that runs to the next */ — the doc comment below the leak",
  },
  {
    ...fail1('', 'server/routes/fda-gateway.ts', GATEWAY_URL, '.status(502)', '502'),
    name: 'a URL inside the 5xx body\'s own string (KNOWN GAPS 1)',
    note: "'… at https://api.fda.gov …' makes the rest of the line, err.message included, a \"// comment\"",
  },
  {
    ...quiet('', { 'server/routes/register-admin.ts': `${LOGGER_ONLY_HANDLER}\n${STATIC_MESSAGE_HANDLER}` }),
    name: "a later handler's own static `message`, within ALIAS_LOOKBACK of a logger-only alias (KNOWN GAPS 2)",
    note: 'a false positive: the gate has no scope, so handler A\'s alias names handler B\'s static local',
  },
];

/* ── Run ─────────────────────────────────────────────────────────────────── */

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

/** The ways a run differs from what `c` expects; empty when it holds. */
function check(c, run) {
  if (run.crash) return [run.crash];
  const problems = [];
  if (run.code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${run.code}`);
  for (const s of c.expectIn ?? []) if (!run.out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
  for (const s of c.expectNotIn ?? []) if (run.out.includes(s)) problems.push(`output should not contain: ${JSON.stringify(s)}`);
  return problems;
}

const show = (out) => console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));

let failed = 0;
let ran = 0;
for (const c of cases) {
  setTree(c.files);
  setBaseline(c.baseline === undefined ? {} : c.baseline);
  const run = runGate(c.args ?? []);
  ran++;
  const problems = check(c, run);
  if (!problems.length && c.after) problems.push(...c.after());
  console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
  if (problems.length) {
    failed++;
    for (const p of problems) console.log(`      ${p}`);
    show(run.out);
  }
  /* A gate that hangs on one fixture is broken; running the rest would only
     multiply the wait by the timeout. */
  if (run.crash) {
    const rest = cases.length - ran;
    if (rest) console.log(`      the remaining ${rest} case(s) were not run.`);
    failed += rest;
    break;
  }
}

let open = 0;
if (!failed) {
  console.log('\n  Known gaps of the gate — probed and reported, not counted (see this file\'s header):');
  for (const g of knownGaps) {
    setTree(g.files);
    setBaseline({});
    const run = runGate();
    const problems = check(g, run);
    if (!problems.length) {
      console.log(`  ✓ CLOSED  ${g.name}: the gate now gets it right. Promote this probe to a case.`);
    } else if (!run.crash && (g.expectExit === 1 ? run.code === 0 && run.out.includes(ok(0, 0)) : run.code === 1 && run.out.includes(HEADLINE))) {
      open++;
      console.log(`  ! OPEN    ${g.name}`);
      console.log(`            ${g.note}`);
    } else {
      console.log(`  ? UNCLEAR ${g.name}: neither the gap nor its fix.`);
      for (const p of problems) console.log(`      ${p}`);
      show(run.out);
    }
  }
}

/* The real baseline must be exactly as it was: every write went to the temp tree. */
if (sha(REAL_BASELINE) !== realBaselineBefore) {
  console.error(`\n${TAG} FAIL — ${path.relative(repoRoot, REAL_BASELINE)} changed during the selftest.`);
  process.exit(1);
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  process.exit(1);
}
if (open) {
  console.log(
    `\n${TAG} ${open} known gap(s) open and escalated to the gate's owner (! OPEN above): ` +
      'the claim below covers the cases above, not those probes.',
  );
}
console.log(`${open ? '' : '\n'}${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
