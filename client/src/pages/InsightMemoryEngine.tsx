import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  BookOpenCheck, Brain, BarChart, Clock, Database, Filter, LineChart, Layers, Lock, Search, Share, Sparkles, AlertCircle, Dna, FileText, Lightbulb, HelpCircle, Check, Flame, BadgeAlert } from 'lucide-react'

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Mock data for development
const mockInsights = [
  {
    id: 1,
    title: 'High Dropout Rate Pattern Detected',
    description:
      'Studies with >3 arms and open-label comparators show >20% higher dropout rates than similar trials.',
    source: 'Pattern detected across 47 CSRs',
    confidence: 87,
    category: 'Risk Pattern',
    date: '2025-03-17',
    tags: ['Dropout', 'Study Design', 'Multi-arm'],
    impact: 'High',
    status: 'Verified',
  },
  {
    id: 2,
    title: 'NASH Phase 2 Endpoint Risk',
    description:
      'NASH Phase 2 trials that use ALT alone as a primary endpoint have a 34% failure rate.',
    source: 'Cross-analysis of 23 NASH trials',
    confidence: 79,
    category: 'Endpoint Intelligence',
    date: '2025-03-15',
    tags: ['NASH', 'Endpoint', 'Phase 2', 'Biomarker'],
    impact: 'Critical',
    status: 'Pending Review',
  },
  {
    id: 3,
    title: 'Sample Size Optimization',
    description:
      'For your indication, powering at 90% instead of 80% requires only 15% more patients but increases regulatory acceptance by 23%.',
    source: 'Statistical modeling + FDA feedback patterns',
    confidence: 91,
    category: 'Statistical Insight',
    date: '2025-03-12',
    tags: ['Sample Size', 'Power', 'Regulatory'],
    impact: 'Medium',
    status: 'Verified',
  },
  {
    id: 4,
    title: 'Regulatory Trend Alert',
    description:
      'FDA now requires additional safety endpoints for this class of molecule based on recent similar submissions.',
    source: 'FDA public communications + similar protocol analysis',
    confidence: 83,
    category: 'Regulatory Intelligence',
    date: '2025-03-10',
    tags: ['FDA', 'Safety', 'Endpoints', 'Compliance'],
    impact: 'Critical',
    status: 'Verified',
  },
  {
    id: 5,
    title: 'Biomarker Correlation Pattern',
    description:
      'Secondary biomarkers X and Y show strong correlation with clinical outcomes in 75% of analyzed studies.',
    source: 'ML analysis across 89 oncology CSRs',
    confidence: 76,
    category: 'Biomarker Intelligence',
    date: '2025-03-08',
    tags: ['Biomarker', 'Correlation', 'Oncology'],
    impact: 'Medium',
    status: 'Under Analysis',
  },
];

const mockMemoryStats = {
  csrCount: 693,
  insightsGenerated: 247,
  patternsMined: 112,
  meanConfidence: 81,
  risksIdentified: 54,
  regulatoryUpdates: 18,
  endpointOptimizations: 42,
  biomarkerPatterns: 37,
  lastUpdate: '2025-04-13T08:45:22Z',
};

const mockLearningCategories = [
  {
    name: 'CSR Knowledge',
    progress: 74,
    documents: 693,
    coverage: 'High',
    lastLearning: '2025-04-12',
  },
  {
    name: 'Regulatory Patterns',
    progress: 68,
    documents: 247,
    coverage: 'Medium',
    lastLearning: '2025-04-11',
  },
  {
    name: 'Statistical Models',
    progress: 81,
    documents: 189,
    coverage: 'High',
    lastLearning: '2025-04-13',
  },
  {
    name: 'Endpoint Efficacy',
    progress: 63,
    documents: 422,
    coverage: 'Medium',
    lastLearning: '2025-04-10',
  },
  {
    name: 'Safety Monitoring',
    progress: 58,
    documents: 317,
    coverage: 'Medium',
    lastLearning: '2025-04-09',
  },
];

