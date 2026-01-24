import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Download, FileText, FileCode, PackageOpen } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// Common phase options for clinical trials
const phaseOptions = [
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Phase 3', label: 'Phase 3' },
  { value: 'Phase 4', label: 'Phase 4' },
];

interface BenchmarkMetrics {
  total_trials: number;
  top_endpoints: [string, number][];
  avg_duration_weeks: number;
  avg_sample_size: number;
  avg_dropout_rate: number;
  matched_trial_ids: string[];
}

const SmartProtocolPanel: React.FC = () => {
  const { toast } = useToast();
  const [indication, setIndication] = useState<string>('');
  const [phase, setPhase] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<BenchmarkMetrics | null>(null);
  const [protocolDraft, setProtocolDraft] = useState<string>('');
  const [strategicSummary, setStrategicSummary] = useState<string>('');
  const [sapSection, setSapSection] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<string>('metrics');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Function to get CSR benchmark metrics
  const getBenchmarkMetrics = async () => {
    if (!indication || !phase) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please enter both indication and phase to get metrics.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please enter both indication and phase to get metrics.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest(
        'GET', 
        `/api/csr/benchmark?indication=${encodeURIComponent(indication)}&phase=${encodeURIComponent(phase)}`
      );
      const data = await response.json();
      
      if (data.message === "No matches found" || !data.metrics) {
        // toast call replaced
  // Original: toast({
          title: "No Matches Found",
          description: "No CSR data found for the selected indication and phase.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "No Matches Found",
          description: "No CSR data found for the selected indication and phase.",
          variant: "destructive"
        });
        setBenchmarkMetrics(null);
      } else {
        setBenchmarkMetrics(data.metrics);
        setCurrentTab('metrics');
        // toast call replaced
  // Original: toast({
          title: "Success",
          description: `Found ${data.metrics.total_trials} matching clinical trial(s)
  console.log('Toast would show:', {
          title: "Success",
          description: `Found ${data.metrics.total_trials} matching clinical trial(s)`,
        });
      }
    } catch (error) {
      console.error('Error fetching benchmark metrics:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to fetch CSR benchmark metrics.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to fetch CSR benchmark metrics.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to generate smart protocol draft
  const generateProtocolDraft = async () => {
    if (!benchmarkMetrics) {
      // toast call replaced
  // Original: toast({
        title: "Missing Metrics",
        description: "Please fetch benchmark metrics first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Metrics",
        description: "Please fetch benchmark metrics first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const topEndpoints = benchmarkMetrics.top_endpoints.map(([endpoint]) => endpoint);
      
      const response = await apiRequest(
        'POST',
        '/api/protocol/smart-draft',
        {
          indication,
          phase,
          top_endpoints: topEndpoints,
          sample_size: benchmarkMetrics.avg_sample_size,
          dropout: benchmarkMetrics.avg_dropout_rate
        }
      );
      
      const data = await response.json();
      
      if (data.protocol_draft) {
        setProtocolDraft(data.protocol_draft);
        setCurrentTab('draft');
        
        // Generate placeholder strategic summary
        setStrategicSummary(`# Strategic Intelligence Summary for ${indication} ${phase}

## Key Findings
- Average sample size of ${benchmarkMetrics.avg_sample_size} patients in similar trials
- Average dropout rate of ${benchmarkMetrics.avg_dropout_rate}%
- Most common endpoint: ${topEndpoints[0] || 'N/A'}

## Competitive Context
Based on analysis of ${benchmarkMetrics.total_trials} similar trials, the recommended approach 
aligns with industry best practices while incorporating evidence-based optimizations.

## Success Factors
- Proper sample size calculation accounting for expected dropout rate
- Clear primary endpoint definition
- Appropriate study design for the phase
- Rigorous patient selection criteria`);

        // Generate placeholder SAP section
        setSapSection(`# Statistical Analysis Plan for ${indication} ${phase}

## Primary Analysis
- Primary endpoint: ${topEndpoints[0] || 'TBD'}
- Analysis population: Intent-to-treat (ITT)
- Statistical method: Two-sided t-test with alpha = 0.05
- Sample size justification: Based on expected effect size of 0.3, power of 0.8

## Secondary Analyses
- Safety analysis: Adverse events will be summarized by severity and relatedness
- Exploratory analyses: Subgroup analyses by age and disease severity

## Handling Missing Data
- Primary approach: Multiple imputation
- Sensitivity analysis: Complete case analysis and LOCF

## Interim Analyses
- No interim analyses planned for efficacy
- Safety data will be reviewed periodically by an independent DSMB`);

        // toast call replaced
  // Original: toast({
          title: "Success",
          description: "Smart protocol draft generated successfully.",
        })
  console.log('Toast would show:', {
          title: "Success",
          description: "Smart protocol draft generated successfully.",
        });
      } else {
        // toast call replaced
  // Original: toast({
          title: "Error",
          description: "Failed to generate protocol draft.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Error",
          description: "Failed to generate protocol draft.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error generating protocol draft:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to generate protocol draft.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to generate protocol draft.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to export protocol draft as PDF
  const exportProtocolPDF = async () => {
    if (!protocolDraft) {
      // toast call replaced
  // Original: toast({
        title: "Missing Draft",
        description: "Please generate a protocol draft first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Draft",
        description: "Please generate a protocol draft first.",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await apiRequest(
        'POST',
        '/api/protocol/export-smart-pdf',
        {
          protocol_text: protocolDraft,
          protocol_id: `${indication}_${phase}`
        }
      );
      
      const data = await response.json();
      
      if (data.success && data.download_url) {
        // Open the download URL in a new tab
        window.open(data.download_url, '_blank');
        
        // toast call replaced
  // Original: toast({
          title: "Success",
          description: "Protocol draft PDF generated and ready for download.",
        })
  console.log('Toast would show:', {
          title: "Success",
          description: "Protocol draft PDF generated and ready for download.",
        });
      } else {
        // toast call replaced
  // Original: toast({
          title: "Error",
          description: "Failed to generate PDF.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Error",
          description: "Failed to generate PDF.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to export protocol draft as PDF.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to export protocol draft as PDF.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Function to export full bundle (Protocol + Strategic + SAP)
  const exportFullBundle = async () => {
    if (!protocolDraft || !strategicSummary || !sapSection) {
      // toast call replaced
  // Original: toast({
        title: "Missing Content",
        description: "Please generate all components first.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Content",
        description: "Please generate all components first.",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    try {
      const response = await apiRequest(
        'POST',
        '/api/export/full-bundle',
        {
          indication,
          phase,
          protocol_draft: protocolDraft,
          strategic_summary: strategicSummary,
          sap_section: sapSection
        }
      );
      
      const data = await response.json();
      
      if (data.success && data.pdf_url) {
        // Open the download URL in a new tab
        window.open(data.pdf_url, '_blank');
        
        // toast call replaced
  // Original: toast({
          title: "Success",
          description: "Full bundle generated and ready for download.",
        })
  console.log('Toast would show:', {
          title: "Success",
          description: "Full bundle generated and ready for download.",
        });
      } else {
        // toast call replaced
  // Original: toast({
          title: "Error",
          description: "Failed to generate bundle.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Error",
          description: "Failed to generate bundle.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error exporting bundle:', error);
      // toast call replaced
  // Original: toast({
        title: "Error",
        description: "Failed to export full bundle.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Error",
        description: "Failed to export full bundle.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="w-full max-w-5xl mx-auto shadow-md">
      <CardHeader>
        <CardTitle>Smart Protocol Design</CardTitle>
        <CardDescription>
          Generate evidence-based protocol drafts using CSR intelligence
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="indication">Medical Indication</Label>
              <Input
                id="indication"
                placeholder="e.g., Diabetes Mellitus Type 2"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phase">Clinical Trial Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger id="phase">
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {phaseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={getBenchmarkMetrics} 
              disabled={isLoading || !indication || !phase}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Loading Metrics
                </>
              ) : (
                'Get CSR Benchmarks'
              )}
            </Button>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="text-sm font-medium">Intelligence Workflow</div>
            <div className="flex flex-col space-y-2 text-sm">
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${benchmarkMetrics ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>1</div>
                <div>Collect CSR benchmark metrics</div>
              </div>
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${protocolDraft ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>2</div>
                <div>Generate smart protocol draft</div>
              </div>
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${strategicSummary ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>3</div>
                <div>Create strategic intelligence summary</div>
              </div>
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${sapSection ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>4</div>
                <div>Generate statistical analysis plan</div>
              </div>
            </div>
          </div>
        </div>

        {benchmarkMetrics && (
          <>
            <Separator className="my-4" />
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
              <TabsList className="grid grid-cols-4 mb-4">
                <TabsTrigger value="metrics">CSR Benchmarks</TabsTrigger>
                <TabsTrigger value="draft">Protocol Draft</TabsTrigger>
                <TabsTrigger value="strategic">Strategic Summary</TabsTrigger>
                <TabsTrigger value="sap">SAP Section</TabsTrigger>
              </TabsList>

              <TabsContent value="metrics" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Benchmark Summary</h3>
                    <dl className="grid grid-cols-2 gap-2">
                      <dt className="text-sm font-medium text-gray-500">CSRs Analyzed:</dt>
                      <dd className="text-sm font-medium">{benchmarkMetrics.total_trials}</dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Avg Sample Size:</dt>
                      <dd className="text-sm font-medium">{benchmarkMetrics.avg_sample_size || 'N/A'}</dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Avg Duration:</dt>
                      <dd className="text-sm font-medium">
                        {benchmarkMetrics.avg_duration_weeks ? `${benchmarkMetrics.avg_duration_weeks} weeks` : 'N/A'}
                      </dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Avg Dropout Rate:</dt>
                      <dd className="text-sm font-medium">
                        {benchmarkMetrics.avg_dropout_rate ? `${benchmarkMetrics.avg_dropout_rate}%` : 'N/A'}
                      </dd>
                    </dl>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-2">Top Endpoints</h3>
                    {benchmarkMetrics.top_endpoints && benchmarkMetrics.top_endpoints.length > 0 ? (
                      <ul className="space-y-1">
                        {benchmarkMetrics.top_endpoints.map(([endpoint, count], index) => (
                          <li key={index} className="flex items-center">
                            <Badge variant={index === 0 ? "default" : "outline"} className="mr-2">
                              {count}
                            </Badge>
                            <span className="text-sm">{endpoint}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No endpoint data available</p>
                    )}
                  </div>
                  
                  <div className="col-span-2">
                    <h3 className="text-lg font-medium mb-2">Matched Trial IDs</h3>
                    <div className="flex flex-wrap gap-2">
                      {benchmarkMetrics.matched_trial_ids && benchmarkMetrics.matched_trial_ids.length > 0 ? (
                        benchmarkMetrics.matched_trial_ids.map((id, index) => (
                          <Badge key={index} variant="secondary">{id}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No trial IDs available</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end mt-4">
                  <Button 
                    onClick={generateProtocolDraft} 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                        Generating
                      </>
                    ) : (
                      'Generate Protocol Draft'
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="draft">
                {protocolDraft ? (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-md">
                      <pre className="whitespace-pre-wrap text-sm">{protocolDraft}</pre>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="outline" 
                        onClick={exportProtocolPDF}
                        disabled={isExporting}
                      >
                        {isExporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="mr-2 h-4 w-4" />
                        )}
                        Export as PDF
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No protocol draft generated yet</p>
                    <Button 
                      variant="outline" 
                      className="mt-4" 
                      onClick={generateProtocolDraft}
                      disabled={isLoading || !benchmarkMetrics}
                    >
                      Generate Protocol Draft
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="strategic">
                {strategicSummary ? (
                  <div className="space-y-4">
                    <Textarea 
                      className="min-h-[300px] font-mono text-sm"
                      value={strategicSummary}
                      onChange={(e) => setStrategicSummary(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileCode className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No strategic summary available</p>
                    <Button 
                      variant="outline" 
                      className="mt-4" 
                      onClick={generateProtocolDraft}
                      disabled={isLoading || !benchmarkMetrics}
                    >
                      Generate Content
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sap">
                {sapSection ? (
                  <div className="space-y-4">
                    <Textarea 
                      className="min-h-[300px] font-mono text-sm"
                      value={sapSection}
                      onChange={(e) => setSapSection(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileCode className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No SAP section available</p>
                    <Button 
                      variant="outline" 
                      className="mt-4" 
                      onClick={generateProtocolDraft}
                      disabled={isLoading || !benchmarkMetrics}
                    >
                      Generate Content
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>

      {benchmarkMetrics && (
        <CardFooter className="flex justify-between border-t p-4">
          <Button variant="ghost" onClick={() => {
            setBenchmarkMetrics(null);
            setProtocolDraft('');
            setStrategicSummary('');
            setSapSection('');
          }}>
            Reset
          </Button>
          <Button 
            onClick={exportFullBundle}
            disabled={isExporting || !protocolDraft || !strategicSummary || !sapSection}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageOpen className="mr-2 h-4 w-4" />
            )}
            Export Design + Strategic + SAP Bundle
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default SmartProtocolPanel;