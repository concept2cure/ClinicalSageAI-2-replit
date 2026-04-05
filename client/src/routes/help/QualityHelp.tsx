import * as React from 'react';
import MarkdownView from '@/components/MarkdownView';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const SECTIONS = [
  { key: 'overview', title: 'Overview', src: '/help/quality/overview.md' },
  { key: 'sst', title: 'SST', src: '/help/quality/sst.md' },
  { key: 'dissolution', title: 'Dissolution', src: '/help/quality/dissolution.md' },
  { key: 'micro', title: 'Micro', src: '/help/quality/micro.md' },
  { key: 'coach', title: 'Coach & Gatekeeper', src: '/help/quality/coach_gatekeeper.md' },
  { key: 'policy', title: 'Policy', src: '/help/quality/policy.md' },
  { key: 'lineage', title: 'Lineage', src: '/help/quality/lineage.md' },
  { key: 'coa', title: 'COA & eCTD', src: '/help/quality/authoring_coa.md' },
  { key: 'live', title: 'Live & KPI', src: '/help/quality/live_kpi.md' },
];

export default function QualityHelp() {
  const [active, setActive] = React.useState(SECTIONS[0].key);
  const section = SECTIONS.find(s => s.key === active)!;
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Quality Help</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`w-full text-left px-2 py-1 rounded ${active === s.key ? 'bg-stone-100 border border-stone-300' : 'hover:bg-stone-50 border border-transparent'}`}
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
