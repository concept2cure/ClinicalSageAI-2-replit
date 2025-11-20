import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook for CER generation using server-sent events (SSE)
 * for streaming narrative with typewriter effect.
 *
 * @param {Object} options Configuration options
 * @param {boolean} options.autoConnect Whether to connect automatically on mount
 * @returns {Object} Hook methods and state
 */
export const useCERGenerator = ({ autoConnect = false } = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sectionContent, setSectionContent] = useState({});
  const [currentSection, setCurrentSection] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [evidenceTraces, setEvidenceTraces] = useState({});
  const { toast } = useToast();

  // Store the EventSource instance
  const eventSourceRef = useRef(null);

  // Total sections to track progress
  const totalSectionsRef = useRef([
    'executive_summary',
    'device_description',
    'state_of_the_art',
    'risk_assessment',
    'clinical_evaluation',
    'post_market_surveillance',
    'conclusion',
  ]);

  // Completed sections tracker
  const completedSectionsRef = useRef(new Set());

  /**
   * Connect to the SSE endpoint and set up event listeners
   */
  const connect = useCallback(() => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsConnected(true);
  }, []);

  /**
   * Disconnect from the SSE endpoint
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
  }, []);

  /**
   * Start generating a CER with streaming updates
   *
   * @param {Object} params Generation parameters
   * @param {number} params.deviceId Device ID
   * @param {string} params.startDate Start date in YYYY-MM-DD format
   * @param {string} params.endDate End date in YYYY-MM-DD format
   * @param {Array<string>} params.sections Optional list of sections to generate
   */
  const startGeneration = useCallback(
    async params => {
      try {
        // Reset state
        setSectionContent({});
        setCurrentSection(null);
        setError(null);
        completedSectionsRef.current = new Set();

        if (params.sections) {
          totalSectionsRef.current = params.sections;
        }

        setProgress(0);
        setIsGenerating(true);

        // Construct query string for request
        const queryParams = new URLSearchParams({
          device_id: params.deviceId,
          start_date: params.startDate,
          end_date: params.endDate,
          ...(params.sections && { sections: params.sections.join(',') }),
        }).toString();

        // Create and configure EventSource for SSE
        const eventSource = new EventSource(`/api/cer/generate/stream?${queryParams}`);
        eventSourceRef.current = eventSource;

        // Set up event handlers
        eventSource.addEventListener('start', event => {
          const data = JSON.parse(event.data);
          console.log('CER generation started:', data);

          toast({
            title: 'CER Generation Started',
            description: 'The AI is now generating your clinical evaluation report...',
          });
        });

        eventSource.addEventListener('chunk', event => {
          const data = JSON.parse(event.data);
          const { section, content } = data;

          // Update current section if changed
          if (currentSection !== section) {
            setCurrentSection(section);
          }

          // Append content to the section
          setSectionContent(prev => ({
            ...prev,
            [section]: (prev[section] || '') + content,
          }));

          // Track completed sections for progress
          if (!completedSectionsRef.current.has(section)) {
            completedSectionsRef.current.add(section);

            // Update progress percentage
            const progressPercent = Math.round(
              (completedSectionsRef.current.size / totalSectionsRef.current.length) * 100
            );
            setProgress(progressPercent);
          }
        });

        eventSource.addEventListener('error', event => {
          console.error('SSE Error:', event);
          setError('An error occurred during report generation. Please try again.');

          toast({
            title: 'Generation Error',
            description: 'An error occurred during report generation. Please try again.',
            variant: 'destructive',
          });

          // Clean up
          eventSource.close();
          setIsGenerating(false);
        });

        eventSource.addEventListener('end', event => {
          const data = JSON.parse(event.data);
          console.log('CER generation complete:', data);

          toast({
            title: 'CER Generation Complete',
            description: 'Your clinical evaluation report has been successfully generated.',
          });

          // Clean up
          eventSource.close();
          setIsGenerating(false);
          setProgress(100);
        });
      } catch (error) {
        console.error('Error starting CER generation:', error);
        setError(error.message || 'Failed to start report generation');
        setIsGenerating(false);

        toast({
          title: 'Generation Failed',
          description: error.message || 'Failed to start report generation. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [currentSection, toast]
  );

  /**
   * Fetch evidence traces for a specific section
   *
   * @param {string} reportId The report ID
   * @param {string} sectionName The section name
   */
  const fetchEvidenceTraces = useCallback(
    async (reportId, sectionName) => {
      try {
        const response = await fetch(`/api/cer/reports/${reportId}/evidence/${sectionName}`);
        const data = await response.json();

        setEvidenceTraces(prev => ({
          ...prev,
          [sectionName]: data,
        }));

        return data;
      } catch (error) {
        console.error('Error fetching evidence traces:', error);
        toast({
          title: 'Evidence Retrieval Failed',
          description: 'Failed to load evidence sources for this section.',
          variant: 'destructive',
        });

        return null;
      }
    },
    [toast]
  );

  // Connect automatically if configured
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Clean up on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [autoConnect, connect]);

  return {
    // State
    isConnected,
    isGenerating,
    sectionContent,
    currentSection,
    error,
    progress,
    evidenceTraces,

    // Methods
    connect,
    disconnect,
    startGeneration,
    fetchEvidenceTraces,
  };
};

export default useCERGenerator;
