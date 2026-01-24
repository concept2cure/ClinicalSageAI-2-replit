import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get('/api/projects');
      setProjects(data);
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Existing Projects</h3>
      {projects.length === 0 ? (
        <p className="text-gray-500 italic">No projects found. Create a new one to get started.</p>
      ) : (
        projects.map(p => (
          <div
            key={p.project_id}
            className="cursor-pointer border p-2 rounded hover:bg-gray-100"
            onClick={() => onSelect(p)}
          >
            <strong>{p.project_id}</strong> – {p.drug_name}
          </div>
        ))
      )}
    </div>
  );
}
