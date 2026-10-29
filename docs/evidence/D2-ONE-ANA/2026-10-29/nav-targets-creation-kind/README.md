# The navigation-target gate stops reading a creation kind as a surface (D2, 2026-10-29)

`client/src/concept2cure/v2/__tests__/navTargets.test.tsx` was red at head: "dead navigation targets: ProjectBiotechPlan.tsx → 'document'".

## What already exists

- **The gate.** It scans the surface files for `onNav('x')`, `nav('x')`, `open('x')` and `C2C.open('x')`, and fails on any id that is not a surface, alias, hub or modal mode.
- **What it caught.** `ProjectBiotechPlan.tsx` calls `creation.open('document')` (lines 48 and 50). Here `creation` is `useAuthoringCreation` (`editor/useAuthoringCreation.ts`), and its `open(kind: CreationKind)` opens the receipt of an identified creation. `CreationKind` is `'document' | 'section'`, so the call names no surface. The button is not a dead end.

## What changed

The first pattern gains a lookbehind, `(?<!creation\.)`, with a comment saying why. Every other `open('x')`, `C2C.open('x')`, `onNav('x')` and `nav('x')` is still read.

## Red, then green

- **Red at `a395292a`:** 1 failed, 1 passed. The failure is the false target `'document'`.
- **Green:** 2/2.
- **The check fails when it should.** A probe line, `onNav('no-such-surface')`, appended to `ProjectBiotechPlan.tsx` turns the gate red: "ProjectBiotechPlan.tsx → 'no-such-surface'". The file was restored, and `git diff` on it is empty.
