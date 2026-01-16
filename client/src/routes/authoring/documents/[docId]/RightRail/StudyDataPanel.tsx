import React, { useMemo, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Table as TableIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SmartDataInsertPayload } from '../../extensions/SmartData';
import { insertTableFromData } from '@/components/editor/commands/insertTableFromData';
import type { Editor } from '@tiptap/react';
import { DATASET_FOCUS_EVENT } from '@/utils/events/RightRailEvents';
import { useDependencyContext } from '@/context/DependencyContext';

type StudyMetric = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  context?: string;
  recordId: string;
  dataKey?: string;
  sourceLabel: string;
  confidence: number;
};

type StudyDataCategory = {
  id: string;
  title: string;
  description: string;
  source: string;
  metrics: StudyMetric[];
};

interface StudyDataPanelProps {
  documentId: string;
  productName: string;
  onDatasetRefresh?: (datasetId: string, datasetName: string) => void;
}

type EditorWindow = Window & {
  __indEditor?: Editor;
};

export const DEMO_DEMOGRAPHICS = [
  { Subject: 'SUBJ-001', Age: 54, Sex: 'F', Group: 'Treatment A' },
  { Subject: 'SUBJ-002', Age: 61, Sex: 'M', Group: 'Treatment A' },
  { Subject: 'SUBJ-003', Age: 58, Sex: 'F', Group: 'Placebo' },
  { Subject: 'SUBJ-004', Age: 63, Sex: 'M', Group: 'Placebo' },
];

export const DEMO_DATASET_ID = 'dataset-101-ae';
export const DEMO_DATASET_LABEL = 'Table 14.1: Adverse Events';

