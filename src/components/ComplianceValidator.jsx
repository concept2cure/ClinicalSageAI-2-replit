import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle, ArrowUpCircle, Download } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

function ComplianceValidator() {
  const [protocolText, setProtocolText] = useState('');
  const [phase, setPhase] = useState('general');
  const [indication, setIndication] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [activeTab, setActiveTab] = useState('issues');
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!protocolText.trim()) {
      setError('Please enter protocol text before validating');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/validate-protocol', {
        protocol_text: protocolText,
        phase: phase,
        indication: indication || undefined,
      });

      setValidationResults(response.data);
      setActiveTab('issues');
    } catch (err) {
      console.error('Error validating protocol:', err);
      setError(err.response?.data?.detail || 'An error occurred during validation');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setProtocolText('');
    setValidationResults(null);
    setError(null);
  };

  const getSeverityIcon = severity => {
    switch (severity) {
      case 'high':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'low':
        return <AlertTriangle className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getScoreColor = score => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const handleFixIssue = suggestion => {
    // This would integrate with an AI service to implement the fix
    // For now we just append the suggestion
    const fixMessage = `\n\n/* SUGGESTED FIX for ${suggestion.section} section:\n${suggestion.suggestion}\n*/\n`;
    setProtocolText(prev => prev + fixMessage);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
      {/* Input Panel */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Protocol Compliance Validator</CardTitle>
          <CardDescription>
            Check your clinical trial protocol for regulatory compliance issues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="text-sm font-medium mb-1 block">Trial Phase</label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="phase1">Phase 1</SelectItem>
                    <SelectItem value="phase2">Phase 2</SelectItem>
                    <SelectItem value="phase3">Phase 3</SelectItem>
                    <SelectItem value="phase4">Phase 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-1/2">
                <label className="text-sm font-medium mb-1 block">Indication (Optional)</label>
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={indication}
                  onChange={e => setIndication(e.target.value)}
                  placeholder="e.g. Diabetes, Oncology"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Protocol Text</label>
              <Textarea
                className="min-h-[300px]"
                placeholder="Paste your protocol text here..."
                value={protocolText}
                onChange={e => setProtocolText(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !protocolText.trim()}>
            {loading ? 'Validating...' : 'Validate Protocol'}
          </Button>
        </CardFooter>
      </Card>

      {/* Results Panel */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Validation Results</CardTitle>
              <CardDescription>
                {validationResults
                  ? `Analysis completed with a compliance score of ${validationResults.compliance_score}%`
                  : 'Submit your protocol for compliance analysis'}
              </CardDescription>
            </div>
            {validationResults && (
              <div className="text-center">
                <div className="text-2xl font-bold">{validationResults.compliance_score}%</div>
                <Progress
                  value={validationResults.compliance_score}
                  className={`w-[100px] h-2 ${getScoreColor(validationResults.compliance_score)}`}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!validationResults ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center p-4">
              <ArrowUpCircle className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-muted-foreground">
                Enter your protocol text and click "Validate Protocol" to check for compliance
                issues.
              </p>
            </div>
          ) : (
            <Tabs defaultValue="issues" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="issues" className="flex-1">
                  Issues
                  {validationResults.issues.length > 0 && (
                    <Badge className="ml-2 bg-red-500">{validationResults.issues.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="flex-1">
                  Suggestions
                  {validationResults.suggestions.length > 0 && (
                    <Badge className="ml-2 bg-blue-500">
                      {validationResults.suggestions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="details" className="flex-1">
                  Details
                </TabsTrigger>
              </TabsList>

              {/* Issues Tab */}
              <TabsContent value="issues" className="min-h-[350px]">
                {validationResults.issues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-center">
                    <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                    <p className="font-medium text-green-600">No compliance issues found!</p>
                    <p className="text-muted-foreground mt-2">
                      Your protocol appears to comply with regulatory guidelines.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                    {validationResults.issues.map((issue, index) => (
                      <Alert
                        key={index}
                        className={`
                        ${
                          issue.severity === 'high'
                            ? 'border-red-500 bg-red-50'
                            : issue.severity === 'medium'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-blue-500 bg-blue-50'
                        }
                      `}
                      >
                        <div className="flex items-start">
                          {getSeverityIcon(issue.severity)}
                          <div className="ml-2">
                            <AlertTitle className="flex items-center gap-2">
                              {issue.description}
                              {issue.severity === 'high' && (
                                <Badge variant="destructive">Critical</Badge>
                              )}
                            </AlertTitle>
                            <AlertDescription className="mt-1">
                              {issue.suggestion}
                              {issue.guideline && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Guideline: {issue.guideline}
                                </div>
                              )}
                              {issue.location && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Location: {issue.location.replace('_', ' ')}
                                </div>
                              )}
                            </AlertDescription>
                          </div>
                        </div>
                      </Alert>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Suggestions Tab */}
              <TabsContent value="suggestions" className="min-h-[350px]">
                {validationResults.suggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[350px] text-center">
                    <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                    <p className="text-muted-foreground">
                      No suggestions needed for this protocol.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 max-h-[350px] overflow-y-auto pr-2">
                    {validationResults.suggestions.map((suggestion, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="font-medium mb-2">
                          {suggestion.section.replace('_', ' ')} Section
                        </div>

                        <div className="mb-2 text-sm">
                          <div className="font-medium mb-1">Issues:</div>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {suggestion.issues.map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </div>

                        <Separator className="my-3" />

                        <div className="mb-2 text-sm">
                          <div className="font-medium mb-1">Suggested Fix:</div>
                          <div className="p-3 bg-muted rounded-md text-muted-foreground whitespace-pre-wrap">
                            {suggestion.suggestion}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => handleFixIssue(suggestion)}
                        >
                          Apply Suggestion
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="min-h-[350px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-1">Missing Sections</h3>
                      {validationResults.missing_sections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No missing sections detected
                        </p>
                      ) : (
                        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                          {validationResults.missing_sections.map((section, i) => (
                            <li key={i}>{section.replace('_', ' ')}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h3 className="font-medium mb-1">Critical Issues</h3>
                      {validationResults.critical_issues.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No critical issues detected</p>
                      ) : (
                        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                          {validationResults.critical_issues.map((issue, i) => (
                            <li key={i}>{issue.description}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-1">Detected Metadata</h3>
                      <dl className="text-sm">
                        <div className="flex py-1">
                          <dt className="w-24 font-medium">Title:</dt>
                          <dd className="text-muted-foreground">
                            {validationResults.metadata.title || 'Not detected'}
                          </dd>
                        </div>
                        <div className="flex py-1">
                          <dt className="w-24 font-medium">Phase:</dt>
                          <dd className="text-muted-foreground">
                            {validationResults.metadata.phase || 'Not detected'}
                          </dd>
                        </div>
                        <div className="flex py-1">
                          <dt className="w-24 font-medium">Indication:</dt>
                          <dd className="text-muted-foreground">
                            {validationResults.metadata.indication || 'Not detected'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div>
                      <h3 className="font-medium mb-1">Compliance Summary</h3>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span>Regulatory compliance:</span>
                          <span>{validationResults.compliance_score}%</span>
                        </div>
                        <Progress
                          value={validationResults.compliance_score}
                          className={`h-2 ${getScoreColor(validationResults.compliance_score)}`}
                        />

                        <div className="mt-4 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-xs">
                              High severity issues:{' '}
                              {validationResults.issues.filter(i => i.severity === 'high').length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                            <span className="text-xs">
                              Medium severity issues:{' '}
                              {validationResults.issues.filter(i => i.severity === 'medium').length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-xs">
                              Low severity issues:{' '}
                              {validationResults.issues.filter(i => i.severity === 'low').length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          {validationResults && (
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default ComplianceValidator;
