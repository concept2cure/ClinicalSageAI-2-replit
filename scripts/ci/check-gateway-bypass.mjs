#!/usr/bin/env node
/**
 * Gateway-bypass guard.
 *
 * The governed AI gateway (server/services/ai-gateway) is the single point that
 * records model, prompt hash, temperature, seed, and the fallback chain for
 * every AI call. Direct LLM client instantiation outside the gateway escapes
 * that audit trail. This guard catches both language surfaces:
 *   - TypeScript/JavaScript: `new OpenAI(...)` / `new Anthropic(...)`
 *   - Python: `OpenAI(...)`, `openai.OpenAI(...)`, `Anthropic(...)`, the async
 *     variants, and the cloud SDK clients (AzureOpenAI, AnthropicBedrock,
 *     AnthropicVertex). Python has no `new` keyword, so the JS regex alone is
 *     blind to it — a Python agent framework (AutoGen/CrewAI/LangChain) or a
 *     sidecar script could otherwise open a second, unaudited egress path.
 *
 * ── What `new OpenAI(` alone could not see ──────────────────────────────────
 * Constructing an SDK client is one way to reach a provider. It is not the
 * common one here. A sweep found nine live, mounted routes reaching model
 * providers with no constructor in sight:
 *
 *   • raw HTTPS — `fetch('https://api.openai.com/v1/chat/completions')` in
 *     server/api/ai/routes.ts and server/routes/graphrag.ts, `axios.post` to
 *     api-inference.huggingface.co in server/huggingface-service.ts, `fetch` to
 *     api.cohere.com / api.voyageai.com in server/services/rag-reranker.ts;
 *   • a proxy with no hostname at all — LiteLLMAdapter posts to
 *     `${this.baseUrl}/chat/completions`, and aiProviderRouter makes the
 *     gateway the ELSE branch of `if (liteLLM.isEnabled())`, so one env flag
 *     diverts every routed call;
 *   • other vendors' SDKs — `new GoogleGenerativeAI(...)` on POST
 *     /api/ask-ana-ri and in nanoBananaService, neither of which the gateway
 *     even models as a provider;
 *   • and the escape the baseline itself created: openai-client.ts and
 *     anthropic-client.ts are baselined for CONSTRUCTING a client, so
 *     `getOpenAIClient().chat.completions.create(...)` in a file nobody
 *     baselined is an ungoverned call the guard was never looking for.
 *
 * So the patterns below match the CALL, not just the construction: provider
 * hostnames, provider REST paths (which catches the hostname-less proxy form),
 * a much wider constructor list, provider/wrapper module imports, and use of
 * the shared client factories outside the files that own them.
 *
 * This guard fails if a NEW file reaches a provider outside the gateway — i.e.
 * one not already in scripts/ci/gateway-bypass-baseline.json. It does not
 * force-migrate the baselined files; it stops the bypass surface from growing
 * and gives a burndown list. Removing a file from the baseline (by routing it
 * through the gateway) is encouraged.
 *
 * Usage: node scripts/ci/check-gateway-bypass.mjs
 * Exit code 1 on a new bypass.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'gateway-bypass-baseline.json');

const GATEWAY_DIR = 'server/services/ai-gateway/';

// TS/JS. Five patterns, each closing a hole the previous one left open.
const JS_PATTERNS = [
  // 1. Provider hostnames — raw fetch/axios/https egress.
  'https?://(api\\.openai\\.com|api\\.anthropic\\.com|generativelanguage\\.googleapis\\.com' +
    '|[a-z0-9-]+\\.openai\\.azure\\.com|bedrock-runtime\\.[a-z0-9-]+\\.amazonaws\\.com' +
    '|api\\.mistral\\.ai|api\\.cohere\\.(com|ai)|api\\.voyageai\\.com|openrouter\\.ai' +
    '|api\\.together\\.(ai|xyz)|api\\.groq\\.com|api\\.deepseek\\.com|api\\.perplexity\\.ai' +
    '|api\\.x\\.ai|api-inference\\.huggingface\\.co|router\\.huggingface\\.co)',
  // 2. Provider REST paths. Catches the proxy form that carries no hostname —
  //    `${this.baseUrl}/chat/completions`. Requires a SLASH before the path so
  //    the dotted SDK call `openai.chat.completions.create` does not match.
  //
  //    The generic names (messages, responses, embeddings, rerank) are ONLY
  //    matched under an explicit `/v1/`: this app has its own `/messages` and
  //    `/responses` routes (taskManagement.routes.ts:1295,
  //    manufacturing-routes.ts:890) and flagging those would put pure noise in
  //    the burndown list. `chat/completions` and `images/generations` are
  //    distinctive enough to match bare, which is what catches the LiteLLM
  //    proxy form.
  "[^A-Za-z0-9_.]/(chat/completions|images/generations)[\"'`?]",
  "[^A-Za-z0-9_.]/v1/(chat/completions|embeddings|messages|images/generations|responses|rerank)[\"'`?]",
  ':(generateContent|streamGenerateContent)',
  // 3. SDK constructors, well beyond OpenAI/Anthropic.
  'new (OpenAI|Anthropic|AzureOpenAI|AnthropicBedrock|AnthropicVertex|GoogleGenerativeAI|GoogleGenAI' +
    '|BedrockRuntimeClient|BedrockClient|CohereClientV2|CohereClient|MistralClient|Mistral|Groq|Replicate' +
    '|VertexAI|ChatOpenAI|ChatAnthropic|ChatGoogleGenerativeAI|OpenAIEmbeddings)[[:space:]]*\\(',
  '(createOpenAI|createAnthropic|createGoogleGenerativeAI|createAzure|createMistral)[[:space:]]*\\(',
  // 4. The shared-client escape hatch. openai-client.ts and anthropic-client.ts
  //    are baselined for CONSTRUCTING the client; baselining the constructor
  //    legitimised every downstream call, so match the calls too — both the
  //    direct form and the assign-then-call form.
  '(getOpenAIClient|getAnthropicClient)\\(\\)[[:space:]]*\\.[[:space:]]*(chat|messages|responses|completions|images)',
  '=[[:space:]]*get(Anthropic|OpenAI)Client[[:space:]]*\\(',
];
const JS_SEARCH_PATHS = ['server', 'services', 'workers', 'shared', 'scripts'];

/**
 * Files that legitimately name a provider, and are not bypasses.
 *
 * By PATH, not by pattern: narrowing the regexes to dodge these would make them
 * miss real calls of the same shape. The baselined client factories are NOT
 * here — they stay in the baseline so they remain visible as burndown.
 */
