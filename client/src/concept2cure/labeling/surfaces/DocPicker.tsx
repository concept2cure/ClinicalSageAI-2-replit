// Document picker — drives the translations / symbols surfaces. Live document
// list from GET /api/mdx/labeling, program-scoped. Keyboard-operable select.

import * as React from 'react';
import { useLabelingDocuments } from '../../hooks/useLabeling';
import { DOC_KIND_LABEL } from '../data/nav';
import type { LabelingDoc } from '../../services/labelingService';

interface DocPickerProps {
  projectId: string | null;
  value: number | null;
  onChange: (id: number | null) => void;
}

/** Returns the live document list (so the parent can render empty / loading)
 *  alongside a labelled select. */
export function useDocPicker(projectId: string | null) {
  return useLabelingDocuments(projectId ? { programId: projectId } : {});
}

export function DocPicker({ projectId, value, onChange }: DocPickerProps) {
  const docs = useLabelingDocuments(projectId ? { programId: projectId } : {});
  const rows: LabelingDoc[] = docs.data ?? [];

  // Default selection to the first document once loaded.
  React.useEffect(() => {
    if (value == null && rows.length > 0) onChange(rows[0].id);
  }, [value, rows, onChange]);

  return (
    <div className="lb-docpicker">
      <label htmlFor="lb-doc-select">Document</label>
      <select id="lb-doc-select"
              value={value ?? ''}
              onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
              disabled={rows.length === 0}>
        {rows.length === 0 && <option value="">No documents</option>}
        {rows.map(d => (
          <option key={d.id} value={d.id}>
            {d.device_name} · {DOC_KIND_LABEL[d.doc_kind] ?? d.doc_kind} · {d.language}
          </option>
        ))}
      </select>
    </div>
  );
}
