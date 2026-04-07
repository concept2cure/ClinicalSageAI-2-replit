import React, { useState } from 'react';
import {
  CheckCircle2,
  BookOpen,
  Video,
  FileText,
  Download,
  Award,
  Clock,
  Play,
  Pause,
  ChevronRight,
  BarChart2,
  Bookmark,
  Share2,
  ThumbsUp,
  ThumbsDown,
  PenTool,
  FolderOpen,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * Learning Module Component
 *
 * Displays a single learning module with lessons, resources, progress tracking,
 * and adaptive content based on user's learning profile.
 */
const LearningModule = ({
  module,
  userProgress,
  onComplete,
  onTrackActivity,
  isAdaptive = true,
}) => {
  const [activeLesson, setActiveLesson] = useState(
    userProgress?.currentLesson || module?.lessons?.[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState('content');
  const [isPlaying, setIsPlaying] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const { toast } = useToast();

  // Find the active lesson object
  const currentLesson = module?.lessons?.find(lesson => lesson.id === activeLesson);

  // Calculate module completion percentage
  const completedLessons = userProgress?.completedLessons || [];
  const completionPercentage = module?.lessons?.length
    ? Math.round((completedLessons.length / module.lessons.length) * 100)
    : 0;

  // Check if a lesson is completed
  const isLessonCompleted = lessonId => completedLessons.includes(lessonId);

  // Get lesson status
  const getLessonStatus = lessonId => {
    if (isLessonCompleted(lessonId)) return 'completed';
    if (lessonId === activeLesson) return 'active';
    return 'pending';
  };

  // Handle lesson change
  const handleLessonChange = lessonId => {
    setActiveLesson(lessonId);
    setActiveTab('content');
    setQuizSubmitted(false);
    setQuizResults(null);
    setQuizAnswers({});

    // Track lesson view
    if (onTrackActivity) {
      onTrackActivity({
        activityType: 'lesson_view',
        moduleId: module.id,
        lessonId: lessonId,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Handle play/pause
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);

    // Track play/pause activity
    if (onTrackActivity) {
      onTrackActivity({
        activityType: isPlaying ? 'content_pause' : 'content_play',
        moduleId: module.id,
        lessonId: activeLesson,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Handle resource click
  const handleResourceClick = resourceId => {
    // Track resource usage
    if (onTrackActivity) {
      onTrackActivity({
        activityType: 'resource_access',
        moduleId: module.id,
        lessonId: activeLesson,
        resourceId: resourceId,
        timestamp: new Date().toISOString(),
      });
    }

    toast({
      title: 'Resource Accessed',
      description: 'The resource would be downloaded or opened here.',
    });
  };

  // Handle quiz answer selection
  const handleQuizAnswerSelect = (questionId, answerId) => {
    setQuizAnswers(prev => ({
      ...prev,
      [questionId]: answerId,
    }));
  };

  // Submit quiz answers
  const handleQuizSubmit = () => {
    // Check if all questions are answered
    const allQuestionsAnswered = currentLesson?.quiz?.questions?.every(
      q => quizAnswers[q.id] !== undefined
    );

    if (!allQuestionsAnswered) {
      toast({
        title: 'Incomplete Quiz',
        description: 'Please answer all questions before submitting.',
        variant: 'destructive',
      });
      return;
    }

    // Calculate results (in a real app, this would be done on the server)
    const correctAnswers =
      currentLesson?.quiz?.questions?.filter(q => quizAnswers[q.id] === q.correctAnswerId).length ||
      0;

    const totalQuestions = currentLesson?.quiz?.questions?.length || 0;
    const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
    const passed = score >= (currentLesson?.quiz?.passingScore || 70);

    // Set quiz results
    setQuizResults({
      score,
      correctAnswers,
      totalQuestions,
      passed,
    });

    setQuizSubmitted(true);

    // If quiz passed, mark lesson as complete
    if (passed && onComplete) {
      onComplete({
        moduleId: module.id,
        lessonId: activeLesson,
        assessmentResults: {
          score,
          passed,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Track quiz completion
    if (onTrackActivity) {
      onTrackActivity({
        activityType: 'quiz_complete',
        moduleId: module.id,
        lessonId: activeLesson,
        result: {
          score,
          passed,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Show toast notification
    toast({
      title: passed ? 'Quiz Passed!' : 'Quiz Failed',
      description: passed
        ? `You scored ${score.toFixed(0)}%. Great job!`
        : `You scored ${score.toFixed(0)}%. Review the material and try again.`,
      variant: passed ? 'default' : 'destructive',
    });
  };

  // Reset quiz
  const handleQuizReset = () => {
    setQuizSubmitted(false);
    setQuizResults(null);
    setQuizAnswers({});
  };

  // Get lesson icon based on type
  const getLessonIcon = type => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'article':
        return <FileText className="h-4 w-4" />;
      case 'interactive':
        return <PenTool className="h-4 w-4" />;
      case 'assessment':
        return <BarChart2 className="h-4 w-4" />;
      default:
        return <BookOpen className="h-4 w-4" />;
    }
  };

  // Get resource icon based on type
  const getResourceIcon = type => {
    switch (type) {
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'template':
        return <FolderOpen className="h-4 w-4" />;
      default:
        return <Download className="h-4 w-4" />;
    }
  };

  if (!module) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">Loading module...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl mb-1">{module.title}</CardTitle>
              <CardDescription>{module.description}</CardDescription>
            </div>

            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {module.estimatedMinutes} min
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {module.lessons?.length || 0} lessons
              </Badge>
              <Badge
                variant="outline"
                className={`flex items-center gap-1 ${
                  module.difficulty === 'beginner'
                    ? 'bg-green-50 text-green-700'
                    : module.difficulty === 'intermediate'
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-700'
                }`}
              >
                {module.difficulty}
              </Badge>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{completionPercentage}% Complete</span>
            </div>
            <Progress value={completionPercentage} className="h-2" />
          </div>
        </CardHeader>
      </Card>

      {/* Module content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lessons sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lessons</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {module.lessons?.map((lesson, index) => {
                  const status = getLessonStatus(lesson.id);
                  return (
                    <li
                      key={lesson.id}
                      className={`p-3 ${status === 'active' ? 'bg-gray-50' : ''} ${
                        status === 'completed' ? 'hover:bg-green-50' : 'hover:bg-gray-50'
                      } transition-colors cursor-pointer`}
                      onClick={() => handleLessonChange(lesson.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">
                          {status === 'completed' ? (
                            <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </div>
                          ) : status === 'active' ? (
                            <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                              <ChevronRight className="h-4 w-4 text-blue-600" />
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-gray-600">{index + 1}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-sm">{lesson.title}</h3>
                            <div className="flex items-center gap-1">
                              {getLessonIcon(lesson.type)}
                              <span className="text-xs text-gray-500">
                                {lesson.estimatedMinutes} min
                              </span>
                            </div>
                          </div>

                          {status === 'active' && (
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {lesson.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Resources */}
          {currentLesson?.resources?.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Resources</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {currentLesson.resources.map(resource => (
                    <li
                      key={resource.id}
                      className="p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleResourceClick(resource.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center">
                          {getResourceIcon(resource.type)}
                        </div>

                        <div className="flex-1">
                          <h3 className="font-medium text-sm">{resource.title}</h3>
                          <p className="text-xs text-gray-500">
                            {resource.type.toUpperCase()} • {resource.size || '—'}
                          </p>
                        </div>

                        <Download className="h-4 w-4 text-gray-400" />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lesson content */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-0">
              <div className="flex justify-between items-center">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {currentLesson?.type}
                  </Badge>
                  <CardTitle>{currentLesson?.title}</CardTitle>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // Track activity - bookmark
                      if (onTrackActivity) {
                        onTrackActivity({
                          activityType: 'bookmark',
                          moduleId: module.id,
                          lessonId: activeLesson,
                          timestamp: new Date().toISOString(),
                        });
                      }

                      toast({
                        title: 'Bookmarked',
                        description: 'Lesson has been bookmarked for later reference.',
                      });
                    }}
                  >
                    <Bookmark className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // Track activity - share
                      if (onTrackActivity) {
                        onTrackActivity({
                          activityType: 'share',
                          moduleId: module.id,
                          lessonId: activeLesson,
                          timestamp: new Date().toISOString(),
                        });
                      }

                      toast({
                        title: 'Share Link Generated',
                        description: 'Lesson link has been copied to clipboard.',
                      });
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Tabs
                defaultValue="content"
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full mt-4"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="quiz">Quiz</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent className="pt-4">
              <TabsContent value="content">
                <div className="space-y-4">
                  {/* Content player/viewer */}
                  {currentLesson?.type === 'video' && (
                    <div className="relative aspect-video bg-gray-100 rounded-md overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-14 w-14 rounded-full shadow-lg"
                          onClick={handlePlayPause}
                        >
                          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                        </Button>
                      </div>

                      {isPlaying && (
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
                          <div className="flex items-center justify-between text-white">
                            <span>01:20 / 08:45</span>
                            <div className="flex gap-2">{/* Video controls would go here */}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lesson content */}
                  <div className="prose max-w-none">
                    {currentLesson?.content?.map((block, index) => {
                      switch (block.type) {
                        case 'heading':
                          return (
                            <h2 key={index} className="text-xl font-bold mt-6 mb-3">
                              {block.content}
                            </h2>
                          );
                        case 'paragraph':
                          return (
                            <p key={index} className="my-3">
                              {block.content}
                            </p>
                          );
                        case 'list':
                          return (
                            <ul key={index} className="list-disc pl-6 my-3">
                              {block.items.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          );
                        case 'note':
                          return (
                            <div
                              key={index}
                              className="bg-blue-50 p-3 rounded-md border border-blue-200 my-4"
                            >
                              <p className="text-blue-800 font-medium text-sm">{block.content}</p>
                            </div>
                          );
                        case 'warning':
                          return (
                            <div
                              key={index}
                              className="bg-amber-50 p-3 rounded-md border border-amber-200 my-4"
                            >
                              <p className="text-amber-800 font-medium text-sm">{block.content}</p>
                            </div>
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>

                  {/* Feedback section */}
                  <div className="border-t pt-4 mt-6">
                    <h3 className="font-medium mb-2">Was this lesson helpful?</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Track feedback
                          if (onTrackActivity) {
                            onTrackActivity({
                              activityType: 'feedback',
                              moduleId: module.id,
                              lessonId: activeLesson,
                              rating: 'positive',
                              timestamp: new Date().toISOString(),
                            });
                          }

                          toast({
                            title: 'Feedback Submitted',
                            description: 'Thank you for your feedback!',
                          });
                        }}
                      >
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        Yes, it was helpful
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Track feedback
                          if (onTrackActivity) {
                            onTrackActivity({
                              activityType: 'feedback',
                              moduleId: module.id,
                              lessonId: activeLesson,
                              rating: 'negative',
                              timestamp: new Date().toISOString(),
                            });
                          }

                          toast({
                            title: 'Feedback Submitted',
                            description:
                              'We appreciate your feedback and will work to improve this lesson.',
                          });
                        }}
                      >
                        <ThumbsDown className="h-4 w-4 mr-2" />
                        No, needs improvement
                      </Button>
                    </div>
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex justify-between pt-4 mt-6">
                    <Button
                      variant="outline"
                      disabled={module.lessons[0].id === activeLesson}
                      onClick={() => {
                        const currentIndex = module.lessons.findIndex(l => l.id === activeLesson);
                        if (currentIndex > 0) {
                          handleLessonChange(module.lessons[currentIndex - 1].id);
                        }
                      }}
                    >
                      Previous Lesson
                    </Button>

                    <Button
                      onClick={() => {
                        if (isLessonCompleted(activeLesson)) {
                          // If already completed, navigate to next lesson
                          const currentIndex = module.lessons.findIndex(l => l.id === activeLesson);
                          if (currentIndex < module.lessons.length - 1) {
                            handleLessonChange(module.lessons[currentIndex + 1].id);
                          }
                        } else {
                          // Mark as complete if there's no quiz
                          if (!currentLesson?.quiz && onComplete) {
                            onComplete({
                              moduleId: module.id,
                              lessonId: activeLesson,
                              assessmentResults: null,
                            });

                            toast({
                              title: 'Lesson Completed',
                              description: 'Your progress has been saved.',
                            });
                          } else {
                            // Navigate to quiz
                            setActiveTab('quiz');
                          }
                        }
                      }}
                    >
                      {isLessonCompleted(activeLesson)
                        ? module.lessons[module.lessons.length - 1].id === activeLesson
                          ? 'Finish Module'
                          : 'Next Lesson'
                        : currentLesson?.quiz
                          ? 'Take Quiz'
                          : 'Mark as Complete'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="quiz">
                {currentLesson?.quiz ? (
                  <div className="space-y-6">
                    <div className="prose max-w-none">
                      <h2 className="text-lg font-bold">Quiz: {currentLesson.title}</h2>
                      <p>{currentLesson.quiz.description}</p>
                    </div>

                    {quizSubmitted ? (
                      <div className="space-y-6">
                        <div
                          className={`p-4 rounded-md ${
                            quizResults.passed
                              ? 'bg-green-50 border border-green-200'
                              : 'bg-red-50 border border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {quizResults.passed ? (
                              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                                <Award className="h-5 w-5 text-green-600" />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                                <RefreshCw className="h-5 w-5 text-red-600" />
                              </div>
                            )}

                            <div>
                              <h3
                                className={`font-bold ${
                                  quizResults.passed ? 'text-green-800' : 'text-red-800'
                                }`}
                              >
                                {quizResults.passed ? 'Quiz Passed!' : 'Try Again'}
                              </h3>
                              <p className="text-sm">
                                You answered {quizResults.correctAnswers} out of{' '}
                                {quizResults.totalQuestions} questions correctly. Score:{' '}
                                {quizResults.score.toFixed(0)}%
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Show quiz results and explanations */}
                        <div className="space-y-4">
                          {currentLesson.quiz.questions.map(question => {
                            const userAnswer = quizAnswers[question.id];
                            const isCorrect = userAnswer === question.correctAnswerId;

                            return (
                              <div
                                key={question.id}
                                className={`p-4 rounded-md border ${
                                  isCorrect
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                                }`}
                              >
                                <h4 className="font-medium mb-2">{question.text}</h4>

                                <div className="space-y-2 mb-3">
                                  {question.answers.map(answer => {
                                    const isUserSelection = userAnswer === answer.id;
                                    const isCorrectAnswer = answer.id === question.correctAnswerId;

                                    return (
                                      <div
                                        key={answer.id}
                                        className={`p-2 rounded ${
                                          isUserSelection && isCorrectAnswer
                                            ? 'bg-green-100 border border-green-300'
                                            : isUserSelection && !isCorrectAnswer
                                              ? 'bg-red-100 border border-red-300'
                                              : isCorrectAnswer
                                                ? 'bg-green-100 border border-green-300'
                                                : 'bg-gray-50 border border-gray-200'
                                        }`}
                                      >
                                        <div className="flex items-center">
                                          {isUserSelection && isCorrectAnswer && (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
                                          )}
                                          {isUserSelection && !isCorrectAnswer && (
                                            <XCircle className="h-4 w-4 text-red-600 mr-2" />
                                          )}
                                          {!isUserSelection && isCorrectAnswer && (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
                                          )}
                                          {!isUserSelection && !isCorrectAnswer && (
                                            <div className="h-4 w-4 mr-2" />
                                          )}

                                          <span
                                            className={
                                              isCorrectAnswer
                                                ? 'text-green-800 font-medium'
                                                : isUserSelection && !isCorrectAnswer
                                                  ? 'text-red-800'
                                                  : ''
                                            }
                                          >
                                            {answer.text}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {question.explanation && (
                                  <div className="text-sm bg-white p-3 rounded border">
                                    <strong>Explanation:</strong> {question.explanation}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-between pt-4">
                          <Button variant="outline" onClick={() => setActiveTab('content')}>
                            Back to Lesson
                          </Button>

                          {quizResults.passed ? (
                            <Button
                              onClick={() => {
                                // Navigate to next lesson if available
                                const currentIndex = module.lessons.findIndex(
                                  l => l.id === activeLesson
                                );
                                if (currentIndex < module.lessons.length - 1) {
                                  handleLessonChange(module.lessons[currentIndex + 1].id);
                                }
                              }}
                            >
                              {module.lessons[module.lessons.length - 1].id === activeLesson
                                ? 'Finish Module'
                                : 'Next Lesson'}
                            </Button>
                          ) : (
                            <Button onClick={handleQuizReset} variant="default">
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Try Again
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Quiz questions */}
                        <div className="space-y-6">
                          {currentLesson.quiz.questions.map((question, qIndex) => (
                            <div key={question.id} className="p-4 rounded-md border">
                              <h4 className="font-medium mb-3">
                                Question {qIndex + 1}: {question.text}
                              </h4>

                              <div className="space-y-2">
                                {question.answers.map(answer => (
                                  <div
                                    key={answer.id}
                                    className={`p-3 rounded border cursor-pointer transition-colors ${
                                      quizAnswers[question.id] === answer.id
                                        ? 'bg-blue-50 border-blue-300'
                                        : 'hover:bg-gray-50 border-gray-200'
                                    }`}
                                    onClick={() => handleQuizAnswerSelect(question.id, answer.id)}
                                  >
                                    {answer.text}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between pt-4">
                          <Button variant="outline" onClick={() => setActiveTab('content')}>
                            Back to Lesson
                          </Button>

                          <Button onClick={handleQuizSubmit}>Submit Answers</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <h3 className="text-lg font-medium mb-2">No Quiz Available</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      This lesson doesn't include a quiz. You can mark it as complete from the
                      lesson content.
                    </p>
                    <Button className="mt-4" onClick={() => setActiveTab('content')}>
                      Back to Lesson
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes">
                <div className="space-y-4">
                  <Textarea
                    placeholder="Take notes about this lesson here..."
                    className="min-h-[200px]"
                  />

                  <Button className="w-full">Save Notes</Button>

                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-3">Saved Notes</h3>
                    <p className="text-gray-500 text-sm">No saved notes yet for this lesson.</p>
                  </div>
                </div>
              </TabsContent>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LearningModule;
