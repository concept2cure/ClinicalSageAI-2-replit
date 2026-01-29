import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReportCard } from '@/components/reports/ReportCard';
import { ReportDetailModal } from '@/components/reports/ReportDetailModal';
import { type CsrReport } from '@/lib/types';
import { Filter } from 'lucide-react';

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<CsrReport | null>(null);
  const [phase, setPhase] = useState<string>('all');
  const [indication, setIndication] = useState<string>('all');

  // Fetch reports data
  const { data: reports, isLoading } = useQuery({
    queryKey: ['/api/reports'],
  });

  const filteredReports = reports
    ? reports.filter((report: CsrReport) => {
        const matchesPhase =
          phase === 'all' || report.phase.toLowerCase().includes(phase.toLowerCase());
        const matchesIndication =
          indication === 'all' ||
          report.indication.toLowerCase().includes(indication.toLowerCase());
        return matchesPhase && matchesIndication;
      })
    : [];

  // Extract unique phases and indications for filters
  const phases = reports ? Array.from(new Set(reports.map((r: CsrReport) => r.phase))) : [];
  const indications = reports
    ? Array.from(new Set(reports.map((r: CsrReport) => r.indication)))
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white/80 rounded-2xl shadow-sm border border-slate-200/70 backdrop-blur">
        <div className="px-6 py-5 border-b border-slate-200/60 flex justify-between items-center">
          <h3 className="text-lg font-medium text-slate-900">CSR Report Library</h3>
          <div className="flex space-x-2">
            <div className="relative">
              <select
                className="block w-full pl-3 pr-10 py-2 text-base border-slate-200/70 bg-white/80 focus:outline-none focus:ring-slate-400 focus:border-slate-400 sm:text-sm rounded-md"
                value={phase}
                onChange={e => setPhase(e.target.value)}
              >
                <option value="all">All Phases</option>
                {phases.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <select
                className="block w-full pl-3 pr-10 py-2 text-base border-slate-200/70 bg-white/80 focus:outline-none focus:ring-slate-400 focus:border-slate-400 sm:text-sm rounded-md"
                value={indication}
                onChange={e => setIndication(e.target.value)}
              >
                <option value="all">All Indications</option>
                {indications.map(i => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <button className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400">
              <Filter className="h-5 w-5 mr-1" />
              Filter
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center">
              <div className="inline-block animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p className="mt-2 text-sm text-slate-600">Loading reports...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-slate-600">No reports found matching your filters.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/60">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Sponsor
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Indication
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Phase
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    Report Date
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/70 divide-y divide-slate-200">
                {filteredReports.map((report: CsrReport) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onClick={report => setSelectedReport(report)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-slate-50/80 px-6 py-4 border-t border-slate-200/60 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-medium">{filteredReports.length}</span> reports
          </div>
          <div className="flex space-x-2">
            <button
              className="inline-flex items-center px-3 py-2 border border-slate-200/70 text-sm font-medium rounded-md text-slate-700 bg-white/80 hover:bg-slate-50 disabled:opacity-50"
              disabled
            >
              Previous
            </button>
            <button
              className="inline-flex items-center px-3 py-2 border border-slate-200/70 text-sm font-medium rounded-md text-slate-700 bg-white/80 hover:bg-slate-50 disabled:opacity-50"
              disabled={filteredReports.length < 10}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </div>
  );
}
