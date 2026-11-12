# Change-control documents open the one "New controlled document" door (C10, 2026-11-10)

Package **D7**. This is sweep item C10, finding styles-change-guidance. Under the change log, the section "Change-control
documents and forms" held one button per library template: "Change-control procedure (SOP-CC-)" and "Change-request
form (CC-)". That was a gallery by another name: each template was its own way in.

## What already exists

- `client/src/concept2cure/quality/NewControlledDocumentForm.tsx` → `ControlledDocumentDialogs.tsx`
  `ControlledDocumentSetup`: the SOP register's own "New controlled document" setup. When no template is preset, it
  offers a **Template** field listing the templates it is given, with their number prefixes. Choosing one names an
  untitled document after it, sets its type and shows its description.
- `useSopTemplates` (`hooks.ts`): the server's library. `CHANGE_FORM_TEMPLATE_KEYS` (`changeData.ts`) picks out its
  change-control entries.

Nothing new: the section reuses the setup as it is.

## What changed

- The per-template buttons are gone. The section has one `btn ghost small`, **New controlled document**, in its header
  actions. It opens the same setup, given the change-control templates only. Its Template field lists "Standard
  controlled-document sections", "Change-control procedure (SOP-CC-)" and "Change-request form (CC-)".
- The section's line names the templates it draws from. The button waits while the library loads, and a failed
  library read is said as before.
- The drawer's `document` kind no longer carries a template key. `.qcc-forms` is deleted from `quality/app.css`.

## Tests

`qmsGovernedActions.test.tsx`:

- There is no button per template. The one door's Template field lists the standard sections and the two
  change-control templates, and choosing the procedure sets the type to SOP.
- Creating a change-control document picks its template in the field. It then posts the same body as before (program,
  reason, template key, title, type) and opens its editing copy.

`red.txt`: both fail against the code before C10. `green.txt`: Quality's suites and AnA's wave-4 suite, 29 files and
350 tests.

## Walked in the running app

`w17-forms-door.cjs` (log: `shots/w17-forms-door.log.json`), as the author, at 1440 and 390, with no API or page errors:

- The section shows one button, "New controlled document". The page does not scroll sideways.
- The door lists the two change-control templates with their prefixes. Choosing "Change-control procedure" titles the
  document "Change-control procedure", makes it an SOP, and shows the template's description (`shots/w17-door-1440.png`).

The walk's organisation has no project, so the setup says "No projects are available. Create a project in Projects to
begin." That is the setup's own honest empty state. The door still opens as a centred dialog. Quality's dialogs move
into the product's drawer in C15.

Run the walk from this folder with `NODE_PATH=$(npm root -g) node w17-forms-door.cjs`. It needs `WALK_PASSWORD` and a
running server.
