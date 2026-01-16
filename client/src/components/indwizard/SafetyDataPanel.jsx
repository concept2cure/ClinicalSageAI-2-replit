import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle, FileUp, Shield, CheckCircle, XCircle, Zap, HelpCircle, BarChart2 } from 'lucide-react'
import indWizardService from '@/services/indWizardService';

export default function SafetyDataPanel({ productId, submissionId }) {
  const [loading, setLoading] = useState(true);
  const [safetyData, setSafetyData] = useState(null);

  useEffect(() => {
    if (productId && submissionId) {
      setLoading(true);

      indWizardService
        .getSafetyData(productId, submissionId)
        .then(data => {
          setSafetyData(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load safety data:', error);
          setLoading(false);
        });
    }
  }, [productId, submissionId]);

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Shield className="h-5 w-5 mr-2 text-blue-600" />
            Safety Data Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-[300px]">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm text-gray-500">Loading safety data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback if no data is available
  if (!safetyData) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Shield className="h-5 w-5 mr-2 text-blue-600" />
            Safety Data Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center p-8">
          <HelpCircle className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No safety data available</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload preclinical data or connect to existing safety studies to analyze potential
            safety signals.
          </p>
          <Button className="gap-1.5">
            <FileUp className="h-4 w-4" />
            <span>Upload Safety Data</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center">
          <Shield className="h-5 w-5 mr-2 text-blue-600" />
          Safety Data Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full md:w-[400px]">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="preclinical">Preclinical</TabsTrigger>
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
                  <div className="flex items-center text-sm font-medium text-blue-800 mb-1">
                    <Zap className="h-4 w-4 mr-1.5" />
                    <span>Total Studies</span>
                  </div>
                  <div className="text-2xl font-semibold text-blue-900">
                    {safetyData.totalStudies}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    {safetyData.preclinicalStudies} preclinical, {safetyData.clinicalStudies}{' '}
                    clinical
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-md p-3">
                  <div className="flex items-center text-sm font-medium text-amber-800 mb-1">
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    <span>Safety Signals</span>
                  </div>
                  <div className="text-2xl font-semibold text-amber-900">
                    {safetyData.safetySignals.total}
                  </div>
                  <div className="text-xs text-amber-600 mt-1">
                    {safetyData.safetySignals.critical} critical, {safetyData.safetySignals.major}{' '}
                    major, {safetyData.safetySignals.minor} minor
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="bg-gray-50 p-2 border-b flex items-center justify-between">
                  <span className="font-medium text-sm">Key Safety Findings</span>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5" />
                    <span className="text-xs">View Details</span>
                  </Button>
                </div>
                <ScrollArea className="h-[180px]">
                  <div className="p-3 space-y-3">
                    {safetyData.keyFindings.map((finding, index) => (
                      <div key={index} className="flex gap-2">
                        {finding.severity === 'critical' ? (
                          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                        ) : finding.severity === 'major' ? (
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p
                            className={`text-sm ${
                              finding.severity === 'critical'
                                ? 'font-medium text-red-800'
                                : finding.severity === 'major'
                                  ? 'font-medium text-amber-800'
                                  : 'text-gray-700'
                            }`}
                          >
                            {finding.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{finding.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preclinical">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-md p-3">
                  <div className="text-xs font-medium text-green-800 mb-1">Toxicology</div>
                  <div className="text-xl font-semibold text-green-900">
                    {safetyData.preclinical.toxicology}%
                  </div>
                  <div className="text-xs text-green-600 mt-1">Complete</div>
                </div>

                <div className="bg-green-50 border border-green-100 rounded-md p-3">
                  <div className="text-xs font-medium text-green-800 mb-1">Pharmacology</div>
                  <div className="text-xl font-semibold text-green-900">
                    {safetyData.preclinical.pharmacology}%
                  </div>
                  <div className="text-xs text-green-600 mt-1">Complete</div>
                </div>

                <div className="bg-green-50 border border-green-100 rounded-md p-3">
                  <div className="text-xs font-medium text-green-800 mb-1">ADME</div>
                  <div className="text-xl font-semibold text-green-900">
                    {safetyData.preclinical.adme}%
                  </div>
                  <div className="text-xs text-green-600 mt-1">Complete</div>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="bg-gray-50 p-2 border-b flex items-center">
                  <span className="font-medium text-sm">Preclinical Studies</span>
                </div>
                <ScrollArea className="h-[180px]">
                  <div className="divide-y">
                    {safetyData.preclinical.studies.map((study, index) => (
                      <div key={index} className="p-2.5 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{study.title}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              study.status === 'complete'
                                ? 'bg-green-100 text-green-800'
                                : study.status === 'in-progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {study.status}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-500">{study.type}</span>
                          <span className="text-xs text-gray-500">{study.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="clinical">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
                  <div className="text-xs font-medium text-blue-800 mb-1">Clinical Studies</div>
                  <div className="text-xl font-semibold text-blue-900">
                    {safetyData.clinical.studies.length}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    {safetyData.clinical.totalSubjects} total subjects
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-md p-3">
                  <div className="text-xs font-medium text-amber-800 mb-1">SAEs Reported</div>
                  <div className="text-xl font-semibold text-amber-900">
                    {safetyData.clinical.saes}
                  </div>
                  <div className="text-xs text-amber-600 mt-1">
                    {safetyData.clinical.relatedSaes} treatment-related
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="bg-gray-50 p-2 border-b flex items-center">
                  <span className="font-medium text-sm">Adverse Events of Interest</span>
                </div>
                <ScrollArea className="h-[180px]">
                  <div className="divide-y">
                    {safetyData.clinical.adverseEvents.map((event, index) => (
                      <div key={index} className="p-2.5 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{event.term}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              event.severity === 'severe'
                                ? 'bg-red-100 text-red-800'
                                : event.severity === 'moderate'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {event.severity}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-500">
                            Incidence: {event.incidence}%
                          </span>
                          <span className="text-xs text-gray-500">
                            {event.relatedToTreatment
                              ? 'Treatment-related'
                              : 'Not treatment-related'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
