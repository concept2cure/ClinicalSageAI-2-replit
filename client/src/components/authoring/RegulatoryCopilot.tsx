import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Loader2, ShieldCheck } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

const getTenantHeader = () => {
  const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  return organizationId;
};

type RegulatoryCopilotProps = {
  documentTitle?: string;
  section?: string;
  contextSnippet?: string;
  onApplyFix?: (original: string, replacement: string) => void;
};

const complianceRules = [
  {
    phrase: 'guarantee absolute safety',
    replacement: 'demonstrated safety profile',
    message: 'Avoid absolute guarantees; use evidence-based language.',
  },
  {
    phrase: 'completely safe',
    replacement: 'well-characterized safety profile',
    message: 'Replace absolute safety claims with qualified statements.',
  },
  {
    phrase: 'zero risk',
    replacement: 'low residual risk',
    message: 'Regulatory language must acknowledge residual risk.',
  },
];

const extractSupplierName = (text: string) => {
  const match = text.match(
    /([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)*\s+(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Synthetics))/
  );
  return match?.[1] || null;
};

export default function RegulatoryCopilot({
  documentTitle,
  section,
  contextSnippet,
  onApplyFix,
}: RegulatoryCopilotProps) {
  const [prompt, setPrompt] = useState('Review this section for compliance risks and missing references.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [scanFindings, setScanFindings] = useState<any[]>([]);
  const [guardrailAlert, setGuardrailAlert] = useState<any>(null);

  const riskBadgeClass = useMemo(() => {
    const level = String(result?.risk_level || 'LOW');
    if (level === 'CRITICAL' || level === 'HIGH') return 'bg-red-100 text-red-700 border-red-200';
    if (level === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }, [result]);

  const handleAnalyze = async () => {
    if (!prompt.trim()) {
      setError('Add a focus question for the copilot.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tenantId = getTenantHeader();
      const response = await fetch('/api/lumen/guardrails/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': tenantId,
        },
        body: JSON.stringify({
          prompt,
          documentTitle,
          section,
          contextSnippet,
        }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || 'Copilot analysis failed');
      }

      const payload = await response.json();
      setResult(payload);
    } catch (err: any) {
      setError(err?.message || 'Unable to run copilot analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleComplianceScan = async () => {
    const sourceText = contextSnippet || '';
    const findings = complianceRules
      .map((rule) => {
        const regex = new RegExp(rule.phrase, 'i');
        if (!regex.test(sourceText)) return null;
        return {
          ...rule,
        };
      })
      .filter(Boolean);

    setScanFindings(findings);

    const supplierName = extractSupplierName(sourceText);
    if (supplierName) {
      try {
        const tenantId = getTenantHeader();
        const response = await fetch('/api/lumen/guardrails/supplier-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': tenantId,
          },
          body: JSON.stringify({ supplierName }),
        });

        if (response.ok) {
          const payload = await response.json();
          setGuardrailAlert(payload);
        }
      } catch {
        // best-effort guardrail lookup
      }
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Regulatory Copilot
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Guardrail-aware analysis for eCTD sections and compliance gaps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleComplianceScan}
              className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              RUN COMPLIANCE SCAN
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
              {loading ? 'Analyzing' : 'Analyze'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="Ask the copilot to scan for gaps, contradictions, or missing citations..."
            className="text-xs"
          />
          <div className="mt-2 text-[10px] text-slate-500">
            Context source: {documentTitle || 'Untitled'} {section ? `• ${section}` : ''}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3 text-xs">
            <div className={`inline-flex items-center rounded border px-2 py-1 text-[10px] font-semibold ${riskBadgeClass}`}>
              Risk level: {result.risk_level || 'LOW'}
            </div>
            <div className="text-sm font-medium text-slate-900">{result.summary}</div>
            <div className="text-slate-600 leading-relaxed">{result.impact_assessment}</div>

            {Array.isArray(result.action_items) && result.action_items.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-700">Action items</div>
                <ul className="mt-1 list-disc list-inside text-slate-600 space-y-1">
                  {result.action_items.map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(result.related_regulations) && result.related_regulations.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-700">Related regulations</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.related_regulations.map((item: string, index: number) => (
                    <span
                      key={index}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {scanFindings.length > 0 && (
          <div className="mt-4 space-y-3 text-xs">
            <div className="text-[11px] font-semibold text-slate-700">Compliance scan findings</div>
            <div className="space-y-2">
              {scanFindings.map((finding, index) => (
                <div key={`${finding.phrase}-${index}`} className="rounded border border-red-200 bg-red-50 p-3">
                  <div className="font-semibold text-red-700">Redline: “{finding.phrase}”</div>
                  <div className="text-red-600 mt-1">{finding.message}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-600">Suggested: {finding.replacement}</span>
                    <button
                      type="button"
                      onClick={() => onApplyFix?.(finding.phrase, finding.replacement)}
                      className="rounded border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                    >
                      FIX
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {guardrailAlert?.riskLevel && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <div className="font-semibold">Supplier guardrail alert: {guardrailAlert.riskLevel}</div>
            {guardrailAlert?.matches?.[0]?.insight && (
              <div className="mt-1 text-sm font-medium">{guardrailAlert.matches[0].insight}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
