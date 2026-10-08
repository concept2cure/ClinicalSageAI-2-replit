// Focused qualification of the seven QA logging calls; never runs browser actions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { format } from 'node:util';
import ts from 'typescript';

const target = 'docs/evidence/QA-2026-10-08/roles/repro-scripts/send-for-review.mjs';
const baseline = 'b015e409c268ca69965686710a18093b73e404b5';
const source = readFileSync(target, 'utf8');
const original = execFileSync('git', ['show', `${baseline}:${target}`], { encoding: 'utf8' });

function callsFor(text) {
  const file = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, 'Script must parse without diagnostics');
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(file) === 'console') {
      calls.push({ node, file, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return calls;
}

const actual = callsFor(source);
const previous = callsFor(original);
const dynamic = actual.filter(({ node }) => !ts.isStringLiteral(node.arguments[0]));
const result = {
  target,
  baseline,
  runtime: process.version,
  consoleCalls: actual.length,
  nonliteralFirstArgumentLines: dynamic.map(call => call.line),
  qualification: dynamic.length ? 'FAIL' : 'PASS',
};
if (dynamic.length) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(1);
}

assert.equal(actual.length, 7, 'All seven reported calls are covered');
assert.equal(previous.length, actual.length, 'No console calls added or removed');
let outputMeaningCases = 0;
for (let index = 0; index < actual.length; index += 1) {
  const current = actual[index];
  const old = previous[index];
  const oldFirst = old.node.arguments[0];
  assert.ok(ts.isTemplateExpression(oldFirst));
  assert.equal(oldFirst.head.text, '[');
  assert.equal(oldFirst.templateSpans.length, 1);
  assert.equal(oldFirst.templateSpans[0].expression.getText(old.file), 'TAG || EMAIL');
  assert.equal(current.node.expression.getText(current.file), old.node.expression.getText(old.file));
  assert.equal(current.node.arguments[0].text, `[%s${oldFirst.templateSpans[0].literal.text}`);
  assert.equal(current.node.arguments[1].getText(current.file), 'TAG || EMAIL');
  assert.deepEqual(
    current.node.arguments.slice(2).map(argument => argument.getText(current.file)),
    old.node.arguments.slice(1).map(argument => argument.getText(old.file)),
    'Payload expressions must remain unchanged',
  );
  for (const context of [
    { TAG: 'QA reviewer', EMAIL: 'qa@example.test' },
    { TAG: '', EMAIL: 'qa@example.test' },
    { TAG: 'tag-%s-%j-%d-%%', EMAIL: 'qa@example.test' },
    { TAG: '', EMAIL: 'qa-%s-%j@example.test' },
  ]) {
    const tag = context.TAG || context.EMAIL;
    const payload = 'payload %s stays data';
    const expected = `[${tag}${oldFirst.templateSpans[0].literal.text} ${payload}`;
    assert.equal(format(current.node.arguments[0].text, tag, payload), expected);
    outputMeaningCases += 1;
  }
}
result.outputMeaningCases = outputMeaningCases;
result.labelsAndPayloadExpressionsPreserved = true;
result.percentTokensInTagsRemainLiteral = true;
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
