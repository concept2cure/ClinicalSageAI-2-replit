# Complete the existing fictional CSR portfolio for the Codespace demo

Plan: DATA. Requested examples: projects containing Vault folders and usable documents, several CSR authoring stages, and a finished internal demonstration handover.

## What already exists

- `scripts/demo/launch-demo/seed.mjs` already offers the opt-in `portfolio` pack, excluded from `all` and run alone. Its API client verifies the signed-in tenant and readable project/task stores before writing.
- `packs/portfolio.mjs` and `portfolio-content.mjs` already create four fictional sponsor workspaces and eight project-linked CSR examples: planning, enrolling, database lock, drafting, review comments, resolved comments, ready-to-file scenario and fictional information-request rehearsal. Protocol/SAP PDFs, synthetic study JSON, canonical editor documents and tasks already exist. They do not create named user folders or a completed internal handover.
- `packs/lumen-vault.mjs` already demonstrates governed PDF approval, filing, fixity and seals through independent demo identities. `packs/lumen-csr.mjs` already creates three full synthetic reports and stops at the scientific review gate. These are preserved.
- `server/routes/c2c/project-vault.ts` already provides named nested folders, confirmed document filing, actual downloads and verified folder ZIP export. `server/routes/vault-ingest.ts` accepts project/folder placement. The folder export includes directly held documents, not recursive descendants.
- `server/routes/c2c/projects.ts` already provides audited project archival; this retains readable records. `client/src/concept2cure/v2/surfaces/ProjectsArchived.tsx` currently lists archived titles with Restore as its only action. Archiving the presentation example would remove its direct opening path from the normal project list. The handover therefore stays active and discoverable, with a completed delivery task.
- Existing `docx` and PDF fixture writers can generate clearly labelled demonstration documents without a provider call or another dependency. The one editor and governed CSR export remain the working report surfaces.
- `.devcontainer/post-start.sh` already seeds Lumen and the general development examples, but does not separately opt in to the portfolio. The Codespace bootstrap integration belongs to the separate F1 repair.

Searches covered portfolio, Lumen, CSR, Vault folder/filing/export APIs, project archival, document generators and tests. `git log --all --diff-filter=D` over the demo/portfolio/Vault seed paths found no deleted alternative.

## Completion contract

Extend the existing portfolio pack, preserving its eight stage scenarios and sponsor placement refusals. Idempotently create a named parent folder with populated child folders and confirm existing protocol/SAP/source files into them. Preserve people’s edited bytes; reject ambiguity, hash mismatches and unexpected existing placement instead of silently replacing it.

Add one separate fictional internal handover example in an existing sponsor workspace. Its actual synthetic PDF, Word report, data and inventory must be readable and hash-verified in a project-linked folder before completing its internal delivery task. Keep its project active for the demo, and report that status accurately rather than inventing a canonical completed status. If an operator later archives it, repeated runs validate retained records without reopening or mutating the project. Label every document as synthetic and internal demonstration material, with no clinical approval, electronic signature, regulatory submission or agency-acceptance claim. Leave scientific review and controlled CSR export gates intact.

No new route, service, table, screen, provider or tool. The shared existing validation API client gained an opt-in binary response so seed verification uses the same authenticated, paced client for file downloads; successful binary bodies are recorded as byte counts, not file contents.

## Verified demo inventory

As **Ana Author**, open **Projects** and select the fictional sponsor in **Client**. Each study's Vault has **[Demo · Portfolio] Synthetic study records** with populated children **Protocol and analysis · SYNTHETIC** and, where relevant, **Study data · SYNTHETIC**. Open native CSR documents from the project's Author step.

| Sponsor | Study | Content to show |
| --- | --- | --- |
| Varnhollow Oncology | VNH-310-301 | Planning: protocol and SAP PDFs, empty native CSR shell |
| Petrelline Rare Therapeutics | PTR-022-301 | Study conduct: enrollment tasks and study design, CSR shell |
| Quillmont Immunology | QLM-118-202 | Database lock: protocol/SAP PDFs and synthetic study JSON |
| Halcyra Vaccines | HLY-09-201 | Drafting: partially written native CSR |
| Varnhollow Oncology | VNH-310-201 | Fully written narrative with open and resolved review comments |
| Petrelline Rare Therapeutics | PTR-022-102 | Written narrative and resolved comments, awaiting governed signing |
| Quillmont Immunology | QLM-118-101 | Ready-to-file scenario with scientific-review refusal preserved |
| Halcyra Vaccines | HLY-09-101 | Fictional information-request rehearsal; no submitted CSR claim |
| Quillmont Immunology | QLM-118-101 completed INTERNAL demonstration handover | Completed delivery task, reference Word/PDF, synthetic study JSON and checksum inventory |

For the last project, open **Vault** → **[Demo · Portfolio] Synthetic study records** → **Completed internal handover · SYNTHETIC**. Select the PDF and **View**, or Word and **View as PDF**, to read the actual files in the existing reader. **Download** saves the original. **Export Completed internal handover · SYNTHETIC** downloads all four files with the server's manifest, index, checksums and audit trail. The project remains active for presentation; internal delivery is complete, and regulatory review is separate.

The companion F1 bootstrap invokes `portfolio` separately after successful `all`. To refresh an existing Codespace, pull `concept2cure-v2` and run `bash .devcontainer/post-start.sh`. Direct opt-in remains available:

```sh
npm run demo:seed -- --pack portfolio --base-url http://127.0.0.1:5000 --email ana.author@concept2cure.pro
```

## Verification

- **46/46 targeted tests** and **234/234 complete launch-demo tests** passed with no skipped cases. Changed demo JavaScript and browser evidence helper passed explicit ESLint with zero warnings. Syntax and whitespace checks passed.
- The real running application in the pinned Codespace image filesystem created **4 workspaces, 9 projects, 24 named folders, 20 Vault files, 8 native CSR documents and 25 tasks**. Every seeded Vault file was downloaded and SHA-256 checked. The internal handover's delivery task was completed only after its four actual files passed those checks.
- Repeating through the actual Codespace portfolio bootstrap helper returned **zero created, 150 found**, confirmed the same project/file identities and hashes, and wrote its success marker. `rerun-manifest.json` retains this receipt; its `seeded_unqualified` outcome deliberately does not certify a regulated workflow.
- Chromium passed the real demo-person sign-in, sponsor filter, project opening, nested folder selection and existing folder Export action. The resulting ZIP contained the four expected payload hashes. The PDF visibly rendered as three pages; the Word document opened as its existing PDF rendition. The existing Vault list was also checked at 390px with its drawers closed. No page errors; no provider calls.
- `first-seed-manifest.json`, `rerun-manifest.json`, `browser-receipt.json`, screenshots, the actual exported ZIP and compressed red/green logs record the bounded observations. `source-sha256.json` binds the seed/client implementation tested.

This is a rehearsal in the official Codespace image's root filesystem, with a local layer-flattening workaround described in [the F1 evidence](../../F1/2026-11-13-codespaces-docx-runtime/README.md). Actual hosted GitHub Codespaces edge access and live model drafting were not executed. Existing scientific-review/export/signing refusals and the portfolio's documented organization-wide Quality-capture behavior are retained.
