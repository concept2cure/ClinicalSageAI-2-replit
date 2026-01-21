import React, { useState } from 'react';
import CortexCompanion from '../components/layout/CortexCompanion';

type CERV2Props = Record<string, unknown>;

export const CERV2Page = (_props: CERV2Props) => {
  const [companionWidth, setCompanionWidth] = useState<'FULL' | 'SIDE' | 'MINI'>('SIDE');
  const [indications, setIndications] = useState('');

  return (
    <div className="flex h-screen bg-slate-100">
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-slate-800 mb-6">Device Master Record (CERV2)</h1>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-500">Device Name</label>
              <input className="w-full border p-2 rounded mt-1" placeholder="e.g. Pacemaker" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500">Product Code</label>
              <input className="w-full border p-2 rounded mt-1" placeholder="AI Auto-Detect..." />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500">Indications for Use</label>
              <textarea
                className="w-full border p-2 rounded mt-1 h-32"
                placeholder="Describe indications..."
                value={indications}
                onChange={event => setIndications(event.target.value)}
              ></textarea>
            </div>
          </div>
        </div>
      </div>
      <CortexCompanion
        width={companionWidth}
        onToggle={setCompanionWidth}
        contextData={indications}
        onDraftGenerated={(draft) => setIndications(draft)}
      />
    </div>
  );
};

export default CERV2Page;
