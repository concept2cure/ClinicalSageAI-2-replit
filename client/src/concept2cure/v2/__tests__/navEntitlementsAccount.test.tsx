/** One shell, one account-owned license read. Identities are synthetic.
 * The provider executes unchanged; React scheduling, auth and the existing
 * useLiveData ownership contract are explicit controlled collaborators here.
 * Native DOM coverage exercises the real data hook in the companion suite. */
import assert from 'node:assert/strict';
import { beforeEach, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Owner = { key: string; current: () => boolean };
  type Read = { path: string; key: string; owner?: Owner; guard: (x: unknown) => boolean };
  const state = {
    user: null as { id: number | string; organizationId?: number | string | null } | null,
    slots: [] as Array<any>, cursor: 0, effects: [] as Array<() => void>,
    reads: [] as Read[], lastKey: '', saved: null as { key: string; data: unknown } | null,
    reset() { state.user = { id: 5, organizationId: 7 }; state.slots = []; state.cursor = 0;
      state.effects = []; state.reads = []; state.lastKey = ''; state.saved = null; },
    useRef(initial: unknown) {
      const index = state.cursor++;
      return (state.slots[index] ??= { current: initial });
    },
    useEffect(setup: () => (() => void) | void, deps: unknown[]) {
      const index = state.cursor++;
      const old = state.slots[index];
      if (!old || old.deps.length !== deps.length || deps.some((v, n) => !Object.is(v, old.deps[n]))) {
        state.effects.push(() => { old?.cleanup?.(); state.slots[index] = { deps, cleanup: setup() }; });
      }
    },
    commit() { const pending = state.effects.splice(0); pending.forEach(fn => fn()); },
    unmount() { state.slots.forEach(slot => slot?.cleanup?.()); },
    read(path: string | null, deps: unknown[], guard: (x: unknown) => boolean, owner?: Owner) {
      const key = JSON.stringify([path, deps, owner?.key ?? null]);
      if (key !== state.lastKey) {
        state.lastKey = key;
        if (path && (!owner || owner.current())) state.reads.push({ path, key, owner, guard });
      }
      return { data: path && (!owner || owner.current()) && state.saved?.key === key ? state.saved.data : null };
    },
    deliver(index: number, raw: unknown) {
      const read = state.reads[index];
      if (!read || (read.owner && !read.owner.current())) return;
      state.saved = { key: read.key, data: read.guard(raw) ? raw : null };
    },
  };
  return state;
});
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('react', () => ({ default: {
  createContext: () => ({ Provider: 'TestNavigationContext' }),
  useMemo: (compute: () => unknown) => compute(), useCallback: (fn: unknown) => fn,
  useRef: h.useRef, useEffect: h.useEffect,
  createElement: (type: unknown, props: unknown) => ({ type, props }),
} }));
vi.mock('react/jsx-runtime', () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'Fragment' }));
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'Fragment' }));
vi.mock('../dataConnect', () => ({ useLiveData: h.read }));

import { NavEntitlementsProvider, type NavEntitlementsValue } from '../navEntitlements';
const grant = (organizationId = 7, over: Record<string, unknown> = {}) => ({
  organizationId, tier: 'enterprise', industryMode: 'cro', resolved: true,
  masterAdmin: true, platformAdmin: true, launchScope: { enforced: true },
  surfaces: [{ id: 'cmc', label: 'CMC', entitled: true, source: 'master_admin', requiredTier: 'professional' }], ...over,
});
function render() {
  h.cursor = 0;
  const result = NavEntitlementsProvider({ children: null }) as unknown as { props: { value: NavEntitlementsValue } };
  h.commit(); return result.props.value;
}
function unresolved(value: NavEntitlementsValue) {
  assert.equal(value.resolved, false); assert.equal(value.masterAdmin, false);
  assert.equal(value.platformAdmin, false); assert.equal(value.tier, null);
  assert.equal(value.verdictFor('cmc'), null);
}
function loaded() { render(); h.deliver(0, grant()); return render(); }
beforeEach(() => h.reset());

