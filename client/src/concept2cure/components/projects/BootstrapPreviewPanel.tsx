/**
 * BootstrapPreviewPanel — Shows what will be created before project creation.
 *
 * Displays sections, milestones, required artifacts, and dossier standard
 * for a selected registry entry. Used in the project creation flow.
 *
 * @module client/src/concept2cure/components/projects/BootstrapPreviewPanel
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BootstrapPreview {
  entry: {
    id: string;
    displayName: string;
    dossierStandard: string;
    agency: string;
    region: string;
  };
  regionProfile: {
    country: string;
    agencyFullName: string;
    submissionGateway?: string;
  } | null;
  sections: {
    code: string;
    title: string;
    module: number;
    required: boolean;
  }[];
  milestones: {
    id: string;
    title: string;
    taskCount: number;
  }[];
  requiredArtifacts: string[];
  dossierStandard: string;
  validationProfile: string;
}

interface BootstrapPreviewPanelProps {
  registryId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BootstrapPreviewPanel({ registryId }: BootstrapPreviewPanelProps) {
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['regulatory-catalog', 'bootstrap-preview', registryId],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/concept2cure/regulatory-catalog/bootstrap-preview', {
        registryId,
      });
      const json = await res.json();
      return (json.data ?? json) as BootstrapPreview;
    },
    enabled: !!registryId,
  });

  if (!registryId) return null;

  if (isLoading) {
    return (
      <Card className="p-3 border-stone-100 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (error || !preview) {
    return (
      <Card className="p-3 border-stone-100">
        <p className="text-[12px] text-stone-400">Unable to load bootstrap preview</p>
      </Card>
    );
  }

  const requiredSections = preview.sections.filter(s => s.required);
  const optionalSections = preview.sections.filter(s => !s.required);

  // Group sections by module
  const sectionsByModule: Record<number, typeof preview.sections> = {};
  for (const s of preview.sections) {
    if (!sectionsByModule[s.module]) sectionsByModule[s.module] = [];
    sectionsByModule[s.module].push(s);
  }

  return (
    <Card className="p-3 border-stone-100 space-y-3">
      <div>
        <p className="text-[11px] text-stone-500 uppercase tracking-wide mb-1">Bootstrap Preview</p>
        <p className="text-[13px] font-medium text-stone-800">{preview.entry.displayName}</p>
        <p className="text-[11px] text-stone-500">
          {preview.dossierStandard} · {preview.sections.length} sections · {preview.milestones.length} milestones
        </p>
      </div>

      {/* Sections by Module */}
      <div>
        <p className="text-[11px] text-stone-500 mb-1">Sections ({requiredSections.length} required, {optionalSections.length} optional)</p>
        <div className="max-h-[200px] overflow-y-auto space-y-2">
          {Object.entries(sectionsByModule)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([module, sections]) => (
              <div key={module}>
                <p className="text-[10px] text-stone-400 uppercase mb-0.5">Module {module}</p>
                {sections.map(s => (
                  <div
                    key={s.code}
                    className="flex items-center gap-2 py-0.5 text-[12px]"
                  >
                    <span className="font-mono text-stone-400 text-[10px] w-12 shrink-0">{s.code}</span>
                    <span className="text-stone-700 truncate">{s.title}</span>
                    {s.required && (
                      <Badge variant="outline" className="text-[9px] shrink-0 ml-auto">req</Badge>
                    )}
                  </div>
                ))}
              </div>
            ))
          }
        </div>
      </div>

      {/* Milestones */}
      {preview.milestones.length > 0 && (
        <div>
          <p className="text-[11px] text-stone-500 mb-1">Milestones</p>
          <div className="space-y-0.5">
            {preview.milestones.map((m, i) => (
              <div key={m.id} className="flex items-center justify-between text-[12px]">
                <span className="text-stone-700">
                  <span className="text-stone-400 mr-1">{i + 1}.</span>
                  {m.title}
                </span>
                <span className="text-[10px] text-stone-400">{m.taskCount} tasks</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required Artifacts */}
      {preview.requiredArtifacts.length > 0 && (
        <div>
          <p className="text-[11px] text-stone-500 mb-1">Required Artifacts</p>
          <div className="flex flex-wrap gap-1">
            {preview.requiredArtifacts.map(a => (
              <Badge key={a} variant="secondary" className="text-[10px]">
                {a.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Gateway Info */}
      {preview.regionProfile?.submissionGateway && (
        <p className="text-[10px] text-stone-400">
          Gateway: {preview.regionProfile.agencyFullName}
        </p>
      )}
    </Card>
  );
}

export default BootstrapPreviewPanel;
