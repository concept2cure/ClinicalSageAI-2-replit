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

  // In a real implementation, this would use WebSockets or SSE to get updates
  useEffect(() => {
    if (!jobId) return;

    // Simulate generation progress
    const sections = Object.keys(sectionStatuses);
    let currentSectionIndex = 0;

    const simulateProgress = setInterval(() => {
      if (currentSectionIndex >= sections.length) {
        clearInterval(simulateProgress);
        setProgress(100);
        onComplete && onComplete();
        return;
      }

      // Update progress percentage
      const newProgress = Math.round(((currentSectionIndex + 1) / sections.length) * 100);
      setProgress(newProgress);

      // Update section statuses
      const currentSection = sections[currentSectionIndex];
      setSectionStatuses(prev => ({
        ...prev,
        [currentSection]: Math.random() > 0.9 ? 'error' : 'complete',
      }));

      currentSectionIndex++;
    }, 1500);

    return () => clearInterval(simulateProgress);
  }, [jobId]);

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
