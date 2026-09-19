/**
 * The leaf-writing binding — what finally makes `placed` reachable.
 *
 * The orchestrator refuses `placed` when no `upsertLeaf` binding is configured,
 * and the live route built its bindings without one, so `placed` was
 * unreachable through the product. That refusal was RIGHT: the default it
 * replaced minted a `leaf:${uuid}` for a submission_leaves row that was never
 * written, and attested it in the hash-chained audit trail. These pin the real
 * writer, and — more importantly — the three places it still refuses, because a
 * binding that guesses is the defect the refusal was protecting against.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeUpsertLeafBinding,
  chooseLeafSource,
  LeafBindingRefusal,
} from '../lifecycle-leaf-binding';
import type { CanonicalDocument } from '../../../../shared/regulatory/canonical-document';
import type { DossierPlacement } from '../../../../shared/regulatory/document-lifecycle';

const VAULT_UUID = '3f1c9b20-0000-4000-8000-0000000012ab';

const doc = (sourceRefs: CanonicalDocument['sourceRefs']): CanonicalDocument =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'CSR-201',
    documentType: 'ICH_CSR',
    organizationId: 7,
    currentVersionId: 'v1',
    sourceRefs,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }) as unknown as CanonicalDocument;

const placement = (over: Partial<DossierPlacement> = {}): DossierPlacement => ({
  registryId: 'US_IND',
  ctdModule: 'M3',
  sectionCode: '3.2.P.8.3',
  sequenceId: 9,
  ...over,
});

let upsertLeaf: ReturnType<typeof vi.fn>;
const bind = () =>
  makeUpsertLeafBinding({ upsertLeaf: upsertLeaf as never, organizationId: 7, userId: 3 });

beforeEach(() => {
  upsertLeaf = vi.fn(async () => ({ id: 77 }));
});

describe('it writes a real leaf, in the right key space', () => {
  it('files an integer-keyed source by document_id', async () => {
    const d = doc([{ system: 'coauthor_documents', nativeId: '55', idKind: 'integer', role: 'authoring' }]);
    const out = await bind()(d, placement());

    expect(out).toEqual({ leafId: '77' });
    const [input, ctx] = upsertLeaf.mock.calls[0];
    expect(input).toMatchObject({
      sequenceId: 9,
      sectionCode: '3.2.P.8.3',
      title: 'CSR-201',
      documentTable: 'coauthor_documents',
      documentId: 55,
    });
    expect(input.documentUuid).toBeUndefined();
    expect(ctx).toEqual({ organizationId: 7, userId: 3 });
  });

  it('files a uuid-keyed source by document_uuid', async () => {
    // vault.documents is uuid-keyed; sending an integer would name nothing.
    const d = doc([{ system: 'vault_documents', nativeId: VAULT_UUID, idKind: 'uuid', role: 'artifact' }]);
    await bind()(d, placement());

    const [input] = upsertLeaf.mock.calls[0];
    expect(input).toMatchObject({ documentTable: 'vault_documents', documentUuid: VAULT_UUID });
    expect(input.documentId).toBeUndefined();
  });

  it('returns the leaf the writer actually created', async () => {
    upsertLeaf.mockResolvedValue({ id: 4242 });
    const d = doc([{ system: 'coauthor_documents', nativeId: '1', idKind: 'integer', role: 'authoring' }]);
    expect(await bind()(d, placement())).toEqual({ leafId: '4242' });
  });
});

describe('choosing which source a leaf points at', () => {
  it('prefers a placement-role source over another resolvable one', async () => {
    const d = doc([
      { system: 'coauthor_documents', nativeId: '55', idKind: 'integer', role: 'authoring' },
      { system: 'vault_documents', nativeId: VAULT_UUID, idKind: 'uuid', role: 'placement' },
    ]);
    expect(chooseLeafSource(d)?.system).toBe('vault_documents');
  });

  it('ignores a source the assembler cannot materialise', async () => {
    // concept2cure_artifacts is a real source system and NOT a resolvable leaf
    // table: a leaf pointing at it assembles to nothing.
    const d = doc([
      { system: 'concept2cure_artifacts', nativeId: VAULT_UUID, idKind: 'uuid', role: 'placement' },
      { system: 'coauthor_documents', nativeId: '55', idKind: 'integer', role: 'authoring' },
    ]);
    expect(chooseLeafSource(d)?.system).toBe('coauthor_documents');
  });
});

describe('it refuses rather than guesses', () => {
  const refusal = async (d: CanonicalDocument, p: DossierPlacement) => {
    try {
      await bind()(d, p);
    } catch (err) {
      if (err instanceof LeafBindingRefusal) return err;
      throw err;
    }
    throw new Error('the binding wrote a leaf where it should have refused');
  };

  it('refuses a placement with no sequenceId', async () => {
    // registryId is an application TYPE, not a row. An organisation can hold
    // several submissions each with a sequence 0000, so picking one would file
    // the document into a submission nobody chose.
    const d = doc([{ system: 'coauthor_documents', nativeId: '55', idKind: 'integer', role: 'authoring' }]);
    const err = await refusal(d, placement({ sequenceId: undefined }));
    expect(err.code).toBe('PLACEMENT_SEQUENCE_REQUIRED');
    expect(upsertLeaf).not.toHaveBeenCalled();
  });

  it('refuses a non-positive sequenceId rather than coercing it', async () => {
    const d = doc([{ system: 'coauthor_documents', nativeId: '55', idKind: 'integer', role: 'authoring' }]);
    expect((await refusal(d, placement({ sequenceId: 0 }))).code).toBe('PLACEMENT_SEQUENCE_REQUIRED');
  });

  it('refuses when no source is resolvable, naming the tables that are', async () => {
    const d = doc([{ system: 'concept2cure_artifacts', nativeId: VAULT_UUID, idKind: 'uuid', role: 'placement' }]);
    const err = await refusal(d, placement());
    expect(err.code).toBe('NO_RESOLVABLE_SOURCE');
    expect(err.message).toMatch(/coauthor_documents/);
    expect(upsertLeaf).not.toHaveBeenCalled();
  });

  it('refuses when no source exists at all', async () => {
    expect((await refusal(doc([]), placement())).code).toBe('NO_RESOLVABLE_SOURCE');
  });

  it('refuses a uuid-keyed store whose native id is not a uuid', async () => {
    // The stores disagree about key type and reconciling them is the whole
    // point; a coerced id resolves to the wrong row or to none.
    const d = doc([{ system: 'vault_documents', nativeId: '55', idKind: 'uuid', role: 'artifact' }]);
    expect((await refusal(d, placement())).code).toBe('SOURCE_ID_KIND_MISMATCH');
    expect(upsertLeaf).not.toHaveBeenCalled();
  });

  it('refuses an integer-keyed store whose native id is not an integer', async () => {
    const d = doc([{ system: 'coauthor_documents', nativeId: VAULT_UUID, idKind: 'integer', role: 'authoring' }]);
    expect((await refusal(d, placement())).code).toBe('SOURCE_ID_KIND_MISMATCH');
  });

  it('trusts the STORE key kind, not the ref claim', async () => {
    // A ref claiming integer for a uuid-keyed store is itself the bug. The
    // store's declared kind governs, so this is caught rather than obeyed.
    const d = doc([{ system: 'vault_documents', nativeId: '55', idKind: 'integer', role: 'artifact' }]);
    expect((await refusal(d, placement())).code).toBe('SOURCE_ID_KIND_MISMATCH');
  });
});
