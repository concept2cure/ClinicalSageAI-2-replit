import { useState } from 'react';
import DocsChecklist from './DocsChecklist';
import { toast } from '../lightweight-wrappers.js';

const REQUIRED = ['Protocol.pdf', 'IB.pdf', 'DSUR.pdf', 'CMC.pdf'];

export default function INDAssembler() {
  const [seq, setSeq] = useState('0000');

  const build = async () => {
    toast.promise(
      fetch('/api/ind/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq }),
      }).then(r => r.json()),
      {
        loading: 'Assembling IND…',
        success: ({ zipObjectId }) => `IND ready! ObjectId ${zipObjectId}`,
        error: e => `Failed: ${e.message}`,
      }
    );
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold">IND Assembly</h2>
      <DocsChecklist required={REQUIRED} />
      <input
        value={seq}
        onChange={e => setSeq(e.target.value)}
        className="border rounded px-3 py-1"
        placeholder="Sequence (0000)"
      />
      <button onClick={build} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">
        Build & Upload
      </button>
    </div>
  );
}
