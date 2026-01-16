import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Badge, } from '@/components/ui';
import {
  Download, FileText, Microscope, Beaker, Users, PieChart, BarChart, Search, Filter, ChevronDown, Calendar, LineChart } from 'lucide-react'

export default function LumenBioReport() {
  const [selectedDrug, setSelectedDrug] = useState('all');
  const [selectedIndication, setSelectedIndication] = useState('all');
  const [selectedPhase, setSelectedPhase] = useState('all');

  // This would be a real API call in production
  const { data: reports, isLoading } = useQuery({
    queryKey: ['/api/reports/lumen-bio'],
    // Mock data for demo
    initialData: [
      {
        id: 'rep_001',
        title: 'LUM-1 Phase 2 Interim Analysis Report',
        drugName: 'LUM-1',
        date: '2025-04-01',
        phase: 'Phase 2',
        indication: 'Non-Small Cell Lung Cancer',
        status: 'Active',
        summary:
          'Interim analysis of LUM-1 Phase 2 trial showing promising efficacy signal in PD-L1 high expressing NSCLC patients with manageable safety profile.',
        fileType: 'Clinical Study Report',
        fileSize: '12MB',
      },
      {
        id: 'rep_002',
        title: 'Competitive Intelligence: Checkpoint Inhibitor Landscape',
        drugName: 'LUM-1',
        date: '2025-03-15',
        phase: 'Market Analysis',
        indication: 'Oncology',
        status: 'Completed',
        summary:
          'Comprehensive analysis of the checkpoint inhibitor competitive landscape with focus on NSCLC indications and combination approaches.',
        fileType: 'Market Report',
        fileSize: '8MB',
      },
      {
        id: 'rep_003',
        title: 'LUM-2 Phase 1 Clinical Protocol',
        drugName: 'LUM-2',
        date: '2025-03-05',
        phase: 'Phase 1',
        indication: 'Inflammatory Bowel Disease',
        status: 'Active',
        summary:
          'Detailed protocol for the first-in-human study of LUM-2, a dual cytokine inhibitor for IBD with novel mechanism of action.',
        fileType: 'Protocol',
        fileSize: '5MB',
      },
      {
        id: 'rep_004',
        title: 'LUM-3 Preclinical Data Review',
        drugName: 'LUM-3',
        date: '2025-02-20',
        phase: 'Preclinical',
        indication: "Alzheimer's Disease",
        status: 'Completed',
        summary:
          "Comprehensive review of preclinical efficacy and safety data for LUM-3, a tau protein modulator for Alzheimer's disease.",
        fileType: 'Research Report',
        fileSize: '15MB',
      },
      {
        id: 'rep_005',
        title: 'LUM-4 Phase 1/2 Protocol Amendment',
        drugName: 'LUM-4',
        date: '2025-02-10',
        phase: 'Phase 1/2',
        indication: 'B-Cell Lymphoma',
        status: 'Active',
        summary:
          'Protocol amendment for the ongoing Phase 1/2 study of LUM-4, a CD19-targeted CAR-T therapy for relapsed/refractory B-cell lymphoma.',
        fileType: 'Protocol Amendment',
        fileSize: '3MB',
      },
      {
        id: 'rep_006',
        title: 'Regulatory Strategy for LUM-5',
        drugName: 'LUM-5',
        date: '2025-01-25',
        phase: 'Preclinical',
        indication: 'Multiple Solid Tumors',
        status: 'Planning',
        summary:
          'Regulatory strategy document outlining the planned IND submission pathway for LUM-5, an RNA polymerase inhibitor for solid tumors.',
        fileType: 'Regulatory Document',
        fileSize: '6MB',
      },
      {
        id: 'rep_007',
        title: 'LUM-1 vs Competitor Drug Comparative Analysis',
        drugName: 'LUM-1',
        date: '2025-01-15',
        phase: 'Phase 2',
        indication: 'Non-Small Cell Lung Cancer',
        status: 'Completed',
        summary:
          'Detailed comparative analysis of LUM-1 vs leading competitor drugs in NSCLC, highlighting differentiation points and potential advantages.',
        fileType: 'Competitive Analysis',
        fileSize: '10MB',
      },
    ],
  });

  // Extract unique values for filters
  const drugs = reports ? Array.from(new Set(reports.map((r: any) => r.drugName))) : [];
  const indications = reports ? Array.from(new Set(reports.map((r: any) => r.indication))) : [];
  const phases = reports ? Array.from(new Set(reports.map((r: any) => r.phase))) : [];

  // Apply filters
  const filteredReports = reports
    ? reports.filter((report: any) => {
        const matchesDrug = selectedDrug === 'all' || report.drugName === selectedDrug;
        const matchesIndication =
          selectedIndication === 'all' || report.indication === selectedIndication;
        const matchesPhase = selectedPhase === 'all' || report.phase === selectedPhase;
        return matchesDrug && matchesIndication && matchesPhase;
      })
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 p-6 rounded-lg border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
              Lumen Bio Research Reports
            </h1>
            <p className="text-slate-600 mt-1">
              Comprehensive analytics and intelligence for Lumen Biosciences pipeline
            </p>
          </div>
          <div className="flex gap-3">
            <Button className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generate Report
            </Button>
            <Link href="/lumen-bio/dashboard">
              <Button variant="outline" className="flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar with filters */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 text-blue-600 mr-2" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Drug Candidate</label>
              <select
                className="w-full rounded-md border border-slate-200 p-2"
                value={selectedDrug}
                onChange={e => setSelectedDrug(e.target.value)}
              >
                <option value="all">All Drug Candidates</option>
                {drugs.map(drug => (
                  <option key={drug} value={drug}>
                    {drug}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Indication</label>
              <select
                className="w-full rounded-md border border-slate-200 p-2"
                value={selectedIndication}
                onChange={e => setSelectedIndication(e.target.value)}
              >
                <option value="all">All Indications</option>
                {indications.map(indication => (
                  <option key={indication} value={indication}>
                    {indication}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phase</label>
              <select
                className="w-full rounded-md border border-slate-200 p-2"
                value={selectedPhase}
                onChange={e => setSelectedPhase(e.target.value)}
              >
                <option value="all">All Phases</option>
                {phases.map(phase => (
                  <option key={phase} value={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center border rounded-md p-2">
                  <Calendar className="h-4 w-4 text-slate-400 mr-2" />
                  <span className="text-sm text-slate-500">From: Jan 1, 2025</span>
                </div>
                <div className="flex items-center border rounded-md p-2">
                  <Calendar className="h-4 w-4 text-slate-400 mr-2" />
                  <span className="text-sm text-slate-500">To: Apr 10, 2025</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button variant="outline" className="w-full">
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main content */}
        <div className="md:col-span-3 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>Research Reports</CardTitle>
                <div className="flex items-center">
                  <div className="relative mr-2">
                    <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search reports..."
                      className="pl-9 pr-4 py-2 w-64 border rounded-md text-sm"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <ChevronDown className="h-4 w-4" />
                    Sort
                  </Button>
                </div>
              </div>
              <CardDescription>
                Showing {filteredReports.length} research reports for Lumen Bio
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                  <h3 className="text-lg font-medium text-slate-700">No reports found</h3>
                  <p className="text-slate-500">Try adjusting your filters or search criteria</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredReports.map((report: any) => (
                    <div
                      key={report.id}
                      className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3">
                          {report.fileType.includes('Clinical') ? (
                            <Microscope className="h-10 w-10 text-indigo-500 mt-1" />
                          ) : report.fileType.includes('Market') ? (
                            <BarChart className="h-10 w-10 text-amber-500 mt-1" />
                          ) : report.fileType.includes('Protocol') ? (
                            <Beaker className="h-10 w-10 text-emerald-500 mt-1" />
                          ) : report.fileType.includes('Regulatory') ? (
                            <FileText className="h-10 w-10 text-rose-500 mt-1" />
                          ) : (
                            <FileText className="h-10 w-10 text-blue-500 mt-1" />
                          )}
                          <div>
                            <h3 className="font-medium text-lg">{report.title}</h3>
                            <div className="flex flex-wrap items-center text-sm text-slate-500 gap-2 mt-1">
                              <span>{report.date}</span>
                              <span>•</span>
                              <span>{report.drugName}</span>
                              <span>•</span>
                              <span>{report.indication}</span>
                              <Badge
                                variant={
                                  report.status === 'Active'
                                    ? 'default'
                                    : report.status === 'Completed'
                                      ? 'secondary'
                                      : 'outline'
                                }
                                className="ml-1"
                              >
                                {report.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">{report.summary}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button size="sm" variant="outline" className="gap-1">
                          <Download className="h-4 w-4" />
                          Download ({report.fileSize})
                        </Button>
                        <Link href={`/reports/${report.id}`}>
                          <Button size="sm">View Report</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center">
                <LineChart className="h-5 w-5 text-blue-600 mr-2" />
                Pipeline Progress Indicators
              </CardTitle>
              <CardDescription>
                Key success metrics and trend analysis for Lumen Bio pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="metrics" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="metrics">Performance Metrics</TabsTrigger>
                  <TabsTrigger value="comparative">Comparative Analysis</TabsTrigger>
                  <TabsTrigger value="trends">Success Trends</TabsTrigger>
                </TabsList>

                <TabsContent value="metrics" className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium">Milestone Achievement</h3>
                      <p className="text-3xl font-bold text-green-600">92%</p>
                      <p className="text-sm text-slate-500">
                        On-time milestone completion rate vs industry avg 76%
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium">Protocol Efficiency</h3>
                      <p className="text-3xl font-bold text-amber-600">+28%</p>
                      <p className="text-sm text-slate-500">
                        Fewer protocol amendments than industry standard
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium">Patient Enrollment</h3>
                      <p className="text-3xl font-bold text-blue-600">4.2 mo</p>
                      <p className="text-sm text-slate-500">
                        Median time to first patient vs industry avg 6.0 mo
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="comparative" className="pt-4">
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Lumen Bio's pipeline performance compared to similar biotech companies in the
                      oncology and immunology space.
                    </p>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-2">Comparative Trial Design Metrics</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Metric</th>
                            <th className="text-right py-2">Lumen Bio</th>
                            <th className="text-right py-2">Peer Avg</th>
                            <th className="text-right py-2">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2">Avg. Inclusion Criteria</td>
                            <td className="text-right">15</td>
                            <td className="text-right">22</td>
                            <td className="text-right text-green-600">-32%</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">Avg. Study Duration (months)</td>
                            <td className="text-right">18.4</td>
                            <td className="text-right">24.2</td>
                            <td className="text-right text-green-600">-24%</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">Primary Endpoint Success Rate</td>
                            <td className="text-right">68%</td>
                            <td className="text-right">52%</td>
                            <td className="text-right text-green-600">+31%</td>
                          </tr>
                          <tr>
                            <td className="py-2">Protocol Amendments per Trial</td>
                            <td className="text-right">1.4</td>
                            <td className="text-right">2.3</td>
                            <td className="text-right text-green-600">-39%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="trends" className="pt-4">
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Success trends and progression rates for Lumen Bio's pipeline candidates
                      compared to historical benchmarks.
                    </p>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-2">Phase Transition Success Rates</h3>

                      <div className="space-y-3 mt-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm">Preclinical to Phase 1</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Lumen Bio: 68%</span>
                              <span className="text-xs text-slate-500">Industry: 54%</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: '68%' }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm">Phase 1 to Phase 2</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Lumen Bio: 72%</span>
                              <span className="text-xs text-slate-500">Industry: 59%</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: '72%' }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm">Phase 2 to Phase 3</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Lumen Bio: 46%</span>
                              <span className="text-xs text-slate-500">Industry: 38%</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: '46%' }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-end">
              <Button variant="outline" className="gap-1">
                <Download className="h-4 w-4" />
                Export Analysis
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
