# MDX journey M17: UDI's empty labeling list opens Labeling

Found walking the device journey in the running app (`../2026-11-02-slice-5-journey-walked/`, finding 7). Plan: F1.

## What already exists (RULE 3)

- `client/src/concept2cure/mdx/surfaces/UdiSurface.tsx` lists the project's labeling documents through `DataGate`.
  `DataGate` (`mdx/components/DataGate.tsx`) takes an `emptyAction`; no caller here passed one.
- A labeling document starts in Labeling (`v2/surfaces/Labeling.tsx`), whose empty state asks AnA to start it (M8,
  `../2026-11-02-m8-labeling-empty-state-action/`).
- `MdxSurfaceHost.tsx` opens a screen through its `onNav`.

## The defect

With no labeling document, UDI said "IFUs, package and on-device labels appear here once labeling documents are
created." and offered only "Check again". That's the passive instruction the EmptyState contract retires: it named
where labels come from and gave no way there.

## The change

The empty state's action is **Open Labeling**, wired by the host to `onNav('labeling')`. The hint adds where a
labeling document starts. No new screen and no second start: the one start stays on Labeling.

## Proof

- `client/src/concept2cure/mdx/__tests__/deviceDocumentRowsOpen.test.tsx`: red before (`red.txt`), and green after
  across the 20 device-screen suites (`green.txt`, 145 cases).
- In the running app: UDI offers Open Labeling, and it opens "Labeling and IFU" on the same project
  (`live-udi-empty-state.png`, `live-open-labeling.json`).
