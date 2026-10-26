// @vitest-environment jsdom
/** Existing receiver/channel/auth exports; no alternate owner or HTTP implementation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { captureAssemblySourceIntent, captureSourceDocumentStartIntent } from '../assemblySourceIntent';
import { clearEditorTarget, consumeEditorTarget, EDITOR_TARGET_TTL_MS, setEditorTarget, type EditorTarget } from '../../editorTarget';
import { clearShellProject, publishShellProject } from '../../shellProject';

const PROGRAM = '11111111-1111-4111-8111-111111111871';
const DOC = '22222222-2222-4222-8222-222222222871';
const ACTOR = { id: '7', organizationId: '12', roles: ['admin'] };
const BEARER = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const target = () => ({ docType: null, docId: DOC, programId: PROGRAM,
  assemblySources: { version: 1 as const, sources: [{ kind: 'data-room' as const, sourceId: 871, expectedChecksum: 'ab'.repeat(32) }] } });
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  authService.setToken(BEARER, ACTOR, 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM });
});
afterEach(() => { authService.endSession(null); clearAuthToken(); clearShellProject(); clearEditorTarget(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe('the existing assembly receiver retains the admitted sender', () => {
  it('does not admit an unregistered raw target by minting a new receiver owner', () => {
    const raw: EditorTarget = { ...target(), sectionCode: null, sectionLabel: null, programTitle: null, returnTo: null, setAt: Date.now() };
    expect(captureAssemblySourceIntent(raw, () => true)).toBeNull();
  });
  it('refuses a copied genuine receiver instead of assigning the copied payload new authority', () => {
    setEditorTarget(target(), () => true); const received = consumeEditorTarget()!;
    expect(captureAssemblySourceIntent(received, () => true)?.current()).toBe(true);
    expect(captureAssemblySourceIntent({ ...received }, () => true)).toBeNull();
  });
  it('keeps the original sender predicate after the channel is consumed', () => {
    let sender = true; setEditorTarget(target(), () => sender); const received = consumeEditorTarget()!;
    const intent = captureAssemblySourceIntent(received, () => true)!; expect(intent.current()).toBe(true);
    sender = false; expect(intent.current()).toBe(false);
  });
  it('retires a consumed source intent if its admitted receiver is replaced', () => {
    let admitted = true; setEditorTarget(target(), () => true);
    const intent = captureAssemblySourceIntent(consumeEditorTarget()!, () => admitted)!;
    expect(intent.current()).toBe(true); admitted = false; expect(intent.current()).toBe(false);
  });
  it('refuses source mutation through an admitted intent', () => {
    setEditorTarget(target(), () => true); const intent = captureAssemblySourceIntent(consumeEditorTarget()!, () => true)!;
    const source = intent.sources[0]; if (source.kind === 'data-room') source.sourceId = 999;
    expect(intent.current()).toBe(false);
  });
  it('does not revive an expired target as a new received source command', () => {
    setEditorTarget(target(), () => true); const received = consumeEditorTarget()!;
    const intent = captureAssemblySourceIntent(received, () => true)!;
    vi.spyOn(Date, 'now').mockReturnValue(received.setAt + EDITOR_TARGET_TTL_MS + 1);
    expect(intent.current()).toBe(true); expect(captureAssemblySourceIntent(received, () => true)).toBeNull();
  });
});

function receive(kind: 'assembly' | 'start', sender = () => true, admitted = () => true) {
  if (kind === 'assembly') {
    setEditorTarget(target(), sender);
    return captureAssemblySourceIntent(consumeEditorTarget()!, admitted)!;
  }
  setEditorTarget({ docType: null, docId: null, programId: PROGRAM, sourceDocumentStart: target().assemblySources }, sender);
  return captureSourceDocumentStartIntent(consumeEditorTarget()!, admitted)!;
}
describe('observed receiver retirement is one way for both existing source commands', () => {
  it.each(['assembly', 'start'] as const)('does not revive a %s intent after mutated selectors are restored', kind => {
    const intent = receive(kind); const source = intent.sources[0];
    if (source.kind !== 'data-room') throw new Error('Expected the controlled Data Room fixture');
    source.sourceId = 999; expect(intent.current()).toBe(false);
    source.sourceId = 871; expect(intent.current()).toBe(false);
  });
  it.each(['assembly', 'start'] as const)('does not revive a %s intent after its sender returns', kind => {
    let sender = true; const intent = receive(kind, () => sender); expect(intent.current()).toBe(true);
    sender = false; expect(intent.current()).toBe(false); sender = true; expect(intent.current()).toBe(false);
  });
  it.each(['assembly', 'start'] as const)('does not revive a %s intent after its admitted receiver returns', kind => {
    let admitted = true; const intent = receive(kind, () => true, () => admitted); expect(intent.current()).toBe(true);
    admitted = false; expect(intent.current()).toBe(false); admitted = true; expect(intent.current()).toBe(false);
  });
  it.each(['assembly', 'start'] as const)('retires a %s intent when its receiver predicate throws', kind => {
    let throws = false; const intent = receive(kind, () => true, () => { if (throws) throw new Error('Receiver unavailable'); return true; });
    expect(intent.current()).toBe(true); throws = true; expect(intent.current()).toBe(false);
    throws = false; expect(intent.current()).toBe(false);
  });
});
