// IndSequenceManager.jsx – sequence planner with QC gating + region selection
// Features: document diffing, module rules, audit capture, validation preview before submission lock
// Multi-region profile support for FDA, EMA, PMDA, and Health Canada

import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  FileText, AlertTriangle, ArrowRight, Package, CheckCircle, XCircle, Clock, ChevronRight, Globe } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REGIONS = ['FDA', 'EMA', 'PMDA'];

export default function IndSequenceManager() {
  const [docs, setDocs] = useState([]);
  const [lastSeq, setLastSeq] = useState('0000');
  const [plan, setPlan] = useState([]);
  const [errors, setErrors] = useState([]);
  const [existingSequences, setExistingSequences] = useState([]);
  const [loadingSequences, setLoadingSequences] = useState(true);
  const [region, setRegion] = useState('FDA');
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Fetch documents for new sequence planning
    Promise.all([
      fetch('/api/ind/last-sequence').then(r => r.json()),
      fetch('/api/documents?status=approved').then(r => r.json()),
    ]).then(([seq, docs]) => {
      setLastSeq(seq || '0000');
      setDocs(docs);
      const result = docs.map(doc => analyzeDoc(doc));
      setPlan(result);
      const missing = result.filter(r => !r.module || r.errors.length > 0);
      if (missing.length) setErrors(missing);
    });

    // Fetch existing sequences
    fetch('/api/ind/sequences')
      .then(r => r.json())
      .then(sequences => {
        setExistingSequences(sequences || []);
        setLoadingSequences(false);
      })
      .catch(err => {
        console.error('Failed to load sequences:', err);
        setLoadingSequences(false);
      });
  }, []);

  const analyzeDoc = doc => {
    const meta = doc.metadata || {}; // JSONSchema enforced structure
    const mod = meta.module_slot || inferModule(doc.title);
    const lifecycle = doc.last_submitted_version ? 'replace' : 'new';
    const errs = [];
    if (!mod) errs.push('Missing module slot');
    if (!doc.version || !meta.dct || !meta.ctd_type) errs.push('Missing metadata');

    // PDF QC validation check
    const isPdf = doc.path?.toLowerCase().endsWith('.pdf');
    if (isPdf && (!doc.qc_status || doc.qc_status !== 'passed')) {
      errs.push('PDF QC not passed');
    }

    return {
      id: doc.id,
      title: doc.title,
      version: doc.version,
      module: mod,
      operation: lifecycle,
      errors: errs,
      qc_status: doc.qc_status || 'pending',
    };
  };

  const submitPlan = () => {
    fetch('/api/ind/sequence/create-region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base: lastSeq, region, plan }),
    })
      .then(r => r.json())
      .then(res => setLocation(`/portal/ind/${res.sequence}`));
  };

  return (
    <div className="max-w-5xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-1">IND Sequence Manager</h1>
      <p className="text-sm text-gray-500 mb-6">FDA eCTD submission sequence management</p>

      <Tabs defaultValue="existing">
        <TabsList className="mb-6">
          <TabsTrigger value="existing">Existing Sequences</TabsTrigger>
          <TabsTrigger value="new">Create New Sequence</TabsTrigger>
        </TabsList>

        <TabsContent value="existing">
          <Card>
            <CardHeader>
              <CardTitle>IND Sequences</CardTitle>
              <CardDescription>View and manage your IND submission sequences</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSequences ? (
                // Loading state with skeletons
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-md"
                    >
                      <Skeleton className="h-8 w-8 rounded-full mr-3" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : existingSequences.length > 0 ? (
                // List of sequences
                <div className="space-y-3">
                  {existingSequences.map(seq => (
                    <div
                      key={seq.id}
                      className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md cursor-pointer transition-colors"
                      onClick={() => setLocation(`/portal/ind/${seq.id}`)}
                    >
                      <div className="flex items-center">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full mr-3">
                          <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            Sequence {seq.sequence_id || seq.id}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {seq.title || 'Untitled Sequence'}
                            {seq.created_at && (
                              <span> · {new Date(seq.created_at).toLocaleDateString()}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {/* Status badge based on sequence status */}
                        {seq.submission_status?.includes('submitted') ? (
                          <Badge className="mr-3 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Submitted
                          </Badge>
                        ) : seq.validation_status === 'valid' ? (
                          <Badge className="mr-3 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Validated
                          </Badge>
                        ) : seq.validation_status === 'invalid' ? (
                          <Badge className="mr-3 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50">
                            <XCircle className="h-3 w-3 mr-1" />
                            Invalid
                          </Badge>
                        ) : (
                          <Badge className="mr-3 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">
                            <Clock className="h-3 w-3 mr-1" />
                            Draft
                          </Badge>
                        )}
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Empty state
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-md">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    No Sequences Found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    You haven't created any IND sequences yet.
                  </p>
                  <Button onClick={() => document.querySelector('button[value="new"]').click()}>
                    Create Your First Sequence
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle>Create New Sequence</CardTitle>
              <CardDescription>
                Next eCTD sequence: <span className="font-mono">{lastSeq}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-300 p-3 rounded border border-red-300 mb-4">
                  <AlertTriangle className="inline mr-2" size={16} /> Validation failed for{' '}
                  {errors.length} document(s). Fix before continuing.
                </div>
              )}

              {/* Region Selector */}
              <div className="flex items-center gap-3 mb-6">
                <Globe size={16} className="text-gray-500" />
                <label htmlFor="region" className="text-sm">
                  Target Region
                </label>
                <Select value={region} onValueChange={setRegion} disabled={errors.length > 0}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select Region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map(r => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y">
                {plan.map(p => (
                  <div key={p.id} className="flex items-center px-4 py-3 text-sm">
                    <FileText className="text-gray-400" size={16} />
                    <span className="ml-2 font-medium flex-1 truncate">{p.title}</span>
                    <span className="w-24 text-xs text-gray-500">v{p.version}</span>
                    <span className="w-24 font-mono text-gray-700 dark:text-gray-300">
                      {p.module || '—'}
                    </span>
                    <span className="w-20 capitalize text-gray-500">{p.operation}</span>

                    {/* QC Status Badge */}
                    {p.qc_status && (
                      <span
                        className={`mr-3 text-xs px-2 py-0.5 rounded ${
                          p.qc_status === 'passed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : p.qc_status === 'failed'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {p.qc_status === 'passed'
                          ? 'QC ✓'
                          : p.qc_status === 'failed'
                            ? 'QC ✗'
                            : 'QC ?'}
                      </span>
                    )}

                    {p.errors.length > 0 && (
                      <span className="text-red-500 text-xs">{p.errors[0]}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                disabled={errors.length > 0}
                onClick={submitPlan}
                className="flex items-center gap-2"
              >
                Finalize Sequence Plan <ArrowRight size={16} />
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function inferModule(title) {
  const t = title.toLowerCase();
  if (t.includes('protocol')) return 'm5.3.1';
  if (t.includes('cmc') || t.includes('drug product')) return 'm3.2';
  if (t.includes('overview')) return 'm2';
  if (t.includes('brochure')) return 'm1.3';
  if (t.includes('1571')) return 'm1.1';
  return null;
}
