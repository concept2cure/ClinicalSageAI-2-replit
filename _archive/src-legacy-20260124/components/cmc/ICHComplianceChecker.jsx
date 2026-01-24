import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ichStandards = [
  {
    id: 'q1a',
    name: 'ICH Q1A - Stability Testing',
    tooltip: 'Outlines requirements for stability testing of new drug substances and products.',
  },
  {
    id: 'q1b',
    name: 'ICH Q1B - Photostability Testing',
    tooltip: 'Provides guidance on photostability testing of new drug substances and products.',
  },
  {
    id: 'q2r1',
    name: 'ICH Q2(R1) - Validation of Analytical Procedures',
    tooltip: 'Describes characteristics for analytical procedure validation.',
  },
  {
    id: 'q3c',
    name: 'ICH Q3C - Impurities: Residual Solvents',
    tooltip: 'Provides recommended limits for residual solvents in pharmaceuticals.',
  },
  {
    id: 'q3d',
    name: 'ICH Q3D - Elemental Impurities',
    tooltip: 'Establishes limits for elemental impurities in drug products.',
  },
  {
    id: 'q6a',
    name: 'ICH Q6A - Specifications',
    tooltip: 'Guidelines for setting specifications for new drug substances and products.',
  },
  {
    id: 'q6b',
    name: 'ICH Q6B - Specifications: Biologicals',
    tooltip: 'Specifications for biotechnological/biological products.',
  },
  {
    id: 'q8r2',
    name: 'ICH Q8(R2) - Pharmaceutical Development',
    tooltip: 'Outlines a systematic approach to pharmaceutical development.',
  },
  {
    id: 'q9',
    name: 'ICH Q9 - Quality Risk Management',
    tooltip: 'Guidelines for implementing quality risk management.',
  },
  {
    id: 'q10',
    name: 'ICH Q10 - Pharmaceutical Quality System',
    tooltip: 'Describes model for an effective quality management system.',
  },
  {
    id: 'q11',
    name: 'ICH Q11 - Development & Manufacture of Drug Substances',
    tooltip: 'Approaches to developing and manufacturing drug substances.',
  },
  {
    id: 'q12',
    name: 'ICH Q12 - Lifecycle Management',
    tooltip: 'Framework for pharmaceutical lifecycle management.',
  },
  {
    id: 'q13',
    name: 'ICH Q13 - Continuous Manufacturing',
    tooltip: 'Guidelines for continuous manufacturing of drug substances and products.',
  },
  {
    id: 'q14',
    name: 'ICH Q14 - Analytical Procedure Development',
    tooltip: 'Scientific approaches to analytical procedure development.',
  },
];

