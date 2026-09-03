/**
 * `governedActor` is the one place a governed write's actor is decided when it
 * is not a signature. It must hand back the real user when there is one and a
 * named machine actor when there is not — and never a person-shaped guess like
 * `user-41@system.local` (ledger L142).
 */
import { describe, it, expect } from 'vitest';
import {
  governedActor,
  isSystemActorEmail,
  systemActorEmail,
  SYSTEM_ACTOR_DOMAIN,
} from '../governed-actor';
import { resolveGovernedContext } from '../../concept2cure/governedDocumentContractService';

describe('governedActor', () => {
  it('attributes to the real user and adds no email at all', () => {
    expect(governedActor(41, 'auto-extraction')).toEqual({ userId: 41 });
  });

  it.each([0, -1, NaN, null, undefined])('names the component when the user is %s', (u) => {
    const actor = governedActor(u as number | null | undefined, 'auto-extraction');
    expect(actor).toEqual({ userId: 0, userEmail: `system+auto-extraction@${SYSTEM_ACTOR_DOMAIN}` });
    expect(isSystemActorEmail(actor.userEmail)).toBe(true);
  });

  it('never produces the person-shaped forms the fabricated-identity gate rejects', () => {
    const email = governedActor(undefined, 'artifact-tagger').userEmail!;
    expect(email).not.toMatch(/user-\d/);
    expect(email).not.toMatch(/@(system|unknown)\.local$/);
  });

  it('refuses a component name that is not a stable kebab-case identifier', () => {
    expect(() => systemActorEmail('Auto Extraction')).toThrow(/kebab-case/);
    expect(() => systemActorEmail('')).toThrow(/kebab-case/);
  });

  it('does not mistake a person for a system actor', () => {
    expect(isSystemActorEmail('system@concept2cure.local')).toBe(false);
    expect(isSystemActorEmail('qa@example.com')).toBe(false);
    expect(isSystemActorEmail(null)).toBe(false);
  });

  it('is what resolveGovernedContext reads: the user id, or the named actor', () => {
    const ctx = (actor: ReturnType<typeof governedActor>) =>
      resolveGovernedContext({
        req: { body: { projectId: 1, metadata: {} }, userRole: 'regulatory', ...actor } as never,
        projectId: 1,
        artifactId: null,
        documentType: 'module3',
        generationMode: 'manual',
        lifecycleStatus: 'draft',
        title: 'Actor attribution probe',
        content: '## Materials\nEnough content to clear the editor-payload length gate for this probe.',
        sourceRefs: ['probe-source-001'],
      } as never);
    const human = ctx(governedActor(41, 'auto-extraction')).contract;
    expect(human.auditEventPayload.actorId).toBe('41');
    expect(human.provenancePayload.generatedBy).toBe('41');
    const machine = ctx(governedActor(0, 'auto-extraction')).contract;
    expect(machine.auditEventPayload.actorId).toBe(`system+auto-extraction@${SYSTEM_ACTOR_DOMAIN}`);
    expect(machine.provenancePayload.generatedBy).toBe(`system+auto-extraction@${SYSTEM_ACTOR_DOMAIN}`);
  });
});
