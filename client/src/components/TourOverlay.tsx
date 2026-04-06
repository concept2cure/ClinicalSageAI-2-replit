import * as React from 'react';
import { createPortal } from 'react-dom';

type Step = {
 id: string; // unique ID
 target: string; // CSS selector for the anchor (e.g., [data-tour="quality.sst"])
 title: string;
 body: React.ReactNode;
};

type Props = {
 open: boolean;
 onClose: () => void;
 steps: Step[];
 startIndex?: number;
 onStepChange?: (step: Step, index: number) => void;
};

function getRect(selector: string) {
 const el = document.querySelector(selector) as HTMLElement | null;
 if (!el) return null;
 const r = el.getBoundingClientRect();
 return {
 top: r.top + window.scrollY,
 left: r.left + window.scrollX,
 width: r.width,
 height: r.height,
 };
}

export default function TourOverlay({ open, onClose, steps, startIndex = 0, onStepChange }: Props) {
 const [i, setI] = React.useState(startIndex);
 const [rect, setRect] = React.useState<{
 top: number;
 left: number;
 width: number;
 height: number;
 } | null>(null);

 React.useEffect(() => {
 setI(startIndex);
 }, [startIndex]);

 // Tell the parent when the step changes
 React.useEffect(() => {
 if (!open) return;
 const step = steps[i];
 if (step && onStepChange) onStepChange(step, i);
 }, [open, i, steps, onStepChange]);

 React.useEffect(() => {
 function calc() {
 if (!open) return;
 const r = getRect(steps[i]?.target || '');
 setRect(r);
 if (r) {
 // ensure the target is in view
 const padding = 80;
 const y = Math.max(0, r.top - padding - window.scrollY);
 window.scrollTo({ top: r.top - padding, behavior: 'smooth' });
 }
 }
 calc();
 const onResize = () => calc();
 window.addEventListener('resize', onResize);
 window.addEventListener('scroll', onResize, { passive: true });
 return () => {
 window.removeEventListener('resize', onResize);
 window.removeEventListener('scroll', onResize);
 };
 }, [open, i, steps]);

 if (!open) return null;
 const step = steps[i] || steps[steps.length - 1];

 // Fallback if target not found: show center tooltip
 const tooltipStyle: React.CSSProperties = rect
 ? {
 position: 'absolute',
 top: rect.top + rect.height + 12,
 left: Math.max(12, rect.left),
 zIndex: 10002,
 maxWidth: 360,
 }
 : {
 position: 'fixed',
 top: 120,
 left: 24,
 zIndex: 10002,
 maxWidth: 360,
 };

 return createPortal(
 <div style={{ position: 'fixed', inset: 0 as any, zIndex: 10000 }}>
 {/* Backdrop */}
 <div
 onClick={onClose}
 style={{ position: 'absolute', inset: 0 as any, background: 'rgba(0,0,0,0.35)' }}
 />

 {/* Highlight box (if rect) */}
 {rect && (
 <div
 aria-hidden
 style={{
 position: 'absolute',
 top: rect.top,
 left: rect.left,
 width: rect.width,
 height: rect.height,
 borderRadius: 8,
 boxShadow: '0 0 0 9999px rgba(0,0,0,0.35), 0 0 0 3px #a8a29e',
 pointerEvents: 'none',
 transition: 'top .15s, left .15s, width .15s, height .15s',
 zIndex: 10001,
 }}
 />
 )}

 {/* Tooltip card */}
 <div style={tooltipStyle} role="dialog" aria-modal="true" aria-label="Guided tour">
 <div
 style={{
 background: '#fff',
 border: '1px solid #e8e6dc',
 borderRadius: 8,
 padding: 12,
 boxShadow: '0 10px 20px rgba(0,0,0,.15)',
 }}
 >
 <div
 style={{
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'space-between',
 marginBottom: 8,
 }}
 >
 <div style={{ fontWeight: 600 }}>{step.title}</div>
 <button
 onClick={onClose}
 aria-label="Close"
 style={{
 border: 'none',
 background: 'transparent',
 cursor: 'pointer',
 color: '#8a8880',
 }}
 >
 ✕
 </button>
 </div>
 <div style={{ fontSize: 13, color: '#4a4a46' }}>{step.body}</div>
 <div
 style={{
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'space-between',
 marginTop: 10,
 }}
 >
 <div style={{ fontSize: 12, color: '#8a8880' }}>
 Step {i + 1} of {steps.length}
 </div>
 <div style={{ display: 'flex', gap: 8 }}>
 <button
 onClick={() => setI(Math.max(0, i - 1))}
 disabled={i === 0}
 style={{
 border: '1px solid #d6d3c8',
 background: '#fff',
 padding: '4px 8px',
 borderRadius: 6,
 cursor: i === 0 ? 'not-allowed' : 'pointer',
 }}
 >
 Back
 </button>
 <button
 onClick={() => setI(Math.min(steps.length - 1, i + 1))}
 disabled={i === steps.length - 1}
 style={{
 border: '1px solid #78716c',
 color: '#78716c',
 background: '#fff',
 padding: '4px 8px',
 borderRadius: 6,
 cursor: i === steps.length - 1 ? 'not-allowed' : 'pointer',
 }}
 >
 Next
 </button>
 <button
 onClick={onClose}
 style={{
 border: '1px solid #d6d3c8',
 background: '#fff',
 padding: '4px 8px',
 borderRadius: 6,
 }}
 >
 Finish
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>,
 document.body
 );
}