export default function StudyDataPanel({ documentId, productName, onDatasetRefresh }: StudyDataPanelProps) {
  const { toast } = useToast();
  const dependency = useDependencyContext();
  const tableSubscribersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      const targetId = custom.detail?.id;

      if (!targetId) {
        return;
      }

      const focusElement = () => {
        const element = document.getElementById(`dataset-card-${targetId}`);
        if (!element) {
          return false;
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-2', 'ring-purple-500', 'bg-purple-50');

        window.setTimeout(() => {
          element.classList.remove('ring-2', 'ring-purple-500', 'bg-purple-50');
        }, 2000);

        return true;
      };

      if (!focusElement()) {
        window.setTimeout(() => {
          focusElement();
        }, 250);
      }
    };

    window.addEventListener(DATASET_FOCUS_EVENT, handleFocusRequest);

    return () => {
      window.removeEventListener(DATASET_FOCUS_EVENT, handleFocusRequest);
    };
  }, []);

  useEffect(() => {
    return () => {
      tableSubscribersRef.current.forEach(entry => {
        const [sourceId, subscriberId] = entry.split('|');
        if (sourceId && subscriberId) {
          dependency.unregisterSubscriber(sourceId, subscriberId);
        }
      });
      tableSubscribersRef.current.clear();
    };
  }, [dependency]);

  const categories = useMemo<StudyDataCategory[]>(
    () => [
      {
        id: 'toxicology',
        title: 'Nonclinical Toxicology',
        description: `GLP repeat-dose toxicology findings supporting the ${productName} IND package.`,
        source: 'Toxicology Study 101',
        metrics: [
          {
            id: 'primary-endpoint-pvalue',
            label: 'No-observed-adverse-effect level (NOAEL)',
            value: '20 mg/kg/day',
            context: '28-day GLP repeat-dose toxicity study in canines',
            unit: '',
            recordId: 'toxicology-101',
            dataKey: 'noael_value',
            sourceLabel: 'Toxicology Study 101',
            confidence: 92,
          },
          {
            id: 'primary-endpoint-delta',
            label: 'Target organ findings',
            value: 'Mild hepatocellular hypertrophy',
            context: 'Observed at high dose, fully reversible after recovery period',
            recordId: 'toxicology-101',
            dataKey: 'target_organ_findings',
            sourceLabel: 'Toxicology Study 101',
            confidence: 88,
          },
        ],
      },
      {
        id: 'safety',
        title: 'Safety Snapshot',
        description: 'Aggregate adverse event rates observed across the safety population.',
        source: 'CMC Stability Data 2025',
        metrics: [
          {
            id: 'serious-ae-rate',
            label: 'Assay potency retention',
            value: '96%',
            context: 'Accelerated stability, 6 months at 40°C/75% RH',
            recordId: 'cmc-stability-2025',
            dataKey: 'potency_retention',
            sourceLabel: 'CMC Stability Data 2025',
            confidence: 95,
          },
          {
            id: 'discontinuation-rate',
            label: 'Degradation products',
            value: '< 0.5%',
            context: 'Related species quantified via HPLC after 12 months at 25°C/60% RH',
            recordId: 'cmc-stability-2025',
            dataKey: 'degradation_products',
            sourceLabel: 'CMC Stability Data 2025',
            confidence: 97,
          },
        ],
      },
      {
        id: 'pharmacokinetics',
        title: 'Pharmacokinetics',
        description: 'Exposure metrics from nonclinical pharmacokinetic evaluations.',
        source: 'Pharmacokinetic Study 22',
        metrics: [
          {
            id: 'cmax-steady-state',
            label: 'Cmax (steady state)',
            value: '182 ng/mL',
            context: 'Observed geometric mean in nonclinical oral dose study',
            recordId: 'pk-study-22',
            dataKey: 'cmax_steady_state',
            sourceLabel: 'Pharmacokinetic Study 22',
            confidence: 90,
          },
          {
            id: 'tmax-steady-state',
            label: 'Tmax (median)',
            value: '3.5 h',
            context: 'Median time to Cmax across nonclinical species panel',
            recordId: 'pk-study-22',
            dataKey: 'tmax_steady_state',
            sourceLabel: 'Pharmacokinetic Study 22',
            confidence: 89,
          },
        ],
      },
    ],
    [productName],
  );

  const handleInsert = (metric: StudyMetric) => {
    const detail: SmartDataInsertPayload = {
      id: metric.recordId,
      value: metric.value,
      sourceLabel: metric.sourceLabel,
      confidence: metric.confidence,
    };

    const event = new CustomEvent<SmartDataInsertPayload>('insert-smart-data', {
      detail,
    });

    window.dispatchEvent(event);

    toast({
      title: 'Inserted study data',
      description: `${metric.label} added to the document.`,
    });
  };

  const handleInsertTable = () => {
    const editor = (window as EditorWindow).__indEditor ?? null;
    const inserted = insertTableFromData(
      editor,
      DEMO_DEMOGRAPHICS,
      DEMO_DATASET_ID,
      DEMO_DATASET_LABEL,
    );

    toast({
      title: inserted ? 'Demographics table inserted' : 'Unable to insert table',
      description: inserted
        ? `${DEMO_DATASET_LABEL} bound to live dataset ${DEMO_DATASET_ID}.`
        : 'No active editor session detected.',
      variant: inserted ? 'default' : 'destructive',
    });

    if (inserted) {
      const subscriberId = `table-${DEMO_DATASET_ID}-${Date.now()}`;
      dependency.registerSubscriber(DEMO_DATASET_ID, subscriberId, 'table');
      tableSubscribersRef.current.add(`${DEMO_DATASET_ID}|${subscriberId}`);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 px-4 py-6 text-sm text-gray-600">
        <section>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Linked Study Data</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Connect clinical evidence directly into the narrative. Inserted values retain provenance so
            reviewers can trace every claim back to source.
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-widest text-gray-400">Document ID: {documentId}</p>
        </section>

        <section
          id={`dataset-card-${DEMO_DATASET_ID}`}
          className="rounded-xl border border-dashed border-gray-300 bg-white/80 px-4 py-4 transition-colors hover:border-purple-200"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Phase 1 Demographics</p>
              <p className="mt-1 text-xs text-gray-500">
                Subject disposition across treatment arms with regulatory-ready formatting.
              </p>
            </div>
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] uppercase tracking-widest text-gray-500">
              Demo Dataset
            </span>
          </header>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
            {Object.keys(DEMO_DEMOGRAPHICS[0] ?? {}).map(key => (
              <span key={key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <span className="font-medium text-gray-600">{key}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-gray-400">
            <span>Dataset ID: {DEMO_DATASET_ID}</span>
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-semibold"
              onClick={() => {
                handleInsertTable();
                onDatasetRefresh?.(DEMO_DATASET_ID, DEMO_DATASET_LABEL);
              }}
            >
              <TableIcon className="mr-2 h-4 w-4" /> Insert Table
            </Button>
          </div>
        </section>

        <section id="dataset-card-dataset-iss-safety" className="border-t border-gray-100 pt-4">
          <header className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">ISS Safety Update (120-Day)</p>
            <span className="text-[11px] uppercase tracking-widest text-gray-400">Safety dossier</span>
          </header>
          <p className="mt-2 text-xs text-gray-500">
            Highlights emerging adverse events across pooled populations with live traceability into the
            Integrated Safety Summary.
          </p>
          <div className="mt-3 space-y-1 text-xs text-gray-500">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-600">Document ID</span>
              <span>ISS-CL-2025-SAFETY</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-600">Latest Update</span>
              <span>120-day cutover</span>
            </div>
          </div>
        </section>

        {categories.map(category => (
          <section
            key={category.id}
            id={`dataset-card-${category.id}`}
            className="border-t border-gray-100 pt-4"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">{category.title}</p>
                <p className="mt-1 text-xs text-gray-500">{category.description}</p>
              </div>
              <span className="text-[11px] uppercase tracking-widest text-gray-400">{category.source}</span>
            </header>

            <div className="mt-3 space-y-3">
              {category.metrics.map(metric => (
                <div
                  key={metric.id}
                  className="rounded-lg border border-gray-200/70 bg-white/80 px-3 py-3 shadow-[0_2px_6px_-3px_rgba(15,23,42,0.2)] transition-colors hover:border-purple-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-gray-400">{metric.label}</p>
                      {metric.context ? (
                        <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{metric.context}</p>
                      ) : null}
                    </div>
                    <span className="rounded-md bg-gray-900 px-2 py-1 text-sm font-semibold text-white">
                      {metric.value}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Record: <span className="font-medium text-gray-600">{metric.recordId}</span>
                      {metric.dataKey ? (
                        <>
                          {' '}
                          · Key: <span className="font-medium text-gray-600">{metric.dataKey}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="text-[11px] uppercase tracking-widest text-gray-400">
                      {metric.confidence}% confidence
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Source: {metric.sourceLabel}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleInsert(metric)}
                      className="h-7 px-2 text-xs font-semibold text-purple-600 hover:text-purple-700"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Insert
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
