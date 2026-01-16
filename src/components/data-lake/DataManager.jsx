import React, { useState, useEffect } from 'react';
import { db } from '../../lib/database';
import { eventBus } from '../ui/ToastSystem';
import { 
  Database, UploadCloud, FileCode, AlertTriangle, 
  ArrowRight, CheckCircle, Search, RefreshCw 
} from 'lucide-react';

export function DataManager({ tenantId }) {
  const [artifacts, setArtifacts] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('IDLE'); // IDLE | PARSING | ANALYZING | DONE
  const [impactReport, setImpactReport] = useState(null);

  // LOAD ARTIFACTS
  useEffect(() => {
    if (tenantId) db.getArtifacts(tenantId).then(setArtifacts);
  }, [tenantId]);

  // SIMULATE UPLOAD & IMPACT ANALYSIS
  const handleUpload = () => {
    setIsUploading(true);
    setUploadStep('PARSING');
    
    // Step 1: Parse (Mock)
    setTimeout(() => {
        setUploadStep('ANALYZING');
        
        // Step 2: Impact Analysis (Query the Graph)
        // In a real app, this calls db.getImpactReport()
        setTimeout(async () => {
            const report = await db.getImpactReport('tbl-14.2.1'); // Mocking an update to the PFS table
            setImpactReport(report);
            setUploadStep('DONE');
            setIsUploading(false);
        }, 1500);
    }, 1200);
  };

  const handleBroadcast = async () => {
    if (!impactReport) return;

      const focusAnchorId = impactReport.focusAnchorId || impactReport?.changes?.find((c) => c?.anchorId)?.anchorId;

         const changes = Array.isArray(impactReport?.changes) ? impactReport.changes : [];
         const primaryChange = changes[0] || null;
         const changeLabel = primaryChange
            ? `${primaryChange.variable} ${primaryChange.from} → ${primaryChange.to}`
            : `${impactReport.artifactId} updated`;
         const versionLabel = impactReport?.fromVersion && impactReport?.toVersion
            ? `${impactReport.fromVersion} → ${impactReport.toVersion}`
            : 'updated';

         const systemMessage = primaryChange
            ? `⚠️ Data Update: ${impactReport.artifactId} (${versionLabel}). ${primaryChange.variable} changed from ${primaryChange.from} to ${primaryChange.to}. Please review.`
            : `⚠️ Data Refresh: ${impactReport.artifactId} updated (${versionLabel}). Please review.`;

      // A. SIMULATE DB UPDATE (Injecting System Comment)
      // In a real app, this would happen on the server.
      // Inject threads into all impacted documents, and deep-link to Protocol 101.
      const injectedThreads = [];
      for (const doc of impactReport.affectedDocuments ?? []) {
         const thread = await db.injectSystemThread(
            doc.docId,
            { artifactId: impactReport.artifactId, anchorId: focusAnchorId },
                  systemMessage
         );
         injectedThreads.push(thread);
      }

      const protocol101Thread = injectedThreads.find((t) => String(t.docId) === '101') || injectedThreads[0];
      const navDetail = protocol101Thread
         ? { docId: protocol101Thread.docId, anchorId: protocol101Thread.anchorId, threadId: protocol101Thread.id }
         : { docId: '101', anchorId: focusAnchorId || 'tbl-14.2', threadId: null };

    // B. EMIT GLOBAL ALERT
    eventBus.emit({
       type: 'SHOW_TOAST',
       payload: {
          title: '⚠️ Protocol Update Detected',
          message: `${impactReport.artifactId} (${versionLabel}). ${changeLabel}. ${impactReport.affectedDocuments.length} protocols require review.`,
          variant: 'danger',
          action: {
             label: `Review: ${changeLabel}`,
             onClick: () => {
                // Dispatch a navigation event that App.jsx listens to
                window.dispatchEvent(new CustomEvent('NAVIGATE_DOC', { detail: navDetail }));
             }
          }
       }
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Lake</h1>
          <p className="text-gray-500 text-sm">Manage source datasets and analyze downstream impact.</p>
        </div>
        <div className="flex gap-2">
           <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
              <RefreshCw size={16} /> Sync Source
           </button>
           <button 
             onClick={handleUpload}
             disabled={isUploading || uploadStep === 'DONE'}
             className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm disabled:opacity-50"
           >
              <UploadCloud size={16} /> Ingest Dataset
           </button>
        </div>
      </div>

      <div className="flex gap-8 h-full">
        {/* LEFT: ARTIFACT LIST */}
        <div className="w-1/3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
           <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <span className="font-bold text-sm text-gray-700">Managed Artifacts ({artifacts.length})</span>
              <Search size={16} className="text-gray-400" />
           </div>
           <div className="overflow-y-auto flex-1">
              {artifacts.map(art => (
                 <div key={art.id} className="p-4 border-b border-gray-100 hover:bg-blue-50 cursor-pointer group transition-colors">
                    <div className="flex items-center gap-3 mb-1">
                       <div className="p-2 bg-blue-100 text-blue-600 rounded">
                          <FileCode size={18} />
                       </div>
                       <div>
                          <div className="font-bold text-sm text-gray-900">{art.id}</div>
                          <div className="text-xs text-gray-500">{art.type} • {art.data_version}</div>
                       </div>
                    </div>
                    <div className="pl-11 text-xs text-gray-400 truncate">{art.label}</div>
                 </div>
              ))}
              {artifacts.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">No artifacts found.</div>}
           </div>
        </div>

        {/* RIGHT: INGESTION WORKSPACE */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex flex-col items-center justify-center relative overflow-hidden">
           
           {/* BACKGROUND PATTERN */}
           <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

           {uploadStep === 'IDLE' && !impactReport && (
               <div className="text-center max-w-md relative z-10">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                     <Database size={40} className="text-gray-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to Ingest</h3>
                  <p className="text-gray-500 text-sm mb-6">
                     Upload SAS (`.sas7bdat`) or CSV files here. The system will parse variable labels and compare them against the previous version.
                  </p>
                  <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-xs text-gray-400">
                     Drag & Drop file here or click "Ingest Dataset" above to simulate.
                  </div>
               </div>
           )}

           {(uploadStep === 'PARSING' || uploadStep === 'ANALYZING') && (
               <div className="text-center relative z-10 animate-in zoom-in duration-300">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                     <RefreshCw size={40} className="text-blue-600 animate-spin" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                     {uploadStep === 'PARSING' ? 'Parsing Schema...' : 'Calculating Impact...'}
                  </h3>
                  <p className="text-gray-500 text-sm">
                     {uploadStep === 'PARSING' ? 'Extracting 45 variables from SAS7BDAT.' : 'Scanning Dependency Graph for 12 Active Protocols.'}
                  </p>
               </div>
           )}

           {uploadStep === 'DONE' && impactReport && (
               <div className="w-full max-w-lg relative z-10 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                     <CheckCircle size={24} className="text-green-600" />
                     <div>
                        <div className="font-bold text-green-800">Ingestion Complete</div>
                        <div className="text-xs text-green-700">Dataset `tbl-14.2.1` updated to v2.1</div>
                     </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                     <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-gray-700 flex justify-between">
                        <span>Impact Analysis Report</span>
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">High Impact</span>
                     </div>
                     <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-500">Affected Artifact:</span>
                           <span className="font-mono font-bold">{impactReport.artifactId}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-500">Total References:</span>
                           <span className="font-bold">{impactReport.totalImpacts} Smart Tags</span>
                        </div>
                        
                        <div className="border-t border-gray-100 pt-4 mt-2">
                           <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Impacted Documents</span>
                           <div className="space-y-2">
                              {impactReport.affectedDocuments.map((doc, i) => (
                                 <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded transition-colors">
                                    <div className="flex items-center gap-2">
                                       <AlertTriangle size={14} className="text-amber-500" />
                                       <span className="text-sm font-medium text-gray-800">{doc.docTitle}</span>
                                    </div>
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                                       {doc.count} Updates
                                    </span>
                                 </div>
                              ))}
                           </div>
                        </div>

                        <button 
                           onClick={handleBroadcast}
                           className="w-full mt-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                        >
                           Broadcast Alerts <ArrowRight size={16} />
                        </button>
                     </div>
                  </div>
               </div>
           )}

        </div>
      </div>
    </div>
  );
}
