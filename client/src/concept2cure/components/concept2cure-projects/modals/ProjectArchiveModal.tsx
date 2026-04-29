/**
 * ProjectArchiveModal — archive / restore / delete confirmation modal.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 300–372).
 *
 * Delete mode requires typing the project name to confirm.
 */
import { useEffect, useState } from 'react';
import { I } from '../icons';
import { PMEM_LEARNINGS } from '../data';
import type { Project, ArchiveMode } from '../types';

interface Props {
  open: boolean;
  project: Pick<Project, 'name' | 'id' | 'chats' | 'files'> | null | undefined;
  mode: ArchiveMode | null | undefined;
  onClose: () => void;
  onConfirm?: () => void;
}

export function ProjectArchiveModal({ open, project, mode, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => { if (open) setConfirmText(''); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !project || !mode) return null;

  const isDelete  = mode === 'delete';
  const isArchive = mode === 'archive';
  const isRestore = mode === 'restore';
  const expectedConfirm = isDelete ? project.name : '';
  const canConfirm = isDelete ? confirmText === expectedConfirm : true;

  const title = isDelete
    ? `Delete "${project.name}"?`
    : isArchive
      ? `Archive "${project.name}"?`
      : `Restore "${project.name}"?`;
  const cta = isDelete ? 'Delete project' : isArchive ? 'Archive project' : 'Restore project';

  const learningsCount = (PMEM_LEARNINGS[project.id] || []).length;

  return (
    <div className="parch" role="dialog" aria-label={title}>
      <div className="parch-scrim" onClick={onClose} />
      <div className="parch-shell" data-mode={mode}>
        <header className="parch-head">
          <div className="parch-ico">
            {isDelete ? I.trash : isArchive ? I.archive : I.refresh}
          </div>
          <h2 className="parch-title">{title}</h2>
        </header>

        <div className="parch-body">
          {isArchive && (
            <>
              <p className="parch-p">
                Archiving moves the project out of your active list. Memory, instructions, files, chats, and the audit trail are preserved.
              </p>
              <ul className="parch-list">
                <li><span className="parch-li-ico">{I.check}</span> All data is retained per your retention policy</li>
                <li><span className="parch-li-ico">{I.check}</span> Audit trail continues — restore is a logged action</li>
                <li><span className="parch-li-ico">{I.check}</span> Submission gateways and links remain intact</li>
                <li><span className="parch-li-ico">{I.close}</span> Claude will not surface this project in chat suggestions</li>
              </ul>
            </>
          )}
          {isRestore && (
            <p className="parch-p">
              Restoring moves this project back to your active list. All data is intact — nothing was deleted during archive.
            </p>
          )}
          {isDelete && (
            <>
              <p className="parch-p parch-p-danger">
                Deletion is final after the 30-day soft-delete window. After that, all chats, files, memory, and audit trail entries are unrecoverable.
              </p>
              <ul className="parch-list">
                <li><span className="parch-li-ico is-danger">{I.close}</span> {project.chats.length} chats and {project.files.length} files will be deleted</li>
                <li><span className="parch-li-ico is-danger">{I.close}</span> Memory ({learningsCount} learnings) will be erased</li>
                <li><span className="parch-li-ico is-danger">{I.close}</span> Audit trail will be exported to inspection-grade PDF, then sealed</li>
                <li><span className="parch-li-ico">{I.check}</span> Linked projects will see this as "removed reference"</li>
              </ul>
              <div className="parch-confirm">
                <label className="parch-confirm-lbl">
                  Type <span className="parch-confirm-target">{project.name}</span> to confirm
                </label>
                <input
                  className="parch-confirm-input"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={project.name}
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        <footer className="parch-foot">
          <button type="button" className="prj-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`prj-btn ${isDelete ? 'is-danger' : 'primary'}`}
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm && onConfirm()}
          >
            {cta}
          </button>
        </footer>
      </div>
    </div>
  );
}
