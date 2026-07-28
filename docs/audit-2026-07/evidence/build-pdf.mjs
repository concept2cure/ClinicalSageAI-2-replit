#!/usr/bin/env node
/**
 * Renders the audit report set into a single print-ready HTML document, which is
 * then converted to PDF by headless Chromium.
 *
 * Usage:
 *   node docs/audit-2026-07/evidence/build-pdf.mjs            # full report
 *   node docs/audit-2026-07/evidence/build-pdf.mjs --core     # without competitive appendix
 */
import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'docs/audit-2026-07')
const CORE_ONLY = process.argv.includes('--core')

const CORE = [
  ['00-executive-summary.md', 'Executive summary'],
  ['01-method-and-coverage.md', 'Method and coverage'],
  ['02-architecture-map.md', 'The as-built architecture'],
  ['04-security.md', 'Security'],
  ['05-data-and-tenancy.md', 'Data layer and multi-tenancy'],
  ['06-ai-layer.md', 'The AI layer'],
  ['07-compliance-21cfr11.md', '21 CFR Part 11 and the compliance claims'],
  ['08-quality-tests-ci.md', 'Quality, tests and CI'],
  ['09-frontend-and-ux.md', 'Frontend, navigation and UX honesty'],
  ['10-infra-and-ops.md', 'Infrastructure, deployment and operability'],
  ['11-suppression-ledger.md', 'The suppression ledger'],
  ['13-competitive-scorecard.md', 'Competitive rack-and-stack'],
  ['14-readiness-gate-ladder.md', 'Readiness verdict — the gate ladder'],
  ['15-remediation-plan.md', 'Remediation plan'],
  ['16-enhancement-roadmap.md', 'Enhancement roadmap'],
  ['evidence/00-live-proof-log.md', 'Appendix A — Live-proof execution log'],
]

marked.setOptions({ mangle: false, headerIds: false })

const parts = []
let missing = []

for (const [rel, title] of CORE) {
  const p = path.join(DIR, rel)
  if (!fs.existsSync(p)) { missing.push(rel); continue }
  parts.push(`<section class="chapter"><div class="chapter-tag">${title}</div>${marked.parse(fs.readFileSync(p, 'utf8'))}</section>`)
}

if (!CORE_ONLY) {
  const cdir = path.join(DIR, '13-competitive')
  if (fs.existsSync(cdir)) {
    const files = fs.readdirSync(cdir).filter((f) => f.endsWith('.md')).sort()
    parts.push(`<section class="chapter"><h1>Appendix B — Competitive detail</h1>
      <p class="std">One rack-and-stack per offering category. Each contains the five closest
      competitors with cited sources, a capability rubric scoring this platform against the best
      competitor per dimension, and a verdict. ${files.length} categories.</p></section>`)
    for (const f of files) {
      parts.push(`<section class="chapter"><div class="chapter-tag">Appendix B · competitive</div>${marked.parse(fs.readFileSync(path.join(cdir, f), 'utf8'))}</section>`)
    }
  }
}

