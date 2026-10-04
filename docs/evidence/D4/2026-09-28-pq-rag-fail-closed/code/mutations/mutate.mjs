// Mutation pass for the PQ rag fail-closed fix. Each mutation is applied to the
// finished file, the suite that should catch it is run, and the file is restored
// byte-for-byte (sha256 compared before moving on). A mutation that does not
// apply exactly once aborts the run: a mutation that silently did not apply
// would read as "survived" or "killed" for the wrong reason.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const REPO = '/home/user/ClinicalSageAI-2-replit';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const VITEST = ['npx', ['vitest', 'run', 'server/eval/pq/', '--maxWorkers=2']];
const NODETEST = ['node', ['--test', 'tests/ops/verify-rag-corpus.test.mjs']];

const V = 'server/eval/pq/pq-verdict.ts';
const R = 'server/eval/pq/run-pq.ts';
const S = 'scripts/verify-rag-corpus.mjs';
const T = 'tests/ops/verify-rag-corpus.test.mjs';

const mutations = [
  // ── pq-verdict.ts ──
  ['M1 ragFindings dropped from the verdict (E6 as it was)', V, '    ...ragF.incomplete,\n', '', VITEST],
  ['M2 unverified items count toward the criteria', V, 'const counted = rag.items.filter((i) => !hasError(i) && i.servedModelVerified);', 'const counted = rag.items.filter((i) => !hasError(i));', VITEST],
  ['M3 no sample floor applied', V, 'const floor = isFloor(c.criteria.minScoredItems) ? c.criteria.minScoredItems : undefined;', 'const floor = undefined;', VITEST],
  ['M4 a protocol without a floor is accepted', V, "    out.push('the protocol sets no rag sample floor (criteria.minScoredItems), so no number of scored items could qualify the component');\n", '', VITEST],
  ['M5 repeated itemIds accepted', V, '    else if (seen.has(id)) repeated.add(id);\n', '', VITEST],
  ['M6 controls inferred again (unkeyed positive items dropped silently)', V, 'const unkeyed = answered.filter((i) => !i.negativeControl && i.hit === null);', 'const unkeyed: PqRagResult[] = [];', VITEST],
  ['M7 unjudged positive items dropped silently', V, 'const unjudged = answered.filter((i) => !i.negativeControl && i.faithfulness === null);', 'const unjudged: PqRagResult[] = [];', VITEST],
  ['M8 any number is a score (NaN, 5, -1, Infinity)', V, "const isUnitScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;", "const isUnitScore = (v: unknown): v is number => typeof v === 'number';", VITEST],
  ['M9 ran read by truthiness', V, "  if (rag && typeof rag.ran !== 'boolean') return", '  if (false) return', VITEST],
  ['M10 servedModelVerified not type-checked', V, "  if (typeof i.servedModelVerified !== 'boolean') {", '  if (false) {', VITEST],
  ['M11 unknown criteria keys ignored', V, '    if (!(RAG_CRITERIA as readonly string[]).includes(key)) {', '    if (false) {', VITEST],
  ['M12 missing or non-numeric minimums skipped', V, '    if (!isUnitScore(c[key])) {', '    if (false) {', VITEST],
  ['M13 unmeasured components dropped', V, '    ...unmeasuredComponents(protocol),\n', '', VITEST],
  ['M14 itemsScored not checked against the items', V, '  if (rag.itemsScored !== scored.length) {', '  if (false) {', VITEST],
  ['M15 a control may carry a hit', V, '  if (i.negativeControl === true && i.hit !== null && i.hit !== undefined) {', '  if (false) {', VITEST],
  ['M16 faithfulness excludes judged controls', V, "const faith = ragCriterion('rag faithfulness', c.criteria.minFaithfulness, floor, counted, (i) => i.faithfulness);", "const faith = ragCriterion('rag faithfulness', c.criteria.minFaithfulness, floor, counted.filter((i) => !i.negativeControl), (i) => i.faithfulness);", VITEST],
  ['M17 a criterion measured on 0 items is met', V, '  if (values.length === 0) {\n    return {\n      incomplete: [`${label} was measured on 0 items', '  if (values.length === 0) {\n    return { incomplete: [], missed: [] };\n    return {\n      incomplete: [`${label} was measured on 0 items', VITEST],
  ['M18 OVERCORRECTION: rag always INCOMPLETE when executable', V, '  const criteriaProblems = ragCriteriaProblems(c.criteria);\n', "  const criteriaProblems = [...ragCriteriaProblems(c.criteria), 'rag: always incomplete'];\n", VITEST],
  ['M19 OVERCORRECTION: rag judged even when not executable', V, '  if (!c?.required || !c.executable) return { incomplete: [], missed: [] };\n\n  const criteriaProblems', '  if (!c?.required) return { incomplete: [], missed: [] };\n\n  const criteriaProblems', VITEST],
  // ── run-pq.ts ──
  ['R1 the protocolPath seam restored', R, "  const protocolText = readFileSync(path.join(HERE, 'pq-protocol.json'), 'utf8');", "  const protocolText = readFileSync((opts as { protocolPath?: string }).protocolPath ?? path.join(HERE, 'pq-protocol.json'), 'utf8');", VITEST],
  ['R2 the rag record not handed to the verdict', R, '  const { verdict, reasons } = computeVerdict(protocol, generation, extraction, rag);', '  const { verdict, reasons } = computeVerdict(protocol, generation, extraction);', VITEST],
  ['R3 OVERCORRECTION: a fabricated rag run recorded', R, "  return { ran: false, notRunReason: RAG_NOT_RUN_REASON, itemsScored: 0, items: [] };", "  return { ran: true, itemsScored: 1, items: [{ itemId: 'x', negativeControl: false, servedModel: 'm', servedModelVerified: true, hit: 1, faithfulness: 1 }] };", VITEST],
  // ── verify-rag-corpus.mjs ──
  ['V1 RESULT line claims a retrievable corpus without saying completeness is unchecked', S, "    '          This is a non-empty preflight: completeness against the guidance-corpus manifest is NOT checked.',\n", '', NODETEST],
  ['V2 headline back to "the store the PQ rag component reads"', S, "'RAG PQ evaluation corpus — the store a PQ rag run will read (vault arm, this organization) once run-eval is tenant-scoped',", "'RAG PQ evaluation corpus — the store the PQ rag component reads',", NODETEST],
  ['V3 an empty corpus exits 0', S, '  if (corpus.embeddedChunks === 0) {', '  if (false) {', NODETEST],
  ['V4 exit code applied before the pool closes', S, '      await pool.end();\n      // Applied after', '      if (exitCode !== undefined) process.exitCode = exitCode;\n      await pool.end();\n      exitCode = undefined;\n      // Applied after', NODETEST],
  ['V5 counted predicate drifts from the vault arm', S, "  'c.embedding IS NOT NULL',\n", "  'c.embedding IS NOT NULL AND c.chunk_text <> \\'\\'',\n", NODETEST],
  ['V6 every tenant counted (org predicate dropped from the count)', S, '   WHERE ${EMBEDDED}\n     AND ${IN_ORG}`;', '   WHERE ${EMBEDDED}\n     AND $1::uuid IS NOT NULL`;', NODETEST],
  ['V7 OVERCORRECTION: always exit 1', S, '  return done(0, body);', '  return done(1, body);', NODETEST],
  // ── the drift pin itself (the test's checker must be two-sided) ──
  ['T1 the drift checker passes everything', T, "  const body = vaultArmBody(source);\n  if (!body) return", "  return [];\n  const body = vaultArmBody(source);\n  if (!body) return", NODETEST],
  ['T2 OVERCORRECTION: the drift checker fails everything', T, "  const body = vaultArmBody(source);\n  if (!body) return", "  return ['always'];\n  const body = vaultArmBody(source);\n  if (!body) return", NODETEST],
];

