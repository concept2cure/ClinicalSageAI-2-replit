// The Messages API contract the stand-in enforces: every request the real API
// is documented to refuse is refused here, with the API's status and wording.
// validate() returns the refusal, or null for a request the API would take;
// thinks() says whether a real model would stream a thinking block first.
// Used by stand-in-model.mjs; each rule is made to fail by selftest.mjs.

// ── The Messages API contract, as documented (fetched 2026-09-28) ─────────────
// Sources: claude-api skill shared/models.md, shared/error-codes.md,
// shared/prompt-caching.md; live docs api/messages, build-with-claude/effort,
// build-with-claude/mid-conversation-system-messages, prompt-caching.
// A rule is here only when one of those says the API refuses it.
const EFFORT_ALL = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_NO_XHIGH = ['low', 'medium', 'high', 'max'];
const OLD = { inline: false, effort: null, noAdaptive: true, maxOut: 64000 };
const MODELS = {
  'claude-fable-5-1': { inline: true, adaptiveOnly: true, noDisable: true, noSampling: true, noForcedTool: true, noPrefill: true, effort: EFFORT_ALL, maxOut: 128000, thinksByDefault: true },
  'claude-fable-5': { inline: true, adaptiveOnly: true, noDisable: true, noSampling: true, noPrefill: true, effort: EFFORT_ALL, maxOut: 128000, thinksByDefault: true },
  'claude-opus-5-5': { inline: true, adaptiveOnly: true, noDisable: true, noSampling: true, noForcedTool: true, effort: EFFORT_ALL, maxOut: 128000, thinksByDefault: true },
  'claude-opus-5': { inline: true, adaptiveOnly: true, disableOnlyUpToHigh: true, noSampling: true, effort: EFFORT_ALL, maxOut: 128000, thinksByDefault: true },
  'claude-opus-4-8': { inline: true, adaptiveOnly: true, noSampling: true, effort: EFFORT_ALL, maxOut: 128000 },
  'claude-opus-4-7': { inline: false, adaptiveOnly: true, noSampling: true, effort: EFFORT_ALL, maxOut: 128000 },
  'claude-opus-4-6': { inline: false, effort: EFFORT_NO_XHIGH, maxOut: 128000 },
  'claude-sonnet-5': { inline: false, adaptiveOnly: true, noSampling: true, effort: EFFORT_ALL, maxOut: 128000, thinksByDefault: true },
  'claude-sonnet-4-6': { inline: false, effort: EFFORT_NO_XHIGH, maxOut: 128000 },
  'claude-opus-4-5': { inline: false, effort: ['low', 'medium', 'high'], maxOut: 64000 },
  'claude-opus-4-5-20251101': { inline: false, effort: ['low', 'medium', 'high'], maxOut: 64000 },
  'claude-sonnet-4-5': OLD, 'claude-sonnet-4-5-20250929': OLD,
  'claude-haiku-4-5': OLD, 'claude-haiku-4-5-20251001': OLD,
  'claude-sonnet-4-0': OLD, 'claude-sonnet-4-20250514': OLD,
  'claude-opus-4-0': { ...OLD, maxOut: 32000 }, 'claude-opus-4-20250514': { ...OLD, maxOut: 32000 },
};
// Retired (models.md): the Claude 3 family and Claude 2; Opus 4.1 retired 2026-08-05.
const RETIRED = /^claude-(2|instant|3[-.]|opus-4-1)/;
const TOP_KEYS = ['model', 'max_tokens', 'messages', 'system', 'stream', 'tools', 'tool_choice', 'temperature', 'top_p', 'top_k', 'thinking', 'output_config', 'metadata', 'stop_sequences', 'service_tier', 'container', 'mcp_servers', 'context_management', 'inference_geo'];
const BLOCK_KEYS = {
  text: ['type', 'text', 'cache_control', 'citations'],
  image: ['type', 'source', 'cache_control'],
  document: ['type', 'source', 'title', 'context', 'citations', 'cache_control'],
  tool_use: ['type', 'id', 'name', 'input', 'cache_control', 'caller'],
  tool_result: ['type', 'tool_use_id', 'content', 'is_error', 'cache_control'],
  thinking: ['type', 'thinking', 'signature'],
  redacted_thinking: ['type', 'data'],
};
const CUSTOM_TOOL_KEYS = ['type', 'name', 'description', 'input_schema', 'cache_control', 'strict', 'eager_input_streaming', 'defer_loading', 'input_examples', 'allowed_callers'];
const refuse = (message, status = 400, type = 'invalid_request_error') => ({ status, type, message });

