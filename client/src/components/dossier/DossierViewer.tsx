import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Save, FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface DossierReport {
  created_at: string;
  data: {
    parsed: {
      indication: string;
      phase: string;
      sample_size: number;
      duration_weeks: number;
      dropout_rate: number;
      primary_endpoints: string[];
    };
    prediction: number;
    benchmarks: {
      avg_sample_size: number;
      avg_duration: number;
      avg_dropout: number;
      total_trials: number;
      success_rate?: number;
    };
  };
}

interface DossierData {
  protocol_id: string;
  reports: DossierReport[];
}

export default function DossierViewer() {
  const [protocolId, setProtocolId] = useState('');
  const [username, setUsername] = useState('biotech_user1'); // Default user (would come from auth in real app)
  const [dossierData, setDossierData] = useState<DossierData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDossier = async () => {
    if (!protocolId.trim()) {
      // toast call replaced
  // Original: toast({
        title: "Protocol ID Required",
        description: "Please enter a Protocol ID to load reports",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Protocol ID Required",
        description: "Please enter a Protocol ID to load reports",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest('GET', `/api/dossier/view/${username}/${protocolId}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setDossierData(data);
      
      if (data.reports.length === 0) {
        // toast call replaced
  // Original: toast({
          title: "No Reports Found",
          description: `No reports found for protocol ID "${protocolId}"`,
          variant: "destructive",
        })
  console.log('Toast would show:', {
          title: "No Reports Found",
          description: `No reports found for protocol ID "${protocolId}"`,
          variant: "destructive",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dossier reports');
      // toast call replaced
  // Original: toast({
        title: "Error Loading Reports",
        description: err instanceof Error ? err.message : 'Failed to load dossier reports',
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Loading Reports",
        description: err instanceof Error ? err.message : 'Failed to load dossier reports',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportReport = async (report: DossierReport) => {
    try {
      const response = await apiRequest('POST', '/api/export/intelligence-report', {
        protocol_id: protocolId,
        protocol_data: report.data.parsed,
        prediction: report.data.prediction,
        benchmarks: report.data.benchmarks
      });
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Open the PDF in a new tab
      window.open(result.download_url, '_blank');
      
      // toast call replaced
  // Original: toast({
        title: "Report Generated",
        description: "Your PDF report has been generated successfully",
      })
  console.log('Toast would show:', {
        title: "Report Generated",
        description: "Your PDF report has been generated successfully",
      });
    } catch (err) {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: err instanceof Error ? err.message : 'Failed to generate report',
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: err instanceof Error ? err.message : 'Failed to generate report',
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Protocol Intelligence Dossier</CardTitle>
          <CardDescription>
            View saved protocol intelligence reports and historical data for user: {username}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input 
              value={protocolId} 
              onChange={(e) => setProtocolId(e.target.value)}
              placeholder="Enter Protocol ID (e.g., obesity_trial_v3)" 
              className="flex-1"
            />
            <Button 
              onClick={fetchDossier} 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load Reports'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dossierData && dossierData.reports.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Reports for Protocol: {dossierData.protocol_id}</h2>
          
          {dossierData.reports.map((report, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <CardTitle className="text-base flex justify-between">
                  <span>Report #{dossierData.reports.length - index}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {formatDate(report.created_at)}
                  </span>
                </CardTitle>
              </CardHeader>
              
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Protocol Details</h3>
                    <ul className="space-y-1 text-sm">
                      <li><span className="font-medium">Indication:</span> {report.data.parsed.indication}</li>
                      <li><span className="font-medium">Phase:</span> {report.data.parsed.phase}</li>
                      <li><span className="font-medium">Sample Size:</span> {report.data.parsed.sample_size}</li>
                      <li><span className="font-medium">Duration:</span> {report.data.parsed.duration_weeks} weeks</li>
                      <li><span className="font-medium">Dropout Rate:</span> {(report.data.parsed.dropout_rate * 100).toFixed(1)}%</li>
                      <li>
                        <span className="font-medium">Primary Endpoint:</span> {
                          report.data.parsed.primary_endpoints && 
                          (Array.isArray(report.data.parsed.primary_endpoints) ? 
                            report.data.parsed.primary_endpoints[0] : 
                            report.data.parsed.primary_endpoints)
                        }
                      </li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Analysis Results</h3>
                    <ul className="space-y-1 text-sm">
                      <li className="font-medium text-base">
                        Success Probability: {(report.data.prediction * 100).toFixed(1)}%
                      </li>
                      <li><span className="font-medium">CSR Average Sample Size:</span> {report.data.benchmarks.avg_sample_size}</li>
                      <li><span className="font-medium">CSR Average Duration:</span> {report.data.benchmarks.avg_duration} weeks</li>
                      <li><span className="font-medium">CSR Average Dropout Rate:</span> {(report.data.benchmarks.avg_dropout * 100).toFixed(1)}%</li>
                      {report.data.benchmarks.success_rate !== undefined && (
                        <li><span className="font-medium">Historical Success Rate:</span> {(report.data.benchmarks.success_rate * 100).toFixed(1)}%</li>
                      )}
                      <li><span className="font-medium">Based on:</span> {report.data.benchmarks.total_trials} similar trials</li>
                    </ul>
                  </div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={() => handleExportReport(report)}
                    className="flex items-center gap-2"
                  >
                    <FileDown className="h-4 w-4" />
                    Export PDF Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        dossierData && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No reports found for this protocol ID.</p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}