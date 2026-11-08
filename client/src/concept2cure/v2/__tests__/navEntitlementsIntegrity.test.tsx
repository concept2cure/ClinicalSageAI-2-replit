/** Shared shell contract, not a new licensing engine. All identities are synthetic.
 * React memo/context and the network hook are declared test boundaries; the real
 * provider, decoder and lock/recovery wording execute. Native browser coverage
 * remains in the existing rail/catalog suites. */
import assert from 'node:assert/strict';
import { beforeEach, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ raw: null as unknown, bypassHookGuard: false }));
vi.mock('react', () => ({ default: {
  createContext: () => ({ Provider: 'TestNavigationContext' }),
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useEffect: (setup: () => unknown) => { setup(); },
  createElement: (type: unknown, props: unknown) => ({ type, props }),
} }));
vi.mock('@/services/portal/authService', () => {
  const user = { id: 5, organizationId: 7 };
  return { useAuth: () => ({ user }) };
});
// Keep the same explicit element boundary under classic and automatic JSX.
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'TestFragment',
}));
vi.mock('react/jsx-dev-runtime', () => ({
  jsxDEV: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'TestFragment',
}));
vi.mock('../dataConnect', () => ({ useLiveData: (
  _path: string, _dependencies: unknown[], guard: (value: unknown) => boolean,
) => ({ data: h.bypassHookGuard || guard(h.raw) ? h.raw : null }) }));

import { NavEntitlementsProvider, isLocked, isLaunchScopeLocked, lockNotice,
  type NavEntitlementsValue, type NavSurfaceEntitlement,
  type NavEntitlementSource } from '../navEntitlements';

function row(source: NavEntitlementSource = 'included', entitled = true): NavSurfaceEntitlement {
  return { id: 'cmc', label: 'CMC / Module 3', source, entitled, requiredTier: 'professional' };
}
function payload(surfaces: unknown[] = [row()], over: Record<string, unknown> = {}): Record<string, unknown> {
  return { organizationId: 7, tier: 'professional', industryMode: 'biotech', masterAdmin: false,
    platformAdmin: false, resolved: true, launchScope: { enforced: true }, surfaces, ...over };
}
function current(raw: unknown): NavEntitlementsValue {
  h.raw = raw;
  const output = NavEntitlementsProvider({ children: null }) as unknown as { props: { value: NavEntitlementsValue } };
  return output.props.value;
}
function unknown(raw: unknown) {
  const value = current(raw);
  assert.equal(value.resolved, false);
  assert.equal(value.masterAdmin, false);
  assert.equal(value.platformAdmin, false);
  assert.equal(value.tier, null);
  assert.equal(value.verdictFor('cmc'), null);
  assert.equal(isLocked(value.verdictFor('cmc')), false, 'a failed read is not a license denial');
}
beforeEach(() => { h.raw = null; h.bypassHookGuard = false; });

it.each(['subscribed', 'included'] as const)('keeps the real %s grant', source => {
  const value = current(payload([row(source)]));
  assert.equal(value.resolved, true);
  assert.equal(value.verdictFor('cmc')?.entitled, true);
  assert.equal(value.verdictFor('cmc')?.source, source);
  assert.equal(value.verdictFor('not-in-catalog'), null);
});
it.each([
  ['disabled', 'apps'], ['tier', 'licensing'], ['industry', 'setup'], ['launch-scope', null],
] as const)('keeps %s separate from other lock reasons', (source, destination) => {
  const value = current(payload([row(source, false)]));
  const verdict = value.verdictFor('cmc');
  assert.ok(verdict);
  assert.equal(isLocked(verdict), true);
  const notice = lockNotice(verdict, { isOrgAdmin: true });
  assert.equal(notice.ctaTarget, destination);
  if (source === 'launch-scope') {
    assert.equal(isLaunchScopeLocked(verdict), true);
    assert.equal(notice.requestable, false);
  }
});
it('preserves owner licensing and the independent release restriction together', () => {
  const value = current(payload([
    row('master_admin'), { ...row('launch-scope', false), id: 'future-work', requiredTier: null },
  ], { masterAdmin: true }));
  assert.equal(value.masterAdmin, true);
  assert.equal(value.verdictFor('cmc')?.entitled, true);
  assert.equal(isLaunchScopeLocked(value.verdictFor('future-work')), true);
});
it('accepts older optional fields and does not invent an administration grant', () => {
  const raw = payload(); delete raw.platformAdmin; delete raw.launchScope;
  const value = current(raw);
  assert.equal(value.resolved, true); assert.equal(value.platformAdmin, false);
  assert.equal(value.launchScopeEnforced, null);
});
it('retains independently resolved administration/release facts on a valid unresolved catalog', () => {
  const value = current(payload([], { resolved: false, tier: null, industryMode: null, platformAdmin: true }));
  assert.equal(value.resolved, false); assert.equal(value.platformAdmin, true);
  assert.equal(value.launchScopeEnforced, true); assert.equal(value.verdictFor('cmc'), null);
});
it.each(['biotech', 'pharma', 'medtech', 'diagnostics', 'cro', 'negotiated-workspace'])
  ('uses the same verified navigation contract for %s without an industry fork', industryMode => {
    const value = current(payload([row()], { industryMode, tier: 'negotiated-plan' }));
    assert.equal(value.resolved, true); assert.equal(value.tier, 'negotiated-plan');
    assert.equal(value.verdictFor('cmc')?.source, 'included');
  });
