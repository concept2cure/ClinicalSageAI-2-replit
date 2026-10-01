#!/usr/bin/env node
// P0-11 fix round. Applies a proposed edit of the DPA to the DPA as committed at a git ref (in memory; nothing in
// the tree is written) and checks that the result still says what the Annex said before, plus the P0-11 fact.
//
//   node docs/evidence/D6/2026-10-01-tranche-4/P0-11/fix-round/check-dpa-proposal.mjs <proposal.json> [ref=HEAD]
//
// Exit 0 when every check holds, 1 when any fails. The invariants are derived from the DPA at <ref>, not listed by
// hand: every Annex III subprocessor at <ref> must survive the edit, none may appear twice, and Moonshot's exclusion
// must still be stated exactly once.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DPA = 'docs/commercial/DATA_PROCESSING_ADDENDUM.md';
const out = (line) => process.stdout.write(`${line}\n`);
const [proposalPath, ref = 'HEAD'] = process.argv.slice(2);
if (!proposalPath) {
  console.error('usage: check-dpa-proposal.mjs <proposal.json> [ref]');
  process.exit(2);
}
const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
const before = execFileSync('git', ['show', `${ref}:${DPA}`], { encoding: 'utf8' });

function annexIII(text) {
  const start = text.indexOf('## Annex III');
  if (start === -1) throw new Error('no Annex III heading');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}
const isRow = (l) => l.startsWith('| ') && !l.startsWith('| Subprocessor |');
const annexRows = (text) => annexIII(text).split('\n').filter(isRow);
const firstCell = (row) => row.split('|')[1].trim();
const count = (hay, needle) => hay.split(needle).length - 1;

function applyEdit(text, edit, anchors) {
  if (edit.op === 'replace') {
    const n = count(text, edit.find);
    anchors.push({ where: edit.where, found: n });
    return n === 1 ? text.replace(edit.find, () => edit.replace) : text;
  }
  const rows = annexRows(text);
  const last = rows[rows.length - 1];
  if (edit.op === 'replaceLastAnnexIIIRow') {
    out(`"${edit.where}" resolves, at ${ref}, to the row: ${firstCell(last)}`);
    return text.replace(last, () => edit.with);
  }
  if (edit.op === 'addUnderAnnexIIITable') return text.replace(last, () => `${last}\n\n${edit.text}`);
  throw new Error(`unknown op ${edit.op}`);
}

const anchors = [];
const after = proposal.edits.reduce((t, e) => applyEdit(t, e, anchors), before);

const beforeNames = annexRows(before).map(firstCell);
const afterNames = annexRows(after).map(firstCell);
const dropped = beforeNames.filter((n) => !afterNames.includes(n));
const twice = afterNames.filter((n, i) => afterNames.indexOf(n) !== i);
const moonshotBefore = annexIII(before).split('\n').filter((l) => /Moonshot/.test(l)).length;
const moonshotAfter = annexIII(after).split('\n').filter((l) => /Moonshot/.test(l));
const openaiRows = annexRows(after).filter((r) => firstCell(r).startsWith('OpenAI'));
const unanchored = anchors.filter((a) => a.found !== 1);

const checks = [
  ['every text the proposal tells the owner to find occurs exactly once', unanchored.length === 0,
    unanchored.map((a) => `${a.where}: found ${a.found} times`).join('; ')],
  ['no Annex III subprocessor is dropped', dropped.length === 0, `dropped: ${dropped.join(' / ')}`],
  ['no subprocessor is listed twice', twice.length === 0, `listed twice: ${twice.join(' / ')}`],
  [`Moonshot's exclusion is stated exactly once in Annex III (as at ${ref}: ${moonshotBefore})`,
    moonshotAfter.length === 1, `stated ${moonshotAfter.length} times:\n      ${moonshotAfter.join('\n      ')}`],
  ['every Annex III OpenAI row says no key is provisioned without an election',
    openaiRows.length > 0 && openaiRows.every((r) => /provision/i.test(r) && /elect/i.test(r)),
    `OpenAI rows: ${openaiRows.length}; without the provisioning clause: ${openaiRows.filter((r) => !/provision/i.test(r)).length}`],
];

out(`proposal: ${proposal.name}\nDPA at: ${ref} (${execFileSync('git', ['rev-parse', '--short', ref], { encoding: 'utf8' }).trim()})\n`);
let failed = 0;
for (const [label, ok, detail] of checks) {
  out(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}

const dir = mkdtempSync(join(tmpdir(), 'dpa-proposal-'));
try {
  writeFileSync(join(dir, 'DPA.at-ref.md'), before);
  writeFileSync(join(dir, 'DPA.proposed.md'), after);
  let diff = '';
  try {
    execFileSync('git', ['diff', '--no-index', '--no-color', '--word-diff=plain', '-U0', 'DPA.at-ref.md', 'DPA.proposed.md'], { cwd: dir, encoding: 'utf8' });
  } catch (e) {
    diff = e.stdout; // git diff --no-index exits 1 when the files differ
  }
  out(`\nThe change this proposal makes to the DPA at ${ref} (word diff):\n${diff.split('\n').filter((l) => !/^(diff|index|---|\+\+\+) /.test(l)).join('\n')}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
out(failed ? `${failed} check(s) FAIL` : 'every check holds');
process.exit(failed ? 1 : 0);
