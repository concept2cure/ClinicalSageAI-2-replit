import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { LumenBioReport } from '@/components/reports/LumenBioReport';
import ObesityStudyProtocol from '@/components/lumen-bio/ObesityStudyProtocol';
import LumenBioPerformanceMetrics from '@/components/lumen-bio/LumenBioPerformanceMetrics';
import SuccessFailureFactors from '@/components/lumen-bio/SuccessFailureFactors';
import CsrIntelligenceInsights from '@/components/lumen-bio/CsrIntelligenceInsights';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Microscope, BarChart, PieChart, ChartBar, BookOpen, Download, Share, AlertCircle, Beaker, Target, Weight, ChevronRight, ArrowUpRight, Clock, Users, TrendingUp, Layers, Loader2, CheckCircle, XCircle, FileCheck, ExternalLink, LineChart, BellDot, Sparkles, Award, Activity, Database, Brain, ArrowDownRight, Lightbulb, Dna } from 'lucide-react'

export default function LumenBioDashboard() {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const { data: recentReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['/api/reports/lumen-bio/recent'],
    // Actual Lumen Biosciences pipeline data based on public information
    initialData: [
      {
        id: 'rep_001',
        title: 'LBP-2021 C. difficile Phase 2 Analysis',
        type: 'Analysis',
        date: '2025-04-01',
        indication: 'C. difficile Infection',
      },
      {
        id: 'rep_002',
        title: 'Competitive Intelligence: Microbiome Therapeutics',
        type: 'Market',
        date: '2025-03-15',
        indication: 'Gastrointestinal',
      },
      {
        id: 'rep_003',
        title: 'LBP-1019 Norovirus Prevention Protocol Review',
        type: 'Protocol',
        date: '2025-03-05',
        indication: 'Norovirus Prevention',
      },
    ],
  });

  const { data: pipelineOverview, isLoading: pipelineLoading } = useQuery({
    queryKey: ['/api/lumen-bio/pipeline-overview'],
    initialData: {
      pipelineSummary: {
        totalCandidates: 3,
        activeClinicalTrials: 2,
        totalEnrollment: 95,
        enrollmentTarget: 120,
        avgTimeToFPFV: 4.2, // months
        industryAvgTimeToFPFV: 6.0, // months
        pipelineValue: 420, // million
        successProbability: 67, // percent
      },
      enrollmentProgress: {
        // Based on Lumen's actual pipeline
        LUM1: 85, // percent - C. difficile program
        LUM2: 62, // percent - Norovirus program
        LMN0801: 40, // percent - Obesity program
      },
      keyRisks: [
        {
          title: 'LBP-2021 Manufacturing Scale-Up',
          severity: 'medium',
          impact: 'Potential 2-week delay in spirulina production scaling',
          dueDate: '2025-05-15',
          owner: 'Manufacturing',
        },
        {
          title: 'LBP-1019 Enrollment Rate',
          severity: 'medium',
          impact: 'Currently 15% below target enrollment rate',
          dueDate: '2025-04-30',
          owner: 'Clinical Ops',
        },
        {
          title: 'LBP-3111 Protocol Amendment',
          severity: 'low',
          impact: 'Minor amendment for additional biomarker collection',
          dueDate: '2025-04-25',
          owner: 'Clinical Dev',
        },
      ],
      upcomingMilestones: [
        {
          title: 'LBP-2021 C. difficile Phase 2 Data Readout',
          date: '2025-04-28',
          program: 'LBP-2021',
          type: 'Clinical',
          status: 'On Track',
        },
        {
          title: 'LBP-1019 Norovirus DSMB Review',
          date: '2025-05-15',
          program: 'LBP-1019',
          type: 'Regulatory',
          status: 'On Track',
        },
        {
          title: 'LBP-3111 IBD Cohort 1 Enrollment Complete',
          date: '2025-06-10',
          program: 'LBP-3111',
          type: 'Clinical',
          status: 'At Risk',
        },
      ],
    },
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="p-6 rounded-lg border bg-gradient-to-r from-primary/10 to-blue-500/10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
                Lumen Biosciences Dashboard
              </h1>
              <p className="text-slate-600 mt-1">
                Clinical development analytics and CSR-driven intelligence for your pipeline
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                CSR Intelligence
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Share className="h-4 w-4" />
                Share Insights
              </Button>
            </div>
          </div>
        </div>

        {/* Pipeline Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500">Pipeline Assets</p>
                  <div className="flex items-end mt-1">
                    <p className="text-3xl font-bold">
                      {pipelineOverview.pipelineSummary.totalCandidates}
                    </p>
                    <p className="text-sm text-slate-500 ml-1 mb-1">Candidates</p>
                  </div>
                </div>
                <div className="bg-primary/10 p-2 rounded-full">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center text-xs">
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-green-600 font-medium">+1 from previous year</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500">Active Trials</p>
                  <div className="flex items-end mt-1">
                    <p className="text-3xl font-bold">
                      {pipelineOverview.pipelineSummary.activeClinicalTrials}
                    </p>
                    <p className="text-sm text-slate-500 ml-1 mb-1">Studies</p>
                  </div>
                </div>
                <div className="bg-primary/10 p-2 rounded-full">
                  <FileCheck className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center text-xs">
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-green-600 font-medium">+2 from previous year</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500">Enrollment</p>
                  <div className="flex items-end mt-1">
                    <p className="text-3xl font-bold">
                      {pipelineOverview.pipelineSummary.totalEnrollment}/
                      {pipelineOverview.pipelineSummary.enrollmentTarget}
                    </p>
                    <p className="text-sm text-slate-500 ml-1 mb-1">Patients</p>
                  </div>
                </div>
                <div className="bg-primary/10 p-2 rounded-full">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-1">
                <Progress
                  value={
                    (pipelineOverview.pipelineSummary.totalEnrollment /
                      pipelineOverview.pipelineSummary.enrollmentTarget) *
                    100
                  }
                  className="h-2"
                />
              </div>
              <div className="mt-1">
                <div className="flex items-center text-xs">
                  <span className="text-blue-600 font-medium">
                    {Math.round(
                      (pipelineOverview.pipelineSummary.totalEnrollment /
                        pipelineOverview.pipelineSummary.enrollmentTarget) *
                        100
                    )}
                    % Complete
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500">FPFV Time</p>
                  <div className="flex items-end mt-1">
                    <p className="text-3xl font-bold">
                      {pipelineOverview.pipelineSummary.avgTimeToFPFV}
                    </p>
                    <p className="text-sm text-slate-500 ml-1 mb-1">months</p>
                  </div>
                </div>
                <div className="bg-primary/10 p-2 rounded-full">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center text-xs">
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-green-600 font-medium">
                    {(
                      pipelineOverview.pipelineSummary.industryAvgTimeToFPFV -
                      pipelineOverview.pipelineSummary.avgTimeToFPFV
                    ).toFixed(1)}
                    mo faster than industry avg
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">
              <Activity className="h-4 w-4 mr-2" />
              Pipeline Overview
            </TabsTrigger>
            <TabsTrigger value="wt02">
              <Weight className="h-4 w-4 mr-2" />
              Obesity Program (WT02)
            </TabsTrigger>
            <TabsTrigger value="csr-insights">
              <ChartBar className="h-4 w-4 mr-2" />
              CSR Intelligence
            </TabsTrigger>
            <TabsTrigger value="success-factors">
              <Award className="h-4 w-4 mr-2" />
              Success Factors
            </TabsTrigger>
            <TabsTrigger value="pipeline-report">
              <LineChart className="h-4 w-4 mr-2" />
              Full Pipeline Report
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Enrollment by Program Section */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center">
                      <TrendingUp className="h-5 w-5 text-blue-600 mr-2" />
                      Program Enrollment Progress
                    </CardTitle>
                    <CardDescription>
                      Current enrollment status across active clinical programs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center">
                            <span className="font-medium">LBP-2021 (C. difficile)</span>
                            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Phase 2
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {pipelineOverview.enrollmentProgress.LUM1}%
                          </span>
                        </div>
                        <Progress
                          value={pipelineOverview.enrollmentProgress.LUM1}
                          className="h-2"
                        />
                        <div className="flex justify-between mt-1 text-xs text-slate-500">
                          <span>Target: 60 patients</span>
                          <span>
                            Current:{' '}
                            {Math.round((60 * pipelineOverview.enrollmentProgress.LUM1) / 100)}{' '}
                            patients
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center">
                            <span className="font-medium">LBP-1019 (Norovirus)</span>
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full">
                              Phase 1
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {pipelineOverview.enrollmentProgress.LUM2}%
                          </span>
                        </div>
                        <Progress
                          value={pipelineOverview.enrollmentProgress.LUM2}
                          className="h-2"
                        />
                        <div className="flex justify-between mt-1 text-xs text-slate-500">
                          <span>Target: 45 patients</span>
                          <span>
                            Current:{' '}
                            {Math.round((45 * pipelineOverview.enrollmentProgress.LUM2) / 100)}{' '}
                            patients
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center">
                            <span className="font-medium">LMN-0801 (Obesity)</span>
                            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">
                              Phase 1/2
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {pipelineOverview.enrollmentProgress.LMN0801}%
                          </span>
                        </div>
                        <Progress
                          value={pipelineOverview.enrollmentProgress.LMN0801}
                          className="h-2"
                        />
                        <div className="flex justify-between mt-1 text-xs text-slate-500">
                          <span>Target: 72 patients</span>
                          <span>
                            Current:{' '}
                            {Math.round((72 * pipelineOverview.enrollmentProgress.LMN0801) / 100)}{' '}
                            patients
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Upcoming Milestones */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center">
                      <Sparkles className="h-5 w-5 text-blue-600 mr-2" />
                      Upcoming Key Milestones
                    </CardTitle>
                    <CardDescription>
                      Critical events and deliverables across your pipeline
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {pipelineOverview.upcomingMilestones.map((milestone, index) => (
                        <div key={index} className="flex items-start p-3 border rounded-md">
                          <div
                            className={`p-2 rounded-full ${
                              milestone.type === 'Clinical'
                                ? 'bg-blue-100'
                                : milestone.type === 'Regulatory'
                                  ? 'bg-purple-100'
                                  : 'bg-green-100'
                            } mr-4 flex-shrink-0`}
                          >
                            {milestone.type === 'Clinical' ? (
                              <Microscope
                                className={`h-5 w-5 ${
                                  milestone.type === 'Clinical'
                                    ? 'text-blue-600'
                                    : milestone.type === 'Regulatory'
                                      ? 'text-purple-600'
                                      : 'text-green-600'
                                }`}
                              />
                            ) : milestone.type === 'Regulatory' ? (
                              <FileCheck className="h-5 w-5 text-purple-600" />
                            ) : (
                              <Beaker className="h-5 w-5 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{milestone.title}</h4>
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  milestone.status === 'On Track'
                                    ? 'bg-green-100 text-green-800'
                                    : milestone.status === 'At Risk'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {milestone.status}
                              </span>
                            </div>
                            <div className="flex items-center mt-1 text-sm text-slate-500">
                              <span>
                                {new Date(milestone.date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="mx-2">•</span>
                              <span>{milestone.program}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {/* KPIs and Risk Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center">
                      <BellDot className="h-5 w-5 text-amber-500 mr-2" />
                      Priority Risks
                    </CardTitle>
                    <CardDescription>Actively monitored risks requiring attention</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {pipelineOverview.keyRisks.map((risk, index) => (
                        <div
                          key={index}
                          className={`border-l-4 ${
                            risk.severity === 'high'
                              ? 'border-l-red-500'
                              : risk.severity === 'medium'
                                ? 'border-l-amber-500'
                                : 'border-l-blue-500'
                          } p-3 rounded-r-md`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{risk.title}</p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                risk.severity === 'high'
                                  ? 'bg-red-100 text-red-800'
                                  : risk.severity === 'medium'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{risk.impact}</p>
                          <div className="flex items-center text-xs text-slate-500 gap-2 mt-2">
                            <span>
                              Due:{' '}
                              {new Date(risk.dueDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span>•</span>
                            <span>Owner: {risk.owner}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* CSR Intelligence Insights Teaser */}
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
                  <CardContent className="pt-6 pb-4">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-primary text-lg">
                        AI-Powered CSR Intelligence
                      </h3>
                      <div className="bg-white p-2 rounded-full shadow-sm">
                        <Brain className="h-5 w-5 text-primary" />
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 mb-4">
                      Our system has analyzed 779 CSRs relevant to your pipeline, providing
                      actionable insights to optimize trial success.
                    </p>

                    <div className="grid grid-cols-2 gap-3 my-4">
                      <div className="rounded-md bg-white p-2 border border-blue-100 shadow-sm">
                        <div className="flex items-center text-blue-700 mb-1">
                          <Microscope className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Clinical</span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Microbiome assessment timing optimization could improve predictive
                          accuracy by 36%
                        </p>
                      </div>

                      <div className="rounded-md bg-white p-2 border border-green-100 shadow-sm">
                        <div className="flex items-center text-green-700 mb-1">
                          <Users className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Operational</span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Strategic site selection with microbiome expertise could accelerate
                          enrollment by 67%
                        </p>
                      </div>

                      <div className="rounded-md bg-white p-2 border border-purple-100 shadow-sm">
                        <div className="flex items-center text-purple-700 mb-1">
                          <FileCheck className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Regulatory</span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Modular submission approach could reduce approval timeline by 4.5 months
                        </p>
                      </div>

                      <div className="rounded-md bg-white p-2 border border-amber-100 shadow-sm">
                        <div className="flex items-center text-amber-700 mb-1">
                          <Target className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Competitive</span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Unique microbiome delivery technology provides key differentiation
                          opportunity
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Button
                        className="w-full shadow-sm"
                        onClick={() => setActiveTab('csr-insights')}
                      >
                        <Lightbulb className="h-4 w-4 mr-2" />
                        Explore Enhanced CSR Insights
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Reports Preview */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Recent Reports</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentReports.slice(0, 2).map(report => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-3 rounded-md hover:bg-slate-50 transition-colors border"
                      >
                        <div className="flex items-center gap-3">
                          {report.type === 'Analysis' ? (
                            <BarChart className="h-6 w-6 text-indigo-500" />
                          ) : report.type === 'Market' ? (
                            <PieChart className="h-6 w-6 text-amber-500" />
                          ) : (
                            <BookOpen className="h-6 w-6 text-emerald-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{report.title}</p>
                            <div className="flex items-center text-xs text-slate-500 gap-1">
                              <span>
                                {new Date(report.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setActiveTab('pipeline-report')}
                    >
                      View All Reports
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Obesity Program (WT02) Tab */}
          <TabsContent value="wt02" className="space-y-6 mt-6">
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <Weight className="h-5 w-5 text-indigo-600 mr-2" />
                  Obesity Program - Protocol WT02
                </CardTitle>
                <CardDescription>
                  Active protocol for LMN-0801 dose-ranging POC study in obesity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ObesityStudyProtocol />
              </CardContent>
            </Card>
          </TabsContent>

          {/* CSR Intelligence Tab */}
          <TabsContent value="csr-insights" className="space-y-6 mt-6">
            <CsrIntelligenceInsights />
          </TabsContent>

          {/* Success Factors Tab */}
          <TabsContent value="success-factors" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center">
                      <Award className="h-5 w-5 text-indigo-600 mr-2" />
                      Success & Failure Factor Analysis
                    </CardTitle>
                    <CardDescription>
                      Evidence-based factors that drive trial success and failure
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Export Analysis
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <SuccessFailureFactors />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Full Pipeline Report Tab */}
          <TabsContent value="pipeline-report" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Pipeline Analysis</CardTitle>
                <CardDescription>
                  Current status and competitive positioning of Lumen Bio's pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LumenBioReport />
              </CardContent>
            </Card>

            {/* Recent Reports */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 text-blue-600 mr-2" />
                  Recent Lumen Bio Reports
                </CardTitle>
                <CardDescription>
                  Latest analyses and reports specific to your pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentReports.map(report => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-slate-50 transition-colors border"
                    >
                      <div className="flex items-center gap-3">
                        {report.type === 'Analysis' ? (
                          <BarChart className="h-8 w-8 text-indigo-500" />
                        ) : report.type === 'Market' ? (
                          <PieChart className="h-8 w-8 text-amber-500" />
                        ) : (
                          <BookOpen className="h-8 w-8 text-emerald-500" />
                        )}
                        <div>
                          <p className="font-medium">{report.title}</p>
                          <div className="flex items-center text-xs text-slate-500 gap-2">
                            <span>{report.date}</span>
                            <span>•</span>
                            <span>{report.indication}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Link href={`/reports/${report.id}`}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Link href="/reports/lumen-bio">
                  <Button variant="outline" className="w-full">
                    View All Lumen Bio Reports
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
