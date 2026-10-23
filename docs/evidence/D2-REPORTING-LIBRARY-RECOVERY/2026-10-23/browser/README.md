# Reporting recovery layout observation

## What already exists

The existing reporting canvas, schedule and bundle panels provide the mounted DOM. The production build for this capture provides the existing theme CSS. The DOM instrumentation uses the actual mounted panels and existing test fixture, then serializes the artifact pane; it adds no product surface, layout, permission or browser dependency.

All **12 captures passed**: schedule uncertainty, schedule review and bundle uncertainty, each in light/dark themes at 1440×900 and 390×844. Capture took **20.298 seconds**, exit 0. All 44 selected source, built-CSS, serialized-DOM and capture-script hashes remained unchanged during capture. The separate DOM instrumentation passed two cases, exit 0, in 2.982 seconds; its temporary test was removed.

Canonical subsequently advanced through merge `9f8cae7f0`, including an optional owner callback on the shared API normalizer. These captures retain their exact earlier pins. Any subsequent type-only annotation adjustment and integrated build are recorded by root separately; these images are not relabeled as observations of later source.

The existing geometry script checked page/recovery horizontal overflow and whether each recovery button stayed within its notice. Narrow light and dark schedule-review screenshots were also inspected with `view_image`: the notice copy and controls fit, controls stack coherently, and no horizontal overflow was observed. No product edits followed this observation.

These are **serialized actual artifact-pane observations with built CSS**. They do not exercise the full shell, live authentication, transport, server writes, user events or hosted acceptance. The PNGs show the viewport; content continues vertically below the narrow captures.

## Browser setup observations

The initial Chromium CLI captures timed out without DOM, including bounded about-blank/data-page probes. Single-process and disabled-rasterizer variants did not resolve that path. An installed Playwright probe produced actual DOM and a screenshot in 1.159 seconds, with graceful browser exit. The same DBus diagnostics appeared on success, so those diagnostics alone do not explain the CLI hang.

The first fixture invocation through Playwright encountered `ERR_BLOCKED_BY_ADMINISTRATOR` on `file://` navigation. This was an instrumentation setup failure before any layout measurement. The final renderer reads the authorized serialized local HTML through Python and supplies its exact bytes to an in-memory page through Playwright. Built CSS contains only three inline data-SVG resource URLs; no file/font/network resource fetch is required. Browser policies and the global environment were unchanged. Failed CLI/file-navigation attempts are retained separately and are **never product RED**.

[checks.json](checks.json) records exact commands, phase-specific source pins, probe outcomes and visual-review scope. [component-layout.json](component-layout.json) retains per-capture geometry, CSS/DOM hashes and PNG hashes. [archives.json](archives.json) inventories every PNG and the lossless scripts, actual DOM instrumentation, commands, raw browser output and source manifests. The full mounted HTML and CSS rendered for each capture are also retained in `chromium.raw.log.gz`. Private originals remain under `/workspace/.codex-notes/reporting-library-recovery-20261023/browser`.
