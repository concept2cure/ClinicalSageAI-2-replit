# Security policy set — DRAFT, 2026-09-20

SOC 2-style policies for Concept2Cure (TrialSage), written for row **D6** of
`docs/LAUNCH_DEFINITION_OF_DONE.md`. Every policy is a **DRAFT** until the
founder signs it; every control statement carries one of three honest marks:

- **Implemented** — enforced by code or configuration that exists on
  `concept2cure-v2` today, with the file path.
- **Partial** — some of the control exists; the gap is named.
- **Planned** — nothing enforces it yet; the owner and the trigger are named.

No control is marked Implemented on the strength of a document alone.

| ID | Policy | Trust Services Criteria |
|---|---|---|
| POLICY-IS-001 | Information security | CC1, CC2, CC5 |
| POLICY-AC-002 | Access control | CC6 |
| POLICY-CM-003 | Change management | CC8 |
| POLICY-IR-004 | Incident response | CC7 |
| POLICY-BR-005 | Backup and recovery | A1, CC7.5 |
| POLICY-VM-006 | Vendor and AI-model governance | CC9, CC3 |
| POLICY-DR-007 | Data retention and residency (incl. Anthropic BAA scope, ZDR vs 30-day retention) | C1, P4 |
| POLICY-AI-008 | AI-use disclosure (Anthropic high-risk use policy) | CC2.3, P1 |

Companion documents: `../SECURITY_QUESTIONNAIRE_SIG_LITE.md` (control-by-control
answers with file paths) and `../TRUST_STATEMENT.md` (the one-page public
statement). Approval: founder signature on each file's revision table turns
DRAFT into v1.0.
