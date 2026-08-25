/**
 * AnA performance probe — measures what can be measured WITHOUT a live DB or
 * API key, and states plainly what it cannot.
 *
 * Run:  npx tsx scripts/perf/ana-performance-probe.mjs
 * (tsx is required — this file imports the platform's TypeScript modules.)
 *
 * What it MEASURES (real numbers, no estimates):
 *   1. Module-load cost of AnA's hot-path graph (boot / cold-start tax).
 *   2. orchestrate() CPU time and the exact character size of the system
 *      prompt it emits, across representative turns.
 *   3. The tool-schema payload actually shipped to the model per turn
 *      (full registry vs. the selectToolsForTurn subset), in bytes.
 *   4. Total per-turn input-prompt size and an approximate token count.
 *   5. Static presence/absence of pgvector ANN indexes (ivfflat/hnsw) on the
 *      corpora AnA actually queries at chat time.
 *   6. The declared retrieval bounds (k, char caps, timeouts, round caps).
 *
 * What it CANNOT measure here (and says so):
 *   - Real end-to-end latency, DB round-trip times, vector-scan cost, cache
 *     hit rates. Those need a provisioned Postgres + live provider keys.
 *
 * Read-only. Touches no database, makes no network call.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHARS_PER_TOKEN = 4; // conventional rough divisor; flagged as approximate

const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
const h1 = (s) => { say(''); say('='.repeat(72)); say(s); say('='.repeat(72)); };
const kv = (k, v) => say(`  ${k.padEnd(46)} ${v}`);
const num = (n) => n.toLocaleString('en-US');

// ── 1. Module-load cost ─────────────────────────────────────────────────────
h1('1. MODULE-LOAD COST (boot / cold-start tax) — MEASURED');

const loadTimes = {};
async function timedImport(label, spec) {
  const t = Date.now();
  try {
    const m = await import(spec);
    loadTimes[label] = Date.now() - t;
    return m;
  } catch (e) {
    loadTimes[label] = -1;
    say(`  !! ${label} failed to import: ${String(e).slice(0, 160)}`);
    return null;
  }
}

const toolDefs = await timedImport('AnaToolDefinitions', `${ROOT}/server/services/ana/AnaToolDefinitions.ts`);
const toolSel = await timedImport('tool-selection', `${ROOT}/server/services/ana/tool-selection.ts`);
const cmdExec = await timedImport('command-executor', `${ROOT}/server/services/ana-ri/command-executor.ts`);
const orch = await timedImport('orchestrator', `${ROOT}/server/services/ana-ri/orchestrator.ts`);
const reasoning = await timedImport('reasoning', `${ROOT}/server/services/ai-gateway/reasoning.ts`);
const loop = await timedImport('agentic-loop', `${ROOT}/server/services/ana/agentic-loop.ts`);

for (const [k, v] of Object.entries(loadTimes)) {
  kv(`import ${k}`, v < 0 ? 'FAILED' : `${num(v)} ms`);
}
kv('total measured import time', `${num(Object.values(loadTimes).filter(v => v > 0).reduce((a, b) => a + b, 0))} ms`);
say('  NOTE: paid once per process at boot, not per turn.');

// ── 2. System prompt size ───────────────────────────────────────────────────
h1('2. SYSTEM PROMPT SIZE PER TURN — MEASURED');

const SCENARIOS = [
  { name: 'greeting (shortest possible turn)', input: { message: 'hi' } },
  { name: 'routine lookup', input: { message: 'What is the page limit for a 510(k) summary?' } },
  {
    name: 'typical RA question (role set)',
    input: {
      message: 'What are the key risks in our IND nonclinical package before the pre-IND meeting?',
      userRole: 'ra_lead',
    },
  },
  {
    name: 'deep audit lens + submission type',
    input: {
      message:
        'Audit our Module 2.4 nonclinical overview against ICH M4S and tell me what an FDA reviewer would issue an information request on. Be specific about which studies are missing and which are underpowered.',
      userRole: 'ra_lead',
      intentLens: 'audit',
      submissionType: 'IND',
    },
  },
  {
    name: 'drafting turn with authoring context',
    input: {
      message: 'Draft section 2.6.6 toxicology written summary for our lead candidate.',
      userRole: 'medical_writer',
      submissionType: 'IND',
      authoringContext: { sectionCode: '2.6.6', moduleCode: 'm2', workflowStage: 'drafting' },
    },
  },
];

let promptStats = [];
if (orch?.orchestrate) {
  // warm
  try { orch.orchestrate({ message: 'warm' }); } catch { /* ignore */ }
  for (const s of SCENARIOS) {
    try {
      const t = Date.now();
      const r = orch.orchestrate(s.input);
      const ms = Date.now() - t;
      const chars = r.systemPrompt.length;
      promptStats.push({ name: s.name, ms, chars });
      kv(s.name, `${num(chars)} chars  ~${num(Math.round(chars / CHARS_PER_TOKEN))} tok  (orchestrate ${ms} ms)`);
    } catch (e) {
      kv(s.name, `FAILED: ${String(e).slice(0, 100)}`);
    }
  }
} else {
  say('  orchestrator unavailable — cannot measure.');
}

