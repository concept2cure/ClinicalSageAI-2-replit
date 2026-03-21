/**
 * Report & Communication Center
 * Generates readiness briefs, exception summaries, handoff briefs, and transmittals.
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  Download,
  Plus,
  Clock,
  CheckCircle,
  AlertTriangle,
  Send,
  Loader2,
  BarChart3,
  Users,
  ClipboardCheck,
  FileOutput,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react';
import { useReports } from '../../hooks/useReports';
import NanoBananaImageGenerator from '@/components/NanoBananaImageGenerator';

const REPORT_TYPES = [
  {
    type: 'readiness-brief' as const,
    title: 'Readiness Brief',
    description: 'Submission readiness assessment from current package state',
    icon: ClipboardCheck,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
  },
  {
    type: 'exception-summary' as const,
    title: 'Exception Summary',
    description: 'Blockers, overdue items, and risk summary',
    icon: AlertTriangle,
    color: 'bg-amber-50 text-amber-600 border-amber-200',
  },
  {
    type: 'handoff-brief' as const,
    title: 'Sponsor Handoff Brief',
    description: 'Summary for sponsor/CRO handoff communication',
    icon: Users,
    color: 'bg-violet-50 text-violet-600 border-blue-200',
  },
  {
    type: 'transmittal' as const,
    title: 'Transmittal',
    description: 'Package transmittal document for delivery',
    icon: Send,
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  },
  {
    type: 'executive-summary' as const,
    title: 'Executive Summary',
    description: 'High-level portfolio and submission overview',
    icon: BarChart3,
    color: 'bg-pink-50 text-pink-600 border-pink-200',
  },
];

export const ReportCenter: React.FC<{ projectId?: string }> = ({ projectId }) => {
  const { reports, isLoading, generateReport, isGenerating } = useReports(projectId);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = async (type: typeof REPORT_TYPES[0]) => {
    setGeneratingType(type.type);
    setGenerateError(null);
    try {
      await generateReport({
        type: type.type,
        title: `${type.title} - ${new Date().toLocaleDateString()}`,
        projectId,
      });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGeneratingType(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Reports & Communication</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Generate readiness briefs, exception summaries, sponsor handoffs, and transmittals from your current submission state.
        </p>
      </div>

      {/* Error Display */}
      {generateError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{generateError}</span>
          <button onClick={() => setGenerateError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Generate New Report */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-4">Generate Report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORT_TYPES.map((rt) => {
            const Icon = rt.icon;
            const isThisGenerating = generatingType === rt.type;
            return (
              <button
                key={rt.type}
                onClick={() => handleGenerate(rt)}
                disabled={isGenerating}
                className={cn(
                  'flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left',
                  'hover:shadow-sm hover:border-zinc-300',
                  isThisGenerating && 'opacity-60',
                  rt.color
                )}
              >
                <div className="flex items-center gap-2">
                  {isThisGenerating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                  <span className="font-medium text-sm">{rt.title}</span>
                </div>
                <span className="text-xs opacity-75">{rt.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nano Banana — AI Visual & Presentation Generator */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-4">
          AI Visuals & Presentations
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          Generate infographics, regulatory diagrams, or full slide decks from any report context using AnA Visual (Gemini).
        </p>
        <NanoBananaImageGenerator
          context={projectId ? `Regulatory submission status for project ${projectId}` : 'Regulatory readiness overview'}
          mode="infographic"
        />
      </div>

      {/* Recent Reports */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider mb-4">Recent Reports</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading reports...</span>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <FileOutput className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
            <p className="text-sm font-medium">No reports generated yet</p>
            <p className="text-xs mt-1">Generate your first report using the templates above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50"
              >
                <FileText className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{report.title}</p>
                  <p className="text-xs text-zinc-500">{new Date(report.createdAt).toLocaleString()}</p>
                </div>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  report.status === 'ready' && 'bg-emerald-100 text-emerald-700',
                  report.status === 'draft' && 'bg-blue-100 text-blue-700',
                  report.status === 'generating' && 'bg-amber-100 text-amber-700',
                  report.status === 'exported' && 'bg-zinc-100 text-zinc-700',
                )}>
                  {report.status}
                </span>
                {report.downloadUrl && (
                  <a href={report.downloadUrl} className="p-1.5 hover:bg-zinc-200 rounded">
                    <Download className="w-4 h-4 text-zinc-500" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportCenter;