it.each(['projects', 'vault', 'authoring', 'submission-center', 'rbm', 'cmc', 'biostatistics'])
  ('validates %s in the common provider rather than per-module rules', id => {
    const value = current(payload([{ ...row(), id }]));
    assert.equal(value.verdictFor(id)?.entitled, true);
  });
it.each([[null], [[]], ['<html>Sign in</html>'], [{ data: [] }], [{ resolved: 'true', surfaces: [] }]])
  ('does not fabricate licensing from malformed top-level data (%j)', raw => unknown(raw));
it.each([
  ['missing organization', { organizationId: undefined }],
  ['zero organization', { organizationId: 0 }],
  ['fractional organization', { organizationId: 7.5 }],
  ['numeric text organization', { organizationId: '7' }],
  ['missing license', { tier: undefined }],
  ['empty license', { tier: '' }],
  ['invalid industry', { industryMode: [] }],
  ['invalid owner flag', { masterAdmin: 'false' }],
  ['invalid administration flag', { platformAdmin: 'true' }],
  ['invalid release flag', { launchScope: { enforced: 'true' } }],
  ['invalid release object', { launchScope: [] }],
] as const)('rejects an ambiguous response header: %s', (_name, over) => unknown(payload([row()], { ...over })));
it.each([
  ['null row', null], ['array row', []],
  ['missing ID', { ...row(), id: undefined }], ['empty ID', { ...row(), id: ' ' }],
  ['untrimmed ID', { ...row(), id: 'cmc ' }], ['missing label', { ...row(), label: null }],
  ['missing entitlement', { ...row(), entitled: undefined }],
  ['text entitlement', { ...row(), entitled: 'false' }],
  ['unknown reason', { ...row(), entitled: false, source: 'quota_or_whatever' }],
  ['missing reason', { ...row(), source: undefined }],
  ['invalid required tier', { ...row(), requiredTier: {} }],
] as const)('rejects malformed verdicts without a fabricated upsell: %s', (_name, invalid) => unknown(payload([invalid])));
it.each(['included', 'subscribed', 'master_admin'] as const)
  ('rejects a false grant with source %s', source => unknown(payload([row(source, false)], { masterAdmin: source === 'master_admin' })));
it.each(['disabled', 'tier', 'industry', 'launch-scope'] as const)
  ('rejects an unlocked verdict with lock source %s', source => unknown(payload([row(source, true)])));
it('refuses an owner-only verdict without the independently reported owner fact', () => unknown(payload([row('master_admin')])));
it('refuses a release lock contradicted by a disabled release flag', () => {
  unknown(payload([row('launch-scope', false)], { launchScope: { enforced: false } }));
});
it('refuses rows supplied as if resolved when the catalog read says unresolved', () => unknown(payload([row()], { resolved: false })));
it.each([false, true])('refuses duplicate module IDs regardless of which verdict appears last (%s)', reverse => {
  const records = [row('included'), row('disabled', false)];
  unknown(payload(reverse ? records.reverse() : records));
});
it('refuses even identical duplicate records rather than silently deduplicating source ambiguity', () => unknown(payload([row(), row()])));
it('refuses a mixed valid/invalid catalog instead of interpreting missing records as unrestricted', () => {
  unknown(payload([row(), { ...row('disabled', false), id: 'rbm', source: 'unknown' }]));
});
it('revalidates a cached payload even if the network hook did not run its guard', () => {
  h.bypassHookGuard = true;
  unknown(payload([{ ...row(), entitled: 'yes' }], { platformAdmin: true }));
});
it('keeps an admitted verdict independent of later changes to the response object', () => {
  const records = [row()];
  const value = current(payload(records));
  records[0].entitled = false; records[0].source = 'industry'; records[0].label = 'Changed label';
  records.push({ ...row('disabled', false), id: 'rbm' });
  assert.deepEqual(value.verdictFor('cmc'), row());
  assert.equal(value.verdictFor('rbm'), null);
});
it('does not let one consumer alter the shared verdict read by another work area', () => {
  const value = current(payload()); const verdict = value.verdictFor('cmc'); assert.ok(verdict);
  assert.equal(Reflect.set(verdict, 'entitled', false), false);
  assert.equal(value.verdictFor('cmc')?.entitled, true);
});
