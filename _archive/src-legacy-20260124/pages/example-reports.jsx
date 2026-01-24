// /client/pages/example-reports.jsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  FileSpreadsheet, 
  FileText, 
  Package, 
  BarChart4, 
  Download, 
  ExternalLink, 
  Presentation, 
  FileBarChart,
  LayoutDashboard
} from "lucide-react";
import axios from "axios";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import SessionSummaryPanel from "@/components/SessionSummaryPanel";

// Export Everything Button Component
function ExportEverythingButton({ sessionId }) {
  const [status, setStatus] = useState("");
  const { toast } = useToast();

  const handleExport = async () => {
    setStatus("📦 Generating export...");
    // toast call replaced
  // Original: toast({
      title: "Preparing Complete Export",
      description: "Generating all intelligence files into a single bundle..."
    })
  console.log('Toast would show:', {
      title: "Preparing Complete Export",
      description: "Generating all intelligence files into a single bundle..."
    });
    
    try {
      const res = await fetch(`/api/export/regulatory-bundle/${sessionId}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sessionId}_regulatory_ready_bundle.zip`;
        link.click();
        setStatus("✅ Export complete.");
        
        // toast call replaced
  // Original: toast({
          title: "Export Complete",
          description: "All intelligence files have been packaged and downloaded."
        })
  console.log('Toast would show:', {
          title: "Export Complete",
          description: "All intelligence files have been packaged and downloaded."
        });
      } else {
        setStatus("❌ Failed to generate export.");
        // toast call replaced
  // Original: toast({
          title: "Export Failed",
          description: "There was an error generating the complete export bundle.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Export Failed",
          description: "There was an error generating the complete export bundle.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Export failed.");
      // toast call replaced
  // Original: toast({
        title: "Export Error",
        description: "An unexpected error occurred during export.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Error",
        description: "An unexpected error occurred during export.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="mt-4">
      <Button
        onClick={handleExport}
        className="bg-green-600 hover:bg-green-700 text-white w-full"
      >
        📦 Export All Intelligence Files
      </Button>
      {status && <p className="text-xs text-muted-foreground mt-1">{status}</p>}
    </div>
  );
}

// Demo constant - replace with real data when available
const DEMO_SESSION_ID = "DEMO12345";

// Featured reports to highlight at the top
const FEATURED_REPORTS = [
  {
    id: "protocol-summary",
    title: "Protocol Intelligence Summary",
    description: "Complete planning intelligence with critical success factors and regulatory considerations",
    icon: <FileText className="h-8 w-8 text-blue-500" />,
    type: "PDF",
    size: "2.3 MB",
    demoUrl: "/static/example_reports/planner/protocol_summary.pdf",
    persona: "planner"
  },
  {
    id: "summary-packet",
    title: "Comprehensive Summary Packet",
    description: "Regulatory-ready bundled documentation with branded cover page",
    icon: <Package className="h-8 w-8 text-green-500" />,
    type: "ZIP",
    size: "5.1 MB",
    demoUrl: "/static/example_reports/regulatory/summary_packet.zip",
    persona: "regulatory"
  },
  {
    id: "dropout-forecast",
    title: "Advanced Dropout Forecast & Mitigation",
    description: "AI-powered analysis with visualization and mitigation recommendations",
    icon: <BarChart4 className="h-8 w-8 text-purple-500" />,
    type: "PDF",
    size: "1.8 MB",
    demoUrl: "/static/example_reports/statistician/dropout_forecast.pdf", 
    persona: "statistician"
  }
];

// Live demos to show the actual interface
const LIVE_DEMOS = [
  {
    id: "protocol-dashboard",
    title: "Protocol Planning Dashboard",
    description: "The complete planning intelligence dashboard with all export options",
    path: "/protocol-intelligence?persona=planner&session_id=DEMO12345",
    icon: <LayoutDashboard className="h-6 w-6 text-blue-500" />,
    persona: "planner"
  },
  {
    id: "statistical-exports",
    title: "Statistical Intelligence Suite",
    description: "Advanced statistical modeling with export capabilities",
    path: "/statistical-modeling?session_id=DEMO12345",
    icon: <FileBarChart className="h-6 w-6 text-purple-500" />,
    persona: "statistician"
  },
  {
    id: "regulatory-bundle",
    title: "Regulatory Bundle Generator",
    description: "Create and export complete regulatory documentation",
    path: "/reports?persona=regulatory&session_id=DEMO12345",
    icon: <Presentation className="h-6 w-6 text-green-500" />,
    persona: "regulatory"
  }
];

