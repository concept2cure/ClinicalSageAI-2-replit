import React from 'react';
import { CsrReport } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';

interface ReportCardProps {
  report: CsrReport;
  onClick: (report: CsrReport) => void;
}

export function ReportCard({ report, onClick }: ReportCardProps) {
  // Format date to be more readable
  const formatDate = (date: string | Date) => {
    if (typeof date === 'string') {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-slate-800">{report.title}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-slate-600">{report.sponsor}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-slate-600">{report.indication}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-slate-600">{report.phase}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <StatusBadge status={report.status as 'Processing' | 'Processed' | 'Failed'} />
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
        {formatDate(report.uploadDate)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button onClick={() => onClick(report)} className="text-primary hover:text-primary-dark">
          View
        </button>
      </td>
    </tr>
  );
}
