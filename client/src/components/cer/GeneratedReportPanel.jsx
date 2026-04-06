import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

export default function GeneratedReportPanel({ jobId }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportUrl, setReportUrl] = useState(null);

  useEffect(() => {
    // Only fetch report if we have a job ID
    if (!jobId) {
      setError('No report generation job selected');
      return;
    }

    const loadReport = async () => {
      setLoading(true);
      try {
        // This would be a real API call in production
        // const res = await fetch(`/api/cer/jobs/${jobId}/result`);
        // const { downloadUrl } = await res.json();

        // Mock successful loading for demo
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockUrl = '/path/to/report.pdf'; // This would be a real URL
        setReportUrl(mockUrl);

        // In a real implementation, we would render the PDF
        // using a PDF viewer library like PDF.js:
        //
        // const pdf = await PDFjs.getDocument(downloadUrl).promise;
        // const page = await pdf.getPage(1);
        // const viewport = page.getViewport({ scale: 1.2 });
        // const canvas = canvasRef.current;
        // canvas.height = viewport.height;
        // canvas.width = viewport.width;
        // const ctx = canvas.getContext('2d');
        // await page.render({ canvasContext: ctx, viewport }).promise;

        // For demo, we'll just show a placeholder canvas
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = 610;
          canvas.height = 800;
          const ctx = canvas.getContext('2d');

          // Draw a placeholder "report"
          ctx.fillStyle = '#f8f9fa';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw header
          ctx.fillStyle = '#e8e6dc';
          ctx.fillRect(0, 0, canvas.width, 80);

          // Title
          ctx.fillStyle = '#2d2d2a';
          ctx.font = 'bold 24px Arial';
          ctx.fillText('Clinical Evaluation Report', 30, 50);

          // Content section
          ctx.fillStyle = '#2d2d2a';
          ctx.font = '16px Arial';
          ctx.fillText('1. Executive Summary', 30, 120);

          // Content lines
          ctx.fillStyle = '#8a8880';
          ctx.font = '14px Arial';
          for (let i = 0; i < 15; i++) {
            ctx.fillRect(30, 150 + i * 30, 550, 2);
          }

          // Draw a chart
          ctx.fillStyle = '#a8a29e';
          ctx.fillRect(100, 600, 100, 100);
          ctx.fillStyle = '#34d399';
          ctx.fillRect(220, 620, 100, 80);
          ctx.fillStyle = '#f87171';
          ctx.fillRect(340, 580, 100, 120);

          // X-axis
          ctx.fillStyle = '#000000';
          ctx.fillRect(80, 700, 380, 2);

          // Y-axis
          ctx.fillRect(80, 580, 2, 120);
        }
      } catch (err) {
        console.error('PDF load error', err);
        setError('Failed to load report preview.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [jobId]);

  if (loading)
    return (
      <div className="p-10 flex flex-col items-center">
        <p className="mb-4">Loading report preview...</p>
        <Progress className="w-full max-w-md" value={75} />
      </div>
    );

  if (error)
    return (
      <Card>
        <CardContent className="p-6">
          <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
            <h3 className="font-semibold mb-2">Error Loading Report</h3>
            <p>{error}</p>
            {!jobId && (
              <p className="mt-2">
                Generate a new report using the 'Generate CER' button at the top of the page.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4">Report Preview</h3>
        <div className="border rounded-md overflow-hidden">
          <canvas ref={canvasRef} className="w-full" />
        </div>
        <div className="mt-4 flex justify-between">
          <Button variant="outline">Print Report</Button>
          <Button onClick={() => window.open(reportUrl, '_blank')} disabled={!reportUrl}>
            Download Full PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