const today = fs.statSync(path.join(DIR, '00-executive-summary.md')).mtime.toISOString().slice(0, 10)

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Forensic Audit — Concept2Cure.RI / TrialSage</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  @page :first { margin: 0; }
  :root{
    --ink:#12161C; --ink2:#39414E; --muted:#5B6472; --rule:#D5DBE3; --rule2:#EBEEF2;
    --accent:#1F5FA8; --crit:#B3261E; --warn:#8A5D00; --pass:#1B5E44;
    --mono:"SF Mono","JetBrains Mono","DejaVu Sans Mono",Menlo,Consolas,monospace;
    --sans:"Helvetica Neue",Helvetica,Arial,"DejaVu Sans",sans-serif;
  }
  *{box-sizing:border-box;}
  body{font-family:var(--sans); color:var(--ink); font-size:9.6pt; line-height:1.5; margin:0;}
  .cover{height:297mm; padding:38mm 26mm; display:flex; flex-direction:column;
         justify-content:space-between; page-break-after:always; color:#fff;
         background:#0D1015;}
  .cover .top{display:flex; flex-direction:column; gap:10mm;}
  .cover .kicker{font-family:var(--mono); font-size:8.5pt; letter-spacing:.22em;
                 text-transform:uppercase; color:#8A94A6;}
  .cover h1{font-size:34pt; line-height:1.02; margin:0; letter-spacing:-.025em; font-weight:700;}
  .cover .sub{font-size:13pt; color:#B6BEC9; max-width:120mm; line-height:1.45;}
  .cover .rule{height:2px; background:#1F5FA8; width:46mm;}
  .cover .meta{font-family:var(--mono); font-size:8.5pt; color:#8A94A6; line-height:1.9;}
  .cover .verdicts{display:flex; gap:6mm; margin-top:4mm;}
  .cover .v{border:1px solid #2A323D; padding:5mm 6mm; flex:1;}
  .cover .v .g{font-family:var(--mono); font-size:8pt; letter-spacing:.14em; color:#8A94A6;}
  .cover .v .s{font-family:var(--mono); font-size:9.5pt; color:#F08A80; font-weight:700;
               letter-spacing:.06em; margin-top:2mm;}
  .cover .v .d{font-family:var(--mono); font-size:14pt; font-weight:700; margin-top:2mm;}

  .chapter{page-break-before:always;}
  .chapter-tag{font-family:var(--mono); font-size:7.6pt; letter-spacing:.18em;
               text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--rule);
               padding-bottom:2.5mm; margin-bottom:7mm;}
  h1{font-size:21pt; letter-spacing:-.02em; line-height:1.1; margin:0 0 5mm; font-weight:700;}
  h2{font-size:13pt; letter-spacing:-.015em; margin:9mm 0 3mm; font-weight:700;
     page-break-after:avoid; border-bottom:1px solid var(--rule2); padding-bottom:1.6mm;}
  h3{font-size:10.6pt; margin:6mm 0 2mm; font-weight:700; page-break-after:avoid;}
  h4{font-size:9.8pt; margin:5mm 0 1.5mm; font-weight:700;}
  p,li{orphans:3; widows:3;}
  p{margin:0 0 3mm;}
  ul,ol{margin:0 0 3.5mm; padding-left:5.5mm;}
  li{margin-bottom:1.4mm;}
  strong{font-weight:700;}
  blockquote{border-left:2.5px solid var(--accent); margin:3.5mm 0; padding:1mm 0 1mm 5mm;
             color:var(--ink2);}
  blockquote p:last-child{margin-bottom:0;}
  code{font-family:var(--mono); font-size:8.3pt; background:#F2F4F7; padding:.3mm 1mm;
       border:1px solid var(--rule2); border-radius:1px;}
  pre{background:#F2F4F7; border:1px solid var(--rule); padding:3mm; overflow:hidden;
      page-break-inside:avoid; margin:0 0 3.5mm;}
  pre code{background:none; border:0; font-size:7.8pt; line-height:1.45; white-space:pre-wrap;
           word-break:break-word;}
  table{border-collapse:collapse; width:100%; margin:0 0 4mm; font-size:8.4pt;
        page-break-inside:avoid;}
  th{text-align:left; font-family:var(--mono); font-size:7.4pt; letter-spacing:.1em;
     text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--rule);
     padding:2mm 2.4mm; font-weight:600;}
  td{padding:2mm 2.4mm; border-bottom:1px solid var(--rule2); vertical-align:top;
     line-height:1.42; word-break:break-word;}
  td code{font-size:7.6pt; word-break:break-all;}
  a{color:var(--accent); text-decoration:none;}
  details{margin:0 0 3mm;} summary{font-size:8.4pt; color:var(--muted); cursor:default;}
  details ul{font-size:7.8pt; word-break:break-all;}
  hr{border:0; border-top:1px solid var(--rule); margin:6mm 0;}
  .std{color:var(--ink2);}
</style></head><body>

<div class="cover">
  <div class="top">
    <div class="kicker">Purchase-grade forensic audit</div>
    <h1>Concept2Cure.RI<br>TrialSage</h1>
    <div class="rule"></div>
    <div class="sub">An independent buyer's-eye assessment of 1,489,132 lines across 7,858 files —
    technical audit, competitive rack-and-stack, and readiness for human use.</div>
  </div>
  <div>
    <div class="verdicts">
      <div class="v"><div class="g">G1 PILOT</div><div class="s">NOT READY</div><div class="d">2–4 wk</div></div>
      <div class="v"><div class="g">G2 COMMERCIAL</div><div class="s">NOT READY</div><div class="d">2–4 mo</div></div>
      <div class="v"><div class="g">G3 GxP</div><div class="s">NOT READY</div><div class="d">6–12 mo</div></div>
    </div>
    <div class="meta" style="margin-top:8mm;">
      Branch <strong style="color:#E4E8EE">concept2cure-v2</strong> @ <strong style="color:#E4E8EE">576ec5d</strong><br>
      ${today} &nbsp;·&nbsp; 12 offering categories &nbsp;·&nbsp; 66 cited competitor profiles<br>
      Findings proven by execution, not by reading
    </div>
  </div>
</div>

${parts.join('\n')}
</body></html>`

const outHtml = path.join(DIR, 'evidence', CORE_ONLY ? '.report-core.html' : '.report-full.html')
fs.writeFileSync(outHtml, html)
console.log(`chapters: ${parts.length}`)
if (missing.length) console.log(`MISSING (skipped): ${missing.join(', ')}`)
console.log(`html: ${outHtml} (${(html.length / 1024).toFixed(0)} KB)`)
