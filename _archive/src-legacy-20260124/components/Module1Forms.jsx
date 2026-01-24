import React, { useState } from 'react';
import api from '../services/api';

export default function Module1Forms({ project }) {
  const [loading, setLoading] = useState('');

  const downloadForm = id => {
    if (!project) return;

    setLoading(id);
    window.open(`/api/ind/${project.project_id}/forms/${id}`, '_blank');
    setTimeout(() => setLoading(''), 800); // simple reset timer
  };

  return (
    <div className="space-x-2">
      {['1571', '1572', '3674'].map(formId => (
        <button
          key={formId}
          className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
          disabled={!project}
          onClick={() => downloadForm(formId)}
        >
          {loading === formId ? 'Preparing…' : `Download Form ${formId}`}
        </button>
      ))}
    </div>
  );
}
