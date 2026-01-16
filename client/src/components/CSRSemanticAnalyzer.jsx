import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Brain, FileSearch, TrendingUp, AlertCircle, CheckCircle, Lightbulb, Target, BarChart3, Network, Zap, FileText, ChevronRight, Loader2 } from 'lucide-react'

const CSRSemanticAnalyzer = () => {
  const [activeAnalysis, setActiveAnalysis] = useState('similarity');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [queryText, setQueryText] = useState('');

  // Semantic analysis features
  const performSemanticAnalysis = async (analysisType, query) => {
    setAnalysisLoading(true);
    try {
      // Simulate API call to semantic analyzer
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockResults = {
        similarity: {
          type: 'Semantic Similarity Analysis',
          confidence: 94,
          matches: [
            {
              id: 'CSR_SEM_001',
              title: 'Phase III Study of Pembrolizumab in Advanced NSCLC',
              similarity: 0.92,
              key_concepts: ['PD-L1 expression', 'biomarker stratification', 'overall survival'],
              semantic_distance: 0.08,
              regulatory_alignment: 'High',
            },
            {
              id: 'CSR_SEM_002',
              title: 'Randomized Trial of Atezolizumab vs Docetaxel',
              similarity: 0.89,
              key_concepts: ['immune checkpoint inhibitor', 'progression-free survival'],
              semantic_distance: 0.11,
              regulatory_alignment: 'High',
            },
          ],
          insights: [
            'Strong semantic clustering around immune checkpoint inhibitors',
            'Consistent endpoint selection patterns across similar indications',
            'Regulatory pathway alignment suggests optimal submission strategy',
          ],
        },
        concepts: {
          type: 'Concept Extraction & Mapping',
          confidence: 91,
          extracted_concepts: [
            {
              concept: 'Primary Endpoint',
              frequency: 245,
              strength: 0.95,
              regulatory_significance: 'Critical',
            },
            {
              concept: 'Biomarker Stratification',
              frequency: 189,
              strength: 0.87,
              regulatory_significance: 'High',
            },
            {
              concept: 'Safety Run-in',
              frequency: 134,
              strength: 0.82,
              regulatory_significance: 'Medium',
            },
            {
              concept: 'Interim Analysis',
              frequency: 167,
              strength: 0.79,
              regulatory_significance: 'High',
            },
          ],
          concept_relationships: [
            {
              from: 'Primary Endpoint',
              to: 'Statistical Power',
              relationship: 'determines',
              strength: 0.94,
            },
            {
              from: 'Biomarker Stratification',
              to: 'Patient Selection',
              relationship: 'enables',
              strength: 0.89,
            },
          ],
          regulatory_mapping: {
            'ICH E9': ['Primary Endpoint', 'Statistical Power', 'Interim Analysis'],
            'FDA Guidance': ['Biomarker Stratification', 'Patient Selection'],
          },
        },
        trends: {
          type: 'Trend Analysis & Prediction',
          confidence: 87,
          identified_trends: [
            {
              trend: 'Adaptive Trial Design Adoption',
              growth_rate: '+34%',
              time_period: '2020-2024',
              therapeutic_areas: ['Oncology', 'Neurology'],
              regulatory_impact: 'Positive',
              prediction: 'Continued growth expected through 2025',
            },
            {
              trend: 'Patient-Reported Outcomes Integration',
              growth_rate: '+28%',
              time_period: '2021-2024',
              therapeutic_areas: ['Oncology', 'Immunology'],
              regulatory_impact: 'Neutral',
              prediction: 'Regulatory requirements expected to increase',
            },
          ],
          future_predictions: [
            'Digital endpoints adoption will accelerate by 45% in 2025',
            'Real-world evidence integration requirements will expand',
            'Decentralized trial components will become standard',
          ],
        },
      };

      setAnalysisResults(mockResults[analysisType]);
    } catch (error) {
      console.error('Semantic analysis error:', error);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const renderSimilarityResults = () => {
    if (!analysisResults || analysisResults.type !== 'Semantic Similarity Analysis') return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Semantic Similarity Results</h3>
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            {analysisResults.confidence}% Confidence
          </Badge>
        </div>

        <div className="grid gap-4">
          {analysisResults.matches.map((match, idx) => (
            <Card key={idx} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{match.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">ID: {match.id}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">
                      {(match.similarity * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">Similarity</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Key Concepts:</span>
                    <div className="flex flex-wrap gap-1">
                      {match.key_concepts.map((concept, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {concept}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span>Semantic Distance: {match.semantic_distance}</span>
                    <Badge
                      variant={match.regulatory_alignment === 'High' ? 'default' : 'secondary'}
                    >
                      {match.regulatory_alignment} Regulatory Alignment
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Lightbulb className="mr-2 h-4 w-4" />
              Semantic Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysisResults.insights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderConceptResults = () => {
    if (!analysisResults || analysisResults.type !== 'Concept Extraction & Mapping') return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Extracted Concepts</h3>
          <Badge variant="outline" className="bg-green-50 text-green-700">
            {analysisResults.confidence}% Confidence
          </Badge>
        </div>

        <div className="grid gap-3">
          {analysisResults.extracted_concepts.map((concept, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{concept.concept}</h4>
                  <Badge variant="outline" className="text-xs">
                    {concept.regulatory_significance}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">Freq: {concept.frequency}</div>
                  <div className="text-xs text-gray-500">Strength: {concept.strength}</div>
                </div>
              </div>
              <Progress value={concept.strength * 100} className="h-2" />
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Network className="mr-2 h-4 w-4" />
              Concept Relationships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysisResults.concept_relationships.map((rel, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Badge variant="outline">{rel.from}</Badge>
                  <span className="text-sm text-gray-600">{rel.relationship}</span>
                  <Badge variant="outline">{rel.to}</Badge>
                  <div className="ml-auto text-xs text-gray-500">Strength: {rel.strength}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTrendResults = () => {
    if (!analysisResults || analysisResults.type !== 'Trend Analysis & Prediction') return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Trend Analysis</h3>
          <Badge variant="outline" className="bg-purple-50 text-purple-700">
            {analysisResults.confidence}% Confidence
          </Badge>
        </div>

        <div className="grid gap-4">
          {analysisResults.identified_trends.map((trend, idx) => (
            <Card key={idx} className="border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-medium">{trend.trend}</h4>
                    <p className="text-sm text-gray-600 mt-1">{trend.prediction}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-600">{trend.growth_rate}</div>
                    <div className="text-xs text-gray-500">{trend.time_period}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Therapeutic Areas:</span>
                    <div className="flex flex-wrap gap-1">
                      {trend.therapeutic_areas.map((area, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {area}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span>Regulatory Impact: {trend.regulatory_impact}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Target className="mr-2 h-4 w-4" />
              Future Predictions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysisResults.future_predictions.map((prediction, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 mt-0.5 text-purple-500 flex-shrink-0" />
                  <span>{prediction}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="mr-2 h-5 w-5" />
            Advanced Semantic Analysis
          </CardTitle>
          <CardDescription>
            AI-powered semantic analysis of CSR content with regulatory intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis Query</label>
              <Textarea
                placeholder="Enter your analysis query (e.g., 'Compare primary endpoints in oncology Phase III trials')"
                value={queryText}
                onChange={e => setQueryText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <Tabs value={activeAnalysis} onValueChange={setActiveAnalysis} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="similarity">Similarity Analysis</TabsTrigger>
                <TabsTrigger value="concepts">Concept Extraction</TabsTrigger>
                <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
              </TabsList>

              <div className="mt-4">
                <Button
                  onClick={() => performSemanticAnalysis(activeAnalysis, queryText)}
                  disabled={analysisLoading || !queryText.trim()}
                  className="w-full"
                >
                  {analysisLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Run {activeAnalysis.charAt(0).toUpperCase() + activeAnalysis.slice(1)}{' '}
                      Analysis
                    </>
                  )}
                </Button>
              </div>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {analysisResults && (
        <Card>
          <CardContent className="p-6">
            <TabsContent value="similarity" className="mt-0">
              {renderSimilarityResults()}
            </TabsContent>
            <TabsContent value="concepts" className="mt-0">
              {renderConceptResults()}
            </TabsContent>
            <TabsContent value="trends" className="mt-0">
              {renderTrendResults()}
            </TabsContent>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CSRSemanticAnalyzer;
