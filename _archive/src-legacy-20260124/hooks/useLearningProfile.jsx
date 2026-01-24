import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook for managing user learning profiles
 *
 * Provides functionality to fetch user learning profile, update preferences,
 * track learning progress, and get personalized recommendations.
 */
export const useLearningProfile = userId => {
  const { toast } = useToast();

  // Fetch user learning profile
  const {
    data: profile,
    isLoading: isLoadingProfile,
    error: profileError,
  } = useQuery({
    queryKey: ['/api/learning/profile', userId],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/learning/profile/${userId}`);
        return await response.json();
      } catch (error) {
        console.error('Error fetching learning profile:', error);
        // Return demo profile for UI demonstration
        return {
          userId: userId || 'user-123',
          preferences: {
            learningStyle: 'visual',
            preferredTopics: ['regulatory_writing', 'compliance', 'csr_authoring'],
            complexity: 'intermediate',
            sessionsPerWeek: 3,
            timePerSession: 30,
          },
          progress: {
            completedModules: ['intro_to_regulatory', 'csr_basics'],
            currentModule: 'advanced_csr',
            totalModulesAvailable: 12,
            totalCompletedLessons: 15,
            streakDays: 5,
            lastActivityDate: new Date().toISOString(),
            masteryScores: {
              regulatory_writing: 0.75,
              compliance: 0.6,
              csr_authoring: 0.82,
              quality_control: 0.45,
            },
          },
          recommendations: [
            {
              id: 'rec-1',
              title: 'Advanced CSR Techniques',
              type: 'course',
              reason: 'Based on your progress in CSR authoring',
              confidence: 0.92,
              estimatedTime: 45,
              priority: 'high',
            },
            {
              id: 'rec-2',
              title: 'Quality Control Best Practices',
              type: 'tutorial',
              reason: 'To improve your QC skills',
              confidence: 0.88,
              estimatedTime: 25,
              priority: 'medium',
            },
            {
              id: 'rec-3',
              title: 'PMDA Submissions Masterclass',
              type: 'webinar',
              reason: 'Aligned with your interest in global compliance',
              confidence: 0.79,
              estimatedTime: 60,
              priority: 'medium',
            },
          ],
          insights: {
            strengths: ['detail_oriented', 'consistent_learning'],
            areasForImprovement: ['quality_control', 'ema_requirements'],
            learningTrend: 'improving',
            lastAssessmentDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        };
      }
    },
    enabled: !!userId,
  });

  // Get personalized recommendations
  const { data: recommendations, isLoading: isLoadingRecommendations } = useQuery({
    queryKey: ['/api/learning/recommendations', userId],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/learning/recommendations/${userId}`);
        return await response.json();
      } catch (error) {
        console.error('Error fetching recommendations:', error);
        // Return profile recommendations if available, otherwise empty array
        return profile?.recommendations || [];
      }
    },
    enabled: !!userId && !!profile,
  });

  // Update user preferences
  const updatePreferencesMutation = useMutation({
    mutationFn: async preferences => {
      const response = await apiRequest(
        'PATCH',
        `/api/learning/profile/${userId}/preferences`,
        preferences
      );
      return await response.json();
    },
    onSuccess: data => {
      queryClient.setQueryData(['/api/learning/profile', userId], old => ({
        ...old,
        preferences: data,
      }));
      toast({
        title: 'Preferences Updated',
        description: 'Your learning preferences have been saved.',
      });
    },
    onError: error => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update preferences. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Track learning activity
  const trackActivityMutation = useMutation({
    mutationFn: async activity => {
      const response = await apiRequest('POST', `/api/learning/track`, {
        userId,
        ...activity,
      });
      return await response.json();
    },
    onSuccess: () => {
      // Refresh profile data after tracking activity
      queryClient.invalidateQueries({ queryKey: ['/api/learning/profile', userId] });
    },
    onError: error => {
      console.error('Error tracking activity:', error);
      // Don't show toast for background tracking errors
    },
  });

  // Complete a module or lesson
  const completeModuleMutation = useMutation({
    mutationFn: async ({ moduleId, lessonId, assessmentResults }) => {
      const response = await apiRequest('POST', `/api/learning/complete`, {
        userId,
        moduleId,
        lessonId,
        assessmentResults,
      });
      return await response.json();
    },
    onSuccess: data => {
      // Refresh profile and recommendations after completing a module
      queryClient.invalidateQueries({ queryKey: ['/api/learning/profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/learning/recommendations', userId] });

      toast({
        title: 'Progress Saved',
        description: data.message || 'Your progress has been saved.',
      });
    },
    onError: error => {
      toast({
        title: 'Could Not Save Progress',
        description: error.message || 'Failed to save your progress. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Get learning insights
  const { data: insights, isLoading: isLoadingInsights } = useQuery({
    queryKey: ['/api/learning/insights', userId],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/learning/insights/${userId}`);
        return await response.json();
      } catch (error) {
        console.error('Error fetching learning insights:', error);
        // Return profile insights if available
        return profile?.insights || null;
      }
    },
    enabled: !!userId && !!profile,
  });

  return {
    profile,
    isLoadingProfile,
    profileError,
    recommendations,
    isLoadingRecommendations,
    insights,
    isLoadingInsights,
    updatePreferences: updatePreferencesMutation.mutate,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    trackActivity: trackActivityMutation.mutate,
    completeModule: completeModuleMutation.mutate,
    isCompletingModule: completeModuleMutation.isPending,
  };
};
