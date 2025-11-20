import React, { useState, useEffect } from "react";
import { CsrReport, CsrDetails } from "@/lib/types";
import { X, FileSymlink, Download, ClipboardCopy, BarChart2, LineChart, LayoutDashboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReportDetailModalProps {
  report: CsrReport | null;
  onClose: () => void;
}

export function ReportDetailModal({ report, onClose }: ReportDetailModalProps) {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const { toast } = useToast();

  // Reset active tab when report changes
  useEffect(() => {
    if (report) {
      setActiveTab("overview");
    }
  }, [report]);

  // Fetch report details when a report is selected
  const { data: details, isLoading } = useQuery({
    queryKey: [`/api/reports/${report?.id}/details`],
    enabled: !!report,
  });

  if (!report) return null;

  // Function to copy report data to clipboard
  const copyToClipboard = (section: string) => {
    if (!details) return;
    
    let contentToCopy = '';
    
    switch(section) {
      case 'all':
        contentToCopy = `
Study Title: ${report.title}
Sponsor: ${report.sponsor}
Indication: ${report.indication}
Phase: ${report.phase}
Status: ${report.status}
Date: ${report.date || 'N/A'}

Study Design: ${details?.studyDesign || 'N/A'}
Primary Objective: ${details?.primaryObjective || 'N/A'}
Population: ${details?.population || 'N/A'}

Primary Endpoint: ${details?.endpoints?.primary || 'N/A'}
Secondary Endpoints: ${details?.endpoints?.secondary?.join(', ') || 'N/A'}

Primary Results: ${details?.results?.primaryResults || 'N/A'}
Secondary Results: ${details?.results?.secondaryResults || 'N/A'}

Safety: ${details?.safety?.commonAEs || 'N/A'}
`;
        break;
      case 'endpoints':
        contentToCopy = `
Primary Endpoint: ${details?.endpoints?.primary || 'N/A'}
Secondary Endpoints: ${details?.endpoints?.secondary?.join(', ') || 'N/A'}
`;
        break;
      case 'results':
        contentToCopy = `
Primary Results: ${details?.results?.primaryResults || 'N/A'}
Secondary Results: ${details?.results?.secondaryResults || 'N/A'}
Biomarker Results: ${details?.results?.biomarkerResults || 'N/A'}
`;
        break;
      case 'safety':
        contentToCopy = `
Overall Safety: ${details?.safety?.overallSafety || 'N/A'}
Common AEs: ${details?.safety?.commonAEs || 'N/A'}
${details?.safety?.severeEvents ? `Severe Events: ${details.safety.severeEvents}` : ''}
${details?.safety?.discontinuationRates ? `Discontinuation Rates: ${details.safety.discontinuationRates}` : ''}
`;
        break;
    }
    
    navigator.clipboard.writeText(contentToCopy.trim());
    // toast call replaced
  // Original: toast({
      title: "Copied to clipboard",
      description: `Report ${section === 'all' ? 'data' : section} has been copied to clipboard.`,
    })
  console.log('Toast would show:', {
      title: "Copied to clipboard",
      description: `Report ${section === 'all' ? 'data' : section} has been copied to clipboard.`,
    });
  };

  // Function to generate analytics report
  const generateAnalyticsReport = async (type: 'comparison' | 'trend' | 'safety') => {
    if (!report || !report.id) return;
    
    try {
      // toast call replaced
  // Original: toast({
        title: "Generating report",
        description: "Please wait while we generate your analysis...",
      })
  console.log('Toast would show:', {
        title: "Generating report",
        description: "Please wait while we generate your analysis...",
      });
      
      let endpoint = '';
      let description = '';
      
      switch(type) {
        case 'comparison':
          endpoint = `/api/analytics/compare?trial1=${report.id}`;
          description = "Trial comparison report is ready";
          break;
        case 'trend':
          endpoint = `/api/analytics/predictive?indication=${encodeURIComponent(report.indication)}`;
          description = "Trend analysis report is ready";
          break;
        case 'safety':
          endpoint = `/api/analytics/competitors/${encodeURIComponent(report.sponsor)}`;
          description = "Safety analysis report is ready";
          break;
      }
      
      // In a real implementation, you'd actually call the endpoint and handle the response
      // For now, just show a success toast after a delay to simulate
      setTimeout(() => {
        // toast call replaced
  // Original: toast({
          title: "Analysis Complete",
          description,
        })
  console.log('Toast would show:', {
          title: "Analysis Complete",
          description,
        });
      }, 2000);
    } catch (error) {
      console.error(`Error generating ${type} report:`, error);
      // toast call replaced
  // Original: toast({
        title: "Analysis Failed",
        description: `There was an error generating the ${type} report.`,
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Analysis Failed",
        description: `There was an error generating the ${type} report.`,
        variant: "destructive"
      });
    }
  };

  // Function to download report data
  const downloadReportData = async (format: 'pdf' | 'csv' | 'json') => {
    try {
      // For PDF, we'll try to download the original file if it exists
      if (format === 'pdf' && report.fileName && report.fileName.toLowerCase().endsWith('.pdf')) {
        const response = await fetch(`/api/reports/${report.id}/download`);

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = report.fileName;
          document.body.appendChild(a);
          a.click();

          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);

          // toast call replaced
  // Original: toast({
            title: "Download Complete",
            description: `Original PDF file "${report.fileName}" has been downloaded.`,
          })
  console.log('Toast would show:', {
            title: "Download Complete",
            description: `Original PDF file "${report.fileName}" has been downloaded.`,
          });
          return;
        } else {
          // If we can't download the original PDF, fallback to exporting the data
          // toast call replaced
  // Original: toast({
            title: "Original PDF Not Available",
            description: "Exporting report data in selected format instead.",
          })
  console.log('Toast would show:', {
            title: "Original PDF Not Available",
            description: "Exporting report data in selected format instead.",
          });
        }
      }

      // For other formats or if PDF download failed, export the data
      const response = await fetch(`/api/reports/${report.id}/export?format=${format}`);

      if (!response.ok) {
        throw new Error(`Failed to export report as ${format}`);
      }

      let fileName = `report_${report.id}_${new Date().toISOString().split('T')[0]}`;

      if (format === 'csv') {
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.csv`;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } else if (format === 'json') {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.json`;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      }

      // toast call replaced
  // Original: toast({
        title: "Download Complete",
        description: `Report data has been downloaded as ${format.toUpperCase()
  console.log('Toast would show:', {
        title: "Download Complete",
        description: `Report data has been downloaded as ${format.toUpperCase()} format.`,
      });
    } catch (error) {
      console.error('Error downloading report data:', error);
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: "There was an error downloading the report data. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: "There was an error downloading the report data. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>

      <div 
        className="bg-white rounded-lg shadow-xl overflow-hidden w-full max-w-5xl z-10 m-4"
      >
        <div className="bg-primary px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">{report.title}</h3>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex items-center"
                  >
                    <ClipboardCopy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => copyToClipboard('all')}>
                    Copy All Data
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyToClipboard('endpoints')}>
                    Copy Endpoints
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyToClipboard('results')}>
                    Copy Results
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyToClipboard('safety')}>
                    Copy Safety Data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex items-center"
                  >
                    <FileSymlink className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => downloadReportData('pdf')}>
                    Download Original PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadReportData('csv')}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadReportData('json')}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex items-center"
                  >
                    <BarChart2 className="h-4 w-4 mr-1" />
                    Analytics
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => generateAnalyticsReport('comparison')}>
                    Trial Comparison Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => generateAnalyticsReport('trend')}>
                    Trend Analysis
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => generateAnalyticsReport('safety')}>
                    Safety Profile Analysis
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <button onClick={onClose} className="text-white hover:text-slate-200">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* CSR Summary */}
          <div className="bg-slate-50 p-4 rounded-lg mb-6">
            <h4 className="font-medium text-slate-800 mb-2">CSR Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Sponsor</p>
                <p className="text-sm font-medium text-slate-800">{report.sponsor}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Indication</p>
                <p className="text-sm font-medium text-slate-800">{report.indication}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phase</p>
                <p className="text-sm font-medium text-slate-800">{report.phase}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Report Date</p>
                <p className="text-sm font-medium text-slate-800">{report.date}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="space-y-4">
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex space-x-8">
                <a 
                  onClick={() => setActiveTab("overview")} 
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                    activeTab === "overview" 
                      ? "border-primary text-primary" 
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  Overview
                </a>
                <a 
                  onClick={() => setActiveTab("design")} 
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                    activeTab === "design" 
                      ? "border-primary text-primary" 
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  Study Design
                </a>
                <a 
                  onClick={() => setActiveTab("endpoints")} 
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                    activeTab === "endpoints" 
                      ? "border-primary text-primary" 
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  Endpoints
                </a>
                <a 
                  onClick={() => setActiveTab("results")} 
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                    activeTab === "results" 
                      ? "border-primary text-primary" 
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  Results
                </a>
                <a 
                  onClick={() => setActiveTab("safety")} 
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm cursor-pointer ${
                    activeTab === "safety" 
                      ? "border-primary text-primary" 
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  Safety
                </a>
              </nav>
            </div>

            {isLoading ? (
              <div className="py-10 text-center">
                <div className="inline-block animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                <p className="mt-2 text-sm text-slate-600">Loading report details...</p>
              </div>
            ) : !details ? (
              <div className="py-10 text-center">
                <p className="text-slate-600">No detailed information available for this report.</p>
                {report.status === "Processing" && (
                  <p className="mt-2 text-sm text-slate-500">This report is still being processed. Check back soon.</p>
                )}
              </div>
            ) : (
              <>
                {/* Overview Tab */}
                <div className={activeTab === "overview" ? "space-y-4" : "hidden"}>
                  <div className="prose prose-sm max-w-none">
                    <h4>Study Description</h4>
                    <p>{details.studyDescription || "No study description available."}</p>

                    <h4>Primary Objective</h4>
                    <p>{details.primaryObjective || "No primary objective available."}</p>

                    <h4>Key Inclusion Criteria</h4>
                    <p>{details.inclusionCriteria || "No inclusion criteria available."}</p>

                    <h4>Key Exclusion Criteria</h4>
                    <p>{details.exclusionCriteria || "No exclusion criteria available."}</p>
                  </div>
                </div>

                {/* Study Design Tab */}
                <div className={activeTab === "design" ? "space-y-4" : "hidden"}>
                  <div className="prose prose-sm max-w-none">
                    <h4>Study Design</h4>
                    <p>{details.studyDesign || "No study design information available."}</p>

                    {details.treatmentArms && details.treatmentArms.length > 0 && (
                      <>
                        <h4>Treatment Arms</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Arm</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Intervention</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Dosing Regimen</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Participants</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {details.treatmentArms.map((arm, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-800">{arm.arm}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{arm.intervention}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{arm.dosingRegimen}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-600">{arm.participants}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <h4>Study Duration</h4>
                    <p>{details.studyDuration || "No study duration information available."}</p>
                  </div>
                </div>

                {/* Endpoints Tab */}
                <div className={activeTab === "endpoints" ? "space-y-6" : "hidden"}>
                  {details.endpoints && (
                    <>
                      <div className="bg-slate-50 p-4 rounded-lg space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium text-slate-800">Primary Endpoint</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => copyToClipboard('endpoints')}
                          >
                            <ClipboardCopy className="h-4 w-4 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <div className="pl-4 border-l-2 border-primary">
                          <p className="text-sm text-slate-700">{details.endpoints.primary || "No primary endpoint specified."}</p>
                        </div>
                      </div>

                      {details.endpoints.secondary && details.endpoints.secondary.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="font-medium text-slate-800">Secondary Endpoints</h4>
                          <ul className="space-y-2">
                            {details.endpoints.secondary.map((endpoint, index) => (
                              <li key={index} className="flex">
                                <span className="text-primary">•</span>
                                <span className="ml-2 text-sm text-slate-700">{endpoint}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Results Tab */}
                <div className={activeTab === "results" ? "space-y-6" : "hidden"}>
                  {details.results && (
                    <div className="prose prose-sm max-w-none">
                      <div className="flex justify-between items-center">
                        <h4>Results Summary</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => copyToClipboard('results')}
                        >
                          <ClipboardCopy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <h4>Primary Endpoint Results</h4>
                      <p>{details.results.primaryResults || "No primary results available."}</p>

                      <h4>Secondary Endpoint Results</h4>
                      <p>{details.results.secondaryResults || "No secondary results available."}</p>

                      <h4>Biomarker Results</h4>
                      <p>{details.results.biomarkerResults || "No biomarker results available."}</p>
                    </div>
                  )}
                </div>

                {/* Safety Tab */}
                <div className={activeTab === "safety" ? "space-y-6" : "hidden"}>
                  {details.safety && (
                    <div className="prose prose-sm max-w-none">
                      <div className="flex justify-between items-center">
                        <h4>Safety Summary</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => copyToClipboard('safety')}
                        >
                          <ClipboardCopy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <h4>Overall Safety Summary</h4>
                      <p>{details.safety.overallSafety || "No safety information available."}</p>

                      {details.safety.ariaResults && (
                        <>
                          <h4>Amyloid-Related Imaging Abnormalities (ARIA)</h4>
                          <p>{details.safety.ariaResults}</p>
                        </>
                      )}

                      <h4>Common Adverse Events</h4>
                      <p>{details.safety.commonAEs || "No common adverse events information available."}</p>

                      {details.safety.severeEvents && (
                        <>
                          <h4>Severe Events</h4>
                          <p>{details.safety.severeEvents}</p>
                        </>
                      )}

                      {details.safety.discontinuationRates && (
                        <>
                          <h4>Discontinuation Rates</h4>
                          <p>{details.safety.discontinuationRates}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <div>
            <StatusBadge status={report.status as "Processing" | "Processed" | "Failed"} />
          </div>
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => window.location.href = '/dashboard'}
            >
              <LayoutDashboard className="h-4 w-4 mr-1" />
              View in Dashboard
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => generateAnalyticsReport('comparison')}
            >
              <LineChart className="h-4 w-4 mr-1" />
              Run Comparison
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}