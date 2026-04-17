import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

export default function GeneratedReportPanel({ jobId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportUrl, setReportUrl] = useState(null);

  useEffect(() => {
    if (!jobId) {
      setError('No report generation job selected');
      return;
    }

    const loadReport = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/cer/jobs/${jobId}/result`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Report service returned ${res.status}`);
        const data = await res.json();
        if (!data?.downloadUrl) {
          throw new Error('Report is not ready yet');
        }
        setReportUrl(data.downloadUrl);
      } catch (err) {
        setError('Failed to load report. The generation job may still be in progress or the service is unavailable.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [jobId]);

  if (loading)
    return (
      <div className="p-10 flex flex-col items-center">
        <p className="text-sm text-stone-600 mb-4">Loading report...</p>
        <div className="h-8 w-8 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (error)
    return (
      <Card>
        <CardContent className="p-6">
          <div className="p-4 border border-amber-200 bg-amber-50 rounded-md text-amber-800">
            <h3 className="font-semibold mb-2 text-sm">Report not available</h3>
            <p className="text-xs">{error}</p>
            {!jobId && (
              <p className="mt-2 text-xs">
                Generate a new report using the &quot;Generate CER&quot; button at the top of the page.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-base font-semibold text-stone-900 mb-4">Generated report</h3>
        <div className="border border-stone-200 rounded-md overflow-hidden">
          {reportUrl ? (
            <iframe
              src={reportUrl}
              className="w-full h-[800px]"
              title="Clinical evaluation report"
            />
          ) : (
            <div className="p-10 text-center text-sm text-stone-500">
              No report URL returned from the backend.
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => window.open(reportUrl, '_blank')} disabled={!reportUrl}>
            Download PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