it('removes the previous organization verdict before the new read resolves', () => {
  assert.equal(loaded().platformAdmin, true);
  h.user = { id: 5, organizationId: 8 };
  unresolved(render()); assert.equal(h.reads.length, 2);
});
it('accepts only the new organization answer and keeps its actual restriction', () => {
  loaded(); h.user = { id: 5, organizationId: 8 }; render();
  h.deliver(1, grant(8, { masterAdmin: false, platformAdmin: false, tier: 'standard', surfaces: [
    { id: 'cmc', label: 'CMC', entitled: false, source: 'tier', requiredTier: 'professional' },
  ] }));
  const value = render(); assert.equal(value.resolved, true); assert.equal(value.platformAdmin, false);
  assert.equal(value.verdictFor('cmc')?.source, 'tier');
});
it('separates two users of the same organization, including administration indicators', () => {
  loaded(); h.user = { id: 6, organizationId: 7 }; unresolved(render());
  assert.equal(h.reads.length, 2);
});
it('rechecks a replaced account profile even when its numeric identity is unchanged', () => {
  loaded(); h.user = { id: 5, organizationId: 7 }; unresolved(render());
  assert.equal(h.reads.length, 2);
});
it('does not revive the first visit after A to B to A, even with the same account object', () => {
  const a = h.user; const old = loaded();
  h.user = { id: 6, organizationId: 8 }; render();
  h.user = a; unresolved(render());
  assert.equal(h.reads.length, 3); assert.equal(old.verdictFor('cmc'), null);
});
it('ignores a delayed earlier-account reply after the new account was selected', () => {
  render(); h.user = { id: 6, organizationId: 8 }; render();
  h.deliver(0, grant()); unresolved(render());
  h.deliver(1, grant(8)); assert.equal(render().resolved, true);
});
it('does not let a late old request replace a current resolved answer', () => {
  render(); h.user = { id: 6, organizationId: 8 }; render();
  h.deliver(1, grant(8)); assert.equal(render().resolved, true);
  h.deliver(0, grant()); assert.equal(render().resolved, true);
});
it('clears owner/admin/plan indicators on logout without issuing another read', () => {
  const old = loaded(); h.user = null; unresolved(render());
  assert.equal(h.reads.length, 1); assert.equal(old.verdictFor('cmc'), null);
});
it('will not publish a response completed after logout', () => {
  render(); h.user = null; render(); h.deliver(0, grant()); unresolved(render());
});
it('does not query while no account is known, then queries after login', () => {
  h.user = null; unresolved(render()); assert.equal(h.reads.length, 0);
  h.user = { id: 6, organizationId: 8 }; render(); assert.equal(h.reads.length, 1);
  h.deliver(0, grant(8)); assert.equal(render().resolved, true);
});
it('rejects a well-formed answer for the wrong authenticated organization', () => {
  render(); h.deliver(0, grant(8)); unresolved(render());
});
it('accepts an organization supplied as canonical numeric text in the account profile', () => {
  h.user = { id: '5', organizationId: '7' }; assert.equal(loaded().resolved, true);
});
it.each([0, -1, 7.5, NaN, 2_147_483_648, '', '7junk', ' 7 ', '07'])('does not issue a read for invalid account organization %s', organizationId => {
    h.user = { id: 5, organizationId }; unresolved(render()); assert.equal(h.reads.length, 0);
  });
it('does not invent an organization for a supported older account profile without that field', () => {
  h.user = { id: 5 }; render(); h.deliver(0, grant(9)); assert.equal(render().resolved, true);
});
it('reuses the current answer for an ordinary rerender with the same account', () => {
  const current = loaded(); assert.equal(render().resolved, true); assert.equal(render().tier, current.tier);
  assert.equal(h.reads.length, 1);
});
it('keeps an independently resolved current admin fact on an unresolved current catalog', () => {
  render(); h.deliver(0, grant(7, { resolved: false, masterAdmin: false, surfaces: [] }));
  const value = render(); assert.equal(value.resolved, false); assert.equal(value.platformAdmin, true);
  h.user = { id: 5, organizationId: 8 }; unresolved(render());
});
it.each(['projects', 'vault', 'authoring', 'submission-center', 'rbm', 'cmc', 'biostatistics'])('retires a captured %s verdict without creating a feature-specific context', id => {
    render(); h.deliver(0, grant(7, { surfaces: [
      { id, label: id, entitled: true, source: 'included', requiredTier: null },
    ] }));
    const old = render(); assert.ok(old.verdictFor(id));
    h.user = { id: 6, organizationId: 8 }; render(); assert.equal(old.verdictFor(id), null);
  });
it('retires a captured verdict when the provider unmounts', () => {
  const old = loaded(); h.unmount(); assert.equal(old.verdictFor('cmc'), null);
});
it('keeps current response rows immutable', () => {
  const value = loaded(); const row = value.verdictFor('cmc'); assert.ok(row);
  assert.equal(Reflect.set(row, 'entitled', false), false);
});
