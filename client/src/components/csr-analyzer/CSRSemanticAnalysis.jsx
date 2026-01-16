import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import {
  Search, Brain, Layers, Network, Target, ArrowRight, Dna, Microscope, Database, MessageSquare, Eye, FileText, Sigma, PanelLeft, PanelRight, Lightbulb, BarChart2, PieChart } from 'lucide-react'

// Sample data for semantic model status
const semanticModels = [
  {
    id: 'sm-1',
    name: 'Endpoint Semantic Model',
    description: 'Specialized for clinical endpoint analysis across all therapeutic areas',
    version: '3.2.1',
    lastUpdated: '2025-01-15',
    status: 'active',
    accuracy: 92,
    coverage: 96,
    dataPoints: 24865,
  },
  {
    id: 'sm-2',
    name: 'Study Design Analyzer',
    description: 'Identifies study design patterns and methodological approaches',
    version: '2.8.4',
    lastUpdated: '2025-02-10',
    status: 'active',
    accuracy: 88,
    coverage: 91,
    dataPoints: 18742,
  },
  {
    id: 'sm-3',
    name: 'Statistical Methods Classifier',
    description: 'Analyzes statistical methodologies used in clinical research',
    version: '2.1.0',
    lastUpdated: '2025-01-28',
    status: 'active',
    accuracy: 87,
    coverage: 89,
    dataPoints: 12356,
  },
  {
    id: 'sm-4',
    name: 'Patient Population Analyzer',
    description: 'Evaluates inclusion/exclusion criteria and demographic patterns',
    version: '3.0.2',
    lastUpdated: '2024-12-08',
    status: 'active',
    accuracy: 94,
    coverage: 93,
    dataPoints: 21789,
  },
  {
    id: 'sm-5',
    name: 'Adverse Event Semantic Network',
    description: 'Deep semantic network for adverse event pattern recognition',
    version: '2.5.1',
    lastUpdated: '2025-02-17',
    status: 'active',
    accuracy: 96,
    coverage: 94,
    dataPoints: 31254,
  },
];

// Sample semantic map connections
const semanticConnections = [
  { source: 'Endpoint Definition', target: 'Statistical Analysis', strength: 0.78, count: 142 },
  { source: 'Study Design', target: 'Patient Population', strength: 0.82, count: 189 },
  { source: 'Adverse Events', target: 'Safety Profile', strength: 0.91, count: 256 },
  { source: 'Inclusion Criteria', target: 'Study Results', strength: 0.72, count: 98 },
  { source: 'Dosing Regimen', target: 'Efficacy Analysis', strength: 0.84, count: 176 },
  { source: 'Primary Endpoint', target: 'Secondary Endpoints', strength: 0.88, count: 215 },
  { source: 'Study Design', target: 'Statistical Methods', strength: 0.87, count: 203 },
  { source: 'Patient Demographics', target: 'Subgroup Analysis', strength: 0.76, count: 124 },
];

// Sample CSR entities for semantic analysis
const csrEntities = [
  {
    name: 'Primary Endpoint',
    count: 328,
    categories: ['Efficacy', 'Clinical Outcome'],
    commonValues: ['Change from baseline in HbA1c', 'Overall survival', 'ACR20 response'],
    semanticRelevance: 0.94,
  },
  {
    name: 'Inclusion Criteria',
    count: 328,
    categories: ['Patient Selection', 'Study Entry'],
    commonValues: ['Age ≥18 years', 'Confirmed diagnosis', 'ECOG performance status 0-1'],
    semanticRelevance: 0.89,
  },
  {
    name: 'Dosing Regimen',
    count: 312,
    categories: ['Treatment', 'Administration'],
    commonValues: ['Once daily', 'Twice daily', 'Every 2 weeks'],
    semanticRelevance: 0.87,
  },
  {
    name: 'Statistical Methods',
    count: 328,
    categories: ['Analysis', 'Methodology'],
    commonValues: ['ANCOVA', 'Logistic regression', 'Cox proportional hazards'],
    semanticRelevance: 0.91,
  },
  {
    name: 'Adverse Events',
    count: 324,
    categories: ['Safety', 'Tolerability'],
    commonValues: ['Headache', 'Nausea', 'Injection site reaction'],
    semanticRelevance: 0.96,
  },
];

