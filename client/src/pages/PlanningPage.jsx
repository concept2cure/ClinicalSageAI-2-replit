import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import ProtocolPlanningDashboard from '@/components/ProtocolPlanningDashboard';
import { Loader2 } from 'lucide-react'

export default function PlanningPage() {
  const [location] = useLocation();
  const [template, setTemplate] = useState('');
  const [csrData, setCsrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Parse URL query parameters
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const persona = searchParams.get('persona');
  const studyId = searchParams.get('study_id');
  const csrId = searchParams.get('csr_id');

  useEffect(() => {
    const loadContext = async () => {
      try {
        if (csrId) {
          // Load CSR data from the intelligence API
          const res = await fetch(`/api/intelligence/csr/${csrId}`);
          if (!res.ok) {
            throw new Error(`Failed to load CSR data: ${res.status}`);
          }
          const result = await res.json();
          if (result.success && result.data) {
            setCsrData(result.data);

            // Optionally seed the template from the CSR primary objective
            if (result.data.details?.primaryObjective) {
              setTemplate(result.data.details.primaryObjective);
            } else if (result.data.summary) {
              setTemplate(result.data.summary);
            }
          } else {
            throw new Error('Invalid CSR data structure');
          }
        } else if (persona) {
          // Load template from persona-specific template
          try {
            const res = await fetch(`/static/templates/${persona}_template.txt`);
            if (res.ok) {
              const text = await res.text();
              setTemplate(text);
            }
          } catch (templateErr) {
            console.warn('Failed to load template:', templateErr);
            // Non-fatal error, continue without template
          }
        }
      } catch (err) {
        console.error('Error loading planning context:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [csrId, persona, studyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {csrId ? 'Loading CSR data...' : 'Initializing planning session...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h3 className="text-red-800 font-medium">Error loading planning session</h3>
          <p className="text-red-700 mt-2">{error}</p>
          <p className="text-sm text-red-600 mt-4">
            You can still continue with an empty planning session.
          </p>
        </div>
        <div className="mt-6">
          <ProtocolPlanningDashboard
            initialProtocol=""
            sessionId={studyId || csrId || 'adhoc'}
            persona={persona}
            csrContext={null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ProtocolPlanningDashboard
        initialProtocol={template}
        sessionId={studyId || csrId || 'adhoc'}
        persona={persona}
        csrContext={csrData}
      />
    </div>
  );
}