/** The first refusal a list of checks returns, or null. */
function firstRefusal(checks) {
  for (const check of checks) {
    const refusal = check();
    if (refusal) return refusal;
  }
  return null;
}

/** A key outside `allowed`, refused the way the API refuses it. */
function extraKey(obj, allowed, prefix) {
  const key = Object.keys(obj).find(k => !allowed.includes(k));
  return key === undefined ? null : refuse(`${prefix}${key}: Extra inputs are not permitted`);
}

/** Counts a cache breakpoint; an empty text block cannot carry one. */
function countCache(block, where, cache) {
  if (!block || !block.cache_control) return null;
  cache.marks += 1;
  if (block.type === 'text' && !String(block.text ?? '').trim()) return refuse(`${where}: cache_control cannot be set for empty text blocks`);
  return null;
}

const isEffortOnly = m => m.role === 'system' && Array.isArray(m.content) && m.content.length === 0;
const blockIds = (m, type, key) => (m && Array.isArray(m.content) ? m.content.filter(b => b.type === type).map(b => b[key]) : []);
const emptyMessage = p => refuse(`${p}: all messages must have non-empty content except for the optional final assistant message`);

function checkRequest(body) {
  const extra = extraKey(body, TOP_KEYS, '');
  if (extra) return extra;
  const id = body.model;
  if (typeof id !== 'string' || !id) return refuse('model: Field required');
  if (RETIRED.test(id) || !MODELS[id]) return refuse(`model: ${id}`, 404, 'not_found_error');
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) return refuse('max_tokens: Input should be a positive integer');
  const maxOut = MODELS[id].maxOut;
  if (body.max_tokens > maxOut) return refuse(`max_tokens: ${body.max_tokens} > ${maxOut}, which is the maximum allowed number of output tokens for ${id}`);
  if (!Array.isArray(body.messages) || body.messages.length === 0) return refuse('messages: at least one message is required');
  return null;
}

function checkSystemBlock(block, where, cache) {
  if (block.type !== 'text') return refuse(`${where}.type: Input should be 'text'`);
  const extra = extraKey(block, BLOCK_KEYS.text, `${where}.`);
  if (extra) return extra;
  if (!String(block.text ?? '').trim()) return refuse(`${where}: text content blocks must be non-empty`);
  return countCache(block, where, cache);
}

function checkSystemPrompt(body, cache) {
  if (body.system === undefined || typeof body.system === 'string') return null;
  if (!Array.isArray(body.system)) return refuse('system: Input should be a valid string or list');
  return firstRefusal(body.system.map((block, j) => () => checkSystemBlock(block, `system.${j}`, cache)));
}

// error-codes.md: "First message is `assistant`" -> 400. (An effort-only
// system message may sit anywhere, so it does not count as first.)
function checkFirstMessage(msgs) {
  const first = msgs.find(m => !isEffortOnly(m));
  return first && first.role === 'assistant' ? refuse('messages: first message must use the "user" role') : null;
}

function checkSystemPlacement(msgs, i) {
  const p = `messages.${i}`;
  if (i === 0) return refuse(`${p}: a system message that carries content cannot be the first entry in messages`);
  if (msgs[i - 1].role !== 'user') return refuse(`${p}: a system message must immediately follow a user turn (it follows ${msgs[i - 1].role})`);
  const next = msgs[i + 1];
  if (next && next.role !== 'assistant') return refuse(`${p}: a system message must precede an assistant turn or end the array (it precedes ${next.role})`);
  if (Array.isArray(msgs[i].content) && msgs[i].content.some(b => b.type !== 'text')) return refuse(`${p}.content: a system message is text-only`);
  return null;
}

function checkSystemTurn(msgs, i, M, betas) {
  const m = msgs[i];
  const p = `messages.${i}`;
  if (!M.inline) return refuse(`${p}: role 'system' is not supported on this model`);
  if (m.clear_at !== undefined && !betas.includes('mid-conversation-system-clear-at-2026-08-21')) return refuse(`${p}.clear_at: Extra inputs are not permitted`);
  if (m.output_config !== undefined && !betas.includes('mid-conversation-output-config-2026-07-01')) return refuse(`${p}.output_config: Extra inputs are not permitted`);
  return isEffortOnly(m) ? null : checkSystemPlacement(msgs, i);
}

