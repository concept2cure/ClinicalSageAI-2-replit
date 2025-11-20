import * as React from 'react';
import { useEffect, useState } from 'react';
import { marked } from 'marked';

export default function MarkdownView({ src }: { src: string }) {
  const [html, setHtml] = useState<string>('Loading…');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`${src} -> ${r.status}`);
        const md = await r.text();
        if (!alive) return;
        setHtml(marked.parse(md) as string);
      } catch (e: any) {
        setHtml(`<div style="color:#b91c1c">Failed to load: ${src}<br/>${e?.message || e}</div>`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [src]);
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
