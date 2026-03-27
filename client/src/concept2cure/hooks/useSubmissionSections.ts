/**
 * useSubmissionSections — Load section tree based on submission type.
 *
 * Per BIOTECH_WORKFLOW_PLAN: "The project type drives everything. The section tree IS the workflow."
 *
 * For IND: fetches M1-M5 section tree from /api/ind-sections
 * For 510K/PMA/CER: uses static sections from docTypes.ts
 * Enriches each section with live artifact status from project artifacts.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionNode {
  code: string;
  title: string;
  module: string;
  depth: number;
  required: boolean;
  aiDraftable: boolean;
  /** Live status derived from placed artifacts */
  status: 'empty' | 'drafting' | 'draft' | 'review' | 'approved' | 'locked';
  /** Number of artifacts placed in this section */
  artifactCount: number;
  /** Regulatory reference (CFR/ICH citation) */
  regulatoryRef?: string;
  children?: SectionNode[];
}

// ─── Static section definitions for device pathways ──────────────────────────

const SECTIONS_510K: SectionNode[] = [
  { code: 'admin', title: '1. Administrative Information', module: '510K', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'ifu', title: '2. Indications for Use', module: '510K', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'desc', title: '3. Device Description', module: '510K', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'predicate', title: '4. Predicate Comparison', module: '510K', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'se', title: '5. Substantial Equivalence Discussion', module: '510K', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'testing', title: '6. Performance Testing', module: '510K', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'labeling', title: '7. Labeling', module: '510K', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'conclusion', title: '8. Conclusion', module: '510K', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
];

const SECTIONS_CER: SectionNode[] = [
  { code: 'sota', title: '1. State of the Art', module: 'CER', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'device', title: '2. Device Under Evaluation', module: 'CER', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'dataset', title: '3. Clinical Data Set', module: 'CER', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'appraisal', title: '4. Appraisal of Clinical Data', module: 'CER', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'benefit-risk', title: '5. Benefit-Risk Analysis', module: 'CER', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
  { code: 'gspr', title: '6. GSPR Compliance', module: 'CER', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'pms', title: '7. Post-Market Surveillance', module: 'CER', depth: 0, required: true, aiDraftable: false, status: 'empty', artifactCount: 0 },
  { code: 'conclusions', title: '8. Conclusions', module: 'CER', depth: 0, required: true, aiDraftable: true, status: 'empty', artifactCount: 0 },
];

// ─── IND section mapper (API response → SectionNode tree) ────────────────────

interface INDSectionRaw {
  code: string;
  title: string;
  module: string;
  depth: number;
  required: boolean;
  aiDraftable: boolean;
  regulatoryRef?: string;
  children?: INDSectionRaw[];
}

function mapINDSections(raw: INDSectionRaw[]): SectionNode[] {
  return raw.map(s => ({
    code: s.code,
    title: s.title,
    module: s.module,
    depth: s.depth,
    required: s.required,
    aiDraftable: s.aiDraftable,
    regulatoryRef: s.regulatoryRef,
    status: 'empty' as const,
    artifactCount: 0,
    children: s.children ? mapINDSections(s.children) : undefined,
  }));
}

// ─── Artifact status enrichment ──────────────────────────────────────────────

interface ArtifactSummary {
  ctdSection?: string | null;
  status?: string;
}

function enrichWithArtifactStatus(sections: SectionNode[], artifacts: ArtifactSummary[]): SectionNode[] {
  // Build a map: ctdSection → array of artifact statuses
  const sectionMap = new Map<string, ArtifactSummary[]>();
  for (const a of artifacts) {
    if (a.ctdSection) {
      const existing = sectionMap.get(a.ctdSection) || [];
      existing.push(a);
      sectionMap.set(a.ctdSection, existing);
    }
  }

  function enrich(nodes: SectionNode[]): SectionNode[] {
    return nodes.map(node => {
      const placed = sectionMap.get(node.code) || [];
      let status: SectionNode['status'] = 'empty';
      if (placed.length > 0) {
        // Use the highest-priority status among placed artifacts
        const statuses = placed.map(a => a.status || 'draft');
        if (statuses.includes('locked')) status = 'locked';
        else if (statuses.includes('approved')) status = 'approved';
        else if (statuses.includes('review')) status = 'review';
        else if (statuses.includes('draft')) status = 'draft';
        else status = 'drafting';
      }
      return {
        ...node,
        status,
        artifactCount: placed.length,
        children: node.children ? enrich(node.children) : undefined,
      };
    });
  }

  return enrich(sections);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSubmissionSections(
  projectId: string | undefined,
  submissionType: string | undefined
) {
  // Fetch IND sections from API (only for IND/NDA/BLA/MAA pharma types)
  const isPharma = ['IND', 'NDA', 'BLA', 'MAA'].includes(submissionType || '');

  const indSectionsQuery = useQuery({
    queryKey: ['concept2cure', 'ind-sections'] as const,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ind-sections');
      const json = await res.json();
      return json as { modules: INDSectionRaw[] };
    },
    enabled: isPharma,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  // Fetch project artifacts for status enrichment
  const artifactsQuery = useQuery({
    queryKey: ['concept2cure', 'projects', projectId, 'artifacts'] as const,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/artifacts`);
      const json = await res.json();
      // Unwrap sendSuccess envelope: { success: true, data: [...] }
      return (json.data || json) as ArtifactSummary[];
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30s cache
  });

  // Build the section tree based on submission type
  let baseSections: SectionNode[] = [];

  if (isPharma && indSectionsQuery.data?.modules) {
    baseSections = mapINDSections(indSectionsQuery.data.modules);
  } else {
    switch (submissionType) {
      case '510K':
      case 'DE_NOVO':
        baseSections = SECTIONS_510K;
        break;
      case 'CER':
      case 'IVDR':
        baseSections = SECTIONS_CER;
        break;
      case 'PMA':
        baseSections = SECTIONS_510K; // PMA uses similar structure
        break;
      default:
        baseSections = [];
    }
  }

  // Enrich with live artifact status
  const artifacts = Array.isArray(artifactsQuery.data) ? artifactsQuery.data : [];
  const sections = baseSections.length > 0
    ? enrichWithArtifactStatus(baseSections, artifacts)
    : baseSections;

  // Calculate summary stats
  const flatSections = flattenSections(sections);
  const totalRequired = flatSections.filter(s => s.required).length;
  const completedRequired = flatSections.filter(s => s.required && (s.status === 'approved' || s.status === 'locked')).length;
  const readinessPercent = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  return {
    sections,
    isLoading: (isPharma && indSectionsQuery.isLoading) || artifactsQuery.isLoading,
    error: indSectionsQuery.error || artifactsQuery.error,
    totalSections: flatSections.length,
    totalRequired,
    completedRequired,
    readinessPercent,
    submissionType: submissionType || null,
  };
}

// ─── Helper: flatten nested tree ─────────────────────────────────────────────

function flattenSections(sections: SectionNode[]): SectionNode[] {
  const result: SectionNode[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.children) {
      result.push(...flattenSections(s.children));
    }
  }
  return result;
}
