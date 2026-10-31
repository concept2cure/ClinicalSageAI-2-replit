/** Executes the actual UI read modules with deterministic timer/transport and
 * hook-lifecycle doubles. No database, full React render, hosted browser or
 * release qualification is implied. TypeScript is the repository's devDependency.
 * Run: node --test tests/ops/ui-read-recovery.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE_PATH || 'typescript');
const root = process.env.C2C_UI_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEADLINE = 20_000;
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function clock() {
  let now = 0, id = 0;
  const jobs = new Map();
  return {
    setTimeout(fn, delay) { const key = ++id; jobs.set(key, { fn, at: now + delay }); return key; },
    clearTimeout(key) { jobs.delete(key); },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; jobs.delete(next[0]); next[1].fn(); await flush();
      }
      now = end; await flush();
    },
    get pending() { return jobs.size; },
  };
}

/** Models stable hook slots, dependency changes, effect cleanup and unmount.
 * It is deliberately a test driver, not an alternative production React runtime. */
function hookDriver() {
  let slots = [], cursor = 0, effects = [], dirty = false, fn, args, value, mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        if (!mounted) throw new Error('state update after unmount');
        const v = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(v, slots[index].value)) { slots[index].value = v; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || !same(previous.deps, deps)) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const render = () => {
    for (let n = 0; n < 50; n++) {
      dirty = false; cursor = 0; value = fn(...args);
      const pending = effects; effects = []; for (const e of pending) e();
      if (!dirty) return value;
    }
    throw new Error('unbounded render loop');
  };
  return {
    react,
    mount(f, ...a) { fn = f; args = a; return render(); },
    update(...a) { args = a; return render(); },
    read() { return dirty ? render() : value; },
    unmount() { for (const s of slots) s?.cleanup?.(); mounted = false; },
  };
}

function fixture() {
  const time = clock(), hooks = hookDriver(), cache = new Map();
  const state = { calls: [], events: [], ended: [], token: 'test-only-bearer', org: '42', fetch: () => new Promise(() => {}), sessionReason: async () => null };
  const context = vm.createContext({
    console, Error, TypeError, Promise, AbortController, DOMException, Headers, Response, Request, FormData, Blob,
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    fetch: (url, options) => { state.calls.push({ url, options }); return Promise.resolve().then(() => state.fetch(url, options)); },
    window: { dispatchEvent: e => state.events.push(e) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  });
  const aliases = {
    '@/lib/queryClient': 'client/src/lib/queryClient.ts',
    '@/lib/apiErrorCode': 'client/src/lib/apiErrorCode.ts',
  };
  const stubs = {
    react: hooks.react,
    '@tanstack/react-query': { QueryClient: class { constructor(options) { this.options = options; } }, MutationCache: class { constructor(options) { this.options = options; } } },
    '@/utils/authToken': { getAuthToken: () => state.token, getOrgId: () => state.org },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const module = { exports: {} }; cache.set(relative, module);
    const filename = path.join(root, relative);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    const localRequire = spec => {
      if (Object.hasOwn(stubs, spec)) return stubs[spec];
      if (aliases[spec]) return load(aliases[spec]);
      if (spec === './icons') return { I: { alertTriangle: '!', close: 'x' } };
      if (spec.endsWith('/sessionEnd')) return { announceSessionEnded: r => state.ended.push(r), sessionEndReasonOfResponse: res => state.sessionReason(res) };
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), spec));
      if (!path.extname(target)) target += '.ts';
      return load(target);
    };
    const execute = new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInContext(context);
    execute(localRequire, module, module.exports);
    return module.exports;
  }
  return { time, hooks, state, data: load('client/src/concept2cure/v2/dataConnect.tsx'),
    raw: load('client/src/concept2cure/mdx/hooks/useFetchJson.ts'), api: load('client/src/lib/queryClient.ts') };
}

async function observe(promise) {
  const result = { settled: false, value: undefined };
  promise.then(value => { result.settled = true; result.value = value; });
  await flush(); return result;
}

