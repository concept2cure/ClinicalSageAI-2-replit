/**
 * Vault — the governed artifacts across the projects the caller can open (fold
 * F3 slice C, D2, 2026-10-29).
 *
 * The Artifacts center (AdminSurfaces.tsx ArtifactsCenter) was the one screen
 * that listed governed artifacts across projects. It folded into the Vault as
 * this organization view, over the read it already made, GET
 * /api/artifacts-center (server/routes/artifacts-center-routes.ts). That read
 * now lists the non-archived artifacts of the projects the sharing policy
 * admits the caller to, the policy the project Vault admits a project by, and
 * says how many rows its window holds.
 *
 * What it carries from the gallery: kind, format, project, model, version, the
 * signature on the current version in four states (shared/artifact-governance.ts),
 * cited sources and human review; the governed DOCX (the leaf's export,
 * recorded before delivery); the editor through authoring.open-document; the
 * shared manifest (../artifactManifest.ts); Ask AnA; and AnA's focus, which is
 * vault.focus-document by name or artifact id (Vault.tsx).
 *
 * Shown when no project is open, and one click away when one is (read only
 * once opened). A failed read is an error and a refusal says what it is;
 * neither is an empty registry.
 */
import React, { useEffect, useRef, useState } from 'react';

import { I } from '../icons';
import { artifactSignatureState, type ArtifactOrigin, type ArtifactSignatureState } from '@shared/artifact-governance';
import { isRowsWith, useLiveRows, type ListState } from '../dataConnect';
import { describeReadFailure, readFailureFor } from '../../mdx/hooks/useFetchJson';
import type { ArtifactManifestRow } from '../artifactManifest';
import { artifactSignatureLine, fetchGovernedDocx, type GovernedDocx } from './VaultGovernedArtifacts';

/** One row of GET /api/artifacts-center (server ArtifactCenterRow). */
export interface OrganizationArtifactRow {
  id: string;
  name: string;
  kind: string;
  /* Derived from the row's category server-side; a row whose category was never
     backfilled arrives without one. */
  fmt: string | null;
  size: string;
  model: string | null;
  when: string;
  ver: string;
  sig: boolean;
  sigVersion?: number | null;
  sigStale?: boolean | null;
  reviewed: boolean;
  sourceCount: number;
  prog: string;
  ctdSection?: string | null;
  status?: string;
  origin?: ArtifactOrigin | null;
  author?: string | null;
  contentHash?: string | null;
}

export const ORGANIZATION_ARTIFACTS_PATH = '/api/artifacts-center';
const isOrganizationRows = isRowsWith<OrganizationArtifactRow>('id', 'name', 'ver', 'prog');

export type OrganizationArtifactsRead = ListState<OrganizationArtifactRow> & { reload: () => void };

/** The listing, read only while `active`: a project's Vault reads it once a person opens it. */
export function useOrganizationArtifacts(active: boolean): OrganizationArtifactsRead {
  const [epoch, setEpoch] = useState(0);
  const path = active ? ORGANIZATION_ARTIFACTS_PATH : null;
  const read = useLiveRows<OrganizationArtifactRow>(path, [path, epoch], isOrganizationRows);
  return { ...read, reload: () => setEpoch((n) => n + 1) };
}

