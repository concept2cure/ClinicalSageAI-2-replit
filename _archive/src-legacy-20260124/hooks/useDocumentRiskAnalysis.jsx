import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook for document risk analysis and prediction
 *
 * Provides functionality to analyze documents for regulatory risks,
 * get AI-powered insights, and track risk mitigation progress.
 */
export const useDocumentRiskAnalysis = documentId => {
  const [selectedRiskId, setSelectedRiskId] = useState(null);
  const { toast } = useToast();

  // Get document risk analysis
  const {
    data: riskAnalysis,
    isLoading: isLoadingAnalysis,
    error: analysisError,
    refetch: refetchAnalysis,
  } = useQuery({
    queryKey: ['/api/risk-analysis/document', documentId],
    queryFn: async () => {
      if (!documentId) return null;

      try {
        const response = await apiRequest('GET', `/api/risk-analysis/document/${documentId}`);
        return await response.json();
      } catch (error) {
        console.error('Error fetching risk analysis:', error);
        // Return demo data for UI development
        return {
          documentId: documentId || 'doc-123',
          documentType: 'Clinical Study Report',
          overallRiskScore: 0.65,
          riskCategory: 'moderate',
          lastUpdated: new Date().toISOString(),
          risks: [
            {
              id: 'risk-1',
              section: 'Adverse Events',
              severity: 'high',
              probability: 'likely',
              impact: 'major',
              riskScore: 0.85,
              description: 'Inconsistent reporting of serious adverse events across study sites',
              aiInsights:
                'Detection of potential underreporting pattern when comparing SAE incidence across sites 3, 7, and 12. Consider adding detailed SAE reconciliation explanation.',
              mitigationStatus: 'open',
              recommendations: [
                'Conduct full reconciliation of SAE data across all sites',
                'Include detailed explanation of SAE classification methodology',
                'Add cross-reference to safety database for completeness',
              ],
            },
            {
              id: 'risk-2',
              section: 'Statistical Analysis',
              severity: 'medium',
              probability: 'possible',
              impact: 'moderate',
              riskScore: 0.65,
              description:
                'Missing explanation for handling of outlier data in primary endpoint analysis',
              aiInsights:
                'Regulatory precedent shows increased information requests when outlier handling methodology is not explicitly documented. Current description on page 47 lacks specific criteria used for identification and exclusion of outliers.',
              mitigationStatus: 'in_progress',
              recommendations: [
                'Add detailed explanation of outlier definition criteria',
                'Include sensitivity analysis with and without outliers',
                'Provide justification for each excluded datapoint',
              ],
            },
            {
              id: 'risk-3',
              section: 'Study Methodology',
              severity: 'low',
              probability: 'unlikely',
              impact: 'minor',
              riskScore: 0.25,
              description: 'Ambiguous description of randomization procedure',
              aiInsights:
                'While the randomization description meets minimum requirements, recent FDA feedback patterns show preference for more detailed block size and stratification factor details. Consider enhancing this section to preempt information requests.',
              mitigationStatus: 'resolved',
              recommendations: [
                'Clarify specific randomization algorithm used',
                'Specify block sizes and stratification factors',
                'Add reference to randomization validation documentation',
              ],
              resolutionDetails: {
                resolvedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                resolution:
                  'Added detailed randomization procedure description in Section 9.4.1 with references to validation documentation.',
                resolvedBy: 'Jane Smith',
              },
            },
          ],
          riskTrends: [
            { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), score: 0.82 },
            { date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), score: 0.75 },
            { date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), score: 0.68 },
            { date: new Date().toISOString(), score: 0.65 },
          ],
          aiSummary:
            'This document shows moderate overall risk with several addressable concerns. The most critical issue is the inconsistent adverse event reporting which requires immediate attention. Statistical methodology has improved but still contains gaps in outlier handling. Overall trend is positive with risk score decreasing by 20% over the past month as issues are addressed.',
        };
      }
    },
    enabled: !!documentId,
  });

  // Get document content
  const { data: documentContent, isLoading: isLoadingDocument } = useQuery({
    queryKey: ['/api/documents/content', documentId],
    queryFn: async () => {
      if (!documentId) return null;

      try {
        const response = await apiRequest('GET', `/api/documents/content/${documentId}`);
        return await response.json();
      } catch (error) {
        console.error('Error fetching document content:', error);
        // Return demo content for UI development
        return {
          id: documentId,
          title: 'Clinical Study Report for Protocol XYZ-123',
          content: {
            sections: [
              {
                id: 'section-1',
                title: 'Introduction',
                content:
                  'This clinical study report summarizes the results of Study XYZ-123, a Phase III, randomized, double-blind, placebo-controlled study evaluating the efficacy and safety of Drug ABC in patients with condition XYZ.',
              },
              {
                id: 'section-2',
                title: 'Study Methodology',
                content:
                  'The study used a centralized randomization procedure to assign patients to treatment groups. Patients were randomized in a 1:1 ratio to receive either Drug ABC or placebo.',
              },
              {
                id: 'section-3',
                title: 'Statistical Analysis',
                content:
                  'The primary efficacy endpoint was analyzed using an ANCOVA model with treatment as factor and baseline value as covariate. Missing data were handled using the last observation carried forward (LOCF) method. Outliers were identified and excluded from the primary analysis.',
              },
              {
                id: 'section-4',
                title: 'Adverse Events',
                content:
                  'All adverse events were collected from the time of informed consent through the end of study participation. Serious adverse events (SAEs) were reported by investigators to the sponsor within 24 hours of awareness.',
              },
            ],
          },
        };
      }
    },
    enabled: !!documentId,
  });

  // Get detailed risk insights
  const {
    data: riskInsights,
    isLoading: isLoadingInsights,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ['/api/risk-analysis/insights', documentId, selectedRiskId],
    queryFn: async () => {
      if (!documentId || !selectedRiskId) return null;

      try {
        const response = await apiRequest(
          'GET',
          `/api/risk-analysis/insights/${documentId}/${selectedRiskId}`
        );
        return await response.json();
      } catch (error) {
        console.error('Error fetching risk insights:', error);
        // Return demo insights for UI development
        const risk = riskAnalysis?.risks?.find(r => r.id === selectedRiskId);
        if (!risk) return null;

        return {
          riskId: selectedRiskId,
          detailedAnalysis: `In-depth analysis of "${risk.description}" reveals potential regulatory concerns in the ${risk.section} section. The current content lacks sufficient detail and clarity to meet regulatory expectations, particularly when compared to recently approved submissions in similar therapeutic areas.`,
          regulatoryContext:
            'FDA has issued information requests for similar issues in 67% of submissions in the past 18 months. EMA guidance specifically recommends detailed documentation of these procedures.',
          similarCases: [
            {
              id: 'case-1',
              agency: 'FDA',
              date: '2024-03-15',
              outcome: 'Information Request',
              details:
                'Sponsor received major information request requiring substantial revision of similar section.',
            },
            {
              id: 'case-2',
              agency: 'EMA',
              date: '2023-11-08',
              outcome: 'Major Objection',
              details:
                'Application faced significant delay due to similar reporting inconsistencies.',
            },
          ],
          generatedSuggestions: {
            textToReplace:
              risk.section === 'Adverse Events'
                ? 'All adverse events were collected from the time of informed consent through the end of study participation. Serious adverse events (SAEs) were reported by investigators to the sponsor within 24 hours of awareness.'
                : risk.section === 'Statistical Analysis'
                  ? 'The primary efficacy endpoint was analyzed using an ANCOVA model with treatment as factor and baseline value as covariate. Missing data were handled using the last observation carried forward (LOCF) method. Outliers were identified and excluded from the primary analysis.'
                  : 'The study used a centralized randomization procedure to assign patients to treatment groups. Patients were randomized in a 1:1 ratio to receive either Drug ABC or placebo.',
            suggestedReplacement:
              risk.section === 'Adverse Events'
                ? 'All adverse events (AEs) were collected systematically from the time of informed consent through 30 days following the end of study participation using structured case report forms. Investigators assessed the severity of each AE using the NCI-CTCAE v5.0 criteria and determined relationship to study drug. Serious adverse events (SAEs) were reported by investigators to the sponsor within 24 hours of awareness. A rigorous SAE reconciliation process was implemented across all study sites (Sites 1-15) to ensure consistent reporting, with particular attention to Sites 3, 7, and 12 where initial reporting discrepancies were identified and subsequently resolved through additional investigator training and data verification procedures.'
                : risk.section === 'Statistical Analysis'
                  ? "The primary efficacy endpoint was analyzed using an ANCOVA model with treatment as factor and baseline value as covariate. Missing data were handled using the last observation carried forward (LOCF) method. Statistical outliers were identified using Grubb's test with a significance level of α=0.05. Outliers were defined as values exceeding 3 standard deviations from the mean after log transformation. A total of 7 datapoints (3 in treatment arm, 4 in placebo) were identified as statistical outliers. The primary analysis was conducted both with and without these outliers, and sensitivity analyses demonstrated that their exclusion did not materially impact the overall study conclusions. A detailed listing of excluded outliers with justification is provided in Appendix 14.2.1."
                  : 'The study used a centralized computerized interactive web response system (IWRS) to implement the randomization schedule. Patients were randomized in a 1:1 ratio to receive either Drug ABC or placebo using permuted blocks of variable size (4 and 6) stratified by disease severity (mild, moderate, severe) and prior treatment history (yes/no). The randomization schedule was prepared by an independent statistician not otherwise involved in the study, and was validated prior to study initiation as documented in the Randomization Validation Report (Document ID: RVR-XYZ123-001).',
          },
          impactAssessment: {
            beforeMitigation: {
              probability: risk.probability,
              impact: risk.impact,
              riskScore: risk.riskScore,
            },
            afterMitigation: {
              probability:
                risk.probability === 'likely'
                  ? 'possible'
                  : risk.probability === 'possible'
                    ? 'unlikely'
                    : 'rare',
              impact: risk.impact,
              riskScore: risk.riskScore * 0.6,
            },
          },
        };
      }
    },
    enabled: !!documentId && !!selectedRiskId,
  });

  // Update risk mitigation status
  const updateRiskStatusMutation = useMutation({
    mutationFn: async ({ riskId, status, resolution }) => {
      if (!documentId || !riskId) throw new Error('Document ID and Risk ID are required');

      const response = await apiRequest(
        'PATCH',
        `/api/risk-analysis/status/${documentId}/${riskId}`,
        {
          status,
          resolution,
        }
      );

      return await response.json();
    },
    onSuccess: () => {
      // Refresh risk analysis data
      queryClient.invalidateQueries({ queryKey: ['/api/risk-analysis/document', documentId] });

      toast({
        title: 'Risk Status Updated',
        description: 'The risk mitigation status has been updated successfully.',
      });
    },
    onError: error => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update risk status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Run AI analysis on document
  const runAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error('Document ID is required');

      const response = await apiRequest('POST', `/api/risk-analysis/analyze/${documentId}`);
      return await response.json();
    },
    onSuccess: () => {
      // Refresh risk analysis data
      queryClient.invalidateQueries({ queryKey: ['/api/risk-analysis/document', documentId] });

      toast({
        title: 'Analysis Complete',
        description: 'Document risk analysis has been completed successfully.',
      });
    },
    onError: error => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze document. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Apply suggested fix
  const applySuggestionMutation = useMutation({
    mutationFn: async ({ documentId, riskId, section, textToReplace, replacement }) => {
      const response = await apiRequest('POST', `/api/documents/edit`, {
        documentId,
        riskId,
        section,
        textToReplace,
        replacement,
      });

      return await response.json();
    },
    onSuccess: () => {
      // Refresh document content and risk analysis
      queryClient.invalidateQueries({ queryKey: ['/api/documents/content', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/risk-analysis/document', documentId] });

      toast({
        title: 'Suggestion Applied',
        description: 'The suggested changes have been applied to the document.',
      });
    },
    onError: error => {
      toast({
        title: 'Failed to Apply Changes',
        description: error.message || 'Failed to apply suggested changes. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return {
    // Data
    riskAnalysis,
    documentContent,
    riskInsights,
    selectedRiskId,

    // Loading states
    isLoadingAnalysis,
    isLoadingDocument,
    isLoadingInsights,
    isUpdatingStatus: updateRiskStatusMutation.isPending,
    isRunningAnalysis: runAnalysisMutation.isPending,
    isApplyingSuggestion: applySuggestionMutation.isPending,

    // Errors
    analysisError,

    // Actions
    setSelectedRiskId,
    updateRiskStatus: updateRiskStatusMutation.mutate,
    runAnalysis: runAnalysisMutation.mutate,
    applySuggestion: applySuggestionMutation.mutate,
    refetchAnalysis,
    refetchInsights,
  };
};
