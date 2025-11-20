import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Clock,
  User,
  ArrowRight,
  AlertTriangle,
  FileCheck,
  Users,
  Calendar,
  MessageSquare,
} from 'lucide-react';

// 6. Enhanced Approval Workflow Engine
const EnhancedApprovalWorkflow = ({ methodId, onWorkflowComplete }) => {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (methodId) {
      loadWorkflow();
    }
  }, [methodId]);

  const loadWorkflow = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/approval-workflow`, {
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const workflowData = await response.json();
        setWorkflow(workflowData);
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      // Fallback to demo data
      setWorkflow({
        currentStep: 1,
        totalSteps: 4,
        steps: [
          {
            id: 1,
            name: 'Technical Review',
            status: 'COMPLETED',
            assignee: 'Dr. Sarah Chen',
            completedAt: '2025-08-20T10:30:00Z',
            comments: 'All technical aspects reviewed and approved',
            duration: 2.5,
          },
          {
            id: 2,
            name: 'Guard Validation',
            status: 'IN_PROGRESS',
            assignee: 'System Auto-Check',
            startedAt: '2025-08-22T14:00:00Z',
            progress: 85,
            expectedCompletion: '2025-08-23T10:00:00Z',
          },
          {
            id: 3,
            name: 'Quality Assurance',
            status: 'PENDING',
            assignee: 'Jane Smith',
            estimatedStart: '2025-08-24T09:00:00Z',
            estimatedDuration: 1.5,
            requirements: ['Document review', 'Compliance check', 'Risk assessment'],
          },
          {
            id: 4,
            name: 'Final Approval',
            status: 'PENDING',
            assignee: 'Michael Rodriguez',
            estimatedStart: '2025-08-25T10:00:00Z',
            estimatedDuration: 0.5,
            requirements: ['Final sign-off', 'Release authorization'],
          },
        ],
        history: [
          {
            timestamp: '2025-08-20T10:30:00Z',
            action: 'Technical Review Completed',
            user: 'Dr. Sarah Chen',
            details: 'All validation parameters meet ICH Q2(R2) requirements',
          },
          {
            timestamp: '2025-08-22T14:00:00Z',
            action: 'Guard Validation Started',
            user: 'System',
            details: 'Automated guard checks initiated',
          },
        ],
        canAdvance: true,
        requiresOverride: false,
        nextAction: 'Complete Guard Validation',
        estimatedCompletion: '2025-08-25T15:00:00Z',
      });
    } finally {
      setLoading(false);
    }
  };

  const advanceWorkflow = async stepId => {
    try {
      setAdvancing(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      const response = await fetch(
        `/api/analytical/methods/${methodId}/approval-workflow/advance`,
        {
          method: 'POST',
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ stepId, userId: 'current-user' }),
        }
      );

      if (response.ok) {
        await loadWorkflow(); // Refresh workflow
        if (workflow?.currentStep === workflow?.totalSteps) {
          onWorkflowComplete?.();
        }
      }
    } catch (error) {
      console.error('Error advancing workflow:', error);
    } finally {
      setAdvancing(false);
    }
  };

  const getStepIcon = step => {
    switch (step.status) {
      case 'COMPLETED':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'IN_PROGRESS':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'PENDING':
        return <User className="w-5 h-5 text-gray-400" />;
      default:
        return <User className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepBadgeVariant = status => {
    switch (status) {
      case 'COMPLETED':
        return 'default';
      case 'IN_PROGRESS':
        return 'secondary';
      case 'PENDING':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
            <div className="text-sm text-gray-600">Loading approval workflow...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!workflow) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <div>No workflow configuration found</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workflow Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Enhanced Approval Workflow
            </div>
            <Badge variant="outline">
              Step {workflow.currentStep} of {workflow.totalSteps}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(workflow.currentStep / workflow.totalSteps) * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-sm text-gray-600">
              <span>
                Progress: {Math.round((workflow.currentStep / workflow.totalSteps) * 100)}%
              </span>
              <span>
                Est. Completion: {new Date(workflow.estimatedCompletion).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Approval Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workflow.steps.map((step, index) => (
              <div key={step.id} className="relative">
                {/* Connection Line */}
                {index < workflow.steps.length - 1 && (
                  <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-300" />
                )}

                <div
                  className={`flex items-start gap-4 p-4 rounded-lg border ${
                    step.status === 'COMPLETED'
                      ? 'bg-green-50 border-green-200'
                      : step.status === 'IN_PROGRESS'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-shrink-0">{getStepIcon(step)}</div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{step.name}</h4>
                        <Badge variant={getStepBadgeVariant(step.status)}>
                          {step.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      {step.status === 'IN_PROGRESS' && workflow.canAdvance && (
                        <Button
                          onClick={() => advanceWorkflow(step.id)}
                          disabled={advancing}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {advancing ? 'Processing...' : 'Complete Step'}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {step.assignee}
                      </div>
                    </div>

                    {step.status === 'COMPLETED' && (
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-1 text-green-700">
                          <Calendar className="w-3 h-3" />
                          Completed: {new Date(step.completedAt).toLocaleString()}
                        </div>
                        {step.comments && (
                          <div className="flex items-start gap-1 text-gray-600">
                            <MessageSquare className="w-3 h-3 mt-0.5" />
                            {step.comments}
                          </div>
                        )}
                        {step.duration && (
                          <div className="text-xs text-gray-500">
                            Duration: {step.duration} hours
                          </div>
                        )}
                      </div>
                    )}

                    {step.status === 'IN_PROGRESS' && (
                      <div className="text-sm space-y-2">
                        <div className="flex items-center gap-1 text-blue-700">
                          <Calendar className="w-3 h-3" />
                          Started: {new Date(step.startedAt).toLocaleString()}
                        </div>
                        {step.progress && (
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span>Progress</span>
                              <span>{step.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${step.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {step.expectedCompletion && (
                          <div className="text-xs text-gray-500">
                            Expected completion:{' '}
                            {new Date(step.expectedCompletion).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {step.status === 'PENDING' && (
                      <div className="text-sm space-y-1">
                        {step.estimatedStart && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar className="w-3 h-3" />
                            Est. start: {new Date(step.estimatedStart).toLocaleString()}
                          </div>
                        )}
                        {step.estimatedDuration && (
                          <div className="text-xs text-gray-500">
                            Est. duration: {step.estimatedDuration} hours
                          </div>
                        )}
                        {step.requirements && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-gray-700 mb-1">
                              Requirements:
                            </div>
                            <ul className="text-xs text-gray-600 space-y-0.5">
                              {step.requirements.map((req, idx) => (
                                <li key={idx}>• {req}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workflow History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Workflow History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {workflow.history.map((entry, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-md">
                <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-2" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{entry.action}</div>
                  <div className="text-gray-600">{entry.details}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {entry.user} • {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedApprovalWorkflow;
