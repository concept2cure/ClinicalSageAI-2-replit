/**
 * useDossierSection + useDossierSectionList — kit-shaped live dossier
 * data for any pathway (510(k) / PMA / CER), one hook contract for all.
 *
 * Mirrors the kit's `useSection(pathway, sectionId, label)` hook from
 * `design-system/ui_kits/mdx/dossier-store.jsx`, but reads real backend
 * tables (cerv2_510k_sections / cer_sections / project_charters).
 *
 * Endpoints (server/routes/mdx-dossier.routes.ts):
 *   GET   /api/mdx/dossier/:pathway/:projectIdent/sections
 *   GET   /api/mdx/dossier/:pathway/:projectIdent/sections/:sectionId
 *   PATCH /api/mdx/dossier/:pathway/:projectIdent/sections/:sectionId
 *
 * Writes via the PATCH path are audit-trail logged on the server with
 * entityType='dossier.<pathway>' and entityId=<sectionId>, so a paired
 * useAuditTrail({ sectionId }) call surfaces the edit immediately after
 * refresh().
 */

import { useCallback, useEffect, useState } from 'react';
import type { DossierSectionView } from '../types';
import type { ProgramPathway } from '../data/programs';

// ─── List ───────────────────────────────────────────────────────────────────

export interface DossierSectionListItem {
  id: string | number;
  num: string;
  label: string;
  status: 'complete' | 'review' | 'draft' | 'na' | 'empty' | 'blocked';
  required: boolean;
  category?: string;
}

interface DossierProjectInfo {
  id: string;
  ident: string;
  title: string;
}

interface ListPayload {
  project: DossierProjectInfo;
  sections: DossierSectionListItem[];
}

export interface UseDossierSectionListResult {
  project: DossierProjectInfo | null;
  sections: DossierSectionListItem[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDossierSectionList(
  pathway: ProgramPathway | null,
  projectIdent: string | null,
): UseDossierSectionListResult {
  const [state, setState] = useState<{
    project: DossierProjectInfo | null;
    sections: DossierSectionListItem[] | null;
    loading: boolean;
    error: string | null;
  }>({ project: null, sections: null, loading: false, error: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t: number) => t + 1), []);

  useEffect(() => {
    if (!pathway || !projectIdent) {
      setState({ project: null, sections: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`/api/mdx/dossier/${pathway}/${encodeURIComponent(projectIdent)}/sections`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as ListPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({
          project:  payload.project,
          sections: payload.sections,
          loading:  false,
          error:    null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load sections',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [pathway, projectIdent, tick]);

  return { ...state, refresh };
}

// ─── Detail ─────────────────────────────────────────────────────────────────

interface DetailPayload {
  data: DossierSectionView;
}

export interface UseDossierSectionResult {
  view: DossierSectionView | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  refresh: () => void;
  /** PATCH the section body. On success the local view is replaced
   *  with the server's post-write view (so the version + lastEdited
   *  fields advance immediately) and the audit pane sees a fresh row. */
  saveBody: (body: string, reason?: string) => Promise<DossierSectionView>;
}

export function useDossierSection(
  pathway: ProgramPathway | null,
  projectIdent: string | null,
  sectionId: string | number | null,
): UseDossierSectionResult {
  const [state, setState] = useState<{
    view: DossierSectionView | null;
    loading: boolean;
    error: string | null;
  }>({ view: null, loading: false, error: null });
  const [save, setSave] = useState<{ saving: boolean; saveError: string | null }>({
    saving: false,
    saveError: null,
  });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t: number) => t + 1), []);

  const sectionKey = sectionId == null ? null : String(sectionId);

  useEffect(() => {
    if (!pathway || !projectIdent || sectionKey === null) {
      setState({ view: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const url = `/api/mdx/dossier/${pathway}/${encodeURIComponent(projectIdent)}/sections/${encodeURIComponent(sectionKey)}`;
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as DetailPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ view: payload.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load section',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [pathway, projectIdent, sectionKey, tick]);

  const saveBody = useCallback(
    async (body: string, reason?: string): Promise<DossierSectionView> => {
      if (!pathway || !projectIdent || sectionKey === null) {
        throw new Error('Cannot save: pathway, project, and section are required');
      }
      setSave({ saving: true, saveError: null });
      try {
        const url = `/api/mdx/dossier/${pathway}/${encodeURIComponent(projectIdent)}/sections/${encodeURIComponent(sectionKey)}`;
        const res = await fetch(url, {
          method:      'PATCH',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify({ body, reason }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const payload = (await res.json()) as DetailPayload;
        setState({ view: payload.data, loading: false, error: null });
        setSave({ saving: false, saveError: null });
        return payload.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save section';
        setSave({ saving: false, saveError: message });
        throw err;
      }
    },
    [pathway, projectIdent, sectionKey],
  );

  return { ...state, ...save, refresh, saveBody };
}
