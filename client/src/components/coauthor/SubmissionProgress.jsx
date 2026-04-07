import React, { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import indWizardService from '@/services/indWizardService';

export default function SubmissionProgress({ submissionId }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const { percentComplete } = await indWizardService.getSubmissionStatus(submissionId);
        setProgress(percentComplete);
      } catch (error) {
        console.error('Error fetching submission progress:', error);
      }
    };

    // Initial fetch
    fetchProgress();

    // Set up interval for polling
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [submissionId]);

  return (
    <div className="mb-4">
      <h4 className="font-semibold mb-2">Submission Progress</h4>
      <Progress value={progress} className="w-full h-2" />
      <p className="text-sm text-gray-600 mt-1">{progress}% complete</p>
    </div>
  );
}
