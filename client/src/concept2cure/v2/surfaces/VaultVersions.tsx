/**
 * Versions: every version of a Vault document, and adding a new one (VR-09).
 *
 * The detail pane used to show only the current version, beside a note that no
 * version history existed. It now reads GET …/documents/:id/versions: every
 * version in the document's family, newest first, with its SHA-256, size,
 * uploader and date, from the server (vault-version-family.ts). Any version
 * downloads through the one hash-verified, audited download route (the page's
 * own download call). "Upload new version" adds a file to the current version
 * through the one upload path (useVaultUpload); the server assigns the number
 * and keeps the document's code and filing. "Export signed history" downloads
 * the signed audit export (GET /api/audit/export/signed) for exactly these
 * versions' records, and says what it contains.
 *
 * A version whose link to an earlier one is not one the database rules admit is
 * marked as not linked, and stands on its own. A failed read says so: "one
 * version" would be a claim about a document the page could not read.
 */
import React, { useRef, useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { VaultVersionCompare } from './VaultVersionCompare';
import { downloadBlob, safeFileName } from '../download';
import {
  APPROVED_STAGES,
  LifecycleSummary,
  stageLabel,
  VersionLifecycleActions,
  type VaultVersionLifecycle,
} from './VaultLifecycle';

export interface VaultVersion {
  id: string;
  version: string | null;
  contentHash: string | null;
  fileSize: number | null;
  fileName: string | null;
  uploader: string | null;
  uploaderId?: number | null;
  createdAt: string;
  current: boolean;
  link: 'none' | 'verified' | 'unverified';
  /** Its review and approval (VR-13); null when nobody has started one. */
  lifecycle?: VaultVersionLifecycle | null;
  /** The live submission leaves that name it (VR-14a). Absent when the server did not say. */
  placements?: VaultPlacement[];
}

/** One leaf that names a version, as the server returns it (vault-where-used.ts). */
export interface VaultPlacement {
  leafId: number;
  submissionId: number;
  submissionTitle: string | null;
  applicationType: string | null;
  sequenceId: number;
  sequenceNumber: string | null;
  region: string | null;
  sequenceStatus: string | null;
  sectionCode: string;
  leafTitle: string;
  operation: string;
}

interface VersionsShape {
  versions: VaultVersion[];
}

const isVersionsShape: ShapeGuard<VersionsShape> = (v): v is VersionsShape =>
  !!v && typeof v === 'object' && Array.isArray((v as VersionsShape).versions);

function sizeLabel(bytes: number | null): string {
  if (bytes == null) return 'size not recorded';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function uploaderLabel(v: VaultVersion): string {
  if (v.uploader) return v.uploader;
  return v.uploaderId != null ? `user ${v.uploaderId}` : 'uploader not recorded';
}

/** Where a version is placed, in words: each submission sequence and section, with the leaf's operation. */
export function placedInText(placements: VaultPlacement[] | undefined): string {
  if (!placements) return '';
  if (placements.length === 0) return ' · not placed in any submission';
  const one = (p: VaultPlacement) =>
    `${p.submissionTitle ?? `submission ${p.submissionId}`}, sequence ${p.sequenceNumber ?? 'not numbered'}, ` +
    `${p.sectionCode} (${p.operation}; sequence ${p.sequenceStatus ?? 'status not recorded'})`;
  return ` · placed in ${placements.map(one).join('; ')}`;
}

const LINK_TEXT: Record<VaultVersion['link'], string> = {
  none: '',
  verified: '',
  unverified: ' · not linked: it names an earlier version that is not this document’s, so it is listed on its own',
};

interface Props {
  projectId: string;
  documentId: string;
  title: string;
  /** The page's download call: hash-verified and audited by the server. */
  onDownload: (docId: string, title: string) => void;
  downloadingId: string;
  /** The page's upload call, naming the document's current version when known. */
  onUploadNewVersion: (file: File, currentId?: string) => void;
  uploading: boolean;
  /** Re-read the Vault after a review or approval was recorded (VR-13). */
  onLifecycleChanged?: () => void;
}

interface ExportManifestSummary {
  rowCount?: number;
  truncated?: boolean;
  signingKeyId?: string | null;
  auditLogsChain?: { status?: string };
}

/** What a downloaded export contains, said plainly. */
function exportSummary(m: ExportManifestSummary, versions: number): { tone: 'ok' | 'error'; text: string } {
  const rows = m.rowCount ?? 0;
  if (rows === 0) {
    return { tone: 'error', text: 'The signed history was downloaded, but it holds no audit records for these versions.' };
  }
  const chain = m.auditLogsChain?.status ?? 'unverified';
  const text =
    `Downloaded the signed history: ${rows} audit record${rows === 1 ? '' : 's'} for ${versions} version${versions === 1 ? '' : 's'}` +
    `${m.truncated ? ' (truncated: the export limit was reached)' : ''}. Audit chain at export: ${chain}` +
    `${m.signingKeyId ? `; signed with key ${m.signingKeyId}` : ''}. Users and versions are named by their ids.`;
  return { tone: chain === 'intact' && !m.truncated ? 'ok' : 'error', text };
}

/** The signed audit export of a set of version records, downloaded as one file. */
function useSignedHistoryExport(title: string) {
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fail = (text: string) => setExportNote({ tone: 'error', text });

  const exportHistory = async (ids: string[]) => {
    setExporting(true);
    setExportNote(null);
    // apiRequest throws on every refusal but a 401, so a refusal arrives here or in the catch.
    const refused = (status: number, said: string) =>
      fail(
        status === 403
          ? `${said} Nothing was downloaded. Ask a user with audit export access to run the export.`
          : `The signed history was not exported. ${said} Nothing was downloaded.`,
      );
    try {
      const res = await apiRequest(
        'GET',
        `/api/audit/export/signed?resource_type=vault_document&record_ids=${ids.map(encodeURIComponent).join(',')}`,
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.export) {
        return refused(res.status, redactInternals(serverMessage(body), 'The export was refused.'));
      }
      const blob = new Blob([JSON.stringify(body.export, null, 2)], { type: 'application/json' });
      if (!downloadBlob(`${safeFileName(title, 'document')}-signed-history.json`, blob)) {
        return fail('The signed history was generated but the browser blocked the download. Allow downloads for this site, then export again.');
      }
      setExportNote(exportSummary(body.export.manifest ?? {}, ids.length));
    } catch (e) {
      if (e instanceof ApiRequestError) return refused(e.status, redactInternals(serverMessage(e.payload), e.message));
      fail('The signed history was not exported: the connection dropped. Nothing was downloaded. Check the connection and export again.');
    } finally {
      setExporting(false);
    }
  };
  return { exporting, exportNote, exportHistory };
}

/** The earlier versions an approval of the current one supersedes, in words: those at an approved stage. */
function supersededBy(versions: VaultVersion[]): string[] {
  return versions
    .filter((v) => !v.current && APPROVED_STAGES.includes(v.lifecycle?.stage ?? ''))
    .map((v) => `${v.version ? `v${v.version}` : 'An unnumbered version'} (${stageLabel(v.lifecycle?.stage)})`);
}

/** Every version, newest first, each downloadable through the page's audited download. */
function VersionRows({ versions, title, onDownload, downloadingId, onLifecycleChanged, onCompare }: {
  versions: VaultVersion[];
  title: string;
  onDownload: Props['onDownload'];
  downloadingId: string;
  onLifecycleChanged?: () => void;
  /** Compare an earlier version with the current one (plan critique 15). */
  onCompare?: (versionId: string) => void;
}) {
  const current = versions.find((v) => v.current);
  return (
    <div className="vd-vers">
      {versions.map((v) => (
        <div key={v.id} className="vd-ver" data-testid={`vault-version-${v.id}`}>
          <span className="vd-ver-v">
            {v.version ? `v${v.version}` : 'version not recorded'}
            {v.current ? ' · current' : ' · earlier'}
          </span>
          <span className="vd-ver-m">
            {dateLabel(v.createdAt)} · {uploaderLabel(v)} · {sizeLabel(v.fileSize)}
            {v.contentHash ? (
              <>
                {' · SHA-256 '}
                <span className="mono" title={v.contentHash}>{v.contentHash.slice(0, 12)}</span>
              </>
            ) : null}
            {LINK_TEXT[v.link]}
            <span data-testid={`vault-version-placed-${v.id}`}>{placedInText(v.placements)}</span>
            <LifecycleSummary lifecycle={v.lifecycle} />
          </span>
          <button
            className="sp-ask"
            disabled={downloadingId === v.id}
            onClick={() => onDownload(v.id, v.version ? `${title} v${v.version}` : title)}
            aria-label={`Download ${v.version ? `version ${v.version} of ` : ''}${title}`}
          >
            {I.download} Download
          </button>
          {!v.current && current && onCompare ? (
            <button className="sp-ask" onClick={() => onCompare(v.id)}>
              Compare with {current.version ? `v${current.version}` : 'the current version'}
            </button>
          ) : null}
          {v.current && onLifecycleChanged ? (
            <VersionLifecycleActions
              vaultId={v.id}
              versionLabel={v.version ? `v${v.version}` : ''}
              title={title}
              lifecycle={v.lifecycle}
              uploaderId={v.uploaderId}
              contentHash={v.contentHash}
              supersedes={supersededBy(versions)}
              onChanged={onLifecycleChanged}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function VaultVersions({
  projectId, documentId, title, onDownload, downloadingId, onUploadNewVersion, uploading, onLifecycleChanged,
}: Props) {
  const path =
    '/api/c2c/project-vault/' + encodeURIComponent(projectId) +
    '/documents/' + encodeURIComponent(documentId) + '/versions';
  const st = useLiveData<VersionsShape>(path, [path], isVersionsShape);
  const picker = useRef<HTMLInputElement | null>(null);
  const { exporting, exportNote, exportHistory } = useSignedHistoryExport(title);
  const versions = st.data?.versions ?? [];
  const currentId = versions.find((v) => v.current)?.id;
  const [comparing, setComparing] = useState<string | null>(null);

  let body: React.ReactNode;
  if (st.loading) body = <div className="vd-d-idx">Loading versions…</div>;
  else if (st.error || !st.data) {
    body = (
      <div className="vd-dr-err" role="alert">
        {I.alertTriangle} The versions of this document could not be read. No list is shown because it would be
        incomplete. Reload the page to try again.
      </div>
    );
  } else {
    body = (
      <VersionRows
        versions={versions}
        title={title}
        onDownload={onDownload}
        downloadingId={downloadingId}
        onLifecycleChanged={onLifecycleChanged}
        onCompare={setComparing}
      />
    );
  }

  return (
    <div data-testid="vault-versions">
      <div className="vd-d-seclbl">Versions</div>
      {body}
      {comparing && currentId ? (
        <VaultVersionCompare projectId={projectId} documentId={currentId} againstId={comparing} onClose={() => setComparing(null)} />
      ) : null}
      <input
        ref={picker}
        type="file"
        hidden
        aria-label={`File to add as a new version of ${title}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadNewVersion(file, currentId);
          e.target.value = '';
        }}
      />
      <button className="sp-ask" disabled={uploading} onClick={() => picker.current?.click()}>
        {I.upload} Upload new version
      </button>
      {versions.length > 0 && (
        <button className="sp-ask" disabled={exporting} onClick={() => void exportHistory(versions.map((v) => v.id))}>
          {I.download} Export signed history
        </button>
      )}
      {exportNote && (
        <div className={exportNote.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={exportNote.tone === 'error' ? 'alert' : 'status'}>
          {exportNote.tone === 'error' ? I.alertTriangle : null} {exportNote.text}
        </div>
      )}
    </div>
  );
}
