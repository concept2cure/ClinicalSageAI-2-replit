/**
 * Vault — the project's governed artifacts (fold F3 slice A, D2, 2026-10-29).
 *
 * GET /api/c2c/project-vault/:id returns every non-archived
 * concept2cure_artifacts row of the project as the "Governed artifacts" branch
 * of its tree, grouped by CTD module, and an `artifacts` block that counts it.
 * The tree is drawn by Vault.tsx like any branch; this file holds the two
 * things the branch adds:
 *
 *   GovernedArtifactsLane    — the status breakdown, with honest states: a
 *                              branch the server could not read is said as a
 *                              failure, and a project with none says so.
 *   ArtifactGovernanceDetail — one artifact's governance in the detail pane:
 *                              kind, format, origin, model, author, signature
 *                              on the current version (four states), human
 *                              review, cited sources and the recorded hash.
 *
 * The signature states are shared/artifact-governance.ts, the Artifacts
 * center's rule. Every value shown is one the server read; what a row does not
 * record is said as not recorded, never filled in.
 */
import React from 'react';

import { I } from '../icons';
import { vaultStatus, type VaultDoc, type VaultArtifactFacts } from '../fixtures/vault-data';
import { ARTIFACT_ORIGIN_LABELS, type ArtifactSignatureState } from '@shared/artifact-governance';

/** The read's `artifacts` block (server/routes/c2c/project-vault.ts). */
export interface GovernedArtifactsBlock {
  /** Every artifact of the project. */
  total: number;
  /** By leaf status, over the listed artifacts. */
  byStatus: Record<string, number>;
  signatures: Record<ArtifactSignatureState, number>;
  reviewed: number;
  window: { shown: number; total: number; truncated: boolean };
}

/** The branch's name, as the server sends it in the tree and in `unavailable`. */
export const ARTIFACTS_BRANCH = 'Governed artifacts';

