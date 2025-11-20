import React, { useState, useEffect } from 'react';
import ESTARBuilderPanel from '../components/510k/ESTARBuilderPanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle } from 'lucide-react';

// This is a standalone page for the eSTAR Builder that doesn't rely on CERV2Page
export default function ESTARBuilderPage() {
  const { toast } = useToast();

  // Simple state for this demo page
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [estarFormat, setEstarFormat] = useState('zip');
  const [complianceScore, setComplianceScore] = useState(92);

  // Create a mock device profile for demo purposes
  const deviceProfile = {
    id: 'demo-device-123',
    deviceName: 'Demo Medical Device',
    manufacturer: 'Demo Manufacturer',
    deviceClass: 'II',
    description: 'This is a demonstration medical device for FDA 510(k) submission preparation.',
    intendedUse: 'Intended for clinical use in medical settings',
    regulatoryClass: 'Class II',
    regulatoryType: '510(k) Exempt',
  };

  // Mock equivalence data
  const equivalenceData = {
    subject: {
      name: deviceProfile.deviceName,
      manufacturer: deviceProfile.manufacturer,
    },
    predicate: {
      name: 'FDA-Cleared Similar Device',
      manufacturer: 'Established Medical Co.',
      k_number: 'K123456',
    },
    comparison: {
      status: 'complete',
      technicalFeatures: [
        { name: 'Power Source', subject: 'Battery', predicate: 'Battery', equivalent: true },
        {
          name: 'Materials',
          subject: 'Medical grade',
          predicate: 'Medical grade',
          equivalent: true,
        },
        { name: 'Operating Principle', subject: 'Digital', predicate: 'Digital', equivalent: true },
      ],
      clinicalFeatures: [
        { name: 'Intended Use', subject: 'Therapy', predicate: 'Therapy', equivalent: true },
        { name: 'Patient Population', subject: 'Adult', predicate: 'Adult', equivalent: true },
      ],
    },
  };

  // Handler for validation complete
  const handleValidationComplete = results => {
    console.log('Validation results:', results);
    setValidationResults(results);

    toast({
      title: results.passed ? 'Validation Successful' : 'Validation Issues Found',
      description: results.passed
        ? 'eSTAR package meets FDA submission requirements.'
        : `${results.issues?.length || 0} issues need to be resolved before submission.`,
      variant: results.passed ? 'success' : 'warning',
    });
  };

  // Handler for eSTAR generation complete
  const handleGenerationComplete = result => {
    console.log('eSTAR Package generated:', result);
    setGeneratedUrl(result.url || '#');

    toast({
      title: 'eSTAR Package Generated',
      description: 'Your 510(k) submission package is ready for download.',
      variant: 'success',
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">eSTAR Builder Demo</h1>
        <p className="text-gray-600">
          Generate FDA-compliant 510(k) submission packages using the enhanced eSTAR Builder
        </p>
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Device Summary</CardTitle>
            <CardDescription>Current device information for the 510(k) submission</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Device Name</dt>
                <dd className="text-base">{deviceProfile.deviceName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Manufacturer</dt>
                <dd className="text-base">{deviceProfile.manufacturer}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Device Class</dt>
                <dd className="text-base">Class {deviceProfile.deviceClass}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">FDA Compliance Score</dt>
                <dd className="flex items-center gap-2">
                  <Progress value={complianceScore} className="w-24 h-2" />
                  <span className="text-base">{complianceScore}%</span>
                  {complianceScore >= 80 ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ESTARBuilderPanel
          projectId="demo-project-123"
          deviceProfile={deviceProfile}
          complianceScore={complianceScore}
          equivalenceData={equivalenceData}
          onGenerationComplete={handleGenerationComplete}
          onValidationComplete={handleValidationComplete}
          isValidating={isValidating}
          isGenerating={isGenerating}
          estarFormat={estarFormat}
          setEstarFormat={setEstarFormat}
          validationResults={validationResults}
          generatedUrl={generatedUrl}
          setIsValidating={setIsValidating}
          setIsGenerating={setIsGenerating}
          setValidationResults={setValidationResults}
          setGeneratedUrl={setGeneratedUrl}
        />
      </div>
    </div>
  );
}
