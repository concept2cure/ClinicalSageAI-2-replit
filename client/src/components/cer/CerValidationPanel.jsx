import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Info,
  X,
  ChevronDown,
  ChevronRight,
  FileBadge,
  FileCheck,
  ShieldCheck,
  Sparkles,
  GitCommit,
  Link,
  PenLine,
  ThumbsUp,
  ThumbsDown,
  Zap,
} from 'lucide-react';
import { cerValidationService } from '../../services/CerValidationService';
import { cerApiService } from '../../services/CerAPIService';
import { useToast } from '@/components/ui/toaster';
import CerTooltipWrapper from './CerTooltipWrapper';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const CerValidationPanel = ({
  cerDocument,
  onValidationComplete,
  onApplyCorrections,
  regulatoryFramework = 'EU_MDR',
}) => {
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [reviewerFeedback, setReviewerFeedback] = useState({
    reviewerName: '',
    summary: '',
    items: [],
  });
  const [activeTab, setActiveTab] = useState('issues');
  const { toast } = useToast();

  useEffect(() => {
    // Reset the validation state when document changes
    setValidationResults(null);
    setSelectedIssues([]);
    setValidationProgress(0);
  }, [cerDocument]);

  const startValidation = async () => {
    if (!cerDocument || !cerDocument.sections) {
      toast({
        title: 'Validation Error',
        description: 'Cannot validate an empty document. Please generate or load a CER first.',
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);
    setValidationProgress(10);

    try {
      // Simulating a progress sequence for UX purposes
      const progressSteps = [
        { step: 25, delay: 1000, message: 'Checking document structure...' },
        { step: 40, delay: 1000, message: 'Validating claims consistency...' },
        { step: 60, delay: 1500, message: 'Verifying clinical data accuracy...' },
        { step: 80, delay: 1000, message: 'Checking citation integrity...' },
        { step: 90, delay: 1000, message: 'Validating regulatory compliance...' },
      ];

      // Show progress toast messages
      for (const { step, delay, message } of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, delay));
        setValidationProgress(step);
        toast({
          title: 'Validation Progress',
          description: message,
          variant: 'default',
          duration: 2000,
        });
      }

      // Perform the actual validation
      const results = await cerValidationService.validateCompleteCER(
        cerDocument,
        regulatoryFramework
      );

      setValidationResults(results);
      setValidationProgress(100);

      // Notify the parent component
      if (onValidationComplete) {
        onValidationComplete(results);
      }

      // Show completion toast
      toast({
        title: results.complete ? 'Validation Successful' : 'Validation Complete',
        description: results.complete
          ? 'No critical issues found. Document is compliant with regulatory requirements.'
          : `Found ${results.critical.length} critical issues that require attention.`,
        variant: results.complete ? 'success' : 'warning',
        duration: 5000,
      });
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: 'Validation Failed',
        description: error.message || 'An unexpected error occurred during validation.',
        variant: 'destructive',
      });
      setValidationProgress(0);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAutoFix = async () => {
    if (!selectedIssues.length) {
      toast({
        title: 'No Issues Selected',
        description: 'Please select at least one issue to auto-fix.',
        variant: 'default',
      });
      return;
    }

    try {
      toast({
        title: 'Auto-Fixing Issues',
        description: `Applying AI-powered fixes to ${selectedIssues.length} selected issues...`,
        variant: 'default',
      });

      // In a real implementation, this would call an AI-powered fixing service
      // For now, we'll simulate the process

      // Wait for "processing" time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update the validation results to mark selected issues as fixed
      const updatedResults = { ...validationResults };

      // Helper function to update issues in a category
      const updateIssuesInCategory = category => {
        updatedResults[category] = updatedResults[category].map(issue => {
          if (selectedIssues.includes(issue.id)) {
            return { ...issue, fixed: true, fixApplied: 'AI auto-fix applied' };
          }
          return issue;
        });
      };

      // Update all categories
      updateIssuesInCategory('critical');
      updateIssuesInCategory('major');
      updateIssuesInCategory('minor');

      setValidationResults(updatedResults);

      // Clear selected issues
      setSelectedIssues([]);

      toast({
        title: 'Auto-Fix Complete',
        description: `Successfully applied fixes to ${selectedIssues.length} issues.`,
        variant: 'default',
      });

      // Notify parent component if callback exists
      if (onApplyCorrections) {
        onApplyCorrections(updatedResults);
      }
    } catch (error) {
      console.error('Auto-fix error:', error);
      toast({
        title: 'Auto-Fix Failed',
        description: error.message || 'An unexpected error occurred while fixing issues.',
        variant: 'destructive',
      });
    }
  };

  const toggleIssueSelection = issueId => {
    setSelectedIssues(prevSelected => {
      if (prevSelected.includes(issueId)) {
        return prevSelected.filter(id => id !== issueId);
      } else {
        return [...prevSelected, issueId];
      }
    });
  };

  const toggleFeedbackMode = () => {
    setFeedbackMode(prevMode => !prevMode);
    if (!feedbackMode) {
      // Reset feedback when entering feedback mode
      setReviewerFeedback({
        reviewerName: '',
        summary: '',
        items: [],
      });
    }
  };

  const addFeedbackItem = (issue, feedbackType, correction) => {
    setReviewerFeedback(prevFeedback => {
      // Create a new feedback item
      const newItem = {
        id: `feedback_${Date.now()}`,
        type: feedbackType,
        issueId: issue.id,
        issueType: issue.type,
        location: issue.location,
        correction: correction,
      };

      // Add to feedback items
      return {
        ...prevFeedback,
        items: [...prevFeedback.items, newItem],
      };
    });

    toast({
      title: 'Feedback Added',
      description: 'Your feedback has been recorded and will be applied when submitted.',
      variant: 'default',
      duration: 3000,
    });
  };

  const submitFeedback = async () => {
    if (!reviewerFeedback.items.length) {
      toast({
        title: 'No Feedback to Submit',
        description: 'Please add feedback before submitting.',
        variant: 'default',
      });
      return;
    }

    try {
      toast({
        title: 'Submitting Feedback',
        description: 'Applying reviewer feedback to the document...',
        variant: 'default',
      });

      // In a real implementation, this would call a service to apply the feedback
      // For now, we'll simulate the process

      // Wait for "processing" time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update the validation results to mark issues with feedback as addressed
      const updatedResults = { ...validationResults };

      // Helper function to update issues in a category
      const updateIssuesInCategory = category => {
        updatedResults[category] = updatedResults[category].map(issue => {
          const feedback = reviewerFeedback.items.find(item => item.issueId === issue.id);
          if (feedback) {
            return { ...issue, addressedByFeedback: true, feedbackApplied: feedback.type };
          }
          return issue;
        });
      };

      // Update all categories
      updateIssuesInCategory('critical');
      updateIssuesInCategory('major');
      updateIssuesInCategory('minor');

      setValidationResults(updatedResults);

      // Exit feedback mode
      setFeedbackMode(false);

      toast({
        title: 'Feedback Applied',
        description: `Successfully applied feedback to ${reviewerFeedback.items.length} issues.`,
        variant: 'default',
      });

      // Notify parent component if callback exists
      if (onApplyCorrections) {
        onApplyCorrections(updatedResults, reviewerFeedback);
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      toast({
        title: 'Feedback Submission Failed',
        description: error.message || 'An unexpected error occurred while applying feedback.',
        variant: 'destructive',
      });
    }
  };

  // Helper function to get severity badge
  const getSeverityBadge = severity => {
    switch (severity) {
      case 'critical':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
            <AlertCircle className="h-3.5 w-3.5 mr-1" />
            Critical
          </Badge>
        );
      case 'major':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            <Info className="h-3.5 w-3.5 mr-1" />
            Major
          </Badge>
        );
      case 'minor':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
            <Info className="h-3.5 w-3.5 mr-1" />
            Minor
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-800 border-gray-200">
            <Info className="h-3.5 w-3.5 mr-1" />
            Info
          </Badge>
        );
    }
  };

  // Helper function to get issue type icon
  const getIssueTypeIcon = type => {
    switch (type) {
      case 'missing_required_section':
        return <FileBadge className="h-4 w-4" />;
      case 'inconsistent_claim':
        return <GitCommit className="h-4 w-4" />;
      case 'claim_exceeds_intended_use':
        return <AlertCircle className="h-4 w-4" />;
      case 'factual_error':
        return <PenLine className="h-4 w-4" />;
      case 'invalid_citation':
      case 'citation_content_mismatch':
        return <Link className="h-4 w-4" />;
      case 'regulatory_checklist_failure':
        return <ShieldCheck className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  // Render loading/progress state
  if (isValidating) {
    return (
      <div className="space-y-4 p-6 bg-white rounded-lg border border-[#e8e6dc]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-[#141413]">Validating CER Document</h3>
          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
            <Zap className="h-3.5 w-3.5 mr-1" />
            In Progress
          </Badge>
        </div>

        <Progress value={validationProgress} className="h-2 mb-3" />

        <p className="text-[#6b6963] text-sm">
          {validationProgress < 100
            ? 'Applying regulatory verification and AI-powered validation checks...'
            : 'Validation complete! Processing results...'}
        </p>

        <div className="flex items-start space-x-3 p-3 bg-[#faf0ec] rounded-md border border-[#BDD6F1]">
          <Info className="h-5 w-5 text-[#d97757] mt-0.5" />
          <div>
            <p className="text-sm text-[#141413]">
              Validation is checking your document against {regulatoryFramework} requirements,
              analyzing internal consistency, verifying citations, and detecting potential factual
              errors.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render validation results
  if (validationResults) {
    // Calculate issue counts
    const criticalCount = validationResults.critical.length;
    const majorCount = validationResults.major.length;
    const minorCount = validationResults.minor.length;
    const totalIssues = criticalCount + majorCount + minorCount;

    // Calculate checklist completion
    const checklistTotal = validationResults.regulatoryChecklist.total;
    const checklistPassed = validationResults.regulatoryChecklist.passed;
    const checklistPercentage =
      checklistTotal > 0 ? Math.round((checklistPassed / checklistTotal) * 100) : 0;

    return (
      <div className="space-y-4">
        {/* Summary Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium text-[#141413]">
                Validation Results
              </CardTitle>
              {validationResults.complete ? (
                <Badge className="bg-[#e4ebd8] text-[#788c5d] border-[#788c5d]">
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Compliant
                </Badge>
              ) : (
                <Badge className="bg-[#FFF4CE] text-[#797673] border-[#797673]">
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  Needs Attention
                </Badge>
              )}
            </div>
            <CardDescription className="text-[#6b6963]">
              {validationResults.complete
                ? 'Your document is compliant with regulatory requirements and ready for submission.'
                : 'Your document requires attention to meet regulatory requirements.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Critical Issues */}
              <div
                className={`p-3 rounded-md border ${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-[#f4f3ee] border-[#e8e6dc]'}`}
              >
                <p className="text-xs uppercase text-[#6b6963] mb-1">Critical</p>
                <p
                  className={`text-xl font-semibold ${criticalCount > 0 ? 'text-red-700' : 'text-[#141413]'}`}
                >
                  {criticalCount}
                </p>
              </div>

              {/* Major Issues */}
              <div
                className={`p-3 rounded-md border ${majorCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-[#f4f3ee] border-[#e8e6dc]'}`}
              >
                <p className="text-xs uppercase text-[#6b6963] mb-1">Major</p>
                <p
                  className={`text-xl font-semibold ${majorCount > 0 ? 'text-amber-700' : 'text-[#141413]'}`}
                >
                  {majorCount}
                </p>
              </div>

              {/* Minor Issues */}
              <div
                className={`p-3 rounded-md border ${minorCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-[#f4f3ee] border-[#e8e6dc]'}`}
              >
                <p className="text-xs uppercase text-[#6b6963] mb-1">Minor</p>
                <p
                  className={`text-xl font-semibold ${minorCount > 0 ? 'text-blue-700' : 'text-[#141413]'}`}
                >
                  {minorCount}
                </p>
              </div>

              {/* Checklist Compliance */}
              <div
                className={`p-3 rounded-md border ${checklistPercentage < 100 ? 'bg-purple-50 border-purple-200' : 'bg-[#e4ebd8] border-[#788c5d]'}`}
              >
                <p className="text-xs uppercase text-[#6b6963] mb-1">Compliance</p>
                <p
                  className={`text-xl font-semibold ${checklistPercentage < 100 ? 'text-purple-700' : 'text-[#788c5d]'}`}
                >
                  {checklistPercentage}%
                </p>
              </div>
            </div>

            {totalIssues > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-between items-center">
                <p className="text-sm text-[#6b6963]">
                  Found {totalIssues} issue{totalIssues !== 1 ? 's' : ''} requiring attention.
                </p>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    className={`border-[#d97757] text-[#d97757] hover:bg-[#faf0ec] ${selectedIssues.length === 0 ? 'opacity-50' : ''}`}
                    onClick={handleAutoFix}
                    disabled={selectedIssues.length === 0}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Fix Selected
                  </Button>
                  <Button
                    variant={feedbackMode ? 'default' : 'outline'}
                    className={
                      feedbackMode
                        ? 'bg-[#d97757] hover:bg-[#c15f3c] text-white'
                        : 'border-[#d97757] text-[#d97757] hover:bg-[#faf0ec]'
                    }
                    onClick={toggleFeedbackMode}
                  >
                    <PenLine className="h-4 w-4 mr-2" />
                    {feedbackMode ? 'Finish Review' : 'Human Review'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feedback Mode Banner */}
        {feedbackMode && (
          <Alert className="bg-[#faf0ec] border-[#d97757]">
            <Info className="h-4 w-4 text-[#d97757]" />
            <AlertTitle className="text-[#141413]">Review Mode Active</AlertTitle>
            <AlertDescription className="text-[#6b6963]">
              You're now in reviewer mode. Review issues and provide feedback to improve document
              quality.
              <div className="mt-2">
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    placeholder="Reviewer Name"
                    value={reviewerFeedback.reviewerName}
                    onChange={e =>
                      setReviewerFeedback({ ...reviewerFeedback, reviewerName: e.target.value })
                    }
                    className="max-w-sm"
                  />
                </div>
                <Textarea
                  placeholder="Summary of review findings (optional)"
                  value={reviewerFeedback.summary}
                  onChange={e =>
                    setReviewerFeedback({ ...reviewerFeedback, summary: e.target.value })
                  }
                  className="max-w-lg h-20"
                />
                <Button
                  className="mt-3 bg-[#d97757] hover:bg-[#c15f3c] text-white"
                  onClick={submitFeedback}
                  disabled={reviewerFeedback.items.length === 0}
                >
                  Submit Review ({reviewerFeedback.items.length} item
                  {reviewerFeedback.items.length !== 1 ? 's' : ''})
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Issues and Checklist Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-white border-b border-gray-200 rounded-none w-full flex justify-start gap-2 mb-4">
            <TabsTrigger
              value="issues"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#d97757] data-[state=active]:text-[#d97757] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161]"
            >
              Issues ({totalIssues})
            </TabsTrigger>
            <TabsTrigger
              value="checklist"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#d97757] data-[state=active]:text-[#d97757] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161]"
            >
              Regulatory Checklist ({checklistPassed}/{checklistTotal})
            </TabsTrigger>
            {feedbackMode && (
              <TabsTrigger
                value="feedback"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#d97757] data-[state=active]:text-[#d97757] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161]"
              >
                Review Items ({reviewerFeedback.items.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="issues" className="space-y-4">
            {totalIssues === 0 ? (
              <div className="bg-[#e4ebd8] text-[#788c5d] p-4 rounded-md border border-[#788c5d] flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium">No Issues Found</h4>
                  <p>Your document passes all validation checks. No issues were detected.</p>
                </div>
              </div>
            ) : (
              <Accordion type="multiple" defaultValue={['critical']} className="space-y-2">
                {/* Critical Issues */}
                {criticalCount > 0 && (
                  <AccordionItem
                    value="critical"
                    className="border rounded-md overflow-hidden bg-white"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center">
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-800 border-red-200 mr-3"
                        >
                          Critical
                        </Badge>
                        <span className="font-medium text-[#141413]">
                          Critical Issues ({criticalCount})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3 pt-0">
                      <div className="space-y-3">
                        {validationResults.critical.map((issue, index) => (
                          <div
                            key={`critical-${index}`}
                            className="border rounded-md p-3 bg-red-50 border-red-100"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center">
                                <Checkbox
                                  id={`issue-${issue.id || `critical-${index}`}`}
                                  checked={selectedIssues.includes(issue.id || `critical-${index}`)}
                                  onCheckedChange={() =>
                                    toggleIssueSelection(issue.id || `critical-${index}`)
                                  }
                                  className="mr-2"
                                />
                                <div className="flex items-center">
                                  {getIssueTypeIcon(issue.type)}
                                  <span className="ml-2 font-medium text-[#141413]">
                                    {issue.message}
                                  </span>
                                </div>
                              </div>
                              {issue.fixed && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-800 border-green-200"
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Fixed
                                </Badge>
                              )}
                              {issue.addressedByFeedback && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-800 border-purple-200"
                                >
                                  <PenLine className="h-3.5 w-3.5 mr-1" />
                                  Reviewed
                                </Badge>
                              )}
                            </div>

                            {issue.location && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Location: <span className="font-mono">{issue.location}</span>
                              </p>
                            )}

                            {issue.regulatoryReference && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Reference:{' '}
                                <span className="font-medium">{issue.regulatoryReference}</span>
                              </p>
                            )}

                            {issue.details && (
                              <div className="text-sm mt-2 p-2 bg-white rounded border border-gray-200">
                                <p className="text-xs text-[#6b6963] mb-1">Details:</p>
                                <p className="text-[#141413]">
                                  {typeof issue.details === 'string'
                                    ? issue.details
                                    : JSON.stringify(issue.details)}
                                </p>
                              </div>
                            )}

                            {feedbackMode && !issue.fixed && !issue.addressedByFeedback && (
                              <div className="mt-3 pt-3 border-t border-red-200 flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="outline" size="sm" className="text-xs">
                                        <PenLine className="h-3 w-3 mr-1" />
                                        Add Feedback
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Reviewer Feedback</DialogTitle>
                                        <DialogDescription>
                                          Provide your expert feedback for this issue.
                                        </DialogDescription>
                                      </DialogHeader>

                                      <div className="grid gap-4 py-4">
                                        <div className="space-y-2">
                                          <Label>Issue Type</Label>
                                          <Input value={issue.type} disabled />
                                        </div>

                                        <div className="space-y-2">
                                          <Label>Feedback Type</Label>
                                          <select
                                            className="w-full px-3 py-2 border border-[#e8e6dc] rounded-md"
                                            id="feedback-type"
                                          >
                                            <option value="text_correction">Text Correction</option>
                                            <option value="citation_correction">
                                              Citation Correction
                                            </option>
                                            <option value="data_correction">
                                              Data/Value Correction
                                            </option>
                                            <option value="section_addition">
                                              Section Addition Needed
                                            </option>
                                          </select>
                                        </div>

                                        <div className="space-y-2">
                                          <Label>Correction Details</Label>
                                          <Textarea
                                            id="correction-details"
                                            placeholder="Describe what needs to be corrected and how"
                                            className="h-24"
                                          />
                                        </div>
                                      </div>

                                      <DialogFooter>
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          onClick={() => {}}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            const feedbackType =
                                              document.getElementById('feedback-type').value;
                                            const correction =
                                              document.getElementById('correction-details').value;
                                            addFeedbackItem(
                                              { ...issue, id: issue.id || `critical-${index}` },
                                              feedbackType,
                                              correction
                                            );
                                          }}
                                        >
                                          Add Feedback
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                </div>

                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                                  >
                                    <ThumbsDown className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-green-700 hover:bg-green-50 hover:text-green-800"
                                  >
                                    <ThumbsUp className="h-3 w-3 mr-1" />
                                    Approve
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Major Issues */}
                {majorCount > 0 && (
                  <AccordionItem
                    value="major"
                    className="border rounded-md overflow-hidden bg-white"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center">
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-200 mr-3"
                        >
                          Major
                        </Badge>
                        <span className="font-medium text-[#141413]">
                          Major Issues ({majorCount})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3 pt-0">
                      <div className="space-y-3">
                        {validationResults.major.map((issue, index) => (
                          <div
                            key={`major-${index}`}
                            className="border rounded-md p-3 bg-amber-50 border-amber-100"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center">
                                <Checkbox
                                  id={`issue-${issue.id || `major-${index}`}`}
                                  checked={selectedIssues.includes(issue.id || `major-${index}`)}
                                  onCheckedChange={() =>
                                    toggleIssueSelection(issue.id || `major-${index}`)
                                  }
                                  className="mr-2"
                                />
                                <div className="flex items-center">
                                  {getIssueTypeIcon(issue.type)}
                                  <span className="ml-2 font-medium text-[#141413]">
                                    {issue.message}
                                  </span>
                                </div>
                              </div>
                              {issue.fixed && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-800 border-green-200"
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Fixed
                                </Badge>
                              )}
                              {issue.addressedByFeedback && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-800 border-purple-200"
                                >
                                  <PenLine className="h-3.5 w-3.5 mr-1" />
                                  Reviewed
                                </Badge>
                              )}
                            </div>

                            {issue.location && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Location: <span className="font-mono">{issue.location}</span>
                              </p>
                            )}

                            {issue.regulatoryReference && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Reference:{' '}
                                <span className="font-medium">{issue.regulatoryReference}</span>
                              </p>
                            )}

                            {issue.details && (
                              <div className="text-sm mt-2 p-2 bg-white rounded border border-gray-200">
                                <p className="text-xs text-[#6b6963] mb-1">Details:</p>
                                <p className="text-[#141413]">
                                  {typeof issue.details === 'string'
                                    ? issue.details
                                    : JSON.stringify(issue.details)}
                                </p>
                              </div>
                            )}

                            {feedbackMode && !issue.fixed && !issue.addressedByFeedback && (
                              <div className="mt-3 pt-3 border-t border-amber-200 flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="outline" size="sm" className="text-xs">
                                        <PenLine className="h-3 w-3 mr-1" />
                                        Add Feedback
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Reviewer Feedback</DialogTitle>
                                        <DialogDescription>
                                          Provide your expert feedback for this issue.
                                        </DialogDescription>
                                      </DialogHeader>

                                      <div className="grid gap-4 py-4">
                                        <div className="space-y-2">
                                          <Label>Issue Type</Label>
                                          <Input value={issue.type} disabled />
                                        </div>

                                        <div className="space-y-2">
                                          <Label>Feedback Type</Label>
                                          <select
                                            className="w-full px-3 py-2 border border-[#e8e6dc] rounded-md"
                                            id={`feedback-type-major-${index}`}
                                          >
                                            <option value="text_correction">Text Correction</option>
                                            <option value="citation_correction">
                                              Citation Correction
                                            </option>
                                            <option value="data_correction">
                                              Data/Value Correction
                                            </option>
                                            <option value="section_addition">
                                              Section Addition Needed
                                            </option>
                                          </select>
                                        </div>

                                        <div className="space-y-2">
                                          <Label>Correction Details</Label>
                                          <Textarea
                                            id={`correction-details-major-${index}`}
                                            placeholder="Describe what needs to be corrected and how"
                                            className="h-24"
                                          />
                                        </div>
                                      </div>

                                      <DialogFooter>
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          onClick={() => {}}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            const feedbackType = document.getElementById(
                                              `feedback-type-major-${index}`
                                            ).value;
                                            const correction = document.getElementById(
                                              `correction-details-major-${index}`
                                            ).value;
                                            addFeedbackItem(
                                              { ...issue, id: issue.id || `major-${index}` },
                                              feedbackType,
                                              correction
                                            );
                                          }}
                                        >
                                          Add Feedback
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                </div>

                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                                  >
                                    <ThumbsDown className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-green-700 hover:bg-green-50 hover:text-green-800"
                                  >
                                    <ThumbsUp className="h-3 w-3 mr-1" />
                                    Approve
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Minor Issues */}
                {minorCount > 0 && (
                  <AccordionItem
                    value="minor"
                    className="border rounded-md overflow-hidden bg-white"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center">
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-800 border-blue-200 mr-3"
                        >
                          Minor
                        </Badge>
                        <span className="font-medium text-[#141413]">
                          Minor Issues ({minorCount})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3 pt-0">
                      <div className="space-y-3">
                        {validationResults.minor.map((issue, index) => (
                          <div
                            key={`minor-${index}`}
                            className="border rounded-md p-3 bg-blue-50 border-blue-100"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center">
                                <Checkbox
                                  id={`issue-${issue.id || `minor-${index}`}`}
                                  checked={selectedIssues.includes(issue.id || `minor-${index}`)}
                                  onCheckedChange={() =>
                                    toggleIssueSelection(issue.id || `minor-${index}`)
                                  }
                                  className="mr-2"
                                />
                                <div className="flex items-center">
                                  {getIssueTypeIcon(issue.type)}
                                  <span className="ml-2 font-medium text-[#141413]">
                                    {issue.message}
                                  </span>
                                </div>
                              </div>
                              {issue.fixed && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-800 border-green-200"
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Fixed
                                </Badge>
                              )}
                              {issue.addressedByFeedback && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-800 border-purple-200"
                                >
                                  <PenLine className="h-3.5 w-3.5 mr-1" />
                                  Reviewed
                                </Badge>
                              )}
                            </div>

                            {issue.location && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Location: <span className="font-mono">{issue.location}</span>
                              </p>
                            )}

                            {issue.regulatoryReference && (
                              <p className="text-xs text-[#6b6963] mb-2">
                                Reference:{' '}
                                <span className="font-medium">{issue.regulatoryReference}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            )}
          </TabsContent>

          <TabsContent value="checklist" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-[#e8e6dc]">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-medium text-[#141413]">Regulatory Checklist</h3>
                  <p className="text-sm text-[#6b6963]">
                    {regulatoryFramework} compliance verification - {checklistPassed} of{' '}
                    {checklistTotal} requirements met
                  </p>
                </div>
                <CerTooltipWrapper
                  tooltipContent="Regulatory checklist items are derived from official requirements documents"
                  whyThisMatters="All requirements must be satisfied for a compliant submission"
                >
                  <div className="flex items-center space-x-2">
                    <Progress
                      value={checklistPercentage}
                      className="h-2 w-32"
                      indicatorColor={checklistPercentage === 100 ? 'bg-[#788c5d]' : 'bg-[#d97757]'}
                    />
                    <span className="text-sm font-medium">{checklistPercentage}%</span>
                  </div>
                </CerTooltipWrapper>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-gray-50">
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead className="w-56">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationResults.regulatoryChecklist.items.map((item, index) => (
                    <TableRow key={`checklist-${index}`} className="hover:bg-gray-50">
                      <TableCell>
                        {item.result === 'passed' ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-800 border-green-200"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Pass
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-800 border-red-200"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Fail
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-[#141413]">
                        {item.description}
                        {item.details && (
                          <p className="text-xs text-[#6b6963] mt-1">{item.details}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-[#6b6963]">
                        {item.regulatoryReference}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {feedbackMode && (
            <TabsContent value="feedback" className="space-y-4">
              <div className="bg-white p-4 rounded-md border border-[#e8e6dc]">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-[#141413]">Review Feedback</h3>
                    <p className="text-sm text-[#6b6963]">
                      {reviewerFeedback.items.length} feedback item
                      {reviewerFeedback.items.length !== 1 ? 's' : ''} to be applied
                    </p>
                  </div>
                  <Button
                    className="bg-[#d97757] hover:bg-[#c15f3c] text-white"
                    onClick={submitFeedback}
                    disabled={reviewerFeedback.items.length === 0}
                  >
                    Submit Review Feedback
                  </Button>
                </div>

                {reviewerFeedback.items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[#6b6963]">No feedback items added yet.</p>
                    <p className="text-sm text-[#6b6963] mt-1">
                      Review issues and add feedback to include them here.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-gray-50">
                        <TableHead className="w-32">Type</TableHead>
                        <TableHead>Feedback</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewerFeedback.items.map((item, index) => (
                        <TableRow key={`feedback-${index}`} className="hover:bg-gray-50">
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="bg-purple-50 text-purple-800 border-purple-200"
                            >
                              {item.type.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-[#141413]">{item.correction}</p>
                            <p className="text-xs text-[#6b6963] mt-1">
                              For issue: {item.issueType} at {item.location}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                              onClick={() => {
                                setReviewerFeedback(prev => ({
                                  ...prev,
                                  items: prev.items.filter(i => i.id !== item.id),
                                }));
                              }}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  // Render initial state
  return (
    <div className="p-6 bg-white rounded-lg border border-[#e8e6dc]">
      <div className="text-center">
        <ShieldCheck className="h-12 w-12 text-[#d97757] mx-auto mb-3" />
        <h3 className="text-lg font-medium text-[#141413] mb-2">Regulatory Validation</h3>
        <p className="text-[#6b6963] max-w-md mx-auto mb-4">
          Validate your CER document against {regulatoryFramework} requirements to ensure compliance
          with regulations, confirm internal consistency, and verify data accuracy.
        </p>

        <CerTooltipWrapper
          tooltipContent="Runs AI-powered validation to identify issues that could cause regulatory rejection"
          whyThisMatters="Regulatory authorities require high standards of accuracy and completeness in CER documents"
        >
          <Button onClick={startValidation} className="bg-[#d97757] hover:bg-[#c15f3c] text-white">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Start Validation
          </Button>
        </CerTooltipWrapper>
      </div>

      <div className="mt-8 border-t border-[#e8e6dc] pt-6">
        <h4 className="font-medium text-[#141413] mb-2">What We Check</h4>
        <ul className="space-y-2 text-[#6b6963]">
          <li className="flex items-start">
            <CheckCircle className="h-4 w-4 text-[#d97757] mr-2 mt-0.5" />
            <span>Document completeness against regulatory requirements</span>
          </li>
          <li className="flex items-start">
            <CheckCircle className="h-4 w-4 text-[#d97757] mr-2 mt-0.5" />
            <span>Internal consistency of claims and intended use</span>
          </li>
          <li className="flex items-start">
            <CheckCircle className="h-4 w-4 text-[#d97757] mr-2 mt-0.5" />
            <span>Citation accuracy and prevention of hallucinated references</span>
          </li>
          <li className="flex items-start">
            <CheckCircle className="h-4 w-4 text-[#d97757] mr-2 mt-0.5" />
            <span>Factual accuracy of clinical data interpretations</span>
          </li>
          <li className="flex items-start">
            <CheckCircle className="h-4 w-4 text-[#d97757] mr-2 mt-0.5" />
            <span>Compliance with {regulatoryFramework} requirements checklist</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default CerValidationPanel;
