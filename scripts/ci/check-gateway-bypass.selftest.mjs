#!/usr/bin/env node
/**
 * Self-test for ci:gateway-bypass (scripts/ci/check-gateway-bypass.mjs).
 *
 * On the real tree the gate reports "OK — no new bypasses (8 baselined site(s)
 * tolerated)", so its failure branches never fire in normal use. A gate whose
 * failure branch has never been seen has not been tested (CLAUDE.md, working
 * agreement). This shows each one firing.
 *
 * Each case builds a throwaway git repository in a temp directory, writes the
 * fixture sources into it and `git add`s them (the gate scans with `git grep`,
 * which sees tracked files only), writes a baseline, and runs a copy of the
 * REAL gate whose `repoRoot` is patched to the fixture tree. Nothing else in
 * the gate is changed, so what is tested is the command CI runs.
 *
 * What is covered, by section below:
 *
 *   Defect shapes (must FAIL and name the file) — the shapes the gate's header
 *   names as the reason it was widened beyond the OpenAI/Anthropic constructor:
 *   raw HTTPS to a provider host (server/api/ai/routes.ts,
 *   server/huggingface-service.ts, rag-reranker.ts), the hostname-less proxy
 *   (LiteLLMAdapter), another vendor's SDK (GoogleGenerativeAI in
 *   nanoBananaService / ask-ana-ri), a provider-factory function from the
 *   Vercel AI SDK (pattern 3b, which no file in the real tree exercises), the
 *   shared-factory escape (a completion called on the OpenAI factory's result in
 *   a file nobody baselined, as EvidenceManagementService did until 2026-09-10),
 *   the Python surface, and a module shadowing each of the three governed root
 *   entry points (openai-service, anthropic-service, ai-service).
 *
 *   Fail-closed — when `git grep` itself errors (the tree is not a repository),
 *   the gate must crash, not report "OK". A gate that read every grep failure as
 *   "no matches" would pass any tree it could not read.
 *
 *   Baseline semantics — an `entries` item with a reason of 20+ characters
 *   suppresses; 19 characters, whitespace, or no reason fails; a stale entry is
 *   reported for pruning. The legacy `allowed` array is pinned as it behaves
 *   TODAY: it still suppresses, and the gate does NOT reason-check it. So "an
 *   entry without a reason fails" holds for `entries` only — `allowed` is a
 *   reasonless suppression channel. That is a gate gap, escalated to the gate
 *   owner, not a property this selftest endorses; when the gate closes it, the
 *   pinned case below should flip to expect exit 1.
 *
 *   Path exclusions, as PAIRS — every path the gate deliberately skips
 *   (NOT_A_BYPASS, SELF_EXCLUDE, the gateway directory) is shown quiet at the
 *   excluded path AND caught when the same text sits at an ordinary path. A
 *   quiet case alone proves nothing: it also passes when the text never matched
 *   a pattern, or when the path is outside every search path. (An earlier
 *   version of this file "tested" the ^tests/ exclusion with a .spec.ts file
 *   under tests/, which no JS pattern ever scans; each of the three test-file
 *   exclusions could be deleted without this selftest noticing.) Each test-file
 *   fixture here is covered by exactly one of the three exclusions.
 *
 *   Near-misses (must stay quiet) — the app's own `/messages` and `/responses`
 *   routes, a migration note in prose, provider display labels, methods named
 *   generateContent, Python that names a client class without constructing it,
 *   non-source files, the governed root module beside a properly renamed direct
 *   client, and the boundary guards on the REST-path and Python patterns: a
 *   provider path preceded by an identifier character or a dot (the app's own
 *   versioned routes, relative module imports, a gateway wrapper class named
 *   …OpenAI) and one followed by more path name (`-history`, `-index`). Each
 *   of those is quiet only because of the guard it is named for.
 *
 * NOT ASSERTED, reported to the gate owner instead. The same boundary guards
 * that keep the near-misses quiet also let real egress through, and this file
 * will not pin those as "quiet" — asserting exit 0 on a bypass would turn a
 * blind spot into a specification:
 *   - a proxy whose host is written literally but is not on the provider list
 *     (a LiteLLM container at port 4000, followed by the v1 chat-completions
 *     path), or a base URL followed by a vendor segment before v1 — the
 *     character before the slash is a digit or letter, so neither REST-path
 *     pattern fires;
 *   - provider sub-resources under a REST path (the Anthropic batches and
 *     count-tokens endpoints under v1 messages, a stored chat completion by
 *     id) — the closing guard rejects a following slash;
 *   - Python clients reached through a module alias (`import openai as oai`,
 *     then the client class called through oai) — the dot in the Python
 *     prefix guard excludes every qualifier but `openai.` and `anthropic.`;
 *     and through a renamed import (the class imported `as Client`, then
 *     Client called) — the call site never names the class at all.
 * Also: the gate's header lists "provider/wrapper module imports" among its
 * patterns; no such pattern exists in JS_PATTERNS, so there is nothing to test.
 *
 * The fixture text is assembled from fragments (F below). scripts/ is in the
 * gate's scan path and `.selftest.mjs` is not covered by its test-file
 * exclusion, so if this file's own text contained the shapes it writes, the
 * real gate would report this selftest as a new bypass. The last case puts this
 * file into a fixture tree and requires the gate to stay quiet on it.
 *
 * Usage:
 *   node scripts/ci/check-gateway-bypass.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-gateway-bypass.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:gateway-bypass:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-gateway-bypass.mjs');
const REASON = 'Selftest fixture: a written reason long enough to satisfy the gate.';

// The gate's threshold is `reason.trim().length < 20`. Probe both sides of it.
const REASON_19 = 'Latent; behind flag';
const REASON_20 = 'Latent; behind flags';
if (REASON_19.length !== 19 || REASON_20.length !== 20) {
  console.error(`${TAG} the threshold fixtures drifted: ${REASON_19.length} and ${REASON_20.length} characters, not 19 and 20.`);
  process.exit(1);
}

const ROOT_DECL = /const repoRoot = [^;]+;/;
const gateSrc = fs.readFileSync(GATE, 'utf8');
if (!ROOT_DECL.test(gateSrc)) {
  // Without this the patched copy would resolve repoRoot from its own location
  // and every case would be judging some other tree.
  console.error(`${TAG} cannot find \`const repoRoot = …;\` in ${GATE} — the selftest no longer knows how to point it at a fixture tree.`);
  process.exit(1);
}

/**
 * Hermetic git: no inherited GIT_DIR / GIT_INDEX_FILE (set when this runs from
 * a hook, and would make `git grep` read the real repository), no user or
 * system config, and no walking up out of the fixture directory.
 */
