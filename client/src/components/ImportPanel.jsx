import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import DropzoneUpload from './DropzoneUpload';

export default function ImportPanel() {
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    const sock = io({ path: '/ws' });
    sock.on('import', msg => setProgress(p => [...p, msg]));

    return () => sock.disconnect();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold">Document Import</h2>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">Upload Documents</h3>
        <DropzoneUpload onComplete={() => setProgress([])} />
      </div>

      {progress.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Bulk Import Progress</h3>
          <ul className="space-y-1 border rounded-lg p-4 bg-gray-50">
            {progress.map((p, i) => (
              <li key={i} className="flex justify-between">
                <span>{p.file}</span>
                <span className="font-medium">{p.percent.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
