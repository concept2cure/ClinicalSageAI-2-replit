import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scale, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * EndpointEvaluator Component
 * 
 * Evaluates selected endpoints and provides analytics on:
 * - Feasibility
 * - Regulatory acceptance
 * - Sensitivity
 * - Historical success rate
 */
export default function EndpointEvaluator({ 
  indication,
  phase,
  endpoints = [],
  onEvaluationComplete = () => {} 
}) {
  const [loading, setLoading] = useState(false);
  const [evaluations, setEvaluations] = useState({});
  const { toast } = useToast();

  // Request endpoint evaluation from API
  const evaluateEndpoints = async () => {
    if (!indication || endpoints.length === 0) {
      // toast call replaced
  // Original: toast({
        title: "Missing Information",
        description: "Please select an indication and at least one endpoint",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing Information",
        description: "Please select an indication and at least one endpoint",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const evaluationResults = {};
      
      // Evaluate each endpoint
      for (const endpoint of endpoints) {
        const response = await apiRequest('POST', '/api/endpoint/evaluate', {
          endpoint: endpoint.text,
          indication,
          phase: phase || 'Phase 2'
        });
        
        const data = await response.json();
        
        if (data.success && data.evaluation) {
          evaluationResults[endpoint.text] = data.evaluation;
        } else {
          throw new Error(`Failed to evaluate endpoint: ${endpoint.text}`);
        }
      }
      
      setEvaluations(evaluationResults);
      onEvaluationComplete(evaluationResults);
      
      // toast call replaced
  // Original: toast({
        title: "Evaluation Complete",
        description: `Evaluated ${endpoints.length} endpoint${endpoints.length !== 1 ? 's' : ''}`,
      })
  console.log('Toast would show:', {
        title: "Evaluation Complete",
        description: `Evaluated ${endpoints.length} endpoint${endpoints.length !== 1 ? 's' : ''}`,
      });
    } catch (error) {
      console.error("Error evaluating endpoints:", error);
      // toast call replaced
  // Original: toast({
        title: "Evaluation Error",
        description: "Unable to evaluate endpoints. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Evaluation Error",
        description: "Unable to evaluate endpoints. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Format score as percentage
  const formatScore = (score) => {
    return `${Math.round(score * 100)}%`;
  };
  
  // Get color based on score
  const getScoreColor = (score) => {
    if (score >= 0.8) return "text-green-500";
    if (score >= 0.6) return "text-yellow-500";
    return "text-red-500";
  };
  
  // Get risk level based on score
  const getRiskLevel = (score) => {
    if (score >= 0.8) return "Low";
    if (score >= 0.6) return "Medium";
    return "High";
  };
  
  // Get risk badge color
  const getRiskBadgeVariant = (score) => {
    if (score >= 0.8) return "success";
    if (score >= 0.6) return "warning";
    return "destructive";
  };

  // Render the evaluation results for an endpoint
  const renderEvaluation = (endpoint, evaluation) => {
    return (
      <div key={endpoint} className="mb-6 border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold">{endpoint}</h3>
          <Badge variant={getRiskBadgeVariant(evaluation.overallScore)}>
            {getRiskLevel(evaluation.overallScore)} Risk
          </Badge>
        </div>
        
        <div className="grid gap-4 mt-2">
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Feasibility</span>
              <span className={getScoreColor(evaluation.feasibility)}>{formatScore(evaluation.feasibility)}</span>
            </div>
            <Progress value={evaluation.feasibility * 100} className="h-2" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Regulatory Acceptance</span>
              <span className={getScoreColor(evaluation.regulatoryAcceptance)}>{formatScore(evaluation.regulatoryAcceptance)}</span>
            </div>
            <Progress value={evaluation.regulatoryAcceptance * 100} className="h-2" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Sensitivity</span>
              <span className={getScoreColor(evaluation.sensitivity)}>{formatScore(evaluation.sensitivity)}</span>
            </div>
            <Progress value={evaluation.sensitivity * 100} className="h-2" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1 text-sm">
              <span>Historical Success Rate</span>
              <span className={getScoreColor(evaluation.successRate / 100)}>{evaluation.successRate}%</span>
            </div>
            <Progress value={evaluation.successRate} className="h-2" />
          </div>
        </div>
        
        {evaluation.reference && (
          <div className="mt-4 text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{evaluation.reference}</span>
          </div>
        )}
        
        {evaluation.concerns && evaluation.concerns.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Potential Concerns
            </h4>
            <ul className="text-sm pl-6 list-disc space-y-1">
              {evaluation.concerns.map((concern, i) => (
                <li key={i}>{concern}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Endpoint Evaluator
        </CardTitle>
        <CardDescription>
          Get detailed analytics and regulatory evaluation for selected endpoints
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="mb-4">
          <Button 
            variant="default" 
            className="w-full"
            onClick={evaluateEndpoints}
            disabled={loading || endpoints.length === 0 || !indication}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Evaluating {endpoints.length} endpoints...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Evaluate {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
        
        {Object.keys(evaluations).length > 0 ? (
          <div>
            {endpoints
              .filter(e => evaluations[e.text])
              .map(e => renderEvaluation(e.text, evaluations[e.text]))}
          </div>
        ) : (
          !loading && endpoints.length > 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Click the button above to evaluate selected endpoints
            </div>
          )
        )}
        
        {!loading && endpoints.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Please select endpoints to evaluate
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <div className="text-xs text-muted-foreground">
          Based on analysis of {phase || 'all phases'} trials for {indication || 'selected indication'}
        </div>
      </CardFooter>
    </Card>
  );
}