/**
 * The revision ledger — doc_revisions as a tamper-evident, append-only chain.
 *
 * doc_revisions was already append-only BY CODE (the router only ever INSERTs)
 * — but nothing made tampering visible: a row UPDATEd in place, or deleted,
 * left no trace, so "the history is complete" was a discipline claim, not a
 * checkable one. For a store whose job is 21 CFR Part 11 §11.10(e) evidence,
 * that is the difference between an audit trail and a table named like one.
 *
 * This module makes the claim checkable:
 *
 *   - every new revision row carries `content_sha256` (hash of exactly the
 *     content it stores), `prev_chain_sha256` (the chain head it extended) and
 *     `chain_sha256` = H(prev ∥ content_sha256 ∥ created_by ∥ origin) — so the
 *     rows of one section form a hash chain, each link vouching for everything
 *     before it;
 *   - `origin` records WHICH write path produced the revision (human-edit,
 *     ai-draft-accept, revert, genesis, template-apply, pre-template-snapshot)
 *     — the lineage of the input kind, not just its author;
 *   - `inputs` snapshots the section's citation set (source refs + the
 *     checksums recorded at cite time) in force at the moment of the save —
 *     the documentary inputs each revision was drafted against, frozen with it;
 *   - a database trigger (20260817_doc_revisions_immutable_ledger.sql) refuses
 *     UPDATE and DELETE on the table outright, so append-only is enforced by
 *     the engine, not by code review;
 *   - `verifyLedger` walks a section's rows oldest-first and recomputes every
 *     hash and link, reporting exactly where the chain breaks if it does.
 *
 * Rows that predate the ledger carry NULL chain columns; verification counts
 * them honestly as pre-ledger rather than pretending the chain always existed.
 * A pre-ledger row appearing AFTER chained rows is reported as a break — new
 * writes have no excuse to be unchained.
 *
 * Concurrency: transactional writers serialize per section on the section-row
 * lock their UPDATE takes, so links do not fork. The one best-effort writer
 * (the AI-accept revision, deliberately outside its content transaction) could
 * fork under a race — verification DETECTS a fork (two rows extending one
 * head) rather than masking it.
 */

import crypto from 'crypto';

export type RevisionOrigin =
  | 'genesis'
  | 'human-edit'
  | 'ai-draft-accept'
  | 'revert'
  | 'template-apply'
  | 'pre-template-snapshot';

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value ?? '', 'utf8').digest('hex');
}

/** The chain link for one revision. `prevChain` is null for a section's first
 *  chained revision (the link then extends the literal 'genesis'). */
export function computeChainHash(args: {
  prevChain: string | null;
  contentSha256: string;
  createdBy: string;
  origin: string;
}): string {
  return sha256Hex(
    `${args.prevChain ?? 'genesis'}:${args.contentSha256}:${args.createdBy}:${args.origin}`,
  );
}

/** The row shape verification consumes (a subset of doc_revisions). */
export interface LedgerRow {
  id: string;
  content: string | null;
  created_by: string | null;
  origin: string | null;
  content_sha256: string | null;
  prev_chain_sha256: string | null;
  chain_sha256: string | null;
}

export interface LedgerBreak {
  revisionId: string;
  reason:
    | 'content-hash-mismatch'
    | 'chain-hash-mismatch'
    | 'link-mismatch'
    | 'unchained-after-adoption';
}

export interface LedgerVerdict {
  /** True when every chained row verifies and the chain is unbroken. */
  intact: boolean;
  chainedCount: number;
  /** Rows from before the ledger existed (NULL chain columns, all preceding
   *  the first chained row). Honest history, not a defect. */
  preLedgerCount: number;
  breaks: LedgerBreak[];
}

/**
 * Verify one section's revision rows, given OLDEST FIRST.
 *
 * Every verdict is recomputed from the stored content — nothing is trusted
 * from the hash columns except as claims to check.
 */
export function verifyLedger(rowsOldestFirst: LedgerRow[]): LedgerVerdict {
  const breaks: LedgerBreak[] = [];
  let chainedCount = 0;
  let preLedgerCount = 0;
  let adopted = false;
  let head: string | null = null;

  for (const row of rowsOldestFirst) {
    const isChained = row.chain_sha256 != null && row.content_sha256 != null;
    if (!isChained) {
      if (adopted) {
        // A write after the ledger existed has no excuse to be unchained.
        breaks.push({ revisionId: row.id, reason: 'unchained-after-adoption' });
      } else {
        preLedgerCount++;
      }
      continue;
    }

    chainedCount++;
    adopted = true;

    const contentSha = sha256Hex(row.content ?? '');
    if (contentSha !== row.content_sha256) {
      breaks.push({ revisionId: row.id, reason: 'content-hash-mismatch' });
      // The stored content no longer matches what was hashed at write time.
      // Continue against the STORED values so one tamper reports once rather
      // than cascading a mismatch into every later row.
    }

    if ((row.prev_chain_sha256 ?? null) !== head) {
      breaks.push({ revisionId: row.id, reason: 'link-mismatch' });
    }

    const expectedChain = computeChainHash({
      prevChain: row.prev_chain_sha256 ?? null,
      contentSha256: row.content_sha256!,
      createdBy: row.created_by ?? '',
      origin: row.origin ?? '',
    });
    if (expectedChain !== row.chain_sha256) {
      breaks.push({ revisionId: row.id, reason: 'chain-hash-mismatch' });
    }

    head = row.chain_sha256;
  }

  return { intact: breaks.length === 0, chainedCount, preLedgerCount, breaks };
}
