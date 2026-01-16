import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, AlertTriangle, Brain, History, Target, FileText, MessageSquare, Search } from 'lucide-react'

export default function PredictiveRegulatoryAnalytics({ projectId, currentModule }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // Mock predictive data
  const predictions = {
    successProbability: 78,
    riskLevel: 'Medium',
    predictedQuestions: [
      {
        id: 1,
        topic: 'Efficacy',
        question: 'The agency may request additional subgroup analysis for the elderly population (>= 75 years) due to limited data in the current pivotal trial.',
        probability: 'High (85%)',
        mitigation: 'Prepare a supplementary analysis plan or reference existing Phase 2 data.'
      },
      {
        id: 2,
        topic: 'Safety',
        question: 'Potential query regarding the mechanism of liver enzyme elevation seen in 2 subjects.',
        probability: 'Medium (60%)',
        mitigation: 'Ensure Hy\'s Law analysis is clearly presented in Module 2.7.4.'
      },
      {
        id: 3,
        topic: 'CMC',
        question: 'Justification for the proposed shelf-life of 24 months based on 12-month real-time data.',
        probability: 'Low (30%)',
        mitigation: 'Highlight the accelerated stability data and statistical extrapolation model.'
      }
    ],
    historicalComparison: [
      { metric: 'Approval Time', value: '10-12 months', benchmark: '10 months', status: 'on-track' },
      { metric: 'First Round Queries', value: '15-20 predicted', benchmark: '25 average', status: 'better' },
    ]
  };

  const runPrediction = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysisComplete(true);
    }, 2500);
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-100 bg-blue-50/30">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-purple-600" />
                Predictive Regulatory Analytics
              </CardTitle>
              <CardDescription>
                AI-driven insights to anticipate regulatory questions and optimize submission strategy
              </CardDescription>
            </div>
            <Button 
              onClick={runPrediction} 
              disabled={isAnalyzing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isAnalyzing ? (
                <>
                  <Brain className="mr-2 h-4 w-4 animate-pulse" /> Analyzing...
                </>
              ) : (
                <>
                  <Target className="mr-2 h-4 w-4" /> Generate Predictions
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        
        {analysisComplete && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Success Probability */}
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="relative inline-flex items-center justify-center">
                    <svg className="h-24 w-24 transform -rotate-90">
                      <circle
                        className="text-gray-200"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="48"
                        cy="48"
                      />
                      <circle
                        className="text-green-500"
                        strokeWidth="8"
                        strokeDasharray={251}
                        strokeDashoffset={251 - (251 * predictions.successProbability) / 100}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="48"
                        cy="48"
                      />
                    </svg>
                    <span className="absolute text-xl font-bold">{predictions.successProbability}%</span>
                  </div>
                  <div className="mt-2 font-medium">Approval Probability</div>
                  <p className="text-xs text-muted-foreground mt-1">Based on current data & historical approvals</p>
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-medium mb-4 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                    Risk Assessment
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Clinical Efficacy</span>
                        <span className="text-green-600 font-medium">Low Risk</span>
                      </div>
                      <Progress value={20} className="h-2 bg-green-100" indicatorClassName="bg-green-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Safety Profile</span>
                        <span className="text-amber-600 font-medium">Medium Risk</span>
                      </div>
                      <Progress value={55} className="h-2 bg-amber-100" indicatorClassName="bg-amber-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>CMC / Quality</span>
                        <span className="text-green-600 font-medium">Low Risk</span>
                      </div>
                      <Progress value={15} className="h-2 bg-green-100" indicatorClassName="bg-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Historical Benchmarks */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-medium mb-4 flex items-center">
                    <History className="h-4 w-4 mr-2 text-blue-500" />
                    Historical Benchmarks
                  </h3>
                  <div className="space-y-4">
                    {predictions.historicalComparison.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                        <div>
                          <div className="text-sm font-medium">{item.metric}</div>
                          <div className="text-xs text-muted-foreground">Benchmark: {item.benchmark}</div>
                        </div>
                        <Badge variant={item.status === 'on-track' || item.status === 'better' ? 'outline' : 'destructive'} className="bg-white">
                          {item.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Predicted Questions */}
            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center">
                <MessageSquare className="h-5 w-5 mr-2 text-purple-600" />
                Predicted Regulatory Questions
              </h3>
              <div className="space-y-4">
                {predictions.predictedQuestions.map((q) => (
                  <div key={q.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{q.topic}</Badge>
                        <span className="text-sm text-muted-foreground">Probability: {q.probability}</span>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="font-medium text-slate-800 mb-3">"{q.question}"</p>
                    <div className="bg-purple-50 p-3 rounded text-sm text-purple-900">
                      <strong>AI Recommendation:</strong> {q.mitigation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}

        {!analysisComplete && !isAnalyzing && (
          <CardContent className="py-12 text-center">
            <Brain className="h-16 w-16 mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">Unlock Predictive Insights</h3>
            <p className="text-slate-500 max-w-md mx-auto mt-2 mb-6">
              Our AI analyzes thousands of historical approvals and rejection letters to predict potential regulatory hurdles for your specific submission.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
