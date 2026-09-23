/**
 * The leaf-writing binding for the document lifecycle — the `placed` transition.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * `documentLifecycleOrchestrator` refuses `placed` outright when no `upsertLeaf`
 * binding is configured, and the live route
 * (`server/routes/document-lifecycle.ts`) built its bindings without one. So
 * `placed` was unreachable through the product: every attempt came back
 * `PLACEMENT_BINDING_NOT_WIRED`.
 *
 * That refusal was correct. `lifecycleBindings.ts` records what it replaced — a
 * default that minted `leaf:${randomUUID()}` and wrote no `submission_leaves`
 * row at all, so documents reached `placed` citing a leaf that did not exist,
 * persisted and attested in the hash-chained audit trail. Refusing beat lying.
 * This module is the real writer that makes refusing unnecessary.
 *
 * ── The two key spaces ───────────────────────────────────────────────────────
 * A canonical document carries `sourceRefs`, each naming the store row it
 * reconciles and — crucially — its `idKind`. `submission_leaves` addresses both
 * of those spaces: integer `document_id` for most stores, uuid `document_uuid`
 * for `vault_documents`. This binding picks the source the assembler can
 * actually materialise and hands `upsertLeaf` the matching one; `upsertLeaf`
 * then enforces that the table and the key space agree.
 *
 * ── It refuses rather than guesses, in three places ──────────────────────────
 *   - no `sequenceId` on the placement. `registryId` is an application TYPE
 *     ('US_IND'), not a row, and an organisation can hold several submissions
 *     each with a sequence 0000. Choosing one would file a document into a
 *     submission nobody picked.
 *   - no source the assembler can resolve. A leaf pointing at a store the
 *     packager has no branch for assembles to nothing and blocks dispatch.
 *   - a uuid source whose native id is not a uuid (or the reverse). The stores
 *     disagree about key type and the reconciliation is the whole point; a
 *     coerced id resolves to the wrong row or to none.
 *
 * @module server/services/regulatory/lifecycle-leaf-binding
 */
import type { CanonicalDocument } from '../../../shared/regulatory/canonical-document';
import { SOURCE_ID_KIND } from '../../../shared/regulatory/canonical-document';
import type { DossierPlacement } from '../../../shared/regulatory/document-lifecycle';
import { RESOLVABLE_DOCUMENT_TABLES } from '../ectd/leaf-document-tables';

/** Why the binding could not write a leaf. Carried as a code so the route can
 *  answer with the orchestrator's own refusal shape rather than a 500. */
export type LeafBindingRefusalCode =
  | 'PLACEMENT_SEQUENCE_REQUIRED'
  | 'NO_RESOLVABLE_SOURCE'
  | 'SOURCE_ID_KIND_MISMATCH';

export class LeafBindingRefusal extends Error {
  readonly code: LeafBindingRefusalCode;
  constructor(code: LeafBindingRefusalCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'LeafBindingRefusal';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What `submission-service.upsertLeaf` needs, narrowed to what this binding sets. */
export interface LeafWriteInput {
  sequenceId: number;
  sectionCode: string;
  title: string;
  documentTable: string;
  documentId?: number | null;
  documentUuid?: string | null;
}

export interface UpsertLeafBindingDeps {
  /** submission-service.upsertLeaf, injected so this module stays testable. */
  upsertLeaf: (
    input: LeafWriteInput,
    ctx: { organizationId: number; userId: number },
  ) => Promise<{ id: number }>;
  organizationId: number;
  userId: number;
}

/**
 * Choose the source row a leaf should point at.
 *
 * Preference order is "what the packager can materialise", not "what was added
 * first": a document reconciling both an authoring row and a vault binary
 * should file the artefact the agency receives. Among resolvable sources, a
 * `placement`-role ref wins because that is the facet that exists to say where
 * the document is filed.
 */
export function chooseLeafSource(doc: CanonicalDocument): CanonicalDocument['sourceRefs'][number] | null {
  const resolvable = (doc.sourceRefs ?? []).filter((r) => RESOLVABLE_DOCUMENT_TABLES.has(r.system));
  if (resolvable.length === 0) return null;
  return resolvable.find((r) => r.role === 'placement') ?? resolvable[0];
}

/** Build the orchestrator's `upsertLeaf` binding over the real leaf writer. */
export function makeUpsertLeafBinding(deps: UpsertLeafBindingDeps) {
  return async function upsertLeafBinding(
    doc: CanonicalDocument,
    placement: DossierPlacement,
  ): Promise<{ leafId: string }> {
    if (!Number.isInteger(placement.sequenceId) || (placement.sequenceId as number) <= 0) {
      throw new LeafBindingRefusal(
        'PLACEMENT_SEQUENCE_REQUIRED',
        'The placement carries no sequenceId. registryId names an application type, not a sequence row, ' +
          'and an organisation can hold several submissions each with a sequence 0000 — so the sequence ' +
          'to file into must be chosen, not inferred.',
      );
    }

    const source = chooseLeafSource(doc);
    if (!source) {
      throw new LeafBindingRefusal(
        'NO_RESOLVABLE_SOURCE',
        'No source row on this document is a table the assembler can materialise, so a leaf pointing at ' +
          'one would assemble to nothing and block dispatch. Resolvable tables: ' +
          [...RESOLVABLE_DOCUMENT_TABLES].sort().join(', ') + '.',
      );
    }

    // The store's declared key type governs, not the ref's own claim: the two
    // disagreeing is exactly the reconciliation bug this model exists to catch.
    const kind = SOURCE_ID_KIND[source.system];
    if (kind === 'uuid') {
      if (!UUID_RE.test(source.nativeId)) {
        throw new LeafBindingRefusal(
          'SOURCE_ID_KIND_MISMATCH',
          `${source.system} is uuid-keyed but its native id "${source.nativeId}" is not a uuid.`,
        );
      }
    } else if (!/^[1-9]\d*$/.test(source.nativeId)) {
      throw new LeafBindingRefusal(
        'SOURCE_ID_KIND_MISMATCH',
        `${source.system} is integer-keyed but its native id "${source.nativeId}" is not a positive integer.`,
      );
    }

    const row = await deps.upsertLeaf(
      {
        sequenceId: placement.sequenceId as number,
        sectionCode: placement.sectionCode,
        title: doc.title,
        documentTable: source.system,
        ...(kind === 'uuid'
          ? { documentUuid: source.nativeId }
          : { documentId: Number(source.nativeId) }),
      },
      { organizationId: deps.organizationId, userId: deps.userId },
    );

    return { leafId: String(row.id) };
  };
}
