import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';

function KpiCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 text-center">
      <p className="text-2xl font-bold text-blue-700">{value}</p>
      <p className="text-gray-600 text-sm mt-1">{label}</p>
    </div>
  );
}

export default function RoleDashboard() {
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = useUser();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const { data } = await axios.get('/api/dashboard', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setKpis(data.kpis);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading)
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
        <span className="ml-2">Loading dashboard…</span>
      </div>
    );

  if (error)
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-2">⚠️ {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );

  if (!kpis) return <div className="p-8">No dashboard data available.</div>;

  const roleColors = {
    Regulatory: 'bg-blue-100',
    ClinicalOps: 'bg-green-100',
    CMC: 'bg-purple-100',
    QA: 'bg-orange-100',
    Executive: 'bg-pink-100',
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div className={`p-4 rounded-lg ${roleColors[user?.role] || 'bg-gray-100'}`}>
        <h1 className="text-2xl font-bold">Welcome, {user?.role || 'User'}</h1>
        <p className="text-gray-600">Your personalized dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(kpis).map(([key, value]) => {
          // Convert camelCase to display text
          const label = key
            .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
            .replace(/^./, str => str.toUpperCase()); // Capitalize first letter

          return <KpiCard key={key} label={label} value={value} />;
        })}
      </div>
    </div>
  );
}