function gitEnv(ceiling) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_CEILING_DIRECTORIES: ceiling };
}

// Fragments, joined at runtime — see the header.
const F = {
  NEW: 'new',
  HOST_OPENAI: ['api', 'openai', 'com'].join('.'),
  HOST_ANTHROPIC: ['api', 'anthropic', 'com'].join('.'),
  HOST_HF: ['api-inference', 'huggingface', 'co'].join('.'),
  HOST_COHERE: ['api', 'cohere', 'com'].join('.'),
  HOST_VOYAGE: ['api', 'voyageai', 'com'].join('.'),
  CHAT: '/chat' + '/completions',
  V1: '/v1',
  V1_MESSAGES: '/v1' + '/messages',
  V1_EMBEDDINGS: '/v1' + '/embeddings',
  V1_RERANK: '/v1' + '/rerank',
  GEN: ':' + 'generateContent',
  GET_OPENAI: 'getOpenAI' + 'Client',
  GET_ANTHROPIC: 'getAnthropic' + 'Client',
  CREATE_OPENAI: 'create' + 'OpenAI',
  PY_OPENAI: 'Open' + 'AI',
};

const OK_ZERO = 'OK — no new bypasses (0 baselined site(s) tolerated)';
const ONE_NEW = '1 NEW gateway bypass(es) detected';

const OPENAI_FACTORY = `import OpenAI from 'openai';

let client: OpenAI | null = null;

export function ${F.GET_OPENAI}(): OpenAI {
  if (!client) client = ${F.NEW} OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
`;

const ANTHROPIC_FACTORY = `import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function ${F.GET_ANTHROPIC}(): Anthropic {
  if (!client) client = ${F.NEW} Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
`;

const LITELLM_ADAPTER = `export class LiteLLMAdapter {
  constructor(private baseUrl = process.env.LITELLM_BASE_URL ?? '') {}

  isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async execute(request: { messages: unknown[] }, model: string) {
    const response = await fetch(\`\${this.baseUrl}${F.CHAT}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: request.messages }),
    });
    return response.json();
  }
}
`;

/** The app's own routes — taskManagement.routes.ts:1464, manufacturing-routes.ts:869. */
const APP_MESSAGES_ROUTE = `router.post('/messages', async (req: Request, res: Response) => {
  const message = await taskMessages.create(req.body);
  res.json(message);
});
`;
const APP_RESPONSES_ROUTE = `export function registerManufacturingRoutes(router: Router) {
  router.get('/responses', async (req: Request, res: Response) => {
    res.json(await listCapaResponses(req.query));
  });
}
`;