/** Statuses in lifecycle order; anything else follows, labelled by the chip vocabulary. */
const STATUS_ORDER = ['draft', 'review', 'approved', 'final'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One artifact's signature, said in words. */
export function artifactSignatureLine(a: Pick<VaultArtifactFacts, 'signature' | 'signedVersion'>, ver: string): string {
  switch (a.signature) {
    case 'current':
      return 'Signed on the current version (21 CFR Part 11 e-signature)';
    case 'stale':
      return `Signed on v${a.signedVersion} only; the current version (${ver}) is not signed`;
    case 'unknown':
      return 'Signed; the version the signature covers could not be determined';
    default:
      return 'Not signed';
  }
}

export function GovernedArtifactsLane({
  block,
  unavailableReason,
  onOpen,
}: {
  block?: GovernedArtifactsBlock;
  /** The server's `unavailable` reason for the branch, when it could not be read. */
  unavailableReason?: string | null;
  /** Open the branch in the tree. */
  onOpen: () => void;
}) {
  if (unavailableReason) {
    return (
      <div className="vd-dr" data-testid="vault-artifacts-lane">
        <div className="vd-dr-head">
          <span className="vd-dr-title">{I.shieldCheck} {ARTIFACTS_BRANCH}</span>
        </div>
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} The project’s governed artifacts could not be read, so none are listed. This is
          not an empty registry. {unavailableReason}
        </div>
      </div>
    );
  }
  // An older server, or a store not provisioned at all: nothing was read, so nothing is claimed.
  if (!block) return null;
  const statuses = [
    ...STATUS_ORDER.filter((s) => block.byStatus[s]),
    ...Object.keys(block.byStatus).filter((s) => !STATUS_ORDER.includes(s) && block.byStatus[s]),
  ];
  const sig = block.signatures;
  return (
    <div className="vd-dr" data-testid="vault-artifacts-lane">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.shieldCheck} {ARTIFACTS_BRANCH}</span>
        <span className="vd-dr-meta">
          {plural(block.total, 'governed artifact', 'governed artifacts')} in this project
          {block.window.truncated
            ? ` · the newest ${block.window.shown} are listed, and the counts below cover them`
            : ''}
        </span>
        {block.total > 0 && (
          <button className="vd-dr-toggle" onClick={onOpen}>
            Open governed artifacts
          </button>
        )}
      </div>
      {block.total === 0 ? (
        <div className="vd-dr-empty">
          No governed artifacts in this project yet. What AnA drafts for it, the Module 3 sections the CMC
          compile composes and imported files are listed here once they are filed.
        </div>
      ) : (
        <>
          <div className="vd-dr-stages" aria-label="Governed artifacts by status">
            {statuses.map((s) => (
              <span key={s} className="vd-dr-stage">
                {vaultStatus(s).label} <b>{block.byStatus[s]}</b>
              </span>
            ))}
          </div>
          <div className="vd-dr-stages" aria-label="Signature and review of the current version">
            <span className="vd-dr-stage">
              Signed on the current version <b>{sig.current}</b>
            </span>
            {sig.stale > 0 && (
              <span className="vd-dr-stage">
                Signed on an earlier version only <b>{sig.stale}</b>
              </span>
            )}
            {sig.unknown > 0 && (
              <span className="vd-dr-stage">
                Signed, version not determined <b>{sig.unknown}</b>
              </span>
            )}
            <span className="vd-dr-stage">
              Human review recorded <b>{block.reviewed}</b>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What AnA is told of the branch: the project's count and the breakdown of what
 * the window lists, or, when the branch could not be read, that the counts are
 * unknown. A failed read published as zeros would make AnA confidently wrong
 * about a customer's record.
 */
export function governedArtifactsFacts(
  block: GovernedArtifactsBlock | undefined,
  unavailable: ReadonlyArray<{ branch: string }> | undefined,
) {
  if (block) {
    return {
      total: block.total,
      byStatus: block.byStatus,
      signedOnCurrentVersion: block.signatures.current,
      signedOnEarlierVersionOnly: block.signatures.stale,
      signedVersionUnknown: block.signatures.unknown,
      humanReviewRecorded: block.reviewed,
      listTruncated: block.window.truncated,
    };
  }
  return unavailable?.some((u) => u.branch === ARTIFACTS_BRANCH) ? 'unavailable — counts unknown, not zero' : null;
}

/** A selected artifact's state for AnA, as the registry records it; null for any other leaf. */
export function artifactSelectionFacts(doc: VaultDoc) {
  const a = doc.artifact;
  if (!a) return null;
  return {
    kind: a.kind,
    format: a.format,
    origin: a.origin,
    model: a.model,
    signature: a.signature,
    signedVersion: a.signedVersion,
    humanReviewRecorded: a.reviewed,
    citedSources: a.sourceCount,
  };
}

function Row({ k, children, title }: { k: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="vd-d-filing-row">
      <span className="k">{k}</span>
      <span className="v" title={title}>{children}</span>
    </div>
  );
}

export function ArtifactGovernanceDetail({ doc }: { doc: VaultDoc }) {
  const a = doc.artifact;
  if (!a) return null;
  return (
    <>
      <div className="vd-d-seclbl">Governed artifact</div>
      <div className="vd-d-filing" data-testid="vault-artifact-governance">
        <Row k="Kind">{a.kind}</Row>
        <Row k="Format">{a.format ? a.format.toUpperCase() : 'Not recorded'}</Row>
        <Row k="Origin">{a.origin ? ARTIFACT_ORIGIN_LABELS[a.origin] : 'Not recorded'}</Row>
        <Row k="Model">{a.model ?? 'Not recorded'}</Row>
        <Row k="Author">{a.author ?? 'Not recorded'}</Row>
        <Row k="CTD section">{a.ctdSection ? <span className="mono">{a.ctdSection}</span> : 'None'}</Row>
        <Row k="Signature">{artifactSignatureLine(a, doc.ver)}</Row>
        <Row k="Human review">
          {a.reviewed ? 'Recorded on the current version' : 'Required: none recorded on the current version'}
        </Row>
        <Row k="Cited sources">{a.sourceCount}</Row>
        {a.contentHash && (
          <Row k="Recorded hash" title={a.contentHash}>
            <span className="mono vd-d-hash">{a.contentHash.slice(0, 16)}…</span>
          </Row>
        )}
      </div>
    </>
  );
}