const out = [];
let survived = 0;
for (const [name, file, from, to, [cmd, args]] of mutations) {
  const p = `${REPO}/${file}`;
  const orig = readFileSync(p);
  const before = sha(orig);
  const text = orig.toString('utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${name}: the mutation applies ${count} times, not once`);
  writeFileSync(p, text.replace(from, to));
  let r;
  try {
    r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout: 240000 });
  } finally {
    writeFileSync(p, orig);
  }
  const after = sha(readFileSync(p));
  if (after !== before) throw new Error(`${name}: restore failed (${before} → ${after})`);
  const log = `${r.stdout}\n${r.stderr}`;
  const failing = cmd === 'npx'
    ? [...new Set(log.split('\n').filter((l) => /^\s*(FAIL|×)\s/.test(l)).map((l) => l.trim()))]
    : log.split('\n').filter((l) => /^not ok /.test(l));
  const killed = r.status !== 0 && failing.length > 0;
  if (!killed) survived++;
  out.push(`== ${name}  [${file}]`);
  out.push(`   ${killed ? 'KILLED' : 'SURVIVED'} (exit ${r.status}); restored sha256 ${after.slice(0, 16)}… = original`);
  for (const f of failing.slice(0, 8)) out.push(`     ${f}`);
  if (failing.length > 8) out.push(`     … ${failing.length - 8} more`);
  const summary = log.split('\n').filter((l) => /Tests\s+\d|^# (pass|fail)/.test(l)).map((l) => l.trim());
  for (const l of summary) out.push(`   ${l}`);
}
out.push('', `${mutations.length} mutations, ${mutations.length - survived} killed, ${survived} survived`);
console.info(out.join('\n'));
