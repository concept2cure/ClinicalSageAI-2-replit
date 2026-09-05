/**
 * eCTD v3.2.2 → v4.0 forward-compatibility mapper.
 *
 * When an application moves from the v3.2.2 folder/heading/leaf model to the
 * v4.0 RPS object graph, each v3.2.2 leaf becomes a v4.0 **Document** + a
 * **Context of Use** that presents it. Lifecycle operations translate:
 *
 *   v3.2.2 leaf operation   →   v4.0 RPS operation      CoU behaviour
 *   ─────────────────────       ──────────────────      ─────────────
 *   new                     →   create                  fresh CoU
 *   replace                 →   revise                  new CoU, relatedContextOfUse → prior
 *   append                  →   append                  new CoU, relatedContextOfUse → prior
 *   delete                  →   remove                  CoU status suspended, related → prior
 *
 * CTD sections map to CoU codes: Module 1 US sections use the FDA context-of-use
 * genericode list (`us_1.x`, CL2); Modules 2–5 use ICH-governed CoU codes
 * (the ICH CoU code system) derived from the CTD section. Documents are keyed
 * on a stable business key so the same document is REUSED (not duplicated)
 * across sequences and CoUs — a core v4.0 feature.
 *
 * Deterministic: same leaves + application ⇒ same UUIDs ⇒ same message bytes.
 *
 * @module server/services/ectd/ectd4/forward-compat
 */

import {
  oidForV4List,
  isValidV4Code,
  ICH_ECTD_V4_IG_OID,
} from '../controlled-vocab';
import type { EctdLeaf } from '../../submission-gateways/regional-packager';
import { contextOfUseId, documentId } from './ids';
import type {
  RpsContextOfUse,
  RpsDocument,
  RpsMessageInput,
  RpsOperation,
  RpsApplication,
  RpsSubmission,
  RpsSubmissionUnit,
} from './types';

/** ICH eCTD v4.0 context-of-use code system OID (governs Module 2–5 CoU codes). */
export const ICH_COU_OID = `${ICH_ECTD_V4_IG_OID}.1.2`;

/** Map a v3.2.2 leaf lifecycle operation to its RPS operation code. */
export function mapOperation(op: EctdLeaf['operation']): RpsOperation {
  switch (op) {
    case 'new': return 'create';
    case 'replace': return 'revise';
    case 'append': return 'append';
    case 'delete': return 'remove';
    default: return 'create';
  }
}

/**
 * Map a CTD section to its v4.0 CoU code + governing code-system OID.
 * Module 1 → FDA `us_<section>` (CL2, validated); Modules 2–5 → ICH CoU code
 * (`ich_<section>`) under the ICH CoU code system.
 */
export function sectionToCou(ctdSection: string): { code: string; codeSystem: string; governed: 'fda' | 'ich' } {
  if (ctdSection.startsWith('1')) {
    const code = `us_${ctdSection}`;
    // Only emit the FDA CL2 code system when the code is a known member;
    // otherwise fall back to ICH so we never assert an invalid FDA code.
    if (isValidV4Code('contextOfUse', code)) {
      return { code, codeSystem: oidForV4List('contextOfUse'), governed: 'fda' };
    }
  }
  return { code: `ich_${ctdSection.toLowerCase()}`, codeSystem: ICH_COU_OID, governed: 'ich' };
}

/** Stable business key for the document a leaf carries (section + filename). */
function documentKey(leaf: EctdLeaf): string {
  return `${leaf.ctdSection}|${leaf.fileName}`;
}

export interface ForwardCompatInput {
  application: RpsApplication;
  submission: RpsSubmission;
  submissionUnit: RpsSubmissionUnit;
  /** v3.2.2 leaves for this sequence. */
  leaves: EctdLeaf[];
  /** Prior sequence number, when this sequence carries lifecycle operations
   *  (replace/append/delete) that supersede CoUs from an earlier sequence. */
  priorSequenceNumber?: string;
  /** SHA-256 of each leaf's bytes, keyed by absolute sourcePath. eCTD v4.0
   *  documents are integrity-checked with SHA-256; when a hash is absent the
   *  document's integrity check is left EMPTY (honestly "not computed") and a
   *  note is emitted — a metadata-derived placeholder is NEVER fabricated. */
  sha256ByPath?: Record<string, string>;
}

/** Result of a forward-compat conversion. */
export interface ForwardCompatResult {
  message: RpsMessageInput;
  /** Non-fatal notes (e.g. a Module 2–5 section mapped to an ICH-governed CoU
   *  code that this service does not locally validate). */
  notes: string[];
}

/**
 * Convert a v3.2.2 leaf set into a v4.0 RPS message input.
 * Deterministic given deterministic ids; documents are de-duplicated by
 * business key so a document referenced by multiple CoUs is emitted once.
 */
export function forwardCompatToV4(input: ForwardCompatInput): ForwardCompatResult {
  const notes: string[] = [];
  let hashesMissing = false;
  const app = input.application.number;
  const seq = input.submissionUnit.sequenceNumber;

  const documents = new Map<string, RpsDocument>();
  const contextsOfUse: RpsContextOfUse[] = [];

  input.leaves.forEach((leaf, index) => {
    const docKey = documentKey(leaf);
    const { code, codeSystem, governed } = sectionToCou(leaf.ctdSection);
    if (governed === 'ich') {
      notes.push(`Section ${leaf.ctdSection} mapped to ICH-governed CoU code "${code}" (not locally validated against an ICH CoU list).`);
    }

    // Document (reused across CoUs by business key).
    const docId = documentId(app, docKey);
    if (!documents.has(docKey)) {
      // Use ONLY a real per-leaf content hash. When none was supplied, leave the
      // integrity check EMPTY (honestly "not computed") — never hash the leaf's
      // metadata (app|section|filename) into a 64-hex string that is
      // indistinguishable from a real SHA-256 and would silently pass a format
      // check as if it were the content hash. forward-compat is a v3→v4
      // structural preview; the real filing path (packageRpsSubmission) computes
      // every integrity hash from the actual leaf bytes.
      const sha = (leaf.sourcePath && input.sha256ByPath?.[leaf.sourcePath]) || '';
      if (!sha) hashesMissing = true;
      documents.set(docKey, {
        id: docId,
        title: leaf.title,
        href: `${leaf.ctdSection.replace(/\./g, '-')}/${leaf.fileName}`,
        mediaType: leaf.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        checksum: sha,
        checksumType: 'SHA256',
      });
    }

    const operation = mapOperation(leaf.operation);
    const isLifecycle = operation !== 'create';
    const cou: RpsContextOfUse = {
      id: contextOfUseId(app, code, `${docKey}|${seq}`),
      code,
      codeSystem,
      title: leaf.title,
      priorityNumber: index + 1,
      status: operation === 'remove' ? 'suspended' : 'active',
      documentId: docId,
      operation,
    };
    if (isLifecycle && input.priorSequenceNumber) {
      cou.relatedContextOfUseId = contextOfUseId(app, code, `${docKey}|${input.priorSequenceNumber}`);
    }
    contextsOfUse.push(cou);
  });

  if (hashesMissing) {
    notes.push(
      'Document integrity hashes were NOT computed (no per-leaf SHA-256 supplied): this is a v4 structural preview, not a filing-ready message. Package via packageRpsSubmission to compute every integrity hash from the actual leaf bytes.',
    );
  }

  return {
    message: {
      submissionUnit: input.submissionUnit,
      submission: input.submission,
      application: input.application,
      contextsOfUse,
      documents: [...documents.values()],
    },
    notes,
  };
}
