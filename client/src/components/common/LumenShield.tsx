import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

const getTenantHeader = () => {
  const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  return organizationId;
};

type LumenShieldResult = {
  riskScore: number;
  riskLevel: string;
  matches: Array<{
    id?: string | number;
    source_system?: string;
    insight?: string;
    severity?: string;
    created_at?: string;
    tags?: string[];
  }>;
  recommendations?: string[];
};

type LumenShieldProps = {
  supplierName?: string;
  productName?: string;
  material?: string;
  country?: string;
  className?: string;
  onResult?: (result: LumenShieldResult) => void;
  onError?: (message: string) => void;
};

export default function LumenShield({
  supplierName,
  productName,
  material,
  country,
  className,
  onResult,
  onError,
}: LumenShieldProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LumenShieldResult | null>(null);

  const riskTone = useMemo(() => {
    const level = result?.riskLevel || 'LOW';
    if (level === 'CRITICAL' || level === 'HIGH') return 'border-red-200 bg-red-50 text-red-700';
    if (level === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }, [result]);

  const handleRun = async () => {
    if (!supplierName) {
      setError('Add a supplier name to run guardrails.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tenantId = getTenantHeader();
      const response = await fetch('/api/lumen/guardrails/supplier-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': tenantId,
        },
        body: JSON.stringify({
          supplierName,
          productName,
          material,
          country,
        }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || 'Guardrails check failed');
      }

      const payload = await response.json();
      setResult(payload);
      onResult?.(payload);
    } catch (err: any) {
      const message = err?.message || 'Unable to run guardrails';
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 ${className || ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            LumenShield Guardrails
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Real-time supplier risk scan against the Lumen Deficiency Bank.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          className="inline-flex items-center gap-2 rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {loading ? 'Scanning' : 'Run guardrails'}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-xs text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className={`rounded-md border px-3 py-2 text-xs font-medium ${riskTone}`}>
            Risk level: {result.riskLevel} • Score {result.riskScore}
          </div>

          <div className="text-xs text-slate-600">
            {result.recommendations?.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {result.matches?.length ? (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-700 mb-2">Recent signals</div>
              <div className="space-y-2 text-[11px] text-slate-600">
                {result.matches.slice(0, 3).map((item, index) => (
                  <div key={item.id ?? index} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <div>
                      <div className="font-medium text-slate-700">
                        {item.insight || 'Signal'}
                      </div>
                      <div>
                        {item.source_system || 'Unknown source'} • {item.severity || 'LOW'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
