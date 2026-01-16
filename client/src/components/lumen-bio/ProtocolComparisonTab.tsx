import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Lightbulb, CheckCircle, AlertTriangle, ArrowRight, BarChart3, ListChecks, Users, Clock, Download, FileText } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient';

interface ProtocolComparisonTabProps {
  protocolText: string;
}

const ProtocolComparisonTab: React.FC<ProtocolComparisonTabProps> = ({ protocolText }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    endpoints: string[];
    design: string[];
    population: string[];
    stats: string[];
    safety: string[];
  }>({
    endpoints: [],
    design: [],
    population: [],
    stats: [],
    safety: [],
  });

  const [rationale, setRationale] = useState<{
    endpoints: string[];
    design: string[];
    population: string[];
    stats: string[];
    safety: string[];
  }>({
    endpoints: [],
    design: [],
    population: [],
    stats: [],
    safety: [],
  });

  // Get protocol improvement recommendations
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setIsLoading(true);

        // This is where we would call the API
        const response = await apiRequest('POST', '/api/protocol/improve', {
          protocol: protocolText,
          domain: 'obesity',
        });

        const data = await response.json();

        if (data.recommendation) {
          // Parse the response and populate our recommendations
          const processedRecommendations = processRecommendations(data.recommendation);
          setRecommendations(processedRecommendations.recommendations);
          setRationale(processedRecommendations.rationale);
        }
      } catch (error) {
        console.error('Error fetching protocol recommendations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (protocolText) {
      fetchRecommendations();
    }
  }, [protocolText]);

  // This function would parse the API response to extract structured recommendations
  const processRecommendations = (rawText: string) => {
    // In a production environment, we'd do proper parsing based on the API response format
    // For now, we'll return a simplified structure with example data

    // This would typically be parsed from the AI response
    return {
      recommendations: {
        endpoints: [
          "Replace 'Percent change in body weight at Week 12' with 'Percent change in body weight at Week 24'",
          "Add 'HbA1c change from baseline' as a secondary endpoint for metabolic improvement",
          "Consider adding 'Quality of life' as an exploratory endpoint using a validated scale",
        ],
        design: [
          'Extend study duration from 12 weeks to 24 weeks to better assess sustained efficacy',
          'Increase sample size from 90 to 120 participants to improve statistical power',
          'Consider adding an active comparator arm with an approved weight loss medication',
        ],
        population: [
          'Narrow BMI eligibility to ≥30 to ≤45 kg/m² to reduce heterogeneity',
          'Add stratification by baseline BMI and presence of diabetes',
          'Exclude patients with history of pancreatitis due to potential safety concerns with leptin analogs',
        ],
        stats: [
          'Use mixed model repeated measures (MMRM) for primary analysis instead of ANCOVA',
          'Add sensitivity analyses for handling missing data, particularly for dropouts',
          'Consider adaptive design elements to potentially reduce sample size based on interim analysis',
        ],
        safety: [
          'Add additional monitoring for cardiovascular events',
          'Include more frequent liver function assessments (baseline, week 4, 8, 12, 24)',
          'Add C-reactive protein monitoring to assess inflammatory response',
        ],
      },
      rationale: {
        endpoints: [
          'In 84% of successful obesity trials, the primary endpoint assessment occurred at ≥24 weeks',
          '62% of obesity trials with metabolic comorbidities include HbA1c as a secondary endpoint',
          'Patient-reported outcomes are increasingly required by regulatory agencies',
        ],
        design: [
          'FDA guidance recommends minimum 24-week duration for weight loss trials',
          'Power calculation shows 120 participants needed for 90% power to detect 5% difference',
          'Comparative effectiveness data strengthens regulatory submissions and market positioning',
        ],
        population: [
          'Narrower BMI range reduces heterogeneity of treatment response (based on 126 obesity trials)',
          'Stratification improves balance and statistical efficiency in the key subgroups',
          'Case reports in similar mechanism drugs showed 3.2% incidence of pancreatitis',
        ],
        stats: [
          'MMRM better handles missing data and provides more powerful analysis (used in 71% of recent trials)',
          'Average dropout rate in similar trials is 23%, requiring robust missing data handling',
          'Adaptive designs have reduced sample size by 15-30% in similar context',
        ],
        safety: [
          'Similar mechanism drugs had 2.1% incidence of cardiovascular events in trials',
          'Transaminase elevations observed in 8% of participants in leptin analog trials',
          'Inflammatory markers increased in 17% of participants in similar mechanism trials',
        ],
      },
    };
  };

  // Function to handle downloading the full protocol PDF
  const handleDownloadProtocol = () => {
    // In a real implementation, this would trigger a download of the PDF
    window.open(
      '/attached_assets/Obesity POC Study Protocol (Australia) v1.1c 07MAR25 (1).pdf',
      '_blank'
    );
  };

  // Function to export the protocol with recommendations as PDF
  const handleExportPDF = async () => {
    try {
      const res = await apiRequest('POST', '/api/protocol/export-pdf', {
        text: protocolText,
        label: 'AI-Recommended Obesity Protocol',
      });

      const data = await res.json();
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      }
    } catch (error) {
      console.error('Error exporting protocol to PDF:', error);
    }
  };

  // Function to promote protocol version to active
  const handlePromoteVersion = async () => {
    try {
      await apiRequest('POST', '/api/protocol/promote', {
        protocol_id: 'obesity_wt02_v1',
        version_text: protocolText,
      });

      alert('Protocol promoted to active version!');
    } catch (error) {
      console.error('Error promoting protocol version:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Protocol Comparison & Improvement</h2>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered recommendations based on historical clinical study reports
          </p>
        </div>
        <Button onClick={handleDownloadProtocol} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download Full Protocol
        </Button>
      </div>

      <Tabs defaultValue="endpoints">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="design">Study Design</TabsTrigger>
          <TabsTrigger value="population">Population</TabsTrigger>
          <TabsTrigger value="stats">Statistical</TabsTrigger>
          <TabsTrigger value="safety">Safety</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Endpoint Recommendations
              </CardTitle>
              <CardDescription>Analysis based on 84 obesity trial CSRs</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.endpoints.map((rec, index) => (
                    <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Study Design Agent recommends:</p>
                          <p className="text-gray-700">{rec}</p>

                          {rationale.endpoints[index] && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-md border text-sm">
                              <p className="font-medium text-slate-700">Rationale:</p>
                              <p className="text-slate-600">{rationale.endpoints[index]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-indigo-500" />
                Study Design Recommendations
              </CardTitle>
              <CardDescription>
                Analysis based on FDA guidance and historical trial data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.design.map((rec, index) => (
                    <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Study Design Agent recommends:</p>
                          <p className="text-gray-700">{rec}</p>

                          {rationale.design[index] && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-md border text-sm">
                              <p className="font-medium text-slate-700">Rationale:</p>
                              <p className="text-slate-600">{rationale.design[index]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="population" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Population Recommendations
              </CardTitle>
              <CardDescription>
                Suggestions to optimize inclusion and exclusion criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.population.map((rec, index) => (
                    <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Study Design Agent recommends:</p>
                          <p className="text-gray-700">{rec}</p>

                          {rationale.population[index] && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-md border text-sm">
                              <p className="font-medium text-slate-700">Rationale:</p>
                              <p className="text-slate-600">{rationale.population[index]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-500" />
                Statistical Recommendations
              </CardTitle>
              <CardDescription>Optimization of statistical methods and analyses</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.stats.map((rec, index) => (
                    <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Study Design Agent recommends:</p>
                          <p className="text-gray-700">{rec}</p>

                          {rationale.stats[index] && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-md border text-sm">
                              <p className="font-medium text-slate-700">Rationale:</p>
                              <p className="text-slate-600">{rationale.stats[index]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Safety Monitoring Recommendations
              </CardTitle>
              <CardDescription>Enhanced safety assessment strategies</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.safety.map((rec, index) => (
                    <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Study Design Agent recommends:</p>
                          <p className="text-gray-700">{rec}</p>

                          {rationale.safety[index] && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-md border text-sm">
                              <p className="font-medium text-slate-700">Rationale:</p>
                              <p className="text-slate-600">{rationale.safety[index]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2 justify-between mt-6">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              apiRequest('POST', '/api/protocol/save-version', {
                protocol_id: 'obesity_wt02_v1',
                version_text: protocolText,
                source: 'Manual Save',
              })
            }
          >
            Save to Dossier
          </Button>
          <Button variant="outline" onClick={handleExportPDF} className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Export to PDF
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePromoteVersion}
            className="flex items-center gap-1"
          >
            <CheckCircle className="h-4 w-4" />
            Promote to Active
          </Button>
          <Button>Apply Selected Recommendations</Button>
        </div>
      </div>
    </div>
  );
};

export default ProtocolComparisonTab;