export default function ExampleReportsPage() {
  const [reportIndex, setReportIndex] = useState([]);
  const [reportManifests, setReportManifests] = useState({});
  const [launchConfig, setLaunchConfig] = useState({});
  const [activeTab, setActiveTab] = useState("featured");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const loadReports = async () => {
      try {
        const indexRes = await axios.get("/static/example_reports/report_index.json");
        setReportIndex(indexRes.data.available_subscriptions || []);

        const launchRes = await axios.get("/launch_config.json");
        setLaunchConfig(launchRes.data || {});

        for (const sub of indexRes.data.available_subscriptions) {
          try {
            const manifestRes = await axios.get(sub.path);
            setReportManifests(prev => ({ ...prev, [sub.persona]: manifestRes.data }));
          } catch (err) {
            console.error("Error loading report manifest:", err);
          }
        }
      } catch (err) {
        console.error("Error loading report data:", err);
        // If we can't load real data, we'll still show our featured reports as demos
      }
    };
    loadReports();
  }, []);

  const handleLaunch = (persona) => {
    const config = launchConfig[persona];
    if (!config) {
      // toast call replaced
  // Original: toast({
        title: "Demo Configuration Not Found",
        description: "This demo is still being set up. Please try another option.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Demo Configuration Not Found",
        description: "This demo is still being set up. Please try another option.",
        variant: "destructive"
      });
      return;
    }
    navigate(`${config.route}&study_id=${config.study_id}`);
  };

  const handleDownloadDemo = (url, title) => {
    setIsLoading(true);
    
    // toast call replaced
  // Original: toast({
      title: "Preparing Download",
      description: `Getting your ${title} ready...`
    })
  console.log('Toast would show:', {
      title: "Preparing Download",
      description: `Getting your ${title} ready...`
    });
    
    // Simulate a download delay
    setTimeout(() => {
      setIsLoading(false);
      
      // On a real implementation this would be a real download link
      window.open(url, '_blank');
      
      // toast call replaced
  // Original: toast({
        title: "Download Ready",
        description: `Your ${title} is ready to view`
      })
  console.log('Toast would show:', {
        title: "Download Ready",
        description: `Your ${title} is ready to view`
      });
    }, 1500);
  };

  const handleOpenLiveDemo = (path) => {
    navigate(path);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Demo Session Summary Panel */}
      <div className="bg-slate-50 rounded-lg border p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Demo Session Details</h2>
        <SessionSummaryPanel sessionId={DEMO_SESSION_ID} isDemoMode={true} />
      </div>
      
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 text-transparent bg-clip-text">
          LumenTrialGuide.AI Intelligence Suite
        </h1>
        <p className="text-muted-foreground mt-2">
          Explore our comprehensive intelligence outputs and export features that transform clinical trial design
        </p>
      </div>

      <Tabs defaultValue="featured" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="featured">Featured Reports</TabsTrigger>
          <TabsTrigger value="live-demos">Live Demos</TabsTrigger>
          <TabsTrigger value="all-reports">All Reports</TabsTrigger>
        </TabsList>
        
        {/* FEATURED REPORTS TAB */}
        <TabsContent value="featured" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURED_REPORTS.map(report => (
              <Card key={report.id} className="overflow-hidden transition-all hover:shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{report.title}</CardTitle>
                      <CardDescription className="mt-1">{report.description}</CardDescription>
                    </div>
                    <div className="rounded-full bg-slate-100 p-2">
                      {report.icon}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center mt-1 mb-3">
                    <Badge variant="outline" className="mr-2">{report.type}</Badge>
                    <span className="text-xs text-muted-foreground">{report.size}</span>
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50 flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownloadDemo(report.demoUrl, report.title)}
                    disabled={isLoading}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Example
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => handleLaunch(report.persona)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Generate My Own
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          
          <div className="mt-10">
            <div className="flex items-center mb-4">
              <FileSpreadsheet className="h-5 w-5 mr-2 text-blue-600" />
              <h2 className="text-xl font-semibold">Intelligence Export Features</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg">Summary Packet Export</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Complete bundle of intelligence outputs with branded cover page, ready for stakeholder distribution.</p>
                  <div className="mt-3 flex items-center">
                    <img src="/static/demo/summary_packet_preview.png" alt="Summary Packet Preview" className="w-full rounded border" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-3">
                  <Badge variant="outline">PDF + DOCX</Badge>
                  <Button variant="outline" size="sm">View Example</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg">IND Module 2.5 Text</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Auto-generated text for IND Module 2.5 Clinical Overview section with proper formatting.</p>
                  <div className="mt-3 flex items-center">
                    <img src="/static/demo/ind_summary_preview.png" alt="IND Summary Preview" className="w-full rounded border" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-3">
                  <Badge variant="outline">DOCX</Badge>
                  <Button variant="outline" size="sm">View Example</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg">Regulatory Bundle</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Comprehensive package of all regulatory-required documents with trace logs and audit trail.</p>
                  <div className="mt-3 flex items-center">
                    <img src="/static/demo/regulatory_bundle_preview.png" alt="Regulatory Bundle Preview" className="w-full rounded border" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-3">
                  <Badge variant="outline">ZIP Archive</Badge>
                  <Button variant="outline" size="sm">View Example</Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* LIVE DEMOS TAB */}
        <TabsContent value="live-demos" className="mt-6">
          <div className="rounded-lg bg-slate-50 border p-4 mb-6">
            <h3 className="font-medium text-slate-900">Live Demo Environment</h3>
            <p className="text-sm text-slate-600 mt-1">Experience our full interface with pre-loaded demo data. Explore, interact, and test all export features.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LIVE_DEMOS.map(demo => (
              <Card key={demo.id} className="transition-all hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    {demo.icon}
                    <div>
                      <CardTitle className="text-lg">{demo.title}</CardTitle>
                      <CardDescription className="mt-1">{demo.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <img 
                    src={`/static/demo/${demo.id}_preview.png`} 
                    alt={`${demo.title} preview`} 
                    className="w-full h-32 object-cover rounded border my-3"
                  />
                </CardContent>
                <CardFooter className="bg-slate-50 flex justify-end">
                  <Button 
                    onClick={() => handleOpenLiveDemo(demo.path)}
                    className="w-full"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Live Demo
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        {/* ALL REPORTS TAB */}
        <TabsContent value="all-reports" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {reportIndex.map(({ persona, title }) => {
              const manifest = reportManifests[persona];
              return (
                <Card key={persona} className="bg-white shadow-sm border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl">{title}</CardTitle>
                    {manifest && (
                      <>
                        <CardDescription>{manifest.description}</CardDescription>
                        {manifest.blurb && (
                          <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-100">
                            <p className="text-sm text-blue-800">{manifest.blurb}</p>
                          </div>
                        )}
                        {manifest.insights && manifest.insights.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {manifest.insights.map((insight, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                              >
                                {insight}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </CardHeader>
                  <CardContent className="pb-3">
                    {manifest && (
                      <>
                        <h3 className="text-sm font-medium mb-2">Included Reports:</h3>
                        <ul className="text-sm list-disc pl-4 mb-4 space-y-1">
                          {Array.isArray(manifest.includes) ? manifest.includes.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          )) : null}
                        </ul>
                        <div className="space-y-2">
                          {Array.isArray(manifest.files) ? manifest.files.map((file, i) => (
                            <div key={i} className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">{file}</span>
                              <a
                                href={`/static/example_reports/${persona}/${file}`}
                                className="text-blue-600 hover:underline text-sm flex items-center"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="h-3.5 w-3.5 mr-1" /> Download
                              </a>
                            </div>
                          )) : null}
                        </div>
                      </>
                    )}
                  </CardContent>
                  <CardFooter className="bg-slate-50 flex justify-end">
                    <Button variant="default" onClick={() => handleLaunch(persona)}>
                      ⚙️ Generate My Own
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}