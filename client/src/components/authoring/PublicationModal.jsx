import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, AlertTriangle, X, CheckCircle, 
  AlertOctagon, Download, RefreshCw, Wand2, 
  FileCheck, Lock, Fingerprint 
} from 'lucide-react';

export function PublicationModal({ isOpen, onClose, editor, onBatchResolve }) {
  const [report, setReport] = useState({ total: 0, verified: 0, items: [] });
  const [processState, setProcessState] = useState('SCANNING'); // SCANNING | READY | SEALING | DONE
  const [docRevision, setDocRevision] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setProcessState('SCANNING');
    setDocRevision(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !editor) return;
    const bump = () => setDocRevision((prev) => prev + 1);
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [isOpen, editor]);

  // --- 1. REACTIVE SCANNER ---
  useEffect(() => {
    if (!isOpen || !editor) return;
    if (processState === 'DONE' || processState === 'SEALING') return;

    const scanDocument = () => {
      // (Only scan if we aren't already sealing the doc)
      if (processState === 'SCANNING') {
          // Keep UI in scanning state for a moment
      }

      let items = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'smartTag') {
          let status = 'verified';
          let message = 'Ready for export';
          
          if (node.attrs.status === 'error' || node.attrs.dataVersion === 'WARNING') {
              status = 'error'; message = 'Critical: Invalid Source';
          } else if (node.attrs.status === 'draft' || (node.attrs.dataVersion && node.attrs.dataVersion !== 'Final (Nov 15)')) {
              status = 'warning'; message = 'Version Mismatch';
          }
          
          items.push({ id: node.attrs.id, label: node.attrs.label || node.attrs.value, pos, status, message });
        }
      });

      // Update Report
      setTimeout(() => {
        setReport({
          total: items.length,
          verified: items.filter(i => i.status === 'verified').length,
          items: items
        });
        if (processState === 'SCANNING') setProcessState('READY');
      }, 600);
    };

    scanDocument();
  }, [isOpen, editor, docRevision, processState]);

  // --- 2. HANDLERS ---
  const handleJumpToIssue = (pos) => {
    onClose();
    editor.commands.setTextSelection(pos);
    editor.commands.scrollIntoView();
    editor.commands.focus();
  };

  const handleGeneratePackage = () => {
    setProcessState('SEALING');
    // Simulate complex FDA compliance generation
    setTimeout(() => setProcessState('DONE'), 2500);
  };

  if (!isOpen) return null;

  const errors = report.items.filter(i => i.status === 'error');
  const warnings = report.items.filter(i => i.status === 'warning');
  const canPublish = errors.length === 0;

  // --- RENDER STATES ---
  
  // STATE: SEALING / DONE (The "Big Think" Upgrade)
  if (processState === 'SEALING' || processState === 'DONE') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 text-center space-y-6">
                {processState === 'SEALING' ? (
                    <>
                       <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                          <div className="absolute inset-0 border-4 border-t-blue-500 border-gray-100 rounded-full animate-spin"></div>
                          <Fingerprint size={32} className="text-blue-500 animate-pulse" />
                       </div>
                       <div className="space-y-1">
                          <h3 className="text-lg font-bold text-gray-800">Sealing Submission...</h3>
                          <p className="text-xs text-gray-500 font-mono">Generating SHA-256 Audit Hash...</p>
                       </div>
                    </>
                ) : (
                    <>
                       <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                          <ShieldCheck size={40} className="text-green-600" />
                       </div>
                       <div className="space-y-2">
                          <h3 className="text-xl font-bold text-gray-800">Compliance Verified</h3>
                          <p className="text-sm text-gray-600">
                             Dossier is locked and ready for submission.
                             <br/>
                              <span className="font-mono text-xs text-gray-400">Audit ID: {(globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `audit_${Date.now()}`).slice(0,8)}</span>
                          </p>
                       </div>
                       
                       <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-left space-y-3">
                          <div className="flex items-center gap-3">
                             <FileCheck size={18} className="text-blue-600" />
                             <div className="text-sm">
                                <span className="font-bold text-gray-700">Clean_Protocol_101.pdf</span>
                                <div className="text-[10px] text-gray-400">Submission Ready • 2.4 MB</div>
                             </div>
                          </div>
                          <div className="flex items-center gap-3">
                             <Lock size={18} className="text-purple-600" />
                             <div className="text-sm">
                                <span className="font-bold text-gray-700">Validation_Certificate.json</span>
                                <div className="text-[10px] text-gray-400">FDA 21 CFR Part 11 Log • 12 KB</div>
                             </div>
                          </div>
                       </div>

                       <div className="pt-2 flex gap-3">
                          <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Close</button>
                          <button className="flex-[2] py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-lg flex items-center justify-center gap-2">
                             <Download size={16} /> Download Package
                          </button>
                       </div>
                    </>
                )}
             </div>
          </div>
        </div>
      );
  }

  // STATE: SCANNING / REVIEW (The Standard Validator)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 font-bold text-gray-800">
            <ShieldCheck className={processState === 'SCANNING' ? 'text-blue-500 animate-pulse' : (canPublish ? 'text-green-500' : 'text-red-500')} size={20} />
            <span>Pre-Submission Audit</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto">
          {/* SCORECARD */}
          <div className="grid grid-cols-3 gap-3 text-center mb-6">
             <div className="p-3 bg-gray-50 rounded border border-gray-100">
                 <div className="text-2xl font-bold text-gray-800">{report.total}</div>
                 <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Tags</div>
             </div>
             <div className={`p-3 rounded border ${errors.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                 <div className={`text-2xl font-bold ${errors.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{errors.length}</div>
                 <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Blockers</div>
             </div>
             <div className={`p-3 rounded border ${warnings.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                 <div className={`text-2xl font-bold ${warnings.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{warnings.length}</div>
                 <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Warnings</div>
             </div>
          </div>

          {/* ACTION LIST */}
          {(errors.length > 0 || warnings.length > 0) ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 border-b border-gray-200 uppercase tracking-wide flex justify-between items-center">
                    <span>Outstanding Issues</span>
                    {warnings.length > 0 && errors.length === 0 && (
                        <button
                          onClick={() => onBatchResolve?.()}
                          disabled={!onBatchResolve}
                          className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded hover:bg-amber-200 font-bold transition-colors animate-pulse disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Wand2 size={10} /> Batch Verify All
                        </button>
                    )}
                </div>
                <div className="divide-y divide-gray-100 max-h-[200px] overflow-y-auto">
                    {errors.map((item, i) => (
                        <div key={i} className="p-3 bg-red-50/30 flex justify-between items-center">
                            <div className="flex gap-3"><AlertOctagon size={16} className="text-red-500"/> <span className="text-sm font-semibold">{item.label}</span></div>
                            <button onClick={() => handleJumpToIssue(item.pos)} className="text-xs border px-2 py-1 rounded bg-white">Fix</button>
                        </div>
                    ))}
                    {warnings.map((item, i) => (
                        <div key={i} className="p-3 hover:bg-amber-50 flex justify-between items-center">
                            <div className="flex gap-3"><AlertTriangle size={16} className="text-amber-500"/> <span className="text-sm font-semibold">{item.label}</span></div>
                            <button onClick={() => handleJumpToIssue(item.pos)} className="text-xs border px-2 py-1 rounded bg-white">Review</button>
                        </div>
                    ))}
                </div>
            </div>
          ) : (
            <div className="text-center py-6 animate-in zoom-in duration-300">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-2" />
                <h3 className="text-gray-900 font-bold">100% Validated</h3>
                <p className="text-gray-500 text-xs">Document integrity confirmed.</p>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
           <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
           <button 
             onClick={handleGeneratePackage}
             disabled={!canPublish || processState === 'SCANNING'}
             className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${!canPublish ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
           >
             <Lock size={16} /> Generate Submission Package
           </button>
        </div>
      </div>
    </div>
  );
}
