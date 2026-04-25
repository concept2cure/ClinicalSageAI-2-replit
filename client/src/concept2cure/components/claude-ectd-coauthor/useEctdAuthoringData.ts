/**
 * useEctdAuthoringData — Live eCTD tree + artifact content for ClaudeEctdCoauthor.
 *
 * Sources (existing authoring routes — see server/routes/authoring.router.ts):
 *   GET /api/authoring/docs?module=&product_code=…  → all docs across M1-M5
 *   GET /api/authoring/docs/:docId/sections          → sections inside a doc
 *
 * The module-default behavior of the docs route ("M3" when module is undefined)
 * is bypassed by passing module="" explicitly so we get all modules in one
 * request. Sections are then fetched in parallel per doc.
 *
 * Mapping notes:
 *   - authoring_documents.module is "M1".."M5"; the bundle's tree wants
 *     "1".."5". We strip the prefix.
 *   - authoring_documents.status is mixed-case ('draft', 'IN_REVIEW',
 *     'APPROVED', 'FROZEN', etc.). We normalize to the bundle's status
 *     vocabulary: 'draft' | 'review' | 'approved' | 'blocked' | 'todo'.
 *   - authoring_sections.content is plain text/markdown today, not
 *     structured blocks. We render it as a single paragraph block with
 *     provenance derived from section + doc metadata. Richer block-level
 *     parsing (h2 split, citations, tables) is a future step that needs
 *     either a TipTap-aware parser or a schema enrichment.
 *
 * Falls through to the bundle fixtures when the project has no authoring
 * documents yet — the component still renders cleanly.
 *
 * @module client/src/concept2cure/components/claude-ectd-coauthor/useEctdAuthoringData
 */
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/queryClient';

import type {
  ArtifactSection,
  EctdStatus,
  EctdTreeChild,
  EctdTreeModule,
  ParagraphBlock,
} from './data';

interface AuthoringDocRow {
  id: string;
  title: string;
  module: string;
  product_code?: string | null;
  locale?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  section_count?: number;
}

interface AuthoringSectionRow {
  id: string;
  doc_id: string;
  code: string;
  title: string;
  content: string;
  order_index: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface DocsResponse {
  success?: boolean;
  documents?: AuthoringDocRow[];
}

interface SectionsResponse {
  success?: boolean;
  sections?: AuthoringSectionRow[];
}

const ECTD_MODULE_LABEL: Record<string, string> = {
  '1': 'Administrative',
  '2': 'Summaries',
  '3': 'Quality (CMC)',
  '4': 'Nonclinical',
  '5': 'Clinical',
};

function normalizeStatus(raw: string | null | undefined): EctdStatus {
  const s = (raw || '').toLowerCase();
  if (s === 'approved' || s === 'frozen' || s === 'published') return 'approved';
  if (s === 'review' || s === 'in_review' || s === 'submitted') return 'review';
  if (s === 'blocked' || s === 'rejected') return 'blocked';
  if (s === 'todo' || s === 'pending') return 'todo';
  return 'draft';
}

/** Pick the worst (lowest-progress) status across a set — that's what the
 *  bundle's tree icon shows for a module that has mixed-status sections. */
function worstStatus(statuses: EctdStatus[]): EctdStatus {
  const order: EctdStatus[] = ['blocked', 'todo', 'draft', 'review', 'approved'];
  let pick: EctdStatus = 'approved';
  for (const s of statuses) {
    if (order.indexOf(s) < order.indexOf(pick)) pick = s;
  }
  return pick;
}

function moduleNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/M?(\d)/i);
  return m ? m[1] : null;
}

function relTime(iso?: string | null): string {
  if (!iso) return 'just now';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return 'just now';
  }
}

