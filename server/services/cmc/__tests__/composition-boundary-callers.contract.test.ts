/**
 * Every caller of a CMC engine that states small-molecule content for a
 * program asks the composition boundary (decision P-28: small-molecule Module
 * 3 for a US IND; services/cmc/composition-scope.ts).
 *
 * Compose was the only caller of the boundary until 2026-10-22. The QbD
 * analysis, the ICH compliance verdict, the control strategy, the ICH Q1E
 * shelf life and batch poolability were each reached from routes, AnA
 * commands and AnA tools that never asked it, so a monoclonal antibody was
 * given Q3A(R2) impurity bases, Q6A release defaults and a Q1E-extrapolated
 * shelf life; AnA's CMC specification interview judged its answers by Q3A(R2)
 * and M7 (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/).
 *
 * This is the static half: a file that calls one of these engines also names
 * the boundary decision. It is per file, so it cannot tell which handler in a
 * file asked; the behaviour per entry point is pinned by
 * api/cmc/__tests__/composition-boundary-routes.test.ts,
 * ana-ri/__tests__/quality-engine-commands-composition-boundary.test.ts and
 * ana/__tests__/cmc-tools-composition-boundary.test.ts, and
 * the decision itself on a real engine by composition-boundary-readers.pglite.test.ts.
 *
 * A caller that does not ask is listed below WITH ITS REASON, and the list is
 * held honest both ways: an entry whose file now asks, or no longer calls an
 * engine, fails until it is removed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildPrefixMap, NEVER_GATED } from '../../entitlements/api-prefix-map';
import { launchScopeApiVerdict } from '../../entitlements/launch-scope-api';

const ROOT = join(__dirname, '../../../..');

/** The engines and the Module 3 composers, and the files that define them (which call each other). */
const ENGINES = [
  'analyzeQbdFromSources',
  'runIchComplianceCheck',
  'generateControlStrategy',
  'estimateRecordedShelfLife',
  'assessRecordedPoolability',
  // The composers. composeProjectModule3 asks the boundary itself, so its
  // callers are not listed; these do not.
  'composeFullModule3',
  'composeModule3FromCanonicalSources',
  'buildModule3WithNarrative',
  'composeRegional',
  'composeAppendices',
  // The interview engine: the CMC specification flow judges each answer by
  // small-molecule rules (ICH Q3A(R2), M7, Q1A(R2)), and resume re-presents
  // that judgement.
  'advanceFlow',
  'resumeFlow',
];
const ENGINE_FILES = new Set([
  'server/services/cmc/qbd-analyzer.ts',
  'server/services/cmc/ich-compliance-checker.ts',
  'server/services/cmc/control-strategy-generator.ts',
  'server/services/cmc/recorded-stability.ts',
  'server/services/module3Composer.ts',
  'server/services/module3-extensions.ts',
  'server/services/cmc/module3-narrative-builder.ts',
  // Defines the boundary decision and asks it before it composes.
  'server/services/cmc/module3-compile.ts',
  'server/services/ana/intelligence-questions/engine.ts',
]);

/**
 * The boundary decision, by the names a handler reaches it through: the
 * decision itself (services/cmc/module3-compile.ts), its study and interview
 * forms (study-composition-scope.ts, interview-composition-scope.ts), and the
 * route and command helpers that ask it (api/cmc/routes.ts,
 * ana-ri/quality-engine-command-handlers.ts).
 */
const BOUNDARY = [
  'assessProgramCompositionScope',
  'programCompositionRefusal',
  'admitProgramComposition',
  'refusedAtCompositionBoundary',
  'studiesRefusedAtCompositionBoundary',
  'studiesCompositionRefusal',
  'interviewCompositionRefusalResult',
];

/**
 * Callers that ask through another file, each with where. The orchestrator's
 * Module 3 comes only from the governed loader, which judges the program; the
 * orchestrator judges the target it composes for. Judged per file, because the
 * orchestrator's steps are closures inside one function.
 */
const ASKED_THROUGH: Record<string, { reason: string; here: string; there: [file: string, marker: string] }> = {
  'server/services/submission-package-orchestrator.ts': {
    reason:
      'Its cmcSources come only from loadApprovedCmcSourcesForProject, which asks the program boundary once the ' +
      'export gate opens; m3.compose asks applicationRefusal of the package target before composing.',
    here: 'applicationRefusal(',
    there: ['server/services/cmc/load-approved-cmc-sources-for-project.ts', 'assessProgramCompositionScope('],
  },
};

/**
 * Handlers that do not ask yet, each named by the line that opens it, with
 * why. An entry either expires (`until`: after it the test fails, so the work
 * cannot quietly slip) or carries a check of its own reason (`unreachable`: a
 * path the launch-scope gate refuses in production).
 */
