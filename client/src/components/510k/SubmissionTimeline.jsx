import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import GuidedTooltip from './GuidedTooltip';
import {
  Calendar, ChevronRight, FileText, CheckCircle, XCircle, AlertTriangle, Clock, HelpCircle, Info, Zap } from 'lucide-react'

/**
 * Interactive timeline for the 510(k) submission process
 * Displays all steps in the process and allows tracking progress
 */
const SubmissionTimeline = ({ currentStep = 1, steps = [], onSelectStep = () => {} }) => {
  // Determine the active step
  const activeStep = steps.find(step => step.id === currentStep) || steps[0];

  // Format a date for display
  const formatDate = date => {
    if (!date) return 'TBD';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get status color and icon for a step
  const getStepStatusInfo = step => {
    const statusMap = {
      complete: {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: <CheckCircle className="h-4 w-4" />,
      },
      'in-progress': {
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: <Clock className="h-4 w-4" />,
      },
      upcoming: {
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: <Calendar className="h-4 w-4" />,
      },
      error: {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: <XCircle className="h-4 w-4" />,
      },
      warning: {
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        icon: <AlertTriangle className="h-4 w-4" />,
      },
    };

    return statusMap[step.status] || statusMap['upcoming'];
  };

  return (
    <Card className="bg-white">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-white pb-4 border-b">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-indigo-700 flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-indigo-600" />
              510(k) Submission Timeline
            </CardTitle>
            <CardDescription>Track your progress through the submission process</CardDescription>
          </div>
          <GuidedTooltip
            title="About 510(k) Timeline"
            content={
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  The 510(k) submission timeline helps you track and manage your progress through
                  the FDA submission process.
                </p>
                <p className="text-sm text-gray-600">
                  Click on any step to see details and recommendations for that phase.
                </p>
              </div>
            }
          >
            <Button variant="ghost" size="sm" className="text-indigo-600 h-8 px-2">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </GuidedTooltip>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-800">
              Current Phase:{' '}
              <span className="text-indigo-700">{activeStep?.title || 'Not Started'}</span>
            </h3>
            {activeStep?.dueDate && (
              <div className="flex items-center text-sm">
                <Clock className="mr-1 h-4 w-4 text-gray-500" />
                <span className="text-gray-600">
                  Target completion: {formatDate(activeStep.dueDate)}
                </span>
              </div>
            )}
          </div>

          {activeStep?.description && (
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100 mb-4">
              <div className="flex">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-sm text-blue-700">{activeStep.description}</p>
              </div>
            </div>
          )}

          {activeStep?.recommendation && (
            <div className="bg-indigo-50 p-3 rounded-md border border-indigo-100 mb-4">
              <div className="flex">
                <Zap className="h-4 w-4 text-indigo-600 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-indigo-800 mb-1">Recommendation</h4>
                  <p className="text-sm text-indigo-700">{activeStep.recommendation}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="py-4">
          <div className="relative">
            {/* Timeline track */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 ml-0.5"></div>

            {/* Timeline steps */}
            <div className="space-y-6">
              {steps.map((step, index) => {
                const { color, icon } = getStepStatusInfo(step);
                const isActive = step.id === currentStep;
                const isPast = step.status === 'complete';

                return (
                  <div
                    key={step.id}
                    className={`pl-16 relative ${isActive ? 'animate-pulse' : ''}`}
                  >
                    {/* Timeline node */}
                    <div
                      className={`absolute left-5 w-3 h-3 rounded-full border-2 ${isActive ? 'border-blue-600 bg-white' : isPast ? 'border-green-600 bg-green-600' : 'border-gray-400 bg-white'}`}
                      style={{ top: '10px', transform: 'translateX(-50%)' }}
                    ></div>

                    {/* Step content */}
                    <div
                      className={`rounded-md border p-3 cursor-pointer transition-colors ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
                      onClick={() => onSelectStep(step.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center">
                            <h4
                              className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}
                            >
                              {index + 1}. {step.title}
                            </h4>
                            <Badge variant="outline" className={`ml-2 ${color}`}>
                              <span className="flex items-center">
                                {icon}
                                <span className="ml-1">
                                  {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                                </span>
                              </span>
                            </Badge>
                          </div>

                          {step.shortDescription && (
                            <p
                              className={`text-sm mt-1 ${isActive ? 'text-blue-600' : 'text-gray-600'}`}
                            >
                              {step.shortDescription}
                            </p>
                          )}
                        </div>

                        {step.dueDate && (
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="mr-1 h-3 w-3" />
                            {formatDate(step.dueDate)}
                          </div>
                        )}
                      </div>

                      {isActive && step.substeps && step.substeps.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-blue-100">
                          <h5 className="text-xs font-medium text-blue-700 mb-2">Next Actions</h5>
                          <div className="space-y-2">
                            {step.substeps.map((substep, subIndex) => (
                              <div key={subIndex} className="flex items-start">
                                <div
                                  className={`p-0.5 rounded-full mr-2 ${substep.complete ? 'bg-green-100' : 'bg-gray-100'}`}
                                >
                                  {substep.complete ? (
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Clock className="h-3 w-3 text-gray-600" />
                                  )}
                                </div>
                                <span
                                  className={`text-xs ${substep.complete ? 'text-gray-500 line-through' : 'text-gray-700'}`}
                                >
                                  {substep.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SubmissionTimeline;