for (const where of ['transport', 'body', 'error-body', 'session-body']) {
  test(`v2 read stops waiting for stalled ${where}, keeps failure distinct from empty, and aborts its request`, async () => {
    const { data, state, time } = fixture();
    if (where === 'body') state.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => {}) });
    if (where === 'error-body') state.fetch = async () => ({ ok: false, status: 503, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => new Promise(() => {}) });
    if (where === 'session-body') { state.fetch = async () => json({}, 401); state.sessionReason = () => new Promise(() => {}); }
    const observed = await observe(data.liveGetOrNull('/api/test/read'));
    await time.advance(DEADLINE - 1); assert.equal(observed.settled, false);
    await time.advance(1); assert.equal(observed.settled, true);
    assert.equal(observed.value.data, null); assert.equal(observed.value.status, 0);
    assert.equal(observed.value.code, 'READ_TIMEOUT'); assert.match(observed.value.error, /try again/i);
    assert.equal(state.calls[0].options.signal?.aborted, true);
    assert.equal(time.pending, 0);
  });
}

test('v2 timeout remains final even when the original response ignores abort and arrives late', async () => {
  const { data, state, time } = fixture(), old = deferred(); state.fetch = () => old.promise;
  const observed = await observe(data.liveGetOrNull('/api/test/read'));
  await time.advance(DEADLINE);
  old.resolve(json({ data: { old: true } })); await flush();
  assert.equal(observed.value.code, 'READ_TIMEOUT'); assert.equal(observed.value.data, null);
});

test('v2 read preserves supplied headers, bearer and cancellation signal', async () => {
  const { data, state } = fixture(); state.fetch = async () => json({ data: { id: 9 } });
  const controller = new AbortController();
  const result = await data.liveGetOrNull('/api/test/read', undefined, { 'x-test-read': 'kept' }, controller.signal);
  assert.equal(result.data.id, 9); assert.equal(state.calls[0].options.headers['x-test-read'], 'kept');
  assert.equal(state.calls[0].options.headers.Authorization, 'Bearer test-only-bearer');
  assert.equal(state.calls[0].options.headers['x-organization-id'], '42');
  assert.ok(state.calls[0].options.signal);
});

test('an already-cancelled v2 read performs no fetch', async () => {
  const { data, state, time } = fixture(), controller = new AbortController(); controller.abort();
  const observed = await observe(data.liveGetOrNull('/api/test/read', undefined, undefined, controller.signal));
  assert.equal(state.calls.length, 0); assert.equal(observed.settled, true);
  assert.equal(observed.value.code, 'READ_CANCELLED'); assert.equal(time.pending, 0);
});

test('cancelling an in-flight v2 read settles it even if the transport ignores abort', async () => {
  const { data, state, time } = fixture(), controller = new AbortController();
  const observed = await observe(data.liveGetOrNull('/api/test/read', undefined, undefined, controller.signal));
  controller.abort(); await flush();
  assert.equal(observed.settled, true); assert.equal(observed.value.code, 'READ_CANCELLED');
  assert.equal(state.calls[0].options.signal?.aborted, true); assert.equal(time.pending, 0);
});

for (const [status, payload, code] of [
  [403, { error: 'MODULE_NOT_LICENSED', message: 'Feature is not enabled.' }, 'MODULE_NOT_LICENSED'],
  [404, { error: 'NOT_FOUND', message: 'Project not found.' }, 'NOT_FOUND'],
  [503, { error: 'VERIFICATION_UNAVAILABLE', message: 'Access could not be checked.' }, 'VERIFICATION_UNAVAILABLE'],
]) {
  test(`v2 preserves status ${status} and code ${code} instead of misclassifying a completed refusal as a timeout`, async () => {
    const { data, state, time } = fixture(); state.fetch = async () => json(payload, status);
    const result = await data.liveGetOrNull('/api/test/read');
    assert.equal(result.status, status); assert.equal(result.code, code); assert.equal(result.error, payload.message);
    assert.equal(result.data, null); assert.equal(time.pending, 0);
  });
}

for (const [name, response] of [
  ['empty list', () => json({ data: [], meta: { pendingStore: false } })],
  ['no content', () => new Response(null, { status: 204 })],
]) {
  test(`v2 legitimate ${name} is not a timeout or a failure`, async () => {
    const { data, state, time } = fixture(); state.fetch = response;
    const result = await data.liveGetOrNull('/api/test/read');
    assert.equal(result.error, undefined); assert.equal(result.code, undefined); assert.equal(time.pending, 0);
  });
}

