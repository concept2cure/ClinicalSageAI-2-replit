/**
 * ProjectsListBulkBar — multi-select toolbar that appears above the list
 * when ≥1 row is checked. Mirror of design-system/ui_kits/home/
 * ProjectsExtras.jsx (lines 498–511).
 */
import { I } from './icons';

interface Props {
  count: number;
  onClear: () => void;
  onArchive: () => void;
  onExport: () => void;
  onTransfer: () => void;
  onDelete: () => void;
}

export function ProjectsListBulkBar({
  count, onClear, onArchive, onExport, onTransfer, onDelete,
}: Props) {
  if (count === 0) return null;
  return (
    <div className="plb">
      <span className="plb-count">{count} selected</span>
      <button type="button" className="plb-btn" onClick={onArchive}>{I.archive} Archive</button>
      <button type="button" className="plb-btn" onClick={onExport}>{I.download} Export</button>
      <button type="button" className="plb-btn" onClick={onTransfer}>{I.users} Transfer owner</button>
      <button type="button" className="plb-btn is-danger" onClick={onDelete}>{I.trash} Delete</button>
      <span className="plb-spacer" />
      <button type="button" className="plb-clear" onClick={onClear}>Clear selection</button>
    </div>
  );
}
