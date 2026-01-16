import React, { useState } from 'react';
import { BookOpen, MapPin, CheckCircle, ArrowRight, Lightbulb, FileText, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import SimpleTooltip from './SimpleTooltip';

/**
 * ComplianceStoryExample Component
 *
 * A simplified version of the compliance workflow storytelling feature.
 * This provides a straightforward demonstration without requiring the full
 * context-driven implementation.
 */
const ComplianceStoryExample = () => {
  // State
  const [currentStage, setCurrentStage] = useState('planning');
  const [progress, setProgress] = useState(20);

  // Story journey stages
  const storyJourney = [
    {
      id: 'planning',
      title: 'Planning & Scoping',
      description:
        'Begin your CER journey by properly scoping the document and understanding requirements',
      icon: <MapPin size={18} />,
      tooltip:
        'In this stage, you define your device scope, identify applicable regulations, and establish evaluation criteria.',
    },
    {
      id: 'dataCollection',
      title: 'Data Collection',
      description: 'Gather all relevant clinical evidence for your device',
      icon: <FileText size={18} />,
      tooltip:
        'This stage involves conducting literature searches, identifying equivalent devices, and compiling clinical investigation data.',
    },
    {
      id: 'dataAnalysis',
      title: 'Data Analysis',
      description: 'Analyze and evaluate the collected clinical evidence',
      icon: <Lightbulb size={18} />,
      tooltip:
        "Here you evaluate data quality, analyze clinical performance, and assess your device's clinical safety.",
    },
    {
      id: 'benefitRisk',
      title: 'Benefit-Risk Analysis',
      description: 'Evaluate the overall benefit-risk profile of your device',
      icon: <HelpCircle size={18} />,
      tooltip:
        'This critical stage involves identifying clinical benefits, documenting residual risks, and performing benefit-risk determination.',
    },
    {
      id: 'cerCreation',
      title: 'CER Creation',
      description: 'Compile the final Clinical Evaluation Report document',
      icon: <BookOpen size={18} />,
      tooltip:
        'The final stage where you draft all CER sections, compile evidence references, and review the document for completeness and accuracy.',
    },
  ];

  // Find current stage data
  const getCurrentStageIndex = () => {
    return storyJourney.findIndex(stage => stage.id === currentStage);
  };

  // Handle stage change
  const handleStageChange = stageId => {
    setCurrentStage(stageId);
    const stageIndex = storyJourney.findIndex(stage => stage.id === stageId);
    setProgress(Math.round(((stageIndex + 1) / storyJourney.length) * 100));
  };

  // Handle next stage
  const handleNextStage = () => {
    const currentIndex = getCurrentStageIndex();
    if (currentIndex < storyJourney.length - 1) {
      handleStageChange(storyJourney[currentIndex + 1].id);
    }
  };

  // Handle previous stage
  const handlePrevStage = () => {
    const currentIndex = getCurrentStageIndex();
    if (currentIndex > 0) {
      handleStageChange(storyJourney[currentIndex - 1].id);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-500" />
            CER Creation Journey
            <SimpleTooltip
              title="Compliance Storytelling"
              content="This feature presents regulatory requirements as a coherent narrative rather than isolated tasks. It helps you understand the 'why' behind each step in the CER creation process."
              width="lg"
            />
          </CardTitle>
          <Badge className="bg-blue-100 text-blue-700">Interactive</Badge>
        </div>
        <CardDescription>
          Navigate through the Clinical Evaluation Report creation process
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {storyJourney.map((stage, index) => (
            <div key={stage.id} className="flex items-center">
              <Button
                variant={
                  stage.id === currentStage
                    ? 'default'
                    : index < getCurrentStageIndex()
                      ? 'outline'
                      : 'ghost'
                }
                size="sm"
                className="h-8 gap-1 relative"
                onClick={() => handleStageChange(stage.id)}
              >
                {index < getCurrentStageIndex() && (
                  <CheckCircle size={14} className="text-green-500" />
                )}
                {stage.title}

                <SimpleTooltip
                  title={stage.title}
                  content={stage.tooltip}
                  showIndicator={false}
                  placement="bottom"
                />
              </Button>

              {index < storyJourney.length - 1 && (
                <ArrowRight size={14} className="mx-1 text-gray-400" />
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border border-blue-100 rounded-md bg-blue-50 mt-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                {storyJourney.find(stage => stage.id === currentStage)?.icon || (
                  <MapPin size={16} />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-blue-800">
                {storyJourney.find(stage => stage.id === currentStage)?.title}
              </h3>
              <p className="text-xs text-blue-700 mt-1">
                {storyJourney.find(stage => stage.id === currentStage)?.description}
              </p>

              <div className="flex gap-2 mt-3">
                <SimpleTooltip
                  title="Expert Tip"
                  content={
                    currentStage === 'planning'
                      ? 'Clear device scope definition is essential. Be precise about which device variants are covered and which are excluded from your CER.'
                      : currentStage === 'dataCollection'
                        ? 'Document your literature search strategy thoroughly. Include search strings, databases searched, and inclusion/exclusion criteria.'
                        : currentStage === 'dataAnalysis'
                          ? 'When evaluating literature quality, consider using established appraisal methods like GRADE for intervention studies.'
                          : currentStage === 'benefitRisk'
                            ? 'The benefit-risk analysis should be quantitative where possible. Express benefits and risks in comparable units.'
                            : 'Regulators often look for consistent conclusions across all CER sections. Ensure your report presents a cohesive narrative.'
                  }
                  width="lg"
                  placement="bottom"
                >
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Lightbulb size={12} className="text-amber-500" />
                    Expert Tip
                  </Button>
                </SimpleTooltip>

                <Badge variant="outline" className="h-7 px-2 flex items-center gap-1 bg-blue-50">
                  <span className="text-xs">Regulatory Reference:</span>
                  <span className="text-xs font-medium">
                    {currentStage === 'planning'
                      ? 'MDR Annex II, Section 1'
                      : currentStage === 'dataCollection'
                        ? 'MEDDEV 2.7/1 Rev 4, Section 8'
                        : currentStage === 'dataAnalysis'
                          ? 'MEDDEV 2.7/1 Rev 4, Section 9.3.1'
                          : currentStage === 'benefitRisk'
                            ? 'MDR Annex I, Section 8'
                            : 'MEDDEV 2.7/1 Rev 4, Section 10'}
                  </span>
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevStage}
            disabled={getCurrentStageIndex() === 0}
          >
            Previous Stage
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleNextStage}
            disabled={getCurrentStageIndex() === storyJourney.length - 1}
            className="gap-1"
          >
            Next Stage
            <ArrowRight size={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceStoryExample;
