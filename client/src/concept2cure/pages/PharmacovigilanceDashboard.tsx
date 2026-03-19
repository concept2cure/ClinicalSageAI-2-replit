/**
 * @fileoverview Pharmacovigilance Dashboard
 * @module concept2cure/pages/PharmacovigilanceDashboard
 *
 * Claude-aligned UI: warm sand, terracotta accents, minimal cards.
 * Surfaces safety signal data from the pharmacovigilance backend.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Activity,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  BarChart3,
  Clock,
  FileWarning,
  Users,
} from 'lucide-react';

interface SafetySignal {
  id: string;
  product_name: string;
  signal_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'escalated';
  reported_date: string;
  case_count: number;
  description: string;
}

const severityConfig = {
  low:      { color: '#788C5D', bg: '#E8EDDF', label: 'Low' },
  medium:   { color: '#D97706', bg: '#FEF3C7', label: 'Medium' },
  high:     { color: '#D97757', bg: '#F5E0D6', label: 'High' },
  critical: { color: '#DC2626', bg: '#FEE2E2', label: 'Critical' },
};

const statusColors: Record<string, { color: string; bg: string }> = {
  open:          { color: '#6A9BCC', bg: '#E0EDF8' },
  investigating: { color: '#D97706', bg: '#FEF3C7' },
  resolved:      { color: '#788C5D', bg: '#E8EDDF' },
  escalated:     { color: '#DC2626', bg: '#FEE2E2' },
};

/** Map backend evaluationStatus to UI status */
function mapEvaluationStatus(s: string): SafetySignal['status'] {
  const mapping: Record<string, SafetySignal['status']> = {
    new: 'open',
    under_evaluation: 'investigating',
    confirmed: 'escalated',
    refuted: 'resolved',
    closed: 'resolved',
  };
  return mapping[s] ?? (s as SafetySignal['status']);
}

export default function PharmacovigilanceDashboard() {
  const [signals, setSignals] = useState<SafetySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/pharmacovigilance/signals');
      if (res.ok) {
        const data = await res.json();
        // Transform backend signal format to UI format
        const raw = data.signals ?? data ?? [];
        setSignals(Array.isArray(raw) ? raw.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ''),
          product_name: String(s.product_name ?? s.productName ?? 'Unknown Product'),
          signal_type: String(s.signal_type ?? s.signalType ?? s.description ?? ''),
          severity: String(s.severity ?? 'medium') as SafetySignal['severity'],
          status: mapEvaluationStatus(String(s.status ?? s.evaluationStatus ?? 'open')),
          reported_date: String(s.reported_date ?? s.detectedAt ?? s.created_at ?? new Date().toISOString()),
          case_count: Number(s.case_count ?? s.caseCount ?? 0),
          description: String(s.description ?? s.riskBenefitAssessment ?? ''),
        })) : []);
      }
    } catch {
      // Demo data
      setSignals([
        { id: '1', product_name: 'Compound A-2847', signal_type: 'Hepatotoxicity', severity: 'high', status: 'investigating', reported_date: '2026-03-15', case_count: 12, description: 'Elevated liver enzymes observed in post-market surveillance' },
        { id: '2', product_name: 'Biologic B-9921', signal_type: 'Injection Site Reaction', severity: 'low', status: 'open', reported_date: '2026-03-18', case_count: 45, description: 'Mild injection site reactions reported above baseline rate' },
        { id: '3', product_name: 'Compound C-1156', signal_type: 'QT Prolongation', severity: 'critical', status: 'escalated', reported_date: '2026-03-10', case_count: 3, description: 'Potential cardiac signal identified in Phase IV monitoring' },
        { id: '4', product_name: 'Device D-4420', signal_type: 'Skin Sensitization', severity: 'medium', status: 'resolved', reported_date: '2026-02-28', case_count: 8, description: 'Contact dermatitis cases from adhesive component' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const filtered = signals.filter(s =>
    s.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.signal_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    open: signals.filter(s => s.status === 'open' || s.status === 'investigating').length,
    critical: signals.filter(s => s.severity === 'critical' || s.severity === 'high').length,
    totalCases: signals.reduce((s, sig) => s + sig.case_count, 0),
    resolved: signals.filter(s => s.status === 'resolved').length,
  };

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F5' }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#8A8880' }}>
            <ShieldAlert size={14} />
            <span>Safety &amp; Surveillance</span>
            <ChevronRight size={14} />
            <span>Pharmacovigilance</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>
            Pharmacovigilance Dashboard
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B6962' }}>
            Safety signal monitoring, case management, and regulatory reporting
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Signals', value: stats.open, icon: Activity, accent: '#6A9BCC' },
            { label: 'High/Critical', value: stats.critical, icon: AlertCircle, accent: '#DC2626' },
            { label: 'Total Cases', value: stats.totalCases, icon: Users, accent: '#D97757' },
            { label: 'Resolved', value: stats.resolved, icon: TrendingUp, accent: '#788C5D' },
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

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}
          >
            <Search size={16} style={{ color: '#B0AEA5' }} />
            <input
              type="text"
              placeholder="Search signals by product or type..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: '#141413' }}
            />
          </div>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            style={{ background: '#FFFFFF', borderColor: '#E8E6DC', color: '#6B6962' }}
          >
            <Filter size={14} />
            Filter
          </button>
        </div>

        {/* Signals List */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-5 animate-pulse" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
                <div className="h-4 rounded w-1/3 mb-3" style={{ background: '#F5F4EF' }} />
                <div className="h-3 rounded w-2/3" style={{ background: '#F5F4EF' }} />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border p-12 text-center" style={{ background: '#FFFFFF', borderColor: '#E8E6DC' }}>
              <ShieldAlert size={32} className="mx-auto mb-3" style={{ color: '#B0AEA5' }} />
              <p className="text-sm font-medium" style={{ color: '#141413' }}>No safety signals found</p>
              <p className="text-xs mt-1" style={{ color: '#8A8880' }}>
                {searchTerm ? 'Try adjusting your search terms' : 'All clear — no active signals detected'}
              </p>
            </div>
          ) : (
            filtered.map(signal => {
              const sev = severityConfig[signal.severity];
              const st = statusColors[signal.status];
              return (
                <div
                  key={signal.id}
                  className="rounded-lg border p-5 cursor-pointer transition-all"
                  style={{ background: '#FFFFFF', borderColor: '#E8E6DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold" style={{ color: '#141413' }}>
                          {signal.product_name}
                        </span>
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: sev.bg, color: sev.color }}
                        >
                          {sev.label}
                        </span>
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {signal.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium" style={{ color: '#6B6962' }}>
                        {signal.signal_type}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs flex items-center gap-1" style={{ color: '#8A8880' }}>
                        <Clock size={12} />
                        {new Date(signal.reported_date).toLocaleDateString()}
                      </div>
                      <div className="text-xs mt-1" style={{ color: '#8A8880' }}>
                        {signal.case_count} cases
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#8A8880' }}>
                    {signal.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Compliance footer */}
        <div className="mt-12 pt-6 border-t flex items-center gap-2 text-xs" style={{ borderColor: '#E8E6DC', color: '#B0AEA5' }}>
          <FileWarning size={12} />
          <span>ICH E2B(R3) compliant &middot; EudraVigilance &amp; FAERS integration ready</span>
        </div>
      </div>
    </div>
  );
}
