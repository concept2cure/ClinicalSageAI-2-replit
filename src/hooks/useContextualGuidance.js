import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';

export const useContextualGuidance = (moduleId, sectionId, content) => {
  const [guidance, setGuidance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [realtimeAnalysis, setRealtimeAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const debouncedContent = useDebounce(content, 1000); // Debounce for real-time analysis

  // Fetch contextual guidance when module/section changes
  const fetchGuidance = useCallback(async () => {
    if (!moduleId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/contextual-guidance/guidance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          sectionId,
          currentContent: content,
          documentType: 'IND',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setGuidance(data.guidance);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch guidance');
      console.error('Guidance fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [moduleId, sectionId, content]);

  // Real-time content analysis
  const analyzeContent = useCallback(async () => {
    if (!debouncedContent || !moduleId || debouncedContent.length < 20) {
      setRealtimeAnalysis(null);
      return;
    }

    try {
      const response = await fetch('/api/contextual-guidance/analyze-realtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: debouncedContent,
          moduleId,
          sectionId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRealtimeAnalysis(data.analysis);
      }
    } catch (err) {
      console.error('Real-time analysis error:', err);
    }
  }, [debouncedContent, moduleId, sectionId]);

  // Get inline recommendations
  const getInlineRecommendations = useCallback(
    async cursorPosition => {
      if (!content || !moduleId) return null;

      try {
        const response = await fetch('/api/contextual-guidance/inline-recommendations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            moduleId,
            sectionId,
            cursorPosition,
          }),
        });

        const data = await response.json();
        return data.success ? data.recommendations : null;
      } catch (err) {
        console.error('Inline recommendations error:', err);
        return null;
      }
    },
    [content, moduleId, sectionId]
  );

  // Get historical FDA comments
  const getHistoricalComments = useCallback(async () => {
    if (!moduleId) return [];

    try {
      const url = sectionId
        ? `/api/contextual-guidance/historical-comments/${moduleId}/${sectionId}`
        : `/api/contextual-guidance/historical-comments/${moduleId}`;

      const response = await fetch(url);
      const data = await response.json();

      return data.success ? data.comments : [];
    } catch (err) {
      console.error('Historical comments error:', err);
      return [];
    }
  }, [moduleId, sectionId]);

  // Effects
  useEffect(() => {
    fetchGuidance();
  }, [fetchGuidance]);

  useEffect(() => {
    analyzeContent();
  }, [analyzeContent]);

  return {
    guidance,
    loading,
    error,
    realtimeAnalysis,
    getInlineRecommendations,
    getHistoricalComments,
    refreshGuidance: fetchGuidance,
  };
};

// Custom debounce hook
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