/** Every row the server's scope matched, and how many of them are listed. */
function organizationWindow(read: Pick<OrganizationArtifactsRead, 'rows' | 'meta'>) {
  const listed = read.rows.length;
  const m = read.meta ?? {};
  const total = typeof m.total === 'number' && m.total >= listed ? m.total : listed;
  return { total, listed, truncated: m.truncated === true };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const organizationArtifactSignature = (r: Pick<OrganizationArtifactRow, 'sig' | 'sigStale'>) =>
  artifactSignatureState({ sig: r.sig, sigStale: r.sigStale });

/** The listing's rows for the shared manifest (the Artifacts center's manifestRow, moved). */
export function organizationManifestRows(rows: readonly OrganizationArtifactRow[]): ArtifactManifestRow[] {
  return rows.map((r) => ({
    name: r.name,
    artifactId: r.id,
    ctdSection: r.ctdSection ?? null,
    kind: r.kind,
    format: r.fmt,
    origin: r.origin ?? null,
    model: r.model,
    author: r.author ?? null,
    status: r.status ?? 'unknown',
    version: r.ver,
    signature: organizationArtifactSignature(r),
    signedVersion: r.sigVersion ?? null,
    reviewed: r.reviewed,
    sourceCount: r.sourceCount ?? 0,
    contentHash: r.contentHash ?? null,
    size: r.size,
    project: r.prog,
    updated: r.when,
  }));
}

/**
 * The one row an id or a name picks out: the id exactly; else the name exactly
 * (case and spacing aside), else the one name that contains it. More than one
 * is a miss to be named, never a guess (the Artifacts center's focus rule).
 */
export function findOrganizationArtifact(
  rows: readonly OrganizationArtifactRow[],
  want: { artifactId?: string; name?: string },
): { kind: 'one'; row: OrganizationArtifactRow } | { kind: 'many'; count: number } | { kind: 'none' } {
  if (want.artifactId) {
    const row = rows.find((r) => r.id === want.artifactId);
    return row ? { kind: 'one', row } : { kind: 'none' };
  }
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const name = norm(want.name ?? '');
  if (!name) return { kind: 'none' };
  const exact = rows.filter((r) => norm(r.name) === name);
  const pool = exact.length ? exact : rows.filter((r) => norm(r.name).includes(name));
  if (pool.length === 1) return { kind: 'one', row: pool[0] };
  return pool.length > 1 ? { kind: 'many', count: pool.length } : { kind: 'none' };
}

/**
 * What AnA is told of the listing: its counts over what is listed, or that it
 * could not be read. Null while it loads or when it is not open: nothing read
 * is not zero.
 */
export function organizationArtifactsFacts(read: Pick<OrganizationArtifactsRead, 'rows' | 'loading' | 'error' | 'meta'>, active: boolean) {
  if (!active || read.loading) return null;
  if (read.error) return 'unavailable — counts unknown, not zero';
  const w = organizationWindow(read);
  const count = (state: ArtifactSignatureState) => read.rows.filter((r) => organizationArtifactSignature(r) === state).length;
  return {
    scope: 'the projects you can open',
    total: w.total,
    listed: w.listed,
    truncated: w.truncated,
    signedOnCurrentVersion: count('current'),
    signedOnEarlierVersionOnly: count('stale'),
    signedVersionUnknown: count('unknown'),
    humanReviewRecorded: read.rows.filter((r) => r.reviewed).length,
    projects: [...new Set(read.rows.map((r) => r.prog).filter(Boolean))],
    // Enough to name an artifact back to the user, not the whole listing.
    artifacts: read.rows.slice(0, 15).map((r) => ({
      id: r.id, name: r.name, kind: r.kind, format: r.fmt, version: r.ver, project: r.prog,
      model: r.model, updated: r.when, signature: organizationArtifactSignature(r), humanReviewRecorded: r.reviewed,
    })),
  };
}

type OrganizationFacts = ReturnType<typeof organizationArtifactsFacts>;

/** The Vault's context when no project is open: the organization view is what is on screen. */
export function organizationViewContext(
  read: Pick<OrganizationArtifactsRead, 'loading' | 'error'>,
  facts: OrganizationFacts,
  focused: OrganizationArtifactRow | null,
) {
  const total = facts && typeof facts === 'object' ? facts.total : 0;
  const state = read.loading
    ? 'The governed artifacts across the projects you can open are still loading.'
    : read.error
      ? 'The governed artifacts across your projects could not be read, so none are listed because of a failure, not because there are none.'
      : `Governed artifacts across your projects: ${total} in the projects you can open` +
        (focused ? `, “${focused.name}” (${focused.prog}) focused` : '') + '.';
  return {
    summary: `No project is open, so no project’s document tree is shown. ${state}`,
    facts: {
      projectOpen: false,
      organizationArtifacts: facts,
      focusedArtifact: focused ? { id: focused.id, name: focused.name, project: focused.prog, version: focused.ver } : null,
    },
    availableActions: [
      'Open a project to see its Vault',
      'Read a governed artifact’s kind, project, signature on the current version, cited sources and human review',
      'Download a governed artifact as DOCX (recorded; it needs a recorded human review or signature on the current version)',
      'Open a governed artifact in the document editor',
      'Export the governed artifacts’ manifest as CSV (their governance, not the files)',
      'Focus a governed artifact by name or id',
    ],
  };
}

/** What Ask AnA sends from a row: the artifact by name, project and version. */
export function organizationArtifactAskPrompt(r: OrganizationArtifactRow): string {
  const where = [r.prog, r.ver, r.ctdSection ? `CTD §${r.ctdSection}` : null].filter(Boolean).join(', ');
  return (
    `Review the governed artifact “${r.name}” (${where}): read its signature, human review and cited sources ` +
    'as the Vault records them, and say what it still needs before it can be filed.'
  );
}

/** A row's governed DOCX, or why it was not served (the leaf's export). */
export function fetchOrganizationArtifactDocx(r: OrganizationArtifactRow): Promise<GovernedDocx> {
  return fetchGovernedDocx(r.id, r.name);
}

const ORG_COLS = '1.7fr 64px 96px 110px 84px 1.2fr 280px';

interface RowActions {
  downloadingId: string;
  onDownload: (r: OrganizationArtifactRow) => void;
  onOpenInEditor: (r: OrganizationArtifactRow) => void;
  onAsk: (r: OrganizationArtifactRow) => void;
}

const OrganizationArtifactLine = React.forwardRef<HTMLDivElement, { row: OrganizationArtifactRow; focused: boolean } & RowActions>(
  function OrganizationArtifactLine({ row: r, focused, downloadingId, onDownload, onOpenInEditor, onAsk }, ref) {
    return (
      <div
        ref={ref}
        className={`ct-row art-row${focused ? ' is-focus' : ''}`}
        style={{ gridTemplateColumns: ORG_COLS }}
        data-testid={`vault-org-artifact-${r.id}`}
      >
        <div className="vn">
          <span className="vtype" style={{ background: 'var(--accent-000)', color: 'var(--accent-200)' }}>{r.ver}</span>
          <span className="ct-strong">{r.name}</span>
          <span className="art-kind">{r.kind}</span>
          <span className="art-kind" data-testid={`artifact-governance-${r.id}`}>
            {r.sourceCount ?? 0} cited source{r.sourceCount === 1 ? '' : 's'} ·{' '}
            {r.reviewed ? 'Human review recorded' : 'Human review required'}
          </span>
        </div>
        <div>{r.fmt ? <span className="art-fmt" data-tone="idle">{r.fmt.toUpperCase()}</span> : null}</div>
        <div className="mono">{r.prog}</div>
        <div>{r.model ?? 'Model not recorded'}</div>
        <div>{r.when}</div>
        <div>{artifactSignatureLine({ signature: organizationArtifactSignature(r), signedVersion: r.sigVersion ?? null }, r.ver)}</div>
        <div className="art-acts">
          <button type="button" className="art-act" disabled={Boolean(downloadingId)} onClick={() => onDownload(r)}>
            {I.download} {downloadingId === r.id ? 'Downloading…' : 'Download DOCX'}
          </button>
          <button type="button" className="art-act" onClick={() => onOpenInEditor(r)}>
            {I.penLine} Open in editor
          </button>
          <button type="button" className="art-act" onClick={() => onAsk(r)}>
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>
    );
  },
);

/** The listing's body: loading, refused, failed, none, or the rows. */
function OrganizationArtifactsBody({ read, focusId, ...actions }: { read: OrganizationArtifactsRead; focusId: string | null } & RowActions) {
  const focusRow = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // scrollIntoView is absent in jsdom and some webviews; the highlight is what matters.
    try {
      if (focusId && focusRow.current) focusRow.current.scrollIntoView({ block: 'center' });
    } catch { /* the row is still highlighted */ }
  }, [focusId, read.rows.length]);
  if (read.loading) return <div className="vd-dr-empty" role="status">Reading the governed artifacts across your projects…</div>;
  if (read.error) {
    const failure = readFailureFor(read.status, read.code);
    const words = describeReadFailure(failure, 'the listing of governed artifacts across your projects', { subject: 'this listing' });
    return (
      <div className="vd-dr-err" role="alert">
        {I.alertTriangle} {words.message}
        {failure === 'failed' ? ' None are listed, and this is not an empty registry.' : ''}
        {words.retryable && (
          <>
            {' '}
            <button type="button" className="sp-ask" onClick={read.reload}>Try again</button>
          </>
        )}
      </div>
    );
  }
  if (read.rows.length === 0) return <div className="vd-dr-empty">No governed artifacts in the projects you can open yet.</div>;
  return (
    <>
      <div className="vd-dr-empty">
        Only the projects you can open are listed, and archived artifacts are not, as in each project’s Vault.
      </div>
      <div className="ctable">
        <div className="ct-head" style={{ gridTemplateColumns: ORG_COLS }}>
          <div>Artifact</div>
          <div>Format</div>
          <div>Project</div>
          <div>Model</div>
          <div>Updated</div>
          <div>Signature</div>
          <div></div>
        </div>
        {read.rows.map((r) => (
          <OrganizationArtifactLine key={r.id} ref={r.id === focusId ? focusRow : undefined} row={r} focused={r.id === focusId} {...actions} />
        ))}
      </div>
    </>
  );
}