const NOT_A_BYPASS = [
  // Test files assert on the literal patterns and mock the SDK call shapes.
  /(^|\/)__tests__\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /^tests\//,
  // A Content-Security-Policy connect-src allowlist naming provider hosts.
  'server/middleware/enterprise-security.ts',
  // Doc comments in the canonical wrapper describe the call shape it replaces.
  'server/lib/unified-ai-client.ts',
  // Carries `openai.embeddings.create` as pattern data for a different gate.
  'scripts/ci/check-embedding-runtime-canonicality.mjs',
];
const isNotABypass = (f) =>
  NOT_A_BYPASS.some((m) => (typeof m === 'string' ? f === m : m.test(f)));

// Python: no `new`; a client is constructed by calling the class. Match both the
// bare (`OpenAI(`) and module-qualified (`openai.OpenAI(`) forms, plus the async
// and cloud-SDK client classes. Scoped to *.py so the JS/`.mjs` sources (which
// carry these names only as pattern data) are never matched.
const PY_CLIENTS =
  'OpenAI|AsyncOpenAI|AzureOpenAI|AsyncAzureOpenAI|Anthropic|AsyncAnthropic|AnthropicBedrock|AnthropicVertex';
const PY_PATTERN = `(^|[^A-Za-z0-9_.])(openai\\.|anthropic\\.)?(${PY_CLIENTS})[[:space:]]*\\(`;
const PY_SEARCH_PATHS = ['*.py'];

// This guard's own source + baseline contain the match pattern as data; they are
// not real client instantiations, so exclude them from the scan.
const SELF_EXCLUDE = new Set([
  'scripts/ci/check-gateway-bypass.mjs',
  'scripts/ci/gateway-bypass-baseline.json',
]);

