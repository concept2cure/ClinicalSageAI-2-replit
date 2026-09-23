#!/usr/bin/env node
/**
 * TM-001 — Traceability Matrix builder.
 *
 * GENERATES docs/validation/TM-001-TRACEABILITY-MATRIX.md (and .json) from:
 *   - the requirement tables in docs/validation/URS-00*.md   (rows `| URS-XXX-NNN | … |`)
 *   - the risk assessment rows in docs/validation/RA-001-RISK-ASSESSMENT.md
 *   - the executed OQ results docs/evidence/W3/<date>/OQ-<APP>/result.json
 *   - the executed IQ results docs/evidence/W3/<date>/IQ/iq-results.json
 *
 * The matrix is never hand-maintained. It fails (exit 1) when:
 *   - an OQ step cites a URS id that no URS document defines, or
 *   - a URS id has no risk-assessment row, or
 *   - a URS document declares no requirements.
 * It does NOT fail on uncovered or failed requirements — those are the
 * matrix's findings and are reported, not hidden.
 *
 *   npm run validation:traceability
 *   npm run validation:traceability:selftest   (proves the exit-1 branches)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN_DATE = process.env.VALIDATION_RUN_DATE || '2026-09-23c';
const DOCS = path.join(ROOT, 'docs', 'validation');
const EVIDENCE = path.join(ROOT, 'docs', 'evidence', 'W3', RUN_DATE);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const extraResults = opt('--extra-results'); // selftest hook: an additional result.json to include
const outDir = opt('--out') || DOCS;

const URS_ROW = /^\|\s*(URS-[A-Z]+-\d{3}[a-z]?)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/;

function parseUrs() {
  const reqs = new Map();
  const files = fs.readdirSync(DOCS).filter((f) => /^URS-\d{3}-.*\.md$/.test(f)).sort();
  for (const f of files) {
    const text = fs.readFileSync(path.join(DOCS, f), 'utf8');
    const app = (/^\*\*App:\*\*\s*(.+)$/m.exec(text) ?? [])[1]?.trim() ?? f;
    let n = 0;
    for (const line of text.split('\n')) {
      const m = URS_ROW.exec(line);
      if (!m) continue;
      n += 1;
      reqs.set(m[1], { id: m[1], app, doc: f, requirement: m[2].trim(), part11: m[3].trim(), risk: m[4].trim(), steps: [] });
    }
    if (n === 0) throw new Error(`${f} declares no requirement rows (expected | URS-XXX-NNN | requirement | Part 11 | risk |)`);
  }
  if (!files.length) throw new Error('no URS documents found');
  return reqs;
}

function parseRa() {
  const p = path.join(DOCS, 'RA-001-RISK-ASSESSMENT.md');
  const out = new Map();
  if (!fs.existsSync(p)) return out;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const m = /^\|\s*(URS-[A-Z]+-\d{3}[a-z]?)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (m) out.set(m[1], { intendedUse: m[2].trim(), risk: m[3].trim(), assurance: m[4].trim(), rationale: m[5].trim() });
  }
  return out;
}

function loadResults() {
  const results = [];
  if (fs.existsSync(EVIDENCE)) {
    for (const d of fs.readdirSync(EVIDENCE).filter((x) => x.startsWith('OQ-')).sort()) {
      const p = path.join(EVIDENCE, d, 'result.json');
      if (fs.existsSync(p)) results.push({ dir: d, ...JSON.parse(fs.readFileSync(p, 'utf8')) });
    }
  }
  if (extraResults) results.push({ dir: path.basename(path.dirname(extraResults)), ...JSON.parse(fs.readFileSync(extraResults, 'utf8')) });
  const iqPath = path.join(EVIDENCE, 'IQ', 'iq-results.json');
  const iq = fs.existsSync(iqPath) ? JSON.parse(fs.readFileSync(iqPath, 'utf8')) : null;
  return { results, iq };
}

const reqs = parseUrs();
const ra = parseRa();
const { results, iq } = loadResults();

const problems = [];
for (const r of results) {
  for (const s of r.steps) {
    for (const id of s.urs ?? []) {
      const req = reqs.get(id);
      if (!req) {
        problems.push(`${r.protocolId} step ${s.id} cites ${id}, which no URS document defines`);
        continue;
      }
      req.steps.push({ protocol: r.protocolId, step: s.id, status: s.status, evidenceDir: r.dir, title: s.title });
    }
  }
}
for (const id of reqs.keys()) if (!ra.has(id)) problems.push(`${id} has no row in RA-001-RISK-ASSESSMENT.md`);

const RANK = { fail: 0, deviation: 1, 'not-executed': 2, pass: 3 };
function verdict(req) {
  if (!req.steps.length) return 'uncovered';
  if (req.steps.some((s) => s.status === 'fail')) return 'fail';
  if (req.steps.every((s) => s.status === 'pass')) return 'pass';
  if (req.steps.some((s) => s.status === 'pass') && req.steps.every((s) => s.status === 'pass' || s.status === 'deviation')) return 'partial';
  return 'open';
}

const rows = [...reqs.values()].map((r) => ({ ...r, ra: ra.get(r.id) ?? null, verdict: verdict(r) }));
const summary = { requirements: rows.length, pass: 0, partial: 0, fail: 0, open: 0, uncovered: 0 };
for (const r of rows) summary[r.verdict] += 1;
const byApp = {};
for (const r of rows) {
  byApp[r.app] ??= { requirements: 0, pass: 0, partial: 0, fail: 0, open: 0, uncovered: 0 };
  byApp[r.app].requirements += 1;
  byApp[r.app][r.verdict] += 1;
}
const stepTotals = { pass: 0, fail: 0, deviation: 0, 'not-executed': 0, steps: 0 };
for (const r of results) {
  for (const s of r.steps) {
    stepTotals.steps += 1;
    stepTotals[s.status] += 1;
  }
}

const generatedAt = new Date().toISOString();
const json = { documentId: 'TM-001', generatedAt, generator: 'scripts/validation/build-traceability.mjs', runDate: RUN_DATE, summary, byApp, stepTotals, protocols: results.map((r) => ({ protocolId: r.protocolId, app: r.appLabel, executedAt: r.executedAt, counts: r.counts, evidence: `docs/evidence/W3/${RUN_DATE}/${r.dir}/` })), iq: iq ? { executedAt: iq.executedAt, counts: iq.counts } : null, requirements: rows, problems };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'TM-001-TRACEABILITY-MATRIX.json'), JSON.stringify(json, null, 2));

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const md = [];
md.push('# TM-001 — Requirements Traceability Matrix');
md.push('');
md.push('| Field | Value |');
md.push('|---|---|');
md.push('| Document ID | TM-001 |');
md.push(`| Version | generated ${generatedAt} |`);
md.push('| Status | DRAFT — UNSIGNED — GENERATED, DO NOT EDIT |');
md.push(`| Generator | \`scripts/validation/build-traceability.mjs\` (\`npm run validation:traceability\`) |`);
md.push(`| Sources | URS-001…006 requirement tables · RA-001 rows · docs/evidence/W3/${RUN_DATE}/OQ-*/result.json · IQ/iq-results.json |`);
md.push('');
md.push('> This file is regenerated from the URS documents and the executed OQ results. Hand edits are overwritten. A requirement with no executed step reads **uncovered**; a requirement with any failed step reads **fail**; pass with deviations reads **partial**. Nothing here is a pass unless a step recorded a pass.');
md.push('');
md.push('## Summary');
md.push('');
md.push(`- Requirements: **${summary.requirements}** — pass ${summary.pass} · partial ${summary.partial} · fail ${summary.fail} · open ${summary.open} · uncovered ${summary.uncovered}`);
md.push(`- OQ steps executed: **${stepTotals.steps}** — pass ${stepTotals.pass} · fail ${stepTotals.fail} · deviation ${stepTotals.deviation} · not-executed ${stepTotals['not-executed']}`);
if (iq) md.push(`- IQ-001: ${iq.counts.pass} pass · ${iq.counts.fail} fail · ${iq.counts.deviation} deviation (executed ${iq.executedAt})`);
md.push('');
md.push('| App | Requirements | Pass | Partial | Fail | Open | Uncovered |');
md.push('|---|---|---|---|---|---|---|');
for (const [app, c] of Object.entries(byApp)) md.push(`| ${app} | ${c.requirements} | ${c.pass} | ${c.partial} | ${c.fail} | ${c.open} | ${c.uncovered} |`);
md.push('');
md.push('## Protocol executions included');
md.push('');
md.push('| Protocol | App | Executed | Pass | Fail | Deviation | Not executed | Evidence |');
md.push('|---|---|---|---|---|---|---|---|');
for (const p of json.protocols) md.push(`| ${p.protocolId} | ${p.app} | ${p.executedAt} | ${p.counts.pass} | ${p.counts.fail} | ${p.counts.deviation} | ${p.counts['not-executed']} | \`${p.evidence}\` |`);
md.push('');
md.push('## Matrix');
md.push('');
md.push('| URS id | Requirement | Part 11 | Risk | CSA assurance (RA-001) | OQ steps (status) | Verdict |');
md.push('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const steps = r.steps.length ? r.steps.map((s) => `${s.step} (${s.status})`).join('<br>') : '—';
  md.push(`| ${r.id} | ${esc(r.requirement)} | ${esc(r.part11)} | ${esc(r.risk)} | ${esc(r.ra?.assurance ?? 'MISSING')} | ${steps} | **${r.verdict}** |`);
}
md.push('');
if (problems.length) {
  md.push('## Integrity problems (the build failed)');
  md.push('');
  for (const p of problems) md.push(`- ${p}`);
  md.push('');
}
md.push('## Signature block');
md.push('');
md.push('| Role | Name | Signature | Date |');
md.push('|---|---|---|---|');
md.push('| Prepared by (generator run by) | | *unsigned* | |');
md.push('| Reviewed by (qualified validation contractor) | | *unsigned* | |');
md.push('| Approved by (founder / system owner) | | *unsigned* | |');
md.push('');
fs.writeFileSync(path.join(outDir, 'TM-001-TRACEABILITY-MATRIX.md'), md.join('\n'));

console.log(`TM-001: ${summary.requirements} requirements — pass ${summary.pass}, partial ${summary.partial}, fail ${summary.fail}, open ${summary.open}, uncovered ${summary.uncovered}; ${stepTotals.steps} OQ steps → ${path.relative(ROOT, path.join(outDir, 'TM-001-TRACEABILITY-MATRIX.md'))}`);
if (problems.length) {
  console.error(`TM-001 integrity problems (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