export function OrganizationGovernedArtifacts({
  read,
  open,
  onToggle,
  focusId,
  onExportManifest,
  ...actions
}: {
  read: OrganizationArtifactsRead;
  /** Whether the listing is shown (always, with no project open). */
  open: boolean;
  /** Show or hide it, where a project is open. */
  onToggle?: () => void;
  focusId: string | null;
  onExportManifest: () => void;
} & RowActions) {
  const w = organizationWindow(read);
  const settled = open && !read.loading && !read.error;
  return (
    <div className="vd-dr" data-testid="vault-org-artifacts">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.shieldCheck} Governed artifacts across your projects</span>
        {settled && (
          <span className="vd-dr-meta">
            {plural(w.total, 'governed artifact', 'governed artifacts')} in the projects you can open
            {w.truncated ? ` · the newest ${w.listed} are listed` : ''}
          </span>
        )}
        {onToggle && (
          <button className="vd-dr-toggle" onClick={onToggle} aria-expanded={open}>
            {open ? 'Hide' : 'Show'} governed artifacts across your projects
          </button>
        )}
        {settled && read.rows.length > 0 && (
          <button
            className="vd-dr-toggle"
            onClick={onExportManifest}
            title="Download the index of the listed governed artifacts as CSV (their governance, not the files)"
          >
            {I.download} Export manifest
          </button>
        )}
      </div>
      {open && <OrganizationArtifactsBody read={read} focusId={focusId} {...actions} />}
    </div>
  );
}
