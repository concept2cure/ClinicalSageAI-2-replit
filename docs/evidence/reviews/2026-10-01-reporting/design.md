# Reporting & analytics review, 2026-10-01: Design system, accessibility and microcopy

Generated from workflow `wf_527b6067-e34`: the lens's own report, then the refuting verifier's verdict on every blocker, high and medium. Low findings were not independently verified. Paths are as the agents wrote them. Line numbers are at the head they read and may have moved since. The README in this directory records which findings were fixed afterwards, and by which commit.

## DESIGN-1. [medium] [violation] Dark mode: the "Critical" / "Blocking" severity tag is a hardcoded #8a3a3a, 1.98:1 on the dark page and dimmer than "High"

- **Where:** `client/src/concept2cure/v2/styles/insights-v2.css:131`
- **Impact:** A customer using dark mode reads the tag that says an item blocks the report from reaching final at under half the WCAG 4.5:1 minimum for 10px text. Critical renders quieter than High (1.98 vs 5.70), so the emphasis is inverted on the screen whose job is to say what blocks a filing. Light mode is fine.
- **Evidence:** insights-v2.css:131 `.ro-sev.sev-critical{ color:#8a3a3a; } .ro-sev.sev-high{ color:var(--error); } .ro-sev.sev-medium{ color:var(--warning); }`. Consumers: Insights.tsx:650 `<span className="ro-sev sev-critical">Blocking</span>` (every blocker-list item) and Insights.tsx:646 `<span className={'ro-sev sev-' + sev}>{RO_SEV[sev]}</span>` (gap-list). Contrast computed from design-system/colors_and_type.css token values (not measured in a browser): #8a3a3a on light --bg-000 #faf9f5 = 7.26:1; on dark --bg-000 #262624 = 1.98:1 (1.86:1 on dark --bg-050 #2b2b29); the 'High' tier `--error` dark #ef7d7d = 5.70:1. Dark is a shipped theme (V2App.tsx:1151 `data-theme={prefs.dark ? 'dark' : undefined}`). insights-v2.css has zero `[data-theme="dark"]` rules (grep count 0). The gates are blind to it: ci:token-contrast checks 131 token pairs only and ci:design-system does not scan CSS for hex.
- **Suggested fix:** Drop the hex. Use a theme-aware token (`var(--error)`) and separate Critical from High by weight or an icon rather than a hand-picked hue, or add a light/dark `--error-strong` pair to design-system/colors_and_type.css and add the pair to check-token-contrast so the gate can see it.
- **Verifier:** real = `True`, severity = `low`.

  > The CSS problem is real, but no real user can hit the dark-mode impact the finding describes, so medium is too high.
  > 
  > What I confirmed at HEAD 9dbd9442 on concept2cure-v2:
  > - insights-v2.css:131 hardcodes the hex: `.ro-sev.sev-critical{ color:#8a3a3a; } .ro-sev.sev-high{ color:var(--error); } ...`. The stylesheet has no `[data-theme="dark"]` rule, and nothing else in client/src or design-system overrides sev-critical.
  > - The consumers are real but sit two lines lower than cited. Insights.tsx:648 renders `<span className={'ro-sev sev-' + sev}>{RO_SEV[sev]}</span>` (the gap list). Insights.tsx:652 renders `<span className="ro-sev sev-critical">Blocking</span>` (the blocker list).
  > - I recomputed the contrast ratios with the WCAG luminance formula and they match the finding. #8a3a3a is 1.98:1 on the dark --bg-000 #262624 (colors_and_type.css:359) and 1.86:1 on #2b2b29. The dark --error #ef7d7d (colors_and_type.css:456) is 5.70:1. In light mode #8a3a3a is 7.26:1. So if dark mode were on, Critical would render dimmer than High.
  > 
  > Where the finding fails is reachability. It says "Dark is a shipped theme (V2App.tsx:1151)". Dark mode is wired up, but nothing turns it on:
  > - `prefs.dark` defaults to false (V2App.tsx:166). The only thing that sets prefs is `set(k, v)` (V2App.tsx:304-312).
  > - Every `set('<key>'` call in V2App.tsx uses one of these keys: anaMode, anaOpen, liveDrive, railCollapsed, segment, welcomeDismissed. None sets 'dark'.
  > - No other file in client/src reads or writes the 'c2c-v2-prefs' localStorage key except V2App.tsx and two tests.
  > - Nothing in client/src or design-system uses prefers-color-scheme.
  > - No other code adds a 'dark' class or a data-theme attribute.
  > - This gap is already on record as docs/audit-2026-07/12-findings-register.md:3592, A11Y-009: "A complete dark theme is built and shipped but has no toggle — prefs.dark is read and never written".
  > 
  > So the only way a customer sees this is by editing localStorage by hand in DevTools. A regulated customer using the product as shipped always sees light mode, where the tag is 7.26:1 and darker than High, which is correct.
  > 
  > What is left is a latent defect plus a design-token violation: a hand-picked hex instead of a theme-aware token, which the token-contrast gate cannot see. It becomes the described dark-mode accessibility bug the moment A11Y-009 is fixed and a toggle ships. That makes it low, not medium.
  > 
  > The D2 and D6 registers do not already contain it. I grepped both evidence folders for 8a3a3a, sev-critical, ro-sev and dark mode and found nothing.

  Correction: Downgrade to low and reword as a latent defect. Fix the consumer line numbers: Insights.tsx:648 is the gap list and Insights.tsx:652 is the "Blocking" list, not 646 and 650. Change "Dark is a shipped theme" to: dark tokens exist, but no UI sets prefs.dark (V2App.tsx:166 defaults it to false, no set('dark', ...) call exists, and A11Y-009 in docs/audit-2026-07/12-findings-register.md:3592 already records the missing toggle). Rewrite the impact as: no customer sees this today. When a dark-mode toggle ships, the Critical/Blocking tag drops to 1.98:1 and renders dimmer than High (5.70:1), because insights-v2.css:131 hardcodes #8a3a3a instead of a theme-aware token. The suggested fix stands: use var(--error), or add an --error-strong light/dark pair and include it in ci:token-contrast. Do it before the dark toggle lands, or as part of the A11Y-009 fix.

## DESIGN-2. [medium] [violation] Dark mode: status chips and metric states darken a theme-aware colour toward #000, landing at 2.6-3.6:1 on the dark theme

