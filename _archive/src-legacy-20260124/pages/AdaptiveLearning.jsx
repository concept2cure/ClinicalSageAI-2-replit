import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  GraduationCap,
  BarChart3,
  Search,
  Filter,
  Lightbulb,
  Smile,
  Award,
  FileText,
  Video,
  Clock,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Settings,
  RefreshCw,
  Sparkles,
  Flame,
  ThumbsUp,
  Star,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useLearningProfile } from '@/hooks/useLearningProfile';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RecommendationCard from '@/components/learning/RecommendationCard';
import LearningModule from '@/components/learning/LearningModule';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

/**
 * Adaptive Learning Dashboard Page
 *
 * Main interface for personalized learning with adaptive recommendations,
 * learning path visualization, and progress tracking.
 */
const AdaptiveLearning = () => {
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Get user's learning profile (preferences, progress, recommendations)
  const {
    profile,
    isLoadingProfile,
    recommendations,
    insights,
    trackActivity,
    completeModule,
    updatePreferences,
  } = useLearningProfile('user-123'); // In a real app, this would be the current user's ID

  // Fetch available learning modules and paths
  const { data: learningModules, isLoading: isLoadingModules } = useQuery({
    queryKey: ['/api/learning/modules'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/learning/modules');
        return await response.json();
      } catch (error) {
        console.error('Error fetching learning modules:', error);
        // Return demo modules for UI demonstration
        return demoLearningModules;
      }
    },
  });

  // Handle module selection
  const handleSelectModule = moduleId => {
    setActiveModuleId(moduleId);

    // Track module view
    trackActivity({
      activityType: 'module_view',
      moduleId,
      timestamp: new Date().toISOString(),
    });
  };

  // Handle recommendation selection
  const handleSelectRecommendation = recId => {
    const recommendation = recommendations?.find(r => r.id === recId);

    if (recommendation) {
      // If recommendation is a module, show the module
      if (recommendation.moduleId) {
        setActiveModuleId(recommendation.moduleId);
      } else {
        // Otherwise, display appropriate content
        toast({
          title: 'Recommendation Selected',
          description: `You selected "${recommendation.title}"`,
        });
      }

      // Track recommendation click
      trackActivity({
        activityType: 'recommendation_click',
        recommendationId: recId,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Handle module completion
  const handleModuleComplete = data => {
    completeModule(data);
  };

  // Handle bookmarking a recommendation
  const handleBookmarkRecommendation = recId => {
    toast({
      title: 'Recommendation Bookmarked',
      description: 'The recommendation has been saved to your bookmarks.',
    });

    // Track bookmark action
    trackActivity({
      activityType: 'bookmark',
      recommendationId: recId,
      timestamp: new Date().toISOString(),
    });
  };

  // Filter modules based on search and category
  const filteredModules =
    learningModules?.filter(module => {
      const matchesSearch =
        searchQuery === '' ||
        module.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || module.category === selectedCategory;

      return matchesSearch && matchesCategory;
    }) || [];

  // Get current active module details
  const activeModule = learningModules?.find(module => module.id === activeModuleId);

  // Get user progress for active module
  const userModuleProgress = profile?.progress?.modules?.[activeModuleId];

  // Calculate recent learning metrics
  const recentActivities = 12; // This would come from actual tracked activities
  const completedThisWeek = 5; // This would come from actual completed items
  const completionRate = profile?.progress?.completionRate || 0;
  const streak = profile?.progress?.streakDays || 0;

  // Categories for filtering
  const categories = [
    { id: 'all', name: 'All Categories' },
    { id: 'regulatory', name: 'Regulatory Writing' },
    { id: 'clinical', name: 'Clinical Documentation' },
    { id: 'submissions', name: 'Submissions' },
    { id: 'quality', name: 'Quality Control' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Adaptive Learning</h1>
          <p className="text-gray-500 mt-1">
            Personalized learning paths with AI-powered recommendations
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => {
              // Reset active module
              setActiveModuleId(null);

              toast({
                title: 'Dashboard View',
                description: 'Returned to learning dashboard.',
              });
            }}
          >
            Dashboard
          </Button>
          <Button>
            <GraduationCap className="h-4 w-4 mr-2" />
            My Learning
          </Button>
        </div>
      </div>

      {activeModuleId && activeModule ? (
        <LearningModule
          module={activeModule}
          userProgress={userModuleProgress}
          onComplete={handleModuleComplete}
          onTrackActivity={trackActivity}
          isAdaptive={true}
        />
      ) : (
        <div className="space-y-8">
          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Learning Streak</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">{streak}</span>
                    <span className="text-gray-500 ml-1">days</span>
                  </div>
                  <Flame className="h-6 w-6 text-orange-500" />
                </div>
                <div className="mt-2">
                  <Progress value={Math.min(streak * 14.2, 100)} className="h-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">{recentActivities}</span>
                    <span className="text-gray-500 ml-1">activities</span>
                  </div>
                  <CalendarDays className="h-6 w-6 text-blue-500" />
                </div>
                <div className="mt-2">
                  <Progress value={Math.min(recentActivities * 10, 100)} className="h-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Weekly Goal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">{completedThisWeek}/7</span>
                    <span className="text-gray-500 ml-1">completed</span>
                  </div>
                  <Award className="h-6 w-6 text-amber-500" />
                </div>
                <div className="mt-2">
                  <Progress value={(completedThisWeek / 7) * 100} className="h-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Completion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">{Math.round(completionRate * 100)}%</span>
                  </div>
                  <BarChart3 className="h-6 w-6 text-green-500" />
                </div>
                <div className="mt-2">
                  <Progress value={completionRate * 100} className="h-1" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main dashboard content */}
          <Tabs defaultValue="recommended" className="space-y-6">
            <TabsList>
              <TabsTrigger value="recommended">
                <Sparkles className="h-4 w-4 mr-2" />
                Recommended
              </TabsTrigger>
              <TabsTrigger value="all-modules">
                <BookOpen className="h-4 w-4 mr-2" />
                All Modules
              </TabsTrigger>
              <TabsTrigger value="in-progress">
                <Clock className="h-4 w-4 mr-2" />
                In Progress
              </TabsTrigger>
              <TabsTrigger value="insights">
                <Lightbulb className="h-4 w-4 mr-2" />
                Learning Insights
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <Settings className="h-4 w-4 mr-2" />
                Preferences
              </TabsTrigger>
            </TabsList>

            {/* Personalized Recommendations Tab */}
            <TabsContent value="recommended" className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Personalized Recommendations</h2>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {isLoadingProfile || !recommendations ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : recommendations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recommendations.map(recommendation => (
                    <RecommendationCard
                      key={recommendation.id}
                      recommendation={recommendation}
                      onSelect={handleSelectRecommendation}
                      onBookmark={handleBookmarkRecommendation}
                      showReason={true}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No Recommendations Yet</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Complete more modules to get personalized recommendations based on your learning
                    patterns.
                  </p>
                </div>
              )}

              {profile && (
                <Card className="mt-8">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ThumbsUp className="h-5 w-5 mr-2 text-green-600" />
                      Learning Strengths
                    </CardTitle>
                    <CardDescription>
                      Areas where you're performing well based on your learning patterns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {profile.insights?.strengths?.map((strength, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                            <Smile className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-medium capitalize">
                              {strength.replace(/_/g, ' ')}
                            </h4>
                            <p className="text-sm text-gray-500">
                              {getStrengthDescription(strength)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* All Modules Tab */}
            <TabsContent value="all-modules" className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search modules..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {isLoadingModules ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : filteredModules.length > 0 ? (
                <div className="space-y-4">
                  {filteredModules.map(module => {
                    const userProgress = profile?.progress?.modules?.[module.id];
                    const completionPercentage = userProgress?.completedLessons?.length
                      ? Math.round(
                          (userProgress.completedLessons.length / module.lessons.length) * 100
                        )
                      : 0;

                    return (
                      <Card
                        key={module.id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleSelectModule(module.id)}
                      >
                        <CardContent className="p-0">
                          <div className="flex flex-col sm:flex-row">
                            <div className="p-4 sm:p-6 flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{module.category}</Badge>
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 text-blue-700 border-blue-200"
                                >
                                  {module.lessons.length} lessons
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`${
                                    module.difficulty === 'beginner'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : module.difficulty === 'intermediate'
                                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                        : 'bg-red-50 text-red-700 border-red-200'
                                  }`}
                                >
                                  {module.difficulty}
                                </Badge>
                              </div>

                              <h3 className="text-lg font-bold mb-1">{module.title}</h3>
                              <p className="text-gray-500 mb-4">{module.description}</p>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center">
                                    <Clock className="h-4 w-4 mr-1 text-gray-500" />
                                    <span className="text-sm text-gray-500">
                                      {module.estimatedMinutes} min
                                    </span>
                                  </div>
                                  {userProgress && (
                                    <div className="flex items-center">
                                      <GraduationCap className="h-4 w-4 mr-1 text-gray-500" />
                                      <span className="text-sm text-gray-500">
                                        {userProgress.completedLessons?.length || 0}/
                                        {module.lessons.length} lessons
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <Button variant="ghost" size="sm">
                                  View Module
                                  <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                              </div>

                              {userProgress && (
                                <div className="mt-4 space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span>Progress</span>
                                    <span>{completionPercentage}% Complete</span>
                                  </div>
                                  <Progress value={completionPercentage} className="h-2" />
                                </div>
                              )}
                            </div>

                            {module.image && (
                              <div className="sm:w-48 h-auto sm:h-full bg-gray-200">
                                <img
                                  src={module.image}
                                  alt={module.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No Modules Found</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    No modules match your search criteria. Try adjusting your filters or search
                    query.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* In Progress Tab */}
            <TabsContent value="in-progress" className="space-y-6">
              <h2 className="text-xl font-bold">In Progress Modules</h2>

              {isLoadingProfile ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : profile?.progress?.modules && Object.keys(profile.progress.modules).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(profile.progress.modules)
                    .filter(([moduleId, progress]) => {
                      const module = learningModules?.find(m => m.id === moduleId);
                      return module && progress.completedLessons.length < module.lessons.length;
                    })
                    .map(([moduleId, progress]) => {
                      const module = learningModules?.find(m => m.id === moduleId);
                      if (!module) return null;

                      const completionPercentage = Math.round(
                        (progress.completedLessons.length / module.lessons.length) * 100
                      );
                      const lastActivity = new Date(progress.lastActivityDate || Date.now());

                      return (
                        <Card
                          key={moduleId}
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleSelectModule(moduleId)}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold">{module.title}</h3>
                              <Badge
                                variant="outline"
                                className={`${
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

                            <div className="space-y-1 mb-4">
                              <div className="flex justify-between text-xs">
                                <span>Progress</span>
                                <span>{completionPercentage}% Complete</span>
                              </div>
                              <Progress value={completionPercentage} className="h-2" />
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center text-sm text-gray-500">
                                <Clock className="h-4 w-4 mr-1" />
                                <span>Last activity: {formatDate(lastActivity)}</span>
                              </div>

                              <Button variant="outline" size="sm">
                                Continue
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No Modules In Progress</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    You don't have any modules in progress. Start a new module from the recommended
                    or all modules tab.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Learning Insights Tab */}
            <TabsContent value="insights" className="space-y-6">
              <h2 className="text-xl font-bold">Learning Insights</h2>

              {isLoadingProfile || !insights ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    {/* Mastery scores */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Mastery Scores</CardTitle>
                        <CardDescription>
                          Your proficiency across different subject areas
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(profile.progress.masteryScores || {}).map(
                            ([area, score]) => (
                              <div key={area} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="capitalize">{area.replace(/_/g, ' ')}</span>
                                  <span>{Math.round(score * 100)}%</span>
                                </div>
                                <div className="flex items-center">
                                  <div className="flex-1 mr-2">
                                    <Progress
                                      value={score * 100}
                                      className={`h-2 ${
                                        score >= 0.8
                                          ? 'bg-green-600'
                                          : score >= 0.6
                                            ? 'bg-blue-600'
                                            : score >= 0.4
                                              ? 'bg-yellow-600'
                                              : 'bg-red-600'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex">
                                    {[1, 2, 3, 4, 5].map(starValue => (
                                      <Star
                                        key={starValue}
                                        className={`h-4 w-4 ${
                                          starValue <= Math.round(score * 5)
                                            ? 'text-yellow-400 fill-yellow-400'
                                            : 'text-gray-300'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Learning history */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Recent Learning Activity</CardTitle>
                        <CardDescription>
                          Your learning activities in the past 30 days
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-60 bg-gray-100 rounded-md flex items-center justify-center">
                          <p className="text-gray-500">Activity chart would be displayed here</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    {/* Strengths and areas for improvement */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Strengths</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-0">
                        <ul className="space-y-2">
                          {profile.insights?.strengths?.map((strength, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                                <ThumbsUp className="h-3 w-3" />
                              </div>
                              <span className="capitalize">{strength.replace(/_/g, ' ')}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Areas for Improvement</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-0">
                        <ul className="space-y-2">
                          {profile.insights?.areasForImprovement?.map((area, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                                <ArrowRight className="h-3 w-3" />
                              </div>
                              <span className="capitalize">{area.replace(/_/g, ' ')}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    {/* Learning trend */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Learning Trend</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-10 w-10 rounded-full ${
                              profile.insights?.learningTrend === 'improving'
                                ? 'bg-green-100'
                                : profile.insights?.learningTrend === 'steady'
                                  ? 'bg-blue-100'
                                  : 'bg-amber-100'
                            } flex items-center justify-center`}
                          >
                            {profile.insights?.learningTrend === 'improving' ? (
                              <ArrowRight className={`h-6 w-6 rotate-45 text-green-600`} />
                            ) : profile.insights?.learningTrend === 'steady' ? (
                              <ArrowRight className={`h-6 w-6 text-blue-600`} />
                            ) : (
                              <ArrowRight className={`h-6 w-6 -rotate-45 text-amber-600`} />
                            )}
                          </div>

                          <div>
                            <p className="font-medium capitalize">
                              {profile.insights?.learningTrend || 'Unknown'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {getLearningTrendDescription(profile.insights?.learningTrend)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent value="preferences" className="space-y-6">
              <h2 className="text-xl font-bold">Learning Preferences</h2>

              {isLoadingProfile ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : profile?.preferences ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Learning Style</CardTitle>
                      <CardDescription>How do you prefer to learn new information?</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="visual"
                            name="learningStyle"
                            checked={profile.preferences.learningStyle === 'visual'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                learningStyle: 'visual',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label
                            htmlFor="visual"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Visual (images, diagrams, videos)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="auditory"
                            name="learningStyle"
                            checked={profile.preferences.learningStyle === 'auditory'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                learningStyle: 'auditory',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label
                            htmlFor="auditory"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Auditory (lectures, discussions)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="reading"
                            name="learningStyle"
                            checked={profile.preferences.learningStyle === 'reading'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                learningStyle: 'reading',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label
                            htmlFor="reading"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Reading/Writing (text-based content)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="kinesthetic"
                            name="learningStyle"
                            checked={profile.preferences.learningStyle === 'kinesthetic'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                learningStyle: 'kinesthetic',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label
                            htmlFor="kinesthetic"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Kinesthetic (hands-on, interactive)
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Learning Goals</CardTitle>
                      <CardDescription>What topics are you most interested in?</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="regulatory_writing"
                            checked={profile.preferences.preferredTopics?.includes(
                              'regulatory_writing'
                            )}
                            onChange={e => {
                              const updatedTopics = e.target.checked
                                ? [
                                    ...(profile.preferences.preferredTopics || []),
                                    'regulatory_writing',
                                  ]
                                : (profile.preferences.preferredTopics || []).filter(
                                    t => t !== 'regulatory_writing'
                                  );

                              updatePreferences({
                                ...profile.preferences,
                                preferredTopics: updatedTopics,
                              });
                            }}
                            className="h-4 w-4 rounded"
                          />
                          <label
                            htmlFor="regulatory_writing"
                            className="text-sm font-medium leading-none"
                          >
                            Regulatory Writing
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="compliance"
                            checked={profile.preferences.preferredTopics?.includes('compliance')}
                            onChange={e => {
                              const updatedTopics = e.target.checked
                                ? [...(profile.preferences.preferredTopics || []), 'compliance']
                                : (profile.preferences.preferredTopics || []).filter(
                                    t => t !== 'compliance'
                                  );

                              updatePreferences({
                                ...profile.preferences,
                                preferredTopics: updatedTopics,
                              });
                            }}
                            className="h-4 w-4 rounded"
                          />
                          <label htmlFor="compliance" className="text-sm font-medium leading-none">
                            Compliance
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="csr_authoring"
                            checked={profile.preferences.preferredTopics?.includes('csr_authoring')}
                            onChange={e => {
                              const updatedTopics = e.target.checked
                                ? [...(profile.preferences.preferredTopics || []), 'csr_authoring']
                                : (profile.preferences.preferredTopics || []).filter(
                                    t => t !== 'csr_authoring'
                                  );

                              updatePreferences({
                                ...profile.preferences,
                                preferredTopics: updatedTopics,
                              });
                            }}
                            className="h-4 w-4 rounded"
                          />
                          <label
                            htmlFor="csr_authoring"
                            className="text-sm font-medium leading-none"
                          >
                            CSR Authoring
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="quality_control"
                            checked={profile.preferences.preferredTopics?.includes(
                              'quality_control'
                            )}
                            onChange={e => {
                              const updatedTopics = e.target.checked
                                ? [
                                    ...(profile.preferences.preferredTopics || []),
                                    'quality_control',
                                  ]
                                : (profile.preferences.preferredTopics || []).filter(
                                    t => t !== 'quality_control'
                                  );

                              updatePreferences({
                                ...profile.preferences,
                                preferredTopics: updatedTopics,
                              });
                            }}
                            className="h-4 w-4 rounded"
                          />
                          <label
                            htmlFor="quality_control"
                            className="text-sm font-medium leading-none"
                          >
                            Quality Control
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Complexity Level</CardTitle>
                      <CardDescription>
                        What level of content complexity do you prefer?
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="beginner"
                            name="complexity"
                            checked={profile.preferences.complexity === 'beginner'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                complexity: 'beginner',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label htmlFor="beginner" className="text-sm font-medium leading-none">
                            Beginner (fundamental concepts, basic tutorials)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="intermediate"
                            name="complexity"
                            checked={profile.preferences.complexity === 'intermediate'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                complexity: 'intermediate',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label
                            htmlFor="intermediate"
                            className="text-sm font-medium leading-none"
                          >
                            Intermediate (moderate complexity, practical applications)
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="advanced"
                            name="complexity"
                            checked={profile.preferences.complexity === 'advanced'}
                            onChange={() =>
                              updatePreferences({
                                ...profile.preferences,
                                complexity: 'advanced',
                              })
                            }
                            className="h-4 w-4"
                          />
                          <label htmlFor="advanced" className="text-sm font-medium leading-none">
                            Advanced (complex topics, in-depth analysis)
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Learning Schedule</CardTitle>
                      <CardDescription>
                        How often and how long do you want to learn?
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Sessions per week
                          </label>
                          <Select
                            value={profile.preferences.sessionsPerWeek?.toString()}
                            onValueChange={value =>
                              updatePreferences({
                                ...profile.preferences,
                                sessionsPerWeek: parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 session per week</SelectItem>
                              <SelectItem value="2">2 sessions per week</SelectItem>
                              <SelectItem value="3">3 sessions per week</SelectItem>
                              <SelectItem value="5">5 sessions per week</SelectItem>
                              <SelectItem value="7">Daily sessions</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block">Time per session</label>
                          <Select
                            value={profile.preferences.timePerSession?.toString()}
                            onValueChange={value =>
                              updatePreferences({
                                ...profile.preferences,
                                timePerSession: parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 minutes</SelectItem>
                              <SelectItem value="30">30 minutes</SelectItem>
                              <SelectItem value="45">45 minutes</SelectItem>
                              <SelectItem value="60">60 minutes</SelectItem>
                              <SelectItem value="90">90+ minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Settings className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No Preferences Set</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    You haven't set any learning preferences yet. Configure your preferences to get
                    personalized recommendations.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

// Helper functions
function formatDate(date) {
  // Format date like "2 days ago" or "Apr 15, 2025"
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStrengthDescription(strength) {
  const descriptions = {
    detail_oriented:
      'You excel at understanding and implementing detailed requirements and processes.',
    consistent_learning:
      'You maintain a regular learning schedule and complete modules consistently.',
    technical_comprehension:
      'You demonstrate strong understanding of technical concepts and methodologies.',
    retention:
      'You show excellent retention of information and concepts between learning sessions.',
    practical_application:
      'You effectively apply theoretical knowledge to practical scenarios and tasks.',
  };

  return descriptions[strength] || 'You demonstrate particular aptitude in this area.';
}

function getLearningTrendDescription(trend) {
  if (trend === 'improving')
    return 'Your skills and knowledge are showing consistent improvement over time.';
  if (trend === 'steady')
    return 'You are maintaining a consistent level of performance and engagement.';
  if (trend === 'declining')
    return 'Your learning activity has decreased recently. Consider increasing engagement.';
  return 'Not enough data to determine a clear learning trend yet.';
}

// Demo learning modules for UI development
const demoLearningModules = [
  {
    id: 'module-1',
    title: 'Regulatory Writing Fundamentals',
    description:
      'Learn the essentials of effective regulatory writing for pharmaceutical and biotech submissions.',
    category: 'regulatory',
    difficulty: 'beginner',
    estimatedMinutes: 120,
    image: null,
    lessons: [
      {
        id: 'lesson-1-1',
        title: 'Introduction to Regulatory Documents',
        type: 'article',
        description: 'Overview of key regulatory document types and their purposes',
        estimatedMinutes: 15,
        content: [
          { type: 'heading', content: 'Introduction to Regulatory Documents' },
          {
            type: 'paragraph',
            content:
              'Regulatory documents are critical components of drug and device approval processes. This lesson introduces the different types of documents required by regulatory agencies worldwide.',
          },
          {
            type: 'paragraph',
            content:
              'We will cover the purpose, structure, and content requirements for key document types including Clinical Study Reports (CSRs), Investigator Brochures (IBs), Clinical Evaluation Reports (CERs), and more.',
          },
          { type: 'heading', content: 'Key Document Types' },
          {
            type: 'list',
            items: [
              'Clinical Study Reports (CSRs)',
              'Protocol and Protocol Amendments',
              'Investigator Brochures (IBs)',
              'Clinical Evaluation Reports (CERs)',
              'Common Technical Document (CTD) modules',
            ],
          },
          {
            type: 'note',
            content:
              'Understanding the purpose and audience for each document type is critical for effective regulatory writing.',
          },
        ],
        resources: [
          { id: 'resource-1-1-1', title: 'ICH E3 Guideline', type: 'pdf', size: '1.2 MB' },
          {
            id: 'resource-1-1-2',
            title: 'Regulatory Writing Glossary',
            type: 'pdf',
            size: '450 KB',
          },
        ],
        quiz: {
          description: 'Test your understanding of regulatory document types and their purposes.',
          passingScore: 70,
          questions: [
            {
              id: 'q1-1-1',
              text: 'Which document summarizes the results of a clinical trial?',
              answers: [
                { id: 'a1-1-1-1', text: 'Clinical Study Report (CSR)' },
                { id: 'a1-1-1-2', text: 'Investigator Brochure (IB)' },
                { id: 'a1-1-1-3', text: 'Protocol' },
                { id: 'a1-1-1-4', text: 'Statistical Analysis Plan (SAP)' },
              ],
              correctAnswerId: 'a1-1-1-1',
              explanation:
                'The Clinical Study Report (CSR) is the comprehensive document that summarizes the results and analysis of a completed clinical trial.',
            },
            {
              id: 'q1-1-2',
              text: 'What is the primary purpose of an Investigator Brochure?',
              answers: [
                { id: 'a1-1-2-1', text: 'To detail statistical methods for a study' },
                {
                  id: 'a1-1-2-2',
                  text: 'To provide investigators with relevant information about the investigational product',
                },
                { id: 'a1-1-2-3', text: 'To report adverse events to regulatory authorities' },
                { id: 'a1-1-2-4', text: 'To describe manufacturing processes' },
              ],
              correctAnswerId: 'a1-1-2-2',
              explanation:
                'The Investigator Brochure provides investigators with all relevant information about the investigational product, including pharmacological, toxicological, and clinical data to support the trial.',
            },
          ],
        },
      },
      {
        id: 'lesson-1-2',
        title: 'Writing Style and Conventions',
        type: 'article',
        description: 'Best practices for clear, concise, and compliant regulatory writing',
        estimatedMinutes: 20,
        content: [
          { type: 'heading', content: 'Regulatory Writing Style' },
          {
            type: 'paragraph',
            content:
              'Regulatory writing has its own unique style conventions that differ from academic or commercial writing. This lesson covers the key principles of effective regulatory writing.',
          },
          {
            type: 'paragraph',
            content:
              'We will explore how to achieve clarity, precision, and consistency while adhering to regulatory guidelines and expectations.',
          },
          { type: 'heading', content: 'Key Principles' },
          {
            type: 'list',
            items: [
              'Use clear, concise language',
              'Maintain objectivity',
              'Ensure scientific accuracy',
              'Follow consistent formatting and terminology',
              'Address regulatory requirements explicitly',
            ],
          },
          {
            type: 'warning',
            content:
              'Inconsistent terminology can lead to confusion and regulatory queries. Always maintain a consistent glossary of terms throughout your documentation.',
          },
        ],
        resources: [
          {
            id: 'resource-1-2-1',
            title: 'Regulatory Writing Style Guide',
            type: 'pdf',
            size: '2.1 MB',
          },
        ],
      },
      {
        id: 'lesson-1-3',
        title: 'Regulatory Document Templates',
        type: 'interactive',
        description: 'Explore and use standard templates for common regulatory documents',
        estimatedMinutes: 30,
      },
    ],
  },
  {
    id: 'module-2',
    title: 'Clinical Study Report (CSR) Mastery',
    description:
      'Comprehensive training on creating compliant and effective Clinical Study Reports.',
    category: 'clinical',
    difficulty: 'intermediate',
    estimatedMinutes: 180,
    image: null,
    lessons: [
      {
        id: 'lesson-2-1',
        title: 'CSR Structure and Components',
        type: 'article',
        description: 'Detailed breakdown of all CSR sections according to ICH E3',
        estimatedMinutes: 25,
      },
      {
        id: 'lesson-2-2',
        title: 'Statistical Results Reporting',
        type: 'video',
        description: 'How to effectively present and interpret statistical data in CSRs',
        estimatedMinutes: 35,
      },
      {
        id: 'lesson-2-3',
        title: 'Safety Reporting in CSRs',
        type: 'article',
        description: 'Best practices for presenting safety data and adverse events',
        estimatedMinutes: 30,
      },
      {
        id: 'lesson-2-4',
        title: 'CSR Writing Workshop',
        type: 'interactive',
        description: 'Practical exercise to draft key CSR sections',
        estimatedMinutes: 45,
      },
      {
        id: 'lesson-2-5',
        title: 'CSR Review and Finalization',
        type: 'assessment',
        description: 'Comprehensive assessment of CSR knowledge',
        estimatedMinutes: 45,
      },
    ],
  },
  {
    id: 'module-3',
    title: 'Global Regulatory Submissions',
    description: 'Learn how to adapt regulatory documents for FDA, EMA, and PMDA submissions.',
    category: 'submissions',
    difficulty: 'advanced',
    estimatedMinutes: 150,
    image: null,
    lessons: [
      {
        id: 'lesson-3-1',
        title: 'FDA Submission Requirements',
        type: 'article',
        description: 'Key requirements for US FDA submissions',
        estimatedMinutes: 30,
      },
      {
        id: 'lesson-3-2',
        title: 'EMA Submission Guidelines',
        type: 'article',
        description: 'European Medicines Agency submission process and expectations',
        estimatedMinutes: 30,
      },
      {
        id: 'lesson-3-3',
        title: 'PMDA Considerations',
        type: 'article',
        description: 'Japan-specific regulatory requirements and cultural considerations',
        estimatedMinutes: 30,
      },
      {
        id: 'lesson-3-4',
        title: 'Cross-Regional Submission Strategy',
        type: 'interactive',
        description: 'Developing an efficient strategy for multi-region submissions',
        estimatedMinutes: 40,
      },
      {
        id: 'lesson-3-5',
        title: 'Global Submission Assessment',
        type: 'assessment',
        description: 'Test your knowledge of global regulatory requirements',
        estimatedMinutes: 20,
      },
    ],
  },
];

export default AdaptiveLearning;
