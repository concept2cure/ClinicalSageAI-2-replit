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
  created_at: string;
}

const SURFACE_PRESETS = [
  { label: 'RI Copilot evidence memo', surfaceKey: 'ri_copilot', intentType: 'docx_generation', format: 'docx', ctdSection: 'm2.5' },
  { label: 'CMC Module 3 doc', surfaceKey: 'cmc_module3', intentType: 'docx_generation', format: 'docx', ctdSection: 'm3' },
  { label: 'eCTD/IND section draft', surfaceKey: 'ectd_ind', intentType: 'safe_html_generation', format: 'html', ctdSection: 'm1.2' },
  { label: '510(k)/CER governed export', surfaceKey: 'governed_export', intentType: 'bundle_assembly', format: 'zip', ctdSection: 'm5' },
] as const;

function statusTone(status: ComputeStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'running':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-zinc-50 text-zinc-700 border-zinc-200';
  }
}

interface ComputeJobPanelProps {
  projectId?: string;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenProvenance?: (artifactId: string) => void;
  onOpenAudit?: (artifactId: string) => void;
  onPlaceArtifact?: (artifactId: string) => void;
}

export function ComputeJobPanel({
  projectId,
  onOpenArtifact,
  onOpenProvenance,
  onOpenAudit,
  onPlaceArtifact,
}: ComputeJobPanelProps) {
  const [jobs, setJobs] = useState<ComputeJob[]>([]);
  const [busySurface, setBusySurface] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [detailByJob, setDetailByJob] = useState<Record<string, any>>({});

  const activeCount = useMemo(() => jobs.filter(j => j.status === 'queued' || j.status === 'running').length, [jobs]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs`);
    const payload = await res.json();
    setJobs(payload.data || []);
  }, [projectId]);

  const loadDetail = useCallback(async (jobId: string) => {
    if (!projectId) return;
    const res = await apiRequest('GET', `/api/concept2cure/compute/projects/${projectId}/jobs/${jobId}`);
    const payload = await res.json();
    setDetailByJob(prev => ({ ...prev, [jobId]: payload.data }));
  }, [projectId]);

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
    <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Artifact Compute Plane</h3>
        <Badge variant="outline" className="text-xs">{activeCount} active</Badge>
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
            {busySurface === preset.surfaceKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
          </Button>
        ))}
      </div>

      <div className="space-y-2 max-h-80 overflow-auto">
        {jobs.map(job => (
          <div key={job.job_id} className="rounded border border-zinc-100 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-800">{job.surface_key} • {job.intent_type}</div>
                <div className="text-[11px] text-zinc-500">{new Date(job.created_at).toLocaleString()}</div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${statusTone(job.status)}`}>{job.status}</Badge>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-zinc-500">
                Runtime: <span className="font-medium text-zinc-700">{job.runtime_profile_key || 'docx-python'}</span> ·
                Format: <span className="font-medium text-zinc-700">{job.output_format || 'docx'}</span> ·
                Maturity: <span className="font-medium text-zinc-700">{job.runtime_maturity || 'seeded'}</span>
              </div>
              <button
                className="text-[11px] text-blue-600 hover:text-blue-800"
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
              </button>
            </div>
            {expandedJobId === job.job_id && (
              <div className="mt-2 rounded border border-zinc-100 bg-zinc-50 p-2 text-[11px] space-y-1">
                {detailByJob[job.job_id]?.attempts?.[0] && (
                  <div>
                    Attempt #{detailByJob[job.job_id].attempts[0].attempt_number} ·
                    Runtime {detailByJob[job.job_id].attempts[0].worker_runtime} ·
                    Status {detailByJob[job.job_id].attempts[0].status}
                  </div>
                )}
                {detailByJob[job.job_id]?.attempts?.[0]?.error_message && (
                  <div className="text-red-600">Error: {detailByJob[job.job_id].attempts[0].error_message}</div>
                )}
                {job.artifact_id ? (
                  <>
                    <div>
                      Artifact: <span className="font-medium">{job.artifact_title || job.artifact_id}</span> ·
                      Status {job.artifact_status || 'draft'} · v{job.artifact_version || 1}
                      {job.artifact_ctd_section ? ` · ${job.artifact_ctd_section}` : ' · placement suggested'}
                    </div>
                    <div className="text-zinc-600">
                      Placement: {detailByJob[job.job_id]?.placement_state || 'unplaced'} ·
                      Provenance ref: {detailByJob[job.job_id]?.provenance_ref || 'pending'} ·
                      Audit ref: {detailByJob[job.job_id]?.audit_ref || 'pending'}
                    </div>
                    <div className="text-zinc-600">
                      Workflow impact: {(job.artifact_status || 'draft') === 'draft'
                        ? 'Requires review assignment before submission.'
                        : 'Review pipeline in progress.'}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button className="text-blue-600 hover:text-blue-800" onClick={() => onOpenArtifact?.(job.artifact_id!)}>Open editor</button>
                      <button className="text-violet-600 hover:text-violet-800" onClick={() => onOpenProvenance?.(job.artifact_id!)}>Provenance</button>
                      <button className="text-emerald-600 hover:text-emerald-800" onClick={() => onOpenAudit?.(job.artifact_id!)}>Audit</button>
                      <button className="text-orange-600 hover:text-orange-800" onClick={() => onPlaceArtifact?.(job.artifact_id!)}>Place</button>
                    </div>
                  </>
                ) : (
                  <div className="text-zinc-500">No governed artifact registered yet.</div>
                )}
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && <div className="text-xs text-zinc-500">No compute jobs yet.</div>}
      </div>
    </div>
  );
}
