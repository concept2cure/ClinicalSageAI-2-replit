/* eslint-disable complexity, max-depth -- an evidence script: a one-off CSS cascade walk kept beside its result; it ships nothing and is read with that result. */
// For every element that carries a bare tone class beside some other class (tone_users.mjs), which
// rule paints its colour and its fill today, and which would once the bare `.c2c-v2 .tone-*` rules
// in app-v2.css are limited to `.rd-chip`. Static, from the stylesheets' text: each rule's subject
// compound is matched against the element's classes; the rest of the selector (its ancestors) is
// reported, not assumed away, so a rule that needs a context is visible as such.
//
// Usage, from the repository root: node tone_cascade.mjs <tone_users.json> [--after]
//   --after drops the six bare rules, to show what each element falls back to.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const postcss = require('postcss');
const parser = require('postcss-selector-parser');

const ROOT = process.cwd();
const usersFile = process.argv[2];
const AFTER = process.argv.includes('--after');
const TONES = ['ok', 'ai', 'warn', 'idle', 'dim', 'err'];
const PROPS = ['color', 'background', 'background-color'];

/* Every stylesheet under client/src. Order: index.css and client/src/styles load before the shell
   (main.tsx); app-v2.css is the shell's first sheet (V2App.tsx:86); every other sheet loads after it
   (V2App's later imports, and surface-imported sheets, including the lazy mdx/ and pdev/ chunks). */
function cssFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (n.endsWith('.css') && n !== 'surface-text-ramp.css') out.push(p);
  }
  return out;
}
const sheetRank = (rel) =>
  rel === 'client/src/index.css' || rel.startsWith('client/src/styles/') ? 0 : rel.endsWith('/v2/styles/app-v2.css') ? 1 : 2;

const BARE = new Set(TONES.map((t) => `.c2c-v2 .tone-${t}`));

/* Specificity of a selector node, :is/:not/:has as their most specific argument, :where as 0. */
function spec(sel) {
  let a = 0, b = 0, c = 0;
  sel.each((n) => {
    if (n.type === 'id') a++;
    else if (n.type === 'class' || n.type === 'attribute') b++;
    else if (n.type === 'tag' && n.value !== '*') c++;
    else if (n.type === 'pseudo') {
      const name = n.value.toLowerCase();
      if (name === ':where') return;
      if ([':is', ':not', ':has', ':matches'].includes(name)) {
        let best = [0, 0, 0];
        for (const s of n.nodes) {
          const x = spec(s);
          if (x[0] > best[0] || (x[0] === best[0] && (x[1] > best[1] || (x[1] === best[1] && x[2] > best[2])))) best = x;
        }
        a += best[0]; b += best[1]; c += best[2];
      } else if (name.startsWith('::') || [':before', ':after', ':first-letter', ':first-line'].includes(name)) c++;
      else b++;
    }
  });
  return [a, b, c];
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/* Does a compound (a run of nodes with no combinator) match an element with these classes, in its
   resting state? Returns null (no), or { ok: true, cond: [...] } with what it could not decide. */
function compoundMatches(nodes, classes) {
  const cond = [];
  for (const n of nodes) {
    if (n.type === 'class') { if (!classes.has(n.value)) return null; }
    else if (n.type === 'universal') { /* any */ }
    else if (n.type === 'tag') cond.push(n.value);
    else if (n.type === 'attribute') cond.push(`[${n.attribute}${n.operator ?? ''}${n.value ?? ''}]`);
    else if (n.type === 'pseudo') {
      const name = n.value.toLowerCase();
      if (name.startsWith('::') || [':hover', ':focus', ':focus-visible', ':focus-within', ':active', ':disabled', ':checked', ':visited', ':before', ':after', ':first-letter', ':placeholder-shown'].includes(name)) return null;
      if (name === ':not') {
        for (const s of n.nodes) {
          const m = compoundMatches(s.nodes, classes);
          if (m && m.cond.length === 0) return null;
          if (m) cond.push(`:not(${s.toString().trim()})`);
        }
      } else if ([':is', ':where', ':matches'].includes(name)) {
        let any = null;
        for (const s of n.nodes) {
          if (s.nodes.some((x) => x.type === 'combinator')) { any = any ?? { cond: [`${name}(complex)`] }; continue; }
          const m = compoundMatches(s.nodes, classes);
          if (m && (!any || m.cond.length < any.cond.length)) any = m;
        }
        if (!any) return null;
        cond.push(...any.cond);
      } else cond.push(name);
    }
  }
  return { cond };
}

const rows = JSON.parse(readFileSync(usersFile, 'utf8'));
const sheets = cssFiles(join(ROOT, 'client/src')).map((p) => ({ rel: relative(ROOT, p), css: readFileSync(p, 'utf8') }));
const RULES = [];
let pos = 0;
for (const { rel, css } of sheets) {
  const root = postcss.parse(css, { from: rel });
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const at = rule.parent?.type === 'atrule' ? rule.parent : rule.parent?.parent?.type === 'atrule' ? rule.parent.parent : null;
    const media = at ? `@${at.name} ${at.params}` : null;
    const decls = {};
    rule.each((d) => { if (d.type === 'decl' && PROPS.includes(d.prop)) decls[d.prop] = { value: d.value, important: d.important }; });
    if (!Object.keys(decls).length) return;
    /* CSS nesting: a nested rule's selector is relative to its parent rule's (misc-surfaces-v2.css
       wraps lines 6-592 in `.c2c-v2 { … }`). One level, as the sheets nest. */
    let selector = rule.selector;
    if (rule.parent?.type === 'rule') {
      const outer = rule.parent.selector;
      selector = selector.split(',').map((x) => (x.includes('&') ? x.replace(/&/g, outer) : `${outer} ${x.trim()}`)).join(', ');
    }
    let ast;
    try { ast = parser().astSync(selector); } catch { return; }
    ast.each((sel) => {
      RULES.push({ rel, line: rule.source.start.line, rank: sheetRank(rel), pos: pos++, sel, text: sel.toString().trim().replace(/\s+/g, ' '), media, decls });
    });
  });
}

