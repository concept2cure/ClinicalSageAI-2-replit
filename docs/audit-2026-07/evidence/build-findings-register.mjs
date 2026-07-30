#!/usr/bin/env node
/**
 * Renders the deep-review findings register from the review workflow's journal.
 *
 * Kept as a script so the transformation from structured agent output to prose is
 * auditable and regenerable, matching build-competitive.mjs.
 *
 * Usage: node docs/audit-2026-07/evidence/build-findings-register.mjs <journal.jsonl>
 */
import fs from 'node:fs'
import path from 'node:path'

// Accepts one or more journals. The review streams ran as separate workflows —
// the 12-unit code review, and a later design + deep-security pass — and both
// belong in one register rather than in chapters that would need cross-reading.
const JOURNALS = process.argv.slice(2)
const OUT = path.join(process.cwd(), 'docs/audit-2026-07/12-findings-register.md')

const rows = JOURNALS.flatMap((j) =>
  fs.readFileSync(j, 'utf8').trim().split('\n')
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
    .filter((o) => o.type === 'result' && o.result)
)

// The two streams name their scope differently: `unit` (code review) vs `area`
// (design / security). Normalise so downstream code does not care which ran.
const units = rows
  .filter((r) => Array.isArray(r.result.findings))
  .map((r) => ({ ...r.result, unit: r.result.unit || r.result.area }))
const verdicts = rows.filter((r) => typeof r.result.refuted === 'boolean').map((r) => r.result)

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim()
const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }
const all = units.flatMap((u) => (u.findings || []).map((f) => ({ ...f, _unit: u.unit })))
all.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))

const tally = {}
for (const f of all) tally[f.severity] = (tally[f.severity] || 0) + 1
const gateTally = {}
for (const f of all) if (f.gate) gateTally[f.gate] = (gateTally[f.gate] || 0) + 1

const L = []
L.push('# Chapter 12 — Deep-review findings register')
L.push('')
L.push(`Twelve audit units, reviewed in parallel against a fixed rubric. **${all.length} findings** with a file path, a line, and a concrete failure scenario each.`)
L.push('')
L.push('| Severity | Count | Meaning |')
L.push('|---|---:|---|')
L.push(`| P0 | ${tally.P0 || 0} | Blocks G1 — unsafe or dishonest for any human use |`)
L.push(`| P1 | ${tally.P1 || 0} | Blocks G2 — prevents taking money safely |`)
L.push(`| P2 | ${tally.P2 || 0} | Blocks G3 — prevents GxP/submission-grade use |`)
L.push(`| P3 | ${tally.P3 || 0} | Quality, maintainability, hygiene |`)
L.push('')

// ── The honesty framing. This is the most important section in the chapter. ──
L.push('## Read this before the findings')
L.push('')
L.push(`**These findings are largely unverified, and that is a material caveat.** The adversarial verification stage covered **${verdicts.length}** of the ${(tally.P0 || 0) + (tally.P1 || 0)} P0/P1 findings before the run was cut short by a container restart. The rest are single-reviewer output.`)
L.push('')
L.push('That matters because this audit has a measured error rate on exactly this kind of claim. Ten headline findings went through full adversarial verification (Chapter 03): **four survived intact, six were overstated, three materially** — including one where the guard-coverage number was wrong by roughly 3× and one where the XSS taint path was traced through dead code.')
L.push('')
L.push('**So treat an unverified finding below as a lead worth an hour, not a fact.** On the observed base rate, expect a meaningful fraction to be overstated, mis-severitied, or already mitigated by a compensating control the reviewer did not find. Every one carries a `file:line` so it can be checked in minutes.')
L.push('')
L.push('The findings that decide the verdict are **not** in this chapter — they are in the executive summary and Chapter 03, and all of those were verified by execution.')
L.push('')

L.push('## By unit')
L.push('')
L.push('| Unit | Findings | P0 | P1 |')
L.push('|---|---:|---:|---:|')
for (const u of units) {
  const f = u.findings || []
  L.push(`| ${esc(u.unit).slice(0, 70)} | ${f.length} | ${f.filter((x) => x.severity === 'P0').length} | ${f.filter((x) => x.severity === 'P1').length} |`)
}
L.push('')

if (Object.keys(gateTally).length) {
  L.push('**Gate distribution:** ' + Object.entries(gateTally).sort().map(([k, v]) => `${k} ×${v}`).join(' · '))
  L.push('')
}

// ── Verified subset first — these carry weight the rest do not. ──
if (verdicts.length) {
  const survived = verdicts.filter((v) => !v.refuted)
  L.push('## The verified subset')
  L.push('')
  L.push(`${verdicts.length} findings reached adversarial verification before the run was interrupted. **${survived.length} survived; ${verdicts.length - survived.length} were refuted.**`)
  L.push('')
  L.push('| Verdict | Corrected severity | Reasoning |')
  L.push('|---|---|---|')
  for (const v of verdicts) {
    L.push(`| ${v.refuted ? '❌ Refuted' : '✅ Survived'} | ${v.correctedSeverity || '—'} | ${esc(v.reasoning).slice(0, 240)} |`)
  }
  L.push('')
  L.push('Refuted findings are shown rather than deleted, so the reader can see what was considered and dismissed.')
  L.push('')
}

// ── Full register, grouped by unit, severity-ordered ──
L.push('## Findings')
L.push('')
for (const u of units) {
  const f = (u.findings || []).slice().sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
  if (!f.length) continue
  L.push(`### ${u.unit}`)
  L.push('')
  if (u.summary) { L.push(u.summary); L.push('') }
  if (u.strengths?.length) {
    L.push('**Genuine strengths in this unit**')
    L.push('')
    for (const s of u.strengths) L.push(`- ${s}`)
    L.push('')
  }
  for (const x of f) {
    L.push(`#### \`${x.severity}\` ${x.id ? x.id + ' — ' : ''}${x.title}`)
    L.push('')
    L.push(`\`${x.file}:${x.line}\`${x.gate && x.gate !== 'none' ? ` · blocks **${x.gate}**` : ''}${x.effort ? ` · ~${x.effort}` : ''}${x.category ? ` · ${x.category}` : ''}`)
    L.push('')
    if (x.evidence) { L.push(`**Evidence.** ${x.evidence}`); L.push('') }
    if (x.failureScenario) { L.push(`**Failure scenario.** ${x.failureScenario}`); L.push('') }
    if (x.fix) { L.push(`**Fix.** ${x.fix}`); L.push('') }
  }
}

fs.writeFileSync(OUT, L.join('\n'))
console.log(`units: ${units.length}`)
console.log(`findings: ${all.length}  (${JSON.stringify(tally)})`)
console.log(`verification verdicts: ${verdicts.length}`)
console.log(`wrote ${OUT} (${(L.join('\n').length / 1024).toFixed(0)} KB)`)