const ICHComplianceChecker = () => {
  const [selectedICH, setSelectedICH] = useState('q1a');
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState(null);

  const guidelines = {
    q1a: {
      title: 'Q1A(R2) - Stability Testing of New Drug Substances and Products',
      sections: [
        { id: 'storage', name: 'Storage Conditions', compliant: false, score: 0, maxScore: 100 },
        {
          id: 'testing-frequency',
          name: 'Testing Frequency',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'specifications',
          name: 'Stability-Indicating Specifications',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'container',
          name: 'Container Closure System',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        { id: 'evaluation', name: 'Evaluation', compliant: false, score: 0, maxScore: 100 },
      ],
    },
    q2r1: {
      title: 'Q2(R1) - Validation of Analytical Procedures',
      sections: [
        { id: 'specificity', name: 'Specificity', compliant: false, score: 0, maxScore: 100 },
        { id: 'linearity', name: 'Linearity', compliant: false, score: 0, maxScore: 100 },
        { id: 'accuracy', name: 'Accuracy', compliant: false, score: 0, maxScore: 100 },
        { id: 'precision', name: 'Precision', compliant: false, score: 0, maxScore: 100 },
        { id: 'range', name: 'Range', compliant: false, score: 0, maxScore: 100 },
      ],
    },
    q3a: {
      title: 'Q3A(R2) - Impurities in New Drug Substances',
      sections: [
        {
          id: 'classification',
          name: 'Classification of Impurities',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'reporting',
          name: 'Reporting Thresholds',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'identification',
          name: 'Identification Thresholds',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'qualification',
          name: 'Qualification Thresholds',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'analytical',
          name: 'Analytical Procedures',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
      ],
    },
    q6a: {
      title: 'Q6A - Specifications: Test Procedures and Acceptance Criteria',
      sections: [
        {
          id: 'universal-tests',
          name: 'Universal Tests',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        { id: 'specific-tests', name: 'Specific Tests', compliant: false, score: 0, maxScore: 100 },
        { id: 'documentation', name: 'Documentation', compliant: false, score: 0, maxScore: 100 },
        {
          id: 'justification',
          name: 'Justification of Specifications',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'acceptance-criteria',
          name: 'Acceptance Criteria',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
      ],
    },
    q8r2: {
      title: 'Q8(R2) - Pharmaceutical Development',
      sections: [
        {
          id: 'qbd',
          name: 'Quality by Design (QbD) Approach',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        { id: 'design-space', name: 'Design Space', compliant: false, score: 0, maxScore: 100 },
        {
          id: 'control-strategy',
          name: 'Control Strategy',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'product-lifecycle',
          name: 'Product Lifecycle Management',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
        {
          id: 'risk-assessment',
          name: 'Quality Risk Assessment',
          compliant: false,
          score: 0,
          maxScore: 100,
        },
      ],
    },
  };

  const runAnalysis = () => {
    // This would normally be an API call to analyze uploaded documents
    // For demo, we'll simulate with random scores

    const updatedGuidelines = { ...guidelines };
    let totalScore = 0;
    let maxPossibleScore = 0;

    // Simulate analysis results
    updatedGuidelines[selectedICH].sections = updatedGuidelines[selectedICH].sections.map(
      section => {
        // Random score between 40 and 100
        const score = Math.floor(Math.random() * 61) + 40;
        const compliant = score >= 80;

        totalScore += score;
        maxPossibleScore += section.maxScore;

        return {
          ...section,
          score,
          compliant,
        };
      }
    );

    // Calculate overall compliance
    const overallPercentage = Math.round((totalScore / maxPossibleScore) * 100);
    const allCompliant = updatedGuidelines[selectedICH].sections.every(
      section => section.compliant
    );

    setComplianceStatus({
      guidelines: updatedGuidelines,
      overallScore: overallPercentage,
      overallCompliant: allCompliant,
      criticalFindings: generateCriticalFindings(updatedGuidelines[selectedICH].sections),
      recommendations: generateRecommendations(updatedGuidelines[selectedICH].sections),
    });

    setAnalysisComplete(true);
  };

  const generateCriticalFindings = sections => {
    const nonCompliantSections = sections.filter(section => !section.compliant);

    if (nonCompliantSections.length === 0) {
      return [];
    }

    // Generate "realistic" findings
    const findings = [];

    nonCompliantSections.forEach(section => {
      switch (section.id) {
        case 'storage':
          findings.push(
            'Accelerated stability studies not conducted at required temperature and humidity conditions'
          );
          break;
        case 'testing-frequency':
          findings.push(
            'Stability testing time points do not follow ICH recommendations (0, 3, 6, 9, 12, 18, 24, 36 months)'
          );
          break;
        case 'specifications':
          findings.push('Missing degradation product specifications in stability protocol');
          break;
        case 'container':
          findings.push('Commercial container closure system not used in stability studies');
          break;
        case 'evaluation':
          findings.push('Statistical methods for shelf-life determination not properly documented');
          break;
        case 'specificity':
          findings.push(
            'Method validation lacks demonstration of specificity in presence of degradation products'
          );
          break;
        case 'linearity':
          findings.push(
            'Linearity demonstrated over insufficient range (less than 80-120% of target concentration)'
          );
          break;
        case 'accuracy':
          findings.push('Recovery studies not performed at required concentration levels');
          break;
        case 'precision':
          findings.push('Intermediate precision not evaluated by different analysts');
          break;
        case 'qbd':
          findings.push(
            'Critical quality attributes not fully established and linked to clinical performance'
          );
          break;
        default:
          findings.push(`Non-compliance identified in ${section.name} section`);
      }
    });

    return findings;
  };

  const generateRecommendations = sections => {
    const nonCompliantSections = sections.filter(section => !section.compliant);

    if (nonCompliantSections.length === 0) {
      return [
        'All sections comply with ICH guidelines. Continue to maintain compliance through regular reviews.',
      ];
    }

    // Generate "realistic" recommendations
    const recommendations = [];

    nonCompliantSections.forEach(section => {
      switch (section.id) {
        case 'storage':
          recommendations.push(
            'Conduct additional stability studies at the ICH-recommended conditions (25°C/60% RH for long-term; 40°C/75% RH for accelerated)'
          );
          break;
        case 'testing-frequency':
          recommendations.push(
            'Revise stability protocol to include all ICH-recommended time points for both long-term and accelerated studies'
          );
          break;
        case 'specifications':
          recommendations.push(
            'Develop and validate specific stability-indicating assays for degradation products'
          );
          break;
        case 'container':
          recommendations.push(
            'Conduct new stability studies using the intended commercial container closure system'
          );
          break;
        case 'evaluation':
          recommendations.push(
            'Implement appropriate statistical methods for shelf-life determination including confidence intervals'
          );
          break;
        case 'specificity':
          recommendations.push(
            'Perform forced degradation studies to demonstrate method specificity in the presence of degradation products'
          );
          break;
        case 'linearity':
          recommendations.push(
            'Expand linearity studies to cover 80-120% of target concentration with at least 5 concentration levels'
          );
          break;
        case 'accuracy':
          recommendations.push(
            'Conduct recovery studies at minimum of 3 concentration levels covering the specified range'
          );
          break;
        case 'precision':
          recommendations.push(
            'Evaluate intermediate precision by having different analysts perform the method on different days'
          );
          break;
        case 'qbd':
          recommendations.push(
            'Define critical quality attributes and link them to clinical performance, then develop appropriate control strategy'
          );
          break;
        default:
          recommendations.push(`Address non-compliance issues in ${section.name} section`);
      }
    });

    return recommendations;
  };

  const [selectedStandards, setSelectedStandards] = useState([]); //Example component state

  const toggleStandard = standardId => {
    setSelectedStandards(prevSelected =>
      prevSelected.includes(standardId)
        ? prevSelected.filter(id => id !== standardId)
        : [...prevSelected, standardId]
    );
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>ICH Compliance Checker</CardTitle>
        <CardDescription>
          Analyze your CMC documentation for compliance with ICH guidelines
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select ICH Guideline</label>
            <Select value={selectedICH} onValueChange={setSelectedICH}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select ICH guideline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="q1a">Q1A(R2) - Stability Testing</SelectItem>
                <SelectItem value="q2r1">Q2(R1) - Validation of Analytical Procedures</SelectItem>
                <SelectItem value="q3a">Q3A(R2) - Impurities in New Drug Substances</SelectItem>
                <SelectItem value="q6a">Q6A - Specifications</SelectItem>
                <SelectItem value="q8r2">Q8(R2) - Pharmaceutical Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-4 rounded-md">
            <h3 className="font-medium">{guidelines[selectedICH].title}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your CMC documentation to analyze compliance with this guideline.
            </p>
          </div>

          <div className="grid gap-4">
            <label className="text-sm font-medium">Upload Documents for Analysis</label>
            <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-muted-foreground mb-2 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-sm text-muted-foreground">
                  Drag & drop your files here, or{' '}
                  <span className="text-primary font-medium">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports PDF, DOC, DOCX (Max 20MB per file)
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={runAnalysis}>Run Compliance Analysis</Button>
          </div>

          {/* Example display of ichStandards - this part was not in the original file but seemed intended, I am going to skip*/}
          <div className="space-y-2 mt-4">
            {/*ichStandards.map((standard) => (
                    <div key={standard.id} className="flex items-center relative group">
                      <input
                        type="checkbox"
                        id={standard.id}
                        checked={selectedStandards.includes(standard.id)}
                        onChange={() => toggleStandard(standard.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor={standard.id} className="ml-2 block text-sm text-gray-900">
                        {standard.name}
                      </label>
                      {standard.tooltip && (
                        <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs rounded p-2 max-w-xs z-10">
                          {standard.tooltip}
                        </div>
                      )}
                    </div>
                  ))*/}
          </div>

          {analysisComplete && complianceStatus && (
            <Tabs defaultValue="summary" className="mt-6">
              <TabsList className="mb-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="details">Detailed Analysis</TabsTrigger>
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Overall Compliance</h3>
                      <p className="text-sm text-muted-foreground">
                        Based on analysis of {guidelines[selectedICH].sections.length} criteria
                      </p>
                    </div>
                    <Badge variant={complianceStatus.overallCompliant ? 'success' : 'destructive'}>
                      {complianceStatus.overallCompliant ? 'Compliant' : 'Non-Compliant'}
                    </Badge>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">{complianceStatus.overallScore}% Complete</span>
                      <span className="text-sm">Target: 100%</span>
                    </div>
                    <Progress value={complianceStatus.overallScore} className="h-2" />
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-medium mb-4">Section Compliance</h3>
                    <div className="space-y-4">
                      {complianceStatus.guidelines[selectedICH].sections.map(section => (
                        <div key={section.id} className="grid grid-cols-3 gap-4 items-center">
                          <div>
                            <span className="text-sm font-medium">{section.name}</span>
                          </div>
                          <div>
                            <Progress value={section.score} className="h-2" />
                          </div>
                          <div className="flex items-center justify-end">
                            {section.compliant ? (
                              <Badge
                                variant="outline"
                                className="bg-green-50 text-green-700 border-green-200"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Compliant
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-red-50 text-red-700 border-red-200"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Non-Compliant
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {complianceStatus.criticalFindings.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-lg font-medium mb-4">Critical Findings</h3>
                        <ul className="space-y-2">
                          {complianceStatus.criticalFindings.map((finding, index) => (
                            <li key={index} className="flex items-start">
                              <XCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
                              <span className="text-sm">{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="details">
                <div className="space-y-6">
                  {complianceStatus.guidelines[selectedICH].sections.map(section => (
                    <div key={section.id} className="border rounded-md p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">{section.name}</h3>
                        {section.compliant ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Compliant
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Non-Compliant
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-4 items-center mb-4">
                        <div>
                          <span className="text-sm text-muted-foreground">Compliance Score</span>
                        </div>
                        <div className="col-span-2">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm">{section.score}%</span>
                            <span className="text-sm">Target: 80%</span>
                          </div>
                          <Progress value={section.score} className="h-2" />
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-start">
                          <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium">ICH Requirements</p>
                            <p className="text-sm text-muted-foreground">
                              {section.id === 'storage' &&
                                'Long-term storage conditions: 25°C ± 2°C/60% RH ± 5% RH; Accelerated: 40°C ± 2°C/75% RH ± 5% RH'}
                              {section.id === 'testing-frequency' &&
                                'Long-term: 0, 3, 6, 9, 12, 18, 24, 36 months; Accelerated: 0, 3, 6 months'}
                              {section.id === 'specifications' &&
                                'Stability specifications must include tests for degradation products and other product-specific parameters'}
                              {section.id === 'container' &&
                                'Stability studies must be conducted using the intended commercial container closure system'}
                              {section.id === 'evaluation' &&
                                'Statistical methods must be used for shelf-life determination, including confidence intervals'}
                              {section.id === 'specificity' &&
                                'Ability to assess unequivocally the analyte in the presence of components that may be expected to be present'}
                              {section.id === 'linearity' &&
                                'Linearity should be established across the range of the analytical procedure (80-120% of target concentration)'}
                              {section.id === 'accuracy' &&
                                'Recovery studies at minimum of three concentration levels covering the specified range'}
                              {section.id === 'precision' &&
                                'Evaluation of repeatability, intermediate precision, and reproducibility'}
                              {section.id === 'qbd' &&
                                'Systematic approach to development that begins with predefined objectives and emphasizes product and process understanding and process control'}
                            </p>
                          </div>
                        </div>

                        {!section.compliant && (
                          <div className="flex items-start">
                            <AlertTriangle className="h-5 w-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium">Gap Identified</p>
                              <p className="text-sm text-muted-foreground">
                                {section.id === 'storage' &&
                                  'Documentation does not demonstrate stability studies at required conditions of 40°C/75% RH for accelerated testing'}
                                {section.id === 'testing-frequency' &&
                                  'Missing stability time points at 9 and 18 months for long-term studies'}
                                {section.id === 'specifications' &&
                                  'No specific acceptance criteria for degradation products in stability protocol'}
                                {section.id === 'container' &&
                                  'Stability studies conducted using different container material than proposed commercial packaging'}
                                {section.id === 'evaluation' &&
                                  'No statistical analysis provided for extrapolation of shelf-life'}
                                {section.id === 'specificity' &&
                                  'No forced degradation studies performed to demonstrate specificity'}
                                {section.id === 'linearity' &&
                                  'Linearity demonstrated only at 90-110% of target concentration'}
                                {section.id === 'accuracy' &&
                                  'Recovery studies performed at only one concentration level'}
                                {section.id === 'precision' &&
                                  'Only repeatability evaluated, no intermediate precision data'}
                                {section.id === 'qbd' &&
                                  'Critical quality attributes not clearly defined and linked to clinical performance'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="recommendations">
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                    <h3 className="text-lg font-medium flex items-center">
                      <Info className="h-5 w-5 text-blue-500 mr-2" />
                      Recommendations
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      These recommendations are based on the identified compliance gaps and industry
                      best practices.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {complianceStatus.recommendations.map((recommendation, index) => (
                      <div key={index} className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                        <p className="text-sm">{recommendation}</p>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-medium mb-4">Next Steps</h3>
                    <ol className="list-decimal list-inside space-y-2">
                      <li className="text-sm">
                        Address critical findings highlighted in the analysis
                      </li>
                      <li className="text-sm">Update documentation to meet ICH requirements</li>
                      <li className="text-sm">
                        Re-run compliance check after implementing changes
                      </li>
                      <li className="text-sm">
                        Consider regulatory agency pre-submission consultation if compliance
                        concerns remain
                      </li>
                    </ol>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Export Report</Button>
        <Button variant="outline">Save Analysis</Button>
      </CardFooter>
    </Card>
  );
};

export default ICHComplianceChecker;
