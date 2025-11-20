import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Download, Play, CheckCircle, PieChart, FileText, Clock } from 'lucide-react';
import { UseCase } from './UseCaseLibrary';

interface UseCaseDetailProps {
  useCase: UseCase;
  onLaunch: () => void;
  onDownload: () => void;
}

export default function UseCaseDetail({ useCase, onLaunch, onDownload }: UseCaseDetailProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{useCase.title}</h2>
          <p className="text-muted-foreground">{useCase.audience}</p>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700">
          {useCase.trialSageSolution.inputs.phase}
        </Badge>
      </div>

      <Separator />

      {/* The Strategic Challenge */}
      <div>
        <h3 className="text-lg font-semibold flex items-center mb-3">
          <span className="bg-red-100 text-red-700 rounded-full p-1 mr-2">🧭</span>
          The Strategic Challenge
        </h3>
        <Card>
          <CardContent className="p-4">
            <p className="text-gray-800">{useCase.challenge}</p>
            {useCase.background && (
              <p className="text-sm text-gray-600 mt-2">{useCase.background}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Traditional Approach */}
      <div>
        <h3 className="text-lg font-semibold flex items-center mb-3">
          <span className="bg-orange-100 text-orange-700 rounded-full p-1 mr-2">⏱️</span>
          Traditional Approach
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm text-gray-500">Cost</h4>
              <p className="text-xl font-semibold">{useCase.traditionalApproach.cost}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm text-gray-500">Timeline</h4>
              <p className="text-xl font-semibold">{useCase.traditionalApproach.timeline}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm text-gray-500">Challenges</h4>
              <p className="text-sm">{useCase.traditionalApproach.challenges}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* TrialSage Intelligence Solution */}
      <div>
        <h3 className="text-lg font-semibold flex items-center mb-3">
          <span className="bg-blue-100 text-blue-700 rounded-full p-1 mr-2">🧠</span>
          TrialSage Intelligence Solution
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Modules */}
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-medium mb-2">Activated Modules</h4>
              <div className="flex flex-wrap gap-2">
                {useCase.trialSageSolution.modules.map((module, idx) => (
                  <Badge key={idx} variant="outline" className="bg-blue-50">
                    <CheckCircle className="h-3 w-3 mr-1 text-green-600" /> {module}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Input Parameters */}
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-medium mb-2">Auto-Filled Parameters</h4>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                {Object.entries(useCase.trialSageSolution.inputs).map(([key, value], idx) => (
                  <div key={idx} className="flex items-start">
                    <span className="text-gray-500 mr-2">
                      {key.charAt(0).toUpperCase() + key.slice(1)}:
                    </span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Outcomes & ROI */}
      <div>
        <h3 className="text-lg font-semibold flex items-center mb-3">
          <span className="bg-green-100 text-green-700 rounded-full p-1 mr-2">📊</span>
          Outcomes & ROI
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start mb-3">
                <Clock className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                <div>
                  <h4 className="font-medium">Time Saved</h4>
                  <p className="text-xl font-bold text-green-600">
                    {useCase.trialSageSolution.outcomes.timeSaved}
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <PieChart className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
                <div>
                  <h4 className="font-medium">Cost Avoided</h4>
                  <p className="text-xl font-bold text-green-600">
                    {useCase.trialSageSolution.outcomes.costAvoided}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-medium mb-2">Strategic Benefits</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>{useCase.trialSageSolution.outcomes.regulatoryAlignment}</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>{useCase.trialSageSolution.outcomes.riskMitigation}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <h3 className="text-lg font-semibold flex items-center mb-3">
          <span className="bg-purple-100 text-purple-700 rounded-full p-1 mr-2">📥</span>
          Included Deliverables
        </h3>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {useCase.deliverables.map((deliverable, idx) => (
                <div key={idx} className="flex items-start">
                  <FileText className="h-4 w-4 text-purple-600 mr-2 mt-0.5" />
                  <span>{deliverable}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Demo Section (if available) */}
      {useCase.interactiveDemo && (
        <div>
          <h3 className="text-lg font-semibold flex items-center mb-3">
            <span className="bg-yellow-100 text-yellow-700 rounded-full p-1 mr-2">📊</span>
            Interactive Preview
          </h3>

          <Card>
            <CardContent className="p-4">
              {useCase.interactiveDemo.sampleProtocolSection && (
                <div className="p-3 bg-gray-50 rounded border text-sm font-mono mb-3 max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">
                    {useCase.interactiveDemo.sampleProtocolSection}
                  </pre>
                </div>
              )}

              {useCase.interactiveDemo.sampleChartData && (
                <div className="h-64 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                  [Interactive Chart Visualization]
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end space-x-3 pt-4">
        <Button variant="outline" onClick={onDownload} className="flex items-center">
          <Download className="h-4 w-4 mr-2" />
          Download Bundle
        </Button>
        <Button onClick={onLaunch} className="flex items-center">
          <Play className="h-4 w-4 mr-2" />
          Launch In TrialSage
        </Button>
      </div>
    </div>
  );
}
