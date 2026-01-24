import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart2,
  Activity,
  FileText,
  XCircle,
  PieChart,
  CheckCircle,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import indWizardService from '@/services/indWizardService';

export default function EfficacyAnalysisWidget({ productId, submissionId }) {
  const [loading, setLoading] = useState(true);
  const [efficacyData, setEfficacyData] = useState(null);

  useEffect(() => {
    if (productId && submissionId) {
      setLoading(true);

      indWizardService
        .getEfficacyData(productId, submissionId)
        .then(data => {
          setEfficacyData(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load efficacy data:', error);
          setLoading(false);
        });
    }
  }, [productId, submissionId]);

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Activity className="h-5 w-5 mr-2 text-blue-600" />
            Efficacy Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center h-[300px]">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm text-gray-500">Analyzing efficacy data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback if no data is available
  if (!efficacyData) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <Activity className="h-5 w-5 mr-2 text-blue-600" />
            Efficacy Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center p-8">
          <HelpCircle className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No efficacy data available</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload clinical data or connect to existing efficacy studies to analyze potential
            efficacy signals.
          </p>
          <Button className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Upload Efficacy Data</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center">
          <Activity className="h-5 w-5 mr-2 text-blue-600" />
          Efficacy Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-md p-3">
              <div className="flex items-center text-sm font-medium text-green-800 mb-1">
                <CheckCircle className="h-4 w-4 mr-1.5" />
                <span>Primary Endpoints</span>
              </div>
              <div className="text-2xl font-semibold text-green-900">
                {efficacyData.endpointsMet.primary}/{efficacyData.totalEndpoints.primary}
              </div>
              <div className="text-xs text-green-600 mt-1">Primary endpoints met</div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
              <div className="flex items-center text-sm font-medium text-blue-800 mb-1">
                <PieChart className="h-4 w-4 mr-1.5" />
                <span>Statistical Power</span>
              </div>
              <div className="text-2xl font-semibold text-blue-900">
                {efficacyData.statisticalPower}%
              </div>
              <div className="text-xs text-blue-600 mt-1">Based on sample size</div>
            </div>
          </div>

          <div className="border rounded-md">
            <div className="bg-gray-50 p-2 border-b flex items-center justify-between">
              <span className="font-medium text-sm">Key Efficacy Findings</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                <span className="text-xs">View Details</span>
              </Button>
            </div>
            <ScrollArea className="h-[180px]">
              <div className="p-3 space-y-3">
                {efficacyData.keyFindings.map((finding, index) => (
                  <div key={index} className="flex gap-2">
                    {finding.status === 'positive' ? (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : finding.status === 'neutral' ? (
                      <Clock className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p
                        className={`text-sm ${
                          finding.status === 'positive'
                            ? 'font-medium text-green-800'
                            : finding.status === 'neutral'
                              ? 'font-medium text-blue-800'
                              : 'font-medium text-red-800'
                        }`}
                      >
                        {finding.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{finding.description}</p>
                      {finding.pValue && (
                        <p className="text-xs text-gray-700 mt-1">
                          <span className="font-medium">p-value:</span> {finding.pValue}
                          {finding.pValue < 0.05 && (
                            <span className="text-green-600 ml-1">(Significant)</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded-md">
              <div className="bg-gray-50 p-2 border-b">
                <span className="font-medium text-sm">Dosing Regimens</span>
              </div>
              <div className="p-3 space-y-2">
                {efficacyData.dosingRegimens.map((regimen, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium">{regimen.dose}:</span> {regimen.frequency}
                    {regimen.response && (
                      <span
                        className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                          regimen.response > 75
                            ? 'bg-green-100 text-green-800'
                            : regimen.response > 50
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {regimen.response}% response
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-md">
              <div className="bg-gray-50 p-2 border-b">
                <span className="font-medium text-sm">Population Subgroups</span>
              </div>
              <div className="p-3 space-y-2">
                {efficacyData.subgroups.map((subgroup, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium">{subgroup.name}:</span> {subgroup.effectSize}
                    {subgroup.significant !== undefined && (
                      <span
                        className={`ml-2 text-xs ${
                          subgroup.significant ? 'text-green-600' : 'text-gray-500'
                        }`}
                      >
                        {subgroup.significant ? '(Significant)' : '(Not significant)'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
