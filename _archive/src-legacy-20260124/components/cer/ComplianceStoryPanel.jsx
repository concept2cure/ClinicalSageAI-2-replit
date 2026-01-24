import React, { useState, useEffect } from 'react';
import {
  Book,
  MapPin,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  Clock,
  Award,
  FileText,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

/**
 * ComplianceStoryPanel Component
 *
 * A story-driven interface that guides users through regulatory compliance workflows
 * by presenting requirements as a coherent narrative rather than isolated tasks.
 *
 * This component combines storytelling techniques with regulatory guidance to create
 * an immersive learning experience for CERV2 users.
 */
const ComplianceStoryPanel = ({
  deviceClass = 'II',
  marketRegion = 'US',
  deviceName = 'Your Medical Device',
  currentStage = 'planning',
  onStageChange,
  onTaskComplete,
}) => {
  // State
  const [activeStoryTab, setActiveStoryTab] = useState('journey');
  const [expandedMilestone, setExpandedMilestone] = useState(null);
  const [completedTasks, setCompletedTasks] = useState({});
  const [storyProgress, setStoryProgress] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // Story journey stages based on device class and region
  const storyJourney = [
    {
      id: 'planning',
      title: 'Planning & Scoping',
      description:
        'Begin your CER journey by properly scoping the document and understanding requirements',
      icon: <MapPin size={18} />,
      tasks: [
        {
          id: 'planning_1',
          title: 'Define device scope',
          description: 'Clearly define the device and its variants to be covered in the CER',
          regulationRef: deviceClass === 'II' ? 'MDR Annex II, Section 1' : 'MDR Annex III',
          points: 10,
        },
        {
          id: 'planning_2',
          title: 'Identify applicable regulations',
          description: 'Determine which standards and regulations apply to your device class',
          regulationRef: 'MDR Article 61',
          points: 15,
        },
        {
          id: 'planning_3',
          title: 'Establish evaluation criteria',
          description: 'Define the criteria by which clinical data will be evaluated',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 7',
          points: 20,
        },
      ],
      completion:
        "You've laid the foundation for a thorough CER by properly scoping your device and requirements",
      nextStage: 'dataCollection',
    },
    {
      id: 'dataCollection',
      title: 'Data Collection',
      description: 'Gather all relevant clinical evidence for your device',
      icon: <FileText size={18} />,
      tasks: [
        {
          id: 'dataCollection_1',
          title: 'Conduct literature search',
          description:
            'Perform a systematic literature review for your device and equivalent devices',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 8',
          points: 25,
        },
        {
          id: 'dataCollection_2',
          title: 'Identify equivalent devices',
          description: 'Establish equivalence with other devices for which clinical data exists',
          regulationRef: 'MDR Annex XIV, Part A, Section 3',
          points: 20,
        },
        {
          id: 'dataCollection_3',
          title: 'Compile clinical investigation data',
          description:
            'Gather data from clinical investigations of your device or equivalent devices',
          regulationRef: 'MDR Article 61(4)',
          points: 30,
        },
      ],
      completion:
        "You've gathered a comprehensive set of clinical evidence to support your device evaluation",
      nextStage: 'dataAnalysis',
    },
    {
      id: 'dataAnalysis',
      title: 'Data Analysis',
      description: 'Analyze and evaluate the collected clinical evidence',
      icon: <Lightbulb size={18} />,
      tasks: [
        {
          id: 'dataAnalysis_1',
          title: 'Evaluate data quality',
          description: 'Assess the methodological quality and relevance of each data source',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 9.3.1',
          points: 20,
        },
        {
          id: 'dataAnalysis_2',
          title: 'Analyze clinical performance',
          description: 'Evaluate if the device performs as intended in clinical use',
          regulationRef: 'MDR Annex XIV, Part A, Section 1(a)',
          points: 25,
        },
        {
          id: 'dataAnalysis_3',
          title: 'Assess clinical safety',
          description: "Evaluate the device's safety profile based on available data",
          regulationRef: 'MDR Annex XIV, Part A, Section 1(b)',
          points: 25,
        },
      ],
      completion:
        "You've thoroughly analyzed clinical evidence to establish your device's safety and performance",
      nextStage: 'benefitRisk',
    },
    {
      id: 'benefitRisk',
      title: 'Benefit-Risk Analysis',
      description: 'Evaluate the overall benefit-risk profile of your device',
      icon: <AlertCircle size={18} />,
      tasks: [
        {
          id: 'benefitRisk_1',
          title: 'Identify clinical benefits',
          description: 'Document all measurable clinical benefits to patients',
          regulationRef: 'MDR Annex I, Section 1',
          points: 15,
        },
        {
          id: 'benefitRisk_2',
          title: 'Identify residual risks',
          description: 'Document all residual risks after risk mitigation',
          regulationRef: 'MDR Annex I, Section 8',
          points: 15,
        },
        {
          id: 'benefitRisk_3',
          title: 'Perform benefit-risk determination',
          description: 'Weigh clinical benefits against residual risks',
          regulationRef: 'MDR Annex I, Section 8',
          points: 30,
        },
      ],
      completion:
        "You've demonstrated that the benefits of your device outweigh its risks through careful analysis",
      nextStage: 'cerCreation',
    },
    {
      id: 'cerCreation',
      title: 'CER Creation',
      description: 'Compile the final Clinical Evaluation Report document',
      icon: <Book size={18} />,
      tasks: [
        {
          id: 'cerCreation_1',
          title: 'Draft CER sections',
          description: 'Create all required sections following regulatory guidelines',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 10',
          points: 30,
        },
        {
          id: 'cerCreation_2',
          title: 'Compile evidence references',
          description: 'Include all references to clinical data sources',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 10.2',
          points: 15,
        },
        {
          id: 'cerCreation_3',
          title: 'Review and finalize',
          description: 'Conduct a thorough review to ensure completeness and accuracy',
          regulationRef: 'MEDDEV 2.7/1 Rev 4, Section 10.3',
          points: 20,
        },
      ],
      completion:
        "Congratulations! You've created a comprehensive Clinical Evaluation Report ready for submission",
      nextStage: 'complete',
    },
  ];

  // Expert tips for key aspects of CER creation
  const expertTips = [
    {
      id: 'tip_1',
      title: 'Literature Search Strategy',
      content:
        'When conducting literature searches, use a validated strategy with defined inclusion and exclusion criteria. Document your search strings, databases used, and dates of searches to make your approach reproducible.',
      icon: <Lightbulb />,
      areaId: 'dataCollection',
    },
    {
      id: 'tip_2',
      title: 'Demonstrating Equivalence',
      content:
        "For equivalence claims, you must demonstrate technical, biological, and clinical equivalence. A simple statement declaring equivalence is not sufficient—you need a detailed comparative analysis based on the device's characteristics.",
      icon: <Lightbulb />,
      areaId: 'dataCollection',
    },
    {
      id: 'tip_3',
      title: 'Data Appraisal Methods',
      content:
        'When evaluating literature quality, consider using established appraisal methods like GRADE for intervention studies or QUADAS-2 for diagnostic studies. These frameworks help ensure your evaluation is methodical and defensible.',
      icon: <Lightbulb />,
      areaId: 'dataAnalysis',
    },
    {
      id: 'tip_4',
      title: 'Benefit-Risk Analysis',
      content:
        'The benefit-risk analysis should be quantitative where possible. Express benefits and risks in comparable units (e.g., quality-adjusted life years) to make direct comparisons. For each risk, consider both probability and severity.',
      icon: <Lightbulb />,
      areaId: 'benefitRisk',
    },
    {
      id: 'tip_5',
      title: 'Common CER Deficiencies',
      content:
        'Based on regulatory submissions, common CER deficiencies include insufficient literature searches, inadequate equivalence justification, and incomplete post-market surveillance data analysis. Address these areas with particular care.',
      icon: <AlertCircle />,
      areaId: 'cerCreation',
    },
  ];

  // Real-world examples of successful CERs
  const successStories = [
    {
      id: 'story_1',
      title: 'Class II Implantable Device',
      description:
        'A manufacturer of an orthopedic implant successfully leveraged equivalent device data alongside their own clinical investigations. Their approach to demonstrating equivalence was particularly strong, with detailed comparisons across multiple technical and biological parameters.',
      outcome: 'CER approved with minor revisions, leading to successful market access in the EU.',
    },
    {
      id: 'story_2',
      title: 'Diagnostic Software as Medical Device',
      description:
        'This AI-based diagnostic software faced challenges in demonstrating clinical evidence. The team created a comprehensive CER by combining usability studies, retrospective data analysis, and a targeted literature review focusing on clinical outcomes for similar algorithmic approaches.',
      outcome:
        "CER approved after addressing reviewer questions about the algorithm's clinical validation methodology.",
    },
    {
      id: 'story_3',
      title: 'Novel Therapeutic Device',
      description:
        'For this first-in-class therapeutic device, limited equivalent device data was available. The manufacturer conducted a comprehensive clinical investigation program, supplemented with robust literature analysis for similar therapeutic approaches and careful documentation of the risk-benefit profile.',
      outcome:
        'Initial submission required additional clinical data, but the revised CER was successfully accepted after providing supplementary analysis.',
    },
  ];

  // Find current stage in journey
  const currentStageIndex = storyJourney.findIndex(stage => stage.id === currentStage);
  const currentStageData = storyJourney.find(stage => stage.id === currentStage) || storyJourney[0];

  // Calculate overall progress
  useEffect(() => {
    // Calculate total tasks and completed tasks
    const totalTasks = storyJourney.reduce((total, stage) => total + stage.tasks.length, 0);
    const completedTasksCount = Object.values(completedTasks).filter(Boolean).length;

    // Set progress percentage
    const progressPercentage = totalTasks > 0 ? (completedTasksCount / totalTasks) * 100 : 0;
    setStoryProgress(progressPercentage);
  }, [completedTasks, storyJourney]);

  // Handle marking a task as complete
  const handleCompleteTask = (stageId, taskId) => {
    const taskKey = `${stageId}_${taskId}`;

    setCompletedTasks(prev => ({
      ...prev,
      [taskKey]: !prev[taskKey],
    }));

    if (onTaskComplete) {
      onTaskComplete(stageId, taskId, !completedTasks[taskKey]);
    }
  };

  // Handle moving to next stage
  const handleNextStage = () => {
    if (currentStageIndex < storyJourney.length - 1) {
      const nextStage = storyJourney[currentStageIndex + 1].id;
      if (onStageChange) {
        onStageChange(nextStage);
      }
    }
  };

  // Handle hint toggle
  const toggleHint = () => {
    setShowHint(!showHint);
  };

  // Get relevant expert tips for current stage
  const currentStageTips = expertTips.filter(tip => tip.areaId === currentStage);

  return (
    <div className="flex flex-col space-y-6">
      {/* Progress overview */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">{deviceName} CER Creation Journey</CardTitle>
            <Badge variant="outline" className="text-sm">
              Class {deviceClass} - {marketRegion}
            </Badge>
          </div>
          <CardDescription>Your progress through the clinical evaluation process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">{Math.round(storyProgress)}%</span>
            </div>
            <Progress value={storyProgress} className="h-2" />

            <div className="flex flex-wrap gap-2 mt-4">
              {storyJourney.map((stage, index) => (
                <Button
                  key={stage.id}
                  variant={
                    stage.id === currentStage
                      ? 'default'
                      : index < currentStageIndex
                        ? 'outline'
                        : 'ghost'
                  }
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => onStageChange && onStageChange(stage.id)}
                  disabled={index > currentStageIndex + 1}
                >
                  {index < currentStageIndex && (
                    <CheckCircle size={14} className="text-green-500" />
                  )}
                  {stage.title}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current stage and tasks */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700">
                {currentStageData.icon}
              </span>
              {currentStageData.title}
            </CardTitle>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleHint}
              className="gap-1 h-8 text-muted-foreground"
            >
              <Lightbulb size={14} />
              {showHint ? 'Hide' : 'Show'} Hint
            </Button>
          </div>
          <CardDescription>{currentStageData.description}</CardDescription>
        </CardHeader>

        {showHint && currentStageTips.length > 0 && (
          <div className="mx-6 my-2">
            <Alert className="bg-amber-50 border-amber-200">
              <div className="flex items-start">
                <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="ml-2">
                  <AlertTitle className="text-amber-800 text-sm font-medium">
                    Expert Tip: {currentStageTips[0].title}
                  </AlertTitle>
                  <AlertDescription className="text-amber-700 text-xs">
                    {currentStageTips[0].content}
                  </AlertDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-auto -mt-1 -mr-1"
                  onClick={() => setShowHint(false)}
                >
                  <X size={12} />
                </Button>
              </div>
            </Alert>
          </div>
        )}

        <CardContent>
          <div className="space-y-4">
            {currentStageData.tasks.map(task => {
              const isCompleted = completedTasks[`${currentStage}_${task.id}`];

              return (
                <div
                  key={task.id}
                  className={`p-3 rounded-md border ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex items-start">
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer ${isCompleted ? 'bg-green-100 border-green-500 text-green-600' : 'border-gray-300'}`}
                      onClick={() => handleCompleteTask(currentStage, task.id)}
                    >
                      {isCompleted && <CheckCircle size={12} />}
                    </div>

                    <div className="ml-3 flex-1">
                      <div className="flex justify-between">
                        <h4
                          className={`text-sm font-medium ${isCompleted ? 'text-green-800' : 'text-gray-900'}`}
                        >
                          {task.title}
                        </h4>
                        <Badge variant="secondary" className="text-xs h-5">
                          {task.points} pts
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{task.description}</p>

                      <div className="mt-2 flex items-center">
                        <Badge variant="outline" className="text-xs">
                          {task.regulationRef}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onStageChange && onStageChange(storyJourney[Math.max(0, currentStageIndex - 1)].id)
            }
            disabled={currentStageIndex === 0}
          >
            Previous Stage
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleNextStage}
            disabled={currentStageIndex === storyJourney.length - 1}
            className="gap-1"
          >
            Next Stage
            <ArrowRight size={14} />
          </Button>
        </CardFooter>
      </Card>

      {/* Resources and learning */}
      <Card>
        <CardHeader className="pb-2">
          <Tabs defaultValue="journey" onValueChange={setActiveStoryTab} value={activeStoryTab}>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">CER Knowledge Hub</CardTitle>
              <TabsList>
                <TabsTrigger value="journey" className="text-xs h-8">
                  Journey Map
                </TabsTrigger>
                <TabsTrigger value="examples" className="text-xs h-8">
                  Success Stories
                </TabsTrigger>
                <TabsTrigger value="tips" className="text-xs h-8">
                  Expert Tips
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="journey" className="mt-0 p-0">
              <CardDescription>Visual roadmap of the CER development process</CardDescription>
            </TabsContent>

            <TabsContent value="examples" className="mt-0 p-0">
              <CardDescription>Real-world examples of successful CER submissions</CardDescription>
            </TabsContent>

            <TabsContent value="tips" className="mt-0 p-0">
              <CardDescription>Expert insights to enhance your CER</CardDescription>
            </TabsContent>
          </Tabs>
        </CardHeader>

        <CardContent>
          <TabsContent value="journey" className="m-0 p-0">
            <div className="relative">
              <div className="absolute top-0 left-5 w-px h-full bg-blue-200 z-0" />

              {storyJourney.map((stage, index) => {
                const isPastStage = index < currentStageIndex;
                const isCurrentStage = index === currentStageIndex;
                const isExpanded = expandedMilestone === stage.id;

                return (
                  <div key={stage.id} className="relative z-10 mb-6">
                    <div
                      className={`flex items-start mb-2 cursor-pointer`}
                      onClick={() => setExpandedMilestone(isExpanded ? null : stage.id)}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                          isPastStage
                            ? 'bg-green-100 text-green-600 border-2 border-green-500'
                            : isCurrentStage
                              ? 'bg-blue-100 text-blue-600 border-2 border-blue-500'
                              : 'bg-gray-100 text-gray-500 border-2 border-gray-300'
                        }`}
                      >
                        {isPastStage ? (
                          <CheckCircle size={16} />
                        ) : (
                          stage.icon || <Clock size={16} />
                        )}
                      </div>

                      <div className="ml-4 flex-1">
                        <h4
                          className={`text-sm font-medium ${
                            isPastStage
                              ? 'text-green-800'
                              : isCurrentStage
                                ? 'text-blue-800'
                                : 'text-gray-700'
                          }`}
                        >
                          {stage.title}
                        </h4>
                        <p className="text-xs text-gray-600">{stage.description}</p>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="ml-14 mt-2 pl-4 border-l-2 border-blue-100">
                        <div className="text-xs text-gray-700 space-y-2">
                          <p className="font-medium">Key activities:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {stage.tasks.map(task => (
                              <li key={task.id} className="text-gray-600">
                                {task.title}
                              </li>
                            ))}
                          </ul>

                          <p className="font-medium mt-2">Regulatory focus:</p>
                          <div className="flex flex-wrap gap-1">
                            {stage.tasks.map(task => (
                              <Badge key={task.id} variant="outline" className="text-xs">
                                {task.regulationRef}
                              </Badge>
                            ))}
                          </div>

                          <p className="mt-2 text-gray-700 italic">{stage.completion}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="examples" className="m-0 p-0">
            <div className="space-y-4">
              {successStories.map(story => (
                <div key={story.id} className="p-3 rounded-md border border-gray-200 bg-white">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                        <Award size={16} />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{story.title}</h4>
                      <p className="mt-1 text-xs text-gray-600">{story.description}</p>

                      <div className="mt-2 p-2 bg-green-50 rounded-md border border-green-100">
                        <p className="text-xs font-medium text-green-700">Outcome:</p>
                        <p className="text-xs text-green-600">{story.outcome}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tips" className="m-0 p-0">
            <div className="space-y-4">
              {expertTips.map(tip => (
                <div key={tip.id} className="p-3 rounded-md border border-blue-100 bg-blue-50">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Lightbulb size={16} />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-blue-900">{tip.title}</h4>
                      <p className="mt-1 text-xs text-blue-700">{tip.content}</p>

                      <div className="mt-2">
                        <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
                          {storyJourney.find(stage => stage.id === tip.areaId)?.title || tip.areaId}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplianceStoryPanel;