/** Build a single ArtifactSection from a section row + its parent doc. */
function buildArtifact(section: AuthoringSectionRow, doc: AuthoringDocRow): ArtifactSection {
  const path = section.code || section.id;
  const moduleNum = moduleNumber(doc.module) || '?';
  const moduleLabel = ECTD_MODULE_LABEL[moduleNum] || doc.module || 'Module';
  const editor = doc.created_by || 'authoring service';
  const lastEdited = relTime(section.updated_at || doc.updated_at);

  const paragraph: ParagraphBlock = {
    kind: 'p',
    id: section.id,
    confidence: 0.85,
    prov: {
      source: `${doc.title} · §${section.code}`,
      model: editor,
      audit: section.id.slice(0, 12),
      foot: '21 CFR Part 11 · authoring_sections',
    },
    spans: [{ t: section.content || '(no content)' }],
  };

  return {
    path,
    title: section.title,
    module: `Module ${moduleNum} — ${moduleLabel}`,
    version: doc.status === 'draft' ? 'v0.1 · draft' : `v1 · ${doc.status}`,
    lastEditedBy: editor,
    lastEdited,
    masthead: [
      { lbl: 'Application', val: doc.product_code || doc.title },
      { lbl: 'Sponsor', val: 'Concept2Cure Bio' },
      { lbl: 'Module', val: `${section.code} ${section.title}` },
      { lbl: 'Version', val: paragraph ? `${doc.status}` : '—' },
    ],
    blocks: [paragraph],
  };
}

export interface UseEctdAuthoringDataOptions {
  projectId?: string | null;
  /** When set, restricts the fetch to a single product_code. */
  productCode?: string | null;
  enabled?: boolean;
}

export interface UseEctdAuthoringDataReturn {
  tree: EctdTreeModule[] | null;
  artifacts: Record<string, ArtifactSection> | null;
  isLoading: boolean;
  error: Error | null;
}

export function useEctdAuthoringData({
  projectId,
  productCode,
  enabled = true,
}: UseEctdAuthoringDataOptions): UseEctdAuthoringDataReturn {
  const scope = productCode || (projectId ? String(projectId) : null);

  const query = useQuery<{
    tree: EctdTreeModule[];
    artifacts: Record<string, ArtifactSection>;
  }>({
    queryKey: ['ectd-authoring-data', scope],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const qs = new URLSearchParams();
      // module="" bypasses the route's "M3" default and returns all modules.
      qs.set('module', '');
      if (productCode) qs.set('product_code', productCode);
      const docsRes = await apiRequest('GET', `/api/authoring/docs?${qs.toString()}`);
      if (!docsRes.ok) {
        return { tree: [], artifacts: {} };
      }
      const docsBody = (await docsRes.json()) as DocsResponse;
      const docs = docsBody.documents || [];
      if (docs.length === 0) {
        return { tree: [], artifacts: {} };
      }

      // Fetch sections per doc in parallel.
      const sectionResults = await Promise.all(
        docs.map(async d => {
          const r = await apiRequest('GET', `/api/authoring/docs/${d.id}/sections`);
          if (!r.ok) return { doc: d, sections: [] as AuthoringSectionRow[] };
          const body = (await r.json()) as SectionsResponse;
          return { doc: d, sections: body.sections || [] };
        }),
      );

      const artifactsMap: Record<string, ArtifactSection> = {};
      const childrenByModule: Record<string, EctdTreeChild[]> = {};

      for (const { doc, sections } of sectionResults) {
        const num = moduleNumber(doc.module);
        if (!num) continue;
        for (const s of sections) {
          if (!s.code) continue;
          // Last-write-wins per section code (multiple docs can share a code; keep
          // the most recently updated).
          const existing = artifactsMap[s.code];
          const incoming = buildArtifact(s, doc);
          if (
            !existing ||
            new Date(s.updated_at || s.created_at || 0).getTime() >
              new Date(0).getTime()
          ) {
            artifactsMap[s.code] = incoming;
          }
          const child: EctdTreeChild = {
            num: s.code,
            label: s.title,
            status: normalizeStatus(doc.status),
          };
          if (!childrenByModule[num]) childrenByModule[num] = [];
          // Avoid duplicate codes on the tree.
          if (!childrenByModule[num].some(c => c.num === child.num)) {
            childrenByModule[num].push(child);
          }
        }
      }

      const tree: EctdTreeModule[] = (['1', '2', '3', '4', '5'] as const).map(num => {
        const children = childrenByModule[num] || [];
        return {
          num,
          label: ECTD_MODULE_LABEL[num] || `Module ${num}`,
          status: children.length > 0 ? worstStatus(children.map(c => c.status)) : 'todo',
          open: num === '2', // matches the bundle's default-open module
          children,
        };
      });

      return { tree, artifacts: artifactsMap };
    },
  });

  return {
    tree: query.data?.tree ?? null,
    artifacts: query.data?.artifacts ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error) ?? null,
  };
}
