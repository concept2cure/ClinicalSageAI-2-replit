import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface ValidationDashboardProps {
  documentId: string;
}

type ValidationSignal = {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'pending';
  detail: string;
};

const statusBadge = (status: ValidationSignal['status']) => {
  switch (status) {
    case 'pass':
      return (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Pass
        </span>
      );
    case 'warning':
      return (
        <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" /> Review
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <Clock className="h-3.5 w-3.5" /> Pending
        </span>
      );
  }
};

export default function ValidationDashboard({ documentId }: ValidationDashboardProps) {
  void documentId;

  const signals = useMemo<ValidationSignal[]>(
    () => [
      {
        id: 'content',
        label: 'Content Completeness',
        status: 'warning',
        detail: 'Four sections reference stale tables that require acceptance.',
      },
      {
        id: 'terminology',
        label: 'Region Terminology',
        status: 'pass',
        detail: 'Terminology aligned with latest FDA Module 3 lexicon.',
      },
      {
        id: 'citations',
        label: 'Source Traceability',
        status: 'warning',
        detail: 'Two SmartData chips awaiting confirmation after dataset refresh.',
      },
      {
        id: 'signoff',
        label: 'Signature Readiness',
        status: 'pending',
        detail: 'Draft has not been routed to QA reviewers yet.',
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-6 text-sm text-gray-600">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Validation</p>
        <h2 className="text-sm font-semibold text-gray-700">Safety Net Overview</h2>
        <p className="text-xs text-gray-500">Live snapshot of automated checks across the document.</p>
      </header>

      <div className="space-y-3">
        {signals.map(signal => (
          <div
            key={signal.id}
            className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 transition-colors hover:border-purple-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                {signal.label}
              </span>
              {statusBadge(signal.status)}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{signal.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
