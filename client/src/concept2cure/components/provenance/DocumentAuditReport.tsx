/**
 * DocumentAuditReport — Inspection-ready audit/compliance report viewer + export.
 *
 * Fetches the audit report from the API and renders it as a structured,
 * printable document. Supports summary and detailed modes.
 * Export: Print-to-PDF via window.print(), or download JSON.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import {
  FileText,
  Download,
  Printer,
  X,
  Loader2,
  AlertTriangle,
  Shield,
  Hash,
  User,
  GitBranch,
  MapPin,
  Activity,
  CheckCircle,
  FileInput,
  Sparkles,
  Server,
  ShieldCheck,
  XCircle,
  MessageSquare,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface AuditReportData {
  reportType: string;
  generatedAt: string;
  standard: string;
  documentIdentity: {
    title: string;
    artifactId: string;
    type: string;
    category: string;
    ctdSection: string;
    currentVersion: number;
    status: string;
    project: string;
    createdAt: string;
    updatedAt: string;
  };
  integrityVerification: {
    currentHash: string | null;
    algorithm: string;
    hashChain: Array<{ version: number; hash: string; timestamp: string }>;
    chainIntact: boolean;
  };
  versionTimeline: Array<{
    version: number;
    hash: string;
    changeDescription: string;
    createdAt: string;
    createdById: number | null;
  }>;
  sourceLineage: Array<{
    action: string;
    description: string | null;
    timestamp: string;
    actor: string | null;
  }>;
  generationLineage: Array<{
    action: string;
    description: string | null;
    backendRoute: string | null;
    backendService: string | null;
    actor: string | null;
    actorType: string;
    timestamp: string;
  }>;
  reviewSignatureSummary: {
    totalSignatures: number;
    signatures: Array<{
      signer: string;
      email: string;
      role: string | null;
      purpose: string;
      meaning: string | null;
      method: string;
      twoFactorVerified: boolean;
      signedAt: string;
    }>;
  };
  exportHistory: Array<{
    action: string;
    actor: string | null;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  placementContext: {
    project: string;
    ctdSection: string | null;
    artifactId: string;
    lockStatus: string;
    lockedAt: string | null;
  };
  fullEventTimeline?: Array<{
    eventId: string;
    eventType: string;
    action: string;
    actor: string | null;
    actorEmail: string | null;
    description: string | null;
    backendRoute: string | null;
    backendService: string | null;
    ipAddress: string | null;
    details: Record<string, unknown>;
    timestamp: string;
  }>;
}

interface DocumentAuditReportProps {
  projectId: string;
  artifactId: string;
  onClose: () => void;
  onOpenProvenance?: () => void;
  onOpenCompare?: () => void;
  onExportAsArtifact?: () => void;
  exportingAudit?: boolean;
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

const truncHash = (h: string | null) => (h ? `${h.slice(0, 12)}…${h.slice(-8)}` : '—');

const actionLabel = (a: string) => {
  const labels: Record<string, string> = {
    ai_generate: 'AI Generated',
    human_create: 'Manually Created',
    human_edit: 'Human Edit',
    template_apply: 'Template Applied',
    docx_save_as_artifact: 'Saved from DOCX',
    cmc_data_load: 'CMC Data Loaded',
    docx_export: 'Exported as DOCX',
    audit_report_export: 'Audit Report Exported',
  };
  return labels[a] || a.replace(/_/g, ' ');
};

// ── Report Section ───────────────────────────────────────────────────────────
const ReportSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="mb-4 print:mb-3">
    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-stone-200">
      <span className="text-stone-500 print:text-stone-700">{icon}</span>
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
    </div>
    <div className="pl-1">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-start gap-2 py-0.5">
    <span className="text-xs text-stone-400 w-28 shrink-0">{label}</span>
    <span className={`text-xs text-stone-700 break-all ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </span>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
const DocumentAuditReport: React.FC<DocumentAuditReportProps> = ({
  projectId,
  artifactId,
  onClose,
  onOpenProvenance,
  onOpenCompare,
  onExportAsArtifact,
  exportingAudit,
}) => {
  const [report, setReport] = useState<AuditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'summary' | 'detailed'>('summary');
  const [reportPurpose, setReportPurpose] = useState<'qa' | 'inspection'>('qa');

  // Live integrity verification
  const [liveIntegrity, setLiveIntegrity] = useState<{
    verified: boolean;
    chainIntact: boolean;
    currentHashVerified: boolean;
    failureReason: string | null;
  } | null>(null);
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);

  const handleVerifyIntegrity = useCallback(async () => {
    setVerifyingIntegrity(true);
    try {
      const res = await apiRequest('GET',
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/verify-integrity`
      );
      if (res.ok) {
        const payload = await res.json();
        setLiveIntegrity(payload.data ?? payload);
      }
    } catch {
      /* silent */
    } finally {
      setVerifyingIntegrity(false);
    }
  }, [projectId, artifactId]);

  // Review comments
  const [reviewComments, setReviewComments] = useState<
    Array<{
      commentId: string;
      version: number;
      status: string;
      comment: string;
      userName: string;
      createdAt: string;
    }>
  >([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(0);

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiRequest('GET',
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/comments`
      );
      if (res.ok) {
        const payload = await res.json();
        const d = payload.data ?? payload;
        setReviewComments(d.comments || []);
        setCommentsTotal(d.totalComments || 0);
        setCommentsOpen(d.openComments || 0);
      }
    } catch {
      /* silent */
    }
  }, [projectId, artifactId]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('GET',
        `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/audit-report?mode=${mode}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload.success && payload.data) {
        setReport(payload.data as AuditReportData);
      } else {
        setError('No report data available');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [projectId, artifactId, mode]);

  useEffect(() => {
    fetchReport();
    fetchComments();
  }, [fetchReport, fetchComments]);

  const handlePrint = () => window.print();

  const handleDownloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${report.documentIdentity.artifactId}-${mode}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-stone-200">
        <div className="text-center">
          <Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto mb-2" />
          <p className="text-xs text-stone-400">Generating report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="h-full flex flex-col bg-white border-l border-stone-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200">
          <span className="text-xs font-semibold text-stone-700">Audit Report</span>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="w-5 h-5 text-stone-400 mx-auto mb-2" />
            <p className="text-xs text-stone-500">
              {error ||
                'No audit data available yet. The audit trail begins when the document is created, edited, signed, or exported.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-stone-200 print:border-0">
      {/* Header — hidden on print */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200 bg-stone-50 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-stone-700" />
          <span className="text-xs font-semibold text-stone-900">
            {reportPurpose === 'inspection' ? 'Inspection Report' : 'QA Report'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* QA vs Inspection toggle */}
          <button
            onClick={() => setReportPurpose(reportPurpose === 'qa' ? 'inspection' : 'qa')}
            className={`px-2 py-0.5 text-xs rounded ${
              reportPurpose === 'inspection'
                ? 'bg-stone-100 text-stone-800'
                : 'bg-stone-100 text-stone-700'
            }`}
          >
            {reportPurpose === 'inspection' ? '🔍 Inspection' : '✓ Internal QA'}
          </button>
          <button
            onClick={() => setMode(mode === 'summary' ? 'detailed' : 'summary')}
            className="px-2 py-0.5 text-xs rounded bg-stone-100 text-stone-600 hover:bg-stone-200"
          >
            {mode === 'summary' ? 'Show Detailed' : 'Show Summary'}
          </button>
          {onExportAsArtifact && (
            <button
              onClick={onExportAsArtifact}
              disabled={exportingAudit}
              className="px-2 py-0.5 text-xs rounded bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-60"
              title="Save as inspection-ready artifact"
            >
              {exportingAudit ? (
                <Loader2 className="w-3 h-3 animate-spin inline" />
              ) : (
                <FileInput className="w-3 h-3 inline" />
              )}{' '}
              Export
            </button>
          )}
          <button
            onClick={handlePrint}
            className="p-1 text-stone-400 hover:text-stone-600"
            title="Print / Save as PDF"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownloadJSON}
            className="p-1 text-stone-400 hover:text-stone-600"
            title="Download JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Report content */}
      <div className="flex-1 overflow-y-auto p-4 print:p-0">
        {/* Print header */}
        <div className="hidden print:block mb-4 pb-3 border-b-2 border-stone-800">
          <h1 className="text-lg font-semibold">{report.reportType}</h1>
          <p className="text-xs text-stone-500">
            Generated: {formatDate(report.generatedAt)} · Standard: {report.standard}
          </p>
        </div>

        {/* Report type badge (screen only) */}
        <div className="mb-3 print:hidden">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              reportPurpose === 'inspection'
                ? 'bg-stone-100 text-stone-800'
                : 'bg-stone-100 text-stone-800'
            }`}
          >
            {reportPurpose === 'inspection' ? 'Inspection-Ready Report' : report.reportType}
          </span>
          <span className="text-xs text-stone-400 ml-2">{report.standard}</span>
        </div>

        {/* Inspection mode banner */}
        {reportPurpose === 'inspection' && (
          <div className="mb-3 p-2 bg-stone-100 border border-stone-200 rounded text-xs text-stone-800 print:hidden">
            <strong>Inspection Mode:</strong> This view shows all data an inspector would require.
            Hash chain integrity, full event timeline, and signature verification are prioritized.
          </div>
        )}

        {/* 1. Document Identity */}
        <ReportSection icon={<FileText className="w-4 h-4" />} title="Document Identity">
          <Row label="Title" value={report.documentIdentity.title} />
          <Row label="Artifact ID" value={report.documentIdentity.artifactId} mono />
          <Row label="Type" value={report.documentIdentity.type} />
          <Row label="Category" value={report.documentIdentity.category} />
          <Row label="CTD Section" value={report.documentIdentity.ctdSection} />
          <Row label="Version" value={`v${report.documentIdentity.currentVersion}`} />
          <Row label="Status" value={report.documentIdentity.status} />
          <Row label="Project" value={report.documentIdentity.project} />
          <Row label="Created" value={formatDate(report.documentIdentity.createdAt)} />
          <Row label="Updated" value={formatDate(report.documentIdentity.updatedAt)} />
        </ReportSection>

        {/* 2. Integrity Verification */}
        <ReportSection icon={<Hash className="w-4 h-4" />} title="Integrity Verification">
          <Row label="Algorithm" value={report.integrityVerification.algorithm} />
          <Row
            label="Current Hash"
            value={
              <span className="font-mono text-xs">
                {report.integrityVerification.currentHash || '—'}
              </span>
            }
          />
          <Row
            label="Chain Intact"
            value={
              report.integrityVerification.chainIntact ? (
                <span className="text-stone-700 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="text-stone-700 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Chain broken
                </span>
              )
            }
          />

          {/* Live verify button */}
          <div className="mt-2 mb-2">
            <button
              onClick={handleVerifyIntegrity}
              disabled={verifyingIntegrity}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-stone-100 text-stone-800 hover:bg-stone-100 disabled:opacity-60 font-medium print:hidden"
            >
              {verifyingIntegrity ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ShieldCheck className="w-3 h-3" />
              )}
              Verify Integrity Now
            </button>
            {liveIntegrity && (
              <div
                className={`mt-1.5 p-2 rounded text-xs print:block ${liveIntegrity.verified ? 'bg-stone-100 border border-stone-200' : 'bg-stone-100 border border-stone-200'}`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {liveIntegrity.verified ? (
                    <CheckCircle className="w-3.5 h-3.5 text-stone-700" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-stone-700" />
                  )}
                  <span className={liveIntegrity.verified ? 'text-stone-800' : 'text-stone-800'}>
                    {liveIntegrity.verified
                      ? 'Live Verification: PASSED'
                      : 'Live Verification: FAILED'}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-stone-600">
                  <div>Chain intact: {liveIntegrity.chainIntact ? '✓ Yes' : '✗ No'}</div>
                  <div>
                    Current hash verified: {liveIntegrity.currentHashVerified ? '✓ Yes' : '✗ No'}
                  </div>
                  {liveIntegrity.failureReason && (
                    <div className="text-stone-700">Reason: {liveIntegrity.failureReason}</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2">
            <div className="text-xs font-semibold text-stone-500 uppercase mb-1">Hash Chain</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-400">
                  <th className="text-left py-0.5">Ver</th>
                  <th className="text-left py-0.5">Hash</th>
                  <th className="text-left py-0.5">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {report.integrityVerification.hashChain.map(h => (
                  <tr key={h.version} className="border-t border-stone-50">
                    <td className="py-0.5 font-medium">v{h.version}</td>
                    <td className="py-0.5 font-mono text-stone-500">{truncHash(h.hash)}</td>
                    <td className="py-0.5 text-stone-400">{formatDate(h.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>

        {/* 3. Version Timeline */}
        <ReportSection icon={<GitBranch className="w-4 h-4" />} title="Version Timeline">
          {report.versionTimeline.length === 0 ? (
            <p className="text-xs text-stone-400">
              No version history recorded. Each save creates an auditable version entry for
              regulatory traceability.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-400">
                  <th className="text-left py-0.5">Ver</th>
                  <th className="text-left py-0.5">Change</th>
                  <th className="text-left py-0.5">Hash</th>
                  <th className="text-left py-0.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {report.versionTimeline.map(v => (
                  <tr key={v.version} className="border-t border-stone-50">
                    <td className="py-0.5 font-medium">v{v.version}</td>
                    <td className="py-0.5 text-stone-600">{v.changeDescription}</td>
                    <td className="py-0.5 font-mono text-stone-400">{truncHash(v.hash)}</td>
                    <td className="py-0.5 text-stone-400">{formatDate(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        {/* 4. Source Lineage */}
        <ReportSection icon={<FileInput className="w-4 h-4" />} title="Source Lineage">
          {report.sourceLineage.length === 0 ? (
            <p className="text-xs text-stone-400">
              No source inputs tracked. Linked CSR data, prior submissions, and reference materials
              will appear here.
            </p>
          ) : (
            report.sourceLineage.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2 py-1 text-xs border-b border-stone-50 last:border-0"
              >
                <Activity className="w-3 h-3 text-stone-400 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-stone-700">{actionLabel(s.action)}</span>
                  {s.description && <span className="text-stone-500"> — {s.description}</span>}
                  <div className="text-stone-400 text-xs">
                    {s.actor && <>{s.actor} · </>}
                    {formatDate(s.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </ReportSection>

        {/* 5. Generation Lineage */}
        <ReportSection icon={<Sparkles className="w-4 h-4" />} title="Generation Lineage">
          {report.generationLineage.length === 0 ? (
            <p className="text-xs text-stone-400">
              No generation events logged. AI-assisted edits and content transforms are recorded
              here for compliance.
            </p>
          ) : (
            report.generationLineage.map((g, i) => (
              <div key={i} className="py-1.5 border-b border-stone-50 last:border-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <Server className="w-3 h-3 text-stone-400" />
                  <span className="font-medium text-stone-700">{actionLabel(g.action)}</span>
                  <span className="text-xs text-stone-400 ml-auto">
                    {formatDate(g.timestamp)}
                  </span>
                </div>
                {g.actor && (
                  <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                    <User className="w-3 h-3" /> {g.actor} ({g.actorType})
                  </div>
                )}
                {g.backendRoute && (
                  <div className="text-xs font-mono text-stone-400 mt-0.5">{g.backendRoute}</div>
                )}
                {g.description && (
                  <div className="text-xs text-stone-500 mt-0.5">{g.description}</div>
                )}
              </div>
            ))
          )}
        </ReportSection>

        {/* 6. Review & Signatures */}
        <ReportSection icon={<CheckCircle className="w-4 h-4" />} title="Review & Signatures">
          <Row
            label="Total Signatures"
            value={report.reviewSignatureSummary.totalSignatures.toString()}
          />
          {report.reviewSignatureSummary.signatures.length > 0 ? (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-stone-400">
                  <th className="text-left py-0.5">Signer</th>
                  <th className="text-left py-0.5">Purpose</th>
                  <th className="text-left py-0.5">Method</th>
                  <th className="text-left py-0.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {report.reviewSignatureSummary.signatures.map((s, i) => (
                  <tr key={i} className="border-t border-stone-50">
                    <td className="py-0.5">
                      {s.signer}
                      {s.role && <span className="text-stone-400"> ({s.role})</span>}
                    </td>
                    <td className="py-0.5 text-stone-600">{s.purpose}</td>
                    <td className="py-0.5 text-stone-500">
                      {s.method}
                      {s.twoFactorVerified && ' + 2FA'}
                    </td>
                    <td className="py-0.5 text-stone-400">{formatDate(s.signedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-stone-400 mt-1">
              No signatures on record. Electronic signatures provide 21 CFR Part 11 compliance
              evidence.
            </p>
          )}
        </ReportSection>

        {/* 7. Export History */}
        <ReportSection icon={<Download className="w-4 h-4" />} title="Export History">
          {report.exportHistory.length === 0 ? (
            <p className="text-xs text-stone-400">
              No exports recorded. DOCX and PDF exports are logged for submission traceability.
            </p>
          ) : (
            report.exportHistory.map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 text-xs text-stone-500">
                <Download className="w-3 h-3 text-stone-400" />
                {actionLabel(e.action)}
                {e.actor && ` by ${e.actor}`}
                <span className="ml-auto text-stone-400">{formatDate(e.timestamp)}</span>
              </div>
            ))
          )}
        </ReportSection>

        {/* 8. Placement Context */}
        <ReportSection icon={<MapPin className="w-4 h-4" />} title="Placement Context">
          <Row label="Project" value={report.placementContext.project} />
          <Row label="CTD Section" value={report.placementContext.ctdSection || 'Not assigned'} />
          <Row label="Artifact ID" value={report.placementContext.artifactId} mono />
          <Row label="Lock Status" value={report.placementContext.lockStatus} />
          {report.placementContext.lockedAt && (
            <Row label="Locked At" value={formatDate(report.placementContext.lockedAt)} />
          )}
        </ReportSection>

        {/* 9. Review Comments */}
        <ReportSection icon={<MessageSquare className="w-4 h-4" />} title="Review Comments">
          <Row label="Total" value={commentsTotal.toString()} />
          <Row label="Open" value={commentsOpen.toString()} />
          <Row label="Resolved" value={(commentsTotal - commentsOpen).toString()} />
          {reviewComments.length > 0 ? (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-stone-400">
                  <th className="text-left py-0.5">Reviewer</th>
                  <th className="text-left py-0.5">Comment</th>
                  <th className="text-left py-0.5">Ver</th>
                  <th className="text-left py-0.5">Status</th>
                  <th className="text-left py-0.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {reviewComments.map(c => (
                  <tr key={c.commentId} className="border-t border-stone-50">
                    <td className="py-0.5 font-medium">{c.userName}</td>
                    <td className="py-0.5 text-stone-600 max-w-[150px] truncate">{c.comment}</td>
                    <td className="py-0.5">v{c.version}</td>
                    <td className="py-0.5">
                      {c.status === 'resolved' ? (
                        <span className="text-stone-700 flex items-center gap-0.5">
                          <CheckCircle className="w-3 h-3" /> Resolved
                        </span>
                      ) : (
                        <span className="text-stone-600">Open</span>
                      )}
                    </td>
                    <td className="py-0.5 text-stone-400">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-stone-400 mt-1">
              No review comments. Comments document the regulatory review process and resolution
              history.
            </p>
          )}
        </ReportSection>

        {/* 9. Full Event Timeline (detailed mode only) */}
        {report.fullEventTimeline && report.fullEventTimeline.length > 0 && (
          <ReportSection icon={<Activity className="w-4 h-4" />} title="Full Event Timeline">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-400">
                  <th className="text-left py-0.5">Event ID</th>
                  <th className="text-left py-0.5">Type</th>
                  <th className="text-left py-0.5">Action</th>
                  <th className="text-left py-0.5">Actor</th>
                  <th className="text-left py-0.5">Route</th>
                  <th className="text-left py-0.5">IP</th>
                  <th className="text-left py-0.5">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {report.fullEventTimeline.map(e => (
                  <tr key={e.eventId} className="border-t border-stone-50">
                    <td className="py-0.5 font-mono">{e.eventId.slice(0, 12)}…</td>
                    <td className="py-0.5">{e.eventType}</td>
                    <td className="py-0.5">{actionLabel(e.action)}</td>
                    <td className="py-0.5">{e.actor || '—'}</td>
                    <td className="py-0.5 font-mono text-stone-400">{e.backendRoute || '—'}</td>
                    <td className="py-0.5 text-stone-400">{e.ipAddress || '—'}</td>
                    <td className="py-0.5 text-stone-400">{formatDate(e.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportSection>
        )}

        {/* Cross-panel actions */}
        {(onOpenProvenance || onOpenCompare) && (
          <div className="mt-4 flex gap-2 print:hidden">
            {onOpenProvenance && (
              <button
                onClick={onOpenProvenance}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded bg-stone-100 text-stone-700 hover:bg-stone-200 font-medium"
              >
                Open Provenance
              </button>
            )}
            {onOpenCompare && (
              <button
                onClick={onOpenCompare}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded bg-stone-100 text-stone-700 hover:bg-stone-200 font-medium"
              >
                Compare Versions
              </button>
            )}
          </div>
        )}

        {/* Report footer */}
        <div className="mt-4 pt-3 border-t border-stone-200 text-center">
          <p className="text-xs text-stone-400">
            {report.reportType} · Generated {formatDate(report.generatedAt)} · {report.standard}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">
            Append-only audit trail · SHA-256 integrity verification · Inspection-ready
          </p>
        </div>
      </div>
    </div>
  );
};

export default DocumentAuditReport;
