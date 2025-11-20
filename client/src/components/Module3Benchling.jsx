import React, { useState } from 'react';
import api from '../services/api';

export default function Module3Benchling({ project }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!project) return;

    setBusy(true);
    window.open(`/api/ind/${project.project_id}/module3?src=benchling`, '_blank');
    setTimeout(() => setBusy(false), 1000);
  };

  return (
    <button
      className="bg-purple-600 text-white px-3 py-1 rounded disabled:opacity-50"
      disabled={!project || busy}
      onClick={download}
    >
      {busy ? 'Generating…' : 'Download Module 3 (Benchling)'}
    </button>
  );
}
