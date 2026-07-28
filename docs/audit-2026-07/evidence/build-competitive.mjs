#!/usr/bin/env node
/**
 * Renders the competitive rack-and-stack chapters from the research workflow's
 * journal. Kept as a script (rather than hand-written markdown) so the chapters
 * can be regenerated if the research is re-run, and so the transformation from
 * structured result to prose is auditable.
 *
 * Usage: node docs/audit-2026-07/evidence/build-competitive.mjs <journal.jsonl>
 */
import fs from 'node:fs'
import path from 'node:path'

const JOURNAL = process.argv[2]
const OUT = path.join(process.cwd(), 'docs/audit-2026-07/13-competitive')
fs.mkdirSync(OUT, { recursive: true })

const rows = fs.readFileSync(JOURNAL, 'utf8').trim().split('\n')
  .map((l) => { try { return JSON.parse(l) } catch { return null } })
  .filter((o) => o && o.type === 'result' && o.result && o.result.category)
  .map((o) => ({ key: o.key || '', ...o.result }))

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
const short = (s) => { const t = String(s ?? '').split(/[—–-]/)[0].trim(); return t.length > 62 ? t.slice(0, 59) + '…' : t }

const WEIGHT = { critical: 3, high: 2, medium: 1 }
const VERDICT_LABEL = {
  leader: '🟢 Leader',
  'credible-challenger': '🟡 Credible challenger',
  'niche-viable': '🟠 Niche-viable',
  'not-competitive': '🔴 Not competitive',
}

function score(r) {
  const rub = r.rubric || []
  if (!rub.length) return null
  let ourW = 0, theirW = 0, wsum = 0
  for (const d of rub) {
    const w = WEIGHT[d.weight] ?? 1
    ourW += (d.ourScore ?? 0) * w
    theirW += (d.bestCompetitorScore ?? 0) * w
    wsum += w
  }
  return { ours: ourW / wsum, theirs: theirW / wsum, gap: (ourW - theirW) / wsum, dims: rub.length }
}

// ── per-category chapters ─────────────────────────────────────────────────────
for (const r of rows) {
  const s = score(r)
  const L = []
  L.push(`# ${short(r.category)}`)
  L.push('')
  L.push(`> **Verdict: ${VERDICT_LABEL[r.verdict] ?? r.verdict}**`)
  if (s) L.push(`> Weighted capability score — **us ${s.ours.toFixed(1)} / 5** vs **best competitor ${s.theirs.toFixed(1)} / 5** across ${s.dims} dimensions.`)
  L.push('')
  L.push(`**Full category as scoped:** ${r.category}`)
  L.push('')
  L.push(`## Who buys, and what they are actually buying`)
  L.push('')
  L.push(r.buyer)
  if (r.marketNotes) { L.push(''); L.push(`## Market structure`); L.push(''); L.push(r.marketNotes) }

  L.push(''); L.push('## The five closest competitors'); L.push('')
  for (const c of r.competitors || []) {
    L.push(`### ${c.name} — ${c.product}`)
    L.push('')
    L.push(c.positioning)
    L.push('')
    if (c.strengths?.length) { L.push('**Strengths**'); L.push(''); for (const x of c.strengths) L.push(`- ${x}`); L.push('') }
    if (c.weaknesses?.length) { L.push('**Weaknesses**'); L.push(''); for (const x of c.weaknesses) L.push(`- ${x}`); L.push('') }
    const meta = []
    if (c.aiPosture) meta.push(`| AI shipped today | ${esc(c.aiPosture)} |`)
    if (c.validationPosture) meta.push(`| GxP / validation posture | ${esc(c.validationPosture)} |`)
    if (c.pricingSignal) meta.push(`| Pricing signal | ${esc(c.pricingSignal)} |`)
    if (meta.length) { L.push('| | |'); L.push('|---|---|'); L.push(...meta); L.push('') }
    if (c.sources?.length) { L.push('<details><summary>Sources</summary>'); L.push(''); for (const u of c.sources) L.push(`- ${u}`); L.push(''); L.push('</details>'); L.push('') }
  }

  if (r.rubric?.length) {
    L.push('## Capability rubric'); L.push('')
    L.push('Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.')
    L.push('')
    L.push('| Dimension | Weight | Us | Best competitor | Their score | Our evidence |')
    L.push('|---|---|:--:|---|:--:|---|')
    for (const d of r.rubric) {
      const flag = (d.ourScore ?? 0) < (d.bestCompetitorScore ?? 0) ? ' 🔻' : ((d.ourScore ?? 0) > (d.bestCompetitorScore ?? 0) ? ' 🔺' : '')
      L.push(`| ${esc(d.dimension)} | ${d.weight} | **${d.ourScore}**${flag} | ${esc(d.bestCompetitor)} | ${d.bestCompetitorScore} | ${esc(d.ourEvidence)} |`)
    }
    L.push('')
  }

  const p = r.ourPosition || {}
  L.push('## Where we stand'); L.push('')
  for (const [k, label] of [['win', 'Where we win'], ['parity', 'Where we reach parity'], ['lose', 'Where we lose']]) {
    if (p[k]?.length) { L.push(`**${label}**`); L.push(''); for (const x of p[k]) L.push(`- ${x}`); L.push('') }
  }
  if (r.moatDurability) { L.push('## Is the advantage durable?'); L.push(''); L.push(r.moatDurability); L.push('') }
  if (r.pathToParity?.length) { L.push('## Shortest credible path to parity'); L.push(''); r.pathToParity.forEach((x, i) => L.push(`${i + 1}. ${x}`)); L.push('') }
  L.push('## Verdict'); L.push(''); L.push(`**${VERDICT_LABEL[r.verdict] ?? r.verdict}** — ${r.verdictReasoning}`); L.push('')

  fs.writeFileSync(path.join(OUT, `${slug(short(r.category))}.md`), L.join('\n'))
}