const CSRSemanticAnalysis = () => {
  const [activeTab, setActiveTab] = useState('models');
  const [selectedModel, setSelectedModel] = useState(semanticModels[0]);

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Semantic Intelligence Layer</CardTitle>
              <CardDescription>
                Advanced semantic understanding of clinical study reports
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select defaultValue="global">
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Semantic View" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global Semantic View</SelectItem>
                  <SelectItem value="oncology">Oncology Domain</SelectItem>
                  <SelectItem value="cardio">Cardiovascular Domain</SelectItem>
                  <SelectItem value="neuro">Neurology Domain</SelectItem>
                  <SelectItem value="immuno">Immunology Domain</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <TabsTrigger value="models" className="flex items-center gap-1">
                <Brain className="h-4 w-4" />
                <span>Semantic Models</span>
              </TabsTrigger>
              <TabsTrigger value="connections" className="flex items-center gap-1">
                <Network className="h-4 w-4" />
                <span>Semantic Connections</span>
              </TabsTrigger>
              <TabsTrigger value="entities" className="flex items-center gap-1">
                <Layers className="h-4 w-4" />
                <span>CSR Entities</span>
              </TabsTrigger>
              <TabsTrigger value="visualize" className="flex items-center gap-1">
                <Sigma className="h-4 w-4" />
                <span>Semantic Visualization</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              {/* Semantic Models Tab */}
              <TabsContent value="models" className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {semanticModels.map(model => (
                    <Card
                      key={model.id}
                      className={`shadow-sm cursor-pointer transition-all ${selectedModel.id === model.id ? 'ring-2 ring-indigo-500 ring-offset-2' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelectedModel(model)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{model.name}</CardTitle>
                            <CardDescription>{model.description}</CardDescription>
                          </div>
                          <Badge variant={model.status === 'active' ? 'outline' : 'secondary'}>
                            v{model.version}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-sm text-gray-500 mb-1">Accuracy</div>
                            <div className="flex items-center">
                              <Progress value={model.accuracy} className="h-2 flex-grow mr-2" />
                              <span className="text-sm font-medium">{model.accuracy}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500 mb-1">Coverage</div>
                            <div className="flex items-center">
                              <Progress value={model.coverage} className="h-2 flex-grow mr-2" />
                              <span className="text-sm font-medium">{model.coverage}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500 mb-1">Data Points</div>
                            <div className="text-sm font-medium">
                              {model.dataPoints.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 text-xs text-gray-500">
                          Last updated: {model.lastUpdated}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Semantic Connections Tab */}
              <TabsContent value="connections">
                <Card className="shadow-sm mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle>Semantic Network Connections</CardTitle>
                    <CardDescription>
                      Strength of relationships between key clinical concepts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-60 flex items-center justify-center bg-gray-50 rounded-md mb-4">
                      <div className="text-center">
                        <Network className="h-16 w-16 text-indigo-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Semantic Network Visualization</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {semanticConnections.map((connection, i) => (
                        <div key={i} className="border-b pb-3 last:border-0">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium">{connection.source}</div>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <div className="text-sm font-medium">{connection.target}</div>
                            </div>
                            <div className="text-sm">
                              <span className="text-xs text-gray-500 mr-1">Instances:</span>
                              <span className="font-medium">{connection.count}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-500 w-28">Connection Strength:</div>
                            <Progress
                              value={connection.strength * 100}
                              className="h-1.5 flex-grow"
                            />
                            <div className="text-xs font-medium w-12 text-right">
                              {(connection.strength * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CSR Entities Tab */}
              <TabsContent value="entities">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>CSR Semantic Entities</CardTitle>
                        <CardDescription>
                          Key entities extracted and categorized from all CSRs
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative w-64">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                          <Input placeholder="Search entities..." className="pl-8" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {csrEntities.map((entity, i) => (
                        <div key={i} className="border p-4 rounded-md">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="text-lg font-semibold">{entity.name}</h3>
                              <div className="text-sm text-gray-500">
                                Found in {entity.count} CSRs
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {entity.categories.map((category, j) => (
                                <Badge key={j} variant="secondary">
                                  {category}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="mb-3">
                            <div className="text-sm font-medium mb-1">Common Values</div>
                            <div className="flex flex-wrap gap-2">
                              {entity.commonValues.map((value, j) => (
                                <Badge key={j} variant="outline">
                                  {value}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center">
                            <div className="text-xs text-gray-500 mr-2">Semantic Relevance:</div>
                            <Progress
                              value={entity.semanticRelevance * 100}
                              className="h-1.5 flex-grow"
                            />
                            <div className="text-xs font-medium ml-2">
                              {(entity.semanticRelevance * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Semantic Visualization Tab */}
              <TabsContent value="visualize">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="shadow-sm md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle>Semantic Knowledge Graph</CardTitle>
                      <CardDescription>
                        Visual representation of interconnected CSR semantic entities
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-md">
                        <div className="text-center">
                          <Sigma className="h-16 w-16 text-indigo-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            Interactive Semantic Knowledge Graph
                          </p>
                          <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                            Visualizes relationships between clinical concepts, study designs,
                            endpoints, and regulatory patterns identified across all CSRs
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle>Semantic Clusters</CardTitle>
                      <CardDescription>
                        Related semantic concepts grouped by similarity
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-60 flex items-center justify-center bg-gray-50 rounded-md">
                        <div className="text-center">
                          <BarChart2 className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Semantic Cluster Visualization</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle>Entity Distribution</CardTitle>
                      <CardDescription>
                        Distribution of entities across therapeutic areas
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-60 flex items-center justify-center bg-gray-50 rounded-md">
                        <div className="text-center">
                          <PieChart className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Entity Distribution Chart</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CSRSemanticAnalysis;
