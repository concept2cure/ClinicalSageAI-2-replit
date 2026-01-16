import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import {
  FileText, Download, ChevronLeft, PieChart, Microscope, Beaker, Users, ArrowRight, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkline } from '../lightweight-wrappers.js';
import { Link } from 'wouter';
import { toast } from '../lightweight-wrappers.js';

/**
 * StudyDesignReport Component
 *
 * This component generates a comprehensive study design report based on:
 * 1. Statistical calculations
 * 2. Vector database retrieval of similar trials
 * 3. OpenAI-generated recommendations
 *
 * The report includes:
 * - Study overview and key parameters
 * - Sample size calculation with rationale
 * - Power analysis visualization
 * - Vector-based similar trial insights
 * - Safety parameters based on similar trials
 * - Statistical recommendations
 */
const StudyDesignReport = () => {
  const [location] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const reportId = params.get('id') || 'unknown';
  const [isLoading, setIsLoading] = useState(true);
  const [openAILoading, setOpenAILoading] = useState(true);
  const [studyData, setStudyData] = useState(null);
  const [vectorInsights, setVectorInsights] = useState(null);
  const [aiRecommendations, setAiRecommendations] = useState(null);

  // Simulate data loading from the server
  useEffect(() => {
    // This would typically fetch data from the API
    setTimeout(() => {
      setStudyData({
        title: 'Enzymax Forte Phase II Study Design',
        indication: 'Functional Dyspepsia',
        phase: 'Phase II',
        design: 'Randomized, double-blind, placebo-controlled, parallel-group',
        primaryEndpoint: 'Change in NDI SF score from baseline to week 8',
        secondaryEndpoints: [
          'Quality of life assessment',
          'Global symptom relief',
          'Gastric emptying time',
          'Tolerability assessment',
        ],
        population: 'Adults with functional dyspepsia (Rome IV criteria)',
        duration: '8 weeks',
        visits: 5,
        statisticalParameters: {
          testType: 'superiority',
          alpha: 0.05,
          power: 0.8,
          effectSize: 0.5,
          stdDev: 1.0,
          recommendedN: 128,
          withDropout: 160,
          powerCurve: Array.from({ length: 10 }, (_, i) => ({
            sampleSize: 40 + i * 20,
            power: Math.min(0.95, 0.3 + i * 0.08),
          })),
          simulationResults: {
            meanDifference: 2.8,
            confidenceInterval: [1.9, 3.7],
            probabilityOfSuccess: 0.82,
            requiredSampleSize: 128,
          },
        },
      });

      setVectorInsights({
        similarTrials: [
          {
            id: 'NCT01234567',
            title: 'A Randomized Trial of Enzyme Replacement in Functional Dyspepsia',
            similarity: 0.92,
            sampleSize: 120,
            effectSize: 0.48,
            design: 'Randomized, double-blind, placebo-controlled',
            duration: '8 weeks',
            outcomes: 'Significant improvement in symptom scores (p=0.023)',
          },
          {
            id: 'NCT02345678',
            title: 'Efficacy of Novel Enzyme Formulation in Treating Functional GI Disorders',
            similarity: 0.85,
            sampleSize: 150,
            effectSize: 0.52,
            design: 'Multi-center, randomized, placebo-controlled',
            duration: '12 weeks',
            outcomes: 'Significant improvement in QoL measures (p=0.018)',
          },
          {
            id: 'NCT03456789',
            title: 'Evaluation of Rome IV Criteria in Enzyme Therapy for Digestive Disorders',
            similarity: 0.78,
            sampleSize: 90,
            effectSize: 0.55,
            design: 'Double-blind, crossover',
            duration: '6 weeks per arm',
            outcomes: 'Modest improvement in symptom relief (p=0.067)',
          },
        ],
        aggregateInsights: {
          averageSampleSize: 120,
          recommendedEffectSize: 0.5,
          commonEndpoints: [
            'Change in symptom scores from baseline',
            'Quality of life assessment',
            'Patient global impression of change',
          ],
          typicalDuration: '8-12 weeks',
          keySafetyParameters: [
            'Adverse events related to treatment',
            'Laboratory abnormalities',
            'Vital sign changes',
          ],
          successRate: 0.67,
          commonInclusion: [
            'Adults 18-65 years',
            'Rome IV criteria for functional dyspepsia',
            'Symptoms for at least 6 months',
          ],
          commonExclusion: [
            'History of GI surgery',
            'Concurrent use of acid suppressants',
            'Alarm symptoms (weight loss, bleeding)',
          ],
        },
      });

      setIsLoading(false);

      // Simulate OpenAI recommendations loading
      setTimeout(() => {
        setAiRecommendations({
          summary:
            'The proposed study design for Enzymax Forte in functional dyspepsia is well-aligned with regulatory expectations and prior successful studies. The sample size calculation is appropriate, although consideration for regional differences in response rates may be warranted.',
          strengths: [
            'Sample size calculation based on established effect size',
            'Primary endpoint aligns with FDA guidance for FD studies',
            'Appropriate statistical approach for superiority design',
            'Duration sufficient to detect clinically meaningful changes',
          ],
          improvements: [
            'Consider stratification by symptom subtype (PDS vs. EPS)',
            'Add exploratory biomarkers based on similar trial insights',
            'Consider adaptive design elements for sample size reassessment',
            'Include patient-reported digital diary for symptom tracking',
          ],
          regulatoryInsights: [
            'Design meets FDA requirements for Phase II FD studies',
            'Primary endpoint (NDI-SF) is accepted by regulators',
            'Statistical approach aligns with ICH E9 guidance',
            'Safety monitoring plan meets current expectations',
          ],
          vectorAlignmentScore: 0.89,
        });
        setOpenAILoading(false);
      }, 2500);
    }, 1500);
  }, [reportId]);

  // Reference to the report content for export
  const reportContentRef = useRef(null);

  // Function to generate a printable PDF version of the report
  const handleGeneratePDF = () => {
    window.print();
    toast.success('Exporting PDF. Please use your browser print dialog to save as PDF');
  };

  // Function to generate a Microsoft Word document
  const handleGenerateWord = async () => {
    try {
      toast.loading('Generating Microsoft Word document...');

      // In a real implementation, we would use a library like docx.js
      // or make an API call to a server-side document generation service

      // Simulate API call to convert HTML to DOCX
      setTimeout(() => {
        toast.dismiss();
        toast.success('Microsoft Word document generated successfully!');

        // Create a fake download link that would normally contain blob data
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBBQABgAIAAAAIQD8vHEtfgEAAOgFAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAAC`;
        link.download = `Enzymax_Forte_Study_Design_${reportId.substring(0, 8)}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, 2000);
    } catch (error) {
      toast.dismiss();
      toast.error('Error generating Word document');
      console.error('Error generating Word document:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 space-y-4">
        <div className="w-16 h-16 border-4 border-t-transparent border-orange-500 rounded-full animate-spin"></div>
        <p className="text-xl font-semibold">Generating Study Design Report...</p>
        <p className="text-gray-500">
          Collecting statistical insights and vector database findings
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-6 pb-20 print:p-0">
      <div className="print:hidden mb-6 flex items-center justify-between">
        <Link href="/study-planner">
          <Button variant="outline" className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Study Planner
          </Button>
        </Link>

        <div className="flex gap-2">
          <Button
            onClick={handleGenerateWord}
            variant="outline"
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Export to Word
          </Button>

          <Button onClick={handleGeneratePDF} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export as PDF
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm print:shadow-none">
        <div className="bg-gradient-to-r from-orange-100 to-orange-50 p-8 border-b print:p-4">
          <div className="flex items-start justify-between">
            <div>
              <Badge className="mb-2 text-sm bg-orange-200 hover:bg-orange-300 text-orange-800">
                Report ID: {reportId.substring(0, 8)}
              </Badge>
              <h1 className="text-3xl font-bold text-gray-900 print:text-2xl">{studyData.title}</h1>
              <p className="text-gray-600 mt-2">
                {studyData.design} • {studyData.phase} • {studyData.indication}
              </p>
            </div>
            <div className="print:hidden">
              <div className="flex items-center space-x-1">
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                >
                  Vector DB Enhanced
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs bg-green-50 text-green-700 border-green-200"
                >
                  OpenAI Powered
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-8 print:p-4 print:gap-4">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <Microscope className="h-5 w-5 text-orange-500" />
                Study Overview
              </h2>

              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Study Parameters</h3>
                      <ul className="space-y-2">
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Indication:</span>
                          <span className="font-medium">{studyData.indication}</span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Phase:</span>
                          <span className="font-medium">{studyData.phase}</span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Design:</span>
                          <span className="font-medium">{studyData.design}</span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Duration:</span>
                          <span className="font-medium">{studyData.duration}</span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Visits:</span>
                          <span className="font-medium">{studyData.visits}</span>
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Patient Population</h3>
                      <p className="text-sm text-gray-600 mb-4">{studyData.population}</p>

                      <h3 className="font-medium text-gray-900 mb-2">Endpoints</h3>
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-xs uppercase text-gray-500">Primary</h4>
                          <p className="text-sm">{studyData.primaryEndpoint}</p>
                        </div>
                        <div>
                          <h4 className="text-xs uppercase text-gray-500">Secondary</h4>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {studyData.secondaryEndpoints.map((endpoint, idx) => (
                              <li key={idx}>{endpoint}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <PieChart className="h-5 w-5 text-orange-500" />
                Statistical Design
              </h2>

              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="md:col-span-2">
                      <h3 className="font-medium text-gray-900 mb-3">Sample Size Calculation</h3>
                      <ul className="space-y-2">
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Test Type:</span>
                          <span className="font-medium capitalize">
                            {studyData.statisticalParameters.testType}
                          </span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Alpha:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.alpha}
                          </span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Power:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.power}
                          </span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Effect Size:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.effectSize}
                          </span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Std. Deviation:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.stdDev}
                          </span>
                        </li>
                        <li className="flex justify-between border-b pb-1 text-sm">
                          <span className="text-gray-600">Recommended N:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.recommendedN}
                          </span>
                        </li>
                        <li className="flex justify-between text-sm">
                          <span className="text-gray-600">With 20% Dropout:</span>
                          <span className="font-medium">
                            {studyData.statisticalParameters.withDropout}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <div className="md:col-span-3">
                      <h3 className="font-medium text-gray-900 mb-3">Power Analysis</h3>
                      <div className="h-48 relative">
                        {/* Replace with actual chart when using a real charting library */}
                        <div className="absolute inset-0 flex flex-col">
                          <div className="flex-grow flex items-end space-x-2">
                            {studyData.statisticalParameters.powerCurve.map((point, idx) => {
                              const height = `${point.power * 100}%`;
                              return (
                                <div
                                  key={idx}
                                  className="flex-grow bg-orange-400 rounded-t-sm hover:bg-orange-500 transition-colors"
                                  style={{ height }}
                                  title={`Sample Size: ${point.sampleSize}, Power: ${(point.power * 100).toFixed(1)}%`}
                                >
                                  {point.power >= 0.8 &&
                                    idx ===
                                      studyData.statisticalParameters.powerCurve.findIndex(
                                        p => p.power >= 0.8
                                      ) && (
                                      <div className="w-full flex justify-center -mt-6">
                                        <Badge className="bg-orange-600">80% Power</Badge>
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="h-6 flex items-center justify-between text-xs text-gray-500 px-2">
                            <span>
                              n={studyData.statisticalParameters.powerCurve[0].sampleSize}
                            </span>
                            <span>
                              n=
                              {
                                studyData.statisticalParameters.powerCurve[
                                  studyData.statisticalParameters.powerCurve.length - 1
                                ].sampleSize
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-orange-50 rounded-md border border-orange-100">
                        <h4 className="text-sm font-medium text-orange-800 mb-1">
                          Monte Carlo Simulation Results
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-gray-600">Mean Difference:</p>
                            <p className="font-medium">
                              {studyData.statisticalParameters.simulationResults.meanDifference}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Confidence Interval:</p>
                            <p className="font-medium">
                              [
                              {studyData.statisticalParameters.simulationResults.confidenceInterval.join(
                                ', '
                              )}
                              ]
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Probability of Success:</p>
                            <p className="font-medium">
                              {(
                                studyData.statisticalParameters.simulationResults
                                  .probabilityOfSuccess * 100
                              ).toFixed(1)}
                              %
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Required Sample Size:</p>
                            <p className="font-medium">
                              {studyData.statisticalParameters.simulationResults.requiredSampleSize}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <Beaker className="h-5 w-5 text-orange-500" />
                Vector Database Insights
              </h2>

              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-3">Similar Trial Analysis</h3>
                      <div className="space-y-4">
                        {vectorInsights.similarTrials.map((trial, idx) => (
                          <div key={idx} className="border rounded-md p-3">
                            <div className="flex justify-between">
                              <h4 className="text-sm font-medium">{trial.title}</h4>
                              <Badge variant="outline">
                                {(trial.similarity * 100).toFixed(0)}% similar
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">ID: {trial.id}</p>
                            <div className="grid grid-cols-2 gap-x-2 mt-2 text-xs">
                              <p>
                                <span className="font-medium">Sample Size:</span> {trial.sampleSize}
                              </p>
                              <p>
                                <span className="font-medium">Effect Size:</span> {trial.effectSize}
                              </p>
                              <p>
                                <span className="font-medium">Design:</span> {trial.design}
                              </p>
                              <p>
                                <span className="font-medium">Duration:</span> {trial.duration}
                              </p>
                              <p className="col-span-2 mt-1">
                                <span className="font-medium">Outcomes:</span> {trial.outcomes}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-900 mb-3">Aggregate Insights</h3>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between mb-1">
                            <h4 className="text-sm font-medium">Trial Success Rate</h4>
                            <span className="text-sm font-medium">
                              {(vectorInsights.aggregateInsights.successRate * 100).toFixed(0)}%
                            </span>
                          </div>
                          <Progress
                            value={vectorInsights.aggregateInsights.successRate * 100}
                            className="h-2"
                          />
                        </div>

                        <div className="border-t pt-3">
                          <h4 className="text-sm font-medium mb-2">Common Inclusion Criteria</h4>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {vectorInsights.aggregateInsights.commonInclusion.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="border-t pt-3">
                          <h4 className="text-sm font-medium mb-2">Common Exclusion Criteria</h4>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {vectorInsights.aggregateInsights.commonExclusion.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="border-t pt-3">
                          <h4 className="text-sm font-medium mb-2">Safety Parameters</h4>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {vectorInsights.aggregateInsights.keySafetyParameters.map(
                              (item, idx) => (
                                <li key={idx}>{item}</li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>

          <div className="lg:col-span-1 space-y-8">
            <section>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-orange-500" />
                AI Recommendations
              </h2>

              {openAILoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-center flex-col p-6 space-y-3">
                      <div className="w-10 h-10 border-4 border-t-transparent border-orange-400 rounded-full animate-spin"></div>
                      <p className="text-sm text-gray-500">Generating AI recommendations...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div>
                        <Badge className="mb-2 bg-blue-100 hover:bg-blue-200 text-blue-800 border-none">
                          Vector Alignment Score:{' '}
                          {(aiRecommendations.vectorAlignmentScore * 100).toFixed(0)}%
                        </Badge>
                        <p className="text-sm text-gray-600">{aiRecommendations.summary}</p>
                      </div>

                      <div className="space-y-3 pt-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 text-green-700">
                          <Check className="h-4 w-4 text-green-600" />
                          Design Strengths
                        </h3>
                        <ul className="pl-6 text-sm space-y-1">
                          {aiRecommendations.strengths.map((item, idx) => (
                            <li key={idx} className="list-disc text-gray-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-3 pt-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-700">
                          <ArrowRight className="h-4 w-4 text-amber-600" />
                          Suggested Improvements
                        </h3>
                        <ul className="pl-6 text-sm space-y-1">
                          {aiRecommendations.improvements.map((item, idx) => (
                            <li key={idx} className="list-disc text-gray-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-3 pt-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 text-blue-700">
                          <FileText className="h-4 w-4 text-blue-600" />
                          Regulatory Insights
                        </h3>
                        <ul className="pl-6 text-sm space-y-1">
                          {aiRecommendations.regulatoryInsights.map((item, idx) => (
                            <li key={idx} className="list-disc text-gray-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            <section>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Study Design Checklist</CardTitle>
                  <CardDescription>Critical elements for successful completion</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span>Primary endpoint clearly defined</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span>Sample size calculation completed</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span>Statistical approach defined</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span>Similar trial analysis completed</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span>Patient population defined</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-amber-100 text-amber-700 rounded-full p-0.5">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                      <span>Stratification factors identified</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-amber-100 text-amber-700 rounded-full p-0.5">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                      <span>Biomarker strategy developed</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 bg-red-100 text-red-700 rounded-full p-0.5">
                        <X className="h-3.5 w-3.5" />
                      </div>
                      <span>Interim analysis strategy defined</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button variant="outline" className="w-full">
                    Complete Design Checklist
                  </Button>
                </CardFooter>
              </Card>
            </section>
          </div>
        </div>

        <div className="bg-orange-50 border-t p-6 print:p-4 print:bg-white">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              <p>
                Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
              </p>
              <p>Study Design Report – TrialSage by C2C.AI™</p>
            </div>
            <div className="print:hidden flex gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateWord}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Export to Word
              </Button>
              <Button
                variant="outline"
                onClick={handleGeneratePDF}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export as PDF
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyDesignReport;
