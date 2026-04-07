import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle } from 'lucide-react';

type ComputeStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ComputeJob {
  job_id: string;
  surface_key: string;
  intent_type: string;
  status: ComputeStatus;
  artifact_id?: string;
  artifact_title?: string;
  artifact_status?: string;
  artifact_version?: number;
  artifact_ctd_section?: string;
  runtime_profile_key?: string;
  runtime_maturity?: 'production-path' | 'seeded' | 'provisional' | 'stub';
  output_format?: string;
  placement_state?: 'placed' | 'unplaced';
  provenance_ref?: string;
  audit_ref?: string;
  created_at: string;
}

const SURFACE_PRESETS = [
  {
    label: 'AnA evidence memo',
    surfaceKey: 'ri_copilot',
    intentType: 'docx_generation',
    format: 'docx',
    ctdSection: 'm2.5',
  },
  {
    label: 'CMC Module 3 doc',
    surfaceKey: 'cmc_module3',
    intentType: 'docx_generation',
    format: 'docx',
    ctdSection: 'm3',
  },
  {
    label: 'eCTD/IND section draft',
    surfaceKey: 'ectd_ind',
    intentType: 'safe_html_generation',
    format: 'html',
    ctdSection: 'm1.2',
  },
  {
    label: '510(k)/CER governed export (template)',
    surfaceKey: 'governed_export',
    intentType: 'bundle_assembly',
    format: 'zip',
    ctdSection: 'm5',
  },
] as const;

function statusTone(status: ComputeStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'running':
      return 'bg-blue-50 text-stone-700 border-blue-200';
    default:
      return 'bg-stone-50 text-stone-700 border-stone-200';
  }
}

interface ComputeJobPanelProps {
  projectId?: string;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenProvenance?: (artifactId: string) => void;
  onOpenAudit?: (artifactId: string) => void;
  onPlaceArtifact?: (artifactId: string) => void;
  onJobsLoaded?: (jobs: ComputeJob[]) => void;
}