test('v2 missing-store metadata survives; no fixture or false completed data is supplied', async () => {
  const { data, state } = fixture(); state.fetch = () => json({ data: [], meta: { pendingStore: true } });
  const result = await data.liveGetOrNull('/api/test/read');
  assert.equal(data.isPendingStore(result), true); assert.equal(result.data.length, 0);
});

test('v2 malformed JSON and shape guard refusals settle without timers left behind', async () => {
  const { data, state, time } = fixture(); state.fetch = () => new Response('not-json', { headers: { 'Content-Type': 'application/json' } });
  assert.ok((await data.liveGetOrNull('/api/test/read')).error); assert.equal(time.pending, 0);
  state.fetch = () => json({ data: { different: true } });
  const result = await data.liveGetOrNull('/api/test/read', data.hasKeys('expected'));
  assert.ok(result.error); assert.equal(result.data, null); assert.equal(time.pending, 0);
});

test('v2 hook clears loading on timeout and existing retry dependency recovers the real result', async () => {
  const { data, hooks, state, time } = fixture();
  hooks.mount(data.useLiveRows, '/api/task-management/board', [0]); await flush();
  assert.equal(hooks.read().loading, true);
  await time.advance(DEADLINE);
  const failed = hooks.read(); assert.equal(failed.loading, false); assert.equal(failed.empty, false); assert.equal(failed.code, 'READ_TIMEOUT');
  state.fetch = () => json({ data: [{ taskId: 'actual-task' }] });
  hooks.update('/api/task-management/board', [1]); await flush();
  assert.equal(hooks.read().rows[0].taskId, 'actual-task'); assert.equal(hooks.read().error, undefined);
  assert.equal(state.calls.length, 2); assert.equal(time.pending, 0);
});

test('v2 navigation always reloads a changed path even when caller deps omit it', async () => {
  const { data, hooks, state } = fixture();
  state.fetch = url => json({ data: { path: url } });
  hooks.mount(data.useLiveData, '/api/old', [0]); await flush();
  hooks.update('/api/new', [0]); await flush();
  assert.equal(hooks.read().data.path, '/api/new'); assert.equal(state.calls.length, 2);
});

test('v2 navigation cancels the previous transport and ignores its late data', async () => {
  const { data, hooks, state, time } = fixture(), old = deferred(); state.fetch = () => old.promise;
  hooks.mount(data.useLiveData, '/api/old', [0]); await flush();
  state.fetch = () => json({ data: { current: true } });
  hooks.update('/api/new', [1]); await flush();
  assert.equal(state.calls[0].options.signal?.aborted, true);
  old.resolve(json({ data: { old: true } })); await flush();
  assert.equal(hooks.read().data.current, true); assert.equal(time.pending, 0);
});

test('v2 unmount cancels both the read and the deadline without updating state', async () => {
  const { data, hooks, state, time } = fixture(); hooks.mount(data.useLiveData, '/api/test/read'); await flush();
  hooks.unmount(); await flush(); await time.advance(DEADLINE);
  assert.equal(state.calls[0].options.signal?.aborted, true); assert.equal(time.pending, 0);
});

test('v2 disabling a read stops loading even when explicit deps are unchanged', async () => {
  const { data, hooks, state, time } = fixture(); hooks.mount(data.useLiveData, '/api/test/read', [0]); await flush();
  hooks.update(null, [0]); await flush();
  assert.equal(hooks.read().loading, false); assert.equal(hooks.read().empty, false); assert.equal(hooks.read().data, null);
  assert.equal(state.calls[0].options.signal?.aborted, true); assert.equal(time.pending, 0);
});

test('expired v2 read ownership hides old data without another permanent loading state', async () => {
  const { data, hooks, state } = fixture(); let current = true;
  const owner = { key: 'account-and-visit-A', current: () => current };
  state.fetch = () => json({ data: { secret: 'old-tenant' } });
  hooks.mount(data.useLiveData, '/api/test/read', [0], undefined, owner); await flush();
  assert.equal(hooks.read().data.secret, 'old-tenant');
  current = false; hooks.update('/api/test/read', [0], undefined, owner);
  assert.equal(hooks.read().data, null); assert.equal(hooks.read().loading, false); assert.equal(hooks.read().empty, false);
  assert.equal(hooks.read().code, 'READ_CONTEXT_CHANGED');
});

