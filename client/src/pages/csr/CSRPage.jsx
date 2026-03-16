import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, BarChart3, FileText, AlertTriangle, TrendingUp } from 'lucide-react';
import {
  generateNarrative,
  detectSignals,
  analyzeBenefitRisk,
  fetchDashboardMetrics,
} from '../../api/csr';
import UnifiedDocumentUpload from '../../components/unified/UnifiedDocumentUpload';

/**
 * CSR Deep Intelligence - AI-driven CSR analysis and generation tools
 */
const CSRPage = () => {
  const [loading, setLoading] = useState(false);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [narrativeInput, setNarrativeInput] = useState({
    studyId: '',
    patientId: '',
    eventDescription: '',
    medicalHistory: '',
    concomitantMeds: '',
  });

  const [signalInput, setSignalInput] = useState({
    drugName: '',
    dataSource: 'faers', // Default to FAERS database
    timeframe: 'last5years',
  });

  const [benefitRiskInput, setBenefitRiskInput] = useState({
    drugName: '',
    indication: '',
    efficacyData: '',
    safetyData: '',
  });

  const [narrativeResult, setNarrativeResult] = useState('');
  const [signalResults, setSignalResults] = useState([]);
  const [benefitRiskResult, setBenefitRiskResult] = useState({});

  // Load dashboard metrics on component mount
  useEffect(() => {
    const loadDashboardMetrics = async () => {
      try {
        const metrics = await fetchDashboardMetrics();
        setDashboardMetrics(metrics);
      } catch (error) {
        console.error('Error loading dashboard metrics:', error);
      }
    };
    loadDashboardMetrics();
  }, []);

  // Handle narrative generation
  const handleGenerateNarrative = async () => {
    setLoading(true);
    try {
      const data = await generateNarrative(narrativeInput);
      setNarrativeResult(data.narrative);
    } catch (error) {
      console.error('Error generating narrative:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle signal detection
  const handleDetectSignals = async () => {
    setLoading(true);
    try {
      const data = await detectSignals(signalInput);
      setSignalResults(data.signals);
    } catch (error) {
      console.error('Error detecting signals:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle benefit-risk analysis
  const handleBenefitRiskAnalysis = async () => {
    setLoading(true);
    try {
      const data = await analyzeBenefitRisk(benefitRiskInput);
      setBenefitRiskResult(data);
    } catch (error) {
      console.error('Error analyzing benefit-risk:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="csr-page-container p-4">
      <h1 className="text-2xl font-bold mb-6">CSR Deep Intelligence</h1>

      {/* Dashboard Overview */}
      {dashboardMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total CSRs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics.totalCsrs}</div>
              <p className="text-xs text-muted-foreground">
                {dashboardMetrics.source === 'database' ? 'Database' : 'In-Memory'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Areas</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics.uniqueStudies}</div>
              <p className="text-xs text-muted-foreground">Therapeutic areas covered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Phase Distribution</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardMetrics.phaseDistribution.reduce((sum, phase) => sum + phase.count, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Across all phases</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Area</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardMetrics.recentReports.length > 0
                  ? dashboardMetrics.recentReports[0].therapeutic_area ||
                    dashboardMetrics.recentReports[0].indication
                  : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">Most common area</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="dashboard">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="search">Search & Analytics</TabsTrigger>
          <TabsTrigger value="narrative">Narrative Generator</TabsTrigger>
          <TabsTrigger value="signals">AE Signal Detection</TabsTrigger>
          <TabsTrigger value="benefit-risk">Benefit-Risk Assessment</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Phase Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Phase Distribution</CardTitle>
                <CardDescription>Clinical trial phases in CSR database</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboardMetrics?.phaseDistribution?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardMetrics.phaseDistribution.map((phase, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm">{phase.phase}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${(phase.count / dashboardMetrics.totalCsrs) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{phase.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No phase data available</p>
                )}
              </CardContent>
            </Card>

            {/* Therapeutic Area Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Therapeutic Areas</CardTitle>
                <CardDescription>Distribution across therapeutic areas</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboardMetrics?.recentReports?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardMetrics.recentReports.slice(0, 5).map((area, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm capitalize">
                          {area.therapeutic_area || area.indication}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{
                                width: `${(area.count / dashboardMetrics.totalCsrs) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{area.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No area data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Search & Analytics Tab */}
        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>Advanced CSR Search</CardTitle>
              <CardDescription>
                Search through {dashboardMetrics?.totalCsrs || 0} CSR reports with advanced
                filtering
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="search-query">Search Query</Label>
                    <Input id="search-query" placeholder="Enter search terms..." className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="phase-filter">Phase</Label>
                    <Select>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All phases" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Phases</SelectItem>
                        <SelectItem value="Phase I">Phase I</SelectItem>
                        <SelectItem value="Phase II">Phase II</SelectItem>
                        <SelectItem value="Phase III">Phase III</SelectItem>
                        <SelectItem value="Phase IV">Phase IV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="area-filter">Therapeutic Area</Label>
                    <Select>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All areas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Areas</SelectItem>
                        <SelectItem value="oncology">Oncology</SelectItem>
                        <SelectItem value="cardiology">Cardiology</SelectItem>
                        <SelectItem value="neurology">Neurology</SelectItem>
                        <SelectItem value="immunology">Immunology</SelectItem>
                        <SelectItem value="endocrinology">Endocrinology</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  Search CSR Database
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Narrative Generator Tab */}
        <TabsContent value="narrative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Case Narrative Generator</CardTitle>
                <CardDescription>Generate patient case narratives for your CSR</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-medium">Study ID</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={narrativeInput.studyId}
                        onChange={e =>
                          setNarrativeInput(prev => ({ ...prev, studyId: e.target.value }))
                        }
                        placeholder="e.g., ABC-123"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium">Patient ID</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={narrativeInput.patientId}
                        onChange={e =>
                          setNarrativeInput(prev => ({ ...prev, patientId: e.target.value }))
                        }
                        placeholder="e.g., P-001"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Event Description</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="3"
                      value={narrativeInput.eventDescription}
                      onChange={e =>
                        setNarrativeInput(prev => ({ ...prev, eventDescription: e.target.value }))
                      }
                      placeholder="Describe the adverse event"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Medical History</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="3"
                      value={narrativeInput.medicalHistory}
                      onChange={e =>
                        setNarrativeInput(prev => ({ ...prev, medicalHistory: e.target.value }))
                      }
                      placeholder="Patient's relevant medical history"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Concomitant Medications</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="3"
                      value={narrativeInput.concomitantMeds}
                      onChange={e =>
                        setNarrativeInput(prev => ({ ...prev, concomitantMeds: e.target.value }))
                      }
                      placeholder="Any medications the patient was taking"
                    />
                  </div>

                  <Button onClick={handleGenerateNarrative} disabled={loading} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Narrative'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generated Narrative</CardTitle>
                <CardDescription>AI-generated patient case narrative</CardDescription>
              </CardHeader>
              <CardContent>
                {narrativeResult ? (
                  <div className="p-4 border rounded bg-white">
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: narrativeResult.replace(/\n/g, '<br/>') }}
                    />
                  </div>
                ) : (
                  <div className="text-center p-6 border rounded bg-gray-50">
                    <p className="text-gray-500">Generated narrative will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Signal Detection Tab */}
        <TabsContent value="signals">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Adverse Event Signal Detection</CardTitle>
                <CardDescription>
                  Identify potential safety signals for your product
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 font-medium">Drug Name</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={signalInput.drugName}
                      onChange={e =>
                        setSignalInput(prev => ({ ...prev, drugName: e.target.value }))
                      }
                      placeholder="e.g., Acetaminophen"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Data Source</label>
                    <select
                      className="w-full p-2 border rounded"
                      value={signalInput.dataSource}
                      onChange={e =>
                        setSignalInput(prev => ({ ...prev, dataSource: e.target.value }))
                      }
                    >
                      <option value="faers">FDA Adverse Event Reporting System (FAERS)</option>
                      <option value="eudravigilance">EudraVigilance (EU)</option>
                      <option value="vaers">Vaccine Adverse Event Reporting System (VAERS)</option>
                      <option value="literature">Published Literature</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Timeframe</label>
                    <select
                      className="w-full p-2 border rounded"
                      value={signalInput.timeframe}
                      onChange={e =>
                        setSignalInput(prev => ({ ...prev, timeframe: e.target.value }))
                      }
                    >
                      <option value="last1year">Last 1 Year</option>
                      <option value="last5years">Last 5 Years</option>
                      <option value="last10years">Last 10 Years</option>
                      <option value="alltime">All Time</option>
                    </select>
                  </div>

                  <Button onClick={handleDetectSignals} disabled={loading} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Detect Signals'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detected Signals</CardTitle>
                <CardDescription>Potential safety signals identified</CardDescription>
              </CardHeader>
              <CardContent>
                {signalResults.length > 0 ? (
                  <div className="space-y-3">
                    {signalResults.map((signal, index) => (
                      <div key={index} className="p-3 border rounded bg-white">
                        <div className="flex items-start">
                          <div
                            className={`w-2 h-2 mt-1.5 rounded-full mr-2 ${
                              signal.signalStrength === 'strong'
                                ? 'bg-red-500'
                                : signal.signalStrength === 'moderate'
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500'
                            }`}
                          />
                          <div>
                            <h3 className="font-medium">{signal.eventTerm}</h3>
                            <div className="mt-1 text-sm">
                              <div className="flex justify-between">
                                <span>Reports: {signal.reportCount}</span>
                                <span
                                  className={
                                    signal.signalStrength === 'strong'
                                      ? 'text-red-600'
                                      : signal.signalStrength === 'moderate'
                                        ? 'text-yellow-600'
                                        : 'text-blue-600'
                                  }
                                >
                                  {signal.signalStrength.charAt(0).toUpperCase() +
                                    signal.signalStrength.slice(1)}
                                </span>
                              </div>
                              <p className="mt-1">{signal.description}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6 border rounded bg-gray-50">
                    <p className="text-gray-500">Detected signals will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Benefit-Risk Tab */}
        <TabsContent value="benefit-risk">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Benefit-Risk Assessment</CardTitle>
                <CardDescription>Analyze the benefit-risk profile of your product</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 font-medium">Drug Name</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={benefitRiskInput.drugName}
                      onChange={e =>
                        setBenefitRiskInput(prev => ({ ...prev, drugName: e.target.value }))
                      }
                      placeholder="e.g., Acetaminophen"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Indication</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={benefitRiskInput.indication}
                      onChange={e =>
                        setBenefitRiskInput(prev => ({ ...prev, indication: e.target.value }))
                      }
                      placeholder="e.g., Pain Relief"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Efficacy Data</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="4"
                      value={benefitRiskInput.efficacyData}
                      onChange={e =>
                        setBenefitRiskInput(prev => ({ ...prev, efficacyData: e.target.value }))
                      }
                      placeholder="Summarize key efficacy findings"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Safety Data</label>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows="4"
                      value={benefitRiskInput.safetyData}
                      onChange={e =>
                        setBenefitRiskInput(prev => ({ ...prev, safetyData: e.target.value }))
                      }
                      placeholder="Summarize key safety findings"
                    />
                  </div>

                  <Button onClick={handleBenefitRiskAnalysis} disabled={loading} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Analyze Benefit-Risk'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Benefit-Risk Summary</CardTitle>
                <CardDescription>AI-generated benefit-risk analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(benefitRiskResult).length > 0 ? (
                  <div className="space-y-4">
                    <div className="p-3 border rounded bg-white">
                      <h3 className="font-medium mb-2">Benefit Summary</h3>
                      <p>{benefitRiskResult.benefitSummary}</p>
                    </div>

                    <div className="p-3 border rounded bg-white">
                      <h3 className="font-medium mb-2">Risk Summary</h3>
                      <p>{benefitRiskResult.riskSummary}</p>
                    </div>

                    <div className="p-3 border rounded bg-white">
                      <h3 className="font-medium mb-2">Overall Assessment</h3>
                      <p>{benefitRiskResult.overallAssessment}</p>
                    </div>

                    {benefitRiskResult.recommendations && (
                      <div className="p-3 border rounded bg-white">
                        <h3 className="font-medium mb-2">Recommendations</h3>
                        <ul className="list-disc pl-5 space-y-1">
                          {benefitRiskResult.recommendations.map((rec, index) => (
                            <li key={index}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 border rounded bg-gray-50">
                    <p className="text-gray-500">Benefit-risk analysis will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CSRPage;