/** Methods of the app that happen to be named generateContent (document-generator.ts, api/ai/routes.ts). */
const GENERATE_CONTENT_METHODS = `export class DocumentGenerator {
  generate(type: string, input: unknown) {
    const content = this.generateContent(type, input);
    return { content, suggestions: generateContentSuggestions(content, type) };
  }

  private generateContent(type: string, input: unknown): string {
    return \`\${type}: \${JSON.stringify(input)}\`;
  }
}

const generateContentSuggestions = (content: string, templateType: string): string[] => [templateType, content.slice(0, 40)];
`;

/** A governed root entry point: every call goes through getGateway(). */
const governedRoot = (fn) => `import { getGateway } from './services/ai-gateway/gateway';

export async function ${fn}(prompt: string) {
  return getGateway().complete({ messages: [{ role: 'user', content: prompt }], taskType: 'general' });
}

export async function analyzeText(text: string) {
  return ${fn}(text);
}
`;
const ROOT_GOVERNED_OPENAI_SERVICE = governedRoot('generateStructuredResponse');

/**
 * A path exclusion is proven only by a PAIR: the text is quiet at the excluded
 * path, and the same text is caught at an ordinary path. The control half is
 * what shows the quiet half is quiet because of the exclusion — not because
 * the text matches nothing, or sits outside every search path.
 */
function excludedPathPair({ why, excluded, control, content }) {
  return [
    {
      name: `FAILS — control for "${why}": the same text at ${control}`,
      files: { [control]: content },
      expectExit: 1,
      expectIn: [ONE_NEW, control],
    },
    {
      name: `quiet — ${why} (${excluded})`,
      files: { [excluded]: content },
      expectExit: 0,
      expectIn: [OK_ZERO],
    },
  ];
}

