import { useEffect, useState, useMemo, useCallback } from 'react';
import HeatMap from 'react-heatmap-grid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Download } from 'lucide-react';

// TypeScript type definitions - resolves type issues
type HeatMapProps = {
  xLabels: string[];
  yLabels: string[];
  data: number[][];
  squares?: boolean;
  onClick?: (x: number, y: number) => void;
  cellStyle?: (background: any, value: any, x: number, y: number) => React.CSSProperties;
  cellRender?: (value: any) => React.ReactNode;
  xLabelsStyle?: (index: number) => React.CSSProperties;
  yLabelsStyle?: (index: number) => React.CSSProperties;
};

interface EndpointData {
  indication: string;
  phase: string;
  type: string; // 'Primary' or 'Secondary'
  count: number;
  per100: number;
}

interface EndpointFrequencyHeatmapProps {
  indication?: string;
  phase?: string;
}

export default function EndpointFrequencyHeatmap({
  indication,
  phase,
}: EndpointFrequencyHeatmapProps) {
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<number[][]>([]);
  const [phases, setPhases] = useState<string[]>([]);
  const [indications, setIndications] = useState<string[]>([]);
  const [viewType, setViewType] = useState('per100'); // 'per100' or 'raw'
  const [endpointType, setEndpointType] = useState('All'); // 'Primary', 'Secondary', 'All'
  const [rawData, setRawData] = useState<EndpointData[]>([]);

  useEffect(() => {
    const fetchHeatmap = async () => {
      setLoading(true);
      try {
        // Build URL with query parameters if provided
        const url = new URL('/api/endpoint/frequency-heatmap', window.location.origin);
        if (indication) url.searchParams.append('indication', indication);
        if (phase) url.searchParams.append('phase', phase);

        const response = await fetch(url.toString());
        const data: EndpointData[] = await response.json();

        // Store raw data for filtering later
        setRawData(data);

        // Process the data based on current filters
        processData(data);
      } catch (error) {
        console.error('Error fetching heatmap data:', error);
        setLoading(false);
      }
    };

    fetchHeatmap();
  }, [indication, phase]);

  // Process data when filter settings change - using memoization
  useEffect(() => {
    if (rawData.length > 0) {
      // Debounce processing for better performance under rapid changes
      const timeoutId = setTimeout(() => {
        processData(rawData);
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [viewType, endpointType, rawData]);

  // Optimized processor function with memoization for performance
  const processData = useCallback(
    (data: EndpointData[]) => {
      // Filter by endpoint type if specified
      const filtered = data.filter(row => endpointType === 'All' || row.type === endpointType);

      // Extract unique phases and indications using Array.from for IE compatibility
      const uniquePhases = Array.from(new Set(filtered.map(row => row.phase))).sort();
      const uniqueIndications = Array.from(new Set(filtered.map(row => row.indication))).sort();

      // Create a fast lookup map for phase/indication combinations to avoid repeated filtering
      const rowsByCombo = filtered.reduce((acc: Record<string, EndpointData[]>, row) => {
        const key = `${row.indication}|${row.phase}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      }, {});

      // Build matrix based on the selected view type
      const matrix = uniqueIndications.map(indication =>
        uniquePhases.map(phase => {
          const key = `${indication}|${phase}`;
          const rows = rowsByCombo[key] || [];

          if (rows.length === 0) return 0;

          // Sum up values based on view type
          if (viewType === 'per100') {
            // Average the per100 values for all matching rows
            return rows.reduce((sum, row) => sum + row.per100, 0) / rows.length;
          } else {
            // Sum the raw counts
            return rows.reduce((sum, row) => sum + row.count, 0);
          }
        })
      );

      setPhases(uniquePhases);
      setIndications(uniqueIndications);
      setHeatmapData(matrix);
      setLoading(false);
    },
    [endpointType, viewType]
  );

  const handleCellClick = (x: number, y: number) => {
    const phase = phases[x];
    const indication = indications[y];
    const value = heatmapData[y][x];

    // Here you could implement navigation, filtering, or a modal
    // For now we'll just log to console
    console.log(
      `Selected: ${indication} × ${phase} - Value: ${value} ${viewType === 'per100' ? 'per 100' : 'count'}`
    );

    // Example of what you might do:
    // if (onCellClick) {
    //   onCellClick({ indication, phase, endpointType, value });
    // }
  };

  const exportCSV = () => {
    // Create header row
    const rows = [
      ['Indication/Phase', ...phases],
      ...indications.map((indication, i) => [
        indication,
        ...heatmapData[i].map(val => (viewType === 'per100' ? val.toFixed(1) : val.toFixed(0))),
      ]),
    ];

    // Convert to CSV
    const csv = rows.map(r => r.join(',')).join('\n');

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `endpoint_heatmap_${endpointType.toLowerCase()}_${viewType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Find the maximum value to normalize the heatmap colors
  const maxValue =
    heatmapData.length > 0
      ? Math.max(...heatmapData.flatMap(row => row))
      : viewType === 'per100'
        ? 100
        : 50;

  if (loading) {
    return (
      <Card className="w-full h-[400px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Endpoint Frequency Heatmap</CardTitle>
          <CardDescription>
            Visualizing endpoint usage across phases and indications
          </CardDescription>
        </div>
        <Button onClick={exportCSV} variant="outline" className="ml-auto" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-3">
          View usage of{' '}
          {endpointType === 'All' ? 'all endpoints' : endpointType.toLowerCase() + ' endpoints'} by
          indication and trial phase (
          {viewType === 'per100' ? 'normalized per 100 trials' : 'raw count'}).
        </p>

        <div className="flex items-center gap-4 mb-4">
          <Button
            onClick={() => setViewType(viewType === 'per100' ? 'raw' : 'per100')}
            variant="outline"
            className={viewType === 'per100' ? 'bg-blue-100' : ''}
          >
            {viewType === 'per100' ? '✓ Per 100 Trials' : 'Raw Count'}
          </Button>
          <Button
            onClick={() => setEndpointType('All')}
            variant="outline"
            className={endpointType === 'All' ? 'bg-blue-100' : ''}
          >
            All Endpoints
          </Button>
          <Button
            onClick={() => setEndpointType('Primary')}
            variant="outline"
            className={endpointType === 'Primary' ? 'bg-blue-100' : ''}
          >
            Primary Only
          </Button>
          <Button
            onClick={() => setEndpointType('Secondary')}
            variant="outline"
            className={endpointType === 'Secondary' ? 'bg-blue-100' : ''}
          >
            Secondary Only
          </Button>
        </div>

        {heatmapData.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <HeatMap
              xLabels={phases}
              yLabels={indications}
              data={heatmapData}
              squares
              onClick={handleCellClick}
              cellStyle={(background, value) => {
                // Normalize color intensity based on view type
                const normalizedValue =
                  viewType === 'per100' ? Math.min(value / 100, 1) : Math.min(value / maxValue, 1);

                return {
                  background: `rgba(66, 0, 255, ${normalizedValue})`,
                  fontSize: '12px',
                  color: normalizedValue > 0.5 ? '#fff' : '#000',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                };
              }}
              cellRender={value => (
                <div>{viewType === 'per100' ? value.toFixed(1) : value.toFixed(0)}</div>
              )}
              xLabelsStyle={() => ({
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                color: '#666',
              })}
              yLabelsStyle={() => ({
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                color: '#666',
                paddingRight: '10px',
              })}
            />
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500 italic">
            No data available for the selected filters
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500">
          <p className="font-semibold">Understanding the visualization:</p>
          <p>
            •{' '}
            {viewType === 'per100'
              ? 'Values show endpoint frequency per 100 trials'
              : 'Values show raw count of endpoints'}
          </p>
          <p>
            • Currently showing:{' '}
            {endpointType === 'All' ? 'All endpoint types' : `${endpointType} endpoints only`}
          </p>
          <p>• Darker blue indicates higher frequency</p>
          <p>• Click on cells to explore specific phase/indication combinations</p>
        </div>
      </CardContent>
    </Card>
  );
}
