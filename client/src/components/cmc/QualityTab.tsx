import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TestTube,
  FileSearch,
  BarChart3,
  Package,
  Shield,
  Microscope,
  FlaskConical,
  GitBranch,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import SSTPanel from '../quality/SSTPanel';
import DissolutionPanel from '../quality/DissolutionPanel';
import GenealogyGraph from '../quality/GenealogyGraph';

export default function QualityTab() {
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedTest, setSelectedTest] = useState<string>('');

  const { data: batches = [], isLoading: batchesLoading } = useQuery<any[]>({
    queryKey: ['/api/quality/batches'],
  });

  const { data: tests = [], isLoading: testsLoading } = useQuery<any[]>({
    queryKey: ['/api/quality/tests', selectedBatch],
    enabled: !!selectedBatch,
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<any>({
    queryKey: ['/api/quality/dashboard'],
  });

  useEffect(() => {
    if (batches.length > 0 && !selectedBatch) {
      setSelectedBatch(batches[0].batch_id);
    }
  }, [batches, selectedBatch]);

  // Reset selectedTest when batch changes
  useEffect(() => {
    setSelectedTest(''); // Clear test when batch changes
  }, [selectedBatch]);

  useEffect(() => {
    if (!selectedTest && tests?.length > 0) {
      setSelectedTest(tests[0].test_id);
    }
  }, [tests, selectedTest]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Quality Control Management</h2>
          <p className="text-gray-600">
            Advanced quality systems with template enforcement and automation
          </p>
        </div>
        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
          Production Ready
        </Badge>
      </div>

      {/* Batch Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Batch Selection & Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="loading-batches">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-600">Loading batches...</span>
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="empty-batches">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No batches yet</p>
              <p className="text-sm">Create your first batch to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {batches.map((batch: any) => (
                <Card
                  key={batch.batch_id}
                  className={`cursor-pointer transition-all ${selectedBatch === batch.batch_id ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedBatch(batch.batch_id)}
                  data-testid={`batch-card-${batch.batch_id}`}
                >
                  <CardContent className="p-4">
                    <div className="font-medium">{batch.lot_no || batch.batch_id}</div>
                    <div className="flex justify-between items-center mt-2">
                      <Badge
                        variant={
                          batch.status === 'Released'
                            ? 'default'
                            : batch.status === 'Hold'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {batch.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quality Tabs */}
      <Tabs defaultValue="sst" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="sst" className="flex items-center">
            <TestTube className="w-4 h-4 mr-1" />
            SST Templates
          </TabsTrigger>
          <TabsTrigger value="dissolution" className="flex items-center">
            <FlaskConical className="w-4 h-4 mr-1" />
            Dissolution
          </TabsTrigger>
          <TabsTrigger value="micro" className="flex items-center">
            <Microscope className="w-4 h-4 mr-1" />
            Microbiology
          </TabsTrigger>
          <TabsTrigger value="genealogy" className="flex items-center">
            <GitBranch className="w-4 h-4 mr-1" />
            Genealogy
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center">
            <BarChart3 className="w-4 h-4 mr-1" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="ectd" className="flex items-center">
            <Download className="w-4 h-4 mr-1" />
            eCTD Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sst" className="space-y-4">
          {!selectedTest ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <TestTube className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No tests available</p>
                <p className="text-sm">Select a batch with tests to view SST data.</p>
              </CardContent>
            </Card>
          ) : (
            <SSTPanel testId={selectedTest} />
          )}
        </TabsContent>

        <TabsContent value="dissolution" className="space-y-4">
          {!selectedTest ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <FlaskConical className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No tests available</p>
                <p className="text-sm">Select a batch with tests to view dissolution data.</p>
              </CardContent>
            </Card>
          ) : (
            <DissolutionPanel testId={selectedTest} Q={80} />
          )}
        </TabsContent>

        <TabsContent value="micro" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Microbiology Limits Evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="micro-dosage-form" className="block text-sm font-medium mb-2">Dosage Form</label>
                  <select id="micro-dosage-form" className="w-full border rounded-md p-2" aria-label="Dosage form selection">
                    <option>Oral Solid</option>
                    <option>Topical</option>
                    <option>Non-sterile Aqueous</option>
                    <option>Parenteral</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="micro-region" className="block text-sm font-medium mb-2">Region</label>
                  <select id="micro-region" className="w-full border rounded-md p-2" aria-label="Region selection">
                    <option>GLOBAL</option>
                    <option>USP</option>
                    <option>EP</option>
                    <option>JP</option>
                  </select>
                </div>
              </div>
              <Button
                disabled={!selectedTest}
                onClick={async () => {
                  if (!selectedTest) return;
                  try {
                    const response = await fetch(
                      `/api/quality/tests/${selectedTest}/micro/evaluate`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          dosage_form: 'Oral Solid',
                          region: 'GLOBAL',
                          results: {
                            TAMC: 800,
                            TYMC: 50,
                            organisms: 'E. coli negative',
                            endotoxin: 0.1,
                          },
                        }),
                      }
                    );
                    const result = await response.json();
                    toast({
                      title: `Micro Evaluation: ${result.evaluation?.pass ? 'PASS' : 'FAIL'}`,
                      description: result.evaluation?.reasons?.join('; ') || 'No issues detected',
                      variant: result.evaluation?.pass ? 'default' : 'destructive',
                    });
                  } catch (error) {
                    toast({ title: 'Evaluation Failed', description: 'Microbiology evaluation could not be completed', variant: 'destructive' });
                  }
                }}
              >
                <Microscope className="w-4 h-4 mr-2" />
                Evaluate Micro Limits
              </Button>
              {!selectedTest && (
                <p className="text-sm text-gray-500 mt-2">
                  Select a batch with tests to enable evaluation.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="genealogy" className="space-y-4">
          <GenealogyGraph batchId={selectedBatch} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Analytics Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <div className="flex items-center justify-center py-8" data-testid="loading-dashboard">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                  <span className="text-gray-600">Loading analytics...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg" data-testid="metric-release-rate">
                    <div className="text-2xl font-bold text-green-600">
                      {dashboard?.release_rate !== undefined ? `${dashboard.release_rate}%` : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Release Rate (30d)</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg" data-testid="metric-batches-released">
                    <div className="text-2xl font-bold text-blue-600">
                      {dashboard?.batches?.released ?? 0}
                    </div>
                    <div className="text-sm text-gray-600">Batches Released</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg" data-testid="metric-batches-total">
                    <div className="text-2xl font-bold text-purple-600">
                      {dashboard?.batches?.total ?? 0}
                    </div>
                    <div className="text-sm text-gray-600">Total Batches (30d)</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ectd" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>eCTD Package Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="ectd-region" className="block text-sm font-medium mb-2">Region</label>
                  <select id="ectd-region" className="w-full border rounded-md p-2" aria-label="eCTD target region">
                    <option>FDA</option>
                    <option>EMA</option>
                    <option>PMDA</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ectd-sequence" className="block text-sm font-medium mb-2">Sequence</label>
                  <input id="ectd-sequence" type="text" defaultValue="0001" className="w-full border rounded-md p-2" aria-label="eCTD sequence number" />
                </div>
                <div>
                  <label htmlFor="ectd-operation" className="block text-sm font-medium mb-2">Operation</label>
                  <select id="ectd-operation" className="w-full border rounded-md p-2" aria-label="eCTD operation type">
                    <option>new</option>
                    <option>replace</option>
                    <option>append</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/quality/batches/${selectedBatch}/ectd/push?region=FDA&seq=0001&op=new`,
                      {
                        method: 'POST',
                      }
                    );
                    if (response.ok) {
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ectd_0001_${selectedBatch}.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } else {
                      toast({ title: 'Export Failed', description: 'eCTD package export failed', variant: 'destructive' });
                    }
                  } catch (error) {
                    toast({ title: 'Export Failed', description: 'eCTD package export failed', variant: 'destructive' });
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Generate eCTD Package
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
