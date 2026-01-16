import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Map, ArrowRight, CheckCircle, Circle, AlertCircle, Play, Compass } from 'lucide-react'

export default function SmartSubmissionWizard({ currentModule = 'Module 2' }) {
  const [activeStep, setActiveStep] = useState(2);

  const steps = [
    { id: 1, name: 'Module 1: Admin', status: 'complete', progress: 100, critical: false },
    { id: 2, name: 'Module 2: Summaries', status: 'in-progress', progress: 45, critical: true },
    { id: 3, name: 'Module 3: Quality', status: 'in-progress', progress: 30, critical: true },
    { id: 4, name: 'Module 4: Nonclinical', status: 'pending', progress: 0, critical: false },
    { id: 5, name: 'Module 5: Clinical', status: 'pending', progress: 0, critical: true },
  ];

  const recommendations = [
    {
      id: 1,
      type: 'next-action',
      text: 'Complete Section 2.5 Clinical Overview',
      reason: 'Prerequisite for Module 5 organization',
      impact: 'High'
    },
    {
      id: 2,
      type: 'blocker',
      text: 'Missing Stability Data for 3.2.S.7',
      reason: 'Required for Quality Overall Summary',
      impact: 'Critical'
    }
  ];

  return (
    <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white">
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left: Progress Map */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Compass className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-lg">Submission GPS</h3>
              <Badge variant="outline" className="ml-2">Target: Q3 2026</Badge>
            </div>
            
            <div className="space-y-4">
              {steps.map((step) => (
                <div key={step.id} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {step.status === 'complete' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : step.status === 'in-progress' ? (
                        <div className="h-4 w-4 rounded-full border-2 border-blue-500 flex items-center justify-center">
                          <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                      ) : (
                        <Circle className="h-4 w-4 text-slate-300" />
                      )}
                      <span className={`text-sm font-medium ${step.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}`}>
                        {step.name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{step.progress}%</span>
                  </div>
                  <Progress value={step.progress} className="h-1.5" />
                </div>
              ))}
            </div>
          </div>

          {/* Right: AI Guide */}
          <div className="md:w-1/3 border-l pl-6">
            <h4 className="font-medium text-sm text-slate-500 uppercase tracking-wider mb-3">
              Recommended Actions
            </h4>
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div 
                  key={rec.id} 
                  className={`p-3 rounded-lg border text-sm ${
                    rec.type === 'blocker' 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-white border-blue-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {rec.type === 'blocker' ? (
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    ) : (
                      <Play className="h-4 w-4 text-blue-500 mt-0.5" />
                    )}
                    <div>
                      <div className={`font-medium ${rec.type === 'blocker' ? 'text-red-700' : 'text-slate-800'}`}>
                        {rec.text}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Why: {rec.reason}
                      </div>
                    </div>
                  </div>
                  {rec.type === 'next-action' && (
                    <Button size="sm" className="w-full mt-2 h-7 text-xs">
                      Start Now <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