- **Where:** `client/src/concept2cure/v2/styles/insights-v2.css:86`
- **Impact:** In dark mode the report's FINAL / PARTIAL badge, the Ready / Partial metric states and the plan-lock chip are hard to read. Same pattern stands in coverage-v2.css (not new), but these classes are what the seventh launch app now ships to every client.
- **Evidence:** insights-v2.css:86 `.ro-status.st-ok{ background:color-mix(in srgb,var(--success) 15%,transparent); color:color-mix(in srgb,var(--success) 72%,#000); }`; :87 `.ro-status.st-warn{ ... color:color-mix(in srgb,var(--warning) 74%,#000); }`; :105 `.ro-m-st.st-ready{ color:color-mix(in srgb,var(--success) 72%,#000); }`; :106 `.ro-m-st.st-partial{ color:color-mix(in srgb,var(--warning) 74%,#000); }`; :160 `.ro-lock-chip{ ... color:color-mix(in srgb,var(--warning) 74%,#000); ...}`. Mixing toward black is right on the light theme, where --success/--warning are mid-tones (computed 6.4-8.4:1), but the dark tokens (#8fae6e, #d99a58) are already tuned for a dark ground, so the same mix sinks them. Computed on the dark theme: st-ok text #677d4f on its tinted fill = 2.56:1; st-warn = 2.69:1; ro-lock-chip = 2.87:1; ro-m-st ready on --bg-000 = 3.34:1; partial = 3.61:1 (11px and 10.5px text needs 4.5:1). Consumer: Insights.tsx:690 `<span className={'ro-status st-' + stTone}>{report.status}</span>` is the report's own final/partial badge. No dark rules exist in this sheet and surface-text-ramp.css re-bases only `.ro-status.st-idle`.
- **Suggested fix:** Mix toward a theme-aware ink instead of a literal black, e.g. `color-mix(in srgb,var(--success) 72%,var(--text-100))`, or add ink tokens with light and dark values to design-system/colors_and_type.css. Add the pairs to ci:token-contrast. Re-measure in Chromium with `data-theme="dark"`; my ratios are arithmetic from token values.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this at HEAD on concept2cure-v2 and could not refute it.
  > 
  > **The cited rules are where the finding says.** In client/src/concept2cure/v2/styles/insights-v2.css:
  > - :86 `.ro-status.st-ok{ ... color:color-mix(in srgb,var(--success) 72%,#000); }`
  > - :87 `.ro-status.st-warn{ ... color:color-mix(in srgb,var(--warning) 74%,#000); }`
  > - :105 `.ro-m-st.st-ready{ color:color-mix(in srgb,var(--success) 72%,#000); }`
  > - :106 `.ro-m-st.st-partial{ color:color-mix(in srgb,var(--warning) 74%,#000); }`
  > - :161 `.ro-lock-chip{ ... color:color-mix(in srgb,var(--warning) 74%,#000); background:color-mix(in srgb,var(--warning) 13%,transparent); ... }`
  > 
  > **The dark tokens are already lightened for a dark background.** design-system/colors_and_type.css:308 opens `[data-theme="dark"] {`. Inside it:
  > - :359 `--bg-000: #262624`
  > - :452 `--success: #8fae6e; /* 6.10 / 5.32 */`
  > - :454 `--warning: #d99a58; /* 6.29 / 5.49 */`
  > 
  > Mixing those toward #000 gives text of #677d4f and #a17241.
  > 
  > **I recomputed the ratios with the WCAG formula and they match the report:**
  > - st-ok chip (15% fill over --bg-000): 2.56:1
  > - st-warn chip: 2.69:1
  > - ro-m-st ready on .ro-metric's own --bg-000 (insights-v2.css:100): 3.34:1
  > - ro-m-st partial: 3.61:1
  > - ro-lock-chip: 2.87:1 on --bg-000, and 2.69:1 inside `.ro-pack-card.is-locked`, whose background is --bg-050 (:151)
  > 
  > This text is 10.5–11px, so it needs 4.5:1. On the light theme the same rules measure 6.4–8.4:1, which is why the problem only shows in dark mode.
  > 
  > **Real users reach it.** Dark mode is a user preference: V2App.tsx:1100-1105 sets `data-theme="dark"` when `prefs.dark` is on, and the shell carries `dark` as well. The affected classes all render on the Insights surface:
  > - Insights.tsx:692 `<span className={'ro-status st-' + stTone}>{report.status}</span>`. :683 maps final→ok and partial→warn, so this is the badge on the governed report's FINAL/PARTIAL state.
  > - Insights.tsx:629 is the metric Ready/Partial label.
  > - Insights.tsx:791 is the plan-lock chip.
  > 
  > **Nothing else fixes it.** A search of client/src finds no other rule for st-ok, st-ready, st-partial or ro-lock. surface-text-ramp.css:679/693 adjusts only `.ro-status.st-idle` and `.ro-region` for dark mode. ci:token-contrast (scripts/ci/check-token-contrast.mjs) only checks pairs of tokens from colors_and_type.css and never resolves component color-mix rules. visual-qa:contrast does test dark mode, but it measures captured markup, and no .visual-qa capture in the repo contains these classes, so it has never measured them.
  > 
  > **Not already filed.** Neither docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30 nor docs/evidence/D6/2026-09-30-compliance-reports mentions contrast or dark mode.
  > 
  > **Severity: medium is right.** This fails WCAG 2.2 SC 1.4.3 in dark mode only, on the report's final/partial truth badge and the metric states of the launch app. It is not a blocker: the status is also shown as a word, so colour is not the only cue (SC 1.4.1 is not violated), and the light theme passes. It is more than low, because this is the governed-report status on a regulated product and the repo treats contrast as a gated requirement.

  Correction: The finding stands as reported, with one refinement. ro-lock-chip on a locked pack card sits on --bg-050, not --bg-000, so it measures 2.69:1 there, not 2.87:1. The fix is to mix toward a theme-aware ink (e.g. `var(--text-100)`) or add dark-mode overrides, and to add a dark-mode capture of a rendered report to visual-qa:contrast so the gate actually measures these classes.

## DESIGN-3. [medium] [violation] Canvas load failure has no retry control, tells the user to retry, and leaks "read-model" jargon; the loading state is a hand-rolled scaffold note

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:1065`
- **Impact:** When the overview read fails (the 503 PORTFOLIO_UNAVAILABLE path the D6 register DP-56 added), the customer sees a dead-end panel that says 'retry' and offers no way to, and must reload the page. 'read-model' is engineering vocabulary on a customer screen, and the surface is called 'Reporting & analytics' on the rail, not 'Insights canvas'. The two surfaces of the same launch app show loading and failure differently.
- **Evidence:** Insights.tsx:1065-1070 `<EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the reporting canvas" hint="The Insights canvas read-model didn't respond. It assembles your organization's subscription tier, ... — sign in and retry, or check that the service is reachable." />` with no `retry` prop. dataConnect.tsx:507 `/** UI standards §8: a failure always offers a way out. */`; dataConnect.tsx:589-590 `New code should call <ErrorState> directly`; dataConnect.tsx:576-580 retires the 'PASSIVE INSTRUCTION' as prose with nothing to click. The sibling surface does it right: ComplianceReports.tsx:145 `<ErrorState title="Couldn’t load the report catalog" message={st.message} retry={() => void load()} />`. Loading state: Insights.tsx:1057 `<div role="status" className="scaf-note" style={{ padding: '40px 20px' }}>Loading the reporting canvas…</div>` against ComplianceReports.tsx:143 `<EmptyState busy icon={I.scroll} title="Loading the report catalog…" />` (c2c-empty-ic-busy pulse, aria-live polite). `useLiveData` takes a `deps` array (dataConnect.tsx:349-353) so a retry counter is possible without a hook change.
- **Suggested fix:** Use `<ErrorState title=... message=... retry={...}/>` with an attempt counter in `useLiveData('/api/insights-canvas/overview', [path, attempt])`; rewrite the copy without 'read-model' / 'Insights canvas'; use `<EmptyState busy icon={I.barChart} title="Loading the reporting canvas…" />` for loading.
- **Verifier:** real = `True`, severity = `low`.

  > I read the code at HEAD on concept2cure-v2. The working tree has no changes to Insights.tsx. The finding's line numbers are off by about 30. The code it quotes is otherwise exact, and the mechanism is real.
  > 
  > Error branch: Insights.tsx:1087-1097 renders `<EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the reporting canvas" hint="The Insights canvas read-model didn't respond. ... — sign in and retry, or check that the service is reachable." />` with no `retry` prop. dataConnect.tsx:631-642 shows that `tone="error"` delegates to `<ErrorState ... retry={retry} />`. ErrorState draws the retry button only when `retry` is set (`{(retry || onDismiss) && ...}`), so no recovery control appears.
  > 
  > The hint does reach the screen. It goes in as `message`, and `redactInternals` (queryClient.ts:117) passes it through: none of the INTERNAL_MARKERS match "read-model" or "Insights canvas". So "read-model" appears on the customer's screen, next to the words "sign in and retry" with nothing to click.
  > 
  > Nothing else re-fetches on the same screen. `useLiveData('/api/insights-canvas/overview')` (Insights.tsx:847) uses the default deps `[path]`. The hook (dataConnect.tsx:349-393) only re-fetches when deps change, and there is no attempt counter or refetch function.
  > 
  > The test at complianceReportsReview.test.tsx:414-420 pins the alert and the navigation button, and does not check for a retry. The sibling surface does it properly: ComplianceReports.tsx:143-145 uses `<EmptyState busy .../>` for loading and `<ErrorState ... retry={() => void load()} />` for failure.
  > 
  > The D6 register only covers this canvas through DP-56. That entry fixed a failed read being shown as an empty state ("rendered as an error with a path to the reports"). It does not mention a retry or the wording, so this finding is not a duplicate.
  > 
  > Why I am lowering the severity from medium to low:
  > 1. It is not a dead end. Insights.tsx:1099-1101 renders a working "Audit & compliance reports" button. Going there and coming back remounts the surface and repeats the read. So "must reload the page" is overstated: there is a way out, just not an in-place retry.
  > 2. The failure is shown honestly. It is announced with role=alert and is never presented as empty data, so no regulated record, figure or verdict is misrepresented, and nothing is exploitable.
  > 3. The loading-state half is weak. The `role="status" className="scaf-note"` loading pattern appears 102 times across the v2 surfaces, so it is a convention, not a defect on this surface. It is still accessible: role=status is a polite live region.
  > 
  > What remains is a UX and wording defect: a passive "retry" instruction with no control, and engineering vocabulary ("read-model", "Insights canvas") on a screen the rail calls "Reporting & analytics".

  Correction: Severity low, not medium. The correct references are Insights.tsx:1078-1085 for loading and 1087-1097 for the error, not 1057/1065. The panel is not a full dead end: Insights.tsx:1099-1101 keeps an "Audit & compliance reports" button, and navigating there and back re-fetches the overview. The real defect is narrower: no in-place retry, the copy tells the user to "sign in and retry" with nothing to click, and it uses "read-model" / "Insights canvas" on a customer screen. The loading scaf-note is a convention used in about 102 places, not a defect specific to this surface. Fix: add an attempt counter to the deps of `useLiveData('/api/insights-canvas/overview', [attempt])` and render `<ErrorState title="Couldn't load the reporting canvas" message="Your organization's program readiness and portfolio rollup could not be read." retry={() => setAttempt(a => a + 1)} />`, keeping the reports button. Extend complianceReportsReview.test.tsx:414 to click the retry and check that the overview is fetched a second time.

## DESIGN-4. [medium] [violation] The reporting pane still credits AnA and speaks in the first person in places the identity test does not render

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:736`
- **Impact:** A customer who opens the Enterprise portfolio view is told AnA ranked their programs. Nothing ranked them: the order is the server's and the pane is a deterministic router. A refused plan or an unregistered report is reported as 'I won't fabricate one', which is the assistant persona the D2 change removed from the opener.
- **Evidence:** Insights.tsx:736 `{I.info} Readiness values are the governed scores per program — AnA ranks and frames them, it does not recompute them.`; :884 `— I won't show an estimated result on a plan that hasn't unlocked the governed model.`; :886 `so I can't run it against real data — I won't fabricate one.` These are posted into the thread bubble (`rc-ana-bub`). The file's own header and insightsNotAna.test.tsx:105-113 say `Nothing anywhere in the rendered pane should attribute this to AnA` and `No first person at all: there is no "I" here to speak`, but that test only renders the base canvas and waits for `.rc-ana-head` (test lines 90-93), so the portfolio dashboard and the run-failure thread messages are never asserted. The pane also keeps AnA's `*` mark in the `--ai` colour (Insights.tsx:1118, 1128, 1142, 1187; insights-v2.css:14, 21, 67). design-system/CLAUDE.md non-negotiable: 'Second person, direct.'
- **Suggested fix:** Rewrite the three strings in the second person with no AnA, e.g. 'Readiness values are the governed scores per program; they are not recomputed here.' Extend insightsNotAna.test.tsx to render the portfolio dashboard and the 403/404 run paths and assert /\bAnA\b|\bI\b/ is absent. Decide whether the `*` AI mark and `--ai` colour belong on a pane that disclaims being AI.
- **Verifier:** real = `True`, severity = `medium`.

  > The finding holds at HEAD (9dbd9442, concept2cure-v2). Only the line numbers have drifted.
  > 
  > 1. The portfolio dashboard still credits AnA. Insights.tsx:738 (reported as 736) reads: `<div className="ro-dash-note">{I.info} Readiness values are the governed scores per program — AnA ranks and frames them, it does not recompute them.</div>`. That is the persona claim the D2 change says it removed. The test header (insightsNotAna.test.tsx:9) names "I am ranking and framing them, not recomputing them" as the defect. The router reply was rewritten at Insights.tsx:509 ("ranked — not recomputed here"), but the dashboard note under the board was not.
  >    - **A real user reaches it in one click.** roSuggestForClient (Insights.tsx:405) always offers the chip 'Compare readiness across all my programs'. In roRouteIntent (338-353) that ties 1-1 between portfolio_readiness ('across') and compare_regions ('compare'), so the router returns matched=false with candidates[0]=portfolio_readiness, because the sort is stable and that key comes first.
  >    - roRouteReply (502-509) then builds the portfolio dashboard for any Enterprise org whose overview carries programs. The server fills `programs` only when the org is entitled (server/routes/insights-canvas-routes.ts:147, 248, 329).
  > 
  > 2. The run-failure messages still speak in the first person.
  >    - Insights.tsx:907 (reported as 884): `— I won't show an estimated result on a plan that hasn't unlocked the governed model.`
  >    - Insights.tsx:911 (reported as 886): `so I can't run it against real data — I won't fabricate one.`
  >    - Both are posted as `role: 'ana'` messages (913) and render in `.rc-ana-bub` next to the `*` mark (1174-1177). The code comment at 483-491 says this exact "I will not show an estimated result" sentence was removed ("the first person is gone"). It was removed from roRouteReply only.
  >    - **Both branches are reachable.** The server returns 403 with `requiredTier` (server/routes/report-os.ts:1494-1499) and 404 for an unknown type or a project not found (1467-1468, 1487).
  >    - The 403 path is easy to hit. The "Preview on <plan>" and plan buttons (1194, 1189) set a client-only `tierOverride`, so the client-side `roDecide` lock clears. The user then runs a report (for example 'What is my CRL risk?') and the server refuses it with `requiredTier`.
  > 
  > 3. The test does not cover any of this. insightsNotAna.test.tsx renders the initial canvas only: tier 'standard', `portfolio: { programs: null }`, and it waits for `.rc-ana-head` (lines 85, 94-97). It never sends a message, never builds a dashboard and never triggers a failed run. Its assertion "Nothing anywhere in the rendered pane should attribute this to AnA" (114-117) therefore passes without ever rendering lines 738, 907 or 911.
  > 
  > 4. The `*` mark styling is confirmed. `.rc-ana-mark`, `.rc-op-head` and `.rc-empty-mark` use `var(--ai)` (insights-v2.css:14, 21, 67). design-system/colors_and_type.css:160 documents `--ai` as "AnA assistant persona". So the pane that disclaims being AnA still carries AnA's mark and colour.
  > 
  > 5. One citation is weak. design-system/CLAUDE.md:63 says "Second person, direct. 'You', never 'we'", which bans "we", not "I". The stronger authority is the repo's own D2 claim, its code comments and its test.
  > 
  > 6. Not previously registered. Searching docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/ and the D6 compliance-reports register (DP-45..DP-57) for AnA, first person, persona and Insights.tsx turns up no entry for this.
  > 
  > 7. Severity. This is a copy and provenance defect: no figure is wrong and nothing leaks across tenants. But on a governed regulatory reporting surface it credits an AI with a ranking a deterministic router did. The repo's own test treats that as false provenance, and CLAUDE.md Rule 2 says numbers come from deterministic engines while the model only narrates. It also shows the D2 fix and its gate are incomplete while being reported as done. Medium is justified; it is not high, because the shown values themselves are correct governed scores.

  Correction: Line numbers at HEAD are Insights.tsx:738 (portfolio note), :907 (403 requiredTier message) and :911 (404 message), not 736, 884 and 886. The CSS lines (insights-v2.css:14, 21, 67) are correct; :47 (the busy-dot animation) also uses --ai. Narrow the design-system citation: design-system/CLAUDE.md:63 bans "we", not "I". The stronger authority is the repo's own claim at Insights.tsx:483-491 and insightsNotAna.test.tsx:9, 114-117, 135-136. A second, separate problem shares line 911: a 404 'Project not found' (report-os.ts:1487) is reported to the user as "isn't in your governed report registry", which gives the wrong reason as well as speaking in the first person. Fix as suggested: rewrite lines 738, 907 and 911 in the second person or impersonally, with no AnA. Extend insightsNotAna.test.tsx to cover three paths and assert /\bAnA\b/ and /\bI\b|I won't|I can't/ are absent from `.rc-ana-scroll` and `.rc-canvas`: an Enterprise overview with programs plus the 'Compare readiness across all my programs' chip, a 403 response with requiredTier, and a 404 response. Check that the new test fails against the current lines before fixing them.

## DESIGN-5. [medium] [violation] Provenance is reachable only by hover, and report tables are div grids with an aria-label on a role-less div

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:626`
- **Impact:** The visible text literally says 'Source on hover'. A keyboard or touch user cannot see where any figure came from, and a screen-reader user gets no table structure. `aria-label` on a generic div is not reliably exposed, and where a browser does use it, the provenance string can replace the metric value in the announcement.
- **Evidence:** Insights.tsx:626 `<div className="ro-m-val" title={prov} aria-label={prov}>`; :628 `{prov ? <div className="ro-m-prov" title={prov}>Source on hover</div> : null}`; :636 `<div className="ro-table" title={prov} aria-label={prov}>` with rows built from `<div className="ro-thead">` / `ro-trow` and `<span>` cells (:637-638), and the compare table at :765-767 likewise. The guardrail line promises 'Every metric, score and probability comes from a deterministic provider' and the empty state says 'Every value is provenance-linked to a governed source'. Contrast the compliance surface, which uses a real table: ComplianceReportResult.tsx:223 `<table className="reg-tbl" aria-labelledby={headingId}>` with `<th scope="col">`.
- **Suggested fix:** Render provenance as visible text or a native `<details>` disclosure beside the value. Render report tables as `<table className="reg-tbl">` (already defined in app-v2.css:487-490 and used by ComplianceReportResult). Drop `aria-label` from role-less divs.
- **Verifier:** real = `True`, severity = `low`.

  > I checked this against HEAD (9dbd9442, concept2cure-v2). The finding has two halves. The provenance half cannot be reached from the launch surface. The table half is real.
  > 
  > **1. Provenance shown only on hover: present in the code, but it never renders on the canvas.**
  > - The markup exists as described, at Insights.tsx:628 `<div className="ro-m-val" title={prov} aria-label={prov}>`, :630 `{prov ? <div className="ro-m-prov" title={prov}>Source on hover</div> : null}` and :638 `<div className="ro-table" title={prov} aria-label={prov}>`. The cited lines are off by 2.
  > - `prov` comes from `roProv(block.provenance)` (:542-550). It is undefined when the block has no provenance.
  > - The canvas runs every report with `scopeType: program.scope` (Insights.tsx:897). That scope is always `'program'`: CanvasLeadProgram `scope: 'program'` (Insights.tsx:149) and `toLeadProgram` sets `scope: 'program'` (server/routes/insights-canvas-routes.ts:192).
  > - GET /runs/:id/rendered (server/routes/report-os.ts:1829) calls `buildRenderedFromRun`. That function reuses a stored provenance-bearing report only for `reportTypeId === 'provenance.evidence_trace_report' && scopeType === 'document'` (report-os.ts:1550). Every other run goes to `renderReport`.
  > - `renderReport` (server/services/report-os/render/render.ts) never sets `provenance`. Its only mention of the word is the header comment on line 4. Its metric blocks are bare, e.g. :128 `execBlocks.push({ kind: 'metric', label: 'Confidence', value: input.confidence, unit: '%' })`, and so is its table at :162 `blocks: [{ kind: 'table', columns: ['Provider', 'Status', 'Note'], rows: providerRows }]`.
  > - So on this surface `prov` is always undefined. "Source on hover" is never shown, and React drops the undefined `title`/`aria-label`. No keyboard or screen-reader user meets a provenance string that only hover can reveal, and the aria-label cannot replace the metric value in what is announced. This half is latent: it would only matter if a provenance-bearing block reached ROBlock.
  > 
  > **2. Report tables built from div grids: confirmed and reachable.**
  > - Every generated report has a "Provider readiness" section (render.ts:162). ROBlock draws it as `<div className="ro-table">` / `<div className="ro-thead">` / `<div className="ro-trow">` with `<span>` cells (Insights.tsx:638-640). There is no table, row, columnheader or cell semantics.
  > - The regional compare dashboard has the same structure (Insights.tsx:767-769). A user reaches it by typing a compare/markets request (:347, :514).
  > - This fails WCAG 1.3.1 (Info and Relationships, Level A). A screen-reader user hears headers and cells as one flat run of text, with no header-to-cell association.
  > - The compliance surface does it correctly: ComplianceReportResult.tsx renders `<table className="reg-tbl">` with `<th scope="col">`.
  > - I found no test that covers this. Neither a11ySemantics.test.tsx nor any other test references `ro-table` or the Insights report body.
  > - It is not in the D2 / D6 register (DP-45..DP-57).
  > 
  > **Why low rather than medium.** The live defect is limited to table semantics. The tables are small (three columns for provider readiness; the compare grid is all "--"), and their reading order matches the visual order. The content can still be followed, though it is degraded. The provenance claim behind the medium rating does not hold at HEAD.
  > 
  > **A different problem the reporter's evidence brushes past (separate finding, not this one).** The canvas copy says "Every value is provenance-linked to its governed source" (Insights.tsx:536, :1224, and the empty-state hint at :1113). Yet the canvas path never produces a single provenance reference, because canvas runs are program-scoped and go through renderReport. That is a claim the code cannot back, which matters more than how provenance would be displayed.

  Correction: Retitle: "Reporting canvas report tables are div/span grids with no table semantics (WCAG 1.3.1, Level A)". Severity: low.

Evidence:
- Insights.tsx:638-640: ROBlock 'table' case rendering `ro-table` / `ro-thead` / `ro-trow` divs with `<span>` cells. It is reached on every generated report through render.ts:162 (the Provider readiness table).
- Insights.tsx:767-769: the compare dashboard grid.

Fix: render both as `<table className="reg-tbl">` with `<th scope="col">`, as ComplianceReportResult.tsx already does.

Drop the "provenance only on hover" claim as live behaviour. At HEAD `prov` is always undefined on the canvas: canvas runs are always `scope: 'program'` (insights-canvas-routes.ts:192 → Insights.tsx:897), and render.ts never emits `provenance`. Only document-scoped evidence-trace runs carry it (report-os.ts:1550). So "Source on hover" and the `title`/`aria-label` never render.

Keep that code as a latent note. If provenance ever reaches ROBlock, show it as visible text or in a `<details>` element, and drop `aria-label` from divs that have no role.

File separately: the canvas copy promises that "Every value is provenance-linked" (Insights.tsx:536, :1113, :1224), but the program-scoped generic renderer attaches no provenance to any block.

## DESIGN-6. [low] [violation] Plan selector: selected state is colour-only, and a client-side preview looks identical to the organisation's real plan

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:1167`
- **Impact:** A screen-reader user cannot tell which plan is selected. A sighted user who clicks Enterprise sees it highlighted as if it were their plan, and the pane then unlocks Enterprise-only report tiles until the server answers 403 on run.
- **Evidence:** Insights.tsx:1167-1169 `<div className="rc-tier" role="group" aria-label="Subscription tier"><span className="rc-tier-lbl">Plan</span>{RO_TIERS.map(t => (<button key={t.id} className={'rc-tier-b' + (tier === t.id ? ' on' : '')} onClick={() => setTierOverride(t.id)}>{t.label}</button>))}`. No `aria-pressed`; `.rc-tier-b.on` only changes background (insights-v2.css:54). The comment at Insights.tsx:835 says `tierOverride` is a local 'preview on another plan' control, but the row is labelled just 'Plan' and only the lock card says 'Preview on …' (:1151).
- **Suggested fix:** Add `aria-pressed={tier === t.id}`, label the row 'Preview plan' when `tierOverride` differs from `data.tier`, and show the real plan beside it.
- **Verifier:** not run (low).

## DESIGN-7. [low] [violation] RunFailure hand-rolls an inline alert banner instead of ErrorState variant="inline"; five of six failure kinds offer no recovery control

- **Where:** `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx:261`
- **Impact:** A refused, busy (429 / REPORT_IN_PROGRESS) or not-recorded (503) run renders in a banner unlike every other failure in the product, with no Try again control. This is a fifth parallel failure banner, which the dataConnect header says it exists to stop.
- **Evidence:** ComplianceReports.tsx:46-49 `const noticeStyle: React.CSSProperties = { display: 'flex', gap: 8, ... border: '1px solid var(--border)', borderRadius: 8, ... }`; :261-264 `<div role="alert" style={{ ...noticeStyle, ...(error.kind === 'not-recorded' ? { borderColor: 'var(--warning)' } : {}) }}>`; :214 the period problem is the same banner with `color: 'var(--error)'`. Only `kind === 'other'` uses `<ErrorState ... retry={retry}/>` (:257-259). dataConnect.tsx:456-488 lists the bespoke banners ErrorState replaced and says `inline — a WRITE failed; the form is still on screen and the banner sits next to the control that produced it ... both must offer a recovery path.`
- **Suggested fix:** Render RunFailure through `<ErrorState variant="inline" icon={FAILURE_ICON[kind]} title=... message=... retry={kind==='busy'||kind==='not-recorded' ? retry : undefined} />`. The `readersNotice` info box at :168 has no canonical equivalent and can stay.
- **Verifier:** not run (low).

## DESIGN-8. [low] [advisory] The compliance-reports files add 47 inline style objects, 5 CSSProperties constants and 24 font-size literals

- **Where:** `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx:22`
- **Impact:** No user-visible defect today. Every spacing, size and tone change to these screens is now a TSX edit that no stylesheet gate (token-cascade, text ramp, undefined-classes) can see, and the generated surface-text-ramp cannot re-base inline backgrounds (see the selected-card finding).
- **Evidence:** `grep -c "style={{"` at HEAD: ComplianceReports.tsx 9, ComplianceReportResult.tsx 27, ComplianceReportsVerify.tsx 11 = 47 lines, all created in commit 0224f43a (about 3% on top of the roughly 1,461 standing). Also 5 `React.CSSProperties` constants (ComplianceReports.tsx:41-49, :230; ComplianceReportResult.tsx:22) and 24 lines with `fontSize: <number>` (5 + 13 + 6). Semantic headings are resized inline, bypassing the h2 18px / h3 16px scale in colors_and_type.css:572-585: ComplianceReportResult.tsx:44 `<h2 style={{ fontSize: 15, ...}}>`, :125 and :272 `<h3 style={{ fontSize: 13, ...}}>`, :253 `<h3 ... fontSize: 13.5`. Sizes 10.5/12.5/13.5 sit off the 13px body rule. Colours are all `var(--token)`: no hex, rgb or hsl in any of the four TSX files.
- **Suggested fix:** Move the repeated shapes (muted, tag, notice, field, section headings) into a `.cr-*` block in project-home-v2.css or a new sheet that is a surface-text-ramp source; leave only data-dependent values inline.
- **Verifier:** not run (low).

## DESIGN-9. [low] [violation] Selected report card paints --bg-050 inline, so the muted "Selected" label sits at 4.30:1 (light) / 4.21:1 (dark)

- **Where:** `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx:190`
- **Impact:** When the card is selected and not hovered (keyboard use, or after the pointer leaves), its 12px 'Selected' label is below AA. Selection is also shown by border, aria-pressed and the word, so this is a legibility miss, not a lost signal.
- **Evidence:** ComplianceReports.tsx:190 `style={{ gap: 6, cursor: 'pointer', ...(selected ? { borderColor: 'var(--accent-200)', background: 'var(--bg-050)' } : {}) }}`; :199 `{selected && <span style={{ ...muted, ... }}>...Selected</span>}` where :41 `muted = { fontSize: 12, color: 'var(--text-400)' }`. surface-text-ramp.css:3-5 states `--text-400` 'clears 4.5:1 on --bg-000 and fails on every tinted surface (4.30 / 4.08 / 3.79)' and fixes it per selector (`.c2c-v2 .pj-card:hover` is listed at :187). An inline background has no selector, so nothing re-bases the text. Computed: #75736d on #f5f4ee = 4.30:1; dark #8e8c84 on #2b2b29 = 4.21:1.
- **Suggested fix:** Style the state with a class, e.g. `.pj-card[aria-pressed="true"]` in a ramp-source stylesheet, and regenerate surface-text-ramp.css; or use `--text-300` for that label.
- **Verifier:** not run (low).

## DESIGN-10. [low] [violation] Off-scale radii; `.rc-opener` renders 6px while its siblings are 10-13px

- **Where:** `client/src/concept2cure/v2/styles/insights-v2.css:20`
- **Impact:** Opener card, pack cards, lock card, tables and chart cards on one screen have visibly different corner radii (6/8/10/12/13px). Cosmetic, but on a screen the founder named as a central module.
- **Evidence:** insights-v2.css:20 `.rc-opener{ ... border-radius:var(--radius-md,12px); ...}`. colors_and_type.css:251-254 defines sm 4px, md 6px, lg 8px, xl 12px, so the token resolves to 6px and the '12px' fallback is dead. Literal radii in the sheet: 10px x4 (:39, 100, 109, 115), 12px x3 (:71, 148, 164), 9px (:24), 7px (:53), 5px (:82), 13px (:55, 34, 38, 46). design-system/CLAUDE.md: 'Any hex, font-family, or magic number in the codebase that isn't reading from these tokens is a bug.'
- **Suggested fix:** Map to `--radius-md/lg/xl`; if 12px was intended for the opener, use `var(--radius-xl)`.
- **Verifier:** not run (low).

## DESIGN-11. [low] [advisory] Dead hex fallbacks and motion literals in insights-v2.css

- **Where:** `client/src/concept2cure/v2/styles/insights-v2.css:14`
- **Impact:** Nothing visible today. If --ai is ever renamed, the light theme silently paints the dark-theme blue at 2.78:1 and the phantom gate stays green, because the token would have to be undeclared for it to fire.
- **Evidence:** `var(--ai,#6a9bcc)` at :14, :21, :47, :67. --ai is declared (colors_and_type.css:168 light #366a9e, :469 dark #6a9bcc), which is why ci:check-phantom-tokens stays at 9 (baseline 9) and none of the 9 are in these files. The fallback is the DARK value: on the light page it would be 2.78:1 (#6a9bcc on #faf9f5) against 5.37:1 for the real token. `var(--shadow-sm,0 2px 8px rgba(20,20,19,.05))` at :72, :149 is a literal shadow behind a declared token. Motion: :47 `animation:rcpulse 1.4s ease-in-out infinite` (design-system scale is --dur-fast/normal/slow/slower 100/200/300/500ms and --ease; the rule is '200ms ease-out'); reduced motion is handled at :176-178. :24-25 `.rc-preset-btn{ ... transition:background var(--dur) var(--ease); }` `.rc-preset-btn:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px);}`: the hover changes box-shadow and transform, which the transition does not cover, and the light-theme --shadow-sm is 0-alpha (colors_and_type.css:241), so hover is a 1px snap with no easing. The same literal-1.4s pulse and `.btn.primary:hover` pattern exist elsewhere in app-v2.css.
- **Suggested fix:** Remove the fallbacks. Add `transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)` to the transition list or drop the lift. Treat the 1.4s pulse as an accepted loading exception if it is documented.
- **Verifier:** not run (low).

## DESIGN-12. [low] [violation] ALL CAPS above the 10px metadata size, and Title Case report names in a hand-copied taxonomy

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:85`
- **Impact:** Mixed casing within one screen. If the server adds, renames or retires a report type, the pane keeps offering the old list: a missing type is never offered, and a retired one answers the 404 'isn't in your governed report registry' message.
- **Evidence:** design-system/CLAUDE.md: 'Sentence case everywhere. Never Title Case. Never ALL CAPS except 10px metadata labels.' `text-transform:uppercase` at 10.5px/11px in insights-v2.css: :21 `.rc-op-head`, :52 `.rc-tier-lbl`, :76 `.rc-ep-types`, :81 `.ro-rep-eyebrow`, :85 `.ro-status`, :92 `.ro-sec-h`, :111 `.ro-thead span`. Insights.tsx:85-113 `label: 'Executive Readiness Digest'`, `'Compliance & Audit Assurance Pack'`, `'FDA PMA Submission Readiness Pack'` ... (29 labels, shown as chips, pack tiles and report titles) next to sentence-case preset labels (Insights.tsx:272 `label: 'Pre-approval command pack'`). The list is a hand copy of server/services/report-os/taxonomy.ts (29 ids and labels, identical today by my diff); `RO_TYPES` is not exported, so no test can compare it with the server list, and the registry admits 'Contract ref (not yet a @shared file)' (ui-surface-registry.ui-v2.ts:850).
- **Suggested fix:** Sentence-case the taxonomy labels at the source (taxonomy.ts and the seed migration) and have the client read the type list from the server or from a `@shared` module with a parity test.
- **Verifier:** not run (low).

## DESIGN-13. [low] [violation] Portfolio summary chip lost its tone class, plus "1 programs" and mixed US/UK spelling

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:725`
- **Impact:** A one-program portfolio reads '1 programs'. The summary chip no longer looks like the status chips. Spelling flips between the two surfaces of one launch app.
- **Evidence:** Insights.tsx:725 `<span>{rows.length} programs</span>{avg == null ? <span className="ro-status">readiness not computed</span> : <span className="ro-status">avg readiness {avg}% ...` (introduced by 798bb6ef, now at HEAD). insights-v2.css:85 gives `.ro-status` only size, case, padding and radius; background and colour exist only on `.st-ok/.st-warn/.st-idle` (:86-88), so with no modifier it is uppercase grey text with 9px side padding and no pill, unlike the status pill in ROReport (:690). Singular is handled elsewhere (:507 `program${rows.length > 1 ? 's' : ''}`) but not here. Spelling: Insights.tsx:762 'programme-level figure' and ComplianceReports.tsx:140/:23 'organisation' against Insights.tsx:1070 'organization' and 441 vs 69 occurrences of organization/organisation across v2 surfaces.
- **Suggested fix:** Give the chip `st-idle`, or a tone computed from data. Pluralise. Pick one spelling for the app (US, 'organization', 'program').
- **Verifier:** not run (low).

## DESIGN-14. [low] [advisory] ROChart: 8px SVG caption, and chart branches that fabricate a series when the spec has none

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:593`
- **Impact:** Latent. If a server report starts emitting `trend` without points or `forecast_band`, the customer sees invented data on a governed report, in the form 'Fail closed, never fabricate' forbids. The ring caption is 8px.
- **Evidence:** Insights.tsx:568 `<text x="46" y="63" textAnchor="middle" fontSize="8" fill="var(--text-400)">of 100</text>` (below the 10px floor). :593 `const d: number[] = Array.isArray(s.points) ? (s.points as number[]) : [62, 66, 64, 70, 73];` and :575-580 `forecast_band` draws a fixed wiggle `[[0,a],[1,a+3],[2,a-2],[3,a+6],[4,a+2]]` with a +/-8 band around `Number(s.anchor) || 60`. Reachability: `grep chartType server/` finds only render/types.ts:44-49; no server emitter builds a chart block, so only the client-built `readiness_ring` is reachable today.
- **Suggested fix:** Render 'No series data' when `points` is absent, delete the synthetic jitter, and raise the caption to 10px or drop it.
- **Verifier:** not run (low).

## DESIGN-15. [low] [advisory] Convergence: a third sealed-report path was added and the legacy `report-engine` surface still stands

- **Where:** `shared/constants/ui-surface-registry.ts:730`
- **Impact:** No effect on a customer in production if the launch-scope gate hides report-engine, which I did not verify end to end. It is a standing parallel path the Zero-duplication working agreement says to migrate and delete in the same change. This repo's CLAUDE.md has no 'UI Convergence and Legacy Surface Deletion' section, so I am applying the working-agreement rule only.
- **Evidence:** ui-surface-registry.ts:730-746 `id: 'report-engine', label: 'Report engine', navTier: 'specialist' ... notes: 'Immutable report records, cryptographic seal, and the provenance behind every figure.'`; shared/navigation/index.ts:126 `{ id: 'report-engine', label: 'Report engine', description: 'The reporting / analytics report engine.' ...}`; surfaceViews.ts:561 `'report-engine': { component: ReportEngine }`; ReportEngine.tsx is headed 'Reporting & Analytics -- a protocol-analysis document producer'. It is not in LAUNCH_APPS (launch-scope.ts:123-133 lists only insights and compliance-reports for 'reporting'). Neither D2 nor D6 evidence discusses it (grep of both folders finds it only in test-suite listings). The change adds ComplianceReports (HMAC-SHA256 export seal) alongside report-os finalize (sha256 content hash) and report-engine's 'cryptographic seal'. Both new surfaces have `uiKit: null` (ui-surface-registry.ui-v2.ts:843, :862).
- **Suggested fix:** Record in the evidence whether report-engine is deleted, hidden or kept, and which file now delivers its outcome. Run the deletion-history search the working agreement requires before removing it.
- **Verifier:** not run (low).

## What the lens found clean

- GATE PASS ci:design-system (npm run ci:design-system, exit 0): `[design-system] OK — no icon-library, spring/bounce or inline <style> violations on live concept2cure surfaces.`
- GATE PASS ci:token-contrast (exit 0): `token-contrast: 131 pairs checked — text ≥ 4.5:1, non-text ≥ 3:1. 15 documented exceptions ... held at or above their recorded ratios.` It checks token pairs only; it cannot see the #8a3a3a hex or color-mix(...,#000) findings above.
- GATE PASS ci:check-phantom-tokens (exit 0): `9 phantom token(s) across 53 site(s) (baseline 9). OK — no new phantom tokens.` Delta 0. None of the 9 (--danger, --success-subtle, --v2-radius-*, --danger-subtle, --m, --accent-050, --success-strong) appear in Insights.tsx, ComplianceReport*.tsx or insights-v2.css. All 24 tokens these files use are declared (--ai, --text-100..400, --border, --border-control, --accent-000/100/200, --accent-strong, --accent-on-strong, --bg-000/050/100/200, --warning, --error, --success, --radius-md/lg, --dur, --ease, --shadow-sm, --font-serif).
- GATE PASS ci:check-chip-tones (exit 0): `OK — 140 literal tone use(s), all 28 resolve to a CSS rule.`
- GATE PASS ci:token-cascade (exit 0): `PASS — all 39 stylesheets resolve cleanly` (insights-v2.css 25/25, project-home-v2.css 34/34).
- GATE PASS ci:check-css-selector-shadowing (exit 0): `42 stylesheets, 21 known shadowed selector(s), 0 new.` The gate is intra-file only; `.pj-card` is defined in four sheets (project-home-v2.css:37, app-v2.css:1118, journey-v2.css:94, surface-text-ramp.css:187) and cross-file duplication is invisible to it (standing, not charged to this change).
- GATE PASS ci:check-orphaned-stylesheets (exit 0): `46 imported / 0 orphaned (0 lines, baseline 0).` Delta 0.
- Extra read-only gates, all exit 0: ci:undefined-css-classes (every static className in v2 is defined, 2 reviewed exceptions), ci:check-shell-css-collisions (22, baseline 22, 0 new), ci:frozen-theme-aliases (OK), ci:internals-in-copy (no new occurrences), check:microcopy (404 files, no exclamations or pictographs).
- All gates were re-run at HEAD 08ed96a9. HEAD moved from f6d2c089 during the audit when another actor committed 798bb6ef (Insights.tsx, portfolio null readiness). Line numbers above are at 08ed96a9. `git status --short` was empty after the final run: no gate wrote a baseline report, so there was nothing to restore with `git checkout --`. Early in the session I saw modified server/ files and Insights.tsx in the working tree; they were not mine and have since been committed.
- Icon registry: every I.<key> used resolves in v2/icons.tsx: scroll :170, lock :197, check :193, clock :194, alertTriangle :165, shieldCheck :200, download :191, fileText :157, barChart :161, grid :138, sparkles :139, right :183, arrowUp :184, info :166, copy :182. Registry surface icons 'barChart' (ui-surface-registry.ui-v2.ts:841) and 'fileCheck' (icons.tsx:148) exist. The `I.download || I.fileText`, `I.barChart || I.fileText/I.grid`, `I.arrowUp || I.right` fallbacks (Insights.tsx:704, 1086, 1175, 1198) are dead code but harmless.
- No hex, rgb() or hsl() in any of Insights.tsx, ComplianceReports.tsx, ComplianceReportResult.tsx, ComplianceReportsVerify.tsx. No Tailwind arbitrary values (`w-[..]`) and zero imports from `client/src/components/ui/`, consistent with the shell baseline.
- ComplianceReports.tsx reuses the real shared primitives: `EmptyState busy` for loading (:143), `ErrorState` with retry for a catalog failure (:145) and an `other` run failure (:258), `.c2c-input` date inputs with `htmlFor` labels (:239, :244), `.btn primary/ghost`, `.pj-card`, `.ph*`, `.page-inner`, `ComplianceReportResult.tsx` real `<table className="reg-tbl">` with `th scope="col"` and `.mono`. C2CForm (C2CForm.tsx:75) is a right-side drawer, so it is not a missed reuse for the inline period form.
- Dark-mode token completeness for ComplianceReports: every foreground it sets is a token that has light and dark values (--text-200/300/400, --error, --warning, --success, --border); surfaces inherit `.pj-card` bg. The only dark gap is the inline --bg-050 selected card (finding above).
- Insights.tsx's `.sp-primary` Export button is styled by journey-v2.css:280, loaded globally by V2App.tsx:84; `.scaf-note`, `.sr-only`, `.pj-card-h-go`, `.ro-dash-progline` (app-v2.css:3792) are defined and loaded. `.rc-typing` has a prefers-reduced-motion rule (insights-v2.css:176-178). No spring/bounce motion.
- Convergence at the registry level is clean: both surfaces are registered once (surfaceViews.ts:397, :493), both lazy chunks, both under the `reporting` app in launch-scope.ts:123-133; AdminSurfaces.tsx:1175 and Insights.tsx link into compliance-reports.
- Nothing in the D2 README or the D6 register (DP-45..DP-57) covers design-system conformance, so none of the findings above re-report a registered item.

## What the lens did not cover

- Contrast ratios are arithmetic from design-system/colors_and_type.css token values with a sRGB luminance formula; I did not render either surface in Chromium in light and dark and measure computed colours. The two dark-mode contrast findings should be confirmed that way before sign-off.
- I did not run the vitest suites for these surfaces (insightsNotAna, insightsHonestCopy, insightsExportProducesFile, complianceReports*) or the Playwright/e2e specs, so the 'test does not render the dashboard' claim comes from reading the test source.
- I did not run any gate with --write-baseline, any ui-surface/launch-scope gate, or the e2e access-control spec.
- Server families (/api/insights-canvas, /api/insights, /api/report-os, /api/audit), complianceReportsModel.ts and complianceReportData.ts logic, entitlement and authorisation were out of scope for this lens. I read complianceReportsModel.ts only for the copy and failure-kind shapes.
- design-system/ui_kits has no reference for either surface (both registry entries have `uiKit: null`), so I could not compare layout 1:1 against a kit as design-system/CLAUDE.md asks. The `.rc` / `.ro-*` CSS header says it is a port of insights.jsx and report-os-render.jsx; I did not locate those sources.
- Responsive behaviour below 1000px (the `.rc` grid drops to a 340px rail column and has no narrower breakpoint) and print/PDF styling were not examined.
- The dead `.ro-metric{ width:auto !important }` (insights-v2.css:100) and div-inside-button markup on `.ro-pack-card` / `.rc-empty-preset` (Insights.tsx:796, 1197) were noted but not charged: standing patterns with no user-visible effect found.

## Files read

- `CLAUDE.md`
- `client/src/concept2cure/v2/surfaces/Insights.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportsVerify.tsx`
- `client/src/concept2cure/v2/surfaces/complianceReportsModel.ts`
- `client/src/concept2cure/v2/styles/insights-v2.css`
- `client/src/concept2cure/v2/styles/project-home-v2.css`
- `client/src/concept2cure/v2/styles/app-v2.css`
- `client/src/concept2cure/v2/styles/surface-text-ramp.css`
- `client/src/concept2cure/v2/styles/journey-v2.css`
- `client/src/concept2cure/v2/icons.tsx`
- `client/src/concept2cure/v2/dataConnect.tsx`
- `client/src/concept2cure/v2/C2CForm.tsx`
- `client/src/concept2cure/v2/surfaceViews.ts`
- `client/src/concept2cure/v2/__tests__/insightsNotAna.test.tsx`
- `design-system/CLAUDE.md`
- `design-system/colors_and_type.css`
- `.claude/skills/concept2cure-v2-design-system.md`
- `shared/constants/ui-surface-registry.ui-v2.ts`
- `shared/constants/ui-surface-registry.ts`
- `shared/constants/launch-scope.ts`
- `server/services/report-os/taxonomy.ts`
- `server/services/report-os/render/types.ts`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/README.md`
- `scripts/ci/check-phantom-tokens.mjs`
- `scripts/ci/css-selector-shadowing-baseline.json`
