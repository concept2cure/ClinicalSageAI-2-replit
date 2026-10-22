/**
 * Every caller of a CMC engine that states small-molecule content for a
 * program asks the composition boundary (decision P-28: small-molecule Module
 * 3 for a US IND; services/cmc/composition-scope.ts).
 *
 * Compose was the only caller of the boundary until 2026-10-22. The QbD
 * analysis, the ICH compliance verdict, the control strategy, the ICH Q1E
 * shelf life and batch poolability were each reached from routes and AnA
 * commands that never asked it, so a monoclonal antibody was given Q3A(R2)
 * impurity bases, Q6A release defaults and a Q1E-extrapolated shelf life
 * (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/).
 *
 * This is the static half: a file that calls one of these engines also names
 * the boundary decision. It is per file, so it cannot tell which handler in a
 * file asked; the behaviour per entry point is pinned by
 * api/cmc/__tests__/composition-boundary-routes.test.ts and
 * ana-ri/__tests__/quality-engine-commands-composition-boundary.test.ts, and
 * the decision itself on a real engine by composition-boundary-readers.pglite.test.ts.
 *
 * A caller that does not ask is listed below WITH ITS REASON, and the list is
 * held honest both ways: an entry whose file now asks, or no longer calls an
 * engine, fails until it is removed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

/** The engines, and the files that define them (which call each other). */
const ENGINES = [
  'analyzeQbdFromSources',
  'runIchComplianceCheck',
  'generateControlStrategy',
  'estimateRecordedShelfLife',
  'assessRecordedPoolability',
];
const ENGINE_FILES = new Set([
  'server/services/cmc/qbd-analyzer.ts',
  'server/services/cmc/ich-compliance-checker.ts',
  'server/services/cmc/control-strategy-generator.ts',
  'server/services/cmc/recorded-stability.ts',
]);

/** The boundary decision, by the names a caller reaches it through (services/cmc/module3-compile.ts). */
const BOUNDARY = ['assessProgramCompositionScope', 'programCompositionRefusal', 'admitProgramComposition'];

/** Callers that do not ask yet, each with why. */
const NOT_YET: Record<string, string> = {
  'server/services/ana/AnaToolExecutor.ts':
    'estimate_recorded_shelf_life and assess_recorded_batch_poolability. Another lane edited this file at ' +
    '2026-10-22T00:12Z; they are wired after its 24-hour window, with the answer_intelligence_question CMC flows ' +
    '(docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/README.md, "Still open").',
  'server/routes/orchestration.ts':
    'POST /api/orchestration/pre-submission-gate runs the ICH check for a linked CMC project. /api/orchestration ' +
    'is outside the launch catalog and refused in production by the launch-scope gate (route inventory ' +
    '2026-10-22: verdict out-of-scope), so it reaches no launch tenant.',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** A call, not a definition, an import or a mention in a comment. */
const calls = (text: string, name: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .some((line) => new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`).test(line));

const callers = sourceFiles(join(ROOT, 'server'))
  .map((path) => ({ file: relative(ROOT, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))
  .filter(({ file }) => !ENGINE_FILES.has(file))
  .map(({ file, text }) => ({
    file,
    engines: ENGINES.filter((e) => calls(text, e)),
    asks: BOUNDARY.some((b) => text.includes(b)),
  }))
  .filter((c) => c.engines.length > 0);

describe('callers of the CMC engines ask the composition boundary', () => {
  it('finds the callers it exists to watch', () => {
    // A scan that finds nothing passes everything.
    expect(callers.map((c) => c.file)).toEqual(
      expect.arrayContaining(['server/api/cmc/routes.ts', 'server/services/ana-ri/quality-engine-command-handlers.ts']),
    );
  });

  it.each(callers.filter((c) => !(c.file in NOT_YET)))('$file asks before it calls $engines', ({ asks }) => {
    expect(asks).toBe(true);
  });

  it.each(Object.entries(NOT_YET))('%s is listed with a reason, and still needs to be', (file, reason) => {
    expect(reason.length).toBeGreaterThan(40);
    const caller = callers.find((c) => c.file === file);
    expect(caller, `${file} calls no engine any more: remove its entry`).toBeTruthy();
    expect(caller!.asks, `${file} asks the boundary now: remove its entry`).toBe(false);
  });
});
