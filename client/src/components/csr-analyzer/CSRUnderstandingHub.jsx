import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Brain, Search, Zap, MessageSquare, Database, Layers, BookOpen, FileText, Target, Globe, Lightbulb, ChevronRight, BarChart2, Dna, Microscope, Download, Share2, Clock, ArrowRight, Crosshair } from 'lucide-react'

// Sample data for knowledge entities
const knowledgeEntities = [
  {
    id: 'ke-1',
    title: 'Statistical Significance in Primary Endpoints',
    description:
      'Analysis of statistical approaches for primary endpoint evaluation across therapeutic areas',
    category: 'Statistical Methods',
    confidenceScore: 97,
    sources: 248,
    lastUpdated: '2025-02-14',
    keyData: {
      commonMethods: ['ANCOVA', 'Mixed Models', 'Logistic Regression'],
      pValueThresholds: ['p<0.05', 'p<0.01', 'p<0.001'],
      adjustmentMethods: ['Bonferroni', 'Hochberg', 'Holm'],
    },
  },
  {
    id: 'ke-2',
    title: 'Adverse Event Reporting Patterns',
    description:
      'Standardized approaches to adverse event categorization and reporting in clinical studies',
    category: 'Safety',
    confidenceScore: 94,
    sources: 312,
    lastUpdated: '2025-01-28',
    keyData: {
      commonCategories: ['Mild', 'Moderate', 'Severe', 'Life-threatening'],
      reportingFrameworks: ['CTCAE v5.0', 'MedDRA', 'WHO-ART'],
      trendingApproaches: ['Visual AE Mapping', 'Temporal Visualization'],
    },
  },
  {
    id: 'ke-3',
    title: 'Inclusion/Exclusion Criteria Patterns',
    description: 'Common patterns in inclusion/exclusion criteria that influence study outcomes',
    category: 'Study Design',
    confidenceScore: 89,
    sources: 287,
    lastUpdated: '2025-02-05',
    keyData: {
      commonInclusion: [
        'Age range specifications',
        'Disease severity measures',
        'Prior treatment status',
      ],
      commonExclusion: ['Comorbidities', 'Concomitant medications', 'Laboratory abnormalities'],
      emergingTrends: ['Patient-reported eligibility', 'Real-world evidence validation'],
    },
  },
  {
    id: 'ke-4',
    title: 'Endpoint Selection Strategies',
    description: 'Strategic approaches to primary and secondary endpoint selection by indication',
    category: 'Clinical Strategy',
    confidenceScore: 92,
    sources: 221,
    lastUpdated: '2025-01-12',
    keyData: {
      primaryEndpointTypes: ['Clinical Outcomes', 'Biomarkers', 'Patient-Reported Outcomes'],
      secondaryEndpointPatterns: [
        'Safety Parameters',
        'Quality of Life Measures',
        'Pharmacodynamic Markers',
      ],
      regulatoryConsiderations: [
        'FDA-preferred endpoints',
        'EMA-specific requirements',
        'PMDA distinctions',
      ],
    },
  },
  {
    id: 'ke-5',
    title: 'Protocol Deviation Management',
    description: 'Best practices in protocol deviation classification, reporting, and analysis',
    category: 'Regulatory Compliance',
    confidenceScore: 91,
    sources: 184,
    lastUpdated: '2025-02-18',
    keyData: {
      deviationCategories: ['Major/Critical', 'Minor', 'Important'],
      mitigationStrategies: ['Corrective actions', 'Preventive measures', 'Protocol amendments'],
      analyticalApproaches: ['Per-Protocol vs. ITT Analysis', 'Sensitivity Analyses'],
    },
  },
];

// Sample knowledge queries
const knowledgeQueries = [
  'What are the most common primary endpoints in Phase 3 oncology trials?',
  'How do sample size calculations differ between superiority and non-inferiority trials?',
  'What statistical methods are most commonly used for handling missing data in neurology studies?',
  'What inclusion/exclusion criteria patterns are associated with higher retention rates?',
  'How do adverse event reporting patterns differ between EMA and FDA submissions?',
  'What protocol deviations are most commonly reported in infectious disease trials?',
  'How has endpoint selection in cardiovascular trials evolved over the past 5 years?',
];

