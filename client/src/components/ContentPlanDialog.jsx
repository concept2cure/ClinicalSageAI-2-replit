import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Clock, AlertTriangle, CheckCircle, ArrowRight, Calendar, Target, TrendingUp, Download, Copy, ExternalLink, DialogDescription } from 'lucide-react'

const ContentPlanDialog = ({ isOpen, onClose, contentPlanData, isLoading }) => {
  const [activeTab, setActiveTab] = useState('overview');

  if (!contentPlanData && !isLoading) {
    return null;
  }

  const getPriorityColor = priority => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getRiskColor = riskLevel => {
    switch (riskLevel?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleExport = () => {
    if (!contentPlanData) return;

    const exportData = {
      ...contentPlanData,
      exportedAt: new Date().toISOString(),
      exportedBy: 'eCTD Co-Author',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-plan-${contentPlanData.planId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} className="max-w-4xl">
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isLoading ? 'Generating Content Plan...' : 'eCTD Content Plan'}
          </DialogTitle>
          {contentPlanData && (
            <DialogDescription>
              {contentPlanData.planTitle} • Created{' '}
              {new Date(contentPlanData.created).toLocaleDateString()}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Generating comprehensive content plan...</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh] pr-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="modules">Modules</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Plan Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-4">{contentPlanData?.summary}</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium">Total Timeline</div>
                          <div className="text-lg font-semibold text-blue-600">
                            {contentPlanData?.totalTimeline}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium">Modules</div>
                          <div className="text-lg font-semibold text-green-600">
                            {contentPlanData?.modules?.length || 0}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Compliance Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <div
                          className={`text-3xl font-bold ${
                            contentPlanData?.complianceScore >= 90
                              ? 'text-green-600'
                              : contentPlanData?.complianceScore >= 70
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {contentPlanData?.complianceScore}%
                        </div>
                        <div className="text-sm text-gray-600">Regulatory compliance expected</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="modules" className="mt-4">
                <div className="space-y-4">
                  {contentPlanData?.modules?.map((module, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {module.moduleCode} - {module.moduleName}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge className={getPriorityColor(module.priority)}>
                              {module.priority}
                            </Badge>
                            <Badge variant="outline" className={getRiskColor(module.riskLevel)}>
                              {module.riskLevel} Risk
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium mb-1">Effort Level</div>
                            <div className="text-sm text-gray-600">{module.effort}</div>
                          </div>
                          <div>
                            <div className="text-sm font-medium mb-1">Timeline</div>
                            <div className="text-sm text-gray-600 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {module.timeline}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="text-sm font-medium mb-2">Justification</div>
                          <p className="text-sm text-gray-600">{module.justification}</p>
                        </div>

                        {module.sections && module.sections.length > 0 && (
                          <div className="mt-4">
                            <div className="text-sm font-medium mb-2">Key Sections</div>
                            <div className="flex flex-wrap gap-1">
                              {module.sections.map((section, sectionIndex) => (
                                <Badge key={sectionIndex} variant="secondary" className="text-xs">
                                  {section}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {module.dependencies && module.dependencies.length > 0 && (
                          <div className="mt-4">
                            <div className="text-sm font-medium mb-2">Dependencies</div>
                            <div className="flex flex-wrap gap-1">
                              {module.dependencies.map((dep, depIndex) => (
                                <Badge key={depIndex} variant="outline" className="text-xs">
                                  {dep}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Recommended Sequence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {contentPlanData?.recommendedSequence?.map((moduleCode, index) => {
                        const module = contentPlanData.modules.find(
                          m => m.moduleCode === moduleCode
                        );
                        return (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">
                                {moduleCode} - {module?.moduleName}
                              </div>
                              <div className="text-sm text-gray-600">{module?.timeline}</div>
                            </div>
                            {index < contentPlanData.recommendedSequence.length - 1 && (
                              <ArrowRight className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="compliance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Compliance Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                        <div>
                          <div className="font-medium">Overall Compliance Score</div>
                          <div className="text-sm text-gray-600">
                            Based on regulatory requirements
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {contentPlanData?.complianceScore}%
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <div className="text-lg font-semibold text-green-600">
                            {contentPlanData?.modules?.filter(m => m.priority === 'Critical')
                              .length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Critical Modules</div>
                        </div>
                        <div className="text-center p-4 bg-yellow-50 rounded-lg">
                          <div className="text-lg font-semibold text-yellow-600">
                            {contentPlanData?.modules?.filter(m => m.riskLevel === 'High').length ||
                              0}
                          </div>
                          <div className="text-sm text-gray-600">High Risk Items</div>
                        </div>
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <div className="text-lg font-semibold text-blue-600">
                            {contentPlanData?.modules?.length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Total Modules</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="knowledge" className="mt-4">
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Knowledge Base Integration
                      </CardTitle>
                      <CardDescription>
                        This content plan leverages platform-specific intelligence for enhanced
                        recommendations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {contentPlanData?.knowledgeBaseIntegration ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                            <div>
                              <div className="font-medium">Knowledge Base Enhanced</div>
                              <div className="text-sm text-gray-600">
                                Confidence Level:{' '}
                                {contentPlanData.knowledgeBaseIntegration.confidenceLevel}
                              </div>
                            </div>
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm font-medium mb-2">Data Sources Used</div>
                              <div className="space-y-1">
                                {contentPlanData.knowledgeBaseIntegration.sourcesUsed?.map(
                                  (source, index) => (
                                    <div key={index} className="flex items-center gap-2 text-sm">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      {source
                                        .replace('_', ' ')
                                        .replace(/\b\w/g, l => l.toUpperCase())}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-sm font-medium mb-2">Context Statistics</div>
                              <div className="space-y-1 text-sm text-gray-600">
                                {contentPlanData.metadata?.knowledgeBaseContext && (
                                  <>
                                    <div>
                                      Knowledge Graph:{' '}
                                      {
                                        contentPlanData.metadata.knowledgeBaseContext
                                          .knowledgeGraphEntries
                                      }{' '}
                                      relations
                                    </div>
                                    <div>
                                      NLP Extractions:{' '}
                                      {contentPlanData.metadata.knowledgeBaseContext.nlpExtractions}{' '}
                                      patterns
                                    </div>
                                    <div>
                                      Historical Documents:{' '}
                                      {
                                        contentPlanData.metadata.knowledgeBaseContext
                                          .relatedDocuments
                                      }{' '}
                                      references
                                    </div>
                                    <div>
                                      Compliance History:{' '}
                                      {
                                        contentPlanData.metadata.knowledgeBaseContext
                                          .complianceHistory
                                      }{' '}
                                      records
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium mb-2">
                              Contextual Recommendations
                            </div>
                            <div className="space-y-2">
                              {contentPlanData.knowledgeBaseIntegration.contextualRecommendations?.map(
                                (rec, index) => (
                                  <div
                                    key={index}
                                    className="flex items-start gap-2 p-2 bg-blue-50 rounded text-sm"
                                  >
                                    <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                    {rec}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <div className="mb-2">Basic content plan generated</div>
                          <div className="text-sm">
                            Knowledge base integration not available for this request
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Module Knowledge Sources
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {contentPlanData?.modules?.map(
                          (module, index) =>
                            module.knowledgeBaseSources &&
                            module.knowledgeBaseSources.length > 0 && (
                              <div key={index} className="p-3 border rounded-lg">
                                <div className="font-medium text-sm mb-2">
                                  {module.moduleCode} - {module.moduleName}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {module.knowledgeBaseSources.map((source, sourceIndex) => (
                                    <Badge
                                      key={sourceIndex}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {source
                                        .replace('_', ' ')
                                        .replace(/\b\w/g, l => l.toUpperCase())}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        )}

        <DialogFooter>
          <div className="flex items-center gap-2">
            {contentPlanData && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export Plan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(contentPlanData, null, 2))}
                  className="flex items-center gap-1"
                >
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </Button>
              </>
            )}
            <Button onClick={onClose}>{isLoading ? 'Cancel' : 'Close'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContentPlanDialog;