function grepFiles(pattern, paths) {
  try {
    // execFileSync, not execSync: these patterns contain quotes and backticks
    // (a provider REST path can be followed by `"`, `'` or a template backtick),
    // and interpolating them into a shell string breaks on the first one. Passing
    // argv directly means the pattern is never parsed by a shell.
    return execFileSync('git', ['grep', '-lE', pattern, '--', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    // git grep exits 1 when there are no matches — treat as empty.
    if (err.status === 1) return '';
    throw err;
  }
}

function currentBypassFiles() {
  const out = [
    ...JS_PATTERNS.map((p) => grepFiles(p, JS_SEARCH_PATHS)),
    grepFiles(PY_PATTERN, PY_SEARCH_PATHS),
  ].join('\n');
  const seen = new Set(
    out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      // Source only. `git grep` happily matches a provider hostname in a README
      // or a JSON config; neither can call anything.
      .filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f))
      .filter(f => !f.startsWith(GATEWAY_DIR) && !SELF_EXCLUDE.has(f) && !isNotABypass(f)),
  );
  return [...seen];
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
// `entries` is a map of path -> { reason }. The old `allowed` array is still
// read so an older baseline does not silently become empty (which would flag
// every site as new); new entries must use `entries`, because an entry without
// a stated reason is a suppression nobody can review.
const allowed = new Set([...Object.keys(baseline.entries ?? {}), ...(baseline.allowed ?? [])]);
const unreasoned = Object.entries(baseline.entries ?? {})
  .filter(([, v]) => !v || typeof v.reason !== 'string' || v.reason.trim().length < 20)
  .map(([k]) => k);
if (unreasoned.length > 0) {
  console.error(
    `\n[check-gateway-bypass] baseline entries with no usable reason:\n  ${unreasoned.join('\n  ')}\n` +
      '  Every tolerated bypass needs a stated reason. An unexplained entry is a\n' +
      '  permission nobody can audit.\n'
  );
  process.exit(1);
}
const current = currentBypassFiles();

const added = current.filter(f => !allowed.has(f));
const removed = [...allowed].filter(f => !current.includes(f));

if (removed.length > 0) {
  console.info(
    `[check-gateway-bypass] ${removed.length} baselined file(s) no longer bypass the gateway — ` +
      `prune them from the baseline:\n  ${removed.join('\n  ')}`
  );
}

/* ── Governance must not be decided by directory depth ───────────────────────
 *
 * `server/openai-service.ts` routes every completion through getGateway().
 * `server/services/openai-service.ts` constructed its own provider client. Both
 * exported `generateStructuredResponse` and `analyzeText` — the same names, with
 * compatible-looking signatures. So whether an `import … from './openai-service'`
 * was audited depended on how deep in the tree the importing file sat: from
 * `server/services/`, `./` reached the ungoverned one and `../` the governed
 * one. One character, and nothing in review would show it.
 *
 * The bypass check above cannot see this. It matches per FILE, and a file that
 * merely IMPORTS a colliding name constructs no client, so it looks clean.
 *
 * The ungoverned module is deleted. This stops the shape returning: no basename
 * under server/ may exist both at the root and inside a subdirectory when the
 * root one is a governed AI entry point. A future sibling named
 * `openai-service.ts`, `anthropic-service.ts` or the like is a name collision
 * whose resolution is positional, and it fails here before it can be imported.
 */
const GOVERNED_ROOT_ENTRY_POINTS = ['openai-service', 'anthropic-service', 'ai-service'];

function collidingGovernedEntryPoints() {
  const out = [];
  for (const base of GOVERNED_ROOT_ENTRY_POINTS) {
    const rootFile = path.join(repoRoot, 'server', `${base}.ts`);
    let rootExists = true;
    try { readFileSync(rootFile); } catch { rootExists = false; }
    if (!rootExists) continue;
    let found = '';
    try {
      found = execFileSync(
        'find',
        [path.join(repoRoot, 'server'), '-mindepth', '2', '-name', `${base}.ts`],
        { encoding: 'utf8' }
      );
    } catch { found = ''; }
    for (const line of found.split('\n').map((l) => l.trim()).filter(Boolean)) {
      out.push(path.relative(repoRoot, line));
    }
  }
  return out;
}

const collisions = collidingGovernedEntryPoints();
if (collisions.length > 0) {
  console.error(
    `\n🚫 [check-gateway-bypass] ${collisions.length} module(s) shadow a governed root AI entry point:\n  ` +
      collisions.join('\n  ') +
      '\n'
  );
  console.error(
    'A sibling with the same basename as a governed root entry point makes governance positional:\n' +
      "  from server/services/, `./openai-service` and `../openai-service` are different modules\n" +
      '  with the same export names and opposite auditing. Rename it to say what it is\n' +
      '  (e.g. openai-direct-client.ts) and route its callers through getGateway().'
  );
  process.exit(1);
}

if (added.length > 0) {
  console.error(
    `\n🚫 [check-gateway-bypass] ${added.length} NEW gateway bypass(es) detected:\n  ${added.join('\n  ')}\n`
  );
  console.error(
    'Route AI calls through server/services/ai-gateway (getGateway) or the shared client so the\n' +
      'request is audited (model, prompt hash, temperature, seed, fallback chain). If a direct\n' +
      'client is genuinely required, justify it and add the file to scripts/ci/gateway-bypass-baseline.json.'
  );
  process.exit(1);
}

console.info(
  `[check-gateway-bypass] OK — no new bypasses (${current.length} baselined site(s) tolerated).`
);
