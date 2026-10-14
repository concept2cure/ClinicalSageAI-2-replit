# Incoming authoring recovery integration

Merged client recovery verified on Node v22.23.3 at 616ac67bfa01b778884f431b790ad83c5cfff733.

Test Files  7 passed (7)  
Tests  154 passed (154)  
Duration  23.49s (transform 1.57s, setup 486ms, import 3.81s, tests 15.67s, environment 2.79s)

16 selected test/source bindings, including DocumentWorkbench.tsx, AuthoringCreateExport.tsx and useAuthoringCreation.ts, remained unchanged during this scoped run. 0 changed.

Four incoming creation/export/recovery/context suites were run with the directly affected real-workbench citation catalogue, template oversight and document-access suites. This covers section/document read and navigation changes in the existing workbench composition. The separate 107-case provider/submission proof was not rerun.

Fixtures use jsdom and synthetic HTTP. This is not browser or live API qualification, and the bindings are not a complete transitive import graph. No application, runner, baseline, staging or branch changes were made by this task.

See incoming-authoring-client.json for exact SHA-256 bindings, command scope and exit status, and incoming-authoring-client.log for case results.
