// Toast notification system upgraded to SecureToast

// SubmissionBuilder.tsx – region‑aware validation & live hints
import React, { useEffect, useState, useRef } from 'react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import { Tree, NodeModel } from '@minoru/react-dnd-treeview';
import update from 'immutability-helper';
import {
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  FileCheck,
  Loader2,
  FileWarning,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '../App';
import { useLocation } from 'wouter';
import AppPackagesBanner from '../components/AppPackagesBanner';

import '@minoru/react-dnd-treeview/dist/react-dnd-treeview.css';

const backend = HTML5Backend;

const REGIONS: Record<string, { folders: string[]; rules: Record<string, string[]> }> = {
  FDA: { folders: ['m1', 'm2', 'm3', 'm4', 'm5'], rules: {} },
  EMA: { folders: ['m1', 'm2', 'm3', 'm4', 'm5'], rules: { m1: ['cover', 'appform'] } },
  PMDA: {
    folders: ['m1', 'm2', 'm3', 'm4', 'm5', 'jp‑annex'],
    rules: { 'jp‑annex': ['quality', 'nonclinical'] },
  },
};

// Region-specific hints to display to users
const REGION_HINTS = {
  FDA: [
    '✓ Form 1571 must be in m1.2/form-1571 folder',
    '✓ Form 3674 (clinicaltrials.gov) required in m1.2/form-3674 folder',
    '✓ Cover letter must be in m1.1/cover-letter and PDF < 10 MB',
    '✓ Clinical study reports should be placed in m5.3/clinical-study-reports',
    '✓ Follows FDA eCTD 3.2.2 validation rules',
  ],
  EMA: [
    '✓ EU Application Form PDF required in application-form/eu-application-form folder',
    '✓ Letter of Authorization must be in m1.2/application-form',
    '✓ Active Substance Master File should be in m1/asmf folder',
    '✓ Product Information Annexes I-III must be in m1.3/product-information',
    '✓ Follows EU eCTD 3.2.2 technical validation criteria',
  ],
  PMDA: [
    '✓ JP Annex PDF must be placed in jp-annex folder',
    '✓ Japanese translations required in jp-annex/jp-data/translations',
    '✓ Application form must be in m1.1/application-form',
    '✓ Risk Management Plan required in m1.5/risk-management-plan',
    '✓ Follows JP eCTD 1.0 technical validation requirements',
  ],
};

type QcStatus = 'pending' | 'processing' | 'passed' | 'failed';
type QcMessage = { documentId: number; status: QcStatus; details?: string; timestamp: string };
type Doc = {
  id: number;
  title: string;
  module: string;
  qc_json?: {
    status: QcStatus;
    details?: string;
    timestamp?: string;
  };
};
interface Node extends NodeModel<Doc> {}

export default function SubmissionBuilder({ region = 'FDA' }: { region?: string }) {
  const [tree, setTree] = useState<Node[]>([]);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const [location] = useLocation();
  const [liveFeedActive, setLiveFeedActive] = useState(true);
  const [qcProcessing, setQcProcessing] = useState<Set<number>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const [qcLog, setQcLog] = useState<QcMessage[]>([]);

  // Initial data load
  useEffect(() => {
    (async () => {
      const docs: Doc[] = await fetchJson('/api/documents?status=approved_or_qc_failed');
      const folders = REGIONS[region].folders.map((f, idx) => ({
        id: 10_000 + idx,
        parent: 0,
        text: f,
        droppable: true,
      }));
      const nodes: Node[] = [{ id: 0, parent: 0, text: 'root', droppable: true }, ...folders];
      docs.forEach(d => {
        const folderId = folders.find(f => d.module.startsWith(f.text))?.id || folders[0].id;
        nodes.push({ id: d.id, parent: folderId, text: d.title, droppable: false, data: d });
      });
      setTree(nodes);
      validate(nodes);
    })();
  }, [region]);

  // WebSocket connection for real-time QC updates
  useEffect(() => {
    if (!liveFeedActive) return;

    // Determine WebSocket URL based on current protocol and host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    // Create WebSocket connection
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    // Connection opened
    socket.addEventListener('open', event => {
      console.log('Connected to QC update server');
      useToast().showToast('Live QC updates connected', 'info');
    });

    // Listen for messages
    socket.addEventListener('message', event => {
      try {
        const message: QcMessage = JSON.parse(event.data);

        // Update our QC log with the new message
        setQcLog(prev => [message, ...prev].slice(0, 20)); // Keep only last 20 messages

        // Update document status in our tree
        setTree(prevTree => {
          return prevTree.map(node => {
            if (!node.droppable && node.id === message.documentId) {
              // Handle 'processing' status specially - track these documents separately
              if (message.status === 'processing') {
                setQcProcessing(prev => new Set(prev).add(message.documentId));
              } else if (message.status === 'passed' || message.status === 'failed') {
                setQcProcessing(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(message.documentId);
                  return newSet;
                });
              }

              // Create updated node with the new QC status
              return {
                ...node,
                data: {
                  ...node.data,
                  qc_json: {
                    status: message.status,
                    details: message.details,
                    timestamp: message.timestamp,
                  },
                },
              };
            }
            return node;
          });
        });

        // Show toast notification for important status changes
        if (message.status === 'passed') {
          useToast().showToast(`${message.documentId}: QC validation passed`, 'success');
        } else if (message.status === 'failed') {
          useToast().showToast(
            `${message.documentId}: QC validation failed - ${message.details || 'Check document'}`,
            'error'
          );
        }
      } catch (err) {
        console.error('Error processing QC message:', err);
      }
    });

    // Handle connection closure
    socket.addEventListener('close', () => {
      console.log('QC update connection closed');
      if (liveFeedActive) {
        useToast().showToast('QC update feed disconnected, will retry in 5s', 'warning');
        setTimeout(() => setLiveFeedActive(true), 5000);
      }
    });

    // Handle connection errors
    socket.addEventListener('error', error => {
      console.error('WebSocket error:', error);
      socket.close();
    });

    // Cleanup function to close WebSocket when component unmounts
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      socketRef.current = null;
    };
  }, [liveFeedActive, region]);

  const validate = (nodes: Node[]) => {
    const bad = new Set<number>();
    const rules = REGIONS[region].rules;
    nodes
      .filter(n => !n.droppable && n.parent !== 0)
      .forEach(n => {
        const parentName = nodes.find(p => p.id === n.parent)!.text;
        if (rules[parentName]) {
          const allowed = rules[parentName];
          if (!allowed.some(a => n.data!.module.includes(a))) bad.add(Number(n.id));
        }
      });
    setInvalid(bad);
  };

  const onDrop = (nt: Node[]) => {
    setTree(nt);
    validate(nt);
  };

  const render = (node: Node, { depth, isOpen, onToggle }: any) => {
    // Folder node rendering
    if (node.droppable)
      return (
        <div style={{ marginLeft: depth * 16 }} className="fw-bold py-1">
          <button className="btn btn-sm btn-link p-0" onClick={onToggle}>
            {isOpen ? '▾' : '▸'}
          </button>
          <span className="ms-1">{node.text}</span>
        </div>
      );

    // Document node rendering
    const nodeId = Number(node.id);
    const qcStatus = node.data?.qc_json?.status;
    const qcDetails = node.data?.qc_json?.details;
    const invalidFlag = invalid.has(nodeId);
    const isProcessing = qcProcessing.has(nodeId);
    const timestamp = node.data?.qc_json?.timestamp
      ? new Date(node.data?.qc_json?.timestamp).toLocaleTimeString()
      : null;

    // Determine status icon
    let StatusIcon = XCircle;
    let statusClass = 'text-danger';
    let statusText = 'Failed';

    if (isProcessing) {
      StatusIcon = Loader2;
      statusClass = 'text-blue-600 animate-spin';
      statusText = 'Processing';
    } else if (qcStatus === 'passed') {
      StatusIcon = CheckCircle;
      statusClass = 'text-success';
      statusText = 'Passed';
    } else if (qcStatus === 'pending') {
      StatusIcon = Clock;
      statusClass = 'text-gray-400';
      statusText = 'Pending';
    }

    return (
      <div
        style={{ marginLeft: depth * 16 }}
        className={`d-flex align-items-center gap-2 py-2 px-2 my-1 rounded ${
          invalidFlag
            ? 'bg-danger/10 border border-danger/20'
            : isProcessing
              ? 'bg-blue-100 border border-blue-200'
              : qcStatus === 'passed'
                ? 'bg-success/5 border border-success/10'
                : 'bg-gray-50 border border-gray-100'
        }`}
      >
        <div className="flex-shrink-0">
          <StatusIcon size={16} className={statusClass} />
        </div>

        <div className="flex-grow-1">
          <div className="d-flex justify-content-between align-items-center">
            <span className="font-medium">{node.text}</span>
            {timestamp && <span className="text-xs text-gray-500 ms-2">{timestamp}</span>}
          </div>

          {qcDetails && <div className="text-xs text-gray-600 mt-1">{qcDetails}</div>}
        </div>

        {invalidFlag && (
          <div className="flex-shrink-0 ms-auto" title="Invalid placement for this region">
            <FileWarning size={16} className="text-warning" />
          </div>
        )}
      </div>
    );
  };

  const save = async () => {
    if (invalid.size) {
      useToast().showToast('Fix invalid placements first', 'error');
      return;
    }
    const docs = tree
      .filter(n => !n.droppable && n.parent !== 0)
      .map((n, i) => ({
        id: n.id,
        module: tree.find(f => f.id === n.parent)!.text,
        order: i,
      }));
    await fetch('/api/documents/builder-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs }),
    });
    useToast().showToast('Order saved', 'success');
  };

  // Function to toggle live feed
  const toggleLiveFeed = () => {
    setLiveFeedActive(!liveFeedActive);
    if (!liveFeedActive) {
      useToast().showToast('Enabling live QC updates...', 'info');
    } else {
      useToast().showToast('Live QC updates paused', 'info');
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    }
  };

  // Function to trigger QC validation for a document
  const runQcValidation = async (docId: number) => {
    try {
      useToast().showToast(`Requesting QC validation for document #${docId}`, 'info');
      await fetch(`/api/documents/${docId}/validate`, { method: 'POST' });
    } catch (err) {
      console.error('Error triggering QC validation:', err);
      useToast().showToast('Failed to trigger validation', 'error');
    }
  };

  return (
    <>
      <AppPackagesBanner currentPath={location} />
      <div className="container-fluid py-4">
        <div className="row">
          <div className="col-md-8">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2>
                Submission Builder <span className="badge bg-primary ms-1">{region}</span>
              </h2>

              <div className="d-flex gap-2">
                <button
                  className={`btn btn-sm ${liveFeedActive ? 'btn-success' : 'btn-outline-secondary'}`}
                  onClick={toggleLiveFeed}
                >
                  <div className="d-flex align-items-center gap-1">
                    {liveFeedActive && (
                      <span className="flex-shrink-0 h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                    )}
                    Live Updates {liveFeedActive ? 'On' : 'Off'}
                  </div>
                </button>
                <select
                  className="form-select form-select-sm"
                  value={region}
                  onChange={e =>
                    (window.location.href = `/submission-builder?region=${e.target.value}`)
                  }
                >
                  {Object.keys(REGIONS).map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {invalid.size > 0 && (
              <div className="alert alert-warning py-2 d-flex align-items-center">
                <AlertTriangle size={18} className="me-2" />
                <div>
                  <strong>{invalid.size} document(s)</strong> in invalid slots for {region} region
                </div>
              </div>
            )}

            {/* Region-specific hints */}
            <div className="alert alert-info py-2 mb-3">
              <div className="d-flex align-items-center gap-2 mb-1">
                <ShieldCheck size={16} />
                <div className="fw-bold">Region Compliance: {region}</div>
              </div>
              <ul className="mb-0 small">
                {REGION_HINTS[region as keyof typeof REGION_HINTS]?.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ul>
            </div>

            <div className="card mb-3">
              <div className="card-body">
                <DndProvider backend={HTML5Backend}>
                  <Tree
                    tree={tree}
                    rootId={0}
                    render={render}
                    onDrop={onDrop}
                    classes={{
                      root: 'submission-tree',
                      container: 'submission-tree-container',
                      dropTarget: 'drop-target',
                    }}
                  />
                </DndProvider>
              </div>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={save} disabled={invalid.size > 0}>
                Save Structure
              </button>

              <button
                className="btn btn-outline-secondary"
                onClick={() => window.location.reload()}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card sticky-top" style={{ top: '1rem' }}>
              <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <FileCheck size={16} />
                  <span>QC Activity</span>
                </div>
                {qcProcessing.size > 0 && (
                  <span className="badge bg-info">{qcProcessing.size} in progress</span>
                )}
              </div>

              <div className="card-body p-0" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {qcLog.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    <p>No QC validation activity yet</p>
                    <small>QC messages will appear here in real-time</small>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {qcLog.map((log, index) => (
                      <div
                        key={index}
                        className={`list-group-item list-group-item-action ${
                          log.status === 'passed'
                            ? 'list-group-item-success'
                            : log.status === 'failed'
                              ? 'list-group-item-danger'
                              : log.status === 'processing'
                                ? 'list-group-item-info'
                                : ''
                        }`}
                      >
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-medium">Document #{log.documentId}</span>
                          <small>{new Date(log.timestamp).toLocaleTimeString()}</small>
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          {log.status === 'passed' && (
                            <CheckCircle size={14} className="text-success" />
                          )}
                          {log.status === 'failed' && <XCircle size={14} className="text-danger" />}
                          {log.status === 'processing' && (
                            <Loader2 size={14} className="text-info animate-spin" />
                          )}
                          <small>{log.status.toUpperCase()}</small>
                        </div>
                        {log.details && (
                          <small className="d-block mt-1 text-muted">{log.details}</small>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-footer">
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-muted text-xs">
                    {liveFeedActive ? (
                      <span className="text-success">● Connected</span>
                    ) : (
                      <span className="text-muted">○ Disconnected</span>
                    )}
                  </span>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setQcLog([])}>
                    Clear Log
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast container for notifications */}
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </>
  );
}

async function fetchJson(u: string) {
  const r = await fetch(u);
  if (!r.ok) throw new Error('fetch');
  return r.json();
}
