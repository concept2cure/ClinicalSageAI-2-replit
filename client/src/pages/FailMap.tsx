import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react'

// Import visualization components
import { EndpointHeatmap } from '@/components/fail-map/EndpointHeatmap';
import { DoseMisalignmentChart } from '@/components/fail-map/DoseMisalignmentChart';
import { StatisticalPowerChart } from '@/components/fail-map/StatisticalPowerChart';

export default function FailMap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('endpoints');

  useEffect(() => {
    fetch('/api/analytics/failed-trials')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching trial data:', err);
        setLoading(false);
      });
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      );
    }

    switch (activeView) {
      case 'endpoints':
        return <EndpointHeatmap data={data?.endpointData || []} />;
      case 'dosing':
        return <DoseMisalignmentChart data={data?.doseData || []} />;
      case 'power':
        return <StatisticalPowerChart data={data?.powerData || []} />;
      default:
        return <EndpointHeatmap data={data?.endpointData || []} />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">🚨 Real-World Fail Map</h1>
      <p className="text-gray-600 max-w-xl">
        Explore patterns behind 500+ failed clinical trials. Discover how endpoint choices, dose
        design, or statistical underpowering contributed to failure — and avoid repeating history.
      </p>

      <Alert className="bg-amber-50 border-amber-200">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <AlertTitle className="text-amber-800">Learning from Failure</AlertTitle>
        <AlertDescription className="text-amber-700">
          This dashboard aggregates anonymized data from failed clinical trials to help you identify
          common pitfalls in study design, endpoint selection, and statistical approaches.
        </AlertDescription>
      </Alert>

      <div className="flex space-x-2 mb-4">
        <Button
          variant={activeView === 'endpoints' ? 'default' : 'outline'}
          onClick={() => setActiveView('endpoints')}
        >
          Endpoint Failures
        </Button>
        <Button
          variant={activeView === 'dosing' ? 'default' : 'outline'}
          onClick={() => setActiveView('dosing')}
        >
          Dose Misalignment
        </Button>
        <Button
          variant={activeView === 'power' ? 'default' : 'outline'}
          onClick={() => setActiveView('power')}
        >
          Statistical Power
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">{renderContent()}</CardContent>
      </Card>

      <div className="pt-4">
        <Button variant="outline">Download Report PDF</Button>
        <Button className="ml-2" variant="default">
          Request Custom Benchmark
        </Button>
      </div>
    </div>
  );
}
