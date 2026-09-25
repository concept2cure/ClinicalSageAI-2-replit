// @vitest-environment jsdom
/**
 * The AnA rail renders AnA's markdown as elements, never as literal symbols,
 * and never lets model text reach the DOM as raw HTML. WJ found (2026-09-21)
 * that the rail printed "## Overview" and "**term**" verbatim — a memo-shaped
 * answer looked worse than it was, and a prose answer with one bold term
 * showed asterisks. The person's own text stays plain text.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';

afterEach(() => cleanup());

// The rail's message body, exactly as Shell.tsx renders it (kept in step by
// the Shell smoke suites; this pins the renderer contract the rail relies on).
function RailBody({ role, body }: { role: 'ana' | 'user'; body: string }) {
  return role === 'ana' ? (
    <div className="ana-msg-bd ana-md" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(body) }} />
  ) : (
    <div className="ana-msg-bd">{body}</div>
  );
}

describe('AnA rail — markdown in AnA messages', () => {
  it('renders a bold term, a list and a header as elements, not symbols', () => {
    const { container } = render(
      <RailBody role="ana" body={'The **estimand** is fixed.\n\n- ITT\n- Per-protocol\n\n### Basis\nICH E9(R1).'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('estimand');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('h3')?.textContent).toBe('Basis');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('###');
  });

  it('never lets model text reach the DOM as script or an event handler', () => {
    const { container } = render(
      <RailBody role="ana" body={'ok <script>window.__pwned = 1</script> <img src=x onerror="window.__pwned=1"> done'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror/i);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("keeps the person's own text plain — it is not parsed as markup", () => {
    const { container } = render(<RailBody role="user" body={'**not bold** <b>not html</b>'} />);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('**not bold** <b>not html</b>');
  });
});
