'use strict';
// Full-source compatibility verification, not provider or authenticated-chat acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.C2C_TS_PATH || 'typescript');
const [baseline, candidate] = process.argv.slice(2);
assert.ok(baseline && candidate, 'Usage: node verify-full-files.cjs BASELINE_ROOT CANDIDATE_ROOT');
const definitions = 'server/services/ana/bla-biologics-tool-defs.ts';
const skills = 'server/services/ana/skills/library/submissions.ts';
function load(root, file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.equal(syntax.parseDiagnostics.length, 0, `Parse diagnostics: ${file}`);
  const compiled = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const sandbox = { exports: {}, require: (name) => {
    // Only the skill registration factory is substituted; all source skill objects execute.
    assert.equal(name, '../types.js');
    return { skill: (value) => value };
  } };
  vm.runInNewContext(compiled.outputText, sandbox, { timeout: 1000 });
  return JSON.parse(JSON.stringify(sandbox.exports));
}
const beforeTools = load(baseline, definitions);
const afterTools = load(candidate, definitions);
assert.deepEqual(Object.keys(afterTools), Object.keys(beforeTools));
for (const key of Object.keys(beforeTools)) {
  if (key !== 'RESOLVE_SUBMISSION_PLAN') assert.deepEqual(afterTools[key], beforeTools[key], key);
}
const beforeSkills = load(baseline, skills).SUBMISSIONS_SKILLS;
const afterSkills = load(candidate, skills).SUBMISSIONS_SKILLS;
assert.deepEqual(afterSkills.map(x => x.key), beforeSkills.map(x => x.key));
for (let i = 0; i < beforeSkills.length; i++) {
  if (beforeSkills[i].key !== 'submissions') assert.deepEqual(afterSkills[i], beforeSkills[i]);
  else {
    const { instructions: oldText, ...oldFields } = beforeSkills[i];
    const { instructions: newText, ...newFields } = afterSkills[i];
    assert.deepEqual(newFields, oldFields);
    const originalLines = oldText.split('\n'), candidateLines = newText.split('\n');
    assert.equal(originalLines.length, candidateLines.length);
    const changed = originalLines.flatMap((line, n) => line !== candidateLines[n] ? [n] : []);
    assert.equal(changed.length, 1);
    assert.ok(candidateLines[changed[0]].startsWith('3. For one or more regions,'));
  }
}
console.log(JSON.stringify({
  status: 'passed', node: process.version, typescript: ts.version,
  completeModulesTranspiledAndEvaluated: 4,
  unchangedToolDefinitions: Object.keys(beforeTools).length - 1,
  unchangedSpecialistSkills: beforeSkills.length - 1,
  changedSkillInstructionLines: 1,
  toolIdentityUnchanged: true,
  collaboratorSubstitutions: ['skill registration factory only'],
  notVerified: ['whole-repository semantic types', 'provider schema acceptance', 'tool handler dispatch', 'authenticated chat', 'deployment'],
}, null, 2));