function match(sel, classes) {
  /* subject compound = nodes after the last combinator */
  const nodes = sel.nodes;
  let i = nodes.length - 1;
  while (i >= 0 && nodes[i].type !== 'combinator') i--;
  const subject = nodes.slice(i + 1);
  /* a subject that names none of the element's classes (`textarea`, `*`, `.x :is(…)`) is not its rule */
  const named = (ns) => ns.some((n) => (n.type === 'class' && classes.has(n.value)) || (n.type === 'pseudo' && [':is', ':where', ':matches'].includes(n.value) && n.nodes.some((s) => named(s.nodes))));
  if (!named(subject)) return null;
  const m = compoundMatches(subject, classes);
  if (!m) return null;
  const context = nodes.slice(0, i + 1).map(String).join('').trim().replace(/\s+/g, ' ');
  return { cond: m.cond, context };
}

/* The values each `tone-${…}` site can write, read from its source (README, "What already exists").
   Only the six bare names matter; a site whose domain has none of them is not an element here. */
const DOMAIN = {
  'audit-chip': ['neutral', 'success', 'warn', 'accent'],          // mdx/data/pathwayTabs.ts AUDIT_KIND_META
  'cc-comm-dot': ['err', 'warn', 'ai', 'idle'],                     // v2/fixtures/commcenter.ts CC_TONE (+ 'idle')
  'cro-lc-dot': ['idle', 'ai', 'warn', 'ok'],                       // CroPortfolio.tsx CRO_LIFECYCLE
  'cro-pipe-n': ['idle', 'ai', 'warn', 'ok'],                       // CroPortfolio.tsx CRO_LIFECYCLE
  'cro-sow': ['ok', 'warn', 'idle'],                                // CroPortfolio.tsx SOW_TONE (+ 'idle')
  'cro-sow-banner': ['ok', 'warn', 'idle'],
  'dc-820-dot present': ['ok', 'err'],                              // DesignControlsTrace.tsx:547
  'dc-cell': ['ok', 'err', 'warn', 'idle'],                         // DesignControlsTrace.tsx DC_RESULT (+ 'idle')
  'dl-lead': ['good', 'calm'],                                      // DecisionLineage.tsx lead
  'dl-node': ['neutral', 'accent', 'info', 'warn'],                 // fixtures/decision-lineage-data.ts LINEAGE_NODE_TYPES
  'dl-node-ic': ['neutral', 'accent', 'info', 'warn'],
  'dl-node-type': ['neutral', 'accent', 'info', 'warn'],
  'dr2-find': ['error', 'warning', 'idle'],                         // DispatchReadiness.tsx SEV_TONE (+ 'idle')
  'dr2-find-sev': ['error', 'warning', 'idle'],
  'eng-blocker-dot': ['err', 'warn', 'low'],                        // Engineering/Udi severity; Postmarket tone
  'eng-blocker-dot critical err warn': ['err', 'warn'],
  'gi-auth': ['idle', 'warn', 'bad'],                               // fixtures/governed-intelligence-data.ts authority (+ 'warn')
  'hf-gate': ['err', 'ok', 'idle'],                                 // HumanFactors.tsx:606
  'hf-sev serious': ['err', 'warn', 'idle'],                        // HumanFactors.tsx:631
  'hf-mit': ['ok', 'err', 'idle'],                                  // HumanFactors.tsx:632
  'hf-el-dot': ['ok', 'idle'],                                      // HumanFactors.tsx:651
  'ivd-dot': ['done', 'review', 'draft', 'missing'],                // IvdReadinessBoard.tsx ivdTone / familyTone
  'ivd-fam': ['done', 'review', 'draft', 'missing'],
  'ivd-item-st': ['done', 'review', 'draft', 'missing'],
  'pdev-sev-dot': ['critical', 'high', 'medium', 'low'],            // pdev/data/types.ts PdevContradictionSeverity
  'riskmx-cell': ['err', 'warn', 'ok'],                             // RiskRegister.tsx zone()
  'rv-wf-tag approved current rejected': ['ok', 'warn', 'err', 'idle'], // Review.tsx:721
  'rv-wf-tag': ['ok', 'err', 'warn'],                               // Review.tsx:843
  'sc-verdict': ['ok', 'warn', 'err'],                              // SubmissionSeqWorkspaces.tsx Notice
  'sr-lead': ['urgent', 'calm', 'good'],                            // ShadowReview.tsx lead
  'sr-finding': ['error', 'warning', 'idle'],                       // fixtures/shadow-review-data.ts SR_SEV
  'sr-sev': ['error', 'warning', 'idle'],
};
/* The shell root each tree renders in: a rule scoped to it is not a context the element might miss. */
const ROOTS = { 'mdx/': '.mdx-shell' };