export function ComputeJobPanel({
  projectId,
  onOpenArtifact,
  onOpenProvenance,
  onOpenAudit,
  onPlaceArtifact,
  onJobsLoaded,
}: ComputeJobPanelProps) {
  const [jobs, setJobs] = useState<ComputeJob[]>([]);
  const [busySurface, setBusySurface] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [detailByJob, setDetailByJob] = useState<Record<string, any>>({});

  const activeCount = useMemo(
    () => jobs.filter(j => j.status === 'queued' || j.status === 'running').length,
    [jobs]
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs`);
    const payload = await res.json();
    const nextJobs = payload.data || [];
    setJobs(nextJobs);
    onJobsLoaded?.(nextJobs);
  }, [projectId, onJobsLoaded]);

  const loadDetail = useCallback(
    async (jobId: string) => {
      if (!projectId) return;
      const res = await apiRequest(
        'GET',
        `/api/concept2cure/compute/projects/${projectId}/jobs/${jobId}`
      );
      const payload = await res.json();
      setDetailByJob(prev => ({ ...prev, [jobId]: payload.data }));
    },
    [projectId]
  );

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const launch = async (preset: (typeof SURFACE_PRESETS)[number]) => {
    if (!projectId) return;
    setBusySurface(preset.surfaceKey);
    try {
      await apiRequest('POST', `/api/concept2cure/compute/projects/${projectId}/jobs`, {
        surfaceKey: preset.surfaceKey,
        intentType: preset.intentType,
        title: preset.label,
        content: `Generated via Artifact Compute Plane for ${preset.label}.`,
        ctdSection: preset.ctdSection,
        format: preset.format,
      });
      await load();
    } finally {
      setBusySurface(null);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-900">Artifact Compute Plane</h3>
        <Badge variant="outline" className="text-xs">
          {activeCount} active
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {SURFACE_PRESETS.map(preset => (
          <Button
            key={preset.surfaceKey}
            variant="outline"
            className="justify-between"
            onClick={() => launch(preset)}
            disabled={busySurface === preset.surfaceKey}
          >
            <span className="text-xs">{preset.label}</span>
            {busySurface === preset.surfaceKey ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <PlayCircle className="w-3 h-3" />
            )}
          </Button>
        ))}
      </div>

      <div className="space-y-2 max-h-80 overflow-auto">
        {jobs.map(job => (
          <div key={job.job_id} className="rounded border border-stone-100 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-stone-800">
                  {job.surface_key} • {job.intent_type}
                </div>
                <div className="text-[11px] text-stone-500">
                  {new Date(job.created_at).toLocaleString()}
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${statusTone(job.status)}`}>
                {job.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-stone-500">
                Runtime:{' '}
                <span className="font-medium text-stone-700">
                  {job.runtime_profile_key || 'docx-python'}
                </span>{' '}
                · Format:{' '}
                <span className="font-medium text-stone-700">{job.output_format || 'docx'}</span> ·
                Maturity:{' '}
                <span className="font-medium text-stone-700">
                  {job.runtime_maturity || 'seeded'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[11px] text-blue-600 hover:text-blue-800"
                onClick={async () => {
                  if (expandedJobId === job.job_id) {
                    setExpandedJobId(null);
                    return;
                  }
                  setExpandedJobId(job.job_id);
                  await loadDetail(job.job_id);
                }}
              >
                {expandedJobId === job.job_id ? 'Hide details' : 'Details'}
              </Button>
            </div>
            {/* Governed artifact summary — visible without expanding */}
            {job.artifact_id && job.status === 'completed' && (
              <div className="mt-1.5 rounded bg-emerald-50/60 border border-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                <div className="font-medium">{job.artifact_title || job.artifact_id}</div>
                <div>
                  Artifact ID: {job.artifact_id} · v{job.artifact_version || 1} ·{' '}
                  {job.artifact_status || 'draft'}
                </div>
                <div>
                  Placement:{' '}
                  {job.placement_state === 'placed' && job.artifact_ctd_section
                    ? `§${job.artifact_ctd_section}`
                    : 'unplaced'}{' '}
                  · Provenance: {job.provenance_ref || 'none'} · Audit: {job.audit_ref || 'none'}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800"
                    onClick={() => onOpenArtifact?.(job.artifact_id!)}
                  >
                    Open in editor
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-violet-600 hover:text-violet-800"
                    onClick={() => onOpenProvenance?.(job.artifact_id!)}
                  >
                    Open provenance
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-emerald-600 hover:text-emerald-800"
                    onClick={() => onOpenAudit?.(job.artifact_id!)}
                  >
                    Open audit
                  </Button>
                  {job.placement_state !== 'placed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-orange-600 hover:text-orange-800"
                      onClick={() => onPlaceArtifact?.(job.artifact_id!)}
                    >
                      Apply placement
                    </Button>
                  )}
                </div>
              </div>
            )}
            {expandedJobId === job.job_id && (
              <div className="mt-2 rounded border border-stone-100 bg-stone-50 p-2 text-[11px] space-y-1">
                {detailByJob[job.job_id]?.attempts?.[0] && (
                  <div>
                    Attempt #{detailByJob[job.job_id].attempts[0].attempt_number} · Runtime{' '}
                    {detailByJob[job.job_id].attempts[0].worker_runtime} · Status{' '}
                    {detailByJob[job.job_id].attempts[0].status}
                  </div>
                )}
                {detailByJob[job.job_id]?.attempts?.[0]?.error_message && (
                  <div className="text-red-600">
                    Error: {detailByJob[job.job_id].attempts[0].error_message}
                  </div>
                )}
                {job.artifact_id ? (
                  <>
                    <div>
                      Artifact:{' '}
                      <span className="font-medium">{job.artifact_title || job.artifact_id}</span> ·
                      Status {job.artifact_status || 'draft'} · v{job.artifact_version || 1}
                      {job.artifact_ctd_section
                        ? ` · ${job.artifact_ctd_section}`
                        : ' · placement suggested'}
                    </div>
                    <div className="text-stone-600">
                      Placement: {detailByJob[job.job_id]?.placement_state || 'unplaced'} ·
                      Provenance ref: {detailByJob[job.job_id]?.provenance_ref || 'pending'} · Audit
                      ref: {detailByJob[job.job_id]?.audit_ref || 'pending'}
                    </div>
                    <div className="text-stone-600">
                      Workflow impact:{' '}
                      {(job.artifact_status || 'draft') === 'draft'
                        ? 'Requires review assignment before submission.'
                        : 'Review pipeline in progress.'}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-blue-600 hover:text-blue-800"
                        onClick={() => onOpenArtifact?.(job.artifact_id!)}
                      >
                        Open editor
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-violet-600 hover:text-violet-800"
                        onClick={() => onOpenProvenance?.(job.artifact_id!)}
                      >
                        Provenance
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-emerald-600 hover:text-emerald-800"
                        onClick={() => onOpenAudit?.(job.artifact_id!)}
                      >
                        Audit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-orange-600 hover:text-orange-800"
                        onClick={() => onPlaceArtifact?.(job.artifact_id!)}
                      >
                        Place
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-stone-500">No governed artifact registered yet.</div>
                )}
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && <div className="text-xs text-stone-500">No compute jobs yet.</div>}
      </div>
    </div>
  );
}
