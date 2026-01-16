import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Lightbulb, ArrowRight, BarChart2, TrendingUp, ChevronRight, Brain, Target, LineChart, Filter, Download, Share2, Sparkles, Microscope, Database, BookOpen, Info } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// Sample therapeutic areas
const therapeuticAreas = [
  { id: 'oncology', name: 'Oncology', count: 87 },
  { id: 'cardio', name: 'Cardiology', count: 56 },
  { id: 'neurology', name: 'Neurology', count: 42 },
  { id: 'infect', name: 'Infectious Disease', count: 38 },
  { id: 'metabolic', name: 'Metabolic Disorders', count: 35 },
  { id: 'immuno', name: 'Immunology', count: 31 },
  { id: 'gastro', name: 'Gastroenterology', count: 18 },
  { id: 'resp', name: 'Respiratory', count: 21 },
];

// Sample insights
const insights = [
  {
    id: 'insight_1',
    title: 'Adaptive Design Protocol Deviations',
    description:
      'CSR analysis reveals adaptive designs have 28% fewer protocol deviations than traditional fixed designs in oncology trials',
    impact: 'high',
    category: 'study_design',
    relevance: 0.94,
    evidence:
      'Based on analysis of 87 oncology CSRs comparing adaptive vs. traditional designs across similar indications and sample sizes (p<0.01).',
    recommendation:
      'Consider adaptive designs for oncology trials to reduce protocol deviations and improve data quality.',
    confidence: 92,
    relatedCSRs: ['CSR-2023-C187', 'CSR-2023-B016', 'CSR-2022-A452'],
  },
  {
    id: 'insight_2',
    title: 'Patient-Reported Outcome Integration',
    description:
      'Integration of PROs as secondary endpoints correlates with 34% higher regulatory approval rates for neurology submissions',
    impact: 'high',
    category: 'endpoints',
    relevance: 0.89,
    evidence:
      'Review of 42 neurology CSRs shows statistically significant correlation between PRO inclusion and approval outcomes across FDA, EMA, and PMDA submissions.',
    recommendation:
      'Incorporate validated PRO measures as secondary endpoints in neurology studies to strengthen regulatory submissions.',
    confidence: 88,
    relatedCSRs: ['CSR-2023-D023', 'CSR-2022-D187', 'CSR-2022-D098'],
  },
  {
    id: 'insight_3',
    title: 'Biomarker-Based Enrollment Strategy',
    description:
      'Biomarker-stratified enrollment approaches yield 3.2x greater treatment effect sizes in targeted oncology therapies',
    impact: 'high',
    category: 'patient_selection',
    relevance: 0.96,
    evidence:
      'Comparative analysis of 35 precision medicine oncology trials utilizing biomarker-based vs. conventional enrollment approaches.',
    recommendation:
      'Implement biomarker-based enrollment strategies for targeted therapies to maximize observed treatment effects and reduce required sample sizes.',
    confidence: 94,
    relatedCSRs: ['CSR-2023-A118', 'CSR-2022-A245', 'CSR-2021-A392'],
  },
  {
    id: 'insight_4',
    title: 'Statistical Analysis Plan Amendments',
    description:
      'SAP amendments occurring after database lock associated with 46% higher regulatory queries and 3.8-month longer review timelines',
    impact: 'medium',
    category: 'statistical',
    relevance: 0.87,
    evidence:
      'Analysis of 112 CSRs across therapeutic areas examining timing of SAP finalization relative to database lock and subsequent regulatory review metrics.',
    recommendation:
      'Finalize Statistical Analysis Plans prior to database lock to minimize regulatory queries and optimize review timelines.',
    confidence: 91,
    relatedCSRs: ['CSR-2022-E107', 'CSR-2022-B241', 'CSR-2023-D185'],
  },
  {
    id: 'insight_5',
    title: 'Adverse Event Visualization Impact',
    description:
      'Enhanced AE visualization techniques in CSRs correlate with 29% faster safety reviews by regulatory agencies',
    impact: 'medium',
    category: 'safety',
    relevance: 0.85,
    evidence:
      'Comparative analysis of review times for 74 CSRs using traditional vs. enhanced visualization techniques for safety data presentation.',
    recommendation:
      'Implement advanced visualization techniques for adverse event data to improve reviewer comprehension and expedite safety assessments.',
    confidence: 86,
    relatedCSRs: ['CSR-2023-E305', 'CSR-2022-C412', 'CSR-2022-B186'],
  },
  {
    id: 'insight_6',
    title: 'Missing Data Imputation Strategies',
    description:
      'Multiple imputation methods show superior acceptance by regulators compared to LOCF approaches across therapeutic areas',
    impact: 'medium',
    category: 'statistical',
    relevance: 0.82,
    evidence:
      'Analysis of 128 CSRs examining regulatory feedback on different missing data handling approaches and their impact on study conclusions.',
    recommendation:
      'Transition from Last Observation Carried Forward (LOCF) to multiple imputation methods for missing data handling in pivotal studies.',
    confidence: 89,
    relatedCSRs: ['CSR-2022-A242', 'CSR-2023-B112', 'CSR-2021-D087'],
  },
  {
    id: 'insight_7',
    title: 'Sample Size Re-estimation Patterns',
    description:
      'Blinded sample size re-estimation approaches accepted by regulators without statistical penalties in 94% of reviewed cases',
    impact: 'high',
    category: 'study_design',
    relevance: 0.91,
    evidence:
      'Review of regulatory feedback in 42 CSRs implementing adaptive sample size re-estimation strategies across therapeutic areas.',
    recommendation:
      'Consider blinded sample size re-estimation techniques to optimize statistical power while maintaining regulatory acceptability.',
    confidence: 93,
    relatedCSRs: ['CSR-2023-A109', 'CSR-2022-B186', 'CSR-2022-C108'],
  },
];

