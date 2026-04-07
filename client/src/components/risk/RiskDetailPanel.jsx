import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Check,
  FileText,
  Calendar,
  User,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  FileCode,
  X,
  CheckCircle,
  Clock,
  Diff,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * RiskDetailPanel Component
 *
 * Displays comprehensive details of a selected risk item including
 * AI insights, recommendations, and resolution options.
 */
const RiskDetailPanel = ({
  risk,
  riskInsights,
  isLoadingInsights,
  onUpdateStatus,
  onApplySuggestion,
}) => {
  const [resolutionNotes, setResolutionNotes] = React.useState('');

  if (!risk) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="flex flex-col items-center justify-center py-10">
          <FileText className="h-16 w-16 text-gray-300" />
          <p className="mt-4 text-center text-gray-500">Select a risk item to view details</p>
        </CardContent>
      </Card>
    );
  }

  // Helper to render severity badge
  const getSeverityBadge = severity => {
    switch (severity) {
      case 'high':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 capitalize">
            <AlertCircle className="h-3 w-3 mr-1" />
            {severity}
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 capitalize">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {severity}
          </Badge>
        );
      case 'low':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 capitalize">
            <Check className="h-3 w-3 mr-1" />
            {severity}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {severity || 'Unknown'}
          </Badge>
        );
    }
  };

  // Helper to render status badge
  const getStatusBadge = status => {
    switch (status) {
      case 'open':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 capitalize">
            <AlertCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 capitalize">
            <Clock className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'resolved':
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 capitalize">
            <CheckCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {status || 'Unknown'}
          </Badge>
        );
    }
  };

  // Mark risk as resolved dialog
  const ResolveRiskDialog = () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="default"
          className="gap-1.5"
          disabled={risk.mitigationStatus === 'resolved'}
        >
          <CheckCircle className="h-4 w-4" />
          Mark as Resolved
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Risk Item</DialogTitle>
          <DialogDescription>
            You are about to mark this risk as resolved. Please provide details about how this risk
            was mitigated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Resolution Notes</h4>
            <Textarea
              placeholder="Explain how the risk was mitigated..."
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onUpdateStatus(risk.id, 'resolved', resolutionNotes);
              setResolutionNotes('');
            }}
            disabled={!resolutionNotes.trim()}
          >
            Confirm Resolution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex gap-2 mb-2">
              {getSeverityBadge(risk.severity)}
              {getStatusBadge(risk.mitigationStatus)}
            </div>
            <CardTitle>{risk.description}</CardTitle>
            <CardDescription>Section: {risk.section}</CardDescription>
          </div>

          {risk.mitigationStatus === 'resolved' && risk.resolutionDetails && (
            <div className="bg-green-50 border border-green-200 rounded-md p-2 text-sm max-w-[200px]">
              <div className="flex items-center gap-1 font-medium text-green-700 mb-1">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Resolved</span>
              </div>
              <div className="text-gray-700 text-xs">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(risk.resolutionDetails.resolvedDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-3 w-3" />
                  <span>{risk.resolutionDetails.resolvedBy}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs defaultValue="insights">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="insights" className="flex gap-1">
              <Lightbulb className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="flex gap-1">
              <Check className="h-4 w-4" />
              Recommendations
            </TabsTrigger>
            <TabsTrigger value="fix" className="flex gap-1">
              <Diff className="h-4 w-4" />
              Suggested Fix
            </TabsTrigger>
          </TabsList>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            {isLoadingInsights ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                <p className="mt-4 text-sm text-gray-500">Loading AI insights...</p>
              </div>
            ) : riskInsights ? (
              <>
                <div className="border-l-4 border-blue-400 pl-4 py-2 bg-blue-50 rounded-sm mt-2">
                  <h3 className="font-medium flex items-center gap-1 text-blue-700">
                    <Lightbulb className="h-4 w-4" />
                    AI Analysis
                  </h3>
                  <p className="mt-1 text-gray-700 text-sm">{riskInsights.detailedAnalysis}</p>
                </div>

                <div className="border rounded-md p-4 space-y-4">
                  <h3 className="font-medium">Regulatory Context</h3>
                  <p className="text-sm text-gray-700">{riskInsights.regulatoryContext}</p>

                  <h3 className="font-medium pt-2">Similar Cases</h3>
                  <div className="space-y-3">
                    {riskInsights.similarCases.map(caseItem => (
                      <div key={caseItem.id} className="flex items-start gap-3 border-b pb-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            caseItem.outcome.includes('Information Request')
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {caseItem.outcome.includes('Information Request') ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <h4 className="font-medium">{caseItem.agency}</h4>
                            <span className="text-sm text-gray-500">{caseItem.date}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant="outline"
                              className={
                                caseItem.outcome.includes('Information Request')
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }
                            >
                              {caseItem.outcome}
                            </Badge>
                          </div>
                          <p className="text-sm mt-2">{caseItem.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border rounded-md p-4">
                  <h3 className="font-medium">Impact Assessment</h3>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div className="border rounded-md p-3">
                      <h4 className="text-sm font-medium mb-2">Current Risk</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-500">Probability:</span>
                        <Badge variant="outline" className="capitalize">
                          {riskInsights.impactAssessment.beforeMitigation.probability}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-500">Impact:</span>
                        <Badge variant="outline" className="capitalize">
                          {riskInsights.impactAssessment.beforeMitigation.impact}
                        </Badge>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm">
                          <span>Risk Score</span>
                          <span>
                            {Math.round(
                              riskInsights.impactAssessment.beforeMitigation.riskScore * 100
                            )}
                          </span>
                        </div>
                        <Progress
                          value={riskInsights.impactAssessment.beforeMitigation.riskScore * 100}
                          className="h-2 mt-1"
                          indicatorClassName={`${
                            riskInsights.impactAssessment.beforeMitigation.riskScore > 0.66
                              ? 'bg-red-500'
                              : riskInsights.impactAssessment.beforeMitigation.riskScore > 0.33
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="border rounded-md p-3">
                      <h4 className="text-sm font-medium mb-2">After Mitigation</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-500">Probability:</span>
                        <Badge variant="outline" className="capitalize">
                          {riskInsights.impactAssessment.afterMitigation.probability}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-500">Impact:</span>
                        <Badge variant="outline" className="capitalize">
                          {riskInsights.impactAssessment.afterMitigation.impact}
                        </Badge>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-sm">
                          <span>Risk Score</span>
                          <span>
                            {Math.round(
                              riskInsights.impactAssessment.afterMitigation.riskScore * 100
                            )}
                          </span>
                        </div>
                        <Progress
                          value={riskInsights.impactAssessment.afterMitigation.riskScore * 100}
                          className="h-2 mt-1"
                          indicatorClassName={`${
                            riskInsights.impactAssessment.afterMitigation.riskScore > 0.66
                              ? 'bg-red-500'
                              : riskInsights.impactAssessment.afterMitigation.riskScore > 0.33
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-gray-500 text-sm">Expected Improvement:</span>
                    <div className="flex items-center">
                      <ArrowDownRight className="h-4 w-4 text-green-600" />
                      <span className="text-green-600 font-medium">
                        {Math.round(
                          (1 -
                            riskInsights.impactAssessment.afterMitigation.riskScore /
                              riskInsights.impactAssessment.beforeMitigation.riskScore) *
                            100
                        )}
                        % risk reduction
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center">
                <FileText className="h-12 w-12 text-gray-300" />
                <p className="mt-4 text-sm text-gray-500">No detailed insights available</p>
                <p className="text-xs text-gray-400">Select the risk to load AI-powered insights</p>
              </div>
            )}
          </TabsContent>

          {/* Recommendations Tab */}
          <TabsContent value="recommendations" className="space-y-4">
            <div className="border rounded-md p-4">
              <h3 className="font-medium mb-3">Recommended Actions</h3>
              <ul className="space-y-2">
                {risk.recommendations?.map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-medium text-blue-700">{index + 1}</span>
                    </div>
                    <span className="flex-1">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="font-medium mb-3">AI Insights</h3>
              <div className="border-l-4 border-violet-400 pl-4 py-2 bg-violet-50 rounded-sm">
                <p className="text-gray-700">{risk.aiInsights}</p>
              </div>
            </div>

            {risk.mitigationStatus !== 'resolved' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-800">Action Required</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      This risk requires attention to avoid potential regulatory issues. Follow the
                      recommendations above to mitigate this risk.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Suggested Fix Tab */}
          <TabsContent value="fix" className="space-y-4">
            {isLoadingInsights ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                <p className="mt-4 text-sm text-gray-500">Loading suggested fix...</p>
              </div>
            ) : riskInsights?.generatedSuggestions ? (
              <>
                <div className="border-l-4 border-green-400 pl-4 py-2 bg-green-50 rounded-sm">
                  <h3 className="font-medium flex items-center gap-1 text-green-700">
                    <Diff className="h-4 w-4" />
                    AI-Generated Text Suggestion
                  </h3>
                  <p className="mt-1 text-gray-700 text-sm">
                    The AI system has analyzed the document and generated a suggested revision to
                    address this risk.
                  </p>
                </div>

                <div className="border rounded-md p-4 space-y-4">
                  <div>
                    <h3 className="font-medium text-red-600">Current Text</h3>
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm">
                      {riskInsights.generatedSuggestions.textToReplace}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-green-600">Suggested Replacement</h3>
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm">
                      {riskInsights.generatedSuggestions.suggestedReplacement}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      onApplySuggestion({
                        documentId: risk.documentId,
                        riskId: risk.id,
                        section: risk.section,
                        textToReplace: riskInsights.generatedSuggestions.textToReplace,
                        replacement: riskInsights.generatedSuggestions.suggestedReplacement,
                      })
                    }
                    className="gap-1"
                  >
                    <FileCode className="h-4 w-4" />
                    Apply Suggested Fix
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center">
                <FileText className="h-12 w-12 text-gray-300" />
                <p className="mt-4 text-sm text-gray-500">No suggested fix available</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Risk Score:</span>
          <Badge
            variant="outline"
            className={`${
              risk.riskScore > 0.66
                ? 'bg-red-50 text-red-700 border-red-200'
                : risk.riskScore > 0.33
                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                  : 'bg-green-50 text-green-700 border-green-200'
            }`}
          >
            {Math.round(risk.riskScore * 100)}
          </Badge>
        </div>

        <div className="flex gap-2">
          {risk.mitigationStatus !== 'resolved' && (
            <>
              {risk.mitigationStatus === 'open' && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => onUpdateStatus(risk.id, 'in_progress')}
                >
                  <Clock className="h-4 w-4" />
                  Mark In Progress
                </Button>
              )}

              <ResolveRiskDialog />
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default RiskDetailPanel;