const CSRUnderstandingHub = () => {
  const [activeTab, setActiveTab] = useState('knowledge');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(knowledgeEntities[0]);
  const [askQuery, setAskQuery] = useState('');

  const handleSearch = e => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
  };

  const handleAskQuestion = e => {
    e.preventDefault();
    console.log('Asking understanding hub:', askQuery);
    // In a real implementation, this would call the semantic understanding API
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-600" />
                CSR Understanding Hub
              </CardTitle>
              <CardDescription>
                Centralized intelligence hub connecting all CSR semantic knowledge
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">Explore Knowledge Base</span>
              </Button>
              <Button className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden md:inline">Ask Lumen</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
              <TabsTrigger value="knowledge" className="flex items-center gap-1">
                <Layers className="h-4 w-4" />
                <span>Knowledge Repository</span>
              </TabsTrigger>
              <TabsTrigger value="ask" className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>Ask Understanding Hub</span>
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex items-center gap-1">
                <Lightbulb className="h-4 w-4" />
                <span>Strategic Insights</span>
              </TabsTrigger>
            </TabsList>

            {/* Knowledge Repository Tab */}
            <TabsContent value="knowledge">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                  <form onSubmit={handleSearch} className="flex w-full gap-2">
                    <Input
                      placeholder="Search knowledge entities..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="flex-grow"
                    />
                    <Button type="submit" size="sm">
                      <Search className="h-4 w-4" />
                    </Button>
                  </form>

                  <div className="space-y-2">
                    {knowledgeEntities.map(entity => (
                      <Card
                        key={entity.id}
                        className={`shadow-sm cursor-pointer transition-all ${
                          selectedEntity.id === entity.id
                            ? 'ring-2 ring-indigo-500'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedEntity(entity)}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-base">{entity.title}</CardTitle>
                            <Badge variant="outline" className="ml-2">
                              {entity.category}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                            {entity.description}
                          </p>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>Confidence: {entity.confidenceScore}%</span>
                            <span>{entity.sources} sources</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Card className="shadow-sm h-full">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{selectedEntity.title}</CardTitle>
                          <CardDescription>{selectedEntity.description}</CardDescription>
                        </div>
                        <Badge variant="secondary">{selectedEntity.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-medium mb-1">Knowledge Confidence</div>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={selectedEntity.confidenceScore}
                              className="h-2 flex-grow"
                            />
                            <span className="text-sm font-medium">
                              {selectedEntity.confidenceScore}%
                            </span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium mb-1">Source Documents</div>
                          <div className="text-sm">{selectedEntity.sources} CSRs</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium mb-1">Last Updated</div>
                          <div className="text-sm">{selectedEntity.lastUpdated}</div>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <div className="text-base font-medium mb-3">Key Knowledge Points</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(selectedEntity.keyData).map(([key, values], i) => (
                            <div key={i} className="space-y-2">
                              <div className="text-sm font-medium capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </div>
                              <div className="space-y-1">
                                {values.map((value, j) => (
                                  <div key={j} className="flex items-center gap-2">
                                    <ChevronRight className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                                    <span className="text-sm">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <div className="text-base font-medium mb-2">Related Knowledge Entities</div>
                        <div className="flex flex-wrap gap-2">
                          {knowledgeEntities
                            .filter(ke => ke.id !== selectedEntity.id)
                            .slice(0, 3)
                            .map(entity => (
                              <Badge
                                key={entity.id}
                                variant="outline"
                                className="cursor-pointer"
                                onClick={() => setSelectedEntity(entity)}
                              >
                                {entity.title}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between border-t pt-4">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Download className="h-4 w-4" />
                        Export Knowledge
                      </Button>
                      <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700">
                        <Zap className="h-4 w-4" />
                        Apply to Current Study
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Ask Understanding Hub Tab */}
            <TabsContent value="ask">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle>Ask the Understanding Hub</CardTitle>
                  <CardDescription>
                    Query the collective intelligence from all analyzed CSRs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleAskQuestion} className="space-y-4">
                    <Textarea
                      placeholder="Ask a question about clinical study patterns, regulatory insights, or methodological approaches..."
                      className="min-h-[120px] w-full"
                      value={askQuery}
                      onChange={e => setAskQuery(e.target.value)}
                    />
                    <div className="flex justify-between">
                      <div className="text-sm text-gray-500">
                        Powered by the CSR Semantic Understanding Engine
                      </div>
                      <Button type="submit" className="gap-1 bg-indigo-600 hover:bg-indigo-700">
                        <Brain className="h-4 w-4" />
                        Ask Understanding Hub
                      </Button>
                    </div>
                  </form>

                  <div className="border-t pt-4">
                    <div className="text-sm font-medium mb-2">Suggested Questions</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {knowledgeQueries.map((query, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-md border hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setAskQuery(query)}
                        >
                          <MessageSquare className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                          <span className="text-sm">{query}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sample response (would be shown after question is submitted) */}
                  {false && (
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="h-5 w-5 text-indigo-600" />
                        <div className="text-base font-medium">Understanding Hub Response</div>
                      </div>

                      <div className="p-4 bg-indigo-50 rounded-md">
                        <p className="text-gray-700 mb-4">
                          Based on analysis of 287 Phase 3 oncology trials, the most common primary
                          endpoints are:
                        </p>
                        <ul className="space-y-2 mb-4">
                          <li className="flex items-start gap-2">
                            <Crosshair className="h-5 w-5 text-indigo-600 mt-0.5" />
                            <div>
                              <span className="font-medium">Overall Survival (OS)</span>: Used in
                              42% of trials, particularly dominant in advanced/metastatic solid
                              tumor studies
                            </div>
                          </li>
                          <li className="flex items-start gap-2">
                            <Crosshair className="h-5 w-5 text-indigo-600 mt-0.5" />
                            <div>
                              <span className="font-medium">Progression-Free Survival (PFS)</span>:
                              Used in 38% of trials, common in both solid tumor and hematologic
                              malignancies
                            </div>
                          </li>
                          <li className="flex items-start gap-2">
                            <Crosshair className="h-5 w-5 text-indigo-600 mt-0.5" />
                            <div>
                              <span className="font-medium">Objective Response Rate (ORR)</span>:
                              Used in 12% of trials, mainly in early-phase studies or accelerated
                              approval pathways
                            </div>
                          </li>
                        </ul>
                        <p className="text-gray-700 mb-2">
                          Regulatory trends show FDA and EMA increasingly accepting PFS as a primary
                          endpoint for regular approval, while PMDA shows stronger preference for OS
                          data. The use of composite endpoints combining clinical outcomes with
                          quality of life measures has increased by 28% in the past 3 years.
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-500 mt-4">
                          <div className="flex items-center gap-1">
                            <Database className="h-3 w-3" />
                            <span>Sources: 287 oncology CSRs</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Last updated: February 14, 2025</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Strategic Insights Tab */}
            <TabsContent value="insights">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm md:col-span-2 md:row-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle>Strategic CSR Intelligence Map</CardTitle>
                    <CardDescription>
                      Visualization of strategic clusters and insights from CSR semantic layer
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] flex items-center justify-center bg-gray-50 rounded-md">
                      <div className="text-center">
                        <Globe className="h-16 w-16 text-indigo-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          Strategic Intelligence Knowledge Map
                        </p>
                        <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                          Interactive visualization of strategic patterns, regulatory insights, and
                          methodological approaches extracted from all analyzed CSRs
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Key Regulatory Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-indigo-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Adaptive Design Acceptance</span>:
                          <span className="text-gray-600">
                            {' '}
                            Growing regulatory acceptance of adaptive trial designs with appropriate
                            statistical considerations
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-indigo-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Real-World Evidence</span>:
                          <span className="text-gray-600">
                            {' '}
                            Increasing incorporation of RWE to complement traditional clinical
                            endpoints
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-indigo-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Patient-Reported Outcomes</span>:
                          <span className="text-gray-600">
                            {' '}
                            Greater emphasis on PROs as co-primary or key secondary endpoints
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Methodological Innovations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Dna className="h-4 w-4 text-emerald-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Bayesian Approaches</span>:
                          <span className="text-gray-600">
                            {' '}
                            Growing application of Bayesian statistical methods, especially in rare
                            disease studies
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Dna className="h-4 w-4 text-emerald-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Synthetic Control Arms</span>:
                          <span className="text-gray-600">
                            {' '}
                            Increasing use of synthetic/external control arms in specific
                            therapeutic contexts
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Dna className="h-4 w-4 text-emerald-500 mt-1" />
                        <div className="text-sm">
                          <span className="font-medium">Master Protocols</span>:
                          <span className="text-gray-600">
                            {' '}
                            Platform trials and umbrella/basket study designs gaining prominence in
                            oncology and rare diseases
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CSRUnderstandingHub;
