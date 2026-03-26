import React from 'react';
import { CheckCircle2, AlertTriangle, CircleDashed, Rocket, GitBranch, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'ready' | 'partial' | 'missing';
  detail: string;
}

interface WorkflowModel {
  name: string;
  owner: string;
  objective: string;
  path: string[];
}

interface CompetitorCapability {
  id: string;
  capability: string;
  weaveBio: 'yes' | 'partial' | 'unknown';
  artos: 'yes' | 'partial' | 'unknown';
  c2c: 'yes' | 'partial' | 'missing';
  inspectorTarget?: string;
  gapSummary?: string;
}

interface RemediationItem {
  id: string;
  title: string;
  detail: string;
  inspectorTarget: string;
  severity: 'high' | 'medium';
}

export interface EditorGAReadinessPanelProps {
  checks: ReadinessCheck[];
  models: WorkflowModel[];
  capabilities: CompetitorCapability[];
  remediationQueue: RemediationItem[];
  onOpenInspector?: (id: string) => void;
  onSnooze?: () => void;
  onClose?: () => void;
}

const statusStyles: Record<ReadinessCheck['status'], string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
};

function statusIcon(status: ReadinessCheck['status']) {
  if (status === 'ready') return <CheckCircle2 className="w-4 h-4" />;
  if (status === 'partial') return <AlertTriangle className="w-4 h-4" />;
  return <CircleDashed className="w-4 h-4" />;
}

function competitorBadge(status: 'yes' | 'partial' | 'unknown' | 'missing') {
  if (status === 'yes') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Yes</Badge>;
  if (status === 'partial') {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Partial</Badge>;
  }
  if (status === 'missing') return <Badge variant="destructive">Missing</Badge>;
  return <Badge variant="secondary">Unknown</Badge>;
}

export function EditorGAReadinessPanel({
  checks,
  models,
  capabilities,
  remediationQueue,
  onOpenInspector,
  onSnooze,
  onClose,
}: EditorGAReadinessPanelProps) {
  const readyCount = checks.filter(c => c.status === 'ready').length;
  const score = checks.length ? Math.round((readyCount / checks.length) * 100) : 0;
  const parityCount = capabilities.filter(c => c.c2c !== 'missing').length;
  const parityScore = capabilities.length ? Math.round((parityCount / capabilities.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 bg-white">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Rocket className="w-4 h-4 text-violet-600" />
              GA & Competitive Readiness
            </CardTitle>
            <div className="flex items-center gap-1">
              {onSnooze && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onSnooze}>
                  Snooze
                </Button>
              )}
              {onClose && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
              <span>Session readiness</span>
              <span>{score}%</span>
            </div>
            <Progress value={score} className="h-2" />
            <p className="text-xs text-zinc-500 mt-1">
              {readyCount}/{checks.length} integration checks are fully ready.
            </p>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
              <span>Competitive parity (Weave/Artos baseline)</span>
              <span>{parityScore}%</span>
            </div>
            <Progress value={parityScore} className="h-2" />
            <p className="text-xs text-zinc-500 mt-1">
              {parityCount}/{capabilities.length} modeled capabilities are available or partially available.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Integration checks</h4>
        {checks.map(check => (
          <div
            key={check.id}
            className={cn('rounded-lg border p-3 text-xs flex items-start gap-2', statusStyles[check.status])}
          >
            <div className="mt-0.5">{statusIcon(check.status)}</div>
            <div>
              <div className="font-semibold">{check.label}</div>
              <div className="opacity-90 mt-0.5">{check.detail}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Competitor capability model
        </h4>
        {capabilities.map(item => (
          <Card key={item.id}>
            <CardContent className="pt-4 space-y-2">
              <div className="text-xs font-semibold text-zinc-900">{item.capability}</div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-zinc-500 mb-1">Weave Bio</div>
                  {competitorBadge(item.weaveBio)}
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Artos</div>
                  {competitorBadge(item.artos)}
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Concept2Cure</div>
                  {competitorBadge(item.c2c)}
                </div>
              </div>
              {item.gapSummary && <p className="text-[11px] text-zinc-500">{item.gapSummary}</p>}
              {item.inspectorTarget && item.c2c !== 'yes' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onOpenInspector?.(item.inspectorTarget!)}
                >
                  Open linked workflow
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Launch remediation queue
        </h4>
        {remediationQueue.length === 0 ? (
          <Card>
            <CardContent className="pt-4 text-xs text-emerald-700">
              All modeled readiness checks are satisfied for this session.
            </CardContent>
          </Card>
        ) : (
          remediationQueue.map(item => (
            <Card key={item.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-900">{item.title}</div>
                  <Badge variant={item.severity === 'high' ? 'destructive' : 'secondary'}>
                    {item.severity === 'high' ? 'High' : 'Medium'}
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-500">{item.detail}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onOpenInspector?.(item.inspectorTarget)}
                >
                  Resolve in workflow
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Use-case models</h4>
        {models.map(model => (
          <div key={model.name} className="rounded-lg border border-zinc-200 p-3 bg-zinc-50/60">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-semibold text-zinc-900">{model.name}</span>
            </div>
            <p className="text-xs text-zinc-600 mt-1">{model.objective}</p>
            <p className="text-[11px] text-zinc-500 mt-1">Owner: {model.owner}</p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {model.path.map((step, idx) => (
                <React.Fragment key={`${model.name}-${step}`}>
                  <span className="px-2 py-0.5 rounded bg-white border border-zinc-200 text-[11px] text-zinc-700">
                    {step}
                  </span>
                  {idx < model.path.length - 1 && <Link2 className="w-3 h-3 text-zinc-300" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default EditorGAReadinessPanel;
