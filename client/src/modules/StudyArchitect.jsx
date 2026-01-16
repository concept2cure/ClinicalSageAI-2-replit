import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Upload, BarChart2, FileText, Layers, Database, Zap, BookOpen, ArrowUpRight, Box, Package2, Brain, LineChart, PieChart, TrendingUp, CheckSquare, AlertTriangle, Users, Lightbulb, Microscope, Target, HelpCircle, Download, Sparkles, Beaker } from 'lucide-react'

// Import Study Architect Components
import StudyWorkspace from '@/components/studyArchitect/StudyWorkspace';
import StudyPlanner from '@/components/studyArchitect/StudyPlanner';
import StudyDesignAssistant from '@/components/studyArchitect/StudyDesignAssistant';
import StudySessionSelector from '@/components/studyArchitect/StudySessionSelector';

// Import CSR Analyzer Components
import CSRDashboard from '@/components/csr-analyzer/CSRDashboard';
import CSRSearchInterface from '@/components/csr-analyzer/CSRSearchInterface';
import CSRSemanticAnalysis from '@/components/csr-analyzer/CSRSemanticAnalysis';
import CSRIntelligenceInsights from '@/components/csr-analyzer/CSRIntelligenceInsights';
import CSRComparison from '@/components/csr-analyzer/CSRComparison';
import CSRUploader from '@/components/csr-analyzer/CSRUploader';

// Import Protocol Components
import ProtocolUploadPanel from '@/components/protocol/ProtocolUploadPanel';
import ProtocolBlueprintGenerator from '@/components/protocol/ProtocolBlueprintGenerator';
import ProtocolSuccessPredictor from '@/components/protocol/ProtocolSuccessPredictor';
import ProtocolIntelligenceBuilder from '@/components/protocol/ProtocolIntelligenceBuilder';

