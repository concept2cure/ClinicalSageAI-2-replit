import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Brain, TrendingUp, AlertTriangle, CheckCircle, Target, Activity, Zap, Info, ChevronRight, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

/**
 * ForesightAI™ Protocol Integration Component
 * Embeds predictive intelligence into Protocol Designer
 */
export function ForesightAIProtocolWidget({ 
  studyId, 
  phase = "II", 
  indication = "oncology",
  biomarkers = [],
  endpoints = [],
  patientCount = 150,
  onRecommendationApply
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRecommendations, setSelectedRecommendations] = useState([]);

  // Query ForesightAI prediction API
  const { data: prediction, isLoading, refetch } = useQuery({
    queryKey: ['/api/foresight/score', studyId, phase],
    queryFn: async () => {
      // Mock API call for now - will connect to real endpoint
      return {
        success_score: 72,
        confidence_interval: { lower: 65, upper: 79 },
        risk_factors: [
          {
            factor: "novel_biomarker",
            impact: -0.10,
            recommendation: "Consider validated biomarkers from similar successful trials"
          },
          {
            factor: "small_sample_size",
            impact: -0.15,
            recommendation: "Increase patient count to 200+ for better statistical power"
          }
        ],
        recommendations: [
          {
            type: "endpoint",
            priority: "high",
            action: "Switch primary endpoint to Overall Response Rate (ORR)",
            impact: "+18% success probability"
          },
          {
            type: "protocol",
            priority: "medium", 
            action: "Add adaptive dose ranging after interim analysis",
            impact: "+12% success probability"
          },
          {
            type: "enrollment",
            priority: "medium",
            action: "Focus on urban centers with biomarker testing capabilities",
            impact: "-2 months enrollment time"
          }
        ],
        similar_trials: [
          { id: "NCT04567890", similarity: 0.92, outcome: "success", key_learning: "ORR endpoint with 150 patients" },
          { id: "NCT03456789", similarity: 0.87, outcome: "success", key_learning: "Adaptive dose ranging improved efficacy" }
        ],
        failure_patterns: [
          { pattern: "dose_toxicity", probability: 0.23, mitigation: "Implement strict dose escalation protocol" }
        ]
      };
    },
    enabled: false // Will enable when API is ready
  });

  // Mock data for demonstration
  const mockPrediction = {
    success_score: 72,
    confidence_interval: { lower: 65, upper: 79 },
    risk_factors: [
      {
        factor: "novel_biomarker",
        impact: -0.10,
        recommendation: "Consider validated biomarkers from similar successful trials"
      },
      {
        factor: "small_sample_size", 
        impact: -0.15,
        recommendation: "Increase patient count to 200+ for better statistical power"
      }
    ],
    recommendations: [
      {
        id: 'rec1',
        type: "endpoint",
        priority: "high",
        action: "Switch primary endpoint to Overall Response Rate (ORR)",
        impact: "+18% success probability"
      },
      {
        id: 'rec2',
        type: "protocol",
        priority: "medium",
        action: "Add adaptive dose ranging after interim analysis", 
        impact: "+12% success probability"
      },
      {
        id: 'rec3',
        type: "enrollment",
        priority: "medium",
        action: "Focus on urban centers with biomarker testing capabilities",
        impact: "-2 months enrollment time"
      }
    ],
    similar_trials: [
      { id: "NCT04567890", similarity: 92, outcome: "success", key_learning: "ORR endpoint with 150 patients" },
      { id: "NCT03456789", similarity: 87, outcome: "success", key_learning: "Adaptive dose ranging improved efficacy" }
    ]
  };

  const data = prediction || mockPrediction;

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const handleApplyRecommendations = () => {
    if (onRecommendationApply && selectedRecommendations.length > 0) {
      const recommendations = data.recommendations.filter(r => 
        selectedRecommendations.includes(r.id)
      );
      onRecommendationApply(recommendations);
    }
  };

  const toggleRecommendation = (recId) => {
    setSelectedRecommendations(prev => 
      prev.includes(recId) 
        ? prev.filter(id => id !== recId)
        : [...prev, recId]
    );
  };

  if (!isExpanded) {
    // Collapsed view - shows as a compact widget
    return (
      <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setIsExpanded(true)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              <CardTitle className="text-sm">ForesightAI™ Predictions</CardTitle>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Success Score</div>
              <div className={`text-2xl font-bold ${getScoreColor(data.success_score)}`}>
                {data.success_score}%
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="mb-1">
                {data.recommendations.length} recommendations
              </Badge>
              <div className="text-xs text-gray-500">
                CI: {data.confidence_interval.lower}-{data.confidence_interval.upper}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Expanded view - full predictions panel
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6 text-purple-500" />
              <div>
                <CardTitle>ForesightAI™ Protocol Intelligence</CardTitle>
                <CardDescription>
                  Translational predictions for Phase {phase} {indication} study
                </CardDescription>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              Minimize
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Success Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Predicted Success Probability</span>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${getScoreColor(data.success_score)}`}>
                  {data.success_score}%
                </span>
                <Button variant="ghost" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Progress value={data.success_score} className="h-3" />
            <div className="text-xs text-gray-500 mt-1">
              95% Confidence Interval: {data.confidence_interval.lower}% - {data.confidence_interval.upper}%
            </div>
          </div>

          {/* Risk Factors */}
          {data.risk_factors.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                Risk Factors
              </h4>
              <div className="space-y-2">
                {data.risk_factors.map((risk, idx) => (
                  <Alert key={idx} className="py-2">
                    <AlertDescription className="text-sm">
                      <strong>{risk.factor.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> 
                      <span className="text-red-600 ml-2">{(risk.impact * 100).toFixed(0)}% impact</span>
                      <div className="text-xs text-gray-600 mt-1">{risk.recommendation}</div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              AI Recommendations
            </h4>
            <div className="space-y-2">
              {data.recommendations.map((rec) => (
                <div 
                  key={rec.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    selectedRecommendations.includes(rec.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleRecommendation(rec.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedRecommendations.includes(rec.id)}
                        onChange={() => {}}
                        className="mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={getPriorityColor(rec.priority)} className="text-xs">
                            {rec.priority}
                          </Badge>
                          <span className="text-sm font-medium">{rec.type}</span>
                        </div>
                        <p className="text-sm mt-1">{rec.action}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs text-green-600">
                      {rec.impact}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            {selectedRecommendations.length > 0 && (
              <Button 
                className="w-full mt-3"
                onClick={handleApplyRecommendations}
              >
                Apply {selectedRecommendations.length} Recommendation{selectedRecommendations.length > 1 ? 's' : ''}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Similar Successful Trials */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-500" />
              Similar Successful Trials
            </h4>
            <div className="space-y-2">
              {data.similar_trials.map((trial, idx) => (
                <div key={idx} className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{trial.id}</span>
                        <Badge variant="outline" className="text-xs">
                          {trial.similarity}% match
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Key Learning: {trial.key_learning}
                      </p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ForesightAIProtocolWidget;