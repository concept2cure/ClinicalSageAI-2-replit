/**
 * Hook for generating and managing reports.
 * Connects to report-generator-service and Docx Factory.
 */
import { useQuery, useMutation } from '@tanstack/react-query';

export interface Report {
  id: string;
  title: string;
  type: 'readiness-brief' | 'exception-summary' | 'handoff-brief' | 'transmittal' | 'executive-summary';
  status: 'draft' | 'generating' | 'ready' | 'exported';
  createdAt: string;
  projectId?: string;
  downloadUrl?: string;
}

export function useReports(projectId?: string) {
  const reportsQuery = useQuery<Report[]>({
    queryKey: ['reports', projectId],
    queryFn: async () => {
      // Try fetching existing reports
      try {
        const res = await fetch(
          projectId
            ? `/api/concept2cure/projects/${projectId}/reports`
            : '/api/concept2cure/reports',
          { credentials: 'include' }
        );
        if (res.ok) {
          const json = await res.json();
          return json.data || json || [];
        }
      } catch {
        // Reports endpoint may not exist yet
      }
      return [];
    },
    staleTime: 60_000,
  });

  const generateReport = useMutation({
    mutationFn: async (params: {
      type: Report['type'];
      title: string;
      projectId?: string;
    }) => {
      // Generate report via Docx Factory
      const res = await fetch('/api/docx-factory/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          templateId: params.type,
          title: params.title,
          projectId: params.projectId,
          inputs: {
            reportType: params.type,
            generatedAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        // Fall back to simple DOCX export
        const docxRes = await fetch('/api/concept2cure/artifacts/export-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: params.title,
            content: `# ${params.title}\n\nGenerated: ${new Date().toLocaleDateString()}\n\nThis report was generated from the Concept2Cure platform.`,
          }),
        });

        if (docxRes.ok) {
          const blob = await docxRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${params.title.replace(/[^a-zA-Z0-9_.-]/g, '_')}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return { id: 'local', title: params.title, status: 'exported' };
        }
        throw new Error('Report generation failed');
      }

      return res.json();
    },
  });

  return {
    reports: reportsQuery.data || [],
    isLoading: reportsQuery.isLoading,
    generateReport: generateReport.mutateAsync,
    isGenerating: generateReport.isPending,
  };
}
