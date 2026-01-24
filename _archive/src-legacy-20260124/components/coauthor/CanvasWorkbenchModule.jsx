import React from 'react';
import SubmissionProgress from './SubmissionProgress';
import CanvasSidebar from './CanvasSidebar';
import SubmissionDashboardPanel from './SubmissionDashboardPanel';
import AnnotationToolbar from './AnnotationToolbar';
import SectionReorder from './SectionReorder';

export default function CanvasWorkbenchModule({ submissionId }) {
  return (
    <div className="flex h-full">
      <CanvasSidebar submissionId={submissionId} />
      <div className="flex-1 p-4 relative">
        <SubmissionProgress submissionId={submissionId} />
        <SectionReorder submissionId={submissionId} />
        <AnnotationToolbar submissionId={submissionId} />
        <SubmissionDashboardPanel submissionId={submissionId} />
      </div>
    </div>
  );
}
