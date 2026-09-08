/**
 * An unwired binding must REFUSE the transition, never invent its result.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `buildLifecycleBindings` supplied fallback implementations for the two
 * bindings that touch the filing: `upsertLeaf` returned `leaf:${randomUUID()}`
 * without writing a submission_leaves row, and `assemble` returned a sha256 over
 * the STRING `"${doc.id}:${contentHash}"` — bytes no file ever had. The live
 * route (server/routes/document-lifecycle.ts) constructs its bindings with
 * neither dependency, so both fallbacks were the ones actually running.
 *
 * The orchestrator then promoted those results into durable state
 * (`placement.leafId`, `packagingValidated: true`), the route sealed an
 * exportFacet md5/sha256 over the same fabricated string, and the whole thing
 * was persisted with a hash-chained audit entry attesting it. A document could
 * therefore reach `placed` citing a leaf that does not exist and `packaged`
 * carrying a package digest for a package that was never built.
 *
 * That is the failure CLAUDE.md's "fail closed, never fabricate" exists to
 * prevent, and in a Part 11 record it is a falsified one. A missing binding is
 * now a blocked transition, reported through the same `blockedBy` channel the
 * canonical gate already uses.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  projectCanonicalDocument,
  advanceDocument,
  type LifecycleBindings,
  type ProjectionInput,
} from '../documentLifecycleOrchestrator';
import type { RegulatedDocumentState, DossierPlacement } from '../../../../shared/regulatory/document-lifecycle';

const UUID = '44444444-4444-4444-8444-444444444444';
const placement: DossierPlacement = { registryId: 'US_IND', ctdModule: 'M3', sectionCode: '3.2.S' };

function projection(): ProjectionInput {
  return {
    canonicalId: UUID,
    title: 'Drug Substance',
    documentType: 'ICH_M3_DS',
    organizationId: 1,
    version: 1,
    stage: 'authoring',
    createdAt: 't',
    updatedAt: 't',
    sources: { coauthor_documents: { nativeId: 42, role: 'authoring' } },
    hasContent: true,
    contentHash: 'h',
    audit: [],
  };
}
const doc = () => projectCanonicalDocument(projection()).document;
const APPROVAL = { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' as const };
const state = (o: Partial<RegulatedDocumentState> = {}): RegulatedDocumentState => ({
  documentId: UUID, title: 'Drug Substance', stage: 'authoring', version: 1, hasContent: true, ...o,
});
/** An approved document that the canonical gate will let advance to `placed`. */
const approved = () => state({ stage: 'approved', approvalSignature: APPROVAL });
/** A placed document the gate will let advance to `packaged`. */
const placedState = () =>
  state({ stage: 'placed', approvalSignature: APPROVAL, placement: { ...placement, leafId: 'real-leaf-7' } });

/** Bindings with the two filing-side dependencies deliberately absent — the shape the live route builds. */
function bindingsWithout(omit: 'upsertLeaf' | 'assemble' | 'both'): LifecycleBindings & { audited: number } {
  const b: any = {
    audited: 0,
    registerGovernedDocument: vi.fn(async () => {}),
    applySignature: vi.fn(async (_d: unknown, meaning: string) => ({
      actor: 'ra', role: 'ra', signatureRef: 'sig-1', signedAt: 't', meaning,
    })),
    audit: vi.fn(async function (this: unknown) { b.audited += 1; }),
  };
  if (omit !== 'upsertLeaf' && omit !== 'both') b.upsertLeaf = vi.fn(async () => ({ leafId: 'real-leaf-7' }));
  if (omit !== 'assemble' && omit !== 'both') b.assemble = vi.fn(async () => ({ packageSha256: 'realsha' }));
  return b;
}

const ctx = { actor: 'ra', at: '2026-09-03T00:00:00.000Z', contentHash: 'h' };

describe('advanceDocument — a missing filing binding blocks the transition', () => {
  it('refuses `placed` when upsertLeaf is not wired, and invents no leaf id', async () => {
    const bindings = bindingsWithout('upsertLeaf');
    const res = await advanceDocument(approved(), 'placed', { ...ctx, placement }, bindings, doc());

    expect(res.ok, 'a placement with no leaf writer must not succeed').toBe(false);
    expect(res.blockedBy?.join(' ')).toMatch(/upsertLeaf/i);
    // Nothing advanced and nothing was invented.
    expect(res.state.stage).toBe('approved');
    expect(res.state.placement?.leafId).toBeUndefined();
    // A refused transition writes no audit event — the trail must not attest it.
    expect(bindings.audited).toBe(0);
  });

  it('refuses `packaged` when assemble is not wired, and does not claim packaging was validated', async () => {
    const bindings = bindingsWithout('assemble');
    const res = await advanceDocument(placedState(), 'packaged', ctx, bindings, doc());

    expect(res.ok).toBe(false);
    expect(res.blockedBy?.join(' ')).toMatch(/assemble/i);
    expect(res.state.stage).toBe('placed');
    expect(res.state.packagingValidated).toBeFalsy();
    expect(bindings.audited).toBe(0);
  });

  it('still advances normally when the bindings ARE wired, using the real leaf id and package digest', async () => {
    const bindings = bindingsWithout('assemble' as never); // both present
    const wired = bindingsWithout('never' as never);

    const placedRes = await advanceDocument(approved(), 'placed', { ...ctx, placement }, wired, doc());
    expect(placedRes.ok).toBe(true);
    expect(placedRes.state.placement?.leafId).toBe('real-leaf-7');

    const packagedRes = await advanceDocument(placedState(), 'packaged', ctx, wired, doc());
    expect(packagedRes.ok).toBe(true);
    expect(packagedRes.state.packagingValidated).toBe(true);
    // The package digest reaches the caller, so a seal is written from a real
    // assembly rather than recomputed from an identifier string.
    expect(packagedRes.packageSha256).toBe('realsha');
    void bindings;
  });
});
