/**
 * Inbound regulatory correspondence hook — Phase 10.2.
 *
 * Feeds the Today queues on Overview + pathway surfaces from the live
 * correspondence store (GET /api/regulatory-correspondence/correspondence,
 * org-scoped server-side). Returns `null` while loading / on error so the
 * surfaces can apply the established `live ?? fixture` fallback with a
 * labeled sample pill.
 *
 * @module client/src/concept2cure/biopharma/data/correspondence
 */

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../../utils/authToken';

export interface InboundCorrespondence {
  id: string;
  subject: string | null;
  communicationType: string | null;
  urgency: string | null;
  status: string | null;
  dueDate: string | null;
  responseRequired: boolean;
}

interface RawRow {
  id: string;
  direction?: string | null;
  subject?: string | null;
  communication_type?: string | null;
  urgency?: string | null;
  status?: string | null;
  due_date?: string | null;
  response_required?: boolean | null;
}

/**
 * Open inbound correspondence (HAQs, agency letters) for the session org.
 * `null` until the live fetch resolves; `[]` when the tenant has none.
 */
export function useInboundCorrespondence(): InboundCorrespondence[] | null {
  const [rows, setRows] = useState<InboundCorrespondence[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/regulatory-correspondence/correspondence', { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((payload: { data?: RawRow[] }) => {
        if (cancelled) return;
        const data = Array.isArray(payload.data) ? payload.data : [];
        setRows(
          data
            .filter(r => (r.direction ?? 'inbound') === 'inbound' && r.status !== 'closed')
            .map(r => ({
              id: r.id,
              subject: r.subject ?? null,
              communicationType: r.communication_type ?? null,
              urgency: r.urgency ?? null,
              status: r.status ?? null,
              dueDate: r.due_date ?? null,
              responseRequired: r.response_required === true,
            })),
        );
      })
      .catch(() => {
        // Endpoint unavailable (store not provisioned / unauthenticated) —
        // callers fall back to labeled sample data.
        if (!cancelled) setRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return rows;
}
