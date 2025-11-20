import * as React from 'react';
import { useState } from 'react';
import MarkdownView from '@/components/MarkdownView';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const SECTIONS = [
  { key: 'overview', title: 'Overview', src: '/help/stability/overview.md' },
  { key: 'samples', title: 'Samples & Labels', src: '/help/stability/samples.md' },
  { key: 'results', title: 'Results & Review', src: '/help/stability/results.md' },
  { key: 'coc', title: 'Chain of Custody', src: '/help/stability/coc.md' },
  { key: 'signoff', title: 'Sign-offs & Compliance', src: '/help/stability/signoff.md' },
];

export default function StabilityHelp() {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find(s => s.key === active)!;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Stability Help</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`w-full text-left px-2 py-1 rounded ${active === s.key ? 'bg-sky-50 border border-sky-300' : 'hover:bg-slate-50 border border-transparent'}`}
            >
              {s.title}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle>{section.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownView src={section.src} />
        </CardContent>
      </Card>
    </div>
  );
}