const NOT_YET: Array<{ file: string; handler: string; reason: string; until?: string; unreachable?: string }> = [
  {
    file: 'server/routes/orchestration.ts',
    handler: "router.post('/pre-submission-gate'",
    reason:
      'Runs the ICH check for a linked CMC project. /api/orchestration is outside the launch catalog, so the ' +
      'launch-scope gate refuses it in production and it reaches no launch tenant.',
    unreachable: '/api/orchestration/pre-submission-gate',
  },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** The code lines of a text: a mention in a comment is not a call. */
const code = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

/** A call of `name`, not its definition or an import. */
const calls = (text: string, name: string) => new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`).test(code(text));

/**
 * A file cut into handlers: a route, a tool registration, or a top-level
 * function. A boundary asked by one handler does not cover its neighbour,
 * which is what a per-file check let through.
 */
const HANDLER_START = /^(?:router\.(?:get|post|put|patch|delete)\(|registerToolHandler\(|register\(|(?:export\s+)?(?:async\s+)?function\s)/;
function handlers(text: string): Array<{ opens: string; body: string }> {
  const lines = text.split('\n');
  const out: Array<{ opens: string; body: string[] }> = [];
  for (const line of lines) {
    if (HANDLER_START.test(line) || out.length === 0) out.push({ opens: line, body: [line] });
    else out[out.length - 1].body.push(line);
  }
  return out.map((h) => ({ opens: h.opens, body: h.body.join('\n') }));
}

const unguarded = sourceFiles(join(ROOT, 'server'))
  .map((path) => ({ file: relative(ROOT, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))
  .filter(({ file }) => !ENGINE_FILES.has(file))
  .flatMap(({ file, text }) =>
    handlers(text).map((h) => ({
      file,
      opens: h.opens.trim(),
      engines: ENGINES.filter((e) => calls(h.body, e)),
      asks: BOUNDARY.some((b) => calls(h.body, b)),
    })),
  )
  .filter((h) => h.engines.length > 0);

const callerFiles = new Set(unguarded.map((h) => h.file));
const listed = (h: { file: string; opens: string }) =>
  NOT_YET.find((n) => n.file === h.file && h.opens.startsWith(n.handler));

describe('callers of the CMC engines ask the composition boundary', () => {
  it('finds the callers it exists to watch', () => {
    // A scan that finds nothing passes everything.
    expect([...callerFiles]).toEqual(
      expect.arrayContaining([
        'server/api/cmc/routes.ts',
        'server/services/ana-ri/quality-engine-command-handlers.ts',
        'server/services/module3-convergence-service.ts',
        'server/services/ana/AnaToolExecutor.ts',
      ]),
    );
    // Each route of the five is its own handler, so each is judged on its own.
    expect(unguarded.filter((h) => h.file === 'server/api/cmc/routes.ts').length).toBeGreaterThanOrEqual(5);
  });

  it.each(unguarded.filter((h) => !(h.file in ASKED_THROUGH) && !listed(h)))(
    '$file: `$opens` asks before it calls $engines',
    ({ asks }) => {
      expect(asks).toBe(true);
    },
  );

  it.each(Object.entries(ASKED_THROUGH))('%s asks through the file named', (file, { reason, here, there }) => {
    expect(reason.length).toBeGreaterThan(40);
    expect(callerFiles.has(file), `${file} calls no engine any more: remove its entry`).toBe(true);
    expect(code(readFileSync(join(ROOT, file), 'utf8'))).toContain(here);
    expect(code(readFileSync(join(ROOT, there[0]), 'utf8'))).toContain(there[1]);
  });

  it.each(NOT_YET)('$file: `$handler` is listed with a reason, and still needs to be', (entry) => {
    expect(entry.reason.length).toBeGreaterThan(40);
    expect(entry.until || entry.unreachable, 'an entry expires or proves its own reason').toBeTruthy();
    const found = unguarded.filter((h) => h.file === entry.file && h.opens.startsWith(entry.handler));
    expect(found.length, `${entry.handler} calls no engine any more: remove its entry`).toBe(1);
    expect(found[0].asks, `${entry.handler} asks the boundary now: remove its entry`).toBe(false);
    if (entry.until) {
      expect(new Date() < new Date(`${entry.until}T00:00:00Z`), `${entry.handler} was due by ${entry.until}`).toBe(true);
    }
    if (entry.unreachable) {
      expect(launchScopeApiVerdict(entry.unreachable, buildPrefixMap(), NEVER_GATED)).not.toBe('launch');
    }
  });
});