for (const where of ['transport', 'body', 'error-body']) {
  test(`MDX/Quality hook ends stalled ${where} with a retryable read failure`, async () => {
    const { raw, hooks, state, time } = fixture();
    if (where === 'body') state.fetch = () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    if (where === 'error-body') state.fetch = () => ({ ok: false, status: 503, text: () => new Promise(() => {}) });
    hooks.mount(raw.useFetchJson, '/api/test/read'); await flush();
    await time.advance(DEADLINE - 1); assert.equal(hooks.read().loading, true);
    await time.advance(1); const failed = hooks.read();
    assert.equal(failed.loading, false); assert.equal(failed.data, null); assert.equal(failed.failure.kind, 'failed');
    assert.equal(failed.failure.code, 'READ_TIMEOUT'); assert.match(failed.error, /try again/i);
    assert.equal(state.calls[0].options.signal.aborted, true); assert.equal(time.pending, 0);
  });
}

test('MDX refresh after timeout recovers and a late old response cannot overwrite it', async () => {
  const { raw, hooks, state, time } = fixture(), old = deferred(); state.fetch = () => old.promise;
  hooks.mount(raw.useFetchJson, '/api/test/read'); await flush(); await time.advance(DEADLINE);
  assert.equal(hooks.read().loading, false);
  state.fetch = () => json({ current: true }); hooks.read().refresh(); hooks.read(); await flush();
  old.resolve(json({ old: true })); await flush();
  assert.equal(hooks.read().data.current, true); assert.equal(hooks.read().error, null); assert.equal(state.calls.length, 2);
});

test('an unexpected AbortError is an ended load, not a permanent spinner', async () => {
  const { raw, hooks, state } = fixture();
  state.fetch = () => Promise.reject(new DOMException('Request aborted by transport', 'AbortError'));
  hooks.mount(raw.useFetchJson, '/api/test/read'); await flush();
  assert.equal(hooks.read().loading, false); assert.ok(hooks.read().error); assert.equal(hooks.read().data, null);
});

test('MDX URL changes abort old work and cleanup retires the timer', async () => {
  const { raw, hooks, state, time } = fixture();
  hooks.mount(raw.useFetchJson, '/api/old'); await flush();
  state.fetch = () => json({ current: true }); hooks.update('/api/new'); await flush();
  assert.equal(state.calls[0].options.signal.aborted, true); assert.equal(hooks.read().data.current, true);
  hooks.unmount(); await flush(); assert.equal(time.pending, 0);
});

test('MDX null URL remains idle and issues no requests', async () => {
  const { raw, hooks, state, time } = fixture(); hooks.mount(raw.useFetchJson, null); await flush();
  assert.equal(hooks.read().loading, false); assert.equal(hooks.read().error, null); assert.equal(state.calls.length, 0); assert.equal(time.pending, 0);
});

for (const [status, code, kind] of [
  [403, 'MODULE_NOT_LICENSED', 'not-enabled'], [403, 'LAUNCH_SCOPE', 'out-of-release'],
  [403, 'ORG_REQUIRED', 'no-organization'], [404, 'NOT_FOUND', 'not-found'], [503, 'VERIFICATION_UNAVAILABLE', 'unchecked'],
]) {
  test(`MDX/Quality preserves ${status}/${code} as ${kind}`, async () => {
    const { raw, hooks, state, time } = fixture(); state.fetch = () => json({ error: code }, status);
    hooks.mount(raw.useFetchJson, '/api/test/read'); await flush();
    const read = hooks.read(); assert.equal(read.failure.kind, kind); assert.equal(read.failure.code, code); assert.equal(read.failure.status, status);
    assert.equal(read.loading, false); assert.equal(time.pending, 0);
  });
}