export default function InsightMemoryEngine() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('insights');
  const [filteredInsights, setFilteredInsights] = useState(mockInsights);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [impactFilter, setImpactFilter] = useState('all');

  useEffect(() => {
    let filtered = mockInsights;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        insight =>
          insight.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          insight.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          insight.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(insight => insight.category === categoryFilter);
    }

    // Apply impact filter
    if (impactFilter !== 'all') {
      filtered = filtered.filter(insight => insight.impact === impactFilter);
    }

    setFilteredInsights(filtered);
  }, [searchQuery, categoryFilter, impactFilter]);

  const handleShowAllInsights = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setImpactFilter('all');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-600 text-transparent bg-clip-text">
              Insight Memory Engine
            </h1>
            <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 hover:bg-blue-100">
              <Brain className="h-3 w-3 mr-1" />
              Self-Learning
            </Badge>
          </div>
          <p className="mt-1 text-slate-500">
            The evolving memory center of LumenTrialGuide.AI's knowledge network
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex items-center gap-2">
            <Share className="h-4 w-4" />
            Share Insights
          </Button>
          <Button className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Main Dashboard */}
      <div>
        <Tabs
          defaultValue="insights"
          className="space-y-4"
          onValueChange={value => setSelectedTab(value)}
        >
          <TabsList className="grid grid-cols-4 md:w-[600px]">
            <TabsTrigger value="insights">
              <Lightbulb className="h-4 w-4 mr-2" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="patterns">
              <Dna className="h-4 w-4 mr-2" />
              Pattern Mining
            </TabsTrigger>
            <TabsTrigger value="memory">
              <Database className="h-4 w-4 mr-2" />
              Memory Stats
            </TabsTrigger>
            <TabsTrigger value="learning">
              <Brain className="h-4 w-4 mr-2" />
              Learning Status
            </TabsTrigger>
          </TabsList>

          {/* Insights Tab Content */}
          <TabsContent value="insights" className="space-y-4">
            {/* Search and Filter Bar */}
            <Card>
              <CardContent className="pt-6 pb-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search insights by title, description or tags..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[180px]">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          <span>Category</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="Risk Pattern">Risk Patterns</SelectItem>
                        <SelectItem value="Endpoint Intelligence">Endpoint Intelligence</SelectItem>
                        <SelectItem value="Statistical Insight">Statistical Insights</SelectItem>
                        <SelectItem value="Regulatory Intelligence">
                          Regulatory Intelligence
                        </SelectItem>
                        <SelectItem value="Biomarker Intelligence">
                          Biomarker Intelligence
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={impactFilter} onValueChange={setImpactFilter}>
                      <SelectTrigger className="w-[150px]">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>Impact</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Impacts</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Insights List with Status Indicators */}
            <div className="grid gap-4">
              {filteredInsights.length > 0 ? (
                filteredInsights.map(insight => (
                  <Card key={insight.id} className="relative overflow-hidden">
                    {insight.impact === 'Critical' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    )}
                    {insight.impact === 'High' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                    )}
                    {insight.impact === 'Medium' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                    )}
                    {insight.impact === 'Low' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
                    )}
                    <CardHeader className="pb-2 pl-6">
                      <div className="flex justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">{insight.title}</CardTitle>
                            {insight.status === 'Verified' && (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 border-green-200"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                            {insight.status === 'Pending Review' && (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 border-amber-200"
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Pending Review
                              </Badge>
                            )}
                            {insight.status === 'Under Analysis' && (
                              <Badge
                                variant="outline"
                                className="bg-blue-50 text-blue-700 border-blue-200"
                              >
                                <Layers className="h-3 w-3 mr-1" />
                                Under Analysis
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-1">
                            {insight.source} • {insight.date}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            <BarChart className="h-3 w-3 mr-1" />
                            {insight.confidence}% Confidence
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pl-6">
                      <p className="text-slate-700">{insight.description}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {insight.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs font-medium">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="pl-6 pt-0 flex justify-between">
                      <div className="flex gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-primary"
                        >
                          <HelpCircle className="h-4 w-4 mr-1" />
                          View Evidence
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-primary"
                        >
                          <Lightbulb className="h-4 w-4 mr-1" />
                          Related Insights
                        </Button>
                      </div>
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        Apply to Protocol
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              ) : (
                <div className="text-center p-8 bg-slate-50 rounded-lg">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                    <Search className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-1">No insights found</h3>
                  <p className="text-slate-500 max-w-md mx-auto mb-4">
                    No insights match your current search criteria. Try adjusting your filters or
                    search query.
                  </p>
                  <Button variant="outline" onClick={handleShowAllInsights}>
                    Show All Insights
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Pattern Mining Tab Content */}
          <TabsContent value="patterns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cross-Study Pattern Mining</CardTitle>
                <CardDescription>
                  LumenTrialGuide.AI continuously analyzes patterns across CSRs and clinical data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-slate-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Dna className="h-5 w-5 mr-2 text-blue-600" />
                        Pattern Detection
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Active Mining Jobs</span>
                          <span className="font-medium">3</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Total Patterns Found</span>
                          <span className="font-medium">{mockMemoryStats.patternsMined}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Significant Patterns</span>
                          <span className="font-medium">42</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Avg. Confidence Score</span>
                          <span className="font-medium">{mockMemoryStats.meanConfidence}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Flame className="h-5 w-5 mr-2 text-orange-600" />
                        Hot Patterns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Dropout correlation with visit frequency
                          </div>
                          <div className="text-slate-500">Significance: 94%</div>
                        </div>
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Biomarker response in subpopulation
                          </div>
                          <div className="text-slate-500">Significance: 92%</div>
                        </div>
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Endpoint selection impact on Phase 3 success
                          </div>
                          <div className="text-slate-500">Significance: 87%</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <BadgeAlert className="h-5 w-5 mr-2 text-red-600" />
                        Risk Patterns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Multi-arm study complexity risk
                          </div>
                          <div className="text-slate-500">Risk Score: 82%</div>
                        </div>
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Biomarker validation gaps
                          </div>
                          <div className="text-slate-500">Risk Score: 76%</div>
                        </div>
                        <div className="text-sm">
                          <div className="text-slate-700 font-medium">
                            Regulatory threshold pattern
                          </div>
                          <div className="text-slate-500">Risk Score: 71%</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Pattern Mining Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700 font-medium">
                            CSR Correlation Analysis
                          </span>
                          <span>87% Complete</span>
                        </div>
                        <Progress value={87} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700 font-medium">
                            Biomarker Response Patterns
                          </span>
                          <span>73% Complete</span>
                        </div>
                        <Progress value={73} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700 font-medium">
                            Endpoint Efficacy Modeling
                          </span>
                          <span>65% Complete</span>
                        </div>
                        <Progress value={65} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700 font-medium">
                            Regulatory Decision Analysis
                          </span>
                          <span>59% Complete</span>
                        </div>
                        <Progress value={59} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Memory Stats Tab Content */}
          <TabsContent value="memory" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500 font-normal">
                    CSRs Analyzed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{mockMemoryStats.csrCount}</div>
                  <p className="text-sm text-slate-500 mt-1">Structured documents</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500 font-normal">
                    Insights Generated
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{mockMemoryStats.insightsGenerated}</div>
                  <p className="text-sm text-slate-500 mt-1">Cross-study intelligence</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500 font-normal">
                    Patterns Detected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{mockMemoryStats.patternsMined}</div>
                  <p className="text-sm text-slate-500 mt-1">ML-driven correlations</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500 font-normal">
                    Risks Identified
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{mockMemoryStats.risksIdentified}</div>
                  <p className="text-sm text-slate-500 mt-1">Proactive warnings</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Memory Health Dashboard</CardTitle>
                <CardDescription>
                  System health metrics for the Insight Memory Engine
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-3">Knowledge Categories</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">CSR Intelligence</span>
                        <span>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            {mockMemoryStats.csrCount} Documents
                          </Badge>
                        </span>
                      </div>
                      <Progress value={92} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">Regulatory Knowledge</span>
                        <span>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {mockMemoryStats.regulatoryUpdates} Updates
                          </Badge>
                        </span>
                      </div>
                      <Progress value={78} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">Endpoint Optimization</span>
                        <span>
                          <Badge variant="outline" className="bg-purple-50 text-purple-700">
                            {mockMemoryStats.endpointOptimizations} Patterns
                          </Badge>
                        </span>
                      </div>
                      <Progress value={84} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">Biomarker Intelligence</span>
                        <span>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700">
                            {mockMemoryStats.biomarkerPatterns} Patterns
                          </Badge>
                        </span>
                      </div>
                      <Progress value={67} className="h-2" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-3">System Metrics</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Mean Confidence Score</span>
                        <span className="font-medium">{mockMemoryStats.meanConfidence}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Knowledge Graph Size</span>
                        <span className="font-medium">1.78 TB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Vector Database Entries</span>
                        <span className="font-medium">1.4M</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Neural Connection Density</span>
                        <span className="font-medium">High (0.87)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Last Memory Update</span>
                        <span className="font-medium">
                          {new Date(mockMemoryStats.lastUpdate).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-3">Memory Growth</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">New CSRs This Month</span>
                        <span className="font-medium">37</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">New Insights Generated</span>
                        <span className="font-medium">28</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">New Patterns Discovered</span>
                        <span className="font-medium">14</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Knowledge Growth Rate</span>
                        <span className="font-medium">+5.3% MoM</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Accuracy Improvement</span>
                        <span className="font-medium">+2.1% MoM</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Learning Status Tab Content */}
          <TabsContent value="learning" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Self-Learning Status</CardTitle>
                <CardDescription>
                  LumenTrialGuide.AI's continuous learning progress and neural evolution
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {mockLearningCategories.map((category, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                        <div>
                          <h3 className="text-lg font-medium">{category.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                              <Database className="h-3 w-3 mr-1" />
                              {category.documents} Documents
                            </Badge>
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <Brain className="h-3 w-3 mr-1" />
                              {category.coverage} Coverage
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold">{category.progress}%</div>
                          <div className="text-sm text-slate-500">Learning Progress</div>
                        </div>
                      </div>
                      <Progress value={category.progress} className="h-2" />
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-slate-500">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Last learning session: {category.lastLearning}
                        </span>
                        <span className="text-slate-500">Target: 100%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <Card className="bg-slate-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Recent Learning Activities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm p-3 bg-white rounded-md">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">CSR Batch Processing</span>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Completed
                          </Badge>
                        </div>
                        <p className="text-slate-500">
                          Processed 37 new CSR documents for indication knowledge
                        </p>
                        <p className="text-xs text-slate-400 mt-1">April 12, 2025 at 3:42 PM</p>
                      </div>
                      <div className="text-sm p-3 bg-white rounded-md">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">Pattern Recognition Training</span>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            In Progress
                          </Badge>
                        </div>
                        <p className="text-slate-500">
                          Deep learning on biomarker-outcome correlation patterns
                        </p>
                        <p className="text-xs text-slate-400 mt-1">April 13, 2025 at 9:15 AM</p>
                      </div>
                      <div className="text-sm p-3 bg-white rounded-md">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">Regulatory Update Integration</span>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Completed
                          </Badge>
                        </div>
                        <p className="text-slate-500">
                          Incorporated 5 new FDA guidance documents into knowledge base
                        </p>
                        <p className="text-xs text-slate-400 mt-1">April 11, 2025 at 11:27 AM</p>
                      </div>
                      <div className="text-sm p-3 bg-white rounded-md">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">Statistical Model Refinement</span>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Completed
                          </Badge>
                        </div>
                        <p className="text-slate-500">
                          Fine-tuned predictive models based on recent trial outcomes
                        </p>
                        <p className="text-xs text-slate-400 mt-1">April 10, 2025 at 4:53 PM</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
