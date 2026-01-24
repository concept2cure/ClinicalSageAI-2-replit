import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';

export default function TrainingTasks() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    load();
  }, []);
  async function load() {
    const { data } = await axios.get('/api/training');
    setTasks(data);
  }
  async function complete(id) {
    await axios.post(`/api/training/${id}/complete`);
    load();
  }
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">My SOP Training</h1>
      {tasks.map(t => (
        <div key={t.id} className="border p-4 rounded flex justify-between items-center">
          <div>
            <p className="font-semibold">{t.title}</p>
            <p className="text-xs text-gray-500">Status: {t.status}</p>
          </div>
          {t.status === 'Pending' && (
            <Button size="sm" onClick={() => complete(t.id)}>
              Mark Completed
            </Button>
          )}
          {t.status === 'Completed' && <span className="text-green-600 text-sm">✔ Completed</span>}
        </div>
      ))}
      {tasks.length === 0 && <p>No training tasks assigned.</p>}
    </div>
  );
}
