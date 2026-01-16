import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, User, Tag, Check, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge';
import { fetchCERHistory } from '../../services/documentService';

export default function ReportHistoryPanel({ onOpenReport, refreshTrigger, filters = {} }) {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCERHistory(filters)
      .then(data => setReports(data))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [refreshTrigger, filters]); // Refresh when trigger or filters change

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-60">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );

  return (
    <div className="cer-report-history space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Your CER Reports</h2>
        <Button variant="ghost" size="sm" onClick={() => setLoading(true)}>
          <Clock className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {reports?.length === 0 ? (
        <Card className="p-6 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No previous reports found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Generate your first CER report to see it here
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports?.map(report => (
            <Card key={report.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div className="font-medium">{report.title}</div>
                  <Badge variant={report.status === 'final' ? 'success' : 'secondary'}>
                    {report.status === 'final' ? 'Final' : 'Draft'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                  <div className="flex items-center text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    {formatDate(report.generatedAt)}
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <Tag className="h-3.5 w-3.5 mr-1" />
                    {report.deviceType}
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <User className="h-3.5 w-3.5 mr-1" />
                    {report.manufacturer}
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    {report.pageCount} pages
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {report.status === 'draft' && (
                    <Button size="sm" variant="outline">
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  )}
                  <Button size="sm" variant="primary" onClick={() => onOpenReport(report.id)}>
                    <FileText className="h-4 w-4 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
