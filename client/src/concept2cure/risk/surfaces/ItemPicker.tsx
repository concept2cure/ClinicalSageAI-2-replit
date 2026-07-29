// Risk-item picker — drives the controls surface. Live item list from
// GET /api/mdx/risk-items, program-scoped. Keyboard-operable select.

import * as React from 'react';
import { useRiskItems } from '../../hooks/useRisk';
import type { RiskItem } from '../../services/riskService';

interface ItemPickerProps {
  projectId: string | null;
  value: number | null;
  onChange: (id: number | null) => void;
}

export function ItemPicker({ projectId, value, onChange }: ItemPickerProps) {
  const itemsQuery = useRiskItems(projectId ? { programId: projectId } : {});
  const rows: RiskItem[] = itemsQuery.data ?? [];

  // Default selection to the first item once loaded.
  React.useEffect(() => {
    if (value == null && rows.length > 0) onChange(rows[0].id);
  }, [value, rows, onChange]);

  return (
    <div className="risk-itempicker">
      <label htmlFor="risk-item-select">Risk item</label>
      <select id="risk-item-select"
              value={value ?? ''}
              onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
              disabled={rows.length === 0}>
        {rows.length === 0 && <option value="">No risk items</option>}
        {rows.map(it => (
          <option key={it.id} value={it.id}>
            {it.ref_code ? `${it.ref_code} · ` : ''}{it.hazard}
          </option>
        ))}
      </select>
    </div>
  );
}
