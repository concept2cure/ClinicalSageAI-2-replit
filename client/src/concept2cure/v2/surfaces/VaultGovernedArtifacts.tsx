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
 *
 * Slice B (2026-10-29) completes the leaf by reaching what already exists:
 *
 *   ArtifactVersions      — GET /api/concept2cure/projects/:p/artifacts/:a/versions
 *                           (server/routes/c2c/artifacts.ts), organization- and
 *                           project-bound (PF-17), each version with its author.
 *   ArtifactAuditReport   — GET …/audit-report, read only when a person asks:
 *                           the route records each read in the artifact's
 *                           provenance, so selecting a leaf writes nothing.
 *   fetchGovernedArtifactDocx — GET /api/artifacts-center/:a/export, the
 *                           governed DOCX the Artifacts center downloads,
 *                           recorded before it is delivered.
 *   governedArtifactManifestRows — the branch's rows for the shared manifest
 *                           (../artifactManifest.ts).
 *
 * A failed versions or audit read is an error, never an empty history; a
 * refused one says what the refusal is (readFailureFor / describeReadFailure).
 */
import React, { useState } from 'react';

import { I } from '../icons';
import { flattenDocs, vaultStatus, type VaultDoc, type VaultArtifactFacts, type VaultFolder } from '../fixtures/vault-data';
import { ARTIFACT_ORIGIN_LABELS, type ArtifactOrigin, type ArtifactSignatureState } from '@shared/artifact-governance';
import { useLiveData } from '../dataConnect';
import { describeReadFailure, readFailureFor } from '../../mdx/hooks/useFetchJson';
import { ApiRequestError, apiRequest } from '@/lib/queryClient';
import { errorCodeOf } from '@/lib/apiErrorCode';
import { safeFileName } from '../download';
import type { ArtifactManifestRow } from '../artifactManifest';

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
  onExportManifest,
}: {
  block?: GovernedArtifactsBlock;
  /** The server's `unavailable` reason for the branch, when it could not be read. */
  unavailableReason?: string | null;
  /** Open the branch in the tree. */
  onOpen: () => void;
  /** Download the listed rows' CSV manifest (slice B). */
  onExportManifest?: () => void;
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
        {block.total > 0 && onExportManifest && (
          <button
            className="vd-dr-toggle"
            onClick={onExportManifest}
            title={
              block.window.truncated
                ? `Download the index of the ${block.window.shown} listed governed artifacts as CSV (their governance, not the files)`
                : 'Download the index of these governed artifacts as CSV (their governance, not the files)'
            }
            data-testid="vault-artifacts-manifest"
          >
            {I.download} Export manifest
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
        {doc.sizeLabel && <Row k="Stored content">{doc.sizeLabel}</Row>}
      </div>
    </>
  );
}

/* ── Slice B: the leaf's reads, download, manifest and AnA prompt ─────────── */

const enc = encodeURIComponent;

/** The artifact's versions, under the project (c2c/artifacts.ts, PF-17). */
export function artifactVersionsPath(projectId: string, artifactId: string): string {
  return `/api/concept2cure/projects/${enc(projectId)}/artifacts/${enc(artifactId)}/versions`;
}

/** The artifact's audit report, under the project. Each read is recorded in its provenance. */
export function artifactAuditReportPath(projectId: string, artifactId: string): string {
  return `/api/concept2cure/projects/${enc(projectId)}/artifacts/${enc(artifactId)}/audit-report`;
}

/** The governed DOCX export (artifacts-center-routes.ts), recorded before it is delivered. */
export function artifactExportPath(artifactId: string): string {
  return `/api/artifacts-center/${enc(artifactId)}/export?format=docx`;
}

/** '2026-10-28 14:02 UTC', or that no time was recorded. */
function utc(ts: string | null | undefined): string {
  const t = ts ? new Date(ts) : null;
  if (!t || Number.isNaN(t.getTime())) return 'time not recorded';
  const iso = t.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** A read that returned no data, said as what it was. */
function ReadNotShown({
  read,
  what,
  onRetry,
}: {
  read: { status?: number; code?: string };
  what: string;
  onRetry: () => void;
}) {
  const kind = readFailureFor(read.status, read.code);
  const words = describeReadFailure(kind, what, { subject: 'this artifact' });
  return (
    <div className="vd-dr-err" role="alert">
      {I.alertTriangle} {words.message}
      {kind === 'failed' ? ' Nothing is listed rather than an incomplete record.' : ''}
      {words.retryable && (
        <>
          {' '}
          <button type="button" className="sp-ask" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

interface ArtifactVersionRow {
  id: number;
  version: number;
  contentHash: string | null;
  changeDescription: string | null;
  createdById: number | null;
  /** The author's name as the tenant may show it, or "user <id>"; absent from an older server. */
  createdBy?: string | null;
  createdAt: string | null;
}
interface ArtifactVersionsRead {
  currentVersion: number;
  versions: ArtifactVersionRow[];
}
const isVersionsRead = (x: unknown): x is ArtifactVersionsRead =>
  !!x && typeof x === 'object' && Array.isArray((x as { versions?: unknown }).versions);

/** Every version of the artifact, newest first: when, who, what changed, its hash. */
export function ArtifactVersions({ projectId, doc }: { projectId: string; doc: VaultDoc }) {
  const a = doc.artifact!;
  const [epoch, setEpoch] = useState(0);
  const path = artifactVersionsPath(projectId, a.artifactId);
  const read = useLiveData<ArtifactVersionsRead>(path, [path, epoch], isVersionsRead);
  const signedOn = a.signature === 'current' || a.signature === 'stale' ? a.signedVersion : null;
  return (
    <>
      <div className="vd-d-seclbl">Versions</div>
      <div className="vd-vers" data-testid="vault-artifact-versions">
        {read.loading ? (
          <div className="vd-d-idx" role="status">
            Reading the version history…
          </div>
        ) : read.error || !read.data ? (
          <ReadNotShown read={read} what="the version history" onRetry={() => setEpoch((n) => n + 1)} />
        ) : read.data.versions.length === 0 ? (
          <div className="vd-d-idx">The registry records no versions of this artifact.</div>
        ) : (
          read.data.versions.map((v) => (
            <div key={v.id} className="vd-ver">
              <span className="vd-ver-v">v{v.version}</span>
              <span className="vd-ver-m">
                {utc(v.createdAt)} · {v.createdBy || 'author not recorded'}
                {v.version === read.data!.currentVersion ? ' · current version' : ''}
                {signedOn != null && v.version === signedOn ? ' · signed' : ''}
                <br />
                {v.changeDescription || 'No change description recorded'}
                {v.contentHash ? (
                  <>
                    {' · '}
                    <span className="mono vd-d-hash" title={v.contentHash}>
                      {v.contentHash.slice(0, 16)}…
                    </span>
                  </>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

interface AuditEvent {
  action: string;
  description?: string | null;
  actor?: string | null;
  timestamp: string | null;
}
interface AuditReportRead {
  generatedAt: string | null;
  integrityVerification: { scope: string; chainIntact: boolean; failureReason: string | null };
  reviewSignatureSummary: {
    totalSignatures: number;
    signatures: Array<{
      signer: string | null;
      role: string | null;
      purpose: string | null;
      meaning: string | null;
      signedAt: string | null;
    }>;
  };
  sourceLineage: AuditEvent[];
  generationLineage: AuditEvent[];
  exportHistory: AuditEvent[];
}
const isAuditReport = (x: unknown): x is AuditReportRead => {
  const r = x as Partial<AuditReportRead> | null;
  return (
    !!r &&
    typeof r.integrityVerification === 'object' &&
    !!r.integrityVerification &&
    Array.isArray(r.reviewSignatureSummary?.signatures) &&
    Array.isArray(r.sourceLineage) &&
    Array.isArray(r.generationLineage) &&
    Array.isArray(r.exportHistory)
  );
};

/* Two writers record a hash that is not of the artifact's stored text (slice A,
   verified at the writers): the CMC compile hashes the section's inputs
   (module3-convergence-service.ts, createSourceHash), and a device import
   records the source file's SHA-256 beside empty content (mdx-imports.ts). The
   server's comparison of stored text against recorded hash cannot speak to
   either, and a reader should not take its verdict as an alarm. */
const HASH_NOTE: Partial<Record<ArtifactOrigin, string>> = {
  'cmc-composer':
    'The CMC compile records a hash of the section’s inputs, not of its stored text, so this comparison neither confirms nor contradicts it.',
  import:
    'An imported artifact records the source file’s hash and stores no text, so this comparison neither confirms nor contradicts it.',
};

function EventList({ label, events }: { label: string; events: AuditEvent[] }) {
  return (
    <div className="vd-d-filing-row">
      <span className="k">{label}</span>
      <span className="v">
        {events.length === 0
          ? 'None recorded'
          : events.map((e, i) => (
              <React.Fragment key={`${e.action}-${e.timestamp}-${i}`}>
                {i > 0 && <br />}
                {e.action}
                {e.description ? ` (${e.description})` : ''} · {e.actor || 'actor not recorded'} · {utc(e.timestamp)}
              </React.Fragment>
            ))}
      </span>
    </div>
  );
}

/** The artifact's audit report, read only when a person asks for it. */
export function ArtifactAuditReport({ projectId, doc }: { projectId: string; doc: VaultDoc }) {
  const a = doc.artifact!;
  // 0: not asked. Each ask (and each retry) is a new read, and a new provenance record.
  const [asked, setAsked] = useState(0);
  const path = asked ? artifactAuditReportPath(projectId, a.artifactId) : null;
  const read = useLiveData<AuditReportRead>(path, [path, asked], isAuditReport);
  const r = read.data;
  const note = a.origin ? HASH_NOTE[a.origin] : undefined;
  return (
    <>
      <div className="vd-d-seclbl">Audit report</div>
      <div className="vd-d-filing" data-testid="vault-artifact-audit">
        {!asked ? (
          <>
            <div className="vd-d-filing-row">
              <span className="v">
                Its signatures, provenance and exports, with the server’s check of its version hashes. Reading
                the report generates it, and that is recorded in the artifact’s provenance.
              </span>
            </div>
            <div className="vd-d-filing-acts">
              <button type="button" className="sp-ask" onClick={() => setAsked(1)}>
                Read the audit report
              </button>
            </div>
          </>
        ) : read.loading ? (
          <div className="vd-d-idx" role="status">
            Generating the audit report…
          </div>
        ) : read.error || !r ? (
          <ReadNotShown read={read} what="the audit report" onRetry={() => setAsked((n) => n + 1)} />
        ) : (
          <>
            <div className="vd-d-filing-row">
              <span className="k">Version hashes</span>
              <span className="v">
                {r.integrityVerification.chainIntact
                  ? 'Intact: each stored version matches the hash recorded with it'
                  : `Not intact: ${r.integrityVerification.failureReason || 'the server gave no reason'}`}
              </span>
            </div>
            <div className="vd-d-filing-why">
              {r.integrityVerification.scope}
              {note ? ` ${note}` : ''}
            </div>
            <div className="vd-d-filing-row">
              <span className="k">Signatures</span>
              <span className="v">
                {r.reviewSignatureSummary.signatures.length === 0
                  ? 'No signatures recorded'
                  : r.reviewSignatureSummary.signatures.map((sig, i) => (
                      <React.Fragment key={`${sig.signer}-${sig.signedAt}-${i}`}>
                        {i > 0 && <br />}
                        {sig.signer || 'Signer not recorded'}
                        {sig.role ? ` (${sig.role})` : ''} · {sig.meaning || sig.purpose || 'meaning not recorded'} ·{' '}
                        {utc(sig.signedAt)}
                      </React.Fragment>
                    ))}
              </span>
            </div>
            <EventList label="Generation" events={r.generationLineage} />
            <EventList label="Sources" events={r.sourceLineage} />
            <EventList label="Exports" events={r.exportHistory} />
            <div className="vd-d-idx">Generated {utc(r.generatedAt)}.</div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Why a governed download was refused, in a sentence. The export route's own
 * refusals are told apart by their code or status; anything else goes through
 * the one read classifier (readFailureFor), so the module gate's refusal reads
 * as "not enabled", never as an outage.
 */
export function artifactDownloadRefusal(title: string, failure: { status?: number; code?: string | null }): string {
  const lead = `${title} was not downloaded — `;
  if (failure.code === 'HUMAN_REVIEW_REQUIRED') {
    return `${lead}there is no recorded human review or signature on its current version, and governed content leaves the Vault only with one.`;
  }
  if (failure.code === 'UNAUDITED_EXPORT_REFUSED') return `${lead}its download could not be recorded, so nothing was sent. Try again.`;
  if (failure.status === 409) return `${lead}it has no content to export yet.`;
  if (failure.status === 401) return `${lead}your session has expired. Sign in again.`;
  const kind = readFailureFor(failure.status, failure.code);
  if (kind !== 'failed') {
    const t = describeReadFailure(kind, 'the file', { subject: 'this artifact' }).title;
    return `${lead}${t.charAt(0).toLowerCase()}${t.slice(1)}.`;
  }
  return `${lead}the server did not complete it. Try again.`;
}

/** The governed DOCX of the artifact's current version, or why it was not served. */
export async function fetchGovernedArtifactDocx(
  doc: VaultDoc,
): Promise<{ ok: true; name: string; blob: Blob } | { ok: false; text: string }> {
  const a = doc.artifact!;
  try {
    const res = await apiRequest('GET', artifactExportPath(a.artifactId));
    if (!res.ok) {
      // apiRequest returns a 401 rather than throwing it.
      const body = await res.json().catch(() => null);
      return { ok: false, text: artifactDownloadRefusal(doc.title, { status: res.status, code: errorCodeOf(body) }) };
    }
    const blob = await res.blob();
    const name = res.headers?.get?.('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1];
    return { ok: true, name: name || `${safeFileName(doc.title, 'artifact').slice(0, 80)}.docx`, blob };
  } catch (e) {
    if (e instanceof ApiRequestError) {
      return { ok: false, text: artifactDownloadRefusal(doc.title, { status: e.status, code: e.code }) };
    }
    return { ok: false, text: `${doc.title} was not downloaded — the server did not answer. Try again.` };
  }
}

/** The branch's listed artifacts as the shared manifest's rows. */
export function governedArtifactManifestRows(branch: VaultFolder, project: string): ArtifactManifestRow[] {
  return flattenDocs(branch.children)
    .filter((d) => d.src === 'artifact' && d.artifact)
    .map((d) => {
      const a = d.artifact!;
      return {
        name: d.title,
        artifactId: a.artifactId,
        ctdSection: a.ctdSection,
        kind: a.kind,
        format: a.format,
        origin: a.origin,
        model: a.model,
        author: a.author,
        status: d.status,
        version: d.ver,
        signature: a.signature,
        signedVersion: a.signedVersion,
        reviewed: a.reviewed,
        sourceCount: a.sourceCount,
        contentHash: a.contentHash,
        size: d.sizeLabel ?? null,
        project,
        updated: d.updated,
      };
    });
}

/** What Ask AnA sends from an artifact's leaf: the artifact by name, section and version. */
export function artifactAskPrompt(doc: VaultDoc): string {
  const a = doc.artifact!;
  const where = [a.ctdSection ? `CTD §${a.ctdSection}` : null, doc.ver && doc.ver !== '—' ? doc.ver : null]
    .filter(Boolean)
    .join(', ');
  return (
    `Review the governed artifact “${doc.title}”${where ? ` (${where})` : ''}: read its signature, human review and ` +
    'cited sources as the Vault records them, and say what it still needs before it can be filed.'
  );
}