const cases = [
  // ── Defect shapes: each must FAIL and name the file ────────────────────────
  {
    name: 'FAILS on the original shape — an SDK client constructed outside the gateway',
    files: {
      'server/services/protocol-summarizer.ts': `import OpenAI from 'openai';

const openai = ${F.NEW} OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function summarizeProtocol(text: string) {
  const r = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: text }] });
  return r.choices[0]?.message?.content ?? '';
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/protocol-summarizer.ts'],
  },
  {
    name: 'FAILS on raw HTTPS to a provider host with no constructor in sight (server/api/ai/routes.ts)',
    files: {
      'server/api/ai/routes.ts': `router.post('/suggest', async (req, res) => {
  const r = await fetch('https://${F.HOST_OPENAI}${F.V1}${F.CHAT}', {
    method: 'POST',
    headers: { Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', messages: req.body.messages }),
  });
  res.json(await r.json());
});
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/api/ai/routes.ts'],
  },
  {
    name: 'FAILS on axios to the Hugging Face inference host (server/huggingface-service.ts)',
    files: {
      'server/huggingface-service.ts': `import axios from 'axios';

export async function embedWithHF(model: string, inputs: string[]) {
  const r = await axios.post(\`https://${F.HOST_HF}/pipeline/feature-extraction/\${model}\`, { inputs }, {
    headers: { Authorization: \`Bearer \${process.env.HUGGINGFACE_API_KEY}\` },
  });
  return r.data;
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/huggingface-service.ts'],
  },
  {
    name: 'FAILS on a reranker whose provider URLs live in a table, not in the fetch (rag-reranker.ts)',
    files: {
      'server/services/rag-reranker.ts': `const PROVIDERS = {
  cohere: { url: 'https://${F.HOST_COHERE}/v2/rerank' },
  voyage: { url: 'https://${F.HOST_VOYAGE}${F.V1_RERANK}' },
};

export class CrossEncoderReranker {
  constructor(private cfg: { provider: keyof typeof PROVIDERS; apiKey: string }) {}

  async score(query: string, documents: string[]) {
    const res = await fetch(PROVIDERS[this.cfg.provider].url, {
      method: 'POST',
      headers: { authorization: \`Bearer \${this.cfg.apiKey}\` },
      body: JSON.stringify({ query, documents }),
    });
    return res.json();
  }
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/rag-reranker.ts'],
  },
  {
    name: 'FAILS on the hostname-less proxy — `${this.baseUrl}` + chat-completions path (LiteLLMAdapter)',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/ai/LiteLLMAdapter.ts'],
  },
  {
    name: 'FAILS on a hostname-less /v1/messages proxy, beside the app route `/messages` that must stay quiet',
    files: {
      'server/services/ai/claude-proxy-adapter.ts': `export async function proxyMessages(body: unknown) {
  const res = await fetch(\`\${process.env.CLAUDE_PROXY_URL}${F.V1_MESSAGES}\`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}
`,
      'server/routes/taskManagement.routes.ts': APP_MESSAGES_ROUTE,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/ai/claude-proxy-adapter.ts'],
    expectNotIn: ['taskManagement.routes.ts'],
  },
  {
    name: "FAILS on another vendor's SDK the gateway does not model (GoogleGenerativeAI, nanoBananaService)",
    files: {
      'server/services/nanoBananaService.ts': `import { GoogleGenerativeAI } from '@google/generative-ai';

let _genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_genAI) _genAI = ${F.NEW} GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY ?? '');
  return _genAI;
}

export async function generateImage(prompt: string) {
  return getClient().getGenerativeModel({ model: 'gemini-2.5-flash-image' }).generateContent(prompt);
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/nanoBananaService.ts'],
  },
  {
    // Pattern 3b. No file in the real tree uses these factories, so this case is
    // the only thing that notices if the pattern is deleted. Nothing else in the
    // file matches: no `new`, no host, no REST path — only the factory call.
    name: 'FAILS on a provider factory with no `new` (Vercel AI SDK, @ai-sdk/openai)',
    files: {
      'server/services/ai/vercel-provider.ts': `import { ${F.CREATE_OPENAI} } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const oa = ${F.CREATE_OPENAI}({ apiKey: process.env.OPENAI_API_KEY });

export async function draftSynopsis(prompt: string) {
  const { text } = await generateText({ model: oa('gpt-4o'), prompt });
  return text;
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/ai/vercel-provider.ts'],
  },
  {
    name: 'FAILS on Gemini REST through a proxy base URL, beside methods named generateContent that must stay quiet',
    files: {
      'server/routes/ask-ana-ri.ts': `export async function askGemini(model: string, contents: unknown[]) {
  const url = \`\${process.env.GEMINI_PROXY_URL}/v1beta/models/\${model}${F.GEN}\`;
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ contents }) });
  return r.json();
}
`,
      'server/services/ana-biostats/document-generator.ts': GENERATE_CONTENT_METHODS,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/routes/ask-ana-ri.ts'],
    expectNotIn: ['document-generator.ts'],
  },
  {
    name: 'FAILS on the shared-factory escape — a call on getOpenAIClient\'s result in an unbaselined file, factory baselined',
    files: {
      'server/services/openai-client.ts': OPENAI_FACTORY,
      // EvidenceManagementService before 2026-09-10: uploaded customer files
      // straight to the provider through the baselined factory.
      'server/services/EvidenceManagementService.ts': `import { ${F.GET_OPENAI} } from './openai-client';

export async function extractEvidence(fileText: string) {
  const r = await ${F.GET_OPENAI}().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: fileText.slice(0, 4000) }],
  });
  return r.choices[0]?.message?.content ?? '';
}
`,
    },
    baseline: { 'server/services/openai-client.ts': { reason: REASON } },
    expectExit: 1,
    // Exactly one: the caller. The baselined factory is suppressed; baselining
    // the CONSTRUCTOR must not legitimise the calls.
    expectIn: [ONE_NEW, 'server/services/EvidenceManagementService.ts'],
    expectNotIn: ['server/services/openai-client.ts'],
  },
  {
    name: 'FAILS on the assign-then-call form — client assigned from getAnthropicClient, then client.messages…',
    files: {
      'server/services/anthropic-client.ts': ANTHROPIC_FACTORY,
      'server/services/label-drafter.ts': `import { ${F.GET_ANTHROPIC} } from './anthropic-client';

export async function draftLabel(section: string) {
  const client = ${F.GET_ANTHROPIC}();
  const msg = await client.messages.create({
    model: 'claude-opus-4-1',
    max_tokens: 1024,
    messages: [{ role: 'user', content: section }],
  });
  return msg.content;
}
`,
    },
    baseline: { 'server/services/anthropic-client.ts': { reason: REASON } },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/label-drafter.ts'],
    expectNotIn: ['server/services/anthropic-client.ts'],
  },
  {
    name: 'FAILS on a Python sidecar constructing OpenAI() — no `new` keyword for the JS patterns to see',
    files: {
      'services/agents/crew_runner.py': `import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def run(task: str) -> str:
    r = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": task}])
    return r.choices[0].message.content
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'services/agents/crew_runner.py'],
  },
  {
    name: 'FAILS on a module-qualified async Python client, outside every JS search path',
    files: {
      '.github/agents/regulatory-validator/agent.py': `import anthropic

client = anthropic.AsyncAnthropic()


async def review(section: str) -> str:
    msg = await client.messages.create(
        model="claude-opus-4-1", max_tokens=1024, messages=[{"role": "user", "content": section}]
    )
    return msg.content[0].text
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, '.github/agents/regulatory-validator/agent.py'],
  },
  {
    name: 'FAILS on a commented-out factory call — by design comments are not stripped (submission-twin-service, 2026-09-10)',
    files: {
      'server/services/submission-twin-service.ts': `import { aiComplete } from '../lib/unified-ai-client';

// Migrated 2026-09-10. Previously: const openai = ${F.GET_OPENAI}(); then a direct completion call.
export async function forecastReviewOutcome(prompt: string) {
  return aiComplete({ messages: [{ role: 'user', content: prompt }], max_tokens: 800 });
}
`,
    },
    expectExit: 1,
    expectIn: [ONE_NEW, 'server/services/submission-twin-service.ts'],
  },
  {
    name: 'FAILS when a module shadows a governed root entry point (server/services/openai-service.ts)',
    files: {
      'server/openai-service.ts': ROOT_GOVERNED_OPENAI_SERVICE,
      // Same export names, no provider call of its own — the per-file bypass
      // scan sees nothing here; only the collision check can.
      'server/services/openai-service.ts': `import { LiteLLMAdapter } from './ai/LiteLLMAdapter';

const adapter = new LiteLLMAdapter();

export async function generateStructuredResponse(prompt: string) {
  return adapter.execute({ messages: [{ role: 'user', content: prompt }] }, 'gpt-4o');
}

export async function analyzeText(text: string) {
  return generateStructuredResponse(text);
}
`,
    },
    expectExit: 1,
    expectIn: ['1 module(s) shadow a governed root AI entry point', 'server/services/openai-service.ts'],
  },
  {
    name: 'FAILS when a module shadows the governed root anthropic-service.ts',
    files: {
      'server/anthropic-service.ts': governedRoot('generateClaudeResponse'),
      'server/services/anthropic-service.ts': `export async function generateClaudeResponse(prompt: string) {
  return { text: prompt, governed: false };
}
`,
    },
    expectExit: 1,
    expectIn: ['1 module(s) shadow a governed root AI entry point', 'server/services/anthropic-service.ts'],
  },
  {
    name: 'FAILS when a module two levels down shadows the governed root ai-service.ts',
    files: {
      'server/ai-service.ts': governedRoot('generateCompletion'),
      'server/services/ai/ai-service.ts': `export async function generateCompletion(prompt: string) {
  return { text: prompt, governed: false };
}
`,
    },
    expectExit: 1,
    expectIn: ['1 module(s) shadow a governed root AI entry point', 'server/services/ai/ai-service.ts'],
  },

  // ── Fail closed ────────────────────────────────────────────────────────────
  {
    // No `git init`: every `git grep` exits 128 ("not a git repository"). The
    // gate treats only exit 1 as "no matches" and must rethrow anything else.
    // A gate that swallowed this would report OK on a tree holding a bypass.
    name: 'FAILS CLOSED when git grep itself errors (not a repository) — never "OK" on a tree it could not read',
    git: false,
    files: { 'server/services/protocol-summarizer.ts': `const openai = ${F.NEW} OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n` },
    expectExit: 1,
    expectIn: ['Command failed: git grep'],
    expectNotIn: ['OK — no new bypasses'],
  },

  // ── Baseline semantics ─────────────────────────────────────────────────────
  {
    name: 'quiet — a known bypass baselined with a written reason is tolerated',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    baseline: { 'server/services/ai/LiteLLMAdapter.ts': { reason: REASON } },
    expectExit: 0,
    expectIn: ['OK — no new bypasses (1 baselined site(s) tolerated)'],
  },
  {
    name: 'quiet — a reason of exactly 20 characters is accepted (the threshold is < 20)',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    baseline: { 'server/services/ai/LiteLLMAdapter.ts': { reason: REASON_20 } },
    expectExit: 0,
    expectIn: ['OK — no new bypasses (1 baselined site(s) tolerated)'],
  },
  {
    name: 'FAILS on a baseline entry whose reason is 19 characters — one short of the threshold',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    baseline: { 'server/services/ai/LiteLLMAdapter.ts': { reason: REASON_19 } },
    expectExit: 1,
    expectIn: ['baseline entries with no usable reason', 'server/services/ai/LiteLLMAdapter.ts'],
  },
  {
    name: 'FAILS on a baseline entry whose reason is too short to review',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    baseline: { 'server/services/ai/LiteLLMAdapter.ts': { reason: 'legacy proxy' } },
    expectExit: 1,
    expectIn: ['baseline entries with no usable reason', 'server/services/ai/LiteLLMAdapter.ts'],
  },
  {
    name: 'FAILS on baseline entries with no reason at all, or only whitespace',
    files: {
      'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER,
      'server/services/openai-client.ts': OPENAI_FACTORY,
    },
    baseline: {
      'server/services/ai/LiteLLMAdapter.ts': {},
      'server/services/openai-client.ts': { reason: ' '.repeat(40) },
    },
    expectExit: 1,
    expectIn: [
      'baseline entries with no usable reason',
      'server/services/ai/LiteLLMAdapter.ts',
      'server/services/openai-client.ts',
    ],
  },
  {
    // PINNED, NOT ENDORSED — see the header. The gate still reads the legacy
    // `allowed` array (so an old baseline does not flag every site as new) and
    // never applies the reason check to it. This case fails if legacy support
    // is removed unnoticed; it should flip to expectExit 1 when the gate starts
    // refusing reasonless `allowed` entries.
    name: 'pinned gap — a path in the legacy `allowed` array suppresses with NO reason check',
    files: { 'server/services/ai/LiteLLMAdapter.ts': LITELLM_ADAPTER },
    baselineFile: { description: 'selftest fixture (legacy shape)', allowed: ['server/services/ai/LiteLLMAdapter.ts'] },
    expectExit: 0,
    expectIn: ['OK — no new bypasses (1 baselined site(s) tolerated)'],
  },
  {
    name: 'reports a baselined file that no longer bypasses, so it can be pruned (graphrag.ts migrated)',
    files: {
      'server/routes/graphrag.ts': `import { aiComplete } from '../lib/unified-ai-client';

// The direct provider call this route used to make is gone; it now goes
// through the governed gateway.
export async function answer(question: string) {
  return aiComplete({ messages: [{ role: 'user', content: question }], max_tokens: 600 });
}
`,
    },
    baseline: { 'server/routes/graphrag.ts': { reason: REASON } },
    expectExit: 0,
    expectIn: ['1 baselined file(s) no longer bypass the gateway', 'server/routes/graphrag.ts', 'OK — no new bypasses'],
  },

  // ── Path exclusions, each proven by a pair ─────────────────────────────────
  // Each of the three test-file fixtures is covered by exactly ONE of the three
  // test-file exclusions, so deleting any one of them fails its own pair.
  ...excludedPathPair({
    why: 'a `.test.ts` file asserting on the provider call shape (only the .test/.spec exclusion covers it)',
    excluded: 'server/services/provider-call-shape.test.ts',
    control: 'server/services/provider-call-shape.ts',
    content: `vi.mock('openai', () => ({ default: vi.fn() }));
const client = ${F.NEW} OpenAI({ apiKey: 'test' });
expect(fetchMock).toHaveBeenCalledWith('https://${F.HOST_OPENAI}${F.V1}${F.CHAT}', expect.anything());
`,
  }),
  ...excludedPathPair({
    why: 'a mock helper under __tests__/ with no .test suffix (only the __tests__/ exclusion covers it)',
    excluded: 'server/__tests__/helpers/mock-openai.ts',
    control: 'server/helpers/mock-openai.ts',
    content: `import OpenAI from 'openai';

export function mockOpenAI() {
  return ${F.NEW} OpenAI({ apiKey: 'test', baseURL: 'http://127.0.0.1:0' });
}
`,
  }),
  ...excludedPathPair({
    // The *.py pathspec DOES reach tests/, unlike the JS search paths — this is
    // the one place the ^tests/ exclusion decides anything.
    why: 'a Python test client under tests/ (only the ^tests/ exclusion covers it)',
    excluded: 'tests/agents/test_client.py',
    control: 'scripts/agents/test_client.py',
    content: `from openai import ${F.PY_OPENAI}

client = ${F.PY_OPENAI}(api_key="test", base_url="http://127.0.0.1:0")


def test_client_is_constructed():
    assert client is not None
`,
  }),
  ...excludedPathPair({
    why: 'the CSP connect-src allowlist naming provider hosts',
    excluded: 'server/middleware/enterprise-security.ts',
    control: 'server/middleware/security-headers.ts',
    content: `export const cspDirectives = {
  connectSrc: ["'self'", 'https://${F.HOST_OPENAI}', 'https://${F.HOST_ANTHROPIC}'],
};
`,
  }),
  ...excludedPathPair({
    why: 'doc comments in the canonical wrapper quoting the call shape it replaces',
    excluded: 'server/lib/unified-ai-client.ts',
    control: 'server/lib/unified-ai-client-legacy.ts',
    content: `/**
 * Unified AI Client — drop-in replacement for direct OpenAI calls.
 *
 * Before:
 *   const openai = ${F.NEW} OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   const result = await openai.chat.completions.create({ model: 'gpt-4o', messages });
 *
 * After:
 *   const text = await ai.complete(messages, { maxTokens: 2000 });
 */
import { getGateway } from '../services/ai-gateway/gateway';

export const ai = { complete: (messages: unknown[]) => getGateway().complete({ messages, taskType: 'general' }) };
`,
  }),
  ...excludedPathPair({
    why: 'another gate carrying provider call shapes as pattern data',
    excluded: 'scripts/ci/check-embedding-runtime-canonicality.mjs',
    control: 'scripts/ci/check-embedding-callers.mjs',
    content: `/**
 * Flags direct embedding calls, e.g. a fetch to https://${F.HOST_OPENAI}${F.V1_EMBEDDINGS}
 * or \`${F.NEW} OpenAIEmbeddings({ model })\` from a LangChain integration.
 */
const DIRECT_EMBEDDING_PATTERNS = [/\\bopenai\\.embeddings\\.create\\s*\\(/, /\\.embeddings\\.create\\s*\\(/];
export default DIRECT_EMBEDDING_PATTERNS;
`,
  }),
  ...excludedPathPair({
    // SELF_EXCLUDE: the gate's header and pattern list carry the shapes as data.
    // The text is the gate under test, so this follows the gate as it changes.
    why: "the gate's own source, which carries every shape as data",
    excluded: 'scripts/ci/check-gateway-bypass.mjs',
    control: 'scripts/ci/check-gateway-bypass.copy.mjs',
    content: gateSrc,
  }),
  ...excludedPathPair({
    // The control is a SIBLING directory sharing the prefix without the slash,
    // so a gate that matched `startsWith('…/ai-gateway')` would let it through.
    why: 'the gateway itself constructs the provider client',
    excluded: 'server/services/ai-gateway/providers/openai-provider.ts',
    control: 'server/services/ai-gateway-providers/openai-provider.ts',
    content: `import OpenAI from 'openai';

export const openaiProvider = ${F.NEW} OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://${F.HOST_OPENAI}${F.V1}',
});
`,
  }),

  // ── Near-misses a sloppier gate would flag: each must stay quiet ───────────
  {
    name: "quiet — the app's own /messages and /responses routes (no /v1/ prefix)",
    files: {
      'server/routes/taskManagement.routes.ts': APP_MESSAGES_ROUTE,
      'server/routes/manufacturing-routes.ts': APP_RESPONSES_ROUTE,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    // Only the `[^A-Za-z0-9_.]` prefix guard keeps these quiet: in each, the
    // provider path is preceded by a letter (`/api/ai`, `/api`) or a dot (a
    // relative module path), and is followed by a quote the suffix accepts.
    name: 'quiet — app routes and relative imports ending in a provider path (prefix guard: letter or dot before the slash)',
    files: {
      'server/routes/ai/index.ts': `import { Router } from 'express';
import { completionsHandler } from '.${F.CHAT}';

export const aiRouter = Router();
// The app's own OpenAI-compatible endpoint; the handler calls getGateway().
aiRouter.post('/api/ai${F.CHAT}', completionsHandler);
`,
      'server/routes/index.ts': `import type { Express } from 'express';
import { messagesRouter } from '.${F.V1_MESSAGES}';

export function registerV1Routes(app: Express) {
  app.use('/api${F.V1_MESSAGES}', messagesRouter);
}
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    // Only the closing `["'\`?]` guard keeps these quiet: the provider path is
    // preceded by a quote (which the prefix accepts) and followed by more name.
    name: 'quiet — app routes that extend a provider path with more name (suffix guard: -history, -index)',
    files: {
      'server/routes/ai-history.routes.ts': `router.get('${F.CHAT}-history', async (req: Request, res: Response) => {
  res.json(await listGatewayAuditRows(req.query));
});
`,
      'server/routes/vector-index.routes.ts': `router.get('${F.V1_EMBEDDINGS}-index', async (_req: Request, res: Response) => {
  res.json(await vectorIndexStatus());
});
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    // Only the Python prefix guard keeps this quiet: the client class name is
    // the tail of a longer identifier, both in the class statement and the call.
    name: 'quiet — a Python gateway wrapper class whose name ends in OpenAI (Python prefix guard)',
    files: {
      'services/agents/gateway_llm.py': `from concept2cure.gateway import GatewayChatModel


class Governed${F.PY_OPENAI}(GatewayChatModel):
    """Routes every completion through the governed gateway; holds no provider key."""

    provider = "openai"


llm = Governed${F.PY_OPENAI}(task_type="general")
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — a file migrated onto aiComplete whose note names the old call in prose and the dotted SDK form',
    files: {
      'server/services/EvidenceManagementService.ts': `import { aiComplete } from '../lib/unified-ai-client';

/**
 * Until 2026-09-10 this method sent 4,000 characters of an uploaded file
 * straight to \`gpt-4o\` via \`getOpenAIClient()\`, which meant the gateway's
 * PII/PHI classifier never saw it. The old \`openai.chat.completions.create()\`
 * call is replaced by aiComplete, which routes to the governed gateway.
 */
export async function extractEvidence(fileText: string) {
  return aiComplete({ messages: [{ role: 'user', content: fileText.slice(0, 4000) }], max_tokens: 2000 });
}
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: "quiet — provider display labels like 'OpenAI (GPT)' in a .ts file (the Python pattern is *.py only)",
    files: {
      'shared/constants/ai-provider-options.ts': `export const PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI (GPT)', description: 'OpenAI GPT models.' },
  { id: 'anthropic', label: 'Anthropic (Claude)', description: 'Anthropic Claude models.' },
  { id: 'azure', label: 'AzureOpenAI (private cloud)', description: 'Azure-hosted OpenAI.' },
] as const;
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — app methods named generateContent (the Gemini REST pattern needs the colon)',
    files: { 'server/services/ana-biostats/document-generator.ts': GENERATE_CONTENT_METHODS },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — Python that is handed a client and names the class without constructing it',
    files: {
      'ingestion/summarise.py': `from openai import OpenAI


def summarise(client: OpenAI, text: str) -> str:
    if not isinstance(client, OpenAI):
        raise TypeError("expected an injected client")
    r = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": text}])
    return r.choices[0].message.content
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — provider hosts in a README and a JSON config (source files only)',
    files: {
      'server/README.md': `The legacy route called https://${F.HOST_OPENAI}${F.V1}${F.CHAT} directly; it now uses the gateway.\n`,
      'server/config/ai-providers.json': `{ "openai": { "baseUrl": "https://${F.HOST_OPENAI}${F.V1}" } }\n`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — the governed root module next to the renamed direct client the gate recommends',
    files: {
      'server/openai-service.ts': ROOT_GOVERNED_OPENAI_SERVICE,
      'server/services/openai-direct-client.ts': `export function describeDirectClient() {
  return 'renamed so that importing it is a decision, not a path accident';
}
`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: 'quiet — a nested ai-service.ts when no root ai-service.ts exists to be shadowed',
    files: {
      'server/services/ai-service.ts': `export const aiServiceName = 'nested, with no governed root sibling';\n`,
    },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
  {
    name: "quiet — this selftest's own source, which lives in the gate's scan path",
    files: { 'scripts/ci/check-gateway-bypass.selftest.mjs': fs.readFileSync(SELF, 'utf8') },
    expectExit: 0,
    expectIn: [OK_ZERO],
  },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-bypass-selftest-'));

function runCase(c, index) {
  const caseDir = path.join(tmp, `case-${index}`);
  const repo = path.join(caseDir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const env = gitEnv(caseDir);
  const git = (...args) => execFileSync('git', args, { cwd: repo, env, stdio: 'pipe' });

  if (c.git !== false) git('init', '-q');
  for (const [rel, content] of Object.entries(c.files)) {
    const full = path.join(repo, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  if (c.git !== false) git('add', '-A');

  const baselineDir = path.join(repo, 'scripts', 'ci');
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(
    path.join(baselineDir, 'gateway-bypass-baseline.json'),
    JSON.stringify(c.baselineFile ?? { description: 'selftest fixture', entries: c.baseline ?? {} }, null, 2),
  );

  const gatePath = path.join(caseDir, 'gate.mjs');
  fs.writeFileSync(gatePath, gateSrc.replace(ROOT_DECL, `const repoRoot = ${JSON.stringify(repo)};`));
  try {
    const out = execFileSync(process.execPath, [gatePath], { env, encoding: 'utf8', stdio: 'pipe', timeout: 20_000 });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.status == null ? String(err) : ''}` };
  }
}

let failed = 0;
try {
  cases.forEach((c, i) => {
    let code;
    let out;
    try {
      ({ code, out } = runCase(c, i));
    } catch (err) {
      // A fixture that could not be built (git missing, disk full) is a failed
      // case, reported as such — not an abort that skips the rest.
      code = null;
      out = `fixture setup threw: ${err && err.stack ? err.stack : String(err)}`;
    }
    const missing = c.expectIn.filter((s) => !out.includes(s));
    const unwanted = (c.expectNotIn ?? []).filter((s) => out.includes(s));
    const ok = code === c.expectExit && missing.length === 0 && unwanted.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
    if (!ok) {
      failed++;
      if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
      for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
      for (const s of unwanted) console.log(`      output should not name: ${JSON.stringify(s)}`);
      console.log(out.trim().split('\n').map((l) => `      | ${l}`).join('\n'));
    }
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
  const shown = GATE.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, GATE) : GATE;
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold against ${shown}.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
