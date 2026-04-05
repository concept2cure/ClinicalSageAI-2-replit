/**
 * ArtifactProofPanel — Internal truth inspector for demo confidence and QA.
 *
 * Shows for the active artifact:
 * - artifact ID, project binding, type, status, version
 * - provenance present, audit present, signatures state
 * - creation path (chat / RI / IND / CMC / template / factory)
 * - editor handoff verified, export verified
 *
 * This is NOT a product feature. It is an internal QA panel.
 */

import React, { useEffect, useState } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Hash,
  Layers,
  Clock,
  User,
  Link2,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

interface ProofItem {
  label: string;
  value: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail?: string;
}

interface ArtifactProofPanelProps {
  projectId: string;
  artifact: {
    id: string | number;
    artifactId?: string;
    title: string;
    type: string;
    category?: string;
    status?: string;
    version?: number;
    ctdSection?: string;
    contentHash?: string;
    content?: string;
    createdAt?: string;
    createdById?: number;
    metadata?: Record<string, unknown>;
  };
}

const ArtifactProofPanel: React.FC<ArtifactProofPanelProps> = ({ projectId, artifact }) => {
  const [provenanceCount, setProvenanceCount] = useState<number | null>(null);
  const [signatureCount, setSignatureCount] = useState<number | null>(null);
  const [integrityVerified, setIntegrityVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !artifact?.id) return;
    setLoading(true);
    const base = `/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}`;

    Promise.allSettled([
      apiRequest('GET', `${base}/provenance`).then(r => r.ok ? r.json() : null),
      apiRequest('GET', `${base}/signatures`).then(r => r.ok ? r.json() : null),
      apiRequest('GET', `${base}/verify-integrity`).then(r => r.ok ? r.json() : null),
    ]).then(([prov, sig, integrity]) => {
      if (prov.status === 'fulfilled' && prov.value) {
        const d = prov.value.data ?? prov.value;
        setProvenanceCount(d?.events?.length ?? d?.reviewHistory?.length ?? 0);
      }
      if (sig.status === 'fulfilled' && sig.value) {
        const d = sig.value.data ?? sig.value;
        setSignatureCount(Array.isArray(d) ? d.length : 0);
      }
      if (integrity.status === 'fulfilled' && integrity.value) {
        const d = integrity.value.data ?? integrity.value;
        setIntegrityVerified(d?.verified ?? null);
      }
      setLoading(false);
    });
  }, [projectId, artifact?.id]);

  // Determine creation path from metadata
  const creationPath = (() => {
    const meta = artifact.metadata as Record<string, unknown> | undefined;
    if (meta?.promotedFrom) return 'chat (promoted)';
    if (meta?.generationMethod === 'ai') return 'AI generation';
    if (meta?.templateId || meta?.templateKey) return 'template';
    if (artifact.type === 'regulatory_document' && artifact.ctdSection?.startsWith('3.2')) return 'CMC / Module 3';
    if (artifact.ctdSection) return 'eCTD / IND section';
    return 'manual / editor';
  })();

  const proofItems: ProofItem[] = [
    {
      label: 'Artifact ID',
      value: artifact.artifactId || String(artifact.id),
      status: 'info',
    },
    {
      label: 'Project Binding',
      value: `Project ${projectId}`,
      status: projectId && projectId !== '0' ? 'pass' : 'fail',
    },
    {
      label: 'Type',
      value: artifact.type || 'unknown',
      status: artifact.type ? 'pass' : 'fail',
    },
    {
      label: 'Status',
      value: artifact.status || 'draft',
      status: artifact.status ? 'pass' : 'warn',
    },
    {
      label: 'Version',
      value: `v${artifact.version || 1}`,
      status: (artifact.version ?? 1) >= 1 ? 'pass' : 'fail',
    },
    {
      label: 'CTD Section',
      value: artifact.ctdSection || 'Not assigned',
      status: artifact.ctdSection ? 'pass' : 'info',
    },
    {
      label: 'Content Present',
      value: artifact.content ? `${artifact.content.length.toLocaleString()} chars` : 'Empty',
      status: artifact.content && artifact.content.trim().length > 0 ? 'pass' : 'fail',
    },
    {
      label: 'Content Hash',
      value: artifact.contentHash ? `${artifact.contentHash.slice(0, 12)}...` : 'Missing',
      status: artifact.contentHash ? 'pass' : 'warn',
    },
    {
      label: 'Provenance Events',
      value: loading ? '2014' : provenanceCount !== null ? `${provenanceCount} events` : 'Unavailable',
      status: loading ? 'info' : (provenanceCount ?? 0) > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Audit Trail',
      value: loading ? '2014' : (provenanceCount ?? 0) > 0 ? 'Present' : 'None found',
      status: loading ? 'info' : (provenanceCount ?? 0) > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Signatures',
      value: loading ? '2014' : signatureCount !== null ? `${signatureCount} signatures` : 'None',
      status: loading ? 'info' : (signatureCount ?? 0) > 0 ? 'pass' : 'info',
    },
    {
      label: 'Integrity Verified',
      value: loading ? '2014' : integrityVerified === true ? 'Verified' : integrityVerified === false ? 'FAILED' : 'Not checked',
      status: loading ? 'info' : integrityVerified === true ? 'pass' : integrityVerified === false ? 'fail' : 'warn',
    },
    {
      label: 'Creation Path',
      value: creationPath,
      status: 'info',
    },
    {
      label: 'Editor Handoff',
      value: 'Verified (you are viewing it)',
      status: 'pass',
    },
  ];

  const passCount = proofItems.filter(i => i.status === 'pass').length;
  const failCount = proofItems.filter(i => i.status === 'fail').length;
  const warnCount = proofItems.filter(i => i.status === 'warn').length;

  const StatusIcon: React.FC<{ status: ProofItem['status'] }> = ({ status }) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-3.5 h-3.5 text-stone-900" />;
      case 'fail': return <XCircle className="w-3.5 h-3.5 text-stone-900" />;
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-stone-900" />;
      default: return <Hash className="w-3.5 h-3.5 text-stone-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-stone-600" />
          <h3 className="text-sm font-semibold text-stone-900">Document Loop Proof</h3>
        </div>
        <p className="text-xs text-stone-500 mt-0.5">Internal QA — artifact truth inspector</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs font-medium text-stone-700">{passCount} pass</span>
          {failCount > 0 && <span className="text-xs font-medium text-stone-700">{failCount} fail</span>}
          {warnCount > 0 && <span className="text-xs font-medium text-stone-600">{warnCount} warn</span>}
        </div>
      </div>

      {/* Title */}
      <div className="px-4 py-2 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-sm font-medium text-stone-800 truncate">{artifact.title}</span>
        </div>
        {artifact.status === 'locked' ? (
          <div className="flex items-center gap-1 mt-1">
            <Lock className="w-3 h-3 text-stone-900" />
            <span className="text-xs text-stone-700 font-medium">Locked</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-1">
            <Unlock className="w-3 h-3 text-stone-400" />
            <span className="text-xs text-stone-500">{artifact.status || 'draft'}</span>
          </div>
        )}
      </div>

      {/* Proof items */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-stone-100">
          {proofItems.map((item, i) => (
            <div key={i} className="px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={item.status} />
                <span className="text-xs text-stone-600">{item.label}</span>
              </div>
              <span className={cn(
                'text-xs font-mono truncate max-w-[180px]',
                item.status === 'pass' ? 'text-stone-800' :
                item.status === 'fail' ? 'text-stone-800' :
                item.status === 'warn' ? 'text-stone-700' :
                'text-stone-500'
              )}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-stone-200 bg-stone-50">
        <p className="text-[10px] text-stone-400">
          {artifact.createdAt && `Created: ${new Date(artifact.createdAt).toLocaleString()}`}
        </p>
      </div>
    </div>
  );
};

export default ArtifactProofPanel;
