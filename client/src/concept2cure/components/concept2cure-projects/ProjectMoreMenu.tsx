/**
 * ProjectMoreMenu — ⋯ dropdown on the project-detail header.
 * Mirror of design-system/ui_kits/home/Projects.jsx (lines 454–477).
 */
import { useEffect, useRef, useState } from 'react';
import { I } from './icons';

interface Props {
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
}

export function ProjectMoreMenu({ onArchive, onDelete, onDuplicate, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="pmm" ref={ref}>
      <button
        type="button"
        className="prj-icon-btn"
        title="More"
        onClick={() => setOpen(o => !o)}
      >
        {I.dots}
      </button>
      {open && (
        <div className="pmm-menu" role="menu">
          <button type="button" className="pmm-row" onClick={() => { setOpen(false); onDuplicate(); }}>
            {I.copy} <span>Duplicate as template</span>
          </button>
          <button type="button" className="pmm-row" onClick={() => { setOpen(false); onExport(); }}>
            {I.download} <span>Export project (ZIP)</span>
          </button>
          <div className="pmm-sep" />
          <button type="button" className="pmm-row" onClick={() => { setOpen(false); onArchive(); }}>
            {I.archive} <span>Archive project</span>
          </button>
          <button type="button" className="pmm-row is-danger" onClick={() => { setOpen(false); onDelete(); }}>
            {I.trash} <span>Delete project…</span>
          </button>
        </div>
      )}
    </div>
  );
}
