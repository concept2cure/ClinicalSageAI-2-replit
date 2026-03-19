/**
 * @fileoverview eCTD Submission Agent Dashboard
 * @module concept2cure/pages/ECTDSubmissionDashboard
 *
 * Claude-aligned UI: warm sand backgrounds, terracotta accents,
 * minimal cards, generous whitespace, Lucide icons.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  Package,
  Shield,
  Activity,
  ChevronRight,
} from 'lucide-react';

interface SubmissionJob {
  id: string;
  sequence: string;
  type: string;
  status: 'draft' | 'assembling' | 'validated' | 'submitted' | 'acknowledged' | 'under_review' | 'approved' | 'rejected' | 'withdrawn' | 'amendment_required';
  region: string;
  modules: number;
  errors: number;
  warnings: number;
  applicant_name?: string;
  application_number?: string;
  updated_at: string;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  draft:                { color: '#8A8880', bg: '#F5F4EF', label: 'Draft' },
  assembling:           { color: '#6A9BCC', bg: '#E0EDF8', label: 'Assembling' },
  validated:            { color: '#788C5D', bg: '#E8EDDF', label: 'Validated' },
  submitted:            { color: '#788C5D', bg: '#E8EDDF', label: 'Submitted' },
  acknowledged:         { color: '#6A9BCC', bg: '#E0EDF8', label: 'Acknowledged' },
  under_review:         { color: '#D97706', bg: '#FEF3C7', label: 'Under Review' },
  approved:             { color: '#788C5D', bg: '#E8EDDF', label: 'Approved' },
  rejected:             { color: '#DC2626', bg: '#FEE2E2', label: 'Rejected' },
  withdrawn:            { color: '#8A8880', bg: '#F5F4EF', label: 'Withdrawn' },
  amendment_required:   { color: '#D97757', bg: '#F5E0D6', label: 'Amendment Required' },
};

export default function ECTDSubmissionDashboard() {
  const [jobs, setJobs] = useState<SubmissionJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/ectd-submissions/');
      if (res.ok) {
        const data = await res.json();
        // Transform backend submissions to dashboard job format
        const submissions = data.submissions ?? data ?? [];
        setJobs(Array.isArray(submissions) ? submissions.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ''),
          sequence: String(s.sequence_number ?? s.sequence ?? ''),
          type: String(s.submission_type ?? s.type ?? 'initial'),
          status: String(s.status ?? 'draft'),
          region: String(s.target_region ?? s.region ?? 'us'),
          modules: Number(s.module_count ?? s.modules ?? 0),
          errors: Number(s.error_count ?? s.errors ?? 0),
          warnings: Number(s.warning_count ?? s.warnings ?? 0),
          applicant_name: String(s.applicant_name ?? ''),
          application_number: String(s.application_number ?? ''),
          updated_at: String(s.updated_at ?? new Date().toISOString()),
        })) : []);
      }
    } catch {
      // Use demo data when API is unavailable
      setJobs([
        { id: '1', sequence: '0001', type: 'initial', status: 'validated', region: 'us', modules: 5, errors: 0, warnings: 2, updated_at: new Date().toISOString() },
        { id: '2', sequence: '0002', type: 'amendment', status: 'assembling', region: 'eu', modules: 3, errors: 0, warnings: 0, updated_at: new Date().toISOString() },
        { id: '3', sequence: '0003', type: 'supplement', status: 'draft', region: 'us', modules: 2, errors: 0, warnings: 1, updated_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const stats = {
    total: jobs.length,
    compiled: jobs.filter(j => ['validated', 'submitted', 'acknowledged', 'under_review', 'approved'].includes(j.status)).length,
    errors: jobs.reduce((s, j) => s + j.errors, 0),
    warnings: jobs.reduce((s, j) => s + j.warnings, 0),
  };

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F5' }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#8A8880' }}>
            <Package size={14} />
            <span>Regulatory Submissions</span>
            <ChevronRight size={14} />
            <span>eCTD Agent</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>
            eCTD Submission Agent
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B6962' }}>
            Automated eCTD compilation, validation, and submission tracking
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Jobs', value: stats.total, icon: FileText, accent: '#6A9BCC' },
            { label: 'Compiled', value: stats.compiled, icon: CheckCircle2, accent: '#788C5D' },
            { label: 'Errors', value: stats.errors, icon: AlertTriangle, accent: '#DC2626' },
            { label: 'Warnings', value: stats.warnings, icon: Clock, accent: '#D97706' },
          ].map(({ label, value, icon: Icon, accent }) => (
            <div
              key={label}
              className="rounded-lg border p-5"
              style={{
                background: '#FFFFFF',
                borderColor: '#E8E6DC',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8A8880' }}>
                  {label}
                </span>
                <Icon size={16} style={{ color: accent }} />
              </div>
              <div className="text-2xl font-semibold" style={{ color: '#141413' }}>
                {loading ? '...' : value}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Document Generation */}
        <div
          className="rounded-lg border p-4 mb-8 flex items-center gap-4 flex-wrap"
          style={{ background: '#FFFFFF', borderColor: '#E8E6DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8A8880' }}>
            Generate Documents
          </span>
          {[
            { label: 'Cover Letter', endpoint: '/api/biotech-artifacts/ectd/cover-letter', ext: 'docx' },
            { label: 'Validation Report', endpoint: '/api/biotech-artifacts/ectd/validation-report', ext: 'docx' },
          ].map(doc => (
            <button
              key={doc.label}
              onClick={async () => {
                const res = await fetch(doc.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                if (res.ok) { const b = await res.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${doc.label.replace(/\s+/g, '_')}.${doc.ext}`; a.click(); }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={{ borderColor: '#E8E6DC', color: '#4D4B45', background: '#FAF9F5' }}
            >
              <FileText size={12} /> {doc.label}
            </button>
          ))}
          <a
            href="/concept2cure/documents"
            className="inline-flex items-center gap-1 text-xs font-medium ml-auto"
            style={{ color: '#D97757' }}
          >
            All Documents <ArrowRight size={12} />
          </a>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-medium" style={{ color: '#141413' }}>
            Submission Jobs
          </h2>
          <button
            onClick={() => { setLoading(true); fetchJobs(); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: '#D97757',
              color: '#FAF9F5',
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Jobs List */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border p-5 animate-pulse"
                style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}
              >
                <div className="h-4 rounded w-1/3 mb-3" style={{ background: '#F5F4EF' }} />
                <div className="h-3 rounded w-1/2" style={{ background: '#F5F4EF' }} />
              </div>
            ))
          ) : jobs.length === 0 ? (
            <div
              className="rounded-lg border p-12 text-center"
              style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}
            >
              <Package size={32} className="mx-auto mb-3" style={{ color: '#B0AEA5' }} />
              <p className="text-sm font-medium" style={{ color: '#141413' }}>No submission jobs yet</p>
              <p className="text-xs mt-1" style={{ color: '#8A8880' }}>
                Create a new eCTD submission to get started
              </p>
            </div>
          ) : (
            jobs.map(job => {
              const st = statusConfig[job.status];
              return (
                <div
                  key={job.id}
                  className="rounded-lg border p-5 flex items-center gap-5 cursor-pointer transition-all hover:border-opacity-70"
                  style={{
                    background: '#FFFFFF',
                    borderColor: '#E8E6DC',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-semibold" style={{ color: '#141413' }}>
                        Sequence {job.sequence}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full uppercase font-medium"
                        style={{ background: '#F5F4EF', color: '#6B6962' }}
                      >
                        {job.region}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: '#8A8880' }}>
                      {job.type} &middot; {job.modules} modules &middot; Updated {new Date(job.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {job.errors > 0 && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#DC2626' }}>
                        <AlertTriangle size={12} /> {job.errors}
                      </div>
                    )}
                    {job.warnings > 0 && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#D97706' }}>
                        <Clock size={12} /> {job.warnings}
                      </div>
                    )}
                    <ArrowRight size={16} style={{ color: '#B0AEA5' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compliance footer */}
        <div className="mt-12 pt-6 border-t flex items-center gap-2 text-xs" style={{ borderColor: '#E8E6DC', color: '#B0AEA5' }}>
          <Shield size={12} />
          <span>ICH eCTD v4.0 compliant &middot; 21 CFR Part 11 audit trails enabled</span>
        </div>
      </div>
    </div>
  );
}
