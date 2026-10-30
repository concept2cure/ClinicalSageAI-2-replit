/** The existing drawer attachment workflow: one uploader, current-visit feedback and local display. */
import * as React from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { I } from '../../icons';
import { DossierStore } from '../../store/dossierStore';
import type { DossierAttachment, PathwayKey, SectionTarget } from '../../types';
import { useVaultUpload, VAULT_UPLOAD_ACCEPT, type VaultUploadState } from '../../../v2/useVaultUpload';
import { useAuthoringReadSession } from '../../../v2/editor/authoringCurrentRead';
import { captureShellProjectGuard, useShellProject } from '../../../v2/shellProject';

interface Props {
  programId: string | null;
  documentId: string | null;
  pathway: PathwayKey;
  target: SectionTarget;
  attachments: DossierAttachment[];
  visible: boolean;
  formatTime: (iso: string) => string;
}

/** Visibility changes keep this owner; a different account, document or section starts a fresh visit. */
export function DossierAttachments(props: Props) {
  const session = useAuthoringReadSession(useAuthUser());
  useShellProject();
  const scope = JSON.stringify([session.actor, session.key, props.programId, props.documentId,
    props.pathway, props.target.id, props.target.label]);
  const visit = React.useRef({ scope, generation: 1, active: true, projectCurrent: captureShellProjectGuard() });
  if (visit.current.scope !== scope || !visit.current.projectCurrent()) {
    visit.current.active = false;
    visit.current = { scope, generation: visit.current.generation + 1, active: true, projectCurrent: captureShellProjectGuard() };
  }
  const captured = visit.current;
  React.useEffect(() => { captured.active = true; return () => { captured.active = false; }; }, [captured]);
  const current = () => captured.active && visit.current === captured && session.sameRevision() && captured.projectCurrent();
  return <DossierAttachmentsForVisit key={`${scope}:${captured.generation}`} {...props} current={current} />;
}

function DossierAttachmentsForVisit({ programId, pathway, target, attachments, visible, formatTime, current }: Props & { current: () => boolean }) {
  const upload = useVaultUpload(programId);
  const busy = React.useRef(false);
  const onAttach = async (files: FileList) => {
    if (!files?.length || busy.current || !current()) return;
    busy.current = true;
    try {
      const selected = Array.from(files);
      // Names and File objects can repeat; only the corresponding stored index confirms a selection.
      const accepted = new Set<number>();
      await upload.upload(selected, {
        onFileStatus: (index, status) => { if (status.state === 'stored') accepted.add(index); },
      });
      if (!current()) return;
      selected.filter((_file, index) => accepted.has(index)).forEach(file => {
        // The server owns byte storage and audit. This store only updates the local list.
        DossierStore.attachFile(pathway, target.id, target.label, {
          name: file.name, size: file.size, kind: DossierStore.guessKind(file.name),
        }, { who: 'You', role: 'Reg Lead' });
      });
    } finally { busy.current = false; }
  };
  return visible && current() ? <DDAttachmentsTab attachments={attachments} onAttach={onAttach}
    uploading={upload.uploading} note={upload.note} formatTime={formatTime} /> : null;
}

function kindIcon(kind: string | undefined): React.ReactNode {
  switch (kind) {
    case 'pdf': return I.fileText;
    case 'doc': return I.fileText;
    case 'xls':
    case 'csv': return I.barChart;
    case 'img': return I.image;
    case 'code': return I.code;
    default: return I.file;
  }
}

interface TabProps {
  attachments: DossierAttachment[];
  onAttach: (files: FileList) => void;
  uploading: boolean;
  note: VaultUploadState['note'];
  formatTime: (iso: string) => string;
}

function DDAttachmentsTab({ attachments, onAttach, uploading, note, formatTime }: TabProps) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const tone = uploading ? 'busy' : note?.tone;
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (!uploading && event.dataTransfer?.files) onAttach(event.dataTransfer.files);
  };
  return (
    <div className="dd-att-wrap">
      {(uploading || note) && <p className="dd-att-note" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
        {uploading ? 'Uploading files to the Vault…' : note?.text}
      </p>}
      <div className="dd-att-drop" data-over={over && !uploading} data-busy={uploading} aria-busy={uploading}
        onDragEnter={event => { event.preventDefault(); if (!uploading) setOver(true); }}
        onDragOver={event => { event.preventDefault(); if (!uploading) setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={onDrop}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}>
        {I.paperclip}
        <span>Drop files or click to attach</span>
        <span className="dd-att-drop-sub">PDF · DOCX · XLSX · CSV · PNG · JSON</span>
        <button type="button" className="btn ghost small" disabled={uploading}
          onClick={event => { event.stopPropagation(); inputRef.current?.click(); }}>Choose files</button>
        <input ref={inputRef} type="file" accept={VAULT_UPLOAD_ACCEPT} multiple disabled={uploading}
          style={{ display: 'none' }} onClick={event => event.stopPropagation()}
          onChange={event => { if (!uploading && event.target.files) onAttach(event.target.files); event.target.value = ''; }} />
      </div>
      {attachments.length === 0 ? (
        <div className="dd-att-empty">No attachments yet.</div>
      ) : (
        <div className="dd-att-list">
          {attachments.map((file, index) => (
            <div key={index} className="dd-att-row" data-live={!!file.live}>
              <span className={`dd-att-ico kind-${file.kind || 'file'}`}>{kindIcon(file.kind)}</span>
              <div className="dd-att-meta">
                <div className="dd-att-name">{file.name}</div>
                <div className="dd-att-sub">
                  <span>{DossierStore.fmtSize(file.size) || ''}</span><span>·</span><span>{file.who}</span><span>·</span>
                  <span>{formatTime(file.when)}</span>
                  {file.source && <><span>·</span><span className="mono">{file.source}</span></>}
                </div>
              </div>
              {file.live && <span className="dd-att-tag">new</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
