import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ProtocolCompareViewerProps {
  protocolId: string;
  userId: string;
}

export default function ProtocolCompareViewer({ protocolId, userId }: ProtocolCompareViewerProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dossier/view/${userId}/${protocolId}`)
      .then(res => res.json())
      .then(data => {
        setReports(data.reports || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching protocol versions:', err);
        // toast call replaced
  // Original: toast({
          title: 'Error',
          description: 'Failed to load protocol versions',
          variant: 'destructive'
        })
  console.log('Toast would show:', {
          title: 'Error',
          description: 'Failed to load protocol versions',
          variant: 'destructive'
        });
        setLoading(false);
      });
  }, [protocolId, userId]);

  const handleExportComparison = async () => {
    if (reports.length < 2) return;

    try {
      setExporting(true);
      const [latest, previous] = reports;

      const res = await fetch('/api/export/protocol-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol_id: protocolId,
          v1: previous,
          v2: latest
        })
      });

      const data = await res.json();
      
      if (data.success && data.download_url) {
        window.open(data.download_url, '_blank');
        // toast call replaced
  // Original: toast({
          title: 'Success',
          description: 'Comparison report generated successfully',
        })
  console.log('Toast would show:', {
          title: 'Success',
          description: 'Comparison report generated successfully',
        });
      } else {
        throw new Error(data.message || 'Failed to generate comparison report');
      }
    } catch (error) {
      console.error('Error generating comparison:', error);
      // toast call replaced
  // Original: toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate comparison report',
        variant: 'destructive'
      })
  console.log('Toast would show:', {
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate comparison report',
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-blue-800">Loading versions...</span>
      </div>
    );
  }

  if (reports.length < 2) {
    return (
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-6">
          <p className="text-center text-slate-600">Need at least 2 versions to compare.</p>
          <p className="text-center text-slate-500 text-sm mt-2">
            Save multiple versions of your protocol intelligence reports to enable comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [latest, previous] = reports;

  const difference = (field: string) => {
    if (!latest?.data?.parsed || !previous?.data?.parsed) return false;
    return latest.data.parsed[field] !== previous.data.parsed[field];
  };

  const getSuccessDelta = () => {
    if (!latest?.data?.prediction || !previous?.data?.prediction) return 0;
    return (latest.data.prediction - previous.data.prediction) * 100;
  };

  const successDelta = getSuccessDelta();
  const deltaColor = successDelta > 0 ? 'text-green-600' : successDelta < 0 ? 'text-red-600' : 'text-slate-600';

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-bold text-blue-800">🔍 Protocol Version Comparison</h2>
      <Card className="border-slate-200">
        <CardContent className="pt-6 text-sm space-y-4">
          <div className="flex justify-between items-center">
            <p className="font-semibold">Compared Versions:</p>
            <p className="text-slate-700">
              <span className="font-semibold">{latest.version || 'Latest'}</span> vs <span className="font-semibold">{previous.version || 'Previous'}</span>
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {["sample_size", "duration_weeks", "dropout_rate", "endpoint_primary"].map((key) => (
              <Card key={key} className={`text-sm border ${difference(key) ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                <CardContent className="p-4">
                  <p className="font-semibold capitalize mb-2">{key.replace(/_/g, " ")}:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-slate-500">Latest:</p>
                      <p>{latest?.data?.parsed?.[key] || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Previous:</p>
                      <p>{previous?.data?.parsed?.[key] || 'N/A'}</p>
                    </div>
                  </div>
                  {difference(key) && <p className="text-amber-600 text-xs mt-2">⚠️ Changed</p>}
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Card className={`border ${deltaColor === 'text-green-600' ? 'border-green-300 bg-green-50' : deltaColor === 'text-red-600' ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
            <CardContent className="p-4">
              <p className="font-semibold mb-2">Success Probability:</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500">Latest:</p>
                  <p>{latest?.data?.prediction ? `${(latest.data.prediction * 100).toFixed(1)}%` : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Previous:</p>
                  <p>{previous?.data?.prediction ? `${(previous.data.prediction * 100).toFixed(1)}%` : 'N/A'}</p>
                </div>
              </div>
              <p className={`font-semibold mt-2 ${deltaColor}`}>
                Delta: {successDelta > 0 ? '+' : ''}{successDelta.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          
          <Button
            className="w-full bg-blue-700 hover:bg-blue-800 text-white"
            onClick={handleExportComparison}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating report...
              </>
            ) : (
              <>📥 Download Comparison Report (PDF)</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}