import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card';

const StudyPlanner = lazy(() => import('@/components/studyArchitect/StudyPlanner'));
const StudyWorkspace = lazy(() => import('@/components/studyArchitect/StudyWorkspace'));
const StudyDesignAssistant = lazy(() => import('@/components/studyArchitect/StudyDesignAssistant'));

function LoadingFallback() {
  return (
    <Card className="rounded-2xl border-0 shadow-lg">
      <CardContent className="p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-muted-foreground">Loading operations module...</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OperationsTab() {
  return (
    <div className="space-y-6 mt-0">
      <Suspense fallback={<LoadingFallback />}>
        <StudyPlanner />
      </Suspense>
      <Suspense fallback={<LoadingFallback />}>
        <StudyWorkspace />
      </Suspense>
      <Suspense fallback={<LoadingFallback />}>
        <StudyDesignAssistant />
      </Suspense>
    </div>
  );
}
