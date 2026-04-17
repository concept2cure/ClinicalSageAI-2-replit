import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function GenerationProgressPanel({ jobId, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [sectionStatuses, setSectionStatuses] = useState({
    deviceIdentification: 'pending',
    clinicalBackgroundData: 'pending',
    riskAssessment: 'pending',
    postMarketData: 'pending',
    literatureReview: 'pending',
    equivalenceAssessment: 'pending',
    clinicalEvaluation: 'pending',
    conclusions: 'pending',
  });

  // Poll the real job status endpoint. Never fabricate section statuses —
  // an incorrect "error" shown for a regulatory section could mislead the
  // user into believing their generation failed.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/cer/jobs/${jobId}/status`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const data = await response.json();
        if (cancelled) return;
        if (typeof data?.progress === 'number') setProgress(data.progress);
        if (data?.sectionStatuses && typeof data.sectionStatuses === 'object') {
          setSectionStatuses(prev => ({ ...prev, ...data.sectionStatuses }));
        }
        if (data?.status === 'complete' || data?.progress >= 100) {
          onComplete && onComplete();
        }
      } catch {
        // Leave the last known state in place; do not invent a status.
      }
    };

    pollStatus();
    const intervalId = setInterval(pollStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [jobId, onComplete]);

  const getStatusIcon = status => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getSectionName = key => {
    const names = {
      deviceIdentification: 'Device Identification',
      clinicalBackgroundData: 'Clinical Background',
      riskAssessment: 'Risk Assessment',
      postMarketData: 'Post-Market Data',
      literatureReview: 'Literature Review',
      equivalenceAssessment: 'Equivalence Assessment',
      clinicalEvaluation: 'Clinical Evaluation',
      conclusions: 'Conclusions',
    };

    return names[key] || key;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Generation Progress</h3>
            <Badge variant="outline">{progress}% Complete</Badge>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium mb-4">Section Status</h3>
          <div className="space-y-2">
            {Object.entries(sectionStatuses).map(([key, status]) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span>{getSectionName(key)}</span>
                <div className="flex items-center gap-2">
                  {status === 'pending' ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Pending
                    </Badge>
                  ) : status === 'processing' ? (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing
                    </Badge>
                  ) : status === 'complete' ? (
                    <Badge
                      variant="success"
                      className="bg-green-100 text-green-800 flex items-center gap-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