test('UI read deadline does not cancel, retry or falsely complete a governed write', async () => {
  const { data, api, state, time } = fixture(), write = deferred(); state.fetch = () => write.promise;
  const observed = await observe(data.liveMutateOrNull('POST', '/api/test/save', { content: 'draft retained' }));
  await time.advance(DEADLINE * 2);
  assert.equal(observed.settled, false); assert.equal(state.calls.length, 1); assert.equal(state.calls[0].options.signal, undefined);
  write.resolve(json({ data: { saved: true } })); await flush();
  assert.equal(observed.value.data.saved, true); assert.equal(api.queryClient.options.defaultOptions.mutations.retry, 0);
});

test('timeout copy survives the actual error renderer and its existing retry action remains operable', async () => {
  const { data, state, time } = fixture();
  const observed = await observe(data.liveGetOrNull('/api/test/read')); await time.advance(DEADLINE);
  let retried = 0;
  const tree = data.ErrorState({ title: 'Could not load tasks', message: observed.value?.error, retry: () => retried++ });
  const nodes = [];
  function walk(node) { if (node && typeof node === 'object') { nodes.push(node); for (const child of node.props?.children?.flat(Infinity) ?? []) walk(child); } }
  walk(tree);
  const button = nodes.find(node => node.type === 'button'); assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick();
  assert.equal(retried, 1); assert.equal(tree.props.role, 'alert');
  assert.ok(nodes.some(node => node.props?.className === 'c2c-error-h' && node.props.children.join('').match(/try again/i)));
});

test('busy retry stays disabled; empty, loading and failure retain their distinct accessibility states', () => {
  const { data } = fixture();
  const tree = data.ErrorState({ title: 'Could not load', retry: () => {}, busy: true });
  const actions = tree.props.children.find(n => n?.props?.className === 'c2c-error-actions');
  assert.equal(actions.props.children.find(n => n?.type === 'button').props.disabled, true);
  const empty = data.EmptyState({ title: 'Loading', busy: true });
  assert.equal(empty.props.role, 'status'); assert.equal(empty.props['aria-busy'], true);
});

test('a timed-out old 401 cannot announce the end of a newer session', async () => {
  const { data, state, time } = fixture(), reason = deferred();
  state.fetch = () => json({}, 401); state.sessionReason = () => reason.promise;
  const observed = await observe(data.liveGetOrNull('/api/test/read'));
  await time.advance(DEADLINE); state.token = 'new-test-bearer'; reason.resolve('idle'); await flush();
  assert.equal(observed.value.code, 'READ_TIMEOUT'); assert.equal(state.ended.length, 0);
});

test('a current 401 still announces the session outcome and gives actionable sign-in wording', async () => {
  const { data, state, time } = fixture(); state.fetch = () => json({}, 401); state.sessionReason = async () => 'idle';
  const result = await data.liveGetOrNull('/api/test/read');
  assert.equal(result.status, 401); assert.match(result.error, /sign in again/i); assert.equal(state.ended[0], 'idle');
  assert.equal(time.pending, 0);
});

test('successful v2 reads detach the caller cancellation listener', async () => {
  const { data, state, time } = fixture(); state.fetch = () => json({ data: { id: 9 } });
  const controller = new AbortController(), signal = controller.signal;
  let additions = 0, removals = 0;
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...args) => { additions++; return add(...args); };
  signal.removeEventListener = (...args) => { removals++; return remove(...args); };
  const result = await data.liveGetOrNull('/api/test/read', undefined, undefined, signal);
  assert.equal(result.data.id, 9); assert.equal(additions, 1); assert.equal(removals, 1); assert.equal(time.pending, 0);
  controller.abort(); assert.equal(state.calls[0].options.signal.aborted, false);
});

test('MDX/Quality caller cancellation is honored before a request starts', async () => {
  const { raw, hooks, state, time } = fixture(), controller = new AbortController(); controller.abort();
  hooks.mount(raw.useFetchJson, '/api/test/read', { init: { signal: controller.signal } }); await flush();
  assert.equal(state.calls.length, 0); assert.equal(hooks.read().loading, false);
  assert.equal(hooks.read().failure.code, 'READ_CANCELLED'); assert.equal(time.pending, 0);
});

