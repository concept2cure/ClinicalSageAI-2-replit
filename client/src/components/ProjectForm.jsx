import React, { useState } from 'react';
import api from '../services/api';
import { toast } from '@/hooks/use-toast';

export default function ProjectForm({ onCreated }) {
  const [form, setForm] = useState({
    project_id: '',
    sponsor: '',
    drug_name: '',
    protocol: '',
    pi_name: '',
    pi_address: '',
    nct_number: '',
  });
  const [busy, setBusy] = useState(false);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const create = async () => {
    try {
      setBusy(true);
      await api.post('/api/projects', form);
      onCreated();
      setForm({
        project_id: '',
        sponsor: '',
        drug_name: '',
        protocol: '',
        pi_name: '',
        pi_address: '',
        nct_number: '',
      });
    } catch (err) {
      toast({ title: err.response?.data?.detail || err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border p-4 rounded-md">
      <h3 className="font-semibold">New IND Project</h3>
      {[
        ['Project ID', 'project_id'],
        ['Sponsor', 'sponsor'],
        ['Drug Name', 'drug_name'],
        ['Protocol #', 'protocol'],
        ['PI Name', 'pi_name'],
        ['PI Address', 'pi_address'],
        ['NCT #', 'nct_number'],
      ].map(([label, name]) => (
        <div key={name}>
          <label className="block text-sm font-medium">{label}</label>
          <input className="border p-1 w-full" name={name} value={form[name]} onChange={handle} />
        </div>
      ))}
      <button className="bg-blue-600 text-white px-3 py-1 rounded" disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'Create Project'}
      </button>
    </div>
  );
}