// Helper to get impact color
const getImpactColor = impact => {
  switch (impact) {
    case 'high':
      return 'bg-emerald-500';
    case 'medium':
      return 'bg-blue-500';
    case 'low':
      return 'bg-amber-500';
    default:
      return 'bg-gray-500';
  }
};

// Helper to get category label
const getCategoryLabel = category => {
  const categoryMap = {
    study_design: 'Study Design',
    endpoints: 'Endpoint Selection',
    patient_selection: 'Patient Selection',
    statistical: 'Statistical Methods',
    safety: 'Safety Reporting',
  };
  return categoryMap[category] || category;
};

const CSRIntelligenceInsights = () => {
  const [selectedTA, setSelectedTA] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedInsight, setSelectedInsight] = useState(insights[0]);

  // Filter insights based on selection
  const filteredInsights = insights.filter(insight => {
    if (selectedCategory !== 'all' && insight.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                CSR Intelligence Insights
              </CardTitle>
              <CardDescription>
                AI-powered insights extracted from analyzed clinical study reports
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="study_design">Study Design</SelectItem>
                  <SelectItem value="endpoints">Endpoint Selection</SelectItem>
                  <SelectItem value="patient_selection">Patient Selection</SelectItem>
                  <SelectItem value="statistical">Statistical Methods</SelectItem>
                  <SelectItem value="safety">Safety Reporting</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <div className="space-y-3">
                {filteredInsights.map(insight => (
                  <Card
                    key={insight.id}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedInsight.id === insight.id ? 'ring-2 ring-indigo-500' : ''
                    }`}
                    onClick={() => setSelectedInsight(insight)}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className={`w-2 h-2 rounded-full ${getImpactColor(insight.impact)}`} />
                        <Badge variant="outline">{getCategoryLabel(insight.category)}</Badge>
                      </div>
                      <CardTitle className="text-base">{insight.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                        {insight.description}
                      </p>
                      <div className="flex justify-between">
                        <div className="text-xs text-gray-500">
                          Confidence: {insight.confidence}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Relevance: {Math.round(insight.relevance * 100)}%
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`w-3 h-3 rounded-full ${getImpactColor(selectedInsight.impact)}`}
                        />
                        <Badge variant="outline">
                          {getCategoryLabel(selectedInsight.category)}
                        </Badge>
                        <Badge variant="secondary">
                          {selectedInsight.impact === 'high'
                            ? 'High Impact'
                            : selectedInsight.impact === 'medium'
                              ? 'Medium Impact'
                              : 'Low Impact'}
                        </Badge>
                      </div>
                      <CardTitle>{selectedInsight.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Brain className="h-4 w-4 text-indigo-500" />
                      <span>AI-generated insight</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-4 text-gray-700">{selectedInsight.description}</div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2">
                        <div className="font-medium">Evidence Base</div>
                        <div className="text-sm text-gray-700">{selectedInsight.evidence}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="font-medium">Recommendation</div>
                        <div className="text-sm text-gray-700">
                          {selectedInsight.recommendation}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Confidence Score</div>
                        <div className="flex items-center gap-2">
                          <Progress value={selectedInsight.confidence} className="h-2 flex-grow" />
                          <span className="text-sm font-medium">{selectedInsight.confidence}%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Relevance Score</div>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={selectedInsight.relevance * 100}
                            className="h-2 flex-grow"
                          />
                          <span className="text-sm font-medium">
                            {Math.round(selectedInsight.relevance * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="font-medium mb-2">Related CSRs</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedInsight.relatedCSRs.map((csr, i) => (
                        <Badge key={i} variant="outline" className="cursor-pointer">
                          {csr}
                        </Badge>
                      ))}
                      <Button variant="link" size="sm" className="h-6 px-0">
                        View all related CSRs
                      </Button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4">
                  <div className="flex justify-between w-full">
                    <Button variant="outline" size="sm" className="gap-1">
                      <BookOpen className="h-4 w-4" />
                      Related Literature
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Share2 className="h-4 w-4" />
                        Share
                      </Button>
                      <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700">
                        <Target className="h-4 w-4" />
                        Apply to Study
                      </Button>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intelligence Visualization */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Insight Distribution by Category</CardTitle>
            <CardDescription>
              Visualization of insight distribution across categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60 flex items-center justify-center bg-gray-50 rounded-md">
              <div className="text-center">
                <BarChart2 className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Insight Distribution Chart</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Impact vs. Confidence Map</CardTitle>
            <CardDescription>Visualization of insights by impact and confidence</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60 flex items-center justify-center bg-gray-50 rounded-md">
              <div className="text-center">
                <LineChart className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Impact/Confidence Chart</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CSRIntelligenceInsights;
