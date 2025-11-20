import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';

export default function PromoReview({ promoId }) {
  const [promo, setPromo] = useState(null);
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    load();
  }, [promoId]);
  async function load() {
    const { data } = await axios.get(`/api/promo/${promoId}`);
    setPromo(data.promo);
    setTasks(data.tasks);
  }
  async function approve(taskId) {
    await axios.post(`/api/promo/task/${taskId}/approve`);
    load();
  }
  if (!promo) return <div className="p-6">Loading promo…</div>;
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Promo Review – {promo.file_name}</h1>
      <iframe src={promo.file_url} className="w-full h-96 border" title="preview" />

      <h2 className="text-xl font-semibold mt-4">AI Claim Checks</h2>
      <ul className="list-disc ml-5 text-sm">
        {promo.claims.map((c, i) => (
          <li key={i} className={c.supported ? 'text-green-700' : 'text-red-600'}>
            {c.text} {c.supported ? '✔' : '⚠ unsupported'}{' '}
            {c.referenceSuggestion && `(Suggest ref: ${c.referenceSuggestion})`}
          </li>
        ))}
      </ul>

      <h2 className="text-xl font-semibold mt-4">Review Tasks</h2>
      {tasks.map(t => (
        <div key={t.id} className="border p-3 flex justify-between items-center mb-2">
          <span>{t.role}</span>
          {t.status === 'Pending' ? (
            <Button size="sm" onClick={() => approve(t.id)}>
              Approve
            </Button>
          ) : (
            <span className="text-green-600 text-sm">Approved</span>
          )}
        </div>
      ))}
      {promo.status === 'Approved' && (
        <div className="p-4 bg-green-50 text-green-700 rounded">
          Promo piece Approved – ready for distribution!
        </div>
      )}
    </div>
  );
}
