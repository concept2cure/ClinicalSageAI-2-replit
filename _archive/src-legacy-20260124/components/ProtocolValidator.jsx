import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProtocolValidator({ sessionId, onValidationComplete = () => {} }) {
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const { toast } = useToast();

  // Validate protocol
  const handleValidateProtocol = async () => {
    if (!sessionId) {
      // toast call replaced
  // Original: toast({
        title: "No Study Session",
        description: "Please select a study session first",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No Study Session",
        description: "Please select a study session first",
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);

    try {
      // Log this action to trace API for decision tracking
      try {
        await fetch('/api/wisdom/trace-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            input: "Protocol validation requested",
            reasoning: [
              "Checking protocol against regulatory guidelines",
              "Validating ICH/GCP compliance",
              "Checking statistical model appropriateness",
              "Identifying missing critical sections"
            ],
            output: "Protocol validation report with identified issues"
          })
        });
      } catch (traceError) {
        console.error("Failed to log wisdom trace:", traceError);
      }

      const response = await fetch("/api/protocol/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          study_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Validation failed");
      }

      const data = await response.json();
      setValidationResults(data);

      // Log this to memory
      try {
        const issueCount = data.issues?.length || 0;
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Protocol Validation Completed",
            summary: `Validated protocol and found ${issueCount} issues (${data.criticalCount || 0} critical, ${data.majorCount || 0} major, ${data.minorCount || 0} minor).`,
            status: issueCount > 0 ? "needs_attention" : "completed"
          })
        });
      } catch (memoryError) {
        console.error("Failed to log memory:", memoryError);
      }

      // Call the callback
      onValidationComplete(data.issues || []);

      // toast call replaced
  // Original: toast({
        title: "Validation Complete",
        description: `Found ${data.issues?.length || 0} issues with the protocol.`,
      })
  console.log('Toast would show:', {
        title: "Validation Complete",
        description: `Found ${data.issues?.length || 0} issues with the protocol.`,
      });
    } catch (error) {
      console.error("Validation error:", error);
      // toast call replaced
  // Original: toast({
        title: "Validation Failed",
        description: error.message || "An error occurred during validation.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Validation Failed",
        description: error.message || "An error occurred during validation.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Load validation results if available in the current session
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/protocol/validation-results?study_id=${sessionId}`)
        .then(response => {
          if (response.ok) return response.json();
          return null;
        })
        .then(data => {
          if (data && data.issues) {
            setValidationResults(data);
          }
        })
        .catch(error => {
          console.error("Error loading validation results:", error);
        });
    }
  }, [sessionId]);

  // Get filtered issues
  const getFilteredIssues = () => {
    if (!validationResults || !validationResults.issues) return [];
    
    return validationResults.issues.filter(issue => {
      if (severityFilter === "all") return true;
      return issue.severity === severityFilter;
    });
  };

  // Get severity badge styling
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case "critical":
        return { 
          variant: "destructive", 
          icon: <XCircle className="h-3.5 w-3.5 mr-1" />,
          label: "Critical"
        };
      case "major":
        return { 
          variant: "warning", 
          icon: <AlertTriangle className="h-3.5 w-3.5 mr-1" />,
          label: "Major"
        };
      case "minor":
        return { 
          variant: "outline", 
          icon: <AlertCircle className="h-3.5 w-3.5 mr-1" />,
          label: "Minor"
        };
      default:
        return { 
          variant: "secondary", 
          icon: <AlertCircle className="h-3.5 w-3.5 mr-1" />,
          label: severity
        };
    }
  };

  // Get overall validation status
  const getValidationStatus = () => {
    if (!validationResults) return null;
    
    const { issues = [] } = validationResults;
    const criticalCount = issues.filter(i => i.severity === "critical").length;
    const majorCount = issues.filter(i => i.severity === "major").length;
    
    if (criticalCount > 0) {
      return {
        status: "failed",
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        message: "Critical issues found",
        description: `${criticalCount} critical issues require immediate attention`
      };
    } else if (majorCount > 0) {
      return {
        status: "warning",
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        message: "Major issues found",
        description: `${majorCount} major issues should be addressed`
      };
    } else if (issues.length > 0) {
      return {
        status: "minor",
        icon: <AlertCircle className="h-5 w-5 text-blue-500" />,
        message: "Minor issues found",
        description: `${issues.length} minor issues could be improved`
      };
    } else {
      return {
        status: "passed",
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        message: "Validation passed",
        description: "No issues found in the protocol"
      };
    }
  };

  const validationStatus = getValidationStatus();
  const filteredIssues = getFilteredIssues();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <ShieldCheck className="mr-2 h-5 w-5" />
          Protocol Validator
        </CardTitle>
        <CardDescription>
          Validate your protocol against regulatory standards and best practices
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {validationResults ? (
          <>
            <Alert variant={validationStatus.status === "passed" ? "default" : "destructive"}>
              {validationStatus.icon}
              <AlertTitle>{validationStatus.message}</AlertTitle>
              <AlertDescription>
                {validationStatus.description}
              </AlertDescription>
            </Alert>
            
            <div className="flex space-x-2 mt-4">
              <Badge 
                variant={severityFilter === "all" ? "default" : "outline"} 
                className="cursor-pointer"
                onClick={() => setSeverityFilter("all")}
              >
                All Issues ({validationResults.issues?.length || 0})
              </Badge>
              <Badge 
                variant={severityFilter === "critical" ? "destructive" : "outline"} 
                className="cursor-pointer"
                onClick={() => setSeverityFilter("critical")}
              >
                Critical ({validationResults.criticalCount || 0})
              </Badge>
              <Badge 
                variant={severityFilter === "major" ? "warning" : "outline"} 
                className="cursor-pointer"
                onClick={() => setSeverityFilter("major")}
              >
                Major ({validationResults.majorCount || 0})
              </Badge>
              <Badge 
                variant={severityFilter === "minor" ? "secondary" : "outline"} 
                className="cursor-pointer"
                onClick={() => setSeverityFilter("minor")}
              >
                Minor ({validationResults.minorCount || 0})
              </Badge>
            </div>
            
            {filteredIssues.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {filteredIssues.map((issue, index) => {
                  const severityStyle = getSeverityBadge(issue.severity);
                  
                  return (
                    <AccordionItem key={index} value={`item-${index}`}>
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center text-left">
                          <Badge variant={severityStyle.variant} className="mr-2 flex items-center">
                            {severityStyle.icon}
                            {severityStyle.label}
                          </Badge>
                          <span>{issue.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-sm space-y-2 p-2 border rounded-md bg-muted/30">
                          <p>{issue.description}</p>
                          {issue.location && (
                            <p className="text-xs text-muted-foreground">
                              <strong>Location:</strong> {issue.location}
                            </p>
                          )}
                          {issue.recommendation && (
                            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded">
                              <p className="text-sm font-medium">Recommendation:</p>
                              <p className="text-sm">{issue.recommendation}</p>
                            </div>
                          )}
                          {issue.reference && (
                            <p className="text-xs text-muted-foreground mt-2">
                              <strong>Reference:</strong> {issue.reference}
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <div className="text-center p-4 border rounded-md bg-muted/20">
                {severityFilter === "all" ? (
                  <p>No issues found in the protocol.</p>
                ) : (
                  <p>No {severityFilter} issues found in the protocol.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-6 border rounded-md bg-muted/20">
            <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-base font-medium mb-2">Protocol Validation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Check your protocol for regulatory compliance, consistency, and completeness.
            </p>
            <div className="text-sm text-muted-foreground">
              {sessionId ? (
                <span className="text-green-600 flex items-center justify-center">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Ready for Session: {sessionId}
                </span>
              ) : (
                <span className="text-amber-600">
                  Select a study session first to validate your protocol
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={handleValidateProtocol} 
          disabled={isValidating || !sessionId}
          className="w-full"
        >
          {isValidating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {validationResults ? "Re-validate Protocol" : "Validate Protocol"}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}