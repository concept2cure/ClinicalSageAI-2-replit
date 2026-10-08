const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const repo = process.cwd();
const ts = require(path.join(repo, 'node_modules/typescript'));
const base = 'c7ae8c0702c50f8ab37a688ef9a5a35079edf937';
const sourcePath = 'server/services/audit/__tests__/chain-anchor.dbtest.ts';
const baseText = cp.execFileSync('git', ['show', `${base}:${sourcePath}`], {cwd: repo, encoding: 'utf8'});
const currentText = fs.readFileSync(path.join(repo, sourcePath), 'utf8');
function case12(text) {
  const source = ts.createSourceFile('native.ts', text, ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'it'
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text.startsWith('12. a head older')) found.push(node.arguments[1]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (found.length !== 1 || source.parseDiagnostics.length) throw new Error('case12 must be unique and parse');
  const node = found[0];
  const statements = node.body.statements.map(s => s.getText(source));
  return {source, node, statements, outside: text.slice(0, node.getStart(source)) + '<case12>' + text.slice(node.end)};
}
const before = case12(baseText), after = case12(currentText);
const checks = {
  case12IsUniqueInBothVersions: true,
  everyByteOutsideCase12CallbackUnchanged: before.outside === after.outside,
  deletedCountAssertionUnchanged: before.statements.find(s => s.startsWith('expect(Number(archived.rows[0].n))')) === after.statements.find(s => s.startsWith('expect(Number(archived.rows[0].n))')),
  completeVerdictAssertionUnchanged: before.statements.find(s => s.startsWith('expect(verdict)')) === after.statements.find(s => s.startsWith('expect(verdict)')),
  originalArchiveDoorCallUnchanged: before.statements.find(s => s.startsWith('const archived =')) === after.statements.find(s => s.startsWith('const archived =')),
  originalDormantRowsAndAnchorUnchanged: before.statements.slice(0, 5).join('\n') === after.statements.slice(0, 5).join('\n'),
};
const protectedPaths = ['server/services/audit/chain-anchor.ts', 'server/services/audit/chain.ts', 'db/migrations/20260617_audit_logs_immutability.sql', 'migrations/20260921_audit_logs_chain_seq.sql'];
const pins = protectedPaths.map(p => {
  const old = cp.execFileSync('git', ['show', `${base}:${p}`], {cwd: repo});
  const current = fs.readFileSync(path.join(repo, p));
  return {path: p, identicalToBase: old.equals(current), gitBlob: cp.execFileSync('git', ['hash-object', p], {cwd: repo, encoding: 'utf8'}).trim()};
});
const result = {readOnlySourceReview: true, sourceBase: base, checks, protectedSources: pins, nativeSourceSha256: crypto.createHash('sha256').update(currentText).digest('hex')};
const out = path.join(repo, 'docs/evidence/D4/2026-10-08-anchor-clock-fixture/SOURCE-REVIEW.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.info(JSON.stringify({report: out, checks, protectedSourceCount: pins.length, protectedSourcesUnchanged: pins.every(p => p.identicalToBase)}));
if (!Object.values(checks).every(Boolean) || pins.some(p => !p.identicalToBase)) process.exitCode = 1;
