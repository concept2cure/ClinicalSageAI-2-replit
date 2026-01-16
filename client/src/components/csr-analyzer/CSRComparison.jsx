import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Database, Search, Filter, ArrowLeftRight, ArrowRight, FileText, List, BarChart2, Download, Table, Layers, Copy, Dna } from 'lucide-react'

// Sample CSR data for comparison
const csrOptions = [
  {
    id: 'CSR-2023-A109',
    title: 'Phase 2b Efficacy Study in Metabolic Disease',
    indication: 'Type 2 Diabetes',
    phase: 'Phase 2b',
    sponsor: 'PharmaCorp, Inc.',
  },
  {
    id: 'CSR-2023-B241',
    title: 'Phase 1 PK/PD Study in Healthy Volunteers',
    indication: 'Hypertension',
    phase: 'Phase 1',
    sponsor: 'BioScience Labs',
  },
  {
    id: 'CSR-2023-C187',
    title: 'Phase 3 Pivotal Trial for Oncology Indication',
    indication: 'Non-small Cell Lung Cancer',
    phase: 'Phase 3',
    sponsor: 'Oncovita Therapeutics',
  },
  {
    id: 'CSR-2023-D023',
    title: 'Phase 2a Dose-Finding Study in CNS Disorder',
    indication: 'Major Depressive Disorder',
    phase: 'Phase 2a',
    sponsor: 'NeuroCure Pharmaceuticals',
  },
  {
    id: 'CSR-2023-E305',
    title: 'Phase 1b Safety Extension Study',
    indication: 'Rheumatoid Arthritis',
    phase: 'Phase 1b',
    sponsor: 'ImmunoGene Therapies',
  },
];

// Sample comparison data
const comparisonData = {
  'Study Design': {
    'CSR-2023-C187':
      'Randomized, open-label, active-controlled, multicenter study with 1:1 allocation',
    'CSR-2023-D023':
      'Randomized, double-blind, placebo-controlled, dose-ranging study with 1:1:1:1 allocation',
  },
  'Primary Endpoint': {
    'CSR-2023-C187': 'Overall survival; progression-free survival',
    'CSR-2023-D023': 'Change from baseline in MADRS total score at Week 6',
  },
  'Secondary Endpoints': {
    'CSR-2023-C187':
      'Objective response rate, duration of response, disease control rate, quality of life (EORTC QLQ-C30)',
    'CSR-2023-D023':
      'Change from baseline in HAM-D, CGI-S, SDS scores; proportion of responders (≥50% reduction in MADRS)',
  },
  'Sample Size': {
    'CSR-2023-C187': '814 subjects (407 per arm)',
    'CSR-2023-D023': '216 subjects (54 per arm)',
  },
  'Inclusion Criteria': {
    'CSR-2023-C187':
      'Adults ≥18 years with histologically confirmed Stage IIIB/IV NSCLC, ECOG PS 0-1, measurable disease per RECIST v1.1',
    'CSR-2023-D023':
      'Adults 18-65 years with DSM-5 diagnosis of MDD, MADRS ≥ 26, CGI-S ≥ 4, current episode ≥ 8 weeks',
  },
  'Statistical Methods': {
    'CSR-2023-C187':
      'Cox proportional hazards model for OS/PFS; logistic regression for response rates; MMRM for QoL',
    'CSR-2023-D023':
      'MMRM for continuous endpoints; logistic regression for binary endpoints; LOCF for missing data',
  },
  'Safety Assessment': {
    'CSR-2023-C187':
      'CTCAE v5.0 for AE classification; independent DSMB; enhanced monitoring for immune-related AEs',
    'CSR-2023-D023':
      'C-SSRS for suicidality; ECG monitoring; clinical labs; physical examination; AE monitoring',
  },
  'Efficacy Results': {
    'CSR-2023-C187':
      'Median OS: 18.4 vs 13.6 months (HR=0.73, 95% CI: 0.62-0.86, p=0.0002); Median PFS: 7.9 vs 5.4 months (HR=0.65, p<0.0001)',
    'CSR-2023-D023':
      'LS mean change in MADRS: -14.2 (placebo: -8.7), p=0.0012; Response rate: 42% vs 25% (placebo), p=0.003',
  },
  'Safety Results': {
    'CSR-2023-C187':
      'Treatment-related AEs: 87.2% vs 81.5%; Grade ≥3 TRAEs: 32.4% vs 36.1%; Treatment discontinuation due to AEs: 11.2% vs 9.8%',
    'CSR-2023-D023':
      'Treatment-emergent AEs: 68.5% vs 62.1% (placebo); Serious AEs: 3.1% vs 2.8% (placebo); No treatment-related deaths',
  },
};

