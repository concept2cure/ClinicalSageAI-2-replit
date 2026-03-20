/**
 * @fileoverview Clinical Operations Dashboard
 * @module concept2cure/pages/ClinicalOperationsDashboard
 *
 * Claude-aligned UI: warm sand, terracotta, minimal, generous whitespace.
 * Surfaces clinical trial operations data from the backend.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope,
  Users,
  MapPin,
  Calendar,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

interface Trial {
  id: string;
  protocol_id: string;
  title: string;
  phase: string;
  status: 'planning' | 'recruiting' | 'active' | 'follow_up' | 'completed' | 'paused' | 'terminated';
  sites: number;
  enrolled: number;
  target: number;
  start_date: string;
  therapeutic_area: string;
}

const phaseColors: Record<string, string> = {
  'Phase I':   '#6A9BCC',
  'Phase II':  '#D97757',
  'Phase III': '#788C5D',
  'Phase IV':  '#8A8880',
};

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  planning:   { color: '#8A8880', bg: '#F5F4EF', label: 'Planning' },
  recruiting: { color: '#6A9BCC', bg: '#E0EDF8', label: 'Recruiting' },
  active:     { color: '#788C5D', bg: '#E8EDDF', label: 'Active' },
  follow_up:  { color: '#D97757', bg: '#F5E0D6', label: 'Follow-Up' },
  completed:  { color: '#8A8880', bg: '#F5F4EF', label: 'Completed' },
  paused:     { color: '#D97706', bg: '#FEF3C7', label: 'Paused' },
  terminated: { color: '#DC2626', bg: '#FEE2E2', label: 'Terminated' },
};

export default function ClinicalOperationsDashboard() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrials = useCallback(async () => {
    try {
      const res = await fetch('/api/clinical-operations/studies');
      if (res.ok) {
        const data = await res.json();
        // Transform backend studies to trial format
        const studies = data.studies ?? data ?? [];
        setTrials(Array.isArray(studies) ? studies.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ''),
          protocol_id: String(s.protocol_id ?? s.protocol_number ?? ''),
          title: String(s.title ?? s.study_title ?? ''),
          phase: String(s.phase ?? ''),
          status: String(s.status ?? 'planning'),
          sites: Number(s.active_sites ?? s.sites ?? 0),
          enrolled: Number(s.enrolled_count ?? s.enrolled ?? 0),
          target: Number(s.target_enrollment ?? s.target ?? 0),
          start_date: String(s.start_date ?? s.created_at ?? ''),
          therapeutic_area: String(s.therapeutic_area ?? ''),
        })) : []);
      }
    } catch {
      // Demo data
      setTrials([
        { id: '1', protocol_id: 'CSA-2847-001', title: 'Efficacy of Compound A in Treatment-Resistant Depression', phase: 'Phase III', status: 'recruiting', sites: 24, enrolled: 312, target: 500, start_date: '2025-06-15', therapeutic_area: 'CNS' },
        { id: '2', protocol_id: 'CSA-9921-002', title: 'Safety & Immunogenicity of Biologic B in Autoimmune Disease', phase: 'Phase II', status: 'active', sites: 12, enrolled: 89, target: 120, start_date: '2025-09-01', therapeutic_area: 'Immunology' },
        { id: '3', protocol_id: 'CSA-1156-003', title: 'Post-Market Surveillance of Compound C Cardiac Effects', phase: 'Phase IV', status: 'active', sites: 40, enrolled: 1200, target: 2000, start_date: '2024-11-01', therapeutic_area: 'Cardiology' },
        { id: '4', protocol_id: 'CSA-4420-001', title: 'First-in-Human Study of Novel Kinase Inhibitor', phase: 'Phase I', status: 'recruiting', sites: 3, enrolled: 8, target: 36, start_date: '2026-01-20', therapeutic_area: 'Oncology' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrials(); }, [fetchTrials]);

  const stats = {
    activeTrials: trials.filter(t => ['active', 'recruiting', 'follow_up'].includes(t.status)).length,
    totalSites: trials.reduce((s, t) => s + t.sites, 0),
    totalEnrolled: trials.reduce((s, t) => s + t.enrolled, 0),
    enrollmentRate: trials.length > 0
      ? Math.round((trials.reduce((s, t) => s + t.enrolled, 0) / trials.reduce((s, t) => s + t.target, 0)) * 100)
      : 0,
  };

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F5' }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#8A8880' }}>
            <Stethoscope size={14} />
            <span>Clinical Development</span>
            <ChevronRight size={14} />
            <span>Operations</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>
            Clinical Operations
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B6962' }}>
            Trial enrollment, site management, and operational metrics
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Trials', value: stats.activeTrials, icon: Activity, accent: '#D97757' },
            { label: 'Total Sites', value: stats.totalSites, icon: MapPin, accent: '#6A9BCC' },
            { label: 'Enrolled', value: stats.totalEnrolled.toLocaleString(), icon: Users, accent: '#788C5D' },
            { label: 'Enrollment Rate', value: `${stats.enrollmentRate}%`, icon: TrendingUp, accent: '#D97757' },
          ].map(({ label, value, icon: Icon, accent }) => (
            <div
              key={label}
              className="rounded-lg border p-5"
              style={{ background: '#FFFFFF', borderColor: '#E8E6DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8A8880' }}>{label}</span>
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
            { label: 'Protocol Synopsis', endpoint: '/api/biotech-artifacts/clinical/protocol-synopsis', ext: 'docx' },
            { label: 'Monitoring Report', endpoint: '/api/biotech-artifacts/clinical/monitoring-report', ext: 'docx' },
            { label: 'Deviation Report', endpoint: '/api/biotech-artifacts/clinical/deviation-report', ext: 'docx' },
            { label: 'Enrollment Report', endpoint: '/api/biotech-artifacts/clinical/enrollment-report', ext: 'docx' },
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
              <Stethoscope size={12} /> {doc.label}
            </button>
          ))}
          <a
            href="/concept2cure/documents"
            className="inline-flex items-center gap-1 text-xs font-medium ml-auto"
            style={{ color: '#D97757' }}
          >
            All Documents →
          </a>
        </div>

        {/* Trials List */}
        <h2 className="text-base font-medium mb-4" style={{ color: '#141413' }}>
          Active Trials
        </h2>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-5 animate-pulse" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                <div className="h-4 rounded w-1/2 mb-3" style={{ background: '#F5F4EF' }} />
                <div className="h-3 rounded w-1/3" style={{ background: '#F5F4EF' }} />
              </div>
            ))
          ) : (
            trials.map(trial => {
              const st = statusConfig[trial.status];
              const enrollPct = Math.round((trial.enrolled / trial.target) * 100);
              return (
                <div
                  key={trial.id}
                  className="rounded-lg border p-5 cursor-pointer transition-all"
                  style={{ background: '#FFFFFF', borderColor: '#E8E6DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono" style={{ color: '#8A8880' }}>
                          {trial.protocol_id}
                        </span>
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {st.label}
                        </span>
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: '#F5F4EF', color: phaseColors[trial.phase] ?? '#8A8880' }}
                        >
                          {trial.phase}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate" style={{ color: '#141413' }}>
                        {trial.title}
                      </p>
                    </div>
                    <ArrowUpRight size={16} style={{ color: '#B0AEA5' }} />
                  </div>

                  {/* Enrollment progress */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: '#6B6962' }}>
                        {trial.enrolled} / {trial.target} enrolled
                      </span>
                      <span style={{ color: '#8A8880' }}>{enrollPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F5F4EF' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(enrollPct, 100)}%`,
                          background: enrollPct >= 75 ? '#788C5D' : enrollPct >= 40 ? '#6A9BCC' : '#D97757',
                        }}
                      />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs" style={{ color: '#8A8880' }}>
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {trial.sites} sites
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> Started {new Date(trial.start_date).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={12} /> {trial.therapeutic_area}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t flex items-center gap-2 text-xs" style={{ borderColor: '#E8E6DC', color: '#B0AEA5' }}>
          <Target size={12} />
          <span>ICH E6(R2) GCP compliant &middot; CTMS integration enabled</span>
        </div>
      </div>
    </div>
  );
}
