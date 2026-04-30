# v2 Sync Bundle — 2026-04-30

These 6 files belong in the v2 repo at:

  concept2cure-v2/design-system/ui_kits/mdx/

## Missing from v2 (drop in fresh)
- CerWorkbench.jsx       (20,616 chars · 466 lines)
- DocumentEditor.jsx     (20,164 chars · 482 lines)
- EditorSurfaces.jsx     (1,447 chars · 43 lines)
- PreSub.jsx             (13,215 chars · 325 lines)
- data-editors.jsx       (21,119 chars · 320 lines)

## Likely stale in v2 (overwrite)
- Surfaces.jsx           (29,739 chars · 641 lines)
  ↳ adds the "Open module editor →" and "Open CER editor (§6) →"
    CTAs that route into the new PMA + CER editors.

## After drop
1. cd concept2cure-v2 && git status
2. git add design-system/ui_kits/mdx/
3. git commit -m "design-system: sync 6 mdx files (CerWorkbench, DocumentEditor, EditorSurfaces, PreSub, data-editors, Surfaces)"
4. git push
5. Tell Claude Code to git pull and resume the v2 port.