function checkBlock(block, role, where, cache) {
  const keys = BLOCK_KEYS[block?.type];
  if (!keys) return refuse(`${where}.type: unknown content block type '${block?.type}'`);
  const extra = extraKey(block, keys, `${where}.`);
  if (extra) return extra;
  if (block.type === 'text' && !String(block.text ?? '').trim()) return refuse(`${where}: text content blocks must be non-empty`);
  if (role !== 'assistant' && ['tool_use', 'thinking', 'redacted_thinking'].includes(block.type)) return refuse(`${where}: ${block.type} blocks are only valid in assistant messages`);
  if (role !== 'user' && block.type === 'tool_result') return refuse(`${where}: tool_result blocks are only valid in user messages`);
  return countCache(block, where, cache);
}

function checkContent(m, p, last, cache) {
  const finalAssistant = last && m.role === 'assistant';
  if (typeof m.content === 'string') return !m.content.trim() && !finalAssistant ? emptyMessage(p) : null;
  if (!Array.isArray(m.content)) return refuse(`${p}.content: Input should be a valid string or list`);
  if (m.content.length === 0 && m.role !== 'system' && !finalAssistant) return emptyMessage(p);
  return firstRefusal(m.content.map((block, j) => () => checkBlock(block, m.role, `${p}.content.${j}`, cache)));
}

function checkPairing(msgs, i) {
  const m = msgs[i];
  if (!Array.isArray(m.content)) return null;
  const p = `messages.${i}`;
  if (m.role === 'assistant' && i < msgs.length - 1) {
    const answered = new Set(msgs[i + 1].role === 'user' ? blockIds(msgs[i + 1], 'tool_result', 'tool_use_id') : []);
    const missing = blockIds(m, 'tool_use', 'id').filter(u => !answered.has(u));
    if (missing.length) return refuse(`${p}: tool_use ids were found without tool_result blocks immediately after: ${missing.join(', ')}. Each tool_use block must have a corresponding tool_result block in the next message.`);
  }
  if (m.role === 'user') {
    const used = new Set(msgs[i - 1]?.role === 'assistant' ? blockIds(msgs[i - 1], 'tool_use', 'id') : []);
    const orphans = blockIds(m, 'tool_result', 'tool_use_id').filter(r => !used.has(r));
    if (orphans.length) return refuse(`${p}: unexpected tool_use_id found in tool_result blocks: ${orphans.join(', ')}. Each tool_result block must have a corresponding tool_use block in the previous message.`);
  }
  return null;
}

function checkMessage(msgs, i, M, betas, cache) {
  const m = msgs[i];
  const p = `messages.${i}`;
  if (!m || typeof m !== 'object') return refuse(`${p}: Input should be an object`);
  const allowed = m.role === 'system' ? ['role', 'content', 'clear_at', 'output_config'] : ['role', 'content'];
  return firstRefusal([
    () => extraKey(m, allowed, `${p}.`),
    () => (['user', 'assistant', 'system'].includes(m.role) ? null : refuse(`${p}.role: Input should be 'user', 'assistant' or 'system'`)),
    () => (m.role === 'system' ? checkSystemTurn(msgs, i, M, betas) : null),
    () => checkContent(m, p, i === msgs.length - 1, cache),
    () => checkPairing(msgs, i),
  ]);
}

function checkTool(tool, where, cache, toolNames) {
  if (typeof tool?.name !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.name)) return refuse(`${where}.name: String should match pattern '^[a-zA-Z0-9_-]{1,128}$' (got ${JSON.stringify(tool?.name)})`);
  if (toolNames.has(tool.name)) return refuse(`tools: Tool names must be unique (${tool.name})`);
  toolNames.add(tool.name);
  if (tool.type === undefined || tool.type === 'custom') {
    const extra = extraKey(tool, CUSTOM_TOOL_KEYS, `${where}.custom.`);
    if (extra) return extra;
    const schema = tool.input_schema;
    if (!schema || typeof schema !== 'object' || schema.type !== 'object') return refuse(`${where}.custom.input_schema.type: Input should be 'object'`);
  }
  return countCache(tool, where, cache);
}

function checkTools(body, cache, toolNames) {
  if (body.tools === undefined) return null;
  if (!Array.isArray(body.tools)) return refuse('tools: Input should be a valid list');
  return firstRefusal(body.tools.map((tool, j) => () => checkTool(tool, `tools.${j}`, cache, toolNames)));
}

