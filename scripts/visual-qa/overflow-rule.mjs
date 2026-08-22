/**
 * What counts as sideways overflow, as one function shared by two callers.
 *
 * `check-overflow.mjs` runs it in real Chromium over CAPTURED FRAGMENTS, at the
 * width each fragment declares. `check-live-overflow.mjs` runs the SAME function
 * against the RUNNING APP, over the real shell.
 *
 * One copy on purpose, and the same argument `a11y-rules.mjs` makes: these are
 * judgement calls — that an element which clips or scrolls cannot spill, that an
 * absolutely positioned `::after` in an element's own margin is decoration and
 * not a defect — and two copies of a judgement call is two places for it to
 * drift, which is how a guard starts disagreeing with the thing it guards.
 *
 * ── Why two callers at all ───────────────────────────────────────────────────
 * A fragment has no ancestors. That is what makes the fragment gate cheap and
 * what makes it blind: a register row given an explicit `min-width` measured
 * exactly right in a fragment and, in the app, propagated that minimum up
 * through a flex ancestor whose automatic minimum size is its min-content width
 * — so the whole page scrolled sideways instead of the table. Neither runtime
 * can see what the other sees, and neither is the authority.
 *
 * The function is handed to the page as source (`fn.toString()`), because
 * Playwright serialises an evaluated function and a serialised function cannot
 * close over an import.
 *
 * @module scripts/visual-qa/overflow-rule
 */

/**
 * Find every element under `rootSelector` whose own in-flow content is wider
 * than its box. Runs in the browser; takes no closures.
 *
 * @param {number} tolerance sub-pixel rounding to ignore
 * @param {string} rootSelector the box that scopes the search
 * @returns {{id: string|null, selector: string, scrollWidth: number, clientWidth: number}[]}
 */
export function measureOverflow(tolerance, rootSelector) {
  const srOnly = (el) => {
    const cs = getComputedStyle(el);
    return (
      (el.clientWidth <= 1 && el.clientHeight <= 1) ||
      cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
      cs.clipPath === 'inset(50%)'
    );
  };
  const overflows = (el) => el.scrollWidth > el.clientWidth + tolerance;
  const outOfFlow = (cs) => cs.position === 'absolute' || cs.position === 'fixed';

  const all = [...document.querySelectorAll(`${rootSelector} *`)].filter(
    (el) => el instanceof HTMLElement,
  );

  const candidates = all.filter((el) => {
    if (srOnly(el)) return false;
    if (!overflows(el)) return false;
    // Anything but `visible` means the author is containing it on purpose,
    // and only `visible` can push an ancestor sideways. `auto`/`scroll` scroll
    // deliberately; `hidden`/`clip` are how truncation is built —
    // `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` has
    // scrollWidth > clientWidth BY DESIGN, that being what makes the ellipsis
    // appear. An earlier rule here skipped only auto and scroll and reported
    // 27 "overflows" that were ellipsis elements doing their job. A tool that
    // flags correct markup teaches people to ignore it, and then it protects
    // nothing.
    return getComputedStyle(el).overflowX === 'visible';
  });
  if (candidates.length === 0) return [];

  // Take the out-of-flow boxes away and ask again. A candidate is never itself
  // hidden — an absolutely positioned element that overflows its OWN box is a
  // finding like any other.
  const keep = new Set(candidates);
  const style = document.createElement('style');
  style.textContent =
    '[data-vqa-drop-before]::before{content:none!important}' +
    '[data-vqa-drop-after]::after{content:none!important}';
  document.head.appendChild(style);
  for (const el of all) {
    if (!keep.has(el) && outOfFlow(getComputedStyle(el))) {
      el.style.display = 'none';
      continue;
    }
    for (const [pseudo, attr] of [
      ['::before', 'data-vqa-drop-before'],
      ['::after', 'data-vqa-drop-after'],
    ]) {
      const pcs = getComputedStyle(el, pseudo);
      if (pcs.content !== 'none' && outOfFlow(pcs)) el.setAttribute(attr, '');
    }
  }

  return candidates.filter(overflows).map((el) => {
    const cls = String(el.getAttribute('class') || '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('.');
    return {
      id: el.id || null,
      selector: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
}

/** The page-side installer both checks use, so the injection is not duplicated either. */
export function browserSource() {
  return `window.__measureOverflow = ${measureOverflow.toString()};`;
}