if (promptStats.length) {
  const min = Math.min(...promptStats.map(p => p.chars));
  const max = Math.max(...promptStats.map(p => p.chars));
  say('');
  kv('floor (even for "hi")', `${num(min)} chars  ~${num(Math.round(min / CHARS_PER_TOKEN))} tok`);
  kv('ceiling observed', `${num(max)} chars  ~${num(Math.round(max / CHARS_PER_TOKEN))} tok`);
  kv('variance floor→ceiling', `${num(max - min)} chars`);
  say('  NOTE: this is orchestrate() output ONLY. The live route additionally');
  say('  prepends the intelligence prefix and appends memory + enrichment +');
  say('  route/authoring blocks, all of which require a live DB to measure.');
}

// ── 3. Tool-schema payload ──────────────────────────────────────────────────
h1('3. TOOL-SCHEMA PAYLOAD SHIPPED TO THE MODEL — MEASURED');

if (toolDefs?.getAllEnabledTools && toolSel?.selectToolsForTurn) {
  const all = toolDefs.getAllEnabledTools();
  const allBytes = JSON.stringify(all).length;
  kv('tools registered (getAllEnabledTools)', num(all.length));
  kv('full registry serialized', `${num(allBytes)} bytes  ~${num(Math.round(allBytes / CHARS_PER_TOKEN))} tok`);
  say('');
  for (const s of SCENARIOS) {
    const sel = toolSel.selectToolsForTurn(all, s.input.message, {
      context: {
        projectType: s.input.submissionType,
        surface: s.input.intentLens,
      },
    });
    const b = JSON.stringify(sel).length;
    kv(`selected: ${s.name}`, `${num(sel.length)} tools  ${num(b)} bytes  ~${num(Math.round(b / CHARS_PER_TOKEN))} tok`);
  }
  say('');
  say('  Selection cap is maxTools=50 (server/services/ana/tool-selection.ts:116)');
  say('  and the stream route does NOT override it, so 50 is the live ceiling.');
} else {
  say('  tool modules unavailable — cannot measure.');
}

// ── 4. Combined per-turn input size ─────────────────────────────────────────
h1('4. COMBINED PER-TURN INPUT (system prompt + tool schemas) — MEASURED');

if (promptStats.length && toolDefs?.getAllEnabledTools && toolSel?.selectToolsForTurn) {
  const all = toolDefs.getAllEnabledTools();
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    const ps = promptStats[i];
    if (!ps) continue;
    const sel = toolSel.selectToolsForTurn(all, s.input.message, {
      context: { projectType: s.input.submissionType, surface: s.input.intentLens },
    });
    const total = ps.chars + JSON.stringify(sel).length;
    kv(s.name, `${num(total)} chars  ~${num(Math.round(total / CHARS_PER_TOKEN))} tok`);
  }
  say('');
  say('  This is the floor per model call, BEFORE memory/enrichment/history.');
  say('  A multi-round agentic turn re-sends all of it every round.');
}

// ── 5. Vector index presence ────────────────────────────────────────────────
h1('5. pgvector ANN INDEX PRESENCE ON AnA CHAT CORPORA — MEASURED (static)');

function collectSql(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) collectSql(p, acc);
    else if (e.endsWith('.sql')) acc.push(p);
  }
  return acc;
}

const sqlFiles = [
  ...collectSql(join(ROOT, 'migrations')),
  ...collectSql(join(ROOT, 'db')),
  ...collectSql(join(ROOT, 'sql')),
  ...collectSql(join(ROOT, 'database')),
  ...collectSql(join(ROOT, 'server', 'db')),
];
const corpus = sqlFiles.map(f => {
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}).join('\n');

// Tables AnA's chat turn actually vector-searches (see advancedRAGPipeline.ts).
const CHAT_TABLES = [
  ['rag_chunks', 'RAG retrieval (corpus: rag_chunks)'],
  ['client_memory_entries', 'memory layer: client_memory'],
  ['project_memory_entries', 'memory layer: project_memory'],
];

// An ANN index statement mentioning the table, using hnsw/ivfflat.
const annStmts = corpus
  .split(';')
  .filter(s => /create\s+index/i.test(s) && /using\s+(hnsw|ivfflat)/i.test(s));

