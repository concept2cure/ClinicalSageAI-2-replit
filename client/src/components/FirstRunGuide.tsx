import * as React from 'react';
import { Button } from '@/components/ui/button';

type Step = {
  title: string;
  body: React.ReactNode;
  cta?: { label: string; href?: string; onClick?: () => void };
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  steps: Step[];
  startIndex?: number;
};

export default function FirstRunGuide({
  open,
  onClose,
  title = 'Welcome to Stability',
  steps,
  startIndex = 0,
}: Props) {
  const [i, setI] = React.useState(startIndex);
  React.useEffect(() => {
    setI(startIndex);
  }, [startIndex]);
  if (!open) return null;

  const step = steps[i] || steps[steps.length - 1];

  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[520px] max-w-[95vw] bg-white h-full shadow-xl border-l animate-in slide-in-from-right">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">{title}</div>
          <button
            className="text-slate-500 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto h-full">
          <div className="text-lg font-medium">{step.title}</div>
          <div className="text-sm text-slate-700">{step.body}</div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500">
              Step {i + 1} of {steps.length}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
                Back
              </Button>
              {step.cta?.href && (
                <a
                  className="btn btn-outline px-3 py-1 border rounded text-sm"
                  href={step.cta.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {step.cta.label}
                </a>
              )}
              {step.cta?.onClick && (
                <Button variant="outline" onClick={step.cta.onClick}>
                  {step.cta.label}
                </Button>
              )}
              <Button
                onClick={() => setI(Math.min(steps.length - 1, i + 1))}
                disabled={i === steps.length - 1}
              >
                Next
              </Button>
              <Button variant="outline" onClick={onClose}>
                Finish
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
