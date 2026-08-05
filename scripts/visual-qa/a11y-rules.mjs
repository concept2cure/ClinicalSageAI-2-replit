/**
 * The statically-detectable WCAG rules, as one function shared by two callers.
 *
 * `check-a11y-semantics.mjs` runs these in real Chromium over captured markup.
 * `client/src/concept2cure/v2/__tests__/a11ySemantics.test.tsx` runs the SAME
 * function in jsdom, in CI, as a ratchet.
 *
 * One copy on purpose. These rules encode judgement calls — that `alt=""` is
 * correct and a missing `alt` is not; that an SVG `<title>` names its button;
 * that a placeholder does not name a field — and two copies of a judgement call
 * is two places for it to drift, which is how a guard starts disagreeing with
 * the thing it guards.
 *
 * Everything here needs only the DOM: no layout, no cascade, no computed style.
 * That is what lets it run in jsdom and therefore in CI without a browser or a
 * build. Contrast is the opposite — it needs real rendering — and lives in
 * `check-contrast.mjs`.
 *
 * @module scripts/visual-qa/a11y-rules
 */

/**
 * Audit a DOM subtree. Returns one finding per violation.
 *
 * Pass the document's root element (`.c2c-v2` in the shell, or a test
 * container). `doc` is passed explicitly so this works identically under
 * Chromium's `document` and jsdom's.
 */
export function auditA11y(root, doc) {
  const findings = [];
  const add = (rule, el, detail) =>
    findings.push({
      rule,
      detail,
      selector:
        el.tagName.toLowerCase() +
        (typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''),
      html: el.outerHTML.slice(0, 140),
    });

  /** Accessible name, resolving the cases that actually occur in this UI. */
  const accName = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (t) return t;
    }
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    const text = el.textContent?.trim();
    if (text) return text;
    const title = el.getAttribute('title')?.trim();
    if (title) return title;
    // An icon-only button IS named if its SVG carries <title> or aria-label.
    const svgTitle = el.querySelector('svg > title')?.textContent?.trim();
    if (svgTitle) return svgTitle;
    const svgLabel = el.querySelector('svg[aria-label]')?.getAttribute('aria-label')?.trim();
    if (svgLabel) return svgLabel;
    if (el.tagName === 'INPUT') {
      const v = el.getAttribute('value')?.trim();
      if (v && ['submit', 'button', 'reset'].includes(el.getAttribute('type') ?? '')) return v;
    }
    return '';
  };

  // SC 4.1.2 — a control with no accessible name announces as "button" and
  // nothing else. In a dense regulatory UI full of icon buttons this is the
  // most common real blocker.
  const CONTROLS =
    'button, a[href], [role="button"], [role="link"], [role="tab"], ' +
    '[role="radio"], [role="checkbox"], [role="menuitem"]';
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (!accName(el)) add('4.1.2 control has no accessible name', el, el.tagName.toLowerCase());
  }

  // SC 3.3.2 — a placeholder is not a label. It is not exposed as the
  // accessible name by every AT, and it disappears the moment the user types,
  // so the field's purpose vanishes exactly when it might need re-checking.
  //
  // The `for` targets are collected once and compared as ATTRIBUTE VALUES. The
  // obvious alternative — `querySelector(\`label[for="${id}"]\`)` — requires
  // escaping the id into CSS selector syntax, and the version of that written
  // here escaped quotes but not backslashes, so an id containing `\"` would have
  // terminated the attribute string early. (CodeQL js/incomplete-sanitization,
  // alert 2637.) `CSS.escape` is absent in some jsdom versions, so the fix is
  // not to escape better but to stop building a selector from data at all:
  // string equality on the attribute needs no escaping and cannot be got wrong.
  const labelledIds = new Set(
    [...root.querySelectorAll('label[for]')].map((l) => l.getAttribute('for')),
  );
  for (const el of root.querySelectorAll('input, select, textarea')) {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const id = el.getAttribute('id');
    const hasFor = id != null && labelledIds.has(id);
    if (hasFor || el.closest('label') || accName(el)) continue;
    add(
      '3.3.2 form field has no label',
      el,
      el.getAttribute('placeholder')
        ? 'placeholder only — a placeholder is not a label'
        : 'no label, no aria-label',
    );
  }

  // SC 1.1.1 — alt="" is CORRECT for decoration and is not reported. A MISSING
  // alt is, because a screen reader then reads the filename.
  for (const el of root.querySelectorAll('img')) {
    if (!el.hasAttribute('alt')) add('1.1.1 img has no alt attribute', el, el.getAttribute('src') ?? '');
  }

  // SC 1.3.1 — heading structure is how a screen-reader user navigates a long
  // page, and these pages are long.
  const levels = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
    el,
    n: Number(el.tagName[1]),
  }));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].n - levels[i - 1].n > 1) {
      add('1.3.1 heading level skipped', levels[i].el, `h${levels[i - 1].n} -> h${levels[i].n}`);
    }
  }

  // SC 4.1.1 — aria-labelledby, aria-describedby and label[for] all resolve by
  // id. A duplicate points half of them at the wrong element, which is worse
  // than a missing name: it announces something confidently wrong.
  const seen = new Set();
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    if (seen.has(id)) add('4.1.1 duplicate id', el, `#${id}`);
    else seen.add(id);
  }

  // SC 2.4.3 — a positive tabindex jumps ahead of every natural control on the
  // page, wrecking tab order globally rather than locally.
  for (const el of root.querySelectorAll('[tabindex]')) {
    const t = Number(el.getAttribute('tabindex'));
    if (Number.isFinite(t) && t > 0) add('2.4.3 positive tabindex', el, `tabindex=${t}`);
  }

  return findings;
}

/**
 * Markup that exercises every rule, plus the CORRECT forms each rule must NOT
 * flag. Shared so both callers self-check identically.
 *
 * The false-positive half matters more than the detection half: a tool that
 * flags correct markup teaches people to ignore it.
 */
export const SELF_CHECK_HTML = `
  <button></button>
  <button aria-label="Close">x</button>
  <img src="a.png">
  <img src="b.png" alt="">
  <input type="text">
  <label for="ok">Named</label><input id="ok" type="text">
  <label for='odd\\"id'>Named the hard way</label><input id='odd\\"id' type="text">
  <div tabindex="3"></div>
  <span id="dup"></span><span id="dup"></span>
  <h2>a</h2><h4>b</h4>
`;

export const SELF_CHECK_EXPECTED = [
  '4.1.2 control has no accessible name',
  '3.3.2 form field has no label',
  '1.1.1 img has no alt attribute',
  '1.3.1 heading level skipped',
  '4.1.1 duplicate id',
  '2.4.3 positive tabindex',
];

/**
 * The correct forms above; a finding whose html matches any of these is a bug.
 *
 * The `odd\"id` case is the regression for alert 2637: an id carrying both a
 * backslash and a quote IS correctly labelled, and a selector built by string
 * interpolation would fail to find its label and report a false violation.
 */
export const SELF_CHECK_MUST_NOT_FLAG = [/aria-label="Close"/, /alt=""/, /id="ok"/, /odd/];