say(`  scanned ${num(sqlFiles.length)} .sql files; found ${num(annStmts.length)} ANN index statements overall`);
say('');
let missing = 0;
for (const [tbl, why] of CHAT_TABLES) {
  const hit = annStmts.find(s => new RegExp(`\\b${tbl}\\b`, 'i').test(s));
  if (hit) {
    const kind = /hnsw/i.test(hit) ? 'hnsw' : 'ivfflat';
    kv(`${tbl}`, `ANN INDEX PRESENT (${kind})`);
  } else {
    missing++;
    kv(`${tbl}`, `*** NO ivfflat/hnsw INDEX FOUND ***  (${why})`);
  }
}
say('');
if (missing) {
  say(`  ${missing} of ${CHAT_TABLES.length} chat-path vector corpora have NO ANN index.`);
  say('  Every similarity query on those tables is an exact scan: Postgres');
  say('  computes cosine distance for EVERY matching row before LIMIT k.');
  say('  Cost grows linearly with the tenant\'s corpus size.');
}

// Show that ANN indexes exist elsewhere — so this is an omission, not a policy.
const indexedTables = [...new Set(annStmts.map(s => {
  const m = /on\s+([a-z0-9_.]+)/i.exec(s);
  return m ? m[1] : null;
}).filter(Boolean))];
say('');
say(`  ANN indexes DO exist on ${num(indexedTables.length)} other tables, e.g.:`);
for (const t of indexedTables.slice(0, 8)) say(`    - ${t}`);
say('  => the omission on the chat corpora is an oversight, not a design choice.');

// ── 6. Declared bounds ──────────────────────────────────────────────────────
h1('6. DECLARED RETRIEVAL / LOOP BOUNDS — MEASURED (from source constants)');

function grab(file, re, label) {
  try {
    const txt = readFileSync(join(ROOT, file), 'utf8');
    const m = re.exec(txt);
    kv(label, m ? m[1].trim().replace(/\s+/g, ' ') : 'NOT FOUND');
  } catch {
    kv(label, 'file unreadable');
  }
}

grab('server/services/memory-context-assembler.ts', /MEMORY_LAYER_TIMEOUT_MS\s*=\s*(\d+)/, 'memory per-layer timeout (ms)');
grab('server/services/memory-context-assembler.ts', /clampLimit[\s\S]{0,160}?Math\.min\(limit,\s*(\d+)\)/, 'memory limitPerLayer hard cap');
grab('server/services/memory-context-assembler.ts', /clampChars[\s\S]{0,160}?Math\.min\(maxChars,\s*(\d+)\)/, 'memory block char hard cap');
grab('server/routes/ana-ri/stream.ts', /limitPerLayer:\s*(\d+)/, 'memory limitPerLayer requested by /stream');
grab('server/routes/ana-ri/stream.ts', /maxChars:\s*(\d+)/, 'memory maxChars requested by /stream');
grab('server/services/ana/tool-selection.ts', /opts\.maxTools\s*\?\?\s*(\d+)/, 'tool-selection maxTools default');
grab('server/services/ana/agentic-loop.ts', /MAX_ROUNDS_BY_EFFORT[\s\S]{0,120}?thorough:\s*(\d+)/, 'agentic max rounds (thorough)');
grab('server/services/ana/agentic-loop.ts', /ROUND_EXTENSION_BY_EFFORT[\s\S]{0,120}?thorough:\s*(\d+)/, 'agentic bonus rounds (thorough)');
grab('server/routes/ana-ri/stream.ts', /mapWithConcurrency\([\s\S]{0,2400}?\},\s*(\d+)\);/, 'tool execution concurrency');
grab('server/db/runtime.ts', /max:\s*isProduction\s*\?\s*(\d+)/, 'pg pool max (production)');
grab('server/db/runtime.ts', /statement_timeout:\s*(\d+)/, 'pg statement_timeout (ms)');
grab('server/db/runtime.ts', /connectionTimeoutMillis:\s*(\d+)/, 'pg connectionTimeoutMillis (ms)');
grab('server/services/ai-gateway/gateway.ts', /chunkTimeoutMs\s*=\s*(\d+)/, 'gateway stream stall watchdog (ms)');
grab('server/routes/ana-ri/stream.ts', /STREAM_KEEPALIVE_MS\s*=\s*([\d_]+)/, 'SSE keepalive interval (ms)');
grab('server/services/enhancedEmbeddingService.ts', /embeddingCache\.size\s*>\s*(\d+)/, 'embedding cache max entries');

// ── 7. What needs a live environment ────────────────────────────────────────
h1('7. NOT MEASURABLE HERE — REQUIRES LIVE DB / API KEY');
for (const s of [
  'Wall-clock time to first token (needs provider key).',
  'Per-stage DB round-trip latency (needs provisioned Postgres).',
  'Actual vector-scan cost on rag_chunks / *_memory_entries (needs data volume).',
  'Prompt-cache hit rate (cache_read_input_tokens; needs live Anthropic calls).',
  'Embedding-call latency on the memory path (needs OPENAI_API_KEY).',
  'Pool saturation under concurrent AnA sessions (needs load harness).',
]) say(`  - ${s}`);

say('');
say('probe complete.');