// ── cross-category summary ───────────────────────────────────────────────────
const scored = rows.map((r) => ({ r, s: score(r) })).filter((x) => x.s)
scored.sort((a, b) => b.s.gap - a.s.gap)

const S = []
S.push('# Chapter 13 — Competitive rack-and-stack')
S.push('')
S.push(`Twelve offering categories, five closest competitors each — **${rows.reduce((a, r) => a + (r.competitors || []).length, 0)} competitor profiles**, researched live on the web with source URLs, and scored against a per-category rubric alongside this platform.`)
S.push('')
S.push('**Method.** Categories are derived from `shared/regulatory/app-registry.ts`, the codebase\'s own canonical offering taxonomy, so the comparison is against what is actually sold rather than what a slide claims. Competitor facts carry URLs; our scores carry `file:line`. Everything is scored on **what ships and is reachable** — a capability a user cannot navigate to does not win deals, and this platform currently surfaces 5 of ~101 registered surfaces in its global navigation (Chapter 09).')
S.push('')
S.push('## Scorecard')
S.push('')
S.push('| Category | Verdict | Us | Best competitor | Gap |')
S.push('|---|---|:--:|:--:|:--:|')
for (const { r, s } of scored) {
  const g = s.gap >= 0 ? `+${s.gap.toFixed(1)}` : s.gap.toFixed(1)
  S.push(`| [${short(r.category)}](13-competitive/${slug(short(r.category))}.md) | ${VERDICT_LABEL[r.verdict] ?? r.verdict} | **${s.ours.toFixed(1)}** | ${s.theirs.toFixed(1)} | ${g} |`)
}
S.push('')
const tally = {}
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1
S.push('**Verdict distribution:** ' + Object.entries(tally).map(([k, v]) => `${VERDICT_LABEL[k] ?? k} ×${v}`).join(' · '))
S.push('')
const avgOurs = scored.reduce((a, x) => a + x.s.ours, 0) / scored.length
const avgTheirs = scored.reduce((a, x) => a + x.s.theirs, 0) / scored.length
S.push(`**Across all twelve categories: us ${avgOurs.toFixed(1)} / 5, best-in-category competitor ${avgTheirs.toFixed(1)} / 5.**`)
S.push('')
S.push('## How to read these numbers')
S.push('')
S.push('A 1.8-versus-4.6 average and ten "not competitive" verdicts is a severe result, and it is severe **because of the lens, which was chosen deliberately**. Every dimension was scored on what *ships and is reachable today* — not on what is architected, coded, or nearly done. Three properties of this platform get punished hard by that lens, and all three are documented elsewhere in this audit:')
S.push('')
S.push('1. **Reachability.** 5 of ~101 registered surfaces are in the global navigation (Chapter 09). A capability a buyer cannot click to does not score, however good the code behind it is. Several categories here are scored near-zero on surfaces that demonstrably exist in the codebase.')
S.push('2. **Validation.** Every IQ/OQ/PQ execution record is blank and the VSR reads `DRAFT` (Chapter 07). In this market that is not a deduction — it is disqualification. Multiple category analyses independently reached the same conclusion: **the product does not reach technical evaluation** without a qualification package, regardless of engine quality.')
S.push('3. **Incumbency.** The comparators are Veeva, LORENZ, Certara, Oracle, MasterControl and Cytel — decades of install base, agency familiarity, and accumulated edge-case handling. A 4.6 average for "best in category" is what a mature category looks like.')
S.push('')
S.push('**So the scores measure procurement-readiness, not engineering quality.** They are the right lens for a buyer and the wrong lens for judging the codebase, and this audit uses both: Chapters 04–11 assess the engineering, which is frequently strong.')
S.push('')
S.push('### The one number that matters most')
S.push('')
S.push('**The agentic AI layer scores 3.2 and is the sole "credible challenger" — the only category within striking distance of the leader (−0.7).** Every other category is 2.1 or below.')
S.push('')
S.push('That is a strategically decisive result, and it was reached independently of Chapter 16, which had already argued on code evidence that the AI/grounding layer is the platform\'s real moat. Two separate methods converging on the same conclusion is the strongest signal in this audit:')
S.push('')
S.push('- **Where breadth was the thesis, breadth lost.** Competing against Veeva on RIM, Oracle on pharmacovigilance, or MasterControl on QMS means competing on install base and validation packages — the two things this platform most lacks. Those are −3.2, −3.9 and −3.2 gaps respectively, and no amount of engineering closes them soon.')
S.push('- **Where governed AI was the thesis, it nearly won** — against competitors whose own AI is frequently announced-but-not-shipped.')
S.push('')
S.push('The strategic reading is uncomfortable but clear: **the platform is priced and positioned as a 12-category suite, and it is competitive in one.** Concentrating on that one — and on the device/IVD category that scores next-highest at 2.1 and where the code is genuinely deep — is the difference between a viable challenger and a broad also-ran.')
S.push('')
S.push('## The named competitors')
S.push('')
const byVendor = {}
for (const r of rows) for (const c of r.competitors || []) (byVendor[c.name] ??= []).push(short(r.category))
S.push('| Vendor | Categories where it is a closest competitor |')
S.push('|---|---|')
for (const [v, cats] of Object.entries(byVendor).sort((a, b) => b[1].length - a[1].length)) {
  S.push(`| ${esc(v)} | ${cats.length} — ${cats.map(esc).join('; ')} |`)
}
S.push('')
S.push('## Per-category detail')
S.push('')
for (const { r } of scored) S.push(`- [${short(r.category)}](13-competitive/${slug(short(r.category))}.md) — ${VERDICT_LABEL[r.verdict] ?? r.verdict}`)
S.push('')

fs.writeFileSync(path.join(process.cwd(), 'docs/audit-2026-07/13-competitive-scorecard.md'), S.join('\n'))

console.log(`categories rendered : ${rows.length}`)
console.log(`competitor profiles : ${rows.reduce((a, r) => a + (r.competitors || []).length, 0)}`)
console.log(`distinct vendors    : ${Object.keys(byVendor).length}`)
console.log(`avg us / them       : ${avgOurs.toFixed(2)} / ${avgTheirs.toFixed(2)}`)
console.log('verdicts            :', JSON.stringify(tally))
