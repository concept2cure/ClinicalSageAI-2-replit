/**
 * useLiveSections — fetches the live cerv2_510k_sections for a program
 * via GET /api/510k/projects/:programIdent/document-preview and adapts
 * them to the kit editor's EditorContent + EditorSectionVolume shape.
 *
 * The kit's editor was authored against fixtures (EDITOR_CONTENT_11,
 * EDITOR_SECTIONS). Real users need their own document, not the demo.
 * The endpoint already exists; this hook just fetches + translates,
 * with the same field names the kit expects so kit JSX renders unchanged.
 *
 * When `programIdent` is null the hook returns null payloads and the
 * editor falls back to the kit fixtures (kit-faithful demo mode).
 */

import { useEffect, useState, useCallback } from 'react';
import type {
  EditorBlock,
  EditorBlockParagraph,
  EditorContent,
  EditorSectionItem,
  EditorSectionStatus,
  EditorSectionVolume,
} from '../data/editor';

interface ServerSectionRow {
  id: number;
  documentId: number | null;
  sectionNumber: string;
  sectionTitle: string;
  sectionKey: string;
  category: string;
  status: string;
  completionPercentage: number;
  contentLength: number;
  content: string;
  isRequired: boolean;
  parentSectionId: number | null;
  level: number;
  displayOrder: number;
  updatedAt: string | null;
  /* Draft provenance — set when AnA drafted via write_kit_section. */
  draftSource?: string | null;
  draftedAt?: string | null;
  draftedSummary?: string | null;
}

interface DocumentPreviewPayload {
  projectId: string;
  documentTitle: string;
  totalSections: number;
  approvedCount: number;
  draftingCount: number;
  todoCount: number;
  completionPercentage: number;
  sections: ServerSectionRow[];
}

export interface UseLiveSectionsResult {
  sections: EditorSectionVolume[] | null;
  contentMap: Record<string, EditorContent> | null;
  rawSections: ServerSectionRow[] | null;
  documentTitle: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const PROVENANCE_STAMP = {
  source: 'Live document — cerv2_510k_sections',
  model: 'manual',
  audit: 'cerv2_section_versions',
  foot: 'Edited by user · audited on PATCH',
} as const;

function statusToEditor(status: string): EditorSectionStatus {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved' || s === 'validated') return 'complete';
  if (s === 'review') return 'review';
  if (s === 'drafting' || s === 'in_progress') return 'draft';
  if (s === 'na' || s === 'not_applicable') return 'na';
  return 'empty';
}

function blocksFromContent(sectionId: number, content: string): EditorBlock[] {
  const trimmed = (content ?? '').trim();
  if (!trimmed) {
    const empty: EditorBlockParagraph = {
      id: `s${sectionId}-b0`,
      kind: 'p',
      confidence: 1.0,
      prov: { ...PROVENANCE_STAMP },
      spans: [{ t: '— empty —' }],
      flags: null,
    };
    return [empty];
  }
  const out: EditorBlock[] = [];
  const paras = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  paras.forEach((para, idx) => {
    if (para.startsWith('## ')) {
      out.push({ id: `s${sectionId}-h${idx}`, kind: 'h2', text: para.replace(/^##\s+/, '').trim() });
    } else {
      out.push({
        id: `s${sectionId}-b${idx}`,
        kind: 'p',
        confidence: 1.0,
        prov: { ...PROVENANCE_STAMP },
        spans: [{ t: para }],
        flags: null,
      });
    }
  });
  return out;
}

function rowToItem(r: ServerSectionRow): EditorSectionItem {
  return {
    id: r.id,
    num: `§${r.sectionNumber}`,
    label: r.sectionTitle,
    status: statusToEditor(r.status),
    required: r.isRequired,
    words: r.content ? r.content.trim().split(/\s+/).filter(Boolean).length : 0,
    blocker: r.isRequired && (r.contentLength === 0 || (r.status ?? 'todo').toLowerCase() === 'todo'),
  };
}

function rowToContent(r: ServerSectionRow): EditorContent {
  const anaDraft =
    r.draftSource === 'ana' && r.draftedAt
      ? {
          source: 'ana' as const,
          at: r.draftedAt,
          summary: r.draftedSummary ?? undefined,
          rowId: r.id,
        }
      : null;
  return {
    id: r.id,
    num: `§${r.sectionNumber}`,
    label: r.sectionTitle,
    status: statusToEditor(r.status),
    masthead: [
      { lbl: 'Section', val: `§${r.sectionNumber}` },
      { lbl: 'Required', val: r.isRequired ? 'Yes' : 'No' },
      { lbl: 'Status', val: r.status ?? 'todo' },
      { lbl: 'Completion', val: `${r.completionPercentage ?? 0}%` },
    ],
    blocks: blocksFromContent(r.id, r.content ?? ''),
    anaDraft,
  };
}

function adapt(payload: DocumentPreviewPayload) {
  const sorted = [...payload.sections].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const seen: string[] = [];
  const grouped: Record<string, EditorSectionItem[]> = {};
  sorted.forEach(r => {
    const cat = r.category || 'Sections';
    if (!grouped[cat]) {
      grouped[cat] = [];
      seen.push(cat);
    }
    grouped[cat].push(rowToItem(r));
  });
  const volumes: EditorSectionVolume[] = seen.map(cat => ({ volume: cat, items: grouped[cat] }));
  const contentMap: Record<string, EditorContent> = {};
  sorted.forEach(r => {
    contentMap[String(r.id)] = rowToContent(r);
  });
  return { volumes, contentMap, rawSections: sorted };
}

export function useLiveSections(programIdent: string | null): UseLiveSectionsResult {
  const [state, setState] = useState<{
    sections: EditorSectionVolume[] | null;
    contentMap: Record<string, EditorContent> | null;
    rawSections: ServerSectionRow[] | null;
    documentTitle: string | null;
    loading: boolean;
    error: string | null;
  }>({
    sections: null,
    contentMap: null,
    rawSections: null,
    documentTitle: null,
    loading: false,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!programIdent) {
      setState({
        sections: null,
        contentMap: null,
        rawSections: null,
        documentTitle: null,
        loading: false,
        error: null,
      });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    fetch(`/api/510k/projects/${encodeURIComponent(programIdent)}/document-preview`, {
      credentials: 'include',
    })
      .then(async res => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as DocumentPreviewPayload;
      })
      .then(payload => {
        if (cancelled) return;
        const { volumes, contentMap, rawSections } = adapt(payload);
        setState({
          sections: volumes,
          contentMap,
          rawSections,
          documentTitle: payload.documentTitle,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(s => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load sections',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [programIdent, tick]);

  return { ...state, refresh };
}
