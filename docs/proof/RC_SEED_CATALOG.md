# RC Seed Catalog

Generated: 2026-04-01

Seed source: `scripts/seed/rc-beta-seed.ts`

## Seeded projects

| Project ID | Name | Type | Purpose |
|---|---|---|---|
| `RC-BIO-001` | HelixNova IND Program | Biotech regulatory | Primary biotech founder/tester run path |
| `RC-DEV-001` | OrthoFlux 510k Program | Device regulatory | Primary device founder/tester run path |

## Seeded governed artifacts

| Artifact ID | Project ID | Status | Proof objective |
|---|---|---|---|
| `RC-BIO-ART-DR-01` | `RC-BIO-001` | draft | Open/edit governed draft |
| `RC-BIO-ART-RV-01` | `RC-BIO-001` | review | Review workflow accessibility |
| `RC-DEV-ART-RV-01` | `RC-DEV-001` | review | Device-path review continuity |
| `RC-BIO-ART-PV-01` | `RC-BIO-001` | draft (versioned) | Provenance/version access |

## Seeded context utilities
- AnA context thread: `RC-BIO-THREAD-01` (anchored to `RC-BIO-001`)
- References/vault state: `RC-REF-SET-01` attached to `RC-BIO-001`

## Determinism notes
- IDs are static and non-random.
- Intended for repeatable RC proof across environments.
