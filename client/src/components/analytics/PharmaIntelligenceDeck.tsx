import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, AlertTriangle, Users, Activity, Loader } from 'lucide-react';
import IngestionAirlock from '../admin/IngestionAirlock';
import { useTenantContext } from '@/contexts/TenantContext';

export const PharmaIntelligenceDeck = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { getTenantHeaders } = useTenantContext();

  const fetchLiveData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token =
        localStorage.getItem('accessToken') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('token');
      const response = await fetch('/api/analytics/live', {
        headers: {
          ...getTenantHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Live Data Unreachable');
      const realData = await response.json();
      setData(realData);
    } catch (err) {
      console.error(err);
      setError('LIVE STREAM DISCONNECTED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  return (
    <div className="space-y-6">
      <IngestionAirlock onIngested={fetchLiveData} />
      {loading && (
        <div className="flex items-center justify-center h-64 text-slate-400 gap-2">
          <Loader className="animate-spin" /> ESTABLISHING NEURAL LINK...
        </div>
      )}
      {!loading && error && (
        <div className="flex items-center justify-center h-64 text-red-500 font-bold tracking-widest gap-2">
          <AlertTriangle /> {error}
        </div>
      )}
      {!loading && !error && (!data?.safetyData || data.safetyData.length === 0) && (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
          <div className="font-bold text-lg text-slate-600">VAULT EMPTY</div>
          <p className="text-xs">Ingest CSR documents to generate intelligence.</p>
        </div>
      )}
      {!loading && !error && data?.safetyData && data.safetyData.length > 0 && (
        <>
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Total Enrollment"
          value={data.kpi.totalEnrollment}
          trend="LIVE"
          icon={Users}
          color="text-blue-600"
        />
        <KPICard
          title="Analyzed Docs"
          value={data.kpi.totalDocs}
          trend="INDEXED"
          icon={Activity}
          color="text-emerald-500"
        />
        <KPICard
          title="Safety Signals"
          value={data.kpi?.safetySignals ?? 0}
          trend="LIVE"
          icon={AlertTriangle}
          color="text-rose-500"
        />
        <KPICard
          title="Velocity"
          value={`${data.kpi?.ingestVelocity ?? 0}/day`}
          trend="LIVE"
          icon={TrendingUp}
          color="text-indigo-500"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-80">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Safety Signal Monitor (Real-Time)</h3>
            <p className="text-xs text-slate-500">
              Adverse Events extracted from {data.kpi.totalDocs} documents
            </p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.safetyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="adverse_events" name="Total AEs" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="serious_ae" name="Serious AEs" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex items-center justify-center">
          <div className="text-center opacity-50">
            <TrendingUp className="mx-auto mb-2" size={32} />
            <div className="font-bold text-slate-500">Trend Analysis Unavailable</div>
            <div className="text-xs text-slate-400">Requires additional longitudinal data</div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

const KPICard = ({ title, value, trend, icon: Icon, color }: any) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
    <div>
      <div className="text-[10px] uppercase font-bold text-slate-400">{title}</div>
      <div className="text-xl font-black text-slate-800">{value}</div>
      <div className={`text-xs font-bold ${color}`}>{trend}</div>
    </div>
    <Icon className="text-slate-300" size={24} />
  </div>
);
