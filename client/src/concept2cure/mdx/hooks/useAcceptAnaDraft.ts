/**
 * useAcceptAnaDraft — POSTs to /api/cerv2-sections/:id/accept-ana-draft to
 * accept (or refine + accept) a draft AnA wrote into a kit section via the
 * write_kit_section tool.
 *
 * The server keeps draft_source (the origin is a fact about the text) and
 * stamps accepted_at + accepted_by,
 * writes a section-version row + an audit_log entry. The caller is expected
 * to refresh the section list after a successful accept so the affordance
 * disappears from the UI.
 *
 * Used by AnaDraftBanner. Kept as a thin hook so additional surfaces (CER
 * table, eSTAR list, PMA module card) share the same accept semantics.
 */

import { useCallback, useState } from 'react';

interface AcceptArgs {
  /** Optional refined content. When omitted the draft is accepted as-is. */
  refinedContent?: string;
  /** Status to set on accept. Default 'ready_for_review'. */
  status?: 'drafting' | 'ready_for_review' | 'in_review' | 'validated';
}

export interface UseAcceptAnaDraftResult {
  accept: (args?: AcceptArgs) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

export function useAcceptAnaDraft(
  sectionRowId: number | null,
  onAccepted?: () => void,
): UseAcceptAnaDraftResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (args: AcceptArgs = {}) => {
      if (sectionRowId === null) return false;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/cerv2-sections/${sectionRowId}/accept-ana-draft`,
          {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              refined_content: args.refinedContent,
              status:          args.status ?? 'ready_for_review',
            }),
          },
        );
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(
            `HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          );
        }
        onAccepted?.();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Accept failed');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [sectionRowId, onAccepted],
  );

  return { accept, loading, error };
}
