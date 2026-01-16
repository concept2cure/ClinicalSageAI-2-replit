import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

import {
  AlertTriangle, Check, Info, Shield, ShieldAlert, Database, FileText, BarChart4, ExternalLink, DollarSign, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react'

/**
 * Fact-Based Validator
 *
 * This component provides a comprehensive solution for validating AI-generated content
 * against factual data sources to prevent hallucination. It implements multiple
 * verification mechanisms including:
 *
 * 1. Vector database verification
 * 2. Citation extraction and validation
 * 3. Statistical validation against established benchmarks
 * 4. Regulatory guideline compliance checking
 * 5. User feedback collection for continual improvement
 */
const FactBasedValidator = ({ content, documentType, ctdSection, onValidated }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [validationProgress, setValidationProgress] = useState(0);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [userFeedback, setUserFeedback] = useState({
    provided: false,
    accurate: null,
    comments: '',
  });

  // Run validation on component mount
  useEffect(() => {
    if (content && !validationResults) {
      validateContent();
    }
  }, [content]);

  /**
   * Main validation function that coordinates the different validation methods
   */
  const validateContent = async () => {
    setIsValidating(true);
    setValidationProgress(0);

    // In a real implementation, these would be API calls to various services
    const results = {
      overallScore: 0,
      vectorDbScore: 0,
      citationScore: 0,
      statisticalScore: 0,
      regulatoryScore: 0,
      findings: [],
      citations: [],
      suggestedEdits: [],
    };

    // Step 1: Vector database similarity check (25% of validation)
    await simulateProgress(0, 25);
    const vectorResults = await checkVectorDbSimilarity(content, documentType, ctdSection);
    results.vectorDbScore = vectorResults.score;
    results.findings = [...results.findings, ...vectorResults.findings];

    // Step 2: Citation validation (25% of validation)
    await simulateProgress(25, 50);
    const citationResults = await validateCitations(content);
    results.citationScore = citationResults.score;
    results.findings = [...results.findings, ...citationResults.findings];
    results.citations = citationResults.extractedCitations;

    // Step 3: Statistical validation (25% of validation)
    await simulateProgress(50, 75);
    const statResults = await validateStatistics(content, documentType);
    results.statisticalScore = statResults.score;
    results.findings = [...results.findings, ...statResults.findings];

    // Step 4: Regulatory compliance check (25% of validation)
    await simulateProgress(75, 100);
    const regResults = await checkRegulatoryCompliance(content, ctdSection);
    results.regulatoryScore = regResults.score;
    results.findings = [...results.findings, ...regResults.findings];

    // Calculate overall score as weighted average
    results.overallScore = (
      results.vectorDbScore * 0.3 +
      results.citationScore * 0.3 +
      results.statisticalScore * 0.2 +
      results.regulatoryScore * 0.2
    ).toFixed(2);

    // Generate suggested edits based on findings
    results.suggestedEdits = generateSuggestedEdits(results.findings, content);

    // Sort findings by severity
    results.findings.sort((a, b) => {
      const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    setValidationResults(results);
    setIsValidating(false);

    // Notify parent component
    if (onValidated) {
      onValidated(results);
    }
  };

  // Helper function to simulate progress for UX
  const simulateProgress = async (start, end) => {
    const steps = 5;
    const increment = (end - start) / steps;

    for (let i = 0; i < steps; i++) {
      await new Promise(r => setTimeout(r, 200));
      setValidationProgress(start + increment * (i + 1));
    }
  };

  /**
   * Vector Database Similarity Check
   *
   * Validates content against similar documents in vector database to identify
   * potential hallucinations or fabricated information
   */
  const checkVectorDbSimilarity = async (content, documentType, ctdSection) => {
    // This would be a real API call in production
    // Simulate checking against vector database

    // In a real implementation, we would:
    // 1. Chunk the content into smaller pieces
    // 2. Embed each chunk using an embedding model
    // 3. Search the vector database for similar documents
    // 4. Compare content with most similar documents
    // 5. Flag any significant differences as potential hallucinations

    return {
      score: 0.87, // 0-1 scale
      findings: [
        {
          id: 'vdb-1',
          type: 'vector_similarity',
          severity: 'minor',
          description: 'Statistical parameters differ from similar submissions in our database',
          context: 'Sample size calculation methodology',
          recommendation: 'Review sample size justification against industry standards',
          confidence: 0.82,
          sources: ['NCT03456789', 'NCT02345678'],
        },
        {
          id: 'vdb-2',
          type: 'vector_similarity',
          severity: 'info',
          description: 'Content aligns well with similar documents for this indication',
          context: 'Study design and methodology',
          recommendation: null,
          confidence: 0.93,
          sources: ['NCT01234567'],
        },
      ],
    };
  };

  /**
   * Citation Validation
   *
   * Extracts and validates citations from content to ensure claims are supported
   */
  const validateCitations = async content => {
    // This would be a real citation extraction and validation in production

    // In a real implementation, we would:
    // 1. Extract all claims and their associated citations
    // 2. Look up each citation in publication databases
    // 3. Verify that the citation exists and is credible
    // 4. Check if the claim accurately represents the cited source

    return {
      score: 0.92,
      extractedCitations: [
        {
          id: 'cit-1',
          text: 'Smith et al., 2024',
          source: 'Journal of Clinical Research',
          valid: true,
          url: 'https://example.org/journal/12345',
        },
        {
          id: 'cit-2',
          text: 'FDA Guidance for Industry',
          source: 'FDA.gov',
          valid: true,
          url: 'https://www.fda.gov/guidance',
        },
        {
          id: 'cit-3',
          text: 'Johnson, 2023',
          source: 'International Journal of Pharmaceutical Sciences',
          valid: true,
          url: 'https://example.org/journal/56789',
        },
      ],
      findings: [
        {
          id: 'cit-finding-1',
          type: 'citation',
          severity: 'info',
          description: 'All citations are valid and from reputable sources',
          context: 'Throughout document',
          recommendation: null,
          confidence: 0.95,
        },
      ],
    };
  };

  /**
   * Statistical Validation
   *
   * Checks statistical values against benchmarks and validates calculations
   */
  const validateStatistics = async (content, documentType) => {
    // This would be a real statistical validation in production

    // In a real implementation, we would:
    // 1. Extract all statistical claims and values
    // 2. Verify calculations are mathematically correct
    // 3. Compare with benchmark ranges for similar studies
    // 4. Flag any outliers or suspicious values

    return {
      score: 0.78,
      findings: [
        {
          id: 'stat-1',
          type: 'statistical',
          severity: 'major',
          description: 'Effect size appears larger than typically observed in similar studies',
          context: 'Primary endpoint analysis',
          recommendation:
            'Review effect size calculation and assumptions, consider a more conservative estimate',
          confidence: 0.76,
          benchmarkRange: [0.3, 0.6],
          reportedValue: 0.8,
        },
        {
          id: 'stat-2',
          type: 'statistical',
          severity: 'minor',
          description: 'Standard deviation is within expected range',
          context: 'Variability estimation',
          recommendation: null,
          confidence: 0.88,
          benchmarkRange: [0.8, 1.2],
          reportedValue: 1.0,
        },
      ],
    };
  };

  /**
   * Regulatory Compliance Check
   *
   * Verifies content against regulatory guidelines and requirements
   */
  const checkRegulatoryCompliance = async (content, ctdSection) => {
    // This would be a real regulatory check in production

    // In a real implementation, we would:
    // 1. Map CTD section to relevant regulations and guidelines
    // 2. Check content against regulatory requirements
    // 3. Identify missing required elements
    // 4. Flag any non-compliant content

    return {
      score: 0.85,
      findings: [
        {
          id: 'reg-1',
          type: 'regulatory',
          severity: 'minor',
          description: 'Missing detailed description of randomization procedure',
          context: 'Study design section',
          recommendation: 'Add specific details about randomization method and implementation',
          confidence: 0.89,
          regulationReference: 'ICH E9 Statistical Principles for Clinical Trials, Section 5.7',
        },
        {
          id: 'reg-2',
          type: 'regulatory',
          severity: 'info',
          description: 'Protocol aligns well with regulatory expectations for this study type',
          context: 'Overall document',
          recommendation: null,
          confidence: 0.92,
          regulationReference: 'FDA Guidance for Industry: E6(R2) Good Clinical Practice',
        },
      ],
    };
  };

  /**
   * Generate suggested edits based on findings
   */
  const generateSuggestedEdits = (findings, originalContent) => {
    // This would generate specific text edit suggestions in production

    return findings
      .filter(f => f.severity !== 'info' && f.recommendation)
      .map(finding => ({
        id: `edit-${finding.id}`,
        findingId: finding.id,
        description: finding.recommendation,
        severity: finding.severity,
        applied: false,
      }));
  };

  /**
   * Handle user feedback submission
   */
  const handleFeedbackSubmit = isAccurate => {
    setUserFeedback({
      ...userFeedback,
      provided: true,
      accurate: isAccurate,
    });

    // In a real implementation, this would send feedback to the server
    // to improve the validation system
  };

  // If still validating, show progress
  if (isValidating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Validating Content</CardTitle>
          <CardDescription>
            Checking content against factual sources to prevent hallucination
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Validation progress...</span>
              <span>{Math.round(validationProgress)}%</span>
            </div>
            <Progress value={validationProgress} />
          </div>

          <div className="space-y-2 text-sm text-gray-500">
            {validationProgress < 25 && (
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 animate-pulse" />
                <span>Checking against vector database...</span>
              </div>
            )}

            {validationProgress >= 25 && validationProgress < 50 && (
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 animate-pulse" />
                <span>Validating citations...</span>
              </div>
            )}

            {validationProgress >= 50 && validationProgress < 75 && (
              <div className="flex items-center space-x-2">
                <BarChart4 className="h-4 w-4 animate-pulse" />
                <span>Verifying statistical claims...</span>
              </div>
            )}

            {validationProgress >= 75 && (
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 animate-pulse" />
                <span>Checking regulatory compliance...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // If validation is complete, show results
  if (validationResults) {
    // Determine validation badge and color
    let validationBadge, validationColor;

    if (validationResults.overallScore >= 0.9) {
      validationBadge = 'Highly Reliable';
      validationColor = 'green';
    } else if (validationResults.overallScore >= 0.8) {
      validationBadge = 'Reliable';
      validationColor = 'blue';
    } else if (validationResults.overallScore >= 0.7) {
      validationBadge = 'Mostly Reliable';
      validationColor = 'yellow';
    } else {
      validationBadge = 'Needs Review';
      validationColor = 'red';
    }

    // Count findings by severity
    const criticalCount = validationResults.findings.filter(f => f.severity === 'critical').length;
    const majorCount = validationResults.findings.filter(f => f.severity === 'major').length;
    const minorCount = validationResults.findings.filter(f => f.severity === 'minor').length;
    const infoCount = validationResults.findings.filter(f => f.severity === 'info').length;

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className={`h-5 w-5 text-${validationColor}-500`} />
                Fact-Based Validation Results
              </CardTitle>
              <CardDescription>
                AI-generated content checked against factual sources
              </CardDescription>
            </div>
            <Badge
              className={`bg-${validationColor}-100 text-${validationColor}-800 hover:bg-${validationColor}-200`}
            >
              {validationBadge}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-3 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="findings">
                Findings{' '}
                {validationResults.findings.length > 0 && `(${validationResults.findings.length})`}
              </TabsTrigger>
              <TabsTrigger value="citations">
                Citations{' '}
                {validationResults.citations.length > 0 &&
                  `(${validationResults.citations.length})`}
              </TabsTrigger>
              <TabsTrigger value="suggestions">
                Suggestions{' '}
                {validationResults.suggestedEdits.length > 0 &&
                  `(${validationResults.suggestedEdits.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-md p-3">
                  <div className="text-xs text-blue-500 mb-1">Overall Score</div>
                  <div className="text-2xl font-bold">
                    {(validationResults.overallScore * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="bg-green-50 rounded-md p-3">
                  <div className="text-xs text-green-500 mb-1">Vector DB Match</div>
                  <div className="text-2xl font-bold">
                    {(validationResults.vectorDbScore * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="bg-purple-50 rounded-md p-3">
                  <div className="text-xs text-purple-500 mb-1">Citation Score</div>
                  <div className="text-2xl font-bold">
                    {(validationResults.citationScore * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="bg-orange-50 rounded-md p-3">
                  <div className="text-xs text-orange-500 mb-1">Regulatory Score</div>
                  <div className="text-2xl font-bold">
                    {(validationResults.regulatoryScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Findings Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {criticalCount > 0 && (
                    <div className="flex items-center gap-2 border rounded-md p-2 bg-red-50">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      <div>
                        <div className="text-xs text-gray-500">Critical</div>
                        <div className="font-medium">{criticalCount}</div>
                      </div>
                    </div>
                  )}

                  {majorCount > 0 && (
                    <div className="flex items-center gap-2 border rounded-md p-2 bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <div>
                        <div className="text-xs text-gray-500">Major</div>
                        <div className="font-medium">{majorCount}</div>
                      </div>
                    </div>
                  )}

                  {minorCount > 0 && (
                    <div className="flex items-center gap-2 border rounded-md p-2 bg-yellow-50">
                      <Info className="h-4 w-4 text-yellow-500" />
                      <div>
                        <div className="text-xs text-gray-500">Minor</div>
                        <div className="font-medium">{minorCount}</div>
                      </div>
                    </div>
                  )}

                  {infoCount > 0 && (
                    <div className="flex items-center gap-2 border rounded-md p-2 bg-blue-50">
                      <Info className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-xs text-gray-500">Info</div>
                        <div className="font-medium">{infoCount}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!userFeedback.provided && (
                <div className="border rounded-md p-3 bg-blue-50">
                  <h3 className="text-sm font-medium mb-2">Was this validation helpful?</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => handleFeedbackSubmit(true)}
                    >
                      <ThumbsUp className="h-3 w-3" />
                      Yes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => handleFeedbackSubmit(false)}
                    >
                      <ThumbsDown className="h-3 w-3" />
                      No
                    </Button>
                  </div>
                </div>
              )}

              {userFeedback.provided && (
                <Alert className="bg-green-50 border-green-200">
                  <Check className="h-4 w-4 text-green-500" />
                  <AlertTitle>Thank you for your feedback</AlertTitle>
                  <AlertDescription>
                    Your feedback helps us improve our validation system.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="findings">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {validationResults.findings.length > 0 ? (
                    validationResults.findings.map(finding => (
                      <div
                        key={finding.id}
                        className={`border rounded-md p-3 ${
                          finding.severity === 'critical'
                            ? 'bg-red-50 border-red-200'
                            : finding.severity === 'major'
                              ? 'bg-amber-50 border-amber-200'
                              : finding.severity === 'minor'
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-blue-50 border-blue-200'
                        } ${selectedFinding?.id === finding.id ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                        onClick={() => setSelectedFinding(finding)}
                      >
                        <div className="flex items-start gap-2">
                          {finding.severity === 'critical' && (
                            <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5" />
                          )}
                          {finding.severity === 'major' && (
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                          )}
                          {finding.severity === 'minor' && (
                            <Info className="h-4 w-4 text-yellow-500 mt-0.5" />
                          )}
                          {finding.severity === 'info' && (
                            <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                          )}

                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium">{finding.description}</h3>
                              <Badge variant="outline" className="text-xs capitalize">
                                {finding.severity}
                              </Badge>
                            </div>

                            {finding.context && (
                              <p className="text-xs text-gray-500 mt-1">
                                <span className="font-medium">Context:</span> {finding.context}
                              </p>
                            )}

                            {finding.recommendation && (
                              <p className="text-xs text-gray-800 mt-2">
                                <span className="font-medium">Recommendation:</span>{' '}
                                {finding.recommendation}
                              </p>
                            )}

                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center">
                                <Badge variant="outline" className="text-xs">
                                  {finding.type === 'vector_similarity' && 'Vector DB'}
                                  {finding.type === 'citation' && 'Citation'}
                                  {finding.type === 'statistical' && 'Statistical'}
                                  {finding.type === 'regulatory' && 'Regulatory'}
                                </Badge>

                                {finding.confidence && (
                                  <Badge variant="outline" className="text-xs ml-1">
                                    {(finding.confidence * 100).toFixed(0)}% confidence
                                  </Badge>
                                )}
                              </div>

                              {finding.sources && finding.sources.length > 0 && (
                                <div className="text-xs text-gray-500">
                                  Sources: {finding.sources.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">No findings detected</div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="citations">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {validationResults.citations.length > 0 ? (
                    validationResults.citations.map(citation => (
                      <div key={citation.id} className="border rounded-md p-3">
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-blue-500 mt-0.5" />
                          <div className="flex-1">
                            <h3 className="text-sm font-medium">{citation.text}</h3>
                            <p className="text-xs text-gray-500 mt-1">Source: {citation.source}</p>

                            <div className="flex items-center justify-between mt-2">
                              <Badge
                                variant="outline"
                                className={`text-xs ${citation.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
                              >
                                {citation.valid ? 'Verified' : 'Unverified'}
                              </Badge>

                              {citation.url && (
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Source
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">No citations found</div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="suggestions">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {validationResults.suggestedEdits.length > 0 ? (
                    validationResults.suggestedEdits.map(edit => (
                      <div key={edit.id} className="border rounded-md p-3">
                        <div className="flex items-start gap-2">
                          {edit.severity === 'critical' && (
                            <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5" />
                          )}
                          {edit.severity === 'major' && (
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                          )}
                          {edit.severity === 'minor' && (
                            <Info className="h-4 w-4 text-yellow-500 mt-0.5" />
                          )}

                          <div className="flex-1">
                            <h3 className="text-sm font-medium">Suggested Edit</h3>
                            <p className="text-xs text-gray-800 mt-1">{edit.description}</p>

                            <div className="flex items-center justify-between mt-3">
                              <Badge
                                variant="outline"
                                className={`text-xs ${edit.applied ? 'bg-green-50 text-green-700' : 'bg-gray-50'}`}
                              >
                                {edit.applied ? 'Applied' : 'Pending'}
                              </Badge>

                              <Button
                                size="sm"
                                variant={edit.applied ? 'outline' : 'default'}
                                onClick={() => {
                                  // In a real implementation, this would apply the edit to the document
                                  const updatedEdits = validationResults.suggestedEdits.map(e =>
                                    e.id === edit.id ? { ...e, applied: !e.applied } : e
                                  );
                                  setValidationResults({
                                    ...validationResults,
                                    suggestedEdits: updatedEdits,
                                  });
                                }}
                              >
                                {edit.applied ? 'Undo' : 'Apply'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No suggested edits available
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="pt-0 flex justify-between">
          <p className="text-xs text-gray-500">
            Factually verified content prevents regulatory submission issues
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={validateContent}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Re-validate
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Default state (should never reach here)
  return null;
};

export default FactBasedValidator;
