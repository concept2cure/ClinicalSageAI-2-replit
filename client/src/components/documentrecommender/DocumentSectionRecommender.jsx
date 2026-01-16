import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, FileText, CheckCircle, AlertCircle, BookOpen } from 'lucide-react'
import { isFeatureEnabled } from '../../flags/featureFlags';
import DocumentSectionRecommenderService from '../../services/DocumentSectionRecommenderService';
import { ContentSuggestionPanel } from './ContentSuggestionPanel';
import { DocumentGapAnalysis } from './DocumentGapAnalysis';

/**
 * DocumentSectionRecommender Component
 *
 * This component provides intelligent section recommendations for regulatory documents
 * based on device profile information.
 *
 * @param {Object} props - Component props
 * @param {string} props.documentType - The type of document (e.g., '510k', 'cer')
 * @param {Object} props.deviceProfile - The device profile information
 * @param {Object} props.existingContent - Content that already exists in the document
 * @param {Object} props.predicateDevice - Optional predicate device information (for 510k)
 * @param {Function} props.onSectionSelect - Callback when a section is selected
 */
export const DocumentSectionRecommender = ({
  documentType = '510k',
  deviceProfile,
  existingContent = {},
  predicateDevice = null,
  onSectionSelect,
}) => {
  const [activeTab, setActiveTab] = useState('recommended');
  const [selectedSection, setSelectedSection] = useState(null);

  // Query for section recommendations
  const recommendationsQuery = useQuery({
    queryKey: ['sectionRecommendations', documentType, deviceProfile?.id],
    queryFn: () =>
      DocumentSectionRecommenderService.getRecommendedSections(documentType, deviceProfile),
    enabled: isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!deviceProfile,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  // Query for gap analysis
  const gapAnalysisQuery = useQuery({
    queryKey: [
      'contentGapAnalysis',
      documentType,
      deviceProfile?.id,
      Object.keys(existingContent).length,
    ],
    queryFn: () =>
      DocumentSectionRecommenderService.analyzeContentGaps(
        documentType,
        deviceProfile,
        existingContent
      ),
    enabled:
      isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!deviceProfile && activeTab === 'gaps',
  });

  // Query for regulatory overview
  const regulatoryOverviewQuery = useQuery({
    queryKey: ['regulatoryOverview', documentType, deviceProfile?.id],
    queryFn: () =>
      DocumentSectionRecommenderService.generateRegulatoryOverview(documentType, deviceProfile),
    enabled:
      isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!deviceProfile && activeTab === 'overview',
  });

  // Handle section selection
  const handleSectionSelect = section => {
    setSelectedSection(section);

    if (onSectionSelect) {
      onSectionSelect(section);
    }
  };

  // Group sections by priority
  const getSectionsByPriority = sections => {
    if (!sections) return {};

    return sections.reduce((grouped, section) => {
      const priority = section.priority || 'medium';
      if (!grouped[priority]) {
        grouped[priority] = [];
      }
      grouped[priority].push(section);
      return grouped;
    }, {});
  };

  // Get sections grouped by priority
  const sectionsByPriority = getSectionsByPriority(recommendationsQuery.data);

  // Feature flag check
  if (!isFeatureEnabled('ENABLE_SECTION_RECOMMENDER')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document Section Recommender</CardTitle>
          <CardDescription>
            This feature is currently disabled. Please contact your administrator to enable it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Loading states
  const isLoading =
    recommendationsQuery.isLoading ||
    (activeTab === 'gaps' && gapAnalysisQuery.isLoading) ||
    (activeTab === 'overview' && regulatoryOverviewQuery.isLoading);

  // Error states
  const hasError =
    recommendationsQuery.error ||
    (activeTab === 'gaps' && gapAnalysisQuery.error) ||
    (activeTab === 'overview' && regulatoryOverviewQuery.error);

  if (!deviceProfile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document Section Recommender</CardTitle>
          <CardDescription>
            Please complete your device profile to receive section recommendations.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Recommendations</CardTitle>
          <CardDescription>
            Failed to load section recommendations. Please try again.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (activeTab === 'recommended') recommendationsQuery.refetch();
              if (activeTab === 'gaps') gapAnalysisQuery.refetch();
              if (activeTab === 'overview') regulatoryOverviewQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Document Section Recommender</CardTitle>
          <CardDescription>
            Get intelligent section recommendations and content suggestions for your{' '}
            {documentType.toUpperCase()} submission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="recommended" className="flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Recommended Sections
              </TabsTrigger>
              <TabsTrigger value="gaps" className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                Gap Analysis
              </TabsTrigger>
              <TabsTrigger value="overview" className="flex items-center">
                <BookOpen className="h-4 w-4 mr-2" />
                Regulatory Overview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recommended">
              {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {sectionsByPriority.high && (
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        High Priority <Badge>Required</Badge>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sectionsByPriority.high.map(section => (
                          <div
                            key={section.key}
                            className={`p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                              selectedSection?.key === section.key
                                ? 'border-primary bg-primary/10'
                                : ''
                            }`}
                            onClick={() => handleSectionSelect(section)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">{section.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {section.description}
                                </p>
                              </div>
                              <Badge variant="default">High</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sectionsByPriority.medium && (
                    <div>
                      <h3 className="text-lg font-medium mb-4">Medium Priority</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sectionsByPriority.medium.map(section => (
                          <div
                            key={section.key}
                            className={`p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                              selectedSection?.key === section.key
                                ? 'border-primary bg-primary/10'
                                : ''
                            }`}
                            onClick={() => handleSectionSelect(section)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">{section.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {section.description}
                                </p>
                              </div>
                              <Badge variant="secondary">Medium</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sectionsByPriority.low && (
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Low Priority <Badge variant="outline">Optional</Badge>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sectionsByPriority.low.map(section => (
                          <div
                            key={section.key}
                            className={`p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                              selectedSection?.key === section.key
                                ? 'border-primary bg-primary/10'
                                : ''
                            }`}
                            onClick={() => handleSectionSelect(section)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">{section.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {section.description}
                                </p>
                              </div>
                              <Badge variant="outline">Low</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!recommendationsQuery.data || recommendationsQuery.data.length === 0) && (
                    <div className="text-center p-6">
                      <p>No section recommendations available for your device profile.</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => recommendationsQuery.refetch()}
                      >
                        Refresh Recommendations
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="gaps">
              <DocumentGapAnalysis
                isLoading={gapAnalysisQuery.isLoading}
                gapAnalysis={gapAnalysisQuery.data}
                onSectionSelect={handleSectionSelect}
                onRefresh={() => gapAnalysisQuery.refetch()}
              />
            </TabsContent>

            <TabsContent value="overview">
              {regulatoryOverviewQuery.isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : regulatoryOverviewQuery.data ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Regulatory Pathway Overview</CardTitle>
                    <CardDescription>
                      Based on your device profile information, here is the recommended regulatory
                      pathway.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium">Recommended Pathway</h3>
                      <p className="mt-1">{regulatoryOverviewQuery.data.recommendedPathway}</p>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-lg font-medium">Rationale</h3>
                      <p className="mt-1">{regulatoryOverviewQuery.data.rationale}</p>
                    </div>

                    {regulatoryOverviewQuery.data.requirements && (
                      <>
                        <Separator />

                        <div>
                          <h3 className="text-lg font-medium">Key Requirements</h3>
                          <ul className="mt-2 space-y-2">
                            {regulatoryOverviewQuery.data.requirements.map((req, index) => (
                              <li key={index} className="flex items-start">
                                <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                                <span>{req}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}

                    {regulatoryOverviewQuery.data.timeline && (
                      <>
                        <Separator />

                        <div>
                          <h3 className="text-lg font-medium">Estimated Timeline</h3>
                          <p className="mt-1">
                            Approximately {regulatoryOverviewQuery.data.timeline} days from
                            submission to clearance
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center p-6">
                  <p>No regulatory overview available for your device profile.</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => regulatoryOverviewQuery.refetch()}
                  >
                    Generate Overview
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedSection && (
        <ContentSuggestionPanel
          documentType={documentType}
          section={selectedSection}
          deviceProfile={deviceProfile}
          predicateDevice={predicateDevice}
          existingContent={existingContent[selectedSection.key]}
        />
      )}
    </div>
  );
};

export default DocumentSectionRecommender;
