/**
 * GovernedDocumentPanel — Workspace-level document governance inspector.
 *
 * Shows for the selected artifact:
 *   - Status controls with workflow transitions (D→R→A→L)
 *   - Audit timeline (provenance events)
 *   - Version history with rollback
 *   - Placement history
 *   - Provenance identity
 *
 * Calls real backend APIs:
 *   GET  /api/concept2cure/projects/:projectId/artifacts/:artifactId/provenance
 *   GET  /api/concept2cure/projects/:projectId/artifacts/:artifactId/versions
 *   PUT  /api/concept2cure/projects/:projectId/artifacts/:artifactId/status
 *   POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/rollback
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Shield,
  Clock,
  FileText,
  Lock,
  Unlock,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  MapPin,
  GitBranch,
  User,
  X,
  Loader2,
  ArrowRight,
  Hash,
  Sparkles,
  PenTool,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewThreadsPanel } from './ReviewThreadsPanel';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Artifact {
  id: string;
  title: string;
  status?: string;
  version?: number;
  ctdSection?: string;
  templateId?: string;
  contentHash?: string;
  approvedVersionId?: number;
  publishedVersionId?: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lockedAt?: string;
}

interface ProvenanceEvent {
  eventId: string;
  eventType: string;
  eventAction: string;
  sourceDescription?: string;
  actorName?: string;
  actorEmail?: string;
  createdAt: string;
  details?: Record<string, any>;
}

interface VersionEntry {
  version: number;
  contentHash: string;
  changeDescription?: string;
  createdAt: string;
  createdByName?: string;
}

interface UserPermissions {
  role: string;
  allowedTransitions: string[];
  canRollback: boolean;
  canSign: boolean;
  canExport: boolean;
}

interface SnapshotEntry {
  snapshotId: string;
  versionId: number;
  approvedVersionId?: number;
  publishedVersionId?: number;
  contentHash: string;
  exportHash?: string;
  title: string;
  ctdSection?: string;
  filename?: string;
  fileSize?: number;
  actionType: string;
  actorName: string;
  actorRole?: string;
  attestationText?: string;
  signatureMeaning?: string;
  createdAt: string;
}

interface GovernedDocumentPanelProps {
  projectId: string;
  artifact: Artifact;
  onStatusChange?: (newStatus: string) => void;
  onOpenDiff?: () => void;
  onClose: () => void;
}

// ── Status workflow rules ────────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: ['locked', 'review'],
  locked: ['draft'],
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
  locked: 'Locked',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  review: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  locked: 'bg-blue-50 text-blue-700 ring-blue-200',
};

const TRANSITION_LABELS: Record<string, string> = {
  'draft→review': 'Submit for Review',
  'review→approved': 'Approve',
  'review→draft': 'Return to Draft',
  'approved→locked': 'Lock for Submission',
  'approved→review': 'Return to Review',
  'locked→draft': 'Unlock',
};

function isRegression(from: string, to: string): boolean {
  const regressionMap: Record<string, string[]> = {
    review: ['draft'],
    approved: ['review'],
    locked: ['draft'],
  };
  return (regressionMap[from] || []).includes(to);
}

// ── Event type icons ─────────────────────────────────────────────────────────
function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'status_change':
      return <Shield className="w-3 h-3 text-blue-500" />;
    case 'placement':
      return <MapPin className="w-3 h-3 text-violet-500" />;
    case 'edit':
      return <PenTool className="w-3 h-3 text-amber-500" />;
    case 'generation':
      return <Sparkles className="w-3 h-3 text-violet-500" />;
    case 'rollback':
      return <RotateCcw className="w-3 h-3 text-orange-500" />;
    case 'export':
      return <FileText className="w-3 h-3 text-emerald-500" />;
    case 'approval':
      return <CheckCircle className="w-3 h-3 text-emerald-500" />;
    default:
      return <Clock className="w-3 h-3 text-zinc-400" />;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
export function GovernedDocumentPanel({
  projectId,
  artifact,
  onStatusChange,
  onOpenDiff,
  onClose,
}: GovernedDocumentPanelProps) {
  const [events, setEvents] = useState<ProvenanceEvent[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'status' | 'audit' | 'versions' | 'snapshots' | 'threads'
  >('status');
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);

  // Rationale modal state
  const [rationaleTarget, setRationaleTarget] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');

  // Attestation modal state (for approve/lock)
  const [attestationTarget, setAttestationTarget] = useState<string | null>(null);
  const [attestationMeaning, setAttestationMeaning] = useState('');
  const [attestationText, setAttestationText] = useState('');

  // Snapshots
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);

  const currentStatus = artifact.status || 'draft';
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  // ── Fetch user permissions ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/concept2cure/user/permissions', {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const payload = await res.json();
          setPermissions(payload.data ?? payload);
        }
      } catch {
        // Default to restrictive if permissions fetch fails
      }
    })();
  }, []);

  // ── Fetch provenance + versions + snapshots ─────────────────────────
  const fetchData = useCallback(async () => {
    if (!projectId || !artifact.id) return;
    setLoading(true);
    try {
      const [provRes, verRes, snapRes] = await Promise.all([
        fetch(`/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}/provenance`, {
          headers: getAuthHeaders(),
        }),
        fetch(`/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}/versions`, {
          headers: getAuthHeaders(),
        }),
        fetch(`/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}/snapshots`, {
          headers: getAuthHeaders(),
        }),
      ]);

      if (provRes.ok) {
        const provPayload = await provRes.json();
        const data = provPayload.data ?? provPayload;
        // Flatten provenance sections into event list
        const allEvents: ProvenanceEvent[] = [];
        if (data.editHistory?.versions) {
          for (const v of data.editHistory.versions) {
            allEvents.push({
              eventId: `ver-${v.version}`,
              eventType: 'edit',
              eventAction: 'version_create',
              sourceDescription: v.changeDescription || `Version ${v.version} created`,
              actorName: v.createdByName || 'Unknown',
              createdAt: v.createdAt,
              details: { version: v.version, contentHash: v.contentHash },
            });
          }
        }
        if (data.placement?.events) {
          for (const e of data.placement.events) {
            allEvents.push({
              eventId: e.eventId || `pl-${e.createdAt}`,
              eventType: e.eventType || 'placement',
              eventAction: e.eventAction || 'placement',
              sourceDescription: e.sourceDescription || 'Placement event',
              actorName: e.actorName,
              actorEmail: e.actorEmail,
              createdAt: e.createdAt,
              details: e.details,
            });
          }
        }
        if (data.compliance?.events) {
          for (const e of data.compliance.events) {
            allEvents.push(e);
          }
        }
        // Also check for raw events array
        if (Array.isArray(data.events)) {
          allEvents.push(...data.events);
        }
        // Deduplicate by eventId
        const seen = new Set<string>();
        const deduped = allEvents.filter(e => {
          if (seen.has(e.eventId)) return false;
          seen.add(e.eventId);
          return true;
        });
        // Sort newest first
        deduped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(deduped);
      }

      if (verRes.ok) {
        const verPayload = await verRes.json();
        const verData = verPayload.data ?? verPayload;
        setVersions(
          Array.isArray(verData)
            ? verData.sort((a: VersionEntry, b: VersionEntry) => b.version - a.version)
            : []
        );
      }

      if (snapRes.ok) {
        const snapPayload = await snapRes.json();
        const snapData = snapPayload.data ?? snapPayload;
        setSnapshots(
          Array.isArray(snapData)
            ? snapData.sort(
                (a: SnapshotEntry, b: SnapshotEntry) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
            : []
        );
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId, artifact.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Status change ────────────────────────────────────────────────────
  const handleTransition = useCallback(
    async (
      targetStatus: string,
      reason?: string,
      attestation?: { meaning: string; attestationText: string }
    ) => {
      if (!projectId || !artifact.id) return;
      setChangingStatus(true);
      try {
        const body: Record<string, unknown> = { status: targetStatus };
        if (reason) body.reason = reason;
        if (attestation) body.attestation = attestation;

        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}/status`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(body),
          }
        );
        if (res.ok) {
          onStatusChange?.(targetStatus);
          fetchData(); // refresh audit trail
        }
      } catch {
        // silent
      } finally {
        setChangingStatus(false);
        setRationaleTarget(null);
        setRationale('');
        setAttestationTarget(null);
        setAttestationMeaning('');
        setAttestationText('');
      }
    },
    [projectId, artifact.id, onStatusChange, fetchData]
  );

  const handleTransitionClick = useCallback(
    (targetStatus: string) => {
      if (isRegression(currentStatus, targetStatus)) {
        setRationaleTarget(targetStatus);
        setRationale('');
      } else if (targetStatus === 'approved' || targetStatus === 'locked') {
        // Show attestation modal for approval/publish
        setAttestationTarget(targetStatus);
        setAttestationMeaning(targetStatus === 'approved' ? 'Approved' : 'Released');
        setAttestationText('');
      } else {
        handleTransition(targetStatus);
      }
    },
    [currentStatus, handleTransition]
  );

  // ── Rollback ─────────────────────────────────────────────────────────
  const handleRollback = useCallback(
    async (targetVersion: number) => {
      if (!projectId || !artifact.id || currentStatus === 'locked') return;
      setRollingBack(true);
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${projectId}/artifacts/${artifact.id}/rollback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ targetVersion }),
          }
        );
        if (res.ok) {
          onStatusChange?.(currentStatus); // trigger UI refresh
          fetchData();
        }
      } catch {
        // silent
      } finally {
        setRollingBack(false);
      }
    },
    [projectId, artifact.id, currentStatus, onStatusChange, fetchData]
  );

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="w-[200px] 2xl:w-[240px] border-l border-zinc-100 shrink-0 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 bg-zinc-50/40">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-blue-600" />
          <span className="text-[10px] font-semibold text-zinc-700">Document Governance</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-100">
        {(['status', 'audit', 'versions', 'snapshots', 'threads'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 py-1.5 text-[9px] font-medium capitalize transition-colors',
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {tab === 'snapshots'
              ? 'History'
              : tab === 'threads'
                ? 'Threads'
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
          </div>
        ) : activeTab === 'status' ? (
          <StatusTab
            artifact={artifact}
            currentStatus={currentStatus}
            allowedTransitions={allowedTransitions}
            changingStatus={changingStatus}
            onTransition={handleTransitionClick}
            events={events}
            permissions={permissions}
            onOpenDiff={onOpenDiff}
          />
        ) : activeTab === 'audit' ? (
          <AuditTab events={events} />
        ) : activeTab === 'snapshots' ? (
          <SnapshotsTab snapshots={snapshots} />
        ) : activeTab === 'threads' ? (
          <ReviewThreadsPanel projectId={projectId} artifactId={artifact.id} />
        ) : (
          <VersionsTab
            versions={versions}
            currentVersion={artifact.version || 1}
            isLocked={currentStatus === 'locked'}
            rollingBack={rollingBack}
            onRollback={handleRollback}
            canRollback={permissions?.canRollback !== false}
            onOpenDiff={onOpenDiff}
            approvedVersionId={artifact.approvedVersionId}
            publishedVersionId={artifact.publishedVersionId}
          />
        )}
      </div>

      {/* Rationale modal overlay */}
      {rationaleTarget && (
        <div className="absolute inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-4 mx-3 w-full max-w-[280px]">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-zinc-800">Reason Required</span>
            </div>
            <p className="text-xs text-zinc-500 mb-2">
              Regressing <strong>{STATUS_LABELS[currentStatus]}</strong>
              {' → '}
              <strong>{STATUS_LABELS[rationaleTarget]}</strong> requires a justification for the
              audit trail.
            </p>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              placeholder="Enter reason for status regression..."
              className="w-full h-20 text-xs border border-zinc-200 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setRationaleTarget(null);
                  setRationale('');
                }}
                className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleTransition(rationaleTarget, rationale.trim())}
                disabled={rationale.trim().length < 5 || changingStatus}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {changingStatus && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm
              </button>
            </div>
            <p className="text-[9px] text-zinc-400 mt-1">Minimum 5 characters</p>
          </div>
        </div>
      )}

      {/* Attestation modal overlay (for approve/lock) */}
      {attestationTarget && (
        <div className="absolute inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-4 mx-3 w-full max-w-[280px]">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-zinc-800">
                {attestationTarget === 'approved' ? 'Approval' : 'Publish'} Attestation
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-2">
              You are {attestationTarget === 'approved' ? 'approving' : 'publishing/locking'} this
              document. Please provide your attestation.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[9px] text-zinc-400 uppercase">Meaning of Signature</label>
                <select
                  value={attestationMeaning}
                  onChange={e => setAttestationMeaning(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {attestationTarget === 'approved' ? (
                    <>
                      <option value="Approved">Approved</option>
                      <option value="Reviewed">Reviewed</option>
                      <option value="Verified">Verified</option>
                    </>
                  ) : (
                    <>
                      <option value="Released">Released</option>
                      <option value="Published">Published</option>
                      <option value="Submitted">Submitted</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-zinc-400 uppercase">Attestation Statement</label>
                <textarea
                  value={attestationText}
                  onChange={e => setAttestationText(e.target.value)}
                  placeholder="I confirm that I have reviewed this document and am authorized to perform this action..."
                  className="w-full h-16 text-xs border border-zinc-200 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[9px] text-zinc-400">
              <Shield className="w-3 h-3" />
              <span>Signed as {permissions?.role || 'user'} · 21 CFR Part 11</span>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setAttestationTarget(null);
                  setAttestationMeaning('');
                  setAttestationText('');
                }}
                className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleTransition(attestationTarget, undefined, {
                    meaning: attestationMeaning,
                    attestationText: attestationText.trim(),
                  })
                }
                disabled={attestationText.trim().length < 10 || changingStatus}
                className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {changingStatus && <Loader2 className="w-3 h-3 animate-spin" />}
                {attestationTarget === 'approved' ? 'Approve' : 'Publish'}
              </button>
            </div>
            <p className="text-[9px] text-zinc-400 mt-1">Minimum 10 characters</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Tab ───────────────────────────────────────────────────────────────

function StatusTab({
  artifact,
  currentStatus,
  allowedTransitions,
  changingStatus,
  onTransition,
  events,
  permissions,
  onOpenDiff,
}: {
  artifact: Artifact;
  currentStatus: string;
  allowedTransitions: string[];
  changingStatus: boolean;
  onTransition: (status: string) => void;
  events: ProvenanceEvent[];
  permissions: UserPermissions | null;
  onOpenDiff?: () => void;
}) {
  const statusEvents = events.filter(e => e.eventType === 'status_change').slice(0, 5);

  // Filter transitions by user's role permissions
  const permittedTransitions = allowedTransitions.filter(target => {
    if (!permissions) return true; // If permissions not loaded, show all
    const key = `${currentStatus}→${target}`;
    return permissions.allowedTransitions.includes(key);
  });

  return (
    <div className="p-2.5 space-y-3">
      {/* Current status + role badge */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9px] text-zinc-400 uppercase tracking-wide">Current Status</div>
          {permissions && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium uppercase">
              {permissions.role}
            </span>
          )}
        </div>
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ring-1',
            STATUS_COLORS[currentStatus] || STATUS_COLORS.draft
          )}
        >
          {currentStatus === 'locked' ? (
            <Lock className="w-3 h-3" />
          ) : currentStatus === 'approved' ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <FileText className="w-3 h-3" />
          )}
          {STATUS_LABELS[currentStatus] || currentStatus}
        </div>
      </div>

      {/* Published / Approved version indicators */}
      {(artifact.publishedVersionId || artifact.approvedVersionId) && (
        <div>
          <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1">
            Version Milestones
          </div>
          <div className="space-y-1">
            {artifact.approvedVersionId && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded ring-1 ring-emerald-200/60">
                <CheckCircle className="w-3 h-3" />
                <span>Approved at v{artifact.approvedVersionId}</span>
              </div>
            )}
            {artifact.publishedVersionId && (
              <div className="flex items-center gap-1.5 text-[10px] text-blue-700 bg-blue-50 px-2 py-1 rounded ring-1 ring-blue-200/60">
                <Lock className="w-3 h-3" />
                <span>Published at v{artifact.publishedVersionId}</span>
                {artifact.publishedAt && (
                  <span className="text-[9px] text-blue-500 ml-auto">
                    {formatTime(artifact.publishedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workflow transitions — permission filtered */}
      <div>
        <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1">Actions</div>
        <div className="space-y-1">
          {permittedTransitions.length === 0 && (
            <div className="text-[10px] text-zinc-400 italic px-2 py-1">
              No transitions available for your role
            </div>
          )}
          {permittedTransitions.map(target => {
            const key = `${currentStatus}→${target}`;
            const label = TRANSITION_LABELS[key] || `→ ${STATUS_LABELS[target]}`;
            const regression = isRegression(currentStatus, target);
            return (
              <button
                key={target}
                onClick={() => onTransition(target)}
                disabled={changingStatus}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50',
                  regression
                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200/60'
                    : 'text-blue-700 bg-blue-50 hover:bg-blue-100 ring-1 ring-blue-200/60'
                )}
              >
                {changingStatus ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : regression ? (
                  <RotateCcw className="w-3 h-3" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                {label}
                {regression && (
                  <span className="text-[9px] text-amber-500 ml-auto">requires reason</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Identity */}
      <div>
        <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1">Identity</div>
        <div className="space-y-1 text-[10px] text-zinc-600">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-zinc-400" />
            <span className="truncate">{artifact.title}</span>
          </div>
          {artifact.ctdSection && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-zinc-400" />
              <span>{artifact.ctdSection}</span>
            </div>
          )}
          {artifact.templateId && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-zinc-400" />
              <span className="truncate">From template: {artifact.templateId}</span>
            </div>
          )}
          {artifact.contentHash && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-zinc-400" />
              <span className="font-mono text-[9px]">{artifact.contentHash.slice(0, 16)}…</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3 h-3 text-zinc-400" />
            <span>v{artifact.version || 1}</span>
          </div>
        </div>
      </div>

      {/* Recent status history */}
      {statusEvents.length > 0 && (
        <div>
          <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-1">
            Status History
          </div>
          <div className="space-y-1">
            {statusEvents.map(e => (
              <div key={e.eventId} className="flex items-start gap-1.5 text-[10px]">
                <Shield className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-zinc-700">{e.sourceDescription}</div>
                  <div className="text-zinc-400">
                    {e.actorName} · {formatTime(e.createdAt)}
                  </div>
                  {e.details?.reason && (
                    <div className="text-amber-600 text-[9px] mt-0.5 italic">
                      Reason: {e.details.reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compare versions */}
      {onOpenDiff && (
        <div>
          <button
            onClick={onOpenDiff}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200/60 transition-colors"
          >
            <GitBranch className="w-3 h-3" />
            Compare Versions
          </button>
        </div>
      )}
    </div>
  );
}

// ── Audit Tab ────────────────────────────────────────────────────────────────

function AuditTab({ events }: { events: ProvenanceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] text-zinc-400">No audit events recorded yet.</div>
    );
  }

  return (
    <div className="p-2.5">
      <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-2">
        Document Timeline ({events.length} events)
      </div>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-zinc-200" />

        <div className="space-y-2">
          {events.map(e => (
            <div key={e.eventId} className="flex items-start gap-2 relative">
              <div className="relative z-10 mt-1 bg-white">
                <EventIcon type={e.eventType} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-700 leading-snug">
                  {e.sourceDescription || e.eventAction}
                </div>
                <div className="text-[9px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  {e.actorName && (
                    <>
                      <User className="w-2.5 h-2.5" />
                      <span>{e.actorName}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{formatTime(e.createdAt)}</span>
                </div>
                {e.details?.reason && (
                  <div className="text-[9px] text-amber-600 mt-0.5 italic">
                    Reason: {e.details.reason}
                  </div>
                )}
                {e.details?.previousStatus && e.details?.newStatus && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={cn(
                        'text-[8px] px-1 py-px rounded ring-1',
                        STATUS_COLORS[e.details.previousStatus]
                      )}
                    >
                      {e.details.previousStatus}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-300" />
                    <span
                      className={cn(
                        'text-[8px] px-1 py-px rounded ring-1',
                        STATUS_COLORS[e.details.newStatus]
                      )}
                    >
                      {e.details.newStatus}
                    </span>
                  </div>
                )}
                {e.details?.attestation && (
                  <div className="mt-1 px-1.5 py-1 bg-emerald-50 rounded text-[9px] text-emerald-800 border-l-2 border-emerald-400">
                    <div className="flex items-center gap-1">
                      <PenTool className="w-2.5 h-2.5" />
                      <span className="font-medium">
                        {e.details.attestation.meaning || 'Attested'}
                      </span>
                      {e.details.signatureId && (
                        <span className="text-[8px] text-emerald-500 font-mono">
                          sig:{e.details.signatureId}
                        </span>
                      )}
                    </div>
                    <div className="italic mt-0.5">
                      &ldquo;{e.details.attestation.attestationText}&rdquo;
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Versions Tab ─────────────────────────────────────────────────────────────

function SnapshotsTab({ snapshots }: { snapshots: SnapshotEntry[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] text-zinc-400">No snapshot history yet.</div>
    );
  }

  const actionIcons: Record<string, React.ReactNode> = {
    publish: <Lock className="w-3 h-3 text-indigo-500" />,
    'export-docx': <FileText className="w-3 h-3 text-blue-500" />,
    'export-pdf': <FileText className="w-3 h-3 text-red-500" />,
    'submission-snapshot': <Shield className="w-3 h-3 text-emerald-500" />,
  };

  const actionLabels: Record<string, string> = {
    publish: 'Published / Locked',
    'export-docx': 'Exported (DOCX)',
    'export-pdf': 'Exported (PDF)',
    'submission-snapshot': 'Submission Snapshot',
  };

  return (
    <div className="p-2.5">
      <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-2">
        Submission Snapshots ({snapshots.length})
      </div>
      <div className="space-y-1.5">
        {snapshots.map(s => (
          <div
            key={s.snapshotId}
            className="px-2 py-1.5 rounded text-[10px] ring-1 bg-zinc-50 ring-zinc-200/60"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              {actionIcons[s.actionType] || <Clock className="w-3 h-3 text-zinc-400" />}
              <span className="font-semibold text-zinc-800">
                {actionLabels[s.actionType] || s.actionType}
              </span>
              {s.versionId && (
                <span className="text-[8px] px-1 py-px bg-zinc-200 text-zinc-600 rounded">
                  v{s.versionId}
                </span>
              )}
            </div>

            {s.attestationText && (
              <div className="mt-1 px-1.5 py-1 bg-emerald-50 rounded text-[9px] text-emerald-800 border-l-2 border-emerald-400">
                <div className="flex items-center gap-1 mb-0.5">
                  <PenTool className="w-2.5 h-2.5" />
                  <span className="font-medium">{s.signatureMeaning || 'Attested'}</span>
                </div>
                <div className="italic">&ldquo;{s.attestationText}&rdquo;</div>
              </div>
            )}

            {s.filename && (
              <div className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5" />
                {s.filename}
                {s.fileSize && (
                  <span className="text-zinc-400">({(s.fileSize / 1024).toFixed(1)} KB)</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-zinc-400">
              {s.contentHash && (
                <span className="font-mono flex items-center gap-0.5">
                  <Hash className="w-2.5 h-2.5" />
                  {s.contentHash.slice(0, 12)}…
                </span>
              )}
              {s.exportHash && (
                <span className="font-mono flex items-center gap-0.5">
                  <Hash className="w-2.5 h-2.5" />
                  {s.exportHash.slice(0, 12)}…
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-0.5 text-[9px] text-zinc-400">
              <span className="flex items-center gap-1">
                <User className="w-2.5 h-2.5" />
                {s.actorName || 'System'}
                {s.actorRole && (
                  <span className="text-[8px] px-1 py-px bg-zinc-200 text-zinc-500 rounded">
                    {s.actorRole}
                  </span>
                )}
              </span>
              <span>{formatTime(s.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VersionsTab({
  versions,
  currentVersion,
  isLocked,
  rollingBack,
  onRollback,
  canRollback,
  onOpenDiff,
  approvedVersionId,
  publishedVersionId,
}: {
  versions: VersionEntry[];
  currentVersion: number;
  isLocked: boolean;
  rollingBack: boolean;
  onRollback: (version: number) => void;
  canRollback?: boolean;
  onOpenDiff?: () => void;
  approvedVersionId?: number;
  publishedVersionId?: number;
}) {
  if (versions.length === 0) {
    return <div className="p-4 text-center text-[11px] text-zinc-400">No version history yet.</div>;
  }

  return (
    <div className="p-2.5">
      <div className="text-[9px] text-zinc-400 uppercase tracking-wide mb-2">
        Version History ({versions.length})
      </div>
      <div className="space-y-1.5">
        {versions.map(v => (
          <div
            key={v.version}
            className={cn(
              'px-2 py-1.5 rounded text-[10px] ring-1',
              v.version === currentVersion
                ? 'bg-blue-50 ring-blue-200'
                : 'bg-zinc-50 ring-zinc-200/60'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-zinc-400" />
                <span className="font-semibold text-zinc-800">v{v.version}</span>
                {v.version === currentVersion && (
                  <span className="text-[8px] px-1 py-px bg-blue-600 text-white rounded">
                    current
                  </span>
                )}
                {v.version === approvedVersionId && (
                  <span className="text-[8px] px-1 py-px bg-emerald-600 text-white rounded">
                    approved
                  </span>
                )}
                {v.version === publishedVersionId && (
                  <span className="text-[8px] px-1 py-px bg-indigo-600 text-white rounded">
                    published
                  </span>
                )}
              </div>
              {v.version < currentVersion && !isLocked && canRollback !== false && (
                <button
                  onClick={() => onRollback(v.version)}
                  disabled={rollingBack}
                  className="text-[9px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 disabled:opacity-50"
                  title={`Restore version ${v.version}`}
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Restore
                </button>
              )}
            </div>
            {v.changeDescription && (
              <div className="text-zinc-600 mt-0.5 leading-snug">{v.changeDescription}</div>
            )}
            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-zinc-400">
              <span className="font-mono">{v.contentHash?.slice(0, 12)}…</span>
              <span>{formatTime(v.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {isLocked && (
        <div className="mt-2 px-2 py-1 bg-amber-50 rounded text-[9px] text-amber-700 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Rollback disabled while locked
        </div>
      )}

      {!isLocked && canRollback === false && (
        <div className="mt-2 px-2 py-1 bg-amber-50 rounded text-[9px] text-amber-700 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Rollback not permitted for your role
        </div>
      )}

      {onOpenDiff && (
        <div className="mt-2">
          <button
            onClick={onOpenDiff}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 ring-1 ring-indigo-200/60 transition-colors"
          >
            <GitBranch className="w-3 h-3" />
            Compare Versions
          </button>
        </div>
      )}
    </div>
  );
}

export default GovernedDocumentPanel;
