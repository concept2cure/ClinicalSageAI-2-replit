import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  GitCompare,
  BarChart3,
  Download,
  Eye,
  Sparkles,
} from 'lucide-react';

export default function EquivalenceAnalysisDashboard({ subjectDevice, predicateDevice, onAnalysisComplete }) {
  const { toast } = useToast();
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    if (subjectDevice && predicateDevice && !analysisData) {
      performAnalysis();
    }
  }, [subjectDevice, predicateDevice]);

  const performAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/510k/equivalence-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectDevice,
          predicateDevice,
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const result = await response.json();
      setAnalysisData(result);

      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }

      toast({
        title: 'Analysis Complete',
        description: `Equivalence score: ${result.overallScore}%`,
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return <Badge className="bg-green-500">Strong Equivalence</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500">Moderate Equivalence</Badge>;
    return <Badge variant="destructive">Weak Equivalence</Badge>;
  };

  const renderComparisonRow = (category, subjectValue, predicateValue, match) => (
    <div className="grid grid-cols-5 gap-4 p-3 border-b hover:bg-gray-50">
      <div className="font-medium">{category}</div>
      <div className="col-span-2 text-sm">{subjectValue}</div>
      <div className="col-span-2 text-sm flex items-center gap-2">
        {predicateValue}
        {match === 'exact' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {match === 'similar' && <Minus className="w-4 h-4 text-yellow-500" />}
        {match === 'different' && <XCircle className="w-4 h-4 text-red-500" />}
      </div>
    </div>
  );

  if (isAnalyzing) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Sparkles className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
          <h3 className="text-lg font-semibold mb-2">Analyzing Equivalence</h3>
          <p className="text-sm text-gray-600">AI is comparing device characteristics...</p>
        </CardContent>
      </Card>
    );
  }

  if (!analysisData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GitCompare className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600">Select both subject and predicate devices to begin analysis</p>
        </CardContent>
      </Card>
    );
  }

  const {
    overallScore = 0,
    technologicalCharacteristics = {},
    intendedUse = {},
    performanceData = {},
    biocompatibility = {},
    riskAnalysis = {},
    differences = [],
    similarities = [],
    recommendations = [],
  } = analysisData;

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Equivalence Analysis Results</CardTitle>
              <CardDescription>
                Comparative assessment between subject and predicate devices
              </CardDescription>
            </div>
            {getScoreBadge(overallScore)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Overall Equivalence Score</span>
                  <span className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
                    {overallScore}%
                  </span>
                </div>
                <Progress value={overallScore} className="h-3" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center p-4 border rounded-lg">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{similarities.length}</div>
                <div className="text-sm text-gray-600">Similarities</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold">{differences.length}</div>
                <div className="text-sm text-gray-600">Differences</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <FileText className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{recommendations.length}</div>
                <div className="text-sm text-gray-600">Recommendations</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Comparison Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="technology">Technology</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Similarities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {similarities.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
                {similarities.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No significant similarities identified</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Differences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {differences.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
                {differences.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No significant differences identified</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technology">
          <Card>
            <CardHeader>
              <CardTitle>Technological Characteristics Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-5 gap-4 p-3 bg-gray-100 font-semibold text-sm">
                  <div>Characteristic</div>
                  <div className="col-span-2">Subject Device</div>
                  <div className="col-span-2">Predicate Device</div>
                </div>
                {Object.entries(technologicalCharacteristics).map(([key, data]) =>
                  renderComparisonRow(
                    key.replace(/([A-Z])/g, ' $1').trim(),
                    data.subject,
                    data.predicate,
                    data.match
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Data Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(performanceData).map(([metric, data]) => (
                  <div key={metric} className="border-b pb-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{metric}</span>
                      {data.match === 'better' && <TrendingUp className="w-5 h-5 text-green-500" />}
                      {data.match === 'worse' && <TrendingDown className="w-5 h-5 text-red-500" />}
                      {data.match === 'equivalent' && <Minus className="w-5 h-5 text-gray-500" />}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Subject: {data.subject}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Predicate: {data.predicate}</div>
                      </div>
                    </div>
                    {data.note && (
                      <p className="text-xs text-gray-500 mt-2 italic">{data.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk">
          <Card>
            <CardHeader>
              <CardTitle>Risk Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {riskAnalysis.items?.map((risk, idx) => (
                  <Alert key={idx} variant={risk.severity === 'high' ? 'destructive' : 'default'}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold">{risk.category}</div>
                      <p className="text-sm mt-1">{risk.description}</p>
                      <div className="mt-2">
                        <Badge variant={risk.severity === 'high' ? 'destructive' : 'secondary'}>
                          {risk.severity} risk
                        </Badge>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
                {(!riskAnalysis.items || riskAnalysis.items.length === 0) && (
                  <p className="text-sm text-gray-500 italic">No significant risks identified</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{rec}</p>
                    </div>
                  </div>
                ))}
                {recommendations.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No specific recommendations at this time</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
        <Button onClick={performAnalysis}>
          <BarChart3 className="w-4 h-4 mr-2" />
          Re-run Analysis
        </Button>
      </div>
    </div>
  );
}
