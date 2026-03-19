import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Filter, Laptop, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Sample data for demonstration purposes
const STUDY_FAILURES = [
  {
    id: 1,
    study: 'NCT0034256',
    indication: "Alzheimer's Disease",
    phase: 'Phase 3',
    reason: 'Efficacy',
    details: 'Failed to meet primary endpoint (ADAS-Cog)',
  },
  {
    id: 2,
    study: 'NCT0089145',
    indication: "Parkinson's Disease",
    phase: 'Phase 2',
    reason: 'Safety',
    details: 'Hepatotoxicity concerns in 12% of subjects',
  },
  {
    id: 3,
    study: 'NCT0076523',
    indication: 'Major Depression',
    phase: 'Phase 3',
    reason: 'Efficacy',
    details: 'High placebo response (38%) masked treatment effect',
  },
  {
    id: 4,
    study: 'NCT0022781',
    indication: 'Rheumatoid Arthritis',
    phase: 'Phase 3',
    reason: 'Safety',
    details: 'Increased risk of serious infections',
  },
  {
    id: 5,
    study: 'NCT0045922',
    indication: 'Type 2 Diabetes',
    phase: 'Phase 2',
    reason: 'Efficacy',
    details: 'Insufficient glycemic control vs standard of care',
  },
  {
    id: 6,
    study: 'NCT0091234',
    indication: 'Asthma',
    phase: 'Phase 3',
    reason: 'Operational',
    details: 'High dropout rate (37%) compromised statistical power',
  },
  {
    id: 7,
    study: 'NCT0087654',
    indication: 'Psoriasis',
    phase: 'Phase 2',
    reason: 'Efficacy',
    details: 'Failed to show dose response relationship',
  },
  {
    id: 8,
    study: 'NCT0065432',
    indication: 'Heart Failure',
    phase: 'Phase 3',
    reason: 'Safety',
    details: 'Increased cardiovascular events in treatment arm',
  },
  {
    id: 9,
    study: 'NCT0054321',
    indication: 'COPD',
    phase: 'Phase 3',
    reason: 'Efficacy',
    details: 'Failed to improve FEV1 compared to existing therapy',
  },
  {
    id: 10,
    study: 'NCT0074123',
    indication: 'Insomnia',
    phase: 'Phase 2',
    reason: 'Efficacy',
    details: 'Marginal improvement in sleep latency (p=0.08)',
  },
];

// Failure reasons with corresponding colors for the heatmap
const FAILURE_REASONS = [
  { id: 'efficacy', label: 'Efficacy', color: '#ef4444' },
  { id: 'safety', label: 'Safety', color: '#f97316' },
  { id: 'pk', label: 'PK/Bioavailability', color: '#f59e0b' },
  { id: 'operational', label: 'Operational', color: '#84cc16' },
  { id: 'enrollment', label: 'Enrollment', color: '#788c5d' },
  { id: 'other', label: 'Other', color: '#d97757' },
];

// Therapeutic areas for the filter
const THERAPEUTIC_AREAS = [
  'All Areas',
  'Neurology',
  'Psychiatry',
  'Immunology',
  'Oncology',
  'Cardiovascular',
  'Metabolic',
  'Respiratory',
  'Dermatology',
];

const PHASES = ['All Phases', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export default function FailureMapVisualizer() {
  const [selectedTab, setSelectedTab] = useState('heatmap');
  const [selectedArea, setSelectedArea] = useState('All Areas');
  const [selectedPhase, setSelectedPhase] = useState('All Phases');

  const filteredFailures = STUDY_FAILURES.filter(failure => {
    const areaMatch =
      selectedArea === 'All Areas' || mapIndicationToArea(failure.indication) === selectedArea;
    const phaseMatch = selectedPhase === 'All Phases' || failure.phase === selectedPhase;
    return areaMatch && phaseMatch;
  });

  // Helper function to map indications to therapeutic areas for filtering
  function mapIndicationToArea(indication: string): string {
    const mapping: Record<string, string> = {
      "Alzheimer's Disease": 'Neurology',
      "Parkinson's Disease": 'Neurology',
      'Major Depression': 'Psychiatry',
      'Rheumatoid Arthritis': 'Immunology',
      'Type 2 Diabetes': 'Metabolic',
      Asthma: 'Respiratory',
      Psoriasis: 'Dermatology',
      'Heart Failure': 'Cardiovascular',
      COPD: 'Respiratory',
      Insomnia: 'Neurology',
    };

    return mapping[indication] || 'Other';
  }

  // Function to create a heatmap data structure
  function getHeatmapData() {
    const phaseFailures = ['Phase 1', 'Phase 2', 'Phase 3'].map(phase => {
      return {
        phase,
        reasons: FAILURE_REASONS.map(reason => {
          const count = filteredFailures.filter(
            f => f.phase === phase && f.reason.toLowerCase() === reason.id
          ).length;

          return {
            ...reason,
            count,
          };
        }),
      };
    });

    return phaseFailures;
  }

  const heatmapData = getHeatmapData();

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center">
          <AlertTriangle className="mr-2 h-5 w-5" />
          Study Failure Analysis
        </CardTitle>
        <CardDescription>
          Visualize patterns in clinical trial failures across phases
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-grow pb-0">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Therapeutic Area</label>
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger>
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {THERAPEUTIC_AREAS.map(area => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Phase</label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger>
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map(phase => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="list">Study List</TabsTrigger>
          </TabsList>

          <TabsContent value="heatmap" className="space-y-4">
            <div className="overflow-x-auto">
              <div className="mt-4">
                <div className="flex items-end mb-2">
                  <div className="w-28 text-sm font-medium">Phase / Reason</div>
                  <div className="flex-1 flex">
                    {FAILURE_REASONS.map(reason => (
                      <div key={reason.id} className="flex-1 text-center px-1 text-xs">
                        {reason.label}
                      </div>
                    ))}
                  </div>
                </div>

                {heatmapData.map(row => (
                  <div key={row.phase} className="flex items-center mb-2">
                    <div className="w-28 text-sm font-medium">{row.phase}</div>
                    <div className="flex-1 flex">
                      {row.reasons.map(cell => (
                        <div
                          key={cell.id}
                          className="flex-1 text-center mx-1 py-3 rounded font-medium text-sm flex items-center justify-center text-white"
                          style={{
                            backgroundColor: cell.count === 0 ? '#f4f3ee' : cell.color,
                            opacity:
                              cell.count === 0 ? 0.5 : 0.35 + Math.min(cell.count / 3, 1) * 0.65,
                            color: cell.count === 0 ? '#b0aea5' : 'white',
                          }}
                        >
                          {cell.count}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="text-xs text-gray-500">Showing {filteredFailures.length} studies</div>

              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                <span>Export</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="list" className="space-y-4">
            <div className="rounded-md border overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Study
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Indication
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Phase
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Failure Reason
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFailures.map(failure => (
                    <tr key={failure.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-blue-600">
                        {failure.study}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                        {failure.indication}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                        {failure.phase}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <span
                          className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                          style={{
                            backgroundColor: getFailureColor(failure.reason),
                            color: 'white',
                            padding: '0.125rem 0.5rem',
                          }}
                        >
                          {failure.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredFailures.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                <h3 className="text-lg font-medium text-gray-900">No failures match filters</h3>
                <p className="mt-1 text-sm">Try changing your filter criteria</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Helper function to get color for a failure reason
function getFailureColor(reason: string): string {
  const reasonLower = reason.toLowerCase();
  const match = FAILURE_REASONS.find(r => r.id === reasonLower);
  return match ? match.color : '#d97757'; // Default to blue if no match
}