const StudyArchitect = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Sample session data for components that need it
  const sampleSession = {
    id: 'session-2025-001',
    name: 'Enzymax Phase 2b Study Design',
    indication: 'Type 2 Diabetes',
    lastUpdated: '2025-04-30',
    users: [
      { id: 1, name: 'Dr. Sarah Johnson', role: 'Principal Investigator' },
      { id: 2, name: 'Dr. Michael Chen', role: 'Medical Monitor' },
    ],
  };

  const handleSearch = e => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
    // Implement search functionality
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Study Architect™</h1>
          <p className="text-muted-foreground">
            AI-powered study design with protocol optimization and CSR intelligence
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => setActiveTab('protocol-upload')}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            Upload Protocol
          </Button>
          <Button
            onClick={() => setActiveTab('csr-insights')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Brain size={16} />
            CSR Insights
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex w-full max-w-3xl gap-2">
        <Input
          placeholder="Search studies, CSRs, or protocols by indication, intervention, or ID..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-grow"
        />
        <Button type="submit">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>

      {/* Main Content Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-12 gap-2">
          {/* Study Design Tabs */}
          <TabsTrigger value="dashboard" className="flex items-center gap-1 lg:col-span-1">
            <BarChart2 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="study-planner" className="flex items-center gap-1 lg:col-span-1">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Study Planner</span>
          </TabsTrigger>
          <TabsTrigger value="study-workspace" className="flex items-center gap-1 lg:col-span-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Workspace</span>
          </TabsTrigger>
          <TabsTrigger value="design-assistant" className="flex items-center gap-1 lg:col-span-1">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Design Assistant</span>
          </TabsTrigger>

          {/* Protocol Optimization Tabs */}
          <TabsTrigger value="protocol-upload" className="flex items-center gap-1 lg:col-span-1">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Protocol Upload</span>
          </TabsTrigger>
          <TabsTrigger
            value="blueprint-generator"
            className="flex items-center gap-1 lg:col-span-1"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Blueprint Generator</span>
          </TabsTrigger>
          <TabsTrigger
            value="protocol-intelligence"
            className="flex items-center gap-1 lg:col-span-1"
          >
            <Beaker className="h-4 w-4" />
            <span className="hidden sm:inline">Protocol Intelligence</span>
          </TabsTrigger>
          <TabsTrigger value="success-predictor" className="flex items-center gap-1 lg:col-span-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Success Predictor</span>
          </TabsTrigger>

          {/* CSR Intelligence Tabs */}
          <TabsTrigger value="csr-dashboard" className="flex items-center gap-1 lg:col-span-1">
            <LineChart className="h-4 w-4" />
            <span className="hidden sm:inline">CSR Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="csr-search" className="flex items-center gap-1 lg:col-span-1">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">CSR Search</span>
          </TabsTrigger>
          <TabsTrigger value="semantic-analysis" className="flex items-center gap-1 lg:col-span-1">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Semantic Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="csr-insights" className="flex items-center gap-1 lg:col-span-1">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">CSR Insights</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {/* Study Design Content */}
          <TabsContent value="dashboard">
            <StudyArchitectDashboard />
          </TabsContent>

          <TabsContent value="study-planner">
            <StudyPlanner session={sampleSession} />
          </TabsContent>

          <TabsContent value="study-workspace">
            <StudyWorkspace session={sampleSession} />
          </TabsContent>

          <TabsContent value="design-assistant">
            <StudyDesignAssistant />
          </TabsContent>

          {/* Protocol Optimization Content */}
          <TabsContent value="protocol-upload">
            <ProtocolUploadPanel />
          </TabsContent>

          <TabsContent value="blueprint-generator">
            <ProtocolBlueprintGenerator />
          </TabsContent>

          <TabsContent value="protocol-intelligence">
            <ProtocolIntelligenceBuilder />
          </TabsContent>

          <TabsContent value="success-predictor">
            <ProtocolSuccessPredictor />
          </TabsContent>

          {/* CSR Intelligence Content */}
          <TabsContent value="csr-dashboard">
            <CSRDashboard />
          </TabsContent>

          <TabsContent value="csr-search">
            <CSRSearchInterface searchQuery={searchQuery} />
          </TabsContent>

          <TabsContent value="semantic-analysis">
            <CSRSemanticAnalysis />
          </TabsContent>

          <TabsContent value="csr-insights">
            <CSRIntelligenceInsights />
          </TabsContent>
        </div>
      </Tabs>

      {/* Quick Access Cards for Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Recent Studies</CardTitle>
              <FileText className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">12</p>
              <p className="text-xs text-muted-foreground">+3 new studies this month</p>
              <Button variant="link" className="px-0 mt-2 h-auto">
                View all studies
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Protocol Optimizations</CardTitle>
              <Microscope className="h-5 w-5 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">24</p>
              <p className="text-xs text-muted-foreground">Protocol optimizations applied</p>
              <Button variant="link" className="px-0 mt-2 h-auto">
                View optimization history
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">CSR Intelligence</CardTitle>
              <Brain className="h-5 w-5 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">328</p>
              <p className="text-xs text-muted-foreground">CSRs analyzed for insights</p>
              <Button
                variant="link"
                className="px-0 mt-2 h-auto"
                onClick={() => setActiveTab('csr-dashboard')}
              >
                Explore CSR analytics
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Success Predictions</CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">89%</p>
              <p className="text-xs text-muted-foreground">Average predicted success rate</p>
              <Button
                variant="link"
                className="px-0 mt-2 h-auto"
                onClick={() => setActiveTab('success-predictor')}
              >
                View predictive models
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// StudyArchitectDashboard component for the main dashboard view
const StudyArchitectDashboard = () => {
  // Sample data for studies in progress
  const activeStudies = [
    {
      id: 'study-2025-001',
      name: 'Phase 2b Efficacy Study - Enzymax Forte',
      indication: 'Type 2 Diabetes',
      phase: 'Phase 2b',
      status: 'active',
      progress: 65,
      lastUpdated: '2025-04-20',
      tasks: 8,
      completedTasks: 5,
    },
    {
      id: 'study-2025-002',
      name: 'Dose-Finding Study - Cardiozen',
      indication: 'Hypertension',
      phase: 'Phase 1b',
      status: 'active',
      progress: 42,
      lastUpdated: '2025-04-22',
      tasks: 12,
      completedTasks: 5,
    },
    {
      id: 'study-2025-003',
      name: 'Safety Extension - Neuroclear Device',
      indication: 'Epilepsy',
      phase: 'Phase 2',
      status: 'planning',
      progress: 28,
      lastUpdated: '2025-04-28',
      tasks: 10,
      completedTasks: 3,
    },
  ];

  // Sample insights from CSR analysis
  const csrInsights = [
    {
      id: 'insight-1',
      title: 'Adaptive Design Benefits',
      description: 'Adaptive designs show 28% fewer protocol deviations in T2D studies',
      impact: 'high',
      confidence: 92,
    },
    {
      id: 'insight-2',
      title: 'PRO Integration',
      description: 'PROs as secondary endpoints correlate with 34% higher approval rates',
      impact: 'high',
      confidence: 88,
    },
    {
      id: 'insight-3',
      title: 'Biomarker Stratification',
      description: 'Biomarker-stratified enrollment approaches yield 3.2x greater effect sizes',
      impact: 'high',
      confidence: 94,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Studies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div className="text-2xl font-bold">12</div>
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Studies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div className="text-2xl font-bold">5</div>
              <Target className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CSRs Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div className="text-2xl font-bold">328</div>
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div className="text-2xl font-bold">89%</div>
              <TrendingUp className="h-5 w-5 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two column layout for studies and insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Studies in progress */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>Studies in Progress</CardTitle>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  New Study
                </Button>
              </div>
              <CardDescription>Current active and planned studies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeStudies.map(study => (
                  <Card key={study.id} className="shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between mb-1">
                        <Badge variant={study.status === 'active' ? 'default' : 'secondary'}>
                          {study.status === 'active' ? 'Active' : 'Planning'}
                        </Badge>
                        <Badge variant="outline">{study.phase}</Badge>
                      </div>
                      <CardTitle>{study.name}</CardTitle>
                      <CardDescription>{study.indication}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="mt-2 space-y-2">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Progress</span>
                            <span>{study.progress}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${study.progress}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="flex justify-between text-sm text-gray-500">
                          <div>
                            <CheckSquare className="h-4 w-4 inline mr-1" />
                            {study.completedTasks}/{study.tasks} tasks
                          </div>
                          <div>Updated: {study.lastUpdated}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CSR Insights column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>CSR Intelligence Insights</CardTitle>
                <Button variant="ghost" size="sm" className="h-8 gap-1">
                  <Brain className="h-4 w-4" />
                  View All
                </Button>
              </div>
              <CardDescription>Top insights from CSR analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {csrInsights.map(insight => (
                  <div key={insight.id} className="border-b pb-3 last:border-0">
                    <div className="flex justify-between mb-1">
                      <div className="font-medium">{insight.title}</div>
                      <Badge variant="outline">
                        {insight.impact === 'high' ? 'High Impact' : 'Medium Impact'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
                    <div className="flex items-center">
                      <span className="text-xs text-gray-500 mr-2">Confidence:</span>
                      <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${insight.confidence}%` }}
                        ></div>
                      </div>
                      <span className="text-xs ml-2">{insight.confidence}%</span>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-2">
                  <Zap className="h-4 w-4 mr-2" />
                  Apply Insights to Current Study
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Protocol Optimization</CardTitle>
              <CardDescription>Recent protocol improvements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center border-b pb-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <Lightbulb className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Inclusion Criteria</p>
                    <p className="text-sm text-gray-600">Optimized for faster enrollment</p>
                  </div>
                </div>

                <div className="flex items-center border-b pb-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                    <Microscope className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium">Endpoint Selection</p>
                    <p className="text-sm text-gray-600">Based on regulatory success patterns</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <Target className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Sample Size Optimization</p>
                    <p className="text-sm text-gray-600">Increased statistical power</p>
                  </div>
                </div>

                <Button variant="outline" className="w-full mt-4">
                  <FileText className="h-4 w-4 mr-2" />
                  Upload New Protocol
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudyArchitect;
