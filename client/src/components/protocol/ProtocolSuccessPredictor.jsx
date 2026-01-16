import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  TrendingUp, BarChart2, Database, Brain, AlertTriangle, Download, FileText, ChevronDown, ChevronUp, Info, CheckCircle2, PieChart, Lightbulb, Gauge, Crosshair } from 'lucide-react'

const ProtocolSuccessPredictor = () => {
  const [loadingResults, setLoadingResults] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [selectedProtocol, setSelectedProtocol] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');

  // Sample protocols
  const protocols = [
    {
      id: 'protocol-001',
      name: 'Phase 2b Efficacy Study - Enzymax Forte',
      indication: 'Type 2 Diabetes',
    },
    { id: 'protocol-002', name: 'Dose-Finding Study - Cardiozen', indication: 'Hypertension' },
    { id: 'protocol-003', name: 'Safety Extension - Neuroclear Device', indication: 'Epilepsy' },
  ];

  // Sample prediction results that would be calculated based on CSR analytics
  const samplePrediction = {
    overallScore: 89,
    recruitmentScore: 92,
    regulatoryScore: 87,
    completionScore: 85,
    publicationScore: 90,
    primaryEndpointScore: 88,
    safetyScore: 94,
    strengths: [
      {
        category: 'Endpoint Selection',
        description:
          'Primary endpoint aligns with 94% of successfully approved studies in this indication',
        score: 94,
      },
      {
        category: 'Study Design',
        description: 'Adaptive design elements correlate with 28% fewer protocol deviations',
        score: 92,
      },
      {
        category: 'Statistical Plan',
        description:
          'Multiple imputation approach for missing data is highly favored by regulators',
        score: 90,
      },
    ],
    weaknesses: [
      {
        category: 'Sample Size',
        description: 'Current sample size may be underpowered based on historical effect sizes',
        score: 68,
        recommendation:
          'Consider increasing sample size by 15-20% or implementing adaptive sample size re-estimation',
      },
      {
        category: 'Inclusion/Exclusion',
        description: 'Overly restrictive inclusion criteria may slow recruitment',
        score: 72,
        recommendation:
          'Broaden HbA1c range criteria from 7.0-9.0% to 6.5-10.0% to improve recruitment rates',
      },
    ],
    similarStudies: [
      {
        id: 'CSR-2022-A452',
        title: 'Phase 2b Study of Drug X in T2DM',
        outcome: 'successful',
        score: 91,
      },
      {
        id: 'CSR-2023-B186',
        title: 'Adaptive Design Trial in Metabolic Disease',
        outcome: 'successful',
        score: 88,
      },
      {
        id: 'CSR-2021-C094',
        title: 'Phase 2 Dose-Finding Study in T2DM',
        outcome: 'successful',
        score: 84,
      },
    ],
    recommendations: [
      'Consider implementing adaptive sample size re-estimation to address potential underpowering',
      'Broaden inclusion criteria for HbA1c to improve recruitment rates',
      'Maintain the planned PRO measures as secondary endpoints based on regulatory success patterns',
      'Consider adding biomarker stratification to enrollment to enhance observed treatment effects',
    ],
  };

  const handlePredictSuccess = async () => {
    if (!selectedProtocol) return;

    setLoadingResults(true);
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    setPrediction(samplePrediction);
    setLoadingResults(false);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-blue-600" />
                Protocol Success Predictor
              </CardTitle>
              <CardDescription>
                AI-powered success prediction based on CSR analytics and protocol optimization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">Select Protocol</label>
                <Select value={selectedProtocol} onValueChange={setSelectedProtocol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map(protocol => (
                      <SelectItem key={protocol.id} value={protocol.id}>
                        {protocol.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handlePredictSuccess}
                disabled={!selectedProtocol || loadingResults}
                className="md:mb-0.5"
              >
                {loadingResults ? (
                  <>
                    <span className="animate-spin mr-2">◌</span>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Predict Success
                  </>
                )}
              </Button>
              <Button variant="outline" className="md:mb-0.5">
                <FileText className="h-4 w-4 mr-2" />
                Upload New Protocol
              </Button>
            </div>
          </div>

          {prediction && (
            <div className="space-y-6">
              {/* Overall Score Dashboard */}
              <div className="bg-blue-50 rounded-lg p-6 text-center">
                <h3 className="text-lg font-semibold mb-2">Overall Success Prediction</h3>
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <div className="w-36 h-36 rounded-full border-8 border-blue-100 flex items-center justify-center">
                      <div className="text-4xl font-bold text-blue-700">
                        {prediction.overallScore}%
                      </div>
                    </div>
                    <div className="absolute -top-4 -right-4 bg-green-500 text-white text-sm font-medium rounded-full h-10 w-10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <p className="text-blue-700 font-medium">Predicted likelihood of study success</p>
                <div className="flex justify-center gap-2 mt-3">
                  <Button size="sm" variant="secondary">
                    <Download className="h-4 w-4 mr-1" />
                    Export Report
                  </Button>
                  <Button size="sm">
                    <Lightbulb className="h-4 w-4 mr-1" />
                    Apply Recommendations
                  </Button>
                </div>
              </div>

              {/* Score Breakdown */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="analysis">Detailed Analysis</TabsTrigger>
                  <TabsTrigger value="similar-studies">Similar Studies</TabsTrigger>
                  <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Recruitment Prediction
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col">
                          <div className="text-2xl font-bold">{prediction.recruitmentScore}%</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant={
                                prediction.recruitmentScore >= 85
                                  ? 'success'
                                  : prediction.recruitmentScore >= 70
                                    ? 'default'
                                    : 'destructive'
                              }
                            >
                              {prediction.recruitmentScore >= 85
                                ? 'Excellent'
                                : prediction.recruitmentScore >= 70
                                  ? 'Good'
                                  : 'Needs Improvement'}
                            </Badge>
                          </div>
                          <Progress value={prediction.recruitmentScore} className="h-1.5 mt-2" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Regulatory Approval
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col">
                          <div className="text-2xl font-bold">{prediction.regulatoryScore}%</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant={
                                prediction.regulatoryScore >= 85
                                  ? 'success'
                                  : prediction.regulatoryScore >= 70
                                    ? 'default'
                                    : 'destructive'
                              }
                            >
                              {prediction.regulatoryScore >= 85
                                ? 'Excellent'
                                : prediction.regulatoryScore >= 70
                                  ? 'Good'
                                  : 'Needs Improvement'}
                            </Badge>
                          </div>
                          <Progress value={prediction.regulatoryScore} className="h-1.5 mt-2" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Primary Endpoint Success
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col">
                          <div className="text-2xl font-bold">
                            {prediction.primaryEndpointScore}%
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant={
                                prediction.primaryEndpointScore >= 85
                                  ? 'success'
                                  : prediction.primaryEndpointScore >= 70
                                    ? 'default'
                                    : 'destructive'
                              }
                            >
                              {prediction.primaryEndpointScore >= 85
                                ? 'Excellent'
                                : prediction.primaryEndpointScore >= 70
                                  ? 'Good'
                                  : 'Needs Improvement'}
                            </Badge>
                          </div>
                          <Progress
                            value={prediction.primaryEndpointScore}
                            className="h-1.5 mt-2"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Strengths and Weaknesses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          Protocol Strengths
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {prediction.strengths.map((item, i) => (
                            <div key={i} className="border-b pb-3 last:border-0">
                              <div className="flex justify-between">
                                <div className="font-medium">{item.category}</div>
                                <Badge variant="outline">{item.score}%</Badge>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          Improvement Areas
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {prediction.weaknesses.map((item, i) => (
                            <div key={i} className="border-b pb-3 last:border-0">
                              <div className="flex justify-between">
                                <div className="font-medium">{item.category}</div>
                                <Badge variant="outline" className="text-amber-600">
                                  {item.score}%
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                              <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
                                <Info className="h-4 w-4" />
                                <span>Recommendation: {item.recommendation}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Detailed Analysis Tab */}
                <TabsContent value="analysis" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Comprehensive Success Metrics</CardTitle>
                      <CardDescription>
                        Detailed breakdown of success prediction metrics based on CSR analytics
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {/* Visualization placeholder */}
                        <div className="h-64 bg-gray-50 rounded-md flex items-center justify-center">
                          <div className="text-center">
                            <BarChart2 className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">Success metrics visualization</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Recruitment Rate</span>
                              <span className="font-medium">{prediction.recruitmentScore}%</span>
                            </div>
                            <Progress value={prediction.recruitmentScore} className="h-2" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Regulatory Approval</span>
                              <span className="font-medium">{prediction.regulatoryScore}%</span>
                            </div>
                            <Progress value={prediction.regulatoryScore} className="h-2" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Study Completion</span>
                              <span className="font-medium">{prediction.completionScore}%</span>
                            </div>
                            <Progress value={prediction.completionScore} className="h-2" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Publication Rate</span>
                              <span className="font-medium">{prediction.publicationScore}%</span>
                            </div>
                            <Progress value={prediction.publicationScore} className="h-2" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Primary Endpoint</span>
                              <span className="font-medium">
                                {prediction.primaryEndpointScore}%
                              </span>
                            </div>
                            <Progress value={prediction.primaryEndpointScore} className="h-2" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Safety Profile</span>
                              <span className="font-medium">{prediction.safetyScore}%</span>
                            </div>
                            <Progress value={prediction.safetyScore} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Similar Studies Tab */}
                <TabsContent value="similar-studies" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Similar CSR Analysis</CardTitle>
                      <CardDescription>
                        Studies with similar design parameters and their outcomes
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-sm text-muted-foreground">
                            Based on analysis of 328 Clinical Study Reports
                          </div>
                          <Button variant="outline" size="sm">
                            <Database className="h-4 w-4 mr-2" />
                            View Source CSRs
                          </Button>
                        </div>

                        {/* Visualization placeholder */}
                        <div className="h-60 bg-gray-50 rounded-md flex items-center justify-center">
                          <div className="text-center">
                            <PieChart className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                              Outcome distribution visualization
                            </p>
                          </div>
                        </div>

                        <div className="border rounded-md">
                          <div className="grid grid-cols-3 gap-4 p-4 border-b font-medium text-sm">
                            <div>CSR ID</div>
                            <div>Study Title</div>
                            <div>Outcome</div>
                          </div>
                          {prediction.similarStudies.map((study, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-3 gap-4 p-4 border-b last:border-0 text-sm"
                            >
                              <div className="text-blue-600 font-medium cursor-pointer hover:underline">
                                {study.id}
                              </div>
                              <div>{study.title}</div>
                              <div>
                                <Badge
                                  variant={
                                    study.outcome === 'successful' ? 'success' : 'destructive'
                                  }
                                >
                                  {study.outcome === 'successful' ? 'Successful' : 'Unsuccessful'}
                                </Badge>
                                <span className="ml-2">{study.score}%</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="text-center">
                          <Button variant="link">
                            View all similar studies (15)
                            <ChevronDown className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Recommendations Tab */}
                <TabsContent value="recommendations" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Optimization Recommendations</CardTitle>
                      <CardDescription>
                        AI-powered recommendations to enhance protocol success probability
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <Card className="shadow-sm bg-blue-50">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Crosshair className="h-5 w-5 text-blue-600" />
                                Key Recommendations
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                {prediction.recommendations.map((rec, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-3 bg-white p-3 rounded-md shadow-sm"
                                  >
                                    <div className="flex-shrink-0 mt-0.5">
                                      <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                                        {i + 1}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-sm">{rec}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Brain className="h-5 w-5 text-purple-600" />
                                Estimated Impact Analysis
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                <div className="p-4 border rounded-md bg-gray-50">
                                  <div className="flex justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      Current Success Prediction
                                    </span>
                                    <span className="font-medium">{prediction.overallScore}%</span>
                                  </div>
                                  <Progress value={prediction.overallScore} className="h-2 mb-4" />

                                  <div className="flex justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      With All Recommendations
                                    </span>
                                    <span className="font-medium">94%</span>
                                  </div>
                                  <Progress value={94} className="h-2 bg-gray-200" />
                                  <div className="h-2 w-full bg-transparent relative -mt-2">
                                    <div
                                      className="absolute top-0 left-0 h-full border-r-2 border-green-500"
                                      style={{ width: `${prediction.overallScore}%` }}
                                    ></div>
                                  </div>

                                  <div className="flex justify-between items-center mt-2 text-sm text-green-600">
                                    <span>Potential Improvement</span>
                                    <div className="flex items-center">
                                      <ChevronUp className="h-4 w-4 mr-1" />
                                      <span>+5%</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between text-sm">
                                    <span>Recruitment Rate Improvement</span>
                                    <span className="text-green-600">+15%</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Regulatory Approval Impact</span>
                                    <span className="text-green-600">+5%</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Completion Rate Enhancement</span>
                                    <span className="text-green-600">+8%</span>
                                  </div>
                                </div>

                                <Button className="w-full">Apply All Recommendations</Button>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex gap-3">
                          <div className="flex-shrink-0">
                            <Info className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm text-amber-800">
                              These recommendations are generated using patterns identified from
                              analyzed CSRs and regulatory submission outcomes. All recommendations
                              should be reviewed by qualified clinical and regulatory professionals
                              before implementation.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {!prediction && !loadingResults && (
            <div className="border rounded-md p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Protocol Success Prediction</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Select a protocol and run the prediction engine to get a comprehensive success
                analysis based on CSR intelligence and protocol optimization.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setSelectedProtocol('protocol-001')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Use Sample Protocol
                </Button>
                <Button variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Browse CSR Database
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProtocolSuccessPredictor;
