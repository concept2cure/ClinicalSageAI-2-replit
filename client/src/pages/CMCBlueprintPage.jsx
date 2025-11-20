import React from 'react';
import { BlueprintGenerator } from '@/components/cmc/BlueprintGenerator';
import { useLocation, Route, Switch } from 'wouter';
import { BlueprintEditor } from '@/components/cmc/BlueprintEditor';
import CmcNavigation from '@/components/cmc-module/CmcNavigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Beaker,
  FlaskConical,
  Factory,
  FileCheck,
  ArrowRightCircle,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LumenAssistantButton } from '@/components/assistant';
import PortfolioDashboard from '../components/cmc/PortfolioDashboard';

function CMCBlueprintPage() {
  const [location] = useLocation();

  // Check if we're on a specific blueprint page
  const match = location.match(/^\/cmc\/blueprints\/([^/]+)$/);
  const blueprintId = match ? match[1] : null;

  // If we're on the main CMC page, show the navigation dashboard
  if (location === '/cmc') {
    return (
      <div className="container mx-auto py-8">
        <CmcNavigation currentBlueprintId={blueprintId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Add a persistent header with quick links to IND Wizard */}
      <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto py-3 px-4 flex justify-between items-center">
          <div className="flex items-center">
            <Beaker className="h-5 w-5 text-primary mr-2" />
            <h1 className="text-lg font-medium">CMC Intelligence™</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Button size="sm" variant="outline" asChild>
              <a href="/ind-wizard/cmc">
                <ArrowRightCircle className="h-4 w-4 mr-2" />
                View in IND Wizard
              </a>
            </Button>
            <LumenAssistantButton variant="outline" size="sm" />
          </div>
        </div>
      </div>

      {blueprintId ? (
        <BlueprintEditor />
      ) : (
        <div className="space-y-6">
          <BlueprintGenerator />

          {/* === Portfolio (cross-submission) === */}
          <div className="container mx-auto py-8">
            <PortfolioDashboard />
          </div>
        </div>
      )}
    </div>
  );
}

// CMC Change Impact Simulator
function ChangeImpactSimulator() {
  return (
    <div className="container mx-auto py-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Change Impact Simulator</h2>
          <p className="text-muted-foreground">
            Evaluate the impact of manufacturing changes on your CMC strategy
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Impact Analysis</CardTitle>
            <CardDescription>
              Simulate the regulatory impact of changes to your manufacturing process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed">
              <div className="text-center">
                <FlaskConical className="h-12 w-12 mx-auto mb-2 text-muted-foreground/70" />
                <p className="text-muted-foreground mb-2">
                  Change Impact Simulator is available in the Enterprise tier.
                </p>
                <Button variant="outline" size="sm">
                  Upgrade to Enterprise
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Manufacturing Tuner module
function ManufacturingTuner() {
  return (
    <div className="container mx-auto py-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Manufacturing Tuner</h2>
          <p className="text-muted-foreground">
            Optimize manufacturing parameters for your drug product
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parameter Optimization</CardTitle>
            <CardDescription>
              Fine-tune manufacturing settings to enhance product quality and process efficiency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed">
              <div className="text-center">
                <Factory className="h-12 w-12 mx-auto mb-2 text-muted-foreground/70" />
                <p className="text-muted-foreground mb-2">
                  Manufacturing Tuner is available in the Enterprise tier.
                </p>
                <Button variant="outline" size="sm">
                  Upgrade to Enterprise
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CMCRoutes() {
  return (
    <Switch>
      <Route path="/cmc" component={CMCBlueprintPage} />
      <Route path="/cmc/blueprints/:id" component={CMCBlueprintPage} />
      <Route path="/cmc/impact-simulator/:id" component={ChangeImpactSimulator} />
      <Route path="/cmc/manufacturing/:id" component={ManufacturingTuner} />
    </Switch>
  );
}
