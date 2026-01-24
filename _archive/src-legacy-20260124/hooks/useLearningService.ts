import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

/**
 * Hook for accessing the AI learning recommendation services
 */
export function useLearningService(userId?: number) {
  const queryClient = useQueryClient();

  // Get AI-generated insights for a user
  const useInsights = () => {
    return useQuery({
      queryKey: userId ? ['/api/learning/insights', userId] : ['skip-query'],
      queryFn: async () => {
        if (!userId) return null;
        const res = await apiRequest('GET', `/api/learning/insights/${userId}`);
        const data = await res.json();
        return data;
      },
      enabled: !!userId,
    });
  };

  // Get personalized learning path
  const useLearningPath = () => {
    return useQuery({
      queryKey: userId ? ['/api/learning/path', userId] : ['skip-query'],
      queryFn: async () => {
        if (!userId) return null;
        const res = await apiRequest('GET', `/api/learning/path/${userId}`);
        const data = await res.json();
        return data;
      },
      enabled: !!userId,
    });
  };

  // Get recommended modules with relevance scores
  const useRecommendedModules = () => {
    return useQuery({
      queryKey: userId ? ['/api/learning/recommended-modules', userId] : ['skip-query'],
      queryFn: async () => {
        if (!userId) return null;
        const res = await apiRequest('GET', `/api/learning/recommended-modules/${userId}`);
        const data = await res.json();
        return data;
      },
      enabled: !!userId,
    });
  };

  // Mark an insight as read
  const markInsightAsRead = useMutation({
    mutationFn: async (insightId: number) => {
      const res = await apiRequest('PATCH', `/api/learning/insights/${insightId}/read`);
      return res.json();
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['/api/learning/insights', userId] });
      }
    },
  });

  // Save or unsave an insight
  const saveInsight = useMutation({
    mutationFn: async ({ insightId, save }: { insightId: number; save: boolean }) => {
      const res = await apiRequest('PATCH', `/api/learning/insights/${insightId}/save`, { save });
      return res.json();
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['/api/learning/insights', userId] });
      }
    },
  });

  // Update learning progress
  const updateProgress = useMutation({
    mutationFn: async (data: {
      userId: number;
      moduleId?: number;
      templateId?: number;
      progress: number;
      completed: boolean;
    }) => {
      const res = await apiRequest('POST', '/api/learning/progress', data);
      return res.json();
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['/api/learning/path', userId] });
      }
    },
  });

  // Log user activity
  const logActivity = useMutation({
    mutationFn: async (data: {
      userId: number;
      activityType: string;
      resourceId?: number;
      action: string;
      metadata?: any;
    }) => {
      const res = await apiRequest('POST', '/api/user/activity', data);
      return res.json();
    },
  });

  return {
    insights: useInsights(),
    learningPath: useLearningPath(),
    recommendedModules: useRecommendedModules(),
    markInsightAsRead,
    saveInsight,
    updateProgress,
    logActivity,
  };
}
