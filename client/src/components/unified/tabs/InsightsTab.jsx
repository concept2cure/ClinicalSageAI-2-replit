import { lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const CSRAnalyticsDashboard = lazy(() => import('@/components/CSRAnalyticsDashboard'));
const CSRAnalyticsTab = lazy(() => import('@/components/CSRAnalyticsTab'));
const CSRSemanticAnalyzer = lazy(() => import('@/components/CSRSemanticAnalyzer'));
const CSRBusinessValueDashboard = lazy(() => import('@/components/CSRBusinessValueDashboard'));
const CSRValuePropositionTab = lazy(() => import('@/components/CSRValuePropositionTab'));
const PhaseJourneyNavigator = lazy(() => import('@/components/ForesightAI/PhaseJourneyNavigator'));
const CrossSpeciesPKPDModule = lazy(() => import('@/components/ForesightAI/CrossSpeciesPKPDModule'));
const DoseEscalationModule = lazy(() => import('@/components/ForesightAI/DoseEscalationModule'));
const INDNarrativeModule = lazy(() => import('@/components/ForesightAI/INDNarrativeModule'));

function LoadingFallback() {
  return (
    <Card className="rounded-2xl border-0 shadow-lg">
      <CardContent className="p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <p className="text-sm text-muted-foreground">Loading analytics module...</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InsightsTab() {
  return (
    <div className="space-y-6 mt-0">
      <Tabs defaultValue="csr-analytics" className="w-full">
        <TabsList className="grid grid-cols-5 gap-2 mb-6 bg-gray-100/50 dark:bg-gray-800/50 p-1.5 rounded-xl">
          <TabsTrigger value="csr-analytics" className="rounded-lg" data-testid="tab-csr-analytics">
            CSR Analytics
          </TabsTrigger>
          <TabsTrigger value="semantic-analysis" className="rounded-lg" data-testid="tab-semantic">
            Semantic Analysis
          </TabsTrigger>
          <TabsTrigger value="business-value" className="rounded-lg" data-testid="tab-business">
            Business Value
          </TabsTrigger>
          <TabsTrigger value="foresight-ai" className="rounded-lg" data-testid="tab-foresight">
            AnA Predictions
          </TabsTrigger>
          <TabsTrigger value="dose-escalation" className="rounded-lg" data-testid="tab-dose">
            Dose Escalation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csr-analytics">
          <Suspense fallback={<LoadingFallback />}>
            <CSRAnalyticsDashboard />
            <CSRAnalyticsTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="semantic-analysis">
          <Suspense fallback={<LoadingFallback />}>
            <CSRSemanticAnalyzer />
          </Suspense>
        </TabsContent>

        <TabsContent value="business-value">
          <Suspense fallback={<LoadingFallback />}>
            <CSRBusinessValueDashboard />
            <CSRValuePropositionTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="foresight-ai">
          <Suspense fallback={<LoadingFallback />}>
            <PhaseJourneyNavigator />
            <CrossSpeciesPKPDModule />
          </Suspense>
        </TabsContent>

        <TabsContent value="dose-escalation">
          <Suspense fallback={<LoadingFallback />}>
            <DoseEscalationModule />
            <INDNarrativeModule />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
