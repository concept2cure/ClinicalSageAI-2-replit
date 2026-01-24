import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge, Button, Alert, AlertDescription, AlertTitle } from '@/components/ui/button';
import { Alert as AlertComponent } from '@/components/ui/alert';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Award,
  Lightbulb,
  ChevronRight,
  Clock,
  Bookmark,
  BookMarked,
  Info,
} from 'lucide-react';
import { useLearningService } from '@/hooks/useLearningService';
import { Progress } from '@/components/ui/progress';

// The userId would normally come from authentication context
// Using a placeholder for now
const TEMP_USER_ID = 1;

const AdaptiveLearningInterface = () => {
  const [selectedTab, setSelectedTab] = useState('insights');
  const [savedInsights, setSavedInsights] = useState([]);

  // Use our learning service hooks
  const {
    insights,
    learningPath,
    recommendedModules,
    markInsightAsRead,
    saveInsight,
    updateProgress,
    logActivity,
  } = useLearningService(TEMP_USER_ID);

  // Log analytics for the component mount
  useEffect(() => {
    if (logActivity.mutate) {
      logActivity.mutate({
        userId: TEMP_USER_ID,
        activityType: 'page_view',
        action: 'viewed',
        metadata: { page: 'adaptive_learning' },
      });
    }
  }, []);

  // Filter saved insights when insights load
  useEffect(() => {
    if (insights.data) {
      setSavedInsights(insights.data.filter(insight => insight.isSaved));
    }
  }, [insights.data]);

  // Handle reading an insight
  const handleReadInsight = insightId => {
    markInsightAsRead.mutate(insightId);
  };

  // Handle saving/unsaving an insight
  const handleSaveInsight = (insightId, currentlySaved) => {
    saveInsight.mutate({
      insightId,
      save: !currentlySaved,
    });
  };

  // Handle starting a module
  const handleStartModule = moduleId => {
    // Log the activity
    logActivity.mutate({
      userId: TEMP_USER_ID,
      activityType: 'module_start',
      resourceId: moduleId,
      action: 'started',
    });

    // Update progress to 0% (just started)
    updateProgress.mutate({
      userId: TEMP_USER_ID,
      moduleId,
      progress: 0,
      completed: false,
    });

    // In a real app, we'd navigate to the module content here
    alert(`Starting module ${moduleId}. In a real app, we'd navigate to the module content.`);
  };

  // Format a relevance score into a friendlier text
  const getRelevanceText = score => {
    if (score >= 90) return 'Perfect match';
    if (score >= 80) return 'Highly relevant';
    if (score >= 70) return 'Very relevant';
    if (score >= 60) return 'Relevant';
    if (score >= 50) return 'Moderately relevant';
    return 'Somewhat relevant';
  };

  // Render loading state
  if (insights.isLoading || learningPath.isLoading || recommendedModules.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute animate-ping h-10 w-10 rounded-full bg-primary/30"></div>
            <div className="absolute animate-pulse h-10 w-10 rounded-full bg-primary/60"></div>
            <Brain className="relative h-10 w-10 text-primary" />
          </div>
          <p className="text-muted-foreground">Loading your personalized learning experience...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (insights.error || learningPath.error || recommendedModules.error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {insights.error?.message ||
            learningPath.error?.message ||
            recommendedModules.error?.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Your Adaptive Learning Dashboard</h1>
        <p className="text-muted-foreground">
          Personalized AI-powered recommendations to enhance your regulatory expertise
        </p>
      </div>

      <Tabs defaultValue={selectedTab} onValueChange={setSelectedTab} className="mb-8">
        <TabsList className="mb-6">
          <TabsTrigger value="insights">
            <Lightbulb className="h-4 w-4 mr-2" />
            AI Insights
          </TabsTrigger>
          <TabsTrigger value="learning-path">
            <BookOpen className="h-4 w-4 mr-2" />
            Learning Path
          </TabsTrigger>
          <TabsTrigger value="recommended">
            <Award className="h-4 w-4 mr-2" />
            Recommended Modules
          </TabsTrigger>
          <TabsTrigger value="saved">
            <BookMarked className="h-4 w-4 mr-2" />
            Saved Items
          </TabsTrigger>
        </TabsList>

        {/* AI Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.data &&
              insights.data.map(insight => (
                <Card key={insight.id} className={insight.isRead ? 'opacity-75' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-lg">{insight.title}</CardTitle>
                      <button
                        onClick={() => handleSaveInsight(insight.id, insight.isSaved)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        {insight.isSaved ? (
                          <BookMarked className="h-5 w-5" />
                        ) : (
                          <Bookmark className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <CardDescription className="flex items-center text-xs">
                      <Badge variant="outline" className="mr-2">
                        {insight.source}
                      </Badge>
                      <span className="flex items-center">
                        <Info className="h-3 w-3 mr-1" />
                        Relevance: {insight.relevanceScore}%
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{insight.description}</p>
                  </CardContent>
                  <CardFooter className="flex justify-between pt-2">
                    <div className="flex flex-wrap gap-1">
                      {insight.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {!insight.isRead && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReadInsight(insight.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as read
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* Learning Path Tab */}
        <TabsContent value="learning-path">
          {learningPath.data?.learningPath ? (
            <div className="space-y-6">
              {learningPath.data.learningPath.map((track, trackIndex) => (
                <Card key={trackIndex}>
                  <CardHeader>
                    <CardTitle>{track.trackName}</CardTitle>
                    <CardDescription>{track.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {track.modules.map((module, moduleIndex) => (
                        <div
                          key={moduleIndex}
                          className="flex items-start gap-4 p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            {moduleIndex + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium">Module ID: {module.id}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{module.rationale}</p>
                          </div>
                          <Button size="sm" onClick={() => handleStartModule(module.id)}>
                            <ChevronRight className="h-4 w-4" />
                            <span className="sr-only">Start module</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">No learning path available</h3>
              <p className="text-muted-foreground">
                We're still analyzing your profile to create a personalized learning path.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Recommended Modules Tab */}
        <TabsContent value="recommended">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedModules.data?.map(module => (
              <Card key={module.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Module {module.id}</CardTitle>
                      <CardDescription>
                        <Badge
                          variant={module.relevanceScore > 80 ? 'default' : 'secondary'}
                          className="mt-1"
                        >
                          {getRelevanceText(module.relevanceScore)}
                        </Badge>
                      </CardDescription>
                    </div>
                    <div className="text-sm font-medium">
                      {module.relevanceScore}%
                      <Progress value={module.relevanceScore} className="h-2 w-16" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {module.reasoning && (
                    <p className="text-sm text-muted-foreground">{module.reasoning}</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button size="sm" className="w-full" onClick={() => handleStartModule(module.id)}>
                    Start Module
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Saved Items Tab */}
        <TabsContent value="saved">
          {savedInsights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedInsights.map(insight => (
                <Card key={insight.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-lg">{insight.title}</CardTitle>
                      <button
                        onClick={() => handleSaveInsight(insight.id, true)}
                        className="text-primary"
                      >
                        <BookMarked className="h-5 w-5" />
                      </button>
                    </div>
                    <CardDescription className="flex items-center text-xs">
                      <Badge variant="outline" className="mr-2">
                        {insight.source}
                      </Badge>
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Saved on {new Date(insight.updatedAt).toLocaleDateString()}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{insight.description}</p>
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-1 pt-2">
                    {insight.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookMarked className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">No saved insights yet</h3>
              <p className="text-muted-foreground">
                Bookmark insights that are valuable to you for quick reference later.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdaptiveLearningInterface;