/* Elements: one per (base classes, tone). */
const els = new Map();
for (const r of rows) {
  const base = r.base.filter((b) => !TONES.includes(b) && !['error', 'critical'].includes(b));
  if (base.includes('rd-chip') || !base.length) continue;
  const dyn = DOMAIN[base.join(' ')];
  const tones = [...new Set([...r.tones.map((t) => t.slice(5)), ...(r.toneTemplate ? (dyn ?? TONES) : [])])].filter((t) => TONES.includes(t));
  if (!tones.length) continue; // reads a tone name but never writes a bare tone-* class
  for (const t of tones) {
    const key = `${base.join(' ')}|${t}`;
    if (!els.has(key)) els.set(key, { base, tone: t, sites: [] });
    els.get(key).sites.push(`${r.file.replace(/^client\/src\/concept2cure\//, '')}:${r.line}`);
  }
}

const out = [];
for (const { base, tone, sites } of els.values()) {
  const classes = new Set([...base, `tone-${tone}`]);
  const winners = {};
  for (const prop of ['color', 'background']) {
    const cands = [];
    for (const r of RULES) {
      if (AFTER && BARE.has(r.text)) continue;
      const d = prop === 'color' ? r.decls.color : r.decls['background-color'] ?? r.decls.background;
      if (!d) continue;
      const m = match(r.sel, classes);
      if (!m) continue;
      /* a context other than the shell root (light or dark) is reported */
      let ctx = m.context.replace(/^\.c2c-v2\s*/, '');
      for (const [tree, root] of Object.entries(ROOTS)) if (sites.every((x) => x.startsWith(tree)) && ctx === root) ctx = '';
      cands.push({ r, d, m, ctx, s: spec(r.sel) });
    }
    /* unconditional candidates (no extra context, no condition) decide the resting cascade */
    const plain = cands.filter((c) => !c.ctx && !c.m.cond.length && !c.r.media);
    plain.sort((x, y) => (x.d.important - y.d.important) || cmp(x.s, y.s) || x.r.rank - y.r.rank || x.r.pos - y.r.pos);
    const w = plain.at(-1);
    winners[prop] = {
      win: w ? `${w.r.text} (${w.s.join(',')}) ${w.r.rel.replace(/^client\/src\/concept2cure\//, '')}:${w.r.line} → ${w.d.value}` : '(inherited / none)',
      bare: !!w && BARE.has(w.r.text),
      ctx: cands.filter((c) => c.ctx || c.m.cond.length || c.r.media).map((c) => `${c.r.text} [${[c.ctx && 'ctx ' + c.ctx, c.m.cond.length && 'if ' + c.m.cond.join(' '), c.r.media].filter(Boolean).join('; ')}] ${c.r.rel.replace(/^client\/src\/concept2cure\//, '')}:${c.r.line} → ${c.d.value}`),
    };
  }
  out.push({ el: `.${base.join('.')}.tone-${tone}`, sites, ...winners });
}
out.sort((a, b) => a.el.localeCompare(b.el));
for (const o of out) {
  const flag = o.color.bare && o.background.bare ? 'BARE-WINS-BOTH' : o.color.bare ? 'BARE-WINS-COLOR' : o.background.bare ? 'BARE-WINS-FILL' : 'own';
  console.info(`${flag}\t${o.el}\t(${o.sites.length} site(s): ${o.sites.slice(0, 3).join(', ')}${o.sites.length > 3 ? ', …' : ''})`);
  console.info(`\tcolor:      ${o.color.win}`);
  console.info(`\tbackground: ${o.background.win}`);
  for (const c of [...new Set([...o.color.ctx, ...o.background.ctx])]) console.info(`\t  in context: ${c}`);
}
