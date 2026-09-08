# Submission gate posture — the recorded decision

**Date:** 2026-09-08
**Enforced by:** `server/services/ectd/__tests__/submission-gate-posture.test.ts`
(the registry `GATE_POSTURE` in that file is the machine-readable half of this page).

## Why this exists

`ECTD_REQUIRE_DTD`, `ECTD_REQUIRE_RPS_SCHEMA` and `ESTAR_REQUIRE_TEMPLATE` are unset
in every environment, so all three gates are report-only. That is the right posture
while the licensed artifacts are absent — but it was an **accident, not a decision**.
Nothing recorded the intended production posture, what each gate would block if it
were switched on today, or what has to become true first. An unset variable and a
deliberately-off gate look identical from outside, and a default could have flipped in
either direction with nothing failing.

Nothing here switches a gate on. Every gate below is enforcement-off today; turning one
on before its precondition is met would block real transmits.

## The posture

| Flag | Owner module | Default | What it blocks when on | Switch it on when |
|---|---|---|---|---|
| `ECTD_REQUIRE_DTD` | `ectd/dtd-bundler.ts` | **off** (report-only) | a production eCTD package referencing `util/dtd/*.dtd` or `util/style/*.xsl` it does not contain | the licensed ICH + regional DTDs **and** stylesheets are vendored into `assets/ectd-dtd/` for every region in use |
| `ECTD_REQUIRE_RPS_SCHEMA` | `ectd/schema-bundler.ts` | **off** | a production eCTD **v4.0** package that is not schema-validatable (no-op for v3.2.2, which needs no XSD) | `rps-message.xsd` is vendored into `assets/ectd-schema/` |
| `ESTAR_REQUIRE_TEMPLATE` | `pathway-engines/estar/estar-template-registry.ts` | **off** | a production device build whose official FDA eSTAR/PreSTAR template is not vendored | every template in `ESTAR_TEMPLATE_MANIFEST` is in `assets/estar-templates/` |
| `ECTD_REQUIRE_PDFA` | `ectd/pdfa-readiness.ts` | **off** | a production package whose PDF leaves are not PDF/A | Ghostscript + veraPDF are in the deploy image |
| `ECTD_REQUIRE_XREF` | `ectd/cross-reference-resolver.ts` | **off** | a production package with dangling / withdrawn-target cross-references | declared cross-references are authored on the production package paths |
| `ECTD_REQUIRE_EVALIDATOR` | `ectd/external-validator/config.ts` | **off** | a production transmit with no agency-grade validation report | a licensed validator is configured (`<PROVIDER>_VALIDATOR_URL`) and reachable |
| `ECTD_REQUIRE_REGIONAL_BACKBONE` | `ectd/regional-backbone-readiness.ts` | **off** | a production transmit whose regional Module 1 backbone is not agency-structured (11 of 12 regions today) | the eleven non-conformant backbones are actually built — **engineering, not procurement** |

## What each asset-gated flag would do *today*

Computed from the repo's real drop-points by the test, not asserted from memory:

- **`ECTD_REQUIRE_DTD` → would block everything.** `assets/ectd-dtd/` holds a README, a
  checksum file and XML fixtures; there is no `.dtd` and no `.xsl`. Even FDA — the most
  complete region — is missing `ich-ectd-3-2.dtd`, `us-regional-v3-3.dtd`, `ectd-2-0.xsl`
  and `us-regional.xsl`.
- **`ECTD_REQUIRE_RPS_SCHEMA` → would block v4.0 only.** `assets/ectd-schema/` holds no
  XSD. v3.2.2 packages require none, so the gate is a no-op there.
- **`ESTAR_REQUIRE_TEMPLATE` → would block *partially*.** This one is not uniform:
  `eSTAR-510k-non-ivd.pdf` and `eSTAR-510k-ivd.pdf` **are** vendored, so 510(k), De Novo
  and PMA builds would clear the gate today. The three PreSTAR templates
  (`PreSTAR-q-sub.pdf`, `PreSTAR-ide.pdf`, `PreSTAR-513g.pdf`) are absent, so Q-Sub, IDE
  and 513(g) builds would block. Recording this gate as "blocks everything" would be as
  wrong as recording it as "blocks nothing".

## How this is kept true

`submission-gate-posture.test.ts` fails when:

1. **A new gate lands with no recorded posture.** It scans `server/services/ectd/**`,
   `server/services/pathway-engines/estar/**` **and
   `server/services/submission-gateways/**`** — the last of these is where
   `pre-transmit-check.ts` turns three of these gates into production blockers, and it
   was outside the scan until 2026-09-08 — for every identifier shaped
   `<PREFIX>_REQUIRE_<REST>` appearing in **non-comment** source, and requires each to be
   in `GATE_POSTURE` (and vice versa, so the record cannot describe a gate nothing names
   any more).

   **The exact scope of that claim.** The scan matches the flag NAME in any read form
   (`env.X`, `env['X']`, `const { X } = env`, or the name passed as a string) — it used
   to match only the literal `env.X`, which the other three forms evaded. It is still a
   claim about *those roots* and *that naming shape*, not a data-flow analysis: a gate
   flag read outside those directories, or named without `_REQUIRE_`, is not covered. The
   evading forms are pinned by *"the completeness scan catches the read forms that evade
   `env.<NAME>`"*, and reaching the enforcement site is pinned by an assertion that
   `ECTD_REQUIRE_DTD` is found in `pre-transmit-check.ts`.
2. **A default changes silently**, in either direction — the reader's value on an empty
   environment must equal the recorded default.
3. **A gate loses its switch** — each flag must still enable on `=true`.
4. **A precondition becomes met.** The asset-gated probes compare what the gate *would*
   do today against the recorded expectation. When the licensed DTDs or the RPS schema
   or the PreSTAR templates land, that test fails **on purpose**, naming the flag and the
   drop-point, so the posture is re-decided rather than left off by inertia. Each probe
   discovers files through the **owning module's own lister**
   (`listVendoredDtds` / `listVendoredStylesheets` / `listVendoredSchemas` /
   `listVendoredTemplates`) rather than a second `readdir` in the test, so it cannot
   drift from what the gate itself can see. Shown failing on purpose by placing the four
   FDA artifacts at the top of `assets/ectd-dtd/` and observing
   `ECTD_REQUIRE_DTD: recorded as blocking-today=true, observed false`.
5. **A licensed artifact is dropped in the wrong place.** The listers are not recursive,
   so a `.dtd` in `assets/ectd-dtd/fixtures/` (that subdirectory already exists) does
   **not** meet the precondition — the gate cannot load it and would still block, and
   check 4 correctly stays green. But "misplaced" must not be indistinguishable from
   "not acquired yet", so it fails its own check, naming the file and where it belongs.
   The probe is deliberately **not** made recursive: that would report the precondition
   *met* for files the gate cannot see, which is the opposite error and the worse one.

## Note on `ECTD_REQUIRE_REGIONAL_BACKBONE`

This is the one gate whose precondition is not something to obtain. Eleven of the twelve
regional Module 1 backbones are not built to their agency's structure, and no amount of
DTD vendoring changes that — see
[`ectd-region-conformance-2026-09-08.md`](./ectd-region-conformance-2026-09-08.md).
Switching this gate on today would block every production transmit outside FDA. It stays
off until those backbones are built, and the non-conformance is surfaced as a failing
check row and a warning in the meantime.
