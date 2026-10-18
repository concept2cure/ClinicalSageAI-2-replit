# Live company-document browser verification

`smoke-result.json` records an actual Chromium run against the locally running
application, with password sign-in and the authenticated browser session. No
requests or responses were mocked. The local harness is
`/workspace/.cloud-setup/company-gap-browser-check.cjs` and uses the existing
private onboarding configuration without printing credential values.

Verified through the mounted Admin Settings screen:

- The designer renders saved data and an unsaved header draft. Keyboard focus,
  readable text and 200% preview zoom work. Actual sample-paragraph computed
  typography changes from Times New Roman 9px at 100% to 18px at 200%.
- The unsaved Word proof downloads through the actual audited renderer. Its
  OOXML contains `UNSAVED LETTERHEAD PREVIEW`; the result records byte size and
  SHA-256. The saved company profile and revision remain unchanged.
- Permissions, retained-history and named-design reads complete; admitted
  project choices load for staging. No design or permission mutation is sent.
- Legal inventory and an explicit search return actual HTTP 200 results with
  scoped counts. A deliberate browser-context offline interval produces a real
  transport failure and visible retry state, without claiming an empty library.
  Restoring connectivity and choosing Retry sends the same search and filter,
  returns HTTP 200 and restores the results.
- The Account dialog opens the reused company settings independently of the
  admin roster. The company panel has equal client/scroll widths of 477px;
  its designer and preview stack within the narrow drawer.

The run has no JavaScript page errors, failed API responses or unexpected
failed requests. Two expected console resource errors are retained: the
intentional offline inventory request, and Google Fonts blocked by the cloud
network policy. Native fallback fonts keep the application usable.

The local organization has no retained presentation revision records to compare.
A separate delegated-member login was not available. Those checks are explicitly
unexercised in the result; focused UI and server tests cover their governed paths.
This browser pass does not claim live publication, default activation, permission
changes, source approval or filing transmission.

The browser run exposed and verified fixes for two presentation defects: the
Account drawer previously overflowed horizontally (530px content in 477px), and
application paragraph styling previously prevented the preview body font and
zoom from taking effect. Container-responsive layout and scoped font inheritance
correct those measured failures.

Screenshots retain the designer, governance panels, real offline refusal and
recovery, and the Account settings/preview layouts. No password, token or legal
document prose is captured.