test('MDX/Quality refresh uses the active bearer and organization, not stale headers', async () => {
  const { raw, hooks, state, time } = fixture(); state.fetch = () => json({ name: 'current' });
  hooks.mount(raw.useFetchJson, '/api/test/read'); await flush();
  const refresh = hooks.read().refresh;
  state.token = 'changed-test-bearer'; state.org = '84'; refresh(); hooks.read(); await flush();
  assert.equal(hooks.read().refresh, refresh);
  assert.equal(state.calls[1].options.headers.Authorization, 'Bearer changed-test-bearer');
  assert.equal(state.calls[1].options.headers['x-organization-id'], '84'); assert.equal(time.pending, 0);
});

test('the existing non-GET hook option is not timed out or retried as a read', async () => {
  const { raw, hooks, state, time } = fixture(), pending = deferred(); state.fetch = () => pending.promise;
  hooks.mount(raw.useFetchJson, '/api/test/action', { init: { method: 'POST', body: '{}' } }); await flush();
  await time.advance(DEADLINE * 3); assert.equal(hooks.read().loading, true); assert.equal(hooks.read().error, null); assert.equal(state.calls.length, 1);
  pending.resolve(json({ recorded: true })); await flush(); assert.equal(hooks.read().data.recorded, true);
});

test('no automatic request storm starts after a v2 read timeout', async () => {
  const { data, hooks, state, time } = fixture(); hooks.mount(data.useLiveData, '/api/test/read'); await flush();
  await time.advance(DEADLINE * 5); assert.equal(hooks.read().loading, false); assert.equal(state.calls.length, 1);
  assert.equal(time.pending, 0);
});

test('v2 renders no previous-project payload during a new project load', async () => {
  const { data, hooks, state } = fixture(); state.fetch = () => json({ data: { project: 'A' } });
  hooks.mount(data.useLiveData, '/api/project-A', [0]); await flush(); assert.equal(hooks.read().data.project, 'A');
  state.fetch = () => new Promise(() => {}); hooks.update('/api/project-B', [1]);
  assert.equal(hooks.read().loading, true); assert.equal(hooks.read().data, null); assert.equal(hooks.read().empty, false);
});

test('a new valid ownership visit can recover after the prior owner was retired', async () => {
  const { data, hooks, state } = fixture(); let active = true;
  const owner = { key: 'owner-A', current: () => active };
  state.fetch = () => json({ data: { version: 1 } }); hooks.mount(data.useLiveData, '/api/test/read', [0], undefined, owner); await flush();
  active = false; hooks.update('/api/test/read', [0], undefined, owner); assert.equal(hooks.read().data, null);
  state.fetch = () => json({ data: { version: 2 } }); active = true; hooks.update('/api/test/read', [0], undefined, owner); await flush();
  assert.equal(hooks.read().data.version, 2); assert.equal(hooks.read().loading, false); assert.equal(state.calls.length, 2);
});

test('a late transport rejection after timeout is handled and cannot reset the failure', async () => {
  const { data, state, time } = fixture(), pending = deferred(); state.fetch = () => pending.promise;
  const observed = await observe(data.liveGetOrNull('/api/test/read')); await time.advance(DEADLINE);
  pending.reject(new Error('late transport error')); await flush();
  assert.equal(observed.value.code, 'READ_TIMEOUT'); assert.equal(observed.value.data, null);
});

test('a throwing response guard produces a completed error, never a stuck load', async () => {
  const { data, hooks, state, time } = fixture(); state.fetch = () => json({ data: { id: 9 } });
  hooks.mount(data.useLiveData, '/api/test/read', [0], () => { throw new Error('Read validation failed'); }); await flush();
  assert.equal(hooks.read().loading, false); assert.equal(hooks.read().empty, false); assert.match(hooks.read().error, /validation failed/);
  assert.equal(time.pending, 0);
});

test('audit warnings for a completed write still use the existing event path', async () => {
  const { data, state, time } = fixture();
  state.fetch = () => json({ data: { saved: true } }, 200, { 'X-Audit-Row-Persisted': 'false', 'X-Request-Id': 'test-ref-123' });
  const result = await data.liveMutateOrNull('PATCH', '/api/test/save', { text: 'real user draft' }); await flush();
  assert.equal(result.data.saved, true); assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, 'c2c:audit-row-not-persisted'); assert.equal(time.pending, 0);
});
