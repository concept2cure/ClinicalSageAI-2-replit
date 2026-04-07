import { useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

export function useBetaWorkspaceTelemetry({ activeTab, currentProjectId }) {
  const trackEvent = useCallback(
    (type, detail = {}) => {
      const payload = {
        type,
        route: window.location.pathname,
        activeTab,
        projectId: currentProjectId,
        detail,
      };

      return apiRequest('POST', '/api/telemetry/beta-workspace/event', payload).catch(() => {});
    },
    [activeTab, currentProjectId]
  );

  const sendRouteEntry = useCallback(
    sparseState => {
      trackEvent('route_entry', { sparseState: !!sparseState });
      if (sparseState) {
        trackEvent('sparse_state_rendering', { reason: 'missing_device_name' });
      }
    },
    [trackEvent]
  );

  const trackStepCompletion = useCallback(
    step => trackEvent('workflow_step_completion', { step }),
    [trackEvent]
  );

  const trackValidationFailure = useCallback(
    (reason, field) => trackEvent('validation_failure', { reason, field }),
    [trackEvent]
  );

  const trackExportAttempt = useCallback(
    format => trackEvent('export_attempt', { format }),
    [trackEvent]
  );

  const trackFallbackActivation = useCallback(
    fallbackType => trackEvent('fallback_activation', { fallbackType }),
    [trackEvent]
  );

  const reportIssue = useCallback(
    (summary, severity = 'medium') => {
      const payload = {
        route: window.location.pathname,
        activeTab,
        projectId: currentProjectId,
        summary,
        severity,
        createdAt: new Date().toISOString(),
      };

      return apiRequest('POST', '/api/telemetry/beta-workspace/issue', payload).catch(() => {});
    },
    [activeTab, currentProjectId]
  );

  return {
    sendRouteEntry,
    trackStepCompletion,
    trackValidationFailure,
    trackExportAttempt,
    trackFallbackActivation,
    reportIssue,
  };
}