function checkToolChoice(body, M, toolNames) {
  const tc = body.tool_choice;
  if (tc === undefined) return null;
  if (!tc || !['auto', 'any', 'tool', 'none'].includes(tc.type)) return refuse("tool_choice.type: Input should be 'auto', 'any', 'tool' or 'none'");
  if (tc.type !== 'none' && toolNames.size === 0) return refuse('tool_choice: may only be specified while providing tools');
  if ((tc.type === 'any' || tc.type === 'tool') && M.noForcedTool) return refuse('tool_choice: type "tool" and "any" are not supported for this model.');
  if (tc.type === 'tool' && !toolNames.has(tc.name)) return refuse(`tool_choice.name: no tool named ${tc.name}`);
  return null;
}

function checkSampling(body, M) {
  const sampling = ['temperature', 'top_p', 'top_k'].filter(k => body[k] !== undefined);
  if (M.noSampling && sampling.length) return refuse(`${sampling[0]}: sampling parameters are not supported on ${body.model}`);
  if (body.temperature !== undefined && !(body.temperature >= 0 && body.temperature <= 1)) return refuse('temperature: Input should be between 0 and 1');
  return null;
}

function checkBudgetThinking(body, M) {
  const budget = body.thinking.budget_tokens;
  if (M.adaptiveOnly) return refuse('"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.');
  if (!Number.isInteger(budget) || budget < 1024) return refuse('thinking.enabled.budget_tokens: Input should be greater than or equal to 1024');
  if (budget >= body.max_tokens) return refuse('`max_tokens` must be greater than `thinking.budget_tokens`');
  if (body.temperature !== undefined && body.temperature !== 1) return refuse('`temperature` may only be set to 1 when thinking is enabled');
  if (body.top_k !== undefined) return refuse('`top_k` is not supported when thinking is enabled');
  if (body.top_p !== undefined && !(body.top_p >= 0.95 && body.top_p <= 1)) return refuse('`top_p` must be between 0.95 and 1 when thinking is enabled');
  return null;
}

function checkThinkingOff(body, M) {
  const effort = body.output_config?.effort;
  if (M.noDisable) return refuse('"thinking.type.disabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.');
  if (M.disableOnlyUpToHigh && (effort === 'xhigh' || effort === 'max')) return refuse('thinking.type.disabled is not supported at effort xhigh or max on this model');
  return null;
}

function checkThinking(body, M) {
  const th = body.thinking;
  if (th === undefined) return null;
  if (!th || !['enabled', 'disabled', 'adaptive'].includes(th.type)) return refuse("thinking.type: Input should be 'enabled', 'disabled' or 'adaptive'");
  const extra = extraKey(th, ['type', 'budget_tokens', 'display'], 'thinking.');
  if (extra) return extra;
  if (th.type === 'enabled') return checkBudgetThinking(body, M);
  if (th.type === 'disabled') return checkThinkingOff(body, M);
  return M.noAdaptive ? refuse('"thinking.type.adaptive" is not supported for this model.') : null;
}

function checkEffort(body, M) {
  const effort = body.output_config?.effort;
  if (effort === undefined) return null;
  if (!M.effort) return refuse(`output_config.effort: effort is not supported on ${body.model}`);
  return M.effort.includes(effort) ? null : refuse(`output_config.effort: '${effort}' is not supported on ${body.model}`);
}

export function validate(body, headers = {}) {
  const betas = String(headers['anthropic-beta'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const request = checkRequest(body);
  if (request) return request;
  const M = MODELS[body.model];
  const msgs = body.messages;
  const cache = { marks: 0 };
  const toolNames = new Set();
  return firstRefusal([
    () => checkSystemPrompt(body, cache),
    () => checkFirstMessage(msgs),
    () => firstRefusal(msgs.map((_, i) => () => checkMessage(msgs, i, M, betas, cache))),
    () => (M.noPrefill && msgs[msgs.length - 1].role === 'assistant' ? refuse('This model does not support assistant message prefill. The conversation must end with a user message.') : null),
    () => checkTools(body, cache, toolNames),
    () => (cache.marks > 4 ? refuse(`A maximum of 4 blocks with cache_control may be provided. Found ${cache.marks}.`) : null),
    () => checkToolChoice(body, M, toolNames),
    () => checkSampling(body, M),
    () => extraKey(body.output_config ?? {}, ['effort', 'format', 'task_budget'], 'output_config.'),
    () => checkThinking(body, M),
    () => checkEffort(body, M),
  ]);
}

/** A real adaptive model streams a thinking block first. */
export function thinks(body) {
  const M = MODELS[body.model] || {};
  const t = body.thinking?.type;
  if (t === 'disabled') return false;
  return t === 'adaptive' || t === 'enabled' || !!M.thinksByDefault;
}