const CSRComparison = () => {
  const [selectedCSRs, setSelectedCSRs] = useState(['CSR-2023-C187', 'CSR-2023-D023']);
  const [searchTerm, setSearchTerm] = useState('');

  const addCSR = csrId => {
    if (selectedCSRs.length < 3 && !selectedCSRs.includes(csrId)) {
      setSelectedCSRs([...selectedCSRs, csrId]);
    }
  };

  const removeCSR = csrId => {
    setSelectedCSRs(selectedCSRs.filter(id => id !== csrId));
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>CSR Comparison</CardTitle>
              <CardDescription>
                Compare key elements across multiple clinical study reports
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1">
                <Table className="h-4 w-4" />
                Export Comparison
              </Button>
              <Button size="sm" className="gap-1">
                <Download className="h-4 w-4" />
                Generate Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* CSR Selection */}
            <div className="space-y-3">
              <div className="font-medium">Select CSRs to Compare</div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-grow relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search CSRs by ID or title..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>

                <Select disabled={selectedCSRs.length >= 3}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Add CSR to comparison" />
                  </SelectTrigger>
                  <SelectContent>
                    {csrOptions
                      .filter(csr => !selectedCSRs.includes(csr.id))
                      .map(csr => (
                        <SelectItem key={csr.id} value={csr.id} onClick={() => addCSR(csr.id)}>
                          {csr.id} - {csr.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selected CSRs */}
            <div className="space-y-3">
              <div className="font-medium">Selected CSRs</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {selectedCSRs.map(csrId => {
                  const csr = csrOptions.find(c => c.id === csrId);
                  if (!csr) return null;

                  return (
                    <Card key={csrId} className="shadow-sm">
                      <CardHeader className="p-3 pb-2">
                        <div className="flex justify-between items-start">
                          <div className="text-sm font-medium">{csr.id}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeCSR(csrId)}
                          >
                            <div className="text-red-500 text-lg">×</div>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="font-medium line-clamp-1 mb-1">{csr.title}</div>
                        <div className="text-sm text-gray-500">{csr.sponsor}</div>
                        <div className="flex mt-2 gap-2">
                          <Badge variant="outline">{csr.phase}</Badge>
                          <Badge variant="secondary">{csr.indication}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {selectedCSRs.length < 3 && (
                  <div className="border border-dashed rounded-lg flex items-center justify-center p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="text-center">
                      <div className="text-gray-400 mb-1">Add another CSR</div>
                      <div className="text-xs text-gray-400">
                        {3 - selectedCSRs.length} more allowed
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comparison Table */}
            {selectedCSRs.length > 1 && (
              <div className="border rounded-md overflow-hidden">
                <div className="bg-gray-50 p-4 border-b">
                  <div className="font-medium">Comparison Analysis</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="py-3 px-4 text-left font-medium">Element</th>
                        {selectedCSRs.map(csrId => {
                          const csr = csrOptions.find(c => c.id === csrId);
                          return (
                            <th key={csrId} className="py-3 px-4 text-left font-medium">
                              {csr?.id}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparisonData).map(([element, data], i) => (
                        <tr key={i} className="border-b">
                          <td className="py-3 px-4 font-medium align-top">{element}</td>
                          {selectedCSRs.map(csrId => (
                            <td key={csrId} className="py-3 px-4 align-top">
                              {data[csrId] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Comparison Visualizations */}
            {selectedCSRs.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Study Design Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md">
                      <div className="text-center">
                        <ArrowLeftRight className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Study Design Comparison Chart</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Endpoint Alignment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-center justify-center bg-gray-50 rounded-md">
                      <div className="text-center">
                        <BarChart2 className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Endpoint Alignment Visualization</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CSRComparison;
