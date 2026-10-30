# Actual-component RBM navigation browser proof

Installed /usr/bin/chromium + existing Playwright, private Vite fixture on127.0.0.1:5217.
No dependencies installed and no application source changed.

The probe imports the shipped Rail, AuthProvider, TenantProvider and navigation
entitlement provider with shipped styles. It seeds an explicitly synthetic actor
and intercepts only named synthetic GETs. Every mutation is refused; unrecognized
requests fail the qualification. The observation panel records actual onNav calls.

Five checks pass: desktop RBM afterCMC/corepeers; keyboard/focus; phonecollapsed
samehandler; phoneexpanded sameentry; Professional lockpanel without navigation.
Zero unexpected HTTPrequests, pageerrors orconsoleerrors. All23selected source/
harness pins stayed unchanged. Source pins are selected inputs, not full closure.

Screenshots are in browser-result/. Raw output and source/harness pins are in
browser-execution.txt and browser-result.json; stored artifact hashes are in
browser-artifact-manifest.json. This is synthetic local component proof, not
authenticated hosted acceptance, production writes, clinical oragency validation.

Wizard capture is pending its producer source freeze.
