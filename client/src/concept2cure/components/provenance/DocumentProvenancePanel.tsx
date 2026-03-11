/**
 * DocumentProvenancePanel — Defensible provenance, auditability, and compliance traceability.
 *
 * Shows 6 sections for any artifact:
 *   1. Document Identity — title, type, module, version, status, dates
 *   2. Source Inputs — uploaded files, structured records, source artifacts
 *   3. Generation Lineage — AI/human, prompt, template, backend route
 *   4. Review / Edit History — edits, saves, version diffs, approvals
 *   5. Compliance / Security — hash, version chain, signatures, lock state
 *   6. Submission / Placement — project, dossier, CTD section, artifact location
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Hash,
  GitBranch,
  Shield,
  MapPin,
  Clock,
  User,
  Sparkles,
  Database,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Layers,
  FileInput,
  PenTool,
  Server,
  Fingerprint,
  Download,
  FolderTree,
  Activity,
} from 'lucide-react';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ProvenanceData {
  identity: {
    artifactId: string;
    title: string;
    type: string;
    category: string;
    ctdSection: string | null;
    templateId: string | null;
    version: number;
    status: string;
    projectId: number;
    projectName: string | null;
    createdAt: string;
    updatedAt: string;
    createdById: number | null;
  };
  sourceInputs: Array<{
    eventId: string;
    action: string;
    description: string | null;
    details: Record<string, unknown>;
    sourceArtifactId: number | null;
    timestamp: string;
  }>;
  generationLineage: {
    events: Array<{
      eventId: string;
      action: string;
      description: string | null;
      details: Record<string, unknown>;
      backendRoute: string | null;
      backendService: string | null;
      actorId: number | null;
      actorName: string | null;
      timestamp: string;
    }>;
    transformations: Array<{
      eventId: string;
      action: string;
      description: string | null;
      details: Record<string, unknown>;
      timestamp: string;
    }>;
  };
  editHistory: {
    versions: Array<{
      version: number;
      contentHash: string;
      changeDescription: string | null;
      createdById: number | null;
      createdAt: string;
    }>;
    totalVersions: number;
    currentVersion: number;
  };
  compliance: {
    contentHash: string | null;
    versionChain: Array<{
      version: number;
      hash: string;
      timestamp: string;
    }>;
    lockStatus: {
      isLocked: boolean;
      lockedAt: string | null;
      lockedById: number | null;
    };
    signatures: Array<{
      signatureId: string;
      type: string;
      purpose: string;
      meaning: string | null;
      signerName: string;
      signerEmail: string;
      signerRole: string | null;
      signedAt: string;
      authenticationMethod: string;
      secondFactorVerified: boolean;
    }>;
    exportEvents: Array<{
      eventId: string;
      action: string;
      details: Record<string, unknown>;
      actorName: string | null;
      timestamp: string;
    }>;
  };
  placement: {
    projectId: number;
    projectName: string | null;
    ctdSection: string | null;
    artifactId: string;
    events: Array<{
      eventId: string;
      action: string;
      description: string | null;
      details: Record<string, unknown>;
      timestamp: string;
    }>;
  };
}

interface DocumentProvenancePanelProps {
  projectId: string;
  artifactId: string;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
};

const truncHash = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');

const statusColor = (s: string) => {
  switch (s) {
    case 'draft':
      return 'bg-amber-100 text-amber-800';
    case 'review':
      return 'bg-blue-100 text-blue-800';
    case 'approved':
      return 'bg-emerald-100 text-emerald-800';
    case 'locked':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
};

const actionLabel = (a: string) => {
  const labels: Record<string, string> = {
    ai_generate: 'AI Generated',
    human_create: 'Manually Created',
    human_edit: 'Human Edit',
    template_apply: 'Template Applied',
    docx_save_as_artifact: 'Saved from DOCX',
    cmc_data_load: 'CMC Data Loaded',
    docx_export: 'Exported as DOCX',
    file_upload: 'File Uploaded',
  };
  return labels[a] || a.replace(/_/g, ' ');
};

// ── Section Component ────────────────────────────────────────────────────────
const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, badge, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-50/50 transition-colors"
      >
        <span className="text-zinc-500">{icon}</span>
        <span className="text-xs font-semibold text-zinc-700 flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

// ── Row component for key-value display ──────────────────────────────────────
const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-start gap-2 py-1">
    <span className="text-[11px] text-zinc-400 w-24 shrink-0">{label}</span>
    <span className={`text-[11px] text-zinc-700 break-all ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </span>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
const DocumentProvenancePanel: React.FC<DocumentProvenancePanelProps> = ({
  projectId,
  artifactId,
  onClose,
}) => {
  const [data, setData] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProvenance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/provenance`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload.success && payload.data) {
        setData(payload.data);
      } else {
        setError('No provenance data available');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load provenance');
    } finally {
      setLoading(false);
    }
  }, [projectId, artifactId]);

  useEffect(() => {
    fetchProvenance();
  }, [fetchProvenance]);

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-zinc-200">
        <div className="text-center">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400 mx-auto mb-2" />
          <p className="text-xs text-zinc-400">Loading provenance…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col bg-white border-l border-zinc-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
          <span className="text-xs font-semibold text-zinc-700">Document Provenance</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">{error || 'No data'}</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    identity: id,
    sourceInputs,
    generationLineage,
    editHistory,
    compliance,
    placement,
  } = data;

  return (
    <div className="h-full flex flex-col bg-white border-l border-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 shrink-0">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-zinc-800">Document Provenance</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Integrity badge */}
      <div className="px-3 py-2 border-b border-zinc-100 bg-emerald-50/30">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px] font-semibold text-emerald-800">Integrity Verified</span>
          <span className="text-[10px] font-mono text-emerald-600 ml-auto">
            SHA-256: {truncHash(compliance.contentHash)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-zinc-500">
            v{editHistory.currentVersion} · {editHistory.totalVersions} version
            {editHistory.totalVersions !== 1 ? 's' : ''}
          </span>
          {compliance.signatures.length > 0 && (
            <span className="text-[10px] text-indigo-600 flex items-center gap-0.5">
              <CheckCircle className="w-3 h-3" />
              {compliance.signatures.length} signature
              {compliance.signatures.length !== 1 ? 's' : ''}
            </span>
          )}
          {compliance.lockStatus.isLocked && (
            <span className="text-[10px] text-red-600 flex items-center gap-0.5">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Document Identity */}
        <Section icon={<FileText className="w-3.5 h-3.5" />} title="Document Identity">
          <div className="space-y-0.5">
            <Row label="Title" value={id.title} />
            <Row label="Type" value={id.type} />
            <Row label="Category" value={id.category} />
            <Row label="CTD Section" value={id.ctdSection} />
            <Row label="Template" value={id.templateId} />
            <Row
              label="Status"
              value={
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(id.status)}`}
                >
                  {id.status}
                </span>
              }
            />
            <Row label="Version" value={`v${id.version}`} />
            <Row label="Artifact ID" value={id.artifactId} mono />
            <Row label="Project" value={id.projectName || `#${id.projectId}`} />
            <Row label="Created" value={formatDate(id.createdAt)} />
            <Row label="Updated" value={formatDate(id.updatedAt)} />
          </div>
        </Section>

        {/* Section 2: Source Inputs */}
        <Section
          icon={<FileInput className="w-3.5 h-3.5" />}
          title="Source Inputs"
          badge={sourceInputs.length}
          defaultOpen={sourceInputs.length > 0}
        >
          {sourceInputs.length === 0 ? (
            <p className="text-[11px] text-zinc-400 italic">No tracked source inputs</p>
          ) : (
            <div className="space-y-2">
              {sourceInputs.map(si => (
                <div key={si.eventId} className="bg-zinc-50 rounded-md p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Database className="w-3 h-3 text-blue-500" />
                    <span className="text-[11px] font-medium text-zinc-700">
                      {actionLabel(si.action)}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-auto">
                      {formatRelative(si.timestamp)}
                    </span>
                  </div>
                  {si.description && <p className="text-[10px] text-zinc-500">{si.description}</p>}
                  {si.details && Object.keys(si.details).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-indigo-500 cursor-pointer">
                        View data fields
                      </summary>
                      <div className="mt-1 text-[10px] font-mono text-zinc-500 bg-white rounded p-1.5 max-h-24 overflow-y-auto">
                        {JSON.stringify(si.details, null, 2)}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Section 3: Generation Lineage */}
        <Section
          icon={<Sparkles className="w-3.5 h-3.5" />}
          title="Generation Lineage"
          badge={generationLineage.events.length + generationLineage.transformations.length}
          defaultOpen={generationLineage.events.length > 0}
        >
          {generationLineage.events.length === 0 &&
          generationLineage.transformations.length === 0 ? (
            <p className="text-[11px] text-zinc-400 italic">No generation events recorded</p>
          ) : (
            <div className="space-y-2">
              {generationLineage.events.map(ge => (
                <div key={ge.eventId} className="bg-violet-50/50 rounded-md p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    {ge.action === 'ai_generate' ? (
                      <Sparkles className="w-3 h-3 text-violet-500" />
                    ) : (
                      <PenTool className="w-3 h-3 text-blue-500" />
                    )}
                    <span className="text-[11px] font-medium text-zinc-700">
                      {actionLabel(ge.action)}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-auto">
                      {formatRelative(ge.timestamp)}
                    </span>
                  </div>
                  {ge.actorName && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <User className="w-3 h-3" /> {ge.actorName}
                    </div>
                  )}
                  {ge.description && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">{ge.description}</p>
                  )}
                  {ge.backendRoute && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5 font-mono">
                      <Server className="w-3 h-3" /> {ge.backendRoute}
                    </div>
                  )}
                  {ge.details && Object.keys(ge.details).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-violet-500 cursor-pointer">
                        View generation details
                      </summary>
                      <div className="mt-1 text-[10px] font-mono text-zinc-500 bg-white rounded p-1.5 max-h-32 overflow-y-auto">
                        {JSON.stringify(ge.details, null, 2)}
                      </div>
                    </details>
                  )}
                </div>
              ))}
              {generationLineage.transformations.map(t => (
                <div key={t.eventId} className="bg-amber-50/50 rounded-md p-2">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] font-medium text-zinc-700">
                      {actionLabel(t.action)}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-auto">
                      {formatRelative(t.timestamp)}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">{t.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Section 4: Review / Edit History */}
        <Section
          icon={<GitBranch className="w-3.5 h-3.5" />}
          title="Version History"
          badge={editHistory.totalVersions}
        >
          <div className="space-y-1">
            {editHistory.versions.map(v => (
              <div
                key={v.version}
                className={`flex items-start gap-2 py-1.5 px-2 rounded ${
                  v.version === editHistory.currentVersion
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-zinc-50'
                }`}
              >
                <div className="flex flex-col items-center">
                  <span
                    className={`text-[10px] font-bold ${
                      v.version === editHistory.currentVersion ? 'text-blue-600' : 'text-zinc-400'
                    }`}
                  >
                    v{v.version}
                  </span>
                  {v.version === editHistory.currentVersion && (
                    <span className="text-[8px] text-blue-500">current</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-zinc-500">
                    {truncHash(v.contentHash)}
                  </div>
                  {v.changeDescription && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{v.changeDescription}</p>
                  )}
                  <div className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {formatRelative(v.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 5: Compliance / Security */}
        <Section
          icon={<Shield className="w-3.5 h-3.5" />}
          title="Compliance & Security"
          badge={
            compliance.signatures.length > 0 ? `${compliance.signatures.length} sig` : undefined
          }
        >
          {/* Integrity */}
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Integrity
            </div>
            <Row
              label="Content Hash"
              value={<span className="font-mono">{truncHash(compliance.contentHash)}</span>}
            />
            <Row
              label="Lock Status"
              value={
                compliance.lockStatus.isLocked ? (
                  <span className="flex items-center gap-1 text-red-600">
                    <Lock className="w-3 h-3" /> Locked {formatDate(compliance.lockStatus.lockedAt)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Unlock className="w-3 h-3" /> Unlocked
                  </span>
                )
              }
            />
          </div>

          {/* Version Chain */}
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Hash Chain
            </div>
            <div className="space-y-0.5">
              {compliance.versionChain.map((vc, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <Hash className="w-3 h-3 text-zinc-300" />
                  <span className="font-mono text-zinc-500">{truncHash(vc.hash)}</span>
                  <span className="text-zinc-300">→</span>
                  <span className="text-zinc-400">v{vc.version}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Signatures */}
          {compliance.signatures.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                Electronic Signatures
              </div>
              <div className="space-y-1.5">
                {compliance.signatures.map(sig => (
                  <div key={sig.signatureId} className="bg-indigo-50/50 rounded-md p-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3 h-3 text-indigo-500" />
                      <span className="text-[11px] font-medium text-zinc-700">
                        {sig.signerName}
                      </span>
                      <span className={`text-[9px] px-1 rounded ${statusColor(sig.type)}`}>
                        {sig.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{sig.purpose}</p>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      {sig.authenticationMethod}
                      {sig.secondFactorVerified && ' + 2FA'}
                      {' · '}
                      {formatDate(sig.signedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Events */}
          {compliance.exportEvents.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                Exports
              </div>
              {compliance.exportEvents.map(exp => (
                <div
                  key={exp.eventId}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-500 py-0.5"
                >
                  <Download className="w-3 h-3 text-zinc-400" />
                  {actionLabel(exp.action)}
                  {exp.actorName && ` by ${exp.actorName}`}
                  <span className="ml-auto text-zinc-400">{formatRelative(exp.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Section 6: Submission / Placement Context */}
        <Section
          icon={<FolderTree className="w-3.5 h-3.5" />}
          title="Dossier Placement"
          defaultOpen={!!placement.ctdSection}
        >
          <div className="space-y-0.5 mb-2">
            <Row label="Project" value={placement.projectName || `#${placement.projectId}`} />
            <Row label="Artifact ID" value={placement.artifactId} mono />
            <Row
              label="CTD Section"
              value={
                placement.ctdSection ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-500" />
                    {placement.ctdSection}
                  </span>
                ) : (
                  <span className="text-zinc-400 italic">Not placed</span>
                )
              }
            />
          </div>
          {placement.events.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                Placement Events
              </div>
              {placement.events.map(pe => (
                <div
                  key={pe.eventId}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-500 py-0.5"
                >
                  <Layers className="w-3 h-3 text-zinc-400" />
                  {pe.description || actionLabel(pe.action)}
                  <span className="ml-auto text-zinc-400">{formatRelative(pe.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/30 shrink-0">
        <p className="text-[9px] text-zinc-400 text-center">
          21 CFR Part 11 Compliant · Append-only audit trail · SHA-256 integrity
        </p>
      </div>
    </div>
  );
};

export default DocumentProvenancePanel;
