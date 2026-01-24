import React, { useState } from 'react';
import { postJson } from '../services/api';

export default function Module3Manual({ project }) {
  const blank = {
    drug_name: '',
    manufacturing_site: '',
    batch_number: '',
    specifications: '',
    stability_data: '',
  };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    if (!project) return;

    setBusy(true);
    try {
      const response = await postJson(`/api/ind/${project.project_id}/module3/manual`, form);
      window.open(`/api/ind/${project.project_id}/module3/manual`, '_blank');
      setForm(blank);
    } catch (e) {
      alert(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1 border p-3 rounded">
      <h4 className="font-semibold text-sm mb-1">Manual CMC Entry</h4>
      {['drug_name', 'manufacturing_site', 'batch_number'].map(f => (
        <input
          key={f}
          name={f}
          placeholder={f.replaceAll('_', ' ')}
          className="border p-1 w-full text-sm mb-1"
          value={form[f]}
          onChange={handle}
        />
      ))}
      <button
        className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
        disabled={!project || busy}
        onClick={submit}
      >
        {busy ? 'Generating…' : 'Generate Module 3'}
      </button>
    </div>
  );
}
