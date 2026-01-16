// CERSequenceManager.jsx – plan & build CER submission sequence
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, AlertTriangle, Globe, ArrowRight } from 'lucide-react'

const REGIONS = ['EU', 'UK', 'FDA'];

export default function CERSequenceManager() {
  const [docs, setDocs] = useState([]);
  const [plan, setPlan] = useState([]);
  const [errors, setErrors] = useState([]);
  const [region, setRegion] = useState('EU');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/cer/documents?status=approved_or_qc_failed')
      .then(r => r.json())
      .then(res => {
        const p = res.map(analyzeDoc);
        setPlan(p);
        setErrors(p.filter(d => d.errors.length));
      });
  }, []);

  const analyzeDoc = d => {
    const errs = [];
    if (!d.qc_json || d.qc_json.status !== 'passed') errs.push('QC not passed');
    if (!d.module_slot) errs.push('Missing section');
    return { ...d, errors: errs };
  };

  const createSequence = () => {
    fetch('/api/cer/sequence/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region, plan }),
    })
      .then(r => r.json())
      .then(({ sequence }) => navigate(`/portal/cer/${sequence}`));
  };

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">CER Sequence Planner</h1>

      <div className="flex gap-3 items-center mb-6">
        <Globe size={16} /> <span>Region</span>
        <select
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {REGIONS.map(r => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-100 p-3 rounded mb-4 text-sm text-red-700">
          <AlertTriangle size={14} className="inline me-2" />
          {errors.length} document(s) need attention.
        </div>
      )}

      <div className="divide-y border rounded">
        {plan.map(p => (
          <div key={p.id} className="flex p-2 text-sm">
            <FileText size={14} className="me-2 text-gray-500" />
            <span className="flex-1 truncate">{p.title}</span>
            {p.errors.length > 0 && <span className="text-red-500 text-xs">{p.errors[0]}</span>}
          </div>
        ))}
      </div>

      <button
        disabled={errors.length > 0}
        onClick={createSequence}
        className="mt-5 bg-indigo-600 text-white px-5 py-2 rounded flex gap-2 items-center disabled:opacity-50"
      >
        Build {region} CER Package <ArrowRight size={16} />
      </button>
    </div>
  );
}
